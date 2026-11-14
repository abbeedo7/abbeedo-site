// Public release binaries live in R2. Only the authenticated publisher can
// start or complete an upload; the Worker bundle never contains the binary.
const encoder = new TextEncoder();
const MIN_PART = 5 * 1024 * 1024;
const MAX_PART = 10 * 1024 * 1024;
const MAX_PARTS = 32;
const SESSION_LIFETIME = 2 * 60 * 60 * 1000;
const FILES = Object.freeze({
  setup: Object.freeze({key: 'releases/windows/setup.exe', path: '/downloads/windows/setup.exe', filename: 'abbeedo-TV-Setup.exe', type: 'application/vnd.microsoft.portable-executable'}),
  portable: Object.freeze({key: 'releases/windows/portable.exe', path: '/downloads/windows/portable.exe', filename: 'abbeedo-TV-Portable.exe', type: 'application/vnd.microsoft.portable-executable'}),
});
// Keep already-shared 1.0 ZIP links valid; new releases only upload the single EXE.
const LEGACY_PORTABLE = Object.freeze({key: 'releases/windows/portable.zip', path: '/downloads/windows/portable.zip', filename: 'Abunasser-TV-Windows-x64.zip', type: 'application/zip'});
const baseHeaders = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'};

function fail(status, code, message) { throw Object.assign(new Error(message), {status, code}); }
function json(value, status = 200, headers = {}) { return Response.json(value, {status, headers: {...baseHeaders, ...headers}}); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fileFor(value) { const file = typeof value === 'string' && Object.hasOwn(FILES, value) ? FILES[value] : null; if (!file) fail(400, 'RELEASE_FILE', 'ملف الإصدار غير صالح.'); return file; }
function storage(env) { if (!env.BUCKET?.get || !env.BUCKET?.head) fail(503, 'RELEASE_STORAGE', 'خدمة تحميل التطبيق غير متاحة مؤقتًا.'); return env.BUCKET; }
function validUploadId(value) { if (typeof value !== 'string' || !value.length || value.length > 1024 || /[\x00-\x20\x7f]/.test(value)) fail(400, 'UPLOAD_ID', 'معرف الرفع غير صالح.'); return value; }
function etagOf(value) { const etag = value?.httpEtag || (typeof value?.etag === 'string' ? '"' + value.etag.replaceAll('"', '') + '"' : null); return typeof etag === 'string' && !/[\r\n]/.test(etag) ? etag : null; }
function uploadedAt(value) { const date = new Date(value?.uploaded); return Number.isFinite(date.getTime()) ? date : null; }

async function authenticate(request, env) {
  const configured = env.RELEASE_UPLOAD_TOKEN;
  if (typeof configured !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(configured)) fail(503, 'UPLOAD_DISABLED', 'خدمة رفع الإصدارات غير مفعّلة.');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) fail(403, 'UPLOAD_ORIGIN', 'هذا الاتصال غير مسموح.');
  const candidate = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('authorization') || '')?.[1] || '';
  // Comparing fixed-size hashes avoids a token-prefix timing comparison.
  const hashes = await Promise.all([configured, candidate].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const expected = new Uint8Array(hashes[0]), received = new Uint8Array(hashes[1]);
  let difference = 0;
  for (let n = 0; n < expected.length; n++) difference |= expected[n] ^ received[n];
  if (difference !== 0) fail(401, 'UPLOAD_AUTH', 'هذا الطلب غير مصرح به.');
}

async function readBytes(request, maximum) {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) fail(413, 'UPLOAD_SIZE', 'الطلب أكبر من الحد المسموح.');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximum) fail(413, 'UPLOAD_SIZE', 'الطلب أكبر من الحد المسموح.');
      chunks.push(next.value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415, 'UPLOAD_TYPE', 'أرسل بيانات JSON.');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await readBytes(request, 32768))); }
  catch (error) { if (error?.status) throw error; fail(400, 'UPLOAD_INPUT', 'بيانات الرفع غير صالحة.'); }
  if (!record(value)) fail(400, 'UPLOAD_INPUT', 'بيانات الرفع غير صالحة.');
  return value;
}

async function sessionPrefix(file, uploadId) {
  fileFor(file); validUploadId(uploadId);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(uploadId)));
  return 'releases/private-uploads/' + file + '/' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
async function storedJson(bucket, key) { const value = await bucket.get(key); if (!value) return null; try { return await value.json(); } finally { void value.body?.cancel?.().catch(() => {}); } }
async function putJson(bucket, key, value) { await bucket.put(key, JSON.stringify(value), {httpMetadata: {contentType: 'application/json'}}); }
async function sessionFor(bucket, file, uploadId, {allowExpired = false} = {}) {
  const prefix = await sessionPrefix(file, uploadId), session = await storedJson(bucket, prefix + '.json');
  if (!record(session) || session.file !== file || session.uploadId !== uploadId) fail(404, 'UPLOAD_SESSION', 'جلسة الرفع غير موجودة.');
  if (!allowExpired && (!Number.isSafeInteger(session.createdAt) || Date.now() - session.createdAt > SESSION_LIFETIME)) fail(409, 'UPLOAD_EXPIRED', 'انتهت مهلة جلسة الرفع.');
  return {prefix, session};
}
async function cleanSession(bucket, prefix) {
  const keys = [prefix + '.json', ...Array.from({length: MAX_PARTS}, (_, n) => prefix + '.part-' + (n + 1) + '.json')];
  try { await bucket.delete(keys); } catch {} // The completed binary remains valid if private housekeeping is delayed.
}

