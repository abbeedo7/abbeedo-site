'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createClientProvider, MEDIA_SCHEME} = require('../client-provider.cjs');

const ORIGIN = 'https://www.abbeedo.com';
const ACCOUNT = {mode: 'xtream', server: 'https://provider.example', username: 'fixture-user', password: 'fixture-secret'};
const LOCAL_MEDIA = /^abbeedo-media:\/\/stream\/[a-zA-Z0-9_-]{43}$/;
const json = body => Response.json(body);
const parsed = response => JSON.parse(response.body);
const mediaRequest = (url, options = {}) => new Request(url, {...options, headers: {origin: ORIGIN, ...options.headers}});
const resolveInput = (account = ACCOUNT, extra = {}) => ({op: 'resolve', account, kind: 'movie', id: '7', ...extra});
function fixture(handler, options = {}) {
  const calls = [];
  const provider = createClientProvider({origin: ORIGIN, ...options, fetcher: async (value, init = {}) => {
    const call = {url: new URL(value), init, headers: new Headers(init.headers)};
    calls.push(call);
    return handler(call, calls.length);
  }});
  return {provider, calls};
}

// These cases use the actual default worker loader, exercising the same worker
// code that is copied into the Windows ASAR. Every account and response is fake.
test('native auth uses the local transport and retains worker account validation', async t => {
  const {provider, calls} = fixture(() => json({user_info: {auth: 1, status: 'Active', max_connections: 2}, server_info: {timezone: 'UTC'}}));
  t.after(() => provider.stop());
  const response = await provider.clientRequest({op: 'auth', account: ACCOUNT});
  assert.equal(response.status, 200);
  assert.equal(parsed(response).userInfo.auth, 1);
  assert.equal(parsed(response).account.username, 'fixture-user');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://provider.example');
  assert.equal(calls[0].url.searchParams.get('username'), 'fixture-user');
  assert.equal(calls[0].url.searchParams.get('password'), 'fixture-secret');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].headers.get('user-agent'), 'ABBEEDO/1.0');

  const missing = await provider.clientRequest({op: 'auth', account: {...ACCOUNT, password: ''}});
  assert.equal(missing.status, 400);
  assert.equal(parsed(missing).code, 'CREDENTIALS');
  assert.equal(calls.length, 1);
});

test('native catalogue preserves NDJSON records and category names from the shared worker', async t => {
  const {provider} = fixture(({url}) => url.searchParams.get('action') === 'get_live_categories'
    ? json([{category_id: '4', category_name: 'Fixture sports'}])
    : json([{stream_id: 7, name: 'Fixture channel', category_id: '4', container_extension: 'ts', stream_icon: 'https://images.example/logo.png'}]));
  t.after(() => provider.stop());
  const response = await provider.clientRequest({op: 'catalog', account: ACCOUNT, kind: 'live'});
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/x-ndjson/);
  const chunks = response.body.trim().split('\n').map(JSON.parse);
  assert.equal(chunks[0].items[0].id, 'live:7');
  assert.equal(chunks[0].items[0].categoryId, '4');
  assert.deepEqual(chunks.at(-1).categories, [{category_id: '4', category_name: 'Fixture sports'}]);
  assert.match(chunks[0].items[0].url, /\/live\/fixture-user\/fixture-secret\/7\.ts$/);
  assert.equal(chunks.at(-1).done, true);
  assert.equal(chunks.at(-1).total, 1);
  assert.equal(chunks.at(-1).partial, false);
});

