'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

const moduleURL = file => pathToFileURL(path.join(__dirname, '../../application/public/app', file)).href;
const modules = Promise.all([import(moduleURL('native.js')), import(moduleURL('core.js')), import(moduleURL('player.js'))]);
const location = {href: 'https://www.abbeedo.com/app', origin: 'https://www.abbeedo.com', protocol: 'https:'};
const vault = {get: async () => undefined, set: async () => {}, remove: async () => {}};
const account = {mode: 'provider', username: 'fixture-user', password: 'fixture-password'};
const operation = {op: 'auth', account};
const options = payload => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
const envelope = (value, status = 200) => ({status, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});

async function globals(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
    return await run();
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('desktop client posts only a bounded operation to the fixed endpoint while iOS capabilities stay separate', async () => {
  const [native] = await modules;
  const calls = [];
  await globals({location, webkit: undefined, abunasserDesktop: {isDesktop: true, clientRequest: async payload => {calls.push(payload); return envelope({userInfo: {auth: 1}});}}}, async () => {
    assert.equal(native.hasDesktopClient(), true);
    assert.equal(native.isNative(), false);
    assert.equal(native.capabilities.keychain, false);
    const response = await native.desktopClientFetch('/api/client', options(operation));
    assert.deepEqual(await response.json(), {userInfo: {auth: 1}});
    assert.deepEqual(calls, [operation]);
    for (const address of ['https://evil.example/api/client', '/api/media', '/api/client?url=private', 'file:///api/client', 'http://www.abbeedo.com/api/client', 'https://name:secret@www.abbeedo.com/api/client']) await assert.rejects(native.desktopClientFetch(address, options(operation)), /destination/);
    await assert.rejects(native.desktopClientFetch('/api/client', {...options(operation), method: 'GET'}), /JSON operation/);
    await assert.rejects(native.desktopClientFetch('/api/client', options({op: 'fetch', url: 'file:///private'})), /not allowed/);
    await assert.rejects(native.desktopClientFetch('/api/client', options({op: 'auth', account: {username: 'ا'.repeat(17000)}})), /too large/);
    assert.equal(calls.length, 1);
  });
});

test('desktop client rejects aborted operations and ignores a late main-process reply', async () => {
  const [native] = await modules;
  let reply, calls = 0;
  await globals({location, abunasserDesktop: {isDesktop: true, clientRequest: () => {calls++; return new Promise(resolve => {reply = resolve;});}}}, async () => {
    const already = new AbortController(); already.abort();
    await assert.rejects(native.desktopClientFetch('/api/client', {...options(operation), signal: already.signal}), {name: 'AbortError'});
    assert.equal(calls, 0);
    const controller = new AbortController();
    const pending = native.desktopClientFetch('/api/client', {...options(operation), signal: controller.signal});
    await Promise.resolve();
    controller.abort();
    await assert.rejects(pending, {name: 'AbortError'});
    reply(envelope({ignored: true}));
    await Promise.resolve();
    assert.equal(calls, 1);
  });
});

test('ApiClient uses local desktop authentication and never falls back to a generic provider fetch', async () => {
  const [, {ApiClient}] = await modules;
  let calls = 0, network = 0;
  await globals({location, fetch: async () => {network++; throw new Error('unexpected browser request');}, abunasserDesktop: {isDesktop: true, clientRequest: async payload => {calls++; assert.equal(payload.op, 'auth'); return calls === 1 ? envelope({userInfo: {auth: 1, status: 'Active'}}) : envelope({code: 'HOST_NOT_ALLOWED', error: 'Unavailable', canDirect: true}, 400);}}}, async () => {
    const client = new ApiClient({vault});
    assert.equal((await client.authenticate(account)).userInfo.auth, 1);
    await assert.rejects(client.authenticate(account), {code: 'HOST_NOT_ALLOWED'});
    assert.equal(calls, 2);
    assert.equal(network, 0);
  });
});

test('desktop catalogue waits for its bounded IPC result before parsing NDJSON', async () => {
  const [, {ApiClient}] = await modules;
  await globals({location, abunasserDesktop: {isDesktop: true, clientRequest: async payload => {
    assert.equal(payload.op, 'catalog');
    await new Promise(resolve => setTimeout(resolve, 25));
    return {status: 200, headers: {'Content-Type': 'application/x-ndjson'}, body: JSON.stringify({items: [{id: 'live:1', kind: 'live', name: 'Fixture'}]}) + '\n' + JSON.stringify({done: true}) + '\n'};
  }}}, async () => {
    const client = new ApiClient({vault, timeout: 1});
    const rows = await client.catalog(account, 'live');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'live:1');
  });
});

test('opaque desktop media URLs require the client capability and exact token shape', async () => {
  const [, , {validMediaURL}] = await modules;
  const address = 'abbeedo-media://stream/' + 'a'.repeat(43);
  await globals({location, abunasserDesktop: undefined}, async () => {
    assert.equal(validMediaURL(address), null);
    assert.equal(validMediaURL('http://provider.example/movie.mp4'), null);
    assert.equal(validMediaURL('https://provider.example/movie.mp4'), 'https://provider.example/movie.mp4');
  });
  await globals({location, abunasserDesktop: {isDesktop: true, clientRequest: async () => {}}}, async () => {
    assert.equal(validMediaURL(address), address);
    for (const value of [address + '?url=file:///private', address + '#fragment', address + '/extra', 'abbeedo-media://stream/' + 'a'.repeat(42), address.replace('//stream/', '//other/'), address.replace('//stream/', '//name:secret@stream/'), address.replace('//stream/', '//stream:123/')]) assert.equal(validMediaURL(value), null, value);
    assert.equal(validMediaURL('http://provider.example/movie.mp4'), null);
  });
});

test('desktop media explicitly requests CORS and restores the video setting before other sources', async () => {
  const [, , {createPlayer}] = await modules;
  await globals({location, webkit: undefined, abunasserDesktop: {isDesktop: true, clientRequest: async () => {}}}, async () => {
    for (const initial of [null, 'use-credentials']) {
      const attributes = new Map(initial === null ? [] : [['crossorigin', initial]]);
      const video = {currentTime: 0, duration: 120, style: {}, addEventListener() {}, removeEventListener() {}, pause() {}, load() {}, play: async () => {}, getAttribute: name => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value), removeAttribute: name => attributes.delete(name)};
      const player = createPlayer({video});
      try {
        await player.play({id: 'movie:fixture', kind: 'movie'}, {url: 'abbeedo-media://stream/' + 'a'.repeat(43), mime: 'video/mp4'});
        assert.equal(video.getAttribute('crossorigin'), 'anonymous');
        await player.play({id: 'movie:other', kind: 'movie'}, {url: 'https://media.example/fixture.mp4', mime: 'video/mp4'});
        assert.equal(video.getAttribute('crossorigin'), initial);
      } finally {player.stop();}
    }
  });
});
