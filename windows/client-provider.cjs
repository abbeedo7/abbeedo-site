'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {randomBytes} = require('node:crypto');
const {createProviderFetch} = require('./provider-fetch.cjs');

const CLIENT_ACTIONS = new Set(['auth', 'catalog', 'details', 'epg', 'resolve']);
const MAX_INPUT = 32768;
const MAX_OUTPUT = 64 * 1024 * 1024;
const MEDIA_SCHEME = 'abbeedo-media';
const MEDIA_PREFIX = MEDIA_SCHEME + '://stream/';
const JSON_HEADERS = {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private'};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const reply = (status, code, error) => ({status, headers: JSON_HEADERS, body: JSON.stringify({code, error})});

function workerModulePath(directory = __dirname) {
  const packaged = path.join(directory, 'client-worker/client-api.mjs');
  return fs.existsSync(packaged) ? packaged : path.join(directory, '../application/worker/client-api.mjs');
}

function createMediaProtocolHandler({provider, origin, trusted}) {
  return request => {
    // Electron supplies this field outside page control. Its protocol handler
    // omits the HTTP Origin header even for valid CORS video/fetch requests.
    if (request.initiatorOrigin !== origin || !trusted()) return Response.json({code: 'ORIGIN'}, {status: 403, headers: {'cache-control': 'no-store, private'}});
    const headers = new Headers(request.headers);
    headers.set('origin', request.initiatorOrigin);
    return provider.handleMedia(new Request(request.url, {method: request.method, headers, signal: request.signal}));
  };
}

// Worker modules retain their existing validation, catalogue and signed-media
// contracts. The desktop changes only the network transport and local URL form.
function createClientProvider({origin, fetcher = createProviderFetch(), loadWorker = () => import(pathToFileURL(workerModulePath()).href), now = Date.now, random = randomBytes} = {}) {
  const appOrigin = new URL(origin).origin;
  if (appOrigin !== origin || !origin.startsWith('https://') || new URL(origin).username || new URL(origin).password) throw new TypeError('Invalid application origin');
  const secret = random(32).toString('hex');
  const tokens = new Map();
  let tokenBytes = 0, active = 0, stopped = false;
  const controllers = new Set();
  const removeToken = token => {const value = tokens.get(token); if (value) {tokenBytes -= value.bytes; tokens.delete(token);}};
  const prune = () => {
    for (const [token, value] of tokens) if (value.expiresAt <= now()) removeToken(token);
    while (tokens.size > 8192 || tokenBytes > 24 * 1024 * 1024) removeToken(tokens.keys().next().value);
  };
  const issue = (value, env, expiresAt) => {
    const url = new URL(value);
    if (url.origin !== appOrigin || url.pathname !== '/api/media' || !/^[a-z0-9_-]{29,24000}$/i.test(url.searchParams.get('t') || '') || [...url.searchParams.keys()].some(key => key !== 't') || url.hash) throw new Error('Invalid local media token');
    const token = random(32).toString('base64url');
    const bytes = Buffer.byteLength(value);
    tokens.set(token, {url: url.href, env, expiresAt: Math.min(Number(expiresAt) || now() + 6 * 3600000, now() + 6 * 3600000), bytes});
    tokenBytes += bytes; prune();
    return MEDIA_PREFIX + token;
  };
  const environment = input => {
    // This grants the user-selected provider hostname to the existing worker;
    // the pinned local fetch still resolves and rejects every private address.
    let hostname = '', providerOrigin = 'http://maglobalxx.xyz:2052';
    const account = input.account;
    if (plain(account) && (account.mode || 'provider') !== 'provider') {
      const address = ['m3u', 'direct'].includes(account.mode) ? account.url || account.server : account.server || account.url;
      try {const provider = new URL(address); hostname = provider.hostname.toLowerCase(); providerOrigin = provider.origin;} catch {}
    }
    const clientFetch = (value, options = {}) => {
      const headers = new Headers(options.headers);
      // The shared worker follows manual redirects. Strip portal credentials
      // on every CDN-origin request, including a directly returned media URL.
      if (new URL(value).origin !== providerOrigin) for (const key of ['authorization', 'cookie', 'referer', 'x-user-agent']) headers.delete(key);
      return fetcher(value, {...options, headers});
    };
    return {CLIENT_SECRET: secret, CLIENT_ALLOWED_HOSTS: hostname, CLIENT_FETCH: clientFetch};
  };
  const readBounded = async (response, controller, limit = MAX_OUTPUT, duration = 90000) => {
    if (!response?.body) return '';
    const reader = response.body.getReader(), chunks = [];
    let size = 0, timer;
    try {
      timer = setTimeout(() => controller.abort(), duration); timer.unref?.();
      for (;;) {
        if (controller.signal.aborted) throw new Error('Request cancelled');
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > limit) throw new Error('Response exceeds local limit');
        chunks.push(Buffer.from(next.value));
      }
      return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, size));
    } finally {clearTimeout(timer); void reader.cancel().catch(() => {});}
  };

  async function clientRequest(payload) {
    if (stopped) return reply(503, 'UNAVAILABLE', 'الاتصال المحلي غير متاح.');
    if (!plain(payload) || !CLIENT_ACTIONS.has(payload.op)) return reply(400, 'OP', 'عملية غير مدعومة.');
    let body;
    try {body = JSON.stringify(payload); if (Buffer.byteLength(body) > MAX_INPUT) return reply(413, 'INPUT_SIZE', 'الطلب كبير جدًا.');} catch {return reply(400, 'INPUT', 'بيانات الطلب غير صالحة.');}
    if (active >= 4) return reply(429, 'BUSY', 'انتظر اكتمال الاتصال الحالي.');
    const controller = new AbortController(), env = environment(payload);
    controllers.add(controller); active++;
    let timer;
    try {
      timer = setTimeout(() => controller.abort(), 95000); timer.unref?.();
      const {handleClient} = await loadWorker();
      const response = await handleClient(new Request(appOrigin + '/api/client', {method: 'POST', headers: {'content-type': 'application/json', origin: appOrigin}, body, signal: controller.signal}), env);
      let output = await readBounded(response, controller);
      if (payload.op === 'resolve' && response.ok) {
        const data = JSON.parse(output);
        data.url = issue(data.url, env, data.expiresAt);
        data.alternatives = (data.alternatives || []).slice(0, 2).map(entry => typeof entry === 'string' ? issue(entry, env, data.expiresAt) : {...entry, url: issue(entry.url, env, data.expiresAt)});
        output = JSON.stringify(data);
      }
      return {status: response.status, headers: {'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store, private'}, body: output};
    } catch {
      return reply(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'TIMEOUT' : 'UPSTREAM', 'تعذر الاتصال بالمصدر. تحقق من الرابط أو حاول مجددًا.');
    } finally {clearTimeout(timer); controllers.delete(controller); controller.abort(); active--;}
  }

  async function handleMedia(request) {
    const deny = (status, code) => Response.json({code}, {status, headers: {'cache-control': 'no-store, private'}});
    let url;
    try {url = new URL(request.url);} catch {return deny(400, 'MEDIA_URL');}
    if (stopped || url.protocol !== MEDIA_SCHEME + ':' || url.hostname !== 'stream' || url.port || url.username || url.password || url.search || url.hash || !/^\/[a-z0-9_-]{43}$/i.test(url.pathname)) return deny(403, 'MEDIA_TOKEN');
    // Tokens belong to this trusted page origin and this process lifetime. An
    // external page, opaque origin or arbitrary URL cannot use this protocol.
    if (request.headers.get('origin') !== appOrigin) return deny(403, 'ORIGIN');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return deny(405, 'METHOD');
    prune();
    const token = url.pathname.slice(1), item = tokens.get(token);
    if (!item) return deny(403, 'MEDIA_TOKEN');
    // A live manifest keeps issuing segment tokens. Retain recently used
    // entries so bounded eviction cannot discard the active manifest itself.
    tokens.delete(token); tokens.set(token, item);
    const headers = new Headers({'cache-control': 'no-store, private', 'access-control-allow-origin': appOrigin, vary: 'Origin', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': 'Range', 'access-control-expose-headers': 'Content-Range, Accept-Ranges, Content-Length'});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    const controller = new AbortController(); controllers.add(controller);
    const abort = () => controller.abort();
    if (request.signal?.aborted) abort(); else request.signal?.addEventListener('abort', abort, {once: true});
    const clean = () => {request.signal?.removeEventListener('abort', abort); controllers.delete(controller); controller.abort();};
    try {
      const {handleClientMedia} = await loadWorker();
      const upstreamHeaders = {'origin': appOrigin};
      if (request.headers.has('range')) upstreamHeaders.range = request.headers.get('range');
      const response = await handleClientMedia(new Request(item.url, {method: request.method, headers: upstreamHeaders, signal: controller.signal}), item.env);
      for (const [key, value] of response.headers) if (!['access-control-allow-origin', 'vary'].includes(key)) headers.set(key, value);
      if (/mpegurl/i.test(response.headers.get('content-type') || '') && response.ok && request.method !== 'HEAD') {
        const body = await readBounded(response, controller, 4 * 1024 * 1024, 15000);
        const prefix = appOrigin + '/api/media?t=';
        const output = body.replace(/https?:\/\/[^\s"<>]+/g, value => value.startsWith(prefix) ? issue(value, item.env, item.expiresAt) : value);
        headers.delete('content-length'); clean();
        return new Response(output, {status: response.status, headers});
      }
      if (!response.body || request.method === 'HEAD') {void response.body?.cancel().catch(() => {}); clean(); return new Response(null, {status: response.status, headers});}
      const reader = response.body.getReader();
      const body = new ReadableStream({async pull(controller) {try {const next = await reader.read(); if (next.done) {controller.close(); clean();} else controller.enqueue(next.value);} catch {controller.error(new Error('Local media connection failed')); clean();}}, cancel() {void reader.cancel().catch(() => {}); clean();}});
      return new Response(body, {status: response.status, headers});
    } catch {clean(); return deny(502, 'UPSTREAM');}
  }
  return Object.freeze({clientRequest, handleMedia, stop() {stopped = true; for (const controller of controllers) controller.abort(); controllers.clear(); tokens.clear(); tokenBytes = 0;}});
}

module.exports = {createClientProvider, createMediaProtocolHandler, workerModulePath, MEDIA_SCHEME};