async function upload(request, env, url) {
  await authenticate(request, env);
  if (request.method !== 'POST') return json({error: 'طريقة الطلب غير مدعومة.', code: 'METHOD'}, 405, {Allow: 'POST'});
  const bucket = storage(env);
  if (typeof bucket.createMultipartUpload !== 'function' || typeof bucket.resumeMultipartUpload !== 'function' || typeof bucket.put !== 'function' || typeof bucket.delete !== 'function') fail(503, 'UPLOAD_STORAGE', 'التخزين لا يدعم رفع الإصدارات.');
  if (url.searchParams.get('action') === 'part') {
    if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/octet-stream') fail(415, 'UPLOAD_TYPE', 'أرسل جزء الملف كبيانات ثنائية.');
    const file = url.searchParams.get('file'), selected = fileFor(file), uploadId = validUploadId(url.searchParams.get('uploadId'));
    const number = url.searchParams.get('partNumber'), lastValue = url.searchParams.get('last') || '0';
    if (!/^(?:[1-9]|[12]\d|3[0-2])$/.test(number || '') || !['0', '1'].includes(lastValue)) fail(400, 'UPLOAD_PART', 'رقم جزء الرفع غير صالح.');
    const {prefix} = await sessionFor(bucket, file, uploadId), bytes = await readBytes(request, MAX_PART), last = lastValue === '1';
    if (!bytes.byteLength || (!last && bytes.byteLength < MIN_PART)) fail(400, 'UPLOAD_PART_SIZE', 'حجم جزء الرفع غير صالح.');
    const partNumber = Number(number), result = await bucket.resumeMultipartUpload(selected.key, uploadId).uploadPart(partNumber, bytes);
    if (typeof result?.etag !== 'string' || !result.etag || result.etag.length > 256 || /[\r\n]/.test(result.etag)) fail(502, 'UPLOAD_PART_RESULT', 'تعذر تأكيد جزء الرفع.');
    await putJson(bucket, prefix + '.part-' + partNumber + '.json', {partNumber, etag: result.etag, size: bytes.byteLength, last});
    return json({partNumber, etag: result.etag, bytes: bytes.byteLength});
  }
  if (url.searchParams.has('action')) fail(400, 'UPLOAD_ACTION', 'عملية الرفع غير صالحة.');
  const value = await readJson(request), selected = fileFor(value.file);
  if (value.action === 'start') {
    if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) fail(400, 'UPLOAD_HASH', 'بصمة الملف غير صالحة.');
    const multipart = await bucket.createMultipartUpload(selected.key, {httpMetadata: {contentType: selected.type, contentDisposition: 'attachment; filename="' + selected.filename + '"'}, customMetadata: {sha256: value.sha256.toLowerCase()}});
    const uploadId = validUploadId(multipart.uploadId), prefix = await sessionPrefix(value.file, uploadId);
    try { await putJson(bucket, prefix + '.json', {file: value.file, uploadId, sha256: value.sha256.toLowerCase(), createdAt: Date.now()}); }
    catch (error) { try { await multipart.abort(); } catch {} throw error; }
    return json({file: value.file, uploadId, minPartBytes: MIN_PART, maxPartBytes: MAX_PART, maxParts: MAX_PARTS}, 201);
  }
  const uploadId = validUploadId(value.uploadId), {prefix} = await sessionFor(bucket, value.file, uploadId, {allowExpired: value.action === 'abort'});
  const multipart = bucket.resumeMultipartUpload(selected.key, uploadId);
  if (value.action === 'abort') { await multipart.abort(); await cleanSession(bucket, prefix); return json({aborted: true}); }
  if (value.action !== 'complete') fail(400, 'UPLOAD_ACTION', 'عملية الرفع غير صالحة.');
  if (!Array.isArray(value.parts) || value.parts.length < 1 || value.parts.length > MAX_PARTS) fail(400, 'UPLOAD_PARTS', 'قائمة أجزاء الرفع غير صالحة.');
  const parts = [];
  let totalBytes = 0;
  for (let n = 0; n < value.parts.length; n++) {
    const part = value.parts[n];
    if (!record(part) || part.partNumber !== n + 1 || typeof part.etag !== 'string' || !part.etag || part.etag.length > 256 || /[\r\n]/.test(part.etag)) fail(400, 'UPLOAD_PARTS', 'يجب إرسال الأجزاء بترتيبها الكامل.');
    const saved = await storedJson(bucket, prefix + '.part-' + part.partNumber + '.json'), final = n === value.parts.length - 1;
    if (!record(saved) || saved.partNumber !== part.partNumber || saved.etag !== part.etag || saved.last !== final || !Number.isSafeInteger(saved.size) || saved.size < (final ? 1 : MIN_PART) || saved.size > MAX_PART) fail(409, 'UPLOAD_INCOMPLETE', 'لم يكتمل رفع جميع أجزاء الملف.');
    totalBytes += saved.size;
    parts.push({partNumber: part.partNumber, etag: part.etag});
  }
  await multipart.complete(parts);
  await cleanSession(bucket, prefix);
  return json({uploaded: true, file: value.file, bytes: totalBytes, path: selected.path});
}

