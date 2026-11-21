'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {Readable, PassThrough} = require('node:stream');
const {createProviderFetch, publicAddress} = require('../provider-fetch.cjs');

const PUBLIC = [{address: '93.184.216.34', family: 4}];
function fixture(routes, lookup = async () => PUBLIC) {
  const calls = [];
  const request = (protocol, options, callback) => {
    const outgoing = new EventEmitter();
    outgoing.setTimeout = () => {};
    outgoing.destroy = () => { outgoing.destroyed = true; };
    outgoing.end = () => queueMicrotask(() => {
      if (outgoing.destroyed) return;
      const route = routes[calls.length] || {};
      calls.push({protocol, options, outgoing});
      const response = route.stream || Readable.from(route.body == null ? [] : [Buffer.from(route.body)]);
      response.statusCode = route.status || 200;
      response.headers = route.headers || {};
      callback(response);
    });
    return outgoing;
  };
  return {calls, fetch: createProviderFetch({lookup, request, timeoutMs: 1000})};
}

test('public address policy excludes private, reserved and embedded IPv4 targets', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.1.1.1', '240.1.1.1', '255.255.255.255', '::', '::1', 'fe80::1', 'fc00::1', 'ff02::1', '2001:db8::1', '2001::1', '2002:0808:0808::1', '3fff::1', '::ffff:1.1.1.1', '::ffff:127.0.0.1', 'no-address']) {
    assert.equal(publicAddress(address), false, address);
  }
  for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '2606:4700::1111', '2001:4860:4860::8888']) assert.equal(publicAddress(address), true, address);
});

test('resolves once, validates every answer and pins the request DNS lookup', async () => {
  const lookups = [];
  const {fetch, calls} = fixture([{body: '{"ok":true}', headers: {'content-type': 'application/json'}}], async (hostname, options) => {
    lookups.push({hostname, options});
    return [...PUBLIC, {address: '1.1.1.1', family: 4}];
  });
  const response = await fetch('https://provider.example/player_api.php?username=fixture&password=fixture', {headers: {'User-Agent': 'ABBEEDO/1.0'}});
  assert.deepEqual(await response.json(), {ok: true});
  assert.deepEqual(lookups, [{hostname: 'provider.example', options: {all: true, verbatim: true}}]);
  assert.equal(calls[0].options.agent, false);
  assert.equal(calls[0].options.servername, 'provider.example');
  assert.equal(calls[0].options.headers['user-agent'], 'ABBEEDO/1.0');
  const pin = await new Promise((resolve, reject) => calls[0].options.lookup('provider.example', {}, (error, address, family) => error ? reject(error) : resolve({address, family})));
  assert.deepEqual(pin, PUBLIC[0]);
  const all = await new Promise((resolve, reject) => calls[0].options.lookup('provider.example', {all: true}, (error, addresses) => error ? reject(error) : resolve(addresses)));
  assert.deepEqual(all, PUBLIC);
});

test('rejects private literals, DNS answers, local names, credentials and unsupported methods before a socket opens', async () => {
  let sockets = 0;
  const request = () => { sockets++; throw Error('must never open'); };
  for (const address of ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://localhost/', 'http://metadata.google.internal/', 'file:///tmp/media', 'http://user:secret@provider.example/', 'https://provider.example/path#fragment', 'https://provider.example/white space']) {
    await assert.rejects(createProviderFetch({request})(address), /^Error: Provider connection unavailable\.$/);
  }
  for (const answers of [[{address: '10.0.0.1', family: 4}], [...PUBLIC, {address: '127.0.0.1', family: 4}], [{address: '1.1.1.1', family: 6}], []]) {
    await assert.rejects(createProviderFetch({lookup: async () => answers, request})('https://provider.example/'));
  }
  const publicFetch = createProviderFetch({lookup: async () => PUBLIC, request});
  await assert.rejects(publicFetch('https://provider.example/', {method: 'POST'}));
  await assert.rejects(publicFetch('https://provider.example/', {body: 'value'}));
  await assert.rejects(publicFetch('https://provider.example/', {headers: {Host: '127.0.0.1'}}));
  await assert.rejects(publicFetch('https://provider.example/', {headers: {Range: 'bytes=0-1,4-5'}}));
  await assert.rejects(publicFetch('https://provider.example/', {headers: {Authorization: 'x'.repeat(8193)}}));
  assert.equal(sockets, 0);
});