test('native details and EPG retain worker normalization', async t => {
  const {provider} = fixture(({url}) => {
    if (url.searchParams.get('action') === 'get_series_info') return json({info: {name: 'Fixture series', plot: 'Fixture plot'}, episodes: {'2': [{id: 11, title: 'Fixture episode', season: 2, episode_num: 1, container_extension: 'mp4'}]}});
    return json({epg_listings: [{id: 'event-1', title: Buffer.from('Fixture programme').toString('base64'), description: Buffer.from('Fixture description').toString('base64'), start_timestamp: '100', stop_timestamp: '200', now_playing: '1'}]});
  });
  t.after(() => provider.stop());
  const details = await provider.clientRequest({op: 'details', account: ACCOUNT, kind: 'series', id: '7'});
  assert.equal(details.status, 200);
  assert.equal(parsed(details).info.name, 'Fixture series');
  assert.equal(parsed(details).episodes[0].id, 'episode:11');
  assert.equal(parsed(details).episodes[0].season, 2);
  const epg = await provider.clientRequest({op: 'epg', account: ACCOUNT, id: '7'});
  assert.equal(epg.status, 200);
  assert.deepEqual(parsed(epg).programs[0], {id: 'event-1', title: 'Fixture programme', description: 'Fixture description', start: '100', end: '200', now: true});
});

test('resolve issues opaque process-local URLs for the primary media and alternatives', async t => {
  const {provider, calls} = fixture(() => {throw Error('resolve does not contact a provider');});
  t.after(() => provider.stop());
  const response = await provider.clientRequest(resolveInput(ACCOUNT, {kind: 'live'}));
  const data = parsed(response);
  assert.equal(response.status, 200);
  assert.match(data.url, LOCAL_MEDIA);
  assert.match(data.alternatives[0].url, LOCAL_MEDIA);
  assert.notEqual(data.url, data.alternatives[0].url);
  assert.equal(new URL(data.url).protocol, MEDIA_SCHEME + ':');
  assert.equal(new URL(data.url).search, '');
  assert.equal(data.url.includes('fixture'), false);
  assert.equal(calls.length, 0);
});

test('local media preserves Range and streams before the whole upstream body exists', async t => {
  let streamController;
  const {provider, calls} = fixture(() => new Response(new ReadableStream({start(controller) {streamController = controller;}}), {status: 206, headers: {'content-type': 'video/mp4', 'content-range': 'bytes 5-9/20', 'accept-ranges': 'bytes'}}));
  t.after(() => provider.stop());
  const data = parsed(await provider.clientRequest(resolveInput()));
  const response = await provider.handleMedia(mediaRequest(data.url, {headers: {range: 'bytes=5-9'}}));
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('content-range'), 'bytes 5-9/20');
  assert.equal(calls[0].headers.get('range'), 'bytes=5-9');
  assert.equal(calls[0].url.pathname, '/movie/fixture-user/fixture-secret/7.mp4');
  streamController.enqueue(new TextEncoder().encode('first'));
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
  streamController.enqueue(new TextEncoder().encode('later'));
  streamController.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'later');
  assert.equal((await reader.read()).done, true);
});

test('HLS segment and key URLs become opaque child tokens with working media requests', async t => {
  const {provider, calls} = fixture(({url}) => url.pathname.endsWith('.m3u8')
    ? new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST\n', {headers: {'content-type': 'application/vnd.apple.mpegurl'}})
    : new Response(url.pathname.endsWith('key.bin') ? 'fixture-key' : 'fixture-segment', {headers: {'content-type': 'application/octet-stream'}}));
  t.after(() => provider.stop());
  const data = parsed(await provider.clientRequest(resolveInput(ACCOUNT, {kind: 'live'})));
  const manifest = await provider.handleMedia(mediaRequest(data.url));
  const text = await manifest.text();
  assert.equal(manifest.status, 200);
  assert.equal(text.includes('fixture-user'), false);
  assert.equal(text.includes('/api/media'), false);
  const children = text.match(/abbeedo-media:\/\/stream\/[a-zA-Z0-9_-]{43}/g);
  assert.equal(children.length, 2);
  assert.equal(await (await provider.handleMedia(mediaRequest(children[0]))).text(), 'fixture-key');
  assert.equal(await (await provider.handleMedia(mediaRequest(children[1]))).text(), 'fixture-segment');
  assert.deepEqual(calls.map(call => call.url.pathname), ['/live/fixture-user/fixture-secret/7.m3u8', '/live/fixture-user/fixture-secret/key.bin', '/live/fixture-user/fixture-secret/segment.ts']);
});

