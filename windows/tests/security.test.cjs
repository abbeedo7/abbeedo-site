'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createPolicy, windowPreferences, isUserActivation, canSetLanguage} = require('../security.cjs');
const origin = 'https://www.abbeedo.com';
const policy = createPolicy(origin + '/');

test('only the configured HTTPS application origin is a trusted navigation', () => {
  for (const value of [origin + '/', origin + '/watch.html#private-token', origin + '/?source=installed']) assert.equal(policy.trusted(value), true);
  for (const value of ['http://' + new URL(origin).hostname, origin + '.evil.example/', 'https://user:password@' + new URL(origin).hostname, 'file:///etc/passwd', 'javascript:alert(1)', 'https://evil.example', '', null]) assert.equal(policy.trusted(value), false);
});

test('external destinations reject shell protocols, embedded credentials and deceptive domains', () => {
  for (const value of [origin + '/downloads/windows/setup.exe', origin + '/watch.html#owned-invite', 'https://wa.me/966571514382', 'https://www.youtube.com/watch?v=fixture', 'https://vimeo.com/123']) assert.equal(policy.external(value), true);
  for (const value of ['ms-settings:privacy', 'file:///C:/Windows/System32/cmd.exe', 'javascript:alert(1)', 'https://wa.me.evil.example/', 'https://evil.example/?next=https://wa.me', 'https://user:secret@wa.me/', 'http://wa.me/', 'https://unknown.example/']) assert.equal(policy.external(value), false);
  for (const value of [origin + '.evil.example/downloads/windows/setup.exe', 'https://user:secret@' + new URL(origin).hostname + '/watch.html', 'http://' + new URL(origin).hostname + '/downloads/windows/setup.exe']) assert.equal(policy.external(value), false);
});

test('camera and playback permissions remain scoped to the application origin', () => {
  assert.equal(policy.permission(origin, 'media'), true);
  assert.equal(policy.permission(origin, 'notifications'), true);
  assert.equal(policy.permission('https://youtube.com', 'media'), false);
  assert.equal(policy.permission(origin, 'geolocation'), false);
  assert.equal(policy.permission('null', 'media'), false);
});

test('renderer security keeps Node integration and unsafe content disabled', () => {
  const prefs = windowPreferences('/owned/preload.cjs');
  assert.equal(prefs.contextIsolation, true); assert.equal(prefs.sandbox, true);
  assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.nodeIntegrationInSubFrames, false);
  assert.equal(prefs.webSecurity, true); assert.equal(prefs.allowRunningInsecureContent, false);
});

test('locale bridge is limited to the exact trusted main frame', () => {
  const mainFrame = {url: origin + '/app.html'};
  const contents = {mainFrame, isDestroyed: () => false};
  const accepted = {sender: contents, senderFrame: mainFrame};
  assert.equal(canSetLanguage(accepted, contents, policy), true);
  assert.equal(canSetLanguage({...accepted, senderFrame: {url: origin + '/embedded'}}, contents, policy), false);
  assert.equal(canSetLanguage({...accepted, sender: {}}, contents, policy), false);
  for (const url of ['https://evil.example/', origin + '.evil.example/', 'file:///error.html', 'https://user:secret@' + new URL(origin).hostname]) {
    mainFrame.url = url;
    assert.equal(canSetLanguage(accepted, contents, policy), false);
  }
  mainFrame.url = origin;
  contents.isDestroyed = () => true;
  assert.equal(canSetLanguage(accepted, contents, policy), false);
});

test('preload exposes only named preferences, updates and bounded provider operations', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8');
  const calls = [];
  let exposed;
  const electron = {
    contextBridge: {exposeInMainWorld: (key, value) => {assert.equal(key, 'abunasserDesktop'); exposed = value;}},
    ipcRenderer: {on:()=>{},removeListener:()=>{},invoke: (...args) => {calls.push(args); return Promise.resolve({ok: true});}},
  };
  const processInfo = {isMainFrame: true, platform: 'win32', argv: ['app.exe', '--abbeedo-language=en', '--abbeedo-system-language=ar']};
  const run = () => vm.runInNewContext(source, {process: processInfo, require: name => {assert.equal(name, 'electron'); return electron;}});
  run();
  assert.deepEqual(Object.keys(exposed).sort(), ['cancelUpdate','checkForUpdates','clientRequest','downloadUpdate','getNotificationsEnabled','getUpdateStatus','installUpdate','isDesktop','language','nativeAnnouncements','nativeProvider','nativeUpdater','nativeUpdates','notificationsEnabled','onUpdateStatus','platform','setLanguage','setNotificationsEnabled','systemLanguage','version']);
  assert.equal(Object.isFrozen(exposed), true);
  assert.equal(exposed.language, 'en'); assert.equal(exposed.systemLanguage, 'ar');
  await exposed.setLanguage('ar');
  assert.deepEqual(calls, [['abbeedo:presentation-language', 'ar']]);
  assert.equal((await exposed.setLanguage({path: 'outside.json'})).ok, false);
  assert.equal((await exposed.setLanguage('a'.repeat(36))).ok, false);
  assert.equal(calls.length, 1);
  assert.equal((await exposed.setNotificationsEnabled('yes')).ok,false);
  await exposed.setNotificationsEnabled(true);await exposed.getNotificationsEnabled();
  assert.deepEqual(calls.slice(1),[['abbeedo:notifications-set',true],['abbeedo:notifications-get']]);
  assert.equal(exposed.nativeAnnouncements,true);assert.equal(exposed.nativeUpdates,true);
  assert.equal(exposed.nativeProvider,true);assert.equal(exposed.version,'1.2.1');
  const beforeClient=calls.length;
  assert.equal((await exposed.clientRequest({op:'fetch',url:'file:///private'})).status,400);
  assert.equal((await exposed.clientRequest({op:'auth',account:{password:'x'.repeat(32768)}})).status,413);
  assert.equal(calls.length,beforeClient);
  const fixture={op:'auth',account:{mode:'provider',username:'fixture',password:'fixture'}};
  await exposed.clientRequest(fixture);
  assert.deepEqual(calls.at(-1),['abbeedo:client-request',fixture]);
  processInfo.isMainFrame = false; exposed = null; run();
  assert.equal(exposed, null);
});

test('a non-HTTPS or credential-bearing build configuration cannot start', () => {
  for (const value of ['file:///app/index.html', 'http://example.com', 'https://user:password@example.com', '/relative']) assert.throws(() => createPolicy(value));
});

test('hover, scrolling and focus alone never authorize an external browser launch', () => {
  for (const type of ['mouseMove', 'mouseEnter', 'mouseLeave', 'mouseWheel', 'focus', undefined]) assert.equal(isUserActivation(type), false);
  for (const type of ['mouseDown', 'mouseUp', 'keyDown', 'keyUp']) assert.equal(isUserActivation(type), true);
});

test('local builds never infer a publisher from inherited GitHub credentials', async () => {
  const {getPublishConfigs} = require('app-builder-lib/out/publish/PublishManager');
  const config = require('../package.json').build;
  assert.equal(config.publish, null);
  const packager = {platformSpecificBuildOptions: config.win, config, get info() {throw Error('Publisher discovery must not run');}};
  assert.equal(await getPublishConfigs(packager, config.nsis, 1, false), null);
});
