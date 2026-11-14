// Pairing secrets stay in the QR fragment. Only hashes and client-encrypted data are stored.
const pairingHeaders = {
  'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const PAIR_TTL = 20 * 60 * 1000;
const PAIR_PREFIX = 'device-pairings/';
function pairJson(data, status = 200) { return Response.json(data, {status, headers: pairingHeaders}); }
function pairKey(id) { return PAIR_PREFIX + id + '.json'; }
function pairCommandPrefix(id) { return 'pairing-commands/' + id + '/'; }
function pairStateKey(id) { return 'pairing-state/' + id + '.json'; }
async function pairCommands(env,id) {
  const listed=await env.BUCKET.list({prefix:pairCommandPrefix(id),limit:25});
  const rows=await Promise.all(listed.objects.map(async item=>{const object=await env.BUCKET.get(item.key);return object?object.json():null;}));
  return rows.filter(Boolean).sort((a,b)=>a.id-b.id);
}
async function pairRemove(env,id) {
  await env.BUCKET.delete(pairKey(id));await env.BUCKET.delete(pairStateKey(id));
  const listed=await env.BUCKET.list({prefix:pairCommandPrefix(id),limit:32});
  await Promise.all(listed.objects.map(entry=>env.BUCKET.delete(entry.key)));
}
async function pairAcknowledge(env,id,through) {
  const rows=await pairCommands(env,id);
  await Promise.all(rows.filter(command=>command.id<=through).map(command=>env.BUCKET.delete(pairCommandPrefix(id)+command.id+'.json')));
}
function pairValidId(id) { return /^[A-Za-z0-9_-]{22}$/.test(id || ''); }
function pairSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
async function pairHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
async function pairBody(request, maxLength = 20000) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw {status:415};
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxLength) throw {status:413};
  const reader = request.body?.getReader();
  if (!reader) throw {status:400};
  let size = 0; const chunks = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > maxLength) throw {status:413};
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) {bytes.set(chunk, at); at += chunk.length;}
  try { const value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw 0; return value; }
  catch { throw {status:400}; }
}
function pairEnvelope(input, maxCiphertext = 16384) {
  return input && typeof input.iv === 'string' && /^[A-Za-z0-9_-]{16}$/.test(input.iv)
    && typeof input.ciphertext === 'string' && /^[A-Za-z0-9_-]+$/.test(input.ciphertext)
    && input.ciphertext.length >= 24 && input.ciphertext.length <= maxCiphertext;
}
function pairPublic(session) {
  return {id:session.id, deviceId:session.deviceId || session.id, deviceName:session.deviceName, mac:session.mac, expiresAt:session.expiresAt,
    status:session.status, payload:session.payload || null, state:session.state || null, remoteAvailable:session.status === 'received'};
}
async function pairLoad(env, id) {
  const object = await env.BUCKET.get(pairKey(id));
  if (!object) return null;
  let session; try {session = await object.json();} catch {await pairRemove(env,id); return null;}
  if (!session || session.expiresAt <= Date.now()) {await pairRemove(env,id); return null;}
  return session;
}
async function pairStore(env, session) {
  await env.BUCKET.put(pairKey(session.id), JSON.stringify(session), {httpMetadata:{contentType:'application/json'}});
}
async function pairRate(env, request) {
  // Cloudflare supplies the connecting IP; only its hash is retained for this short rate window.
  const source = request.headers.get('cf-connecting-ip') || 'unknown';
  const window = Math.floor(Date.now() / 600000), key = 'pairing-rate/' + await pairHash(source + ':' + window);
  const oldRates = await env.BUCKET.list({prefix:'pairing-rate/',limit:100});
  for (const entry of oldRates.objects) {const stored = await env.BUCKET.get(entry.key);if (stored) {try {if ((await stored.json()).expiresAt <= Date.now()) await env.BUCKET.delete(entry.key);} catch {await env.BUCKET.delete(entry.key);}}}
  const object = await env.BUCKET.get(key);
  const count = object ? Number((await object.json()).count || 0) : 0;
  if (count >= 12) return false;
  await env.BUCKET.put(key, JSON.stringify({count:count + 1, expiresAt:(window + 2) * 600000}), {httpMetadata:{contentType:'application/json'}});
  return true;
}
async function pairCleanup(env) {
  const listed = await env.BUCKET.list({prefix:PAIR_PREFIX, limit:300});
  let active = 0;
  for (const entry of listed.objects) {
    const object = await env.BUCKET.get(entry.key);
    if (!object) continue;
    try {if ((await object.json()).expiresAt > Date.now()) active++; else await pairRemove(env,entry.key.slice(PAIR_PREFIX.length,-5));}
    catch {await pairRemove(env,entry.key.slice(PAIR_PREFIX.length,-5));}
  }
  return active < 250 && !listed.truncated;
}
export async function devicePairing(request, env) {
  const url = new URL(request.url);
  const match = /^\/api\/device-pairings(?:\/([A-Za-z0-9_-]+)(?:\/(ack|commands(?:\/ack)?|state))?)?$/.exec(url.pathname);
  if (!match) return pairJson({error:'Not found'},404);
  if (!env.BUCKET) return pairJson({error:'خدمة الربط غير متاحة الآن.'},503);
  // No bearer token is accepted in URLs, and cross-origin web writes are rejected.
  if (url.search) return pairJson({error:'استخدم رابط الربط الأصلي دون معاملات إضافية.'},400);
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return pairJson({error:'Forbidden'},403);
  try {
    const id = match[1], operation = match[2];
    if (!id) {
      if (request.method !== 'POST') return pairJson({error:'Method not allowed'},405);
      const input = await pairBody(request, 2048);
      const name = typeof input.deviceName === 'string' ? input.deviceName.trim() : '';
      if (!pairValidId(input.id) || !/^[a-f0-9]{64}$/.test(input.tokenHash || '') || !name || name.length > 80
          || /[\u0000-\u001f\u007f]/.test(name) || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(input.mac || '')
          || (input.deviceId != null && (typeof input.deviceId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(input.deviceId)))
          || Object.keys(input).some(key => !['id','tokenHash','deviceName','mac','deviceId'].includes(key))) return pairJson({error:'بيانات الجهاز غير صالحة.'},400);
      if (!await pairRate(env,request)) return pairJson({error:'طلبات ربط كثيرة. انتظر قليلًا وحاول مجددًا.'},429);
      if (await env.BUCKET.get(pairKey(input.id))) return pairJson({error:'جلسة الربط موجودة بالفعل. أنشئ رمزًا جديدًا.'},409);
      if (!await pairCleanup(env)) return pairJson({error:'خدمة الربط مشغولة الآن. حاول لاحقًا.'},503);
      const session = {id:input.id, tokenHash:input.tokenHash, deviceId:input.deviceId || input.id, deviceName:name, mac:input.mac.toUpperCase(),
        createdAt:Date.now(), expiresAt:Date.now() + PAIR_TTL, status:'waiting', payload:null, nextCommandId:1, usedIvs:[]};
      await pairStore(env, session);
      return pairJson({id:session.id, expiresAt:session.expiresAt},201);
    }
    if (!pairValidId(id)) return pairJson({error:'جلسة الربط غير موجودة أو انتهت.'},404);
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return pairJson({error:'رابط الربط غير صالح.'},403);
    const session = await pairLoad(env,id);
    if (!session) return pairJson({error:'انتهت جلسة الربط. اعرض رمز QR جديدًا في التطبيق.'},404);
    if (!pairSafeEqual(await pairHash(token),session.tokenHash)) return pairJson({error:'رابط الربط غير صالح.'},403);
    if (!operation && request.method === 'GET') {const state=await env.BUCKET.get(pairStateKey(id));session.state=state?await state.json():null;return pairJson(pairPublic(session));}
    if (!operation && request.method === 'DELETE') {await pairRemove(env,id); return pairJson({ok:true});}
    if (!operation && request.method === 'POST') {
      if (session.status !== 'waiting') return pairJson({error:'وصلت بيانات هذه الجلسة بالفعل. اعرض رمزًا جديدًا لإضافة اشتراك آخر.'},409);
      const input = await pairBody(request);
      if (!pairEnvelope(input) || Object.keys(input).some(key => !['iv','ciphertext'].includes(key))) return pairJson({error:'البيانات المشفرة غير صالحة.'},400);
      session.payload = {iv:input.iv,ciphertext:input.ciphertext}; session.usedIvs = [input.iv]; session.status = 'submitted';
      await pairStore(env,session); return pairJson({ok:true,status:session.status});
    }
    if (operation === 'ack' && request.method === 'POST') {
      if (session.status === 'waiting') return pairJson({error:'لم تُرسل بيانات الاشتراك بعد.'},409);
      if(session.status !== 'received'){session.payload = null; session.status = 'received'; await pairStore(env,session);}
      return pairJson({ok:true,status:'received',expiresAt:session.expiresAt});
    }
    if (operation === 'commands') {
      if (session.status !== 'received') return pairJson({error:'أكمل ربط الاشتراك أولًا.'},409);
      if (request.method === 'GET') return pairJson({commands:await pairCommands(env,id), expiresAt:session.expiresAt});
      if (request.method === 'POST') {
        const input = await pairBody(request,131072);
        if (!pairEnvelope(input,98304) || Object.keys(input).some(key => !['iv','ciphertext'].includes(key))) return pairJson({error:'أمر غير صالح.'},400);
        if (session.usedIvs.length >= 1024) return pairJson({error:'انتهى حد أوامر الجلسة. اعرض رمز ربط جديدًا.'},429);
        if (session.usedIvs.includes(input.iv)) return pairJson({error:'أمر مكرر.'},409);
        if ((await pairCommands(env,id)).length >= 24) return pairJson({error:'انتظر استجابة الجهاز قبل إرسال مزيد من الأوامر.'},429);
        const command = {id:session.nextCommandId++,iv:input.iv,ciphertext:input.ciphertext};
        session.usedIvs.push(input.iv);
        await pairStore(env,session);
        await env.BUCKET.put(pairCommandPrefix(id)+command.id+'.json',JSON.stringify(command),{httpMetadata:{contentType:'application/json'}}); return pairJson({ok:true,id:command.id},201);
      }
      if (request.method === 'DELETE') {
        const input = await pairBody(request,256);
        if (!Number.isSafeInteger(input.through) || input.through < 0 || input.through >= session.nextCommandId || Object.keys(input).some(key => key !== 'through')) return pairJson({error:'تأكيد غير صالح.'},400);
        await pairAcknowledge(env,id,input.through); return pairJson({ok:true});
      }
    }
    if (operation === 'commands/ack' && request.method === 'POST') {
      if (session.status !== 'received') return pairJson({error:'أكمل ربط الاشتراك أولًا.'},409);
      const input = await pairBody(request,256);
      if (!Number.isSafeInteger(input.through) || input.through < 0 || input.through >= session.nextCommandId || Object.keys(input).some(key => key !== 'through')) return pairJson({error:'تأكيد غير صالح.'},400);
      await pairAcknowledge(env,id,input.through); return pairJson({ok:true});
    }
    if (operation === 'state' && request.method === 'POST') {
      if (session.status !== 'received') return pairJson({error:'أكمل ربط الاشتراك أولًا.'},409);
      const input = await pairBody(request,131072);
      if (!pairEnvelope(input,98304) || Object.keys(input).some(key => !['iv','ciphertext'].includes(key))) return pairJson({error:'حالة جهاز غير صالحة.'},400);
      await env.BUCKET.put(pairStateKey(id),JSON.stringify({iv:input.iv,ciphertext:input.ciphertext}),{httpMetadata:{contentType:'application/json'}});
      return pairJson({ok:true});
    }
    return pairJson({error:'Method not allowed'},405);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 503;
    const messages = {400:'بيانات الطلب غير صالحة.',413:'البيانات أكبر من الحد المسموح.',415:'يلزم إرسال JSON.'};
    return pairJson({error:messages[status] || 'تعذر الاتصال بخدمة الربط. حاول مجددًا.'},status);
  }
}