test('media requires the exact origin, valid token and supported method before any fetch', async t => {
  const {provider, calls} = fixture(() => new Response('media'));
  t.after(() => provider.stop());
  const data = parsed(await provider.clientRequest(resolveInput()));
  for (const headers of [{}, {origin: 'null'}, {origin: 'https://evil.example'}, {origin: 'http://www.abbeedo.com'}]) {
    const response = await provider.handleMedia(new Request(data.url, {headers}));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'ORIGIN');
  }
  for (const url of ['abbeedo-media://stream/' + 'a'.repeat(43), data.url + '?url=https://provider.example', data.url + '#fragment', 'abbeedo-media://other/' + 'a'.repeat(43), 'file:///tmp/media.mp4', 'https://provider.example/media.mp4']) {
    const response = await provider.handleMedia(mediaRequest(url));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'MEDIA_TOKEN');
  }
  assert.equal((await provider.handleMedia(mediaRequest(data.url, {method: 'POST'}))).status, 405);
  const preflight = await provider.handleMedia(mediaRequest(data.url, {method: 'OPTIONS'}));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(calls.length, 0);
});

test('tokens expire, do not transfer between providers and stop clears all access', async t => {
  let clock = Date.now();
  const first = fixture(() => new Response('media'), {now: () => clock});
  const second = fixture(() => new Response('media'));
  t.after(() => {first.provider.stop(); second.provider.stop();});
  const data = parsed(await first.provider.clientRequest(resolveInput()));
  assert.equal((await second.provider.handleMedia(mediaRequest(data.url))).status, 403);
  clock += 6 * 3600000 + 1000;
  assert.equal((await first.provider.handleMedia(mediaRequest(data.url))).status, 403);
  first.provider.stop();
  assert.equal((await first.provider.clientRequest({op: 'auth', account: ACCOUNT})).status, 503);
  assert.equal((await first.provider.handleMedia(mediaRequest(data.url))).status, 403);
  assert.equal(first.calls.length + second.calls.length, 0);
});

test('upstream HTTP, JSON, auth and transport errors retain safe structured responses', async t => {
  for (const [factory, expectedStatus, expectedCode] of [
    [() => new Response('fixture-user fixture-secret upstream detail', {status: 403}), 502, 'UPSTREAM_HTTP'],
    [() => new Response('fixture-user fixture-secret invalid json'), 502, 'UPSTREAM_JSON'],
    [() => json({user_info: {auth: 0, status: 'Disabled'}}), 401, 'AUTH'],
    [() => {throw Error('https://provider.example/?username=fixture-user&password=fixture-secret');}, 502, 'UPSTREAM'],
  ]) {
    const {provider} = fixture(factory);
    t.after(() => provider.stop());
    const response = await provider.clientRequest({op: 'auth', account: ACCOUNT});
    assert.equal(response.status, expectedStatus);
    assert.equal(parsed(response).code, expectedCode);
    assert.equal(response.body.includes('fixture-secret'), false);
    assert.equal(response.body.includes('fixture-user'), false);
    assert.equal(response.body.includes('provider.example'), false);
  }
});

test('action allowlist, JSON input size, cyclic input and non-HTTP accounts are rejected', async t => {
  const {provider, calls} = fixture(() => {throw Error('must not fetch');});
  t.after(() => provider.stop());
  for (const payload of [null, [], {op: 'fetch', url: 'https://provider.example'}, {op: 'delete'}, {op: '__proto__'}]) {
    const response = await provider.clientRequest(payload);
    assert.equal(response.status, 400);
    assert.equal(parsed(response).code, 'OP');
  }
  const large = await provider.clientRequest({op: 'auth', account: ACCOUNT, extra: 'x'.repeat(32768)});
  assert.equal(large.status, 413);
  assert.equal(parsed(large).code, 'INPUT_SIZE');
  const cyclic = {op: 'auth', account: ACCOUNT}; cyclic.self = cyclic;
  assert.equal(parsed(await provider.clientRequest(cyclic)).code, 'INPUT');
  const invalid = await provider.clientRequest({op: 'auth', account: {mode: 'direct', url: 'file:///tmp/media.mp4'}});
  assert.equal(invalid.status, 400);
  assert.equal(parsed(invalid).code, 'SOURCE_URL');
  assert.equal(calls.length, 0);
});