function rangeFor(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !size) fail(416, 'RANGE', 'نطاق الملف غير صالح.');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) fail(416, 'RANGE', 'نطاق الملف غير صالح.');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) fail(416, 'RANGE', 'نطاق الملف غير صالح.');
    end = Math.min(end, size - 1);
  }
  return {offset: start, length: end - start + 1};
}

async function download(request, env, selected) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'طريقة الطلب غير مدعومة.', code: 'METHOD'}, 405, {Allow: 'GET, HEAD'});
  const bucket = storage(env), head = await bucket.head(selected.key);
  if (!head) return json({error: 'ملف التطبيق غير متاح للتحميل بعد.', code: 'RELEASE_NOT_FOUND'}, 404);
  if (!Number.isSafeInteger(head.size) || head.size < 0) fail(503, 'RELEASE_STORAGE', 'تعذر قراءة ملف التطبيق.');
  const etag = etagOf(head), uploaded = uploadedAt(head), headers = {...baseHeaders, 'Cache-Control': 'public, max-age=300', 'Content-Type': selected.type, 'Content-Disposition': 'attachment; filename="' + selected.filename + '"', 'Accept-Ranges': 'bytes', 'Content-Length': String(head.size)};
  if (etag) headers.ETag = etag;
  if (uploaded) headers['Last-Modified'] = uploaded.toUTCString();
  if (etag && request.headers.get('if-none-match') === etag) { delete headers['Content-Length']; return new Response(null, {status: 304, headers}); }
  let rangeHeader = request.headers.get('range');
  const condition = request.headers.get('if-range');
  if (condition && condition !== etag && (!uploaded || !Number.isFinite(Date.parse(condition)) || Math.floor(Date.parse(condition) / 1000) < Math.floor(uploaded.getTime() / 1000))) rangeHeader = null;
  let range;
  try { range = rangeFor(rangeHeader, head.size); }
  catch (error) { if (error.status === 416) return new Response(null, {status: 416, headers: {...baseHeaders, 'Content-Range': 'bytes */' + head.size, 'Accept-Ranges': 'bytes'}}); throw error; }
  if (range) { headers['Content-Range'] = 'bytes ' + range.offset + '-' + (range.offset + range.length - 1) + '/' + head.size; headers['Content-Length'] = String(range.length); }
  if (request.method === 'HEAD') return new Response(null, {status: range ? 206 : 200, headers});
  const object = await bucket.get(selected.key, range ? {range} : undefined);
  if (!object) return json({error: 'ملف التطبيق غير متاح للتحميل بعد.', code: 'RELEASE_NOT_FOUND'}, 404);
  if (etag && etagOf(object) && etagOf(object) !== etag) {
    void object.body?.cancel?.().catch(() => {});
    return json({error: 'تم تحديث ملف التطبيق أثناء الطلب. أعد المحاولة.', code: 'RELEASE_CHANGED'}, 503, {'Retry-After': '1'});
  }
  return new Response(object.body, {status: range ? 206 : 200, headers});
}

async function metadata(request, env) {
  const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'};
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...baseHeaders, ...cors}});
  if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'طريقة الطلب غير مدعومة.', code: 'METHOD'}, 405, {...cors, Allow: 'GET, HEAD, OPTIONS'});
  const bucket = storage(env), windows = {};
  for (const [name, file] of Object.entries(FILES)) {
    const head = await bucket.head(file.key), hash = head?.customMetadata?.sha256;
    windows[name] = {available: !!head, url: file.path, path: file.path, filename: file.filename, size: Number.isSafeInteger(head?.size) ? head.size : 0, uploadedAt: head ? uploadedAt(head)?.toISOString() || null : null, sha256: typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : ''};
  }
  const response = json({windows}, 200, cors);
  return request.method === 'HEAD' ? new Response(null, {status: response.status, headers: response.headers}) : response;
}

export async function handleReleases(request, env = {}) {
  const url = new URL(request.url), pathname = url.pathname;
  const selected = [...Object.values(FILES), LEGACY_PORTABLE].find(file => file.path === pathname);
  if (!selected && pathname !== '/api/releases' && pathname !== '/api/releases/upload') return null;
  try {
    if (selected) return await download(request, env, selected);
    if (pathname === '/api/releases/upload') return await upload(request, env, url);
    return await metadata(request, env);
  } catch (error) {
    return json({error: error?.status ? error.message : 'تعذر إكمال عملية الإصدار. حاول مجددًا.', code: error?.code || 'RELEASE_STORAGE'}, error?.status || 503, pathname === '/api/releases' ? {'Access-Control-Allow-Origin': '*'} : {});
  }
}