test('validates redirect destinations and new DNS answers before following', async () => {
  const privateRedirect = fixture([{status: 302, headers: {location: 'http://169.254.169.254/latest/meta-data'}}]);
  await assert.rejects(privateRedirect.fetch('https://provider.example/'));
  assert.equal(privateRedirect.calls.length, 1);

  let dnsCalls = 0;
  const rebinding = fixture([{status: 302, headers: {location: '/next'}}], async () => ++dnsCalls === 1 ? PUBLIC : [{address: '192.168.1.2', family: 4}]);
  await assert.rejects(rebinding.fetch('https://provider.example/'));
  assert.equal(rebinding.calls.length, 1);
  assert.equal(dnsCalls, 2);

  const crossOrigin = fixture([{status: 307, headers: {location: 'http://cdn.example/media'}}, {body: 'stream'}]);
  assert.equal(await (await crossOrigin.fetch('https://provider.example/media', {headers: {Authorization: 'Bearer fixture', Cookie: 'session=fixture', Referer: 'https://provider.example/', Range: 'bytes=0-'}})).text(), 'stream');
  assert.equal(crossOrigin.calls[1].options.headers.authorization, undefined);
  assert.equal(crossOrigin.calls[1].options.headers.cookie, undefined);
  assert.equal(crossOrigin.calls[1].options.headers.referer, undefined);
  assert.equal(crossOrigin.calls[1].options.headers.range, 'bytes=0-');
});

test('manual redirects are returned for the worker to validate; redirect count is bounded', async () => {
  const manual = fixture([{status: 302, headers: {location: 'http://127.0.0.1/'}}]);
  const response = await manual.fetch('https://provider.example/', {redirect: 'manual'});
  assert.equal(response.status, 302);
  await response.body.cancel();
  assert.equal(manual.calls.length, 1);

  const loop = fixture(Array.from({length: 6}, () => ({status: 302, headers: {location: '/again'}})));
  await assert.rejects(loop.fetch('https://provider.example/'));
  assert.equal(loop.calls.length, 6);
});

test('streams media and forwards a single Range without buffering the full body', async () => {
  const source = new PassThrough();
  const {fetch, calls} = fixture([{status: 206, stream: source, headers: {'content-type': 'video/mp4', 'content-range': 'bytes 0-9/20', 'accept-ranges': 'bytes'}}]);
  const response = await fetch('http://provider.example/movie/fixture/fixture/1.mp4', {headers: {Range: 'bytes=0-9'}});
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-9/20');
  assert.equal(calls[0].options.headers.range, 'bytes=0-9');
  source.write(Buffer.from('first'));
  const reader = response.body.getReader();
  assert.equal(Buffer.from((await reader.read()).value).toString(), 'first');
  assert.equal(source.writableEnded, false);
  source.end(Buffer.from('later'));
  assert.equal(Buffer.from((await reader.read()).value).toString(), 'later');
  assert.equal((await reader.read()).done, true);
});

test('HEAD has no response body and cancellation closes streamed media', async () => {
  const head = fixture([{headers: {'content-length': '20'}}]);
  const response = await head.fetch('https://provider.example/media.mp4', {method: 'HEAD'});
  assert.equal(response.body, null);
  assert.equal(head.calls[0].options.method, 'HEAD');

  const source = new PassThrough();
  const media = fixture([{stream: source}]);
  const streamed = await media.fetch('https://provider.example/media.mp4');
  await streamed.body.cancel();
  assert.equal(source.destroyed, true);
  assert.equal(media.calls[0].outgoing.destroyed, true);
});

test('DNS timeout and cancellation use bounded privacy-safe errors', async () => {
  let opened = false;
  const fetch = createProviderFetch({lookup: () => new Promise(() => {}), request: () => { opened = true; }, timeoutMs: 10});
  await assert.rejects(fetch('https://provider.example/?password=fixture'), error => error.name === 'TimeoutError' && !error.message.includes('fixture') && !error.message.includes('provider.example'));
  const controller = new AbortController();
  const pending = fetch('https://provider.example/?password=fixture', {signal: controller.signal});
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(opened, false);
});