test('media HTTP and invalid Range errors contain no upstream credential-bearing details', async t => {
  const {provider, calls} = fixture(() => new Response('fixture-secret provider detail', {status: 403}));
  t.after(() => provider.stop());
  const data = parsed(await provider.clientRequest(resolveInput()));
  const invalid = await provider.handleMedia(mediaRequest(data.url, {headers: {range: 'bytes=0-1,4-5'}}));
  assert.equal(invalid.status, 416);
  assert.equal((await invalid.json()).code, 'RANGE');
  assert.equal(calls.length, 0);
  const rejected = await provider.handleMedia(mediaRequest(data.url));
  assert.equal(rejected.status, 403);
  const body = await rejected.text();
  assert.equal(JSON.parse(body).code, 'MEDIA_HTTP');
  assert.equal(body.includes('fixture-secret'), false);
});

test('portal credentials stay on the portal and are stripped from manual media redirects', async t => {
  const account = {mode: 'stalker', server: 'https://portal.example/c', mac: '00:11:22:33:44:55'};
  const {provider, calls} = fixture(({url}) => {
    if (url.searchParams.get('action') === 'handshake') return json({js: {token: 'fixture-token'}});
    if (url.searchParams.get('action') === 'create_link') return json({js: {cmd: 'ffmpeg https://portal.example/stream.ts'}});
    if (url.hostname === 'portal.example') return new Response(null, {status: 302, headers: {location: 'http://1.1.1.1/media.ts'}});
    return new Response('fixture-media', {headers: {'content-type': 'video/mp2t'}});
  });
  t.after(() => provider.stop());
  const resolved = await provider.clientRequest({op: 'resolve', account, kind: 'live', item: {command: 'fixture-command'}});
  assert.equal(resolved.status, 200);
  assert.equal(calls[0].headers.get('cookie'), 'mac=00:11:22:33:44:55; stb_lang=en; timezone=GMT');
  assert.equal(calls[1].headers.get('authorization'), 'Bearer fixture-token');
  assert.equal(calls[1].headers.get('referer'), 'https://portal.example/c/');
  const media = await provider.handleMedia(mediaRequest(parsed(resolved).url));
  assert.equal(await media.text(), 'fixture-media');
  assert.equal(calls[2].headers.get('cookie'), 'mac=00:11:22:33:44:55; stb_lang=en; timezone=GMT');
  assert.equal(calls[3].url.origin, 'http://1.1.1.1');
  for (const header of ['authorization', 'cookie', 'referer', 'x-user-agent']) assert.equal(calls[3].headers.get(header), null, header);
});

test('local requests bound concurrent work and reject the fifth pending account action', async t => {
  const pending = [];
  const {provider} = fixture(() => new Promise(resolve => pending.push(resolve)));
  t.after(() => provider.stop());
  const requests = Array.from({length: 4}, () => provider.clientRequest({op: 'auth', account: ACCOUNT}));
  for (let attempts = 0; pending.length < 4 && attempts < 20; attempts++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.length, 4);
  const busy = await provider.clientRequest({op: 'auth', account: ACCOUNT});
  assert.equal(busy.status, 429);
  assert.equal(parsed(busy).code, 'BUSY');
  for (const resolve of pending) resolve(json({user_info: {auth: 1, status: 'Active'}}));
  assert.equal((await Promise.all(requests)).every(response => response.status === 200), true);
});


