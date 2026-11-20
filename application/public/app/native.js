// Native bridge is present only in the signed iOS shell. Browser paths use web APIs.
const pending = new Map();
let serial = 0;
export const isNative = () => Boolean(globalThis.webkit?.messageHandlers?.abunasser);
export const capabilities = Object.freeze({
  native: isNative(), keychain: isNative(), nativePlayer: isNative(),
  backgroundDownloads: isNative(), nativeFileImport: isNative(), qrCamera: isNative(),
  replayKit: isNative(), nativeNotifications: isNative(), airPlay: isNative(),
  nativePiPAutomatic: isNative(), programmaticPiP: false,
});
globalThis.AbunasserBridge = Object.freeze({
  resolve(id, result, error) {
    const job = pending.get(String(id));
    if (!job) return;
    pending.delete(String(id)); clearTimeout(job.timer);
    if (error) {
      const failure = new Error(error.message || 'تعذر إكمال العملية على الجهاز.');
      failure.code = error.code || 'NATIVE_ERROR'; job.reject(failure);
    } else job.resolve(result);
  },
  event(detail) {
    if (detail && typeof detail === 'object') globalThis.dispatchEvent(new CustomEvent('abunasser:native', { detail }));
  },
});
export function nativeRequest(method, payload = {}) {
  if (!isNative()) return Promise.reject(Object.assign(new Error('هذه الوظيفة تحتاج تطبيق الآيفون. يمكنك استخدام الخيارات المتاحة في المتصفح.'), { code: 'NATIVE_UNAVAILABLE' }));
  if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(method)) return Promise.reject(new TypeError('Invalid native method'));
  const id = String(++serial);
  return new Promise((resolve, reject) => {
    // File selection, camera permission and ReplayKit can legitimately await the user.
    const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('انتهت مهلة انتظار استجابة الجهاز.'), { code: 'NATIVE_TIMEOUT' })); }, 300000);
    pending.set(id, { resolve, reject, timer });
    try { globalThis.webkit.messageHandlers.abunasser.postMessage({ id, method, payload }); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}

let requestSerial = 0;
/** A standard streaming Response over the same-Site URLSession bridge. */
export async function nativeFetch(input, options = {}) {
  if (!isNative()) return globalThis.fetch(input, options);
  const origin = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.ABUNASSER_NATIVE_CONFIG?.apiOrigin || 'https://www.abbeedo.com';
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(raw, origin); if (url.origin !== new URL(origin).origin || url.protocol !== 'https:' || url.username || url.password) throw new TypeError('Native API destination is not allowed');
  const headers = Object.fromEntries(new Headers(options.headers || (input instanceof Request ? input.headers : undefined)));
  const method = options.method || (input instanceof Request ? input.method : 'GET');
  const signal = options.signal || (input instanceof Request ? input.signal : undefined);
  const body = options.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(method.toUpperCase()) ? await input.clone().text() : '');
  const requestId = `native-${Date.now()}-${++requestSerial}`;
  return new Promise((resolve, reject) => {
    let controller, responded = false, ended = false, pendingACK = null, lastSequence = 0;
    const clean = () => { globalThis.removeEventListener('abunasser:native', event); signal?.removeEventListener('abort', abort); };
    const failure = error => { if (ended) return; ended = true; clean(); if (responded) controller?.error(error); else reject(error); };
    const cancel = () => { void nativeRequest('apiCancel', {requestId}).catch(() => {}); };
    const abort = () => { cancel(); failure(new DOMException('Aborted', 'AbortError')); };
    const acknowledge = () => {
      if (pendingACK === null || ended) return;
      const sequence = pendingACK; pendingACK = null;
      void nativeRequest('apiAck', {requestId, sequence}).catch(failure);
    };
    const response = data => {
      if (responded || ended) return;
      const status = Number(data.status) || 200;
      const stream = [204,205,304].includes(status) || method.toUpperCase() === 'HEAD' ? null : new ReadableStream({start(value) {controller = value;}, pull() {acknowledge();}, cancel() {abort();}});
      responded = true; resolve(new Response(stream, {status, headers: data.headers || {}}));
    };
    const event = value => {
      const data = value.detail; if (data?.requestId !== requestId || ended) return;
      if (data.type === 'api-response') response(data);
      else if (data.type === 'api-chunk') {
        if (!responded || !controller) { cancel(); failure(new Error('Unexpected native response body')); return; }
        try {
          const sequence = Number(data.sequence);
          if (Number.isSafeInteger(sequence) && sequence > 0 && sequence !== lastSequence + 1) throw new Error('Native response sequence is invalid');
          const bytes = data.dataBase64 ? Uint8Array.from(atob(data.dataBase64.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0)) : new TextEncoder().encode(data.data || '');
          if (bytes.byteLength > 32768) throw new Error('Native response chunk is too large');
          controller.enqueue(bytes);
          if (Number.isSafeInteger(sequence) && sequence > 0) {lastSequence = sequence;pendingACK = sequence;if (controller.desiredSize > 0) acknowledge();}
        } catch (error) {cancel();failure(error);}
      } else if (data.type === 'api-end') { if (!responded) response({status:200}); ended = true; clean(); controller?.close(); }
      else if (data.type === 'api-error') failure(Object.assign(new Error(data.message || 'Native connection failed'), {code:data.code || 'NATIVE_NETWORK'}));
    };
    if (signal?.aborted) {reject(new DOMException('Aborted','AbortError'));return;}
    globalThis.addEventListener('abunasser:native', event); signal?.addEventListener('abort', abort, {once:true});
    nativeRequest('apiRequest', {url:url.href,method,headers,body,requestId,stream:true}).then(data => {
      if (ended) return;
      if (!responded) {ended=true;clean();const status=Number(data.status)||200;resolve(new Response([204,205,304].includes(status)||method.toUpperCase()==='HEAD'?null:data.body||'',{status,headers:data.headers||{}}));}
      // Streaming completion follows api-end. Never duplicate the aggregate body.
    }, failure);
  });
}