test('direct and M3U accounts honor their URL when the UI also supplies its default provider server', async t => {
  for (const mode of ['direct', 'm3u']) {
    const account = {mode, server: 'http://maglobalxx.xyz:2052', url: mode === 'direct' ? 'https://media.example/direct.mp4' : 'https://playlist.example/channels.m3u'};
    const {provider, calls} = fixture(({url}) => url.pathname.endsWith('.m3u')
      ? new Response('#EXTM3U\n#EXTINF:-1,Fixture channel\nhttps://playlist.example/stream.ts\n')
      : new Response('fixture-media', {headers: {'content-type': 'video/mp4'}}));
    t.after(() => provider.stop());
    const auth = await provider.clientRequest({op: 'auth', account});
    assert.equal(auth.status, 200, mode);
    assert.equal(parsed(auth).userInfo.sourceVerified, false);
    const catalogue = await provider.clientRequest({op: 'catalog', account, kind: 'live'});
    assert.equal(catalogue.status, 200, mode);
    const item = parsed(catalogue).items[0];
    assert.equal(item.url, mode === 'direct' ? account.url : 'https://playlist.example/stream.ts');
    const resolved = await provider.clientRequest({op: 'resolve', account, kind: 'live', item});
    assert.equal(resolved.status, 200, mode);
    assert.match(parsed(resolved).url, LOCAL_MEDIA);
    assert.equal(await (await provider.handleMedia(mediaRequest(parsed(resolved).url))).text(), 'fixture-media');
    assert.equal(calls.at(-1).url.hostname, mode === 'direct' ? 'media.example' : 'playlist.example');
  }
});

test('HEAD media retains upstream status and length without a body', async t => {
  const {provider, calls} = fixture(() => new Response(null, {status: 206, headers: {'content-type': 'video/mp4', 'content-length': '5', 'content-range': 'bytes 5-9/20'}}));
  t.after(() => provider.stop());
  const data = parsed(await provider.clientRequest(resolveInput()));
  const response = await provider.handleMedia(mediaRequest(data.url, {method: 'HEAD', headers: {range: 'bytes=5-9'}}));
  assert.equal(response.status, 206);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('content-length'), '5');
  assert.equal(calls[0].init.method, 'HEAD');
  assert.equal(calls[0].headers.get('range'), 'bytes=5-9');
});

test('active live manifest survives more than 8192 issued segments while old tokens are evicted', async t => {
  const root = 'root'.padEnd(29, '_');
  let issued = 0;
  const provider = createClientProvider({origin: ORIGIN, loadWorker: async () => ({
    handleClient: async () => json({url: ORIGIN + '/api/media?t=' + root, expiresAt: Date.now() + 3600000}),
    handleClientMedia: async request => {
      if (new URL(request.url).searchParams.get('t') !== root) return new Response('segment');
      const headers = {'content-type': 'application/vnd.apple.mpegurl'};
      if (request.method === 'HEAD') return new Response(null, {headers});
      const segments = Array.from({length: 3000}, () => ORIGIN + '/api/media?t=' + String(++issued).padStart(29, '0'));
      return new Response('#EXTM3U\n' + segments.join('\n'), {headers});
    },
  })});
  t.after(() => provider.stop());
  const rootURL = parsed(await provider.clientRequest(resolveInput())).url;
  let firstSegments;
  for (let refresh = 0; refresh < 3; refresh++) {
    const manifest = await provider.handleMedia(mediaRequest(rootURL));
    assert.equal(manifest.status, 200);
    const segments = (await manifest.text()).split('\n').slice(1);
    if (!firstSegments) firstSegments = segments;
    assert.equal(segments.length, 3000);
  }
  assert.equal(issued, 9000);
  assert.equal((await provider.handleMedia(mediaRequest(rootURL, {method: 'HEAD'}))).status, 200);
  // 9000 segments plus the root leave exactly the oldest 809 segments evicted.
  assert.equal((await provider.handleMedia(mediaRequest(firstSegments[808]))).status, 403);
  const retained = await provider.handleMedia(mediaRequest(firstSegments[809]));
  assert.equal(retained.status, 200);
  assert.equal(await retained.text(), 'segment');
});
