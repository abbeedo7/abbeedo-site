'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');

test('main process retains the legacy profile and persists locale only from its trusted main frame', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'abbeedo-main-'));
  try {
    const legacy = path.join(appData, 'Abunasser TV');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'presentation.json'), JSON.stringify({language: 'en'}));
    fs.writeFileSync(path.join(legacy, 'Cookies'), 'keep-existing-login');
    const handlers = new Map();
    const paths = new Map([['appData', appData]]);
    const app = Object.assign(new EventEmitter(), {
      getPath: name => paths.get(name), setPath: (name, value) => paths.set(name, value),
      setName: () => {}, requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(), getLocale: () => 'ar-SA',
      setAppUserModelId: () => {}, quit: () => {},
    });
    let window;
    class BrowserWindow extends EventEmitter {
      constructor(options) {
        super(); window = this; this.options = options;
        this.webContents = Object.assign(new EventEmitter(), {
          mainFrame: {url: 'https://www.abbeedo.com/app'},
          isDestroyed: () => false, getURL: () => this.webContents.mainFrame.url,
          setWindowOpenHandler: () => {},
          session: {setPermissionRequestHandler: () => {}, setPermissionCheckHandler: () => {}},
        });
      }
      loadURL() {return Promise.resolve();}
      loadFile(filename, options) {this.loadedFile = {filename, options}; return Promise.resolve();}
      show() {}
    }
    const schemes=[],mediaHandlers=new Map();
    const electron = {protocol:{registerSchemesAsPrivileged:values=>schemes.push(...values),handle:(name,handler)=>mediaHandlers.set(name,handler)},net:{fetch:async url=>Response.json(url.endsWith('/api/releases')?{windows:{setup:{available:false}}}:{messages:[]})},Notification:{isSupported:()=>true},app, BrowserWindow, Menu: {setApplicationMenu: () => {}}, shell: {openExternal: () => Promise.resolve()}, ipcMain: {handle: (name, handler) => handlers.set(name, handler)}};
    const filename = path.join(__dirname, '../main.cjs');
    const localRequire = createRequire(filename);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {URL,setTimeout,clearTimeout,__dirname: path.dirname(filename), require: name => name === 'electron' ? electron : localRequire(name)});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(paths.get('userData'), legacy);
    assert.equal(paths.get('sessionData'), legacy);
    assert.equal(window.options.title, 'abbeedo TV');
    assert.ok(window.options.webPreferences.additionalArguments.includes('--abbeedo-language=en'));
    assert.equal(schemes.length,1);assert.equal(schemes[0].scheme,'abbeedo-media');
    assert.equal(schemes[0].privileges.corsEnabled,true);assert.equal(schemes[0].privileges.bypassCSP,undefined);
    assert.equal(typeof mediaHandlers.get('abbeedo-media'),'function');
    const media=mediaHandlers.get('abbeedo-media'),mediaURL='abbeedo-media://stream/'+'a'.repeat(43);
    const browserRequest=new Request(mediaURL,{headers:{origin:'https://www.abbeedo.com'}});
    assert.equal((await (await media(browserRequest)).json()).code,'ORIGIN');
    const foreignRequest=new Request(mediaURL,{headers:{origin:'https://www.abbeedo.com'}});
    Object.defineProperty(foreignRequest,'initiatorOrigin',{value:'https://foreign.example'});
    assert.equal((await (await media(foreignRequest)).json()).code,'ORIGIN');
    const trustedRequest=new Request(mediaURL,{headers:{origin:'https://forged.example'}});
    Object.defineProperty(trustedRequest,'initiatorOrigin',{value:'https://www.abbeedo.com'});
    assert.equal((await (await media(trustedRequest)).json()).code,'MEDIA_TOKEN');
    const handler = handlers.get('abbeedo:presentation-language');
    assert.equal(typeof handler, 'function');
    const accepted = {sender: window.webContents, senderFrame: window.webContents.mainFrame};
    assert.equal((await handler(accepted, 'fr')).ok, false);
    assert.equal((await handler({...accepted, senderFrame: {url: accepted.senderFrame.url}}, 'ar')).ok, false);
    assert.equal((await handler(accepted, '../Cookies')).ok, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(legacy, 'presentation.json'), 'utf8')).language, 'en');
    assert.equal((await handler(accepted, 'ar-SA')).ok, true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(legacy, 'presentation.json'), 'utf8')).language, 'ar');
    assert.equal(fs.readFileSync(path.join(legacy, 'Cookies'), 'utf8'), 'keep-existing-login');
    assert.ok(fs.readdirSync(legacy).includes('Cookies'));
    const getNotifications=handlers.get('abbeedo:notifications-get'),setNotifications=handlers.get('abbeedo:notifications-set');
    assert.equal(getNotifications({...accepted,senderFrame:{url:accepted.senderFrame.url}}).ok,false);
    assert.equal((await setNotifications(accepted,'true')).ok,false);
    assert.equal((await setNotifications(accepted,true)).enabled,true);
    assert.equal(getNotifications(accepted).enabled,true);
    assert.equal((await setNotifications({...accepted,sender:{}},false)).ok,false);
    assert.equal((await setNotifications(accepted,false)).enabled,false);
    const client=handlers.get('abbeedo:client-request');
    assert.equal(typeof client,'function');
    const fixture={op:'auth',account:{mode:'direct',url:'https://media.example/fixture.mp4'}};
    assert.equal((await client({...accepted,sender:{}},fixture)).status,403);
    assert.equal((await client({...accepted,senderFrame:{url:accepted.senderFrame.url}},fixture)).status,403);
    assert.equal((await client(accepted,fixture,'extra')).status,403);
    window.webContents.mainFrame.url='https://www.abbeedo.com/watch.html';
    assert.equal((await client(accepted,fixture)).status,403);
    assert.equal((await (await media(trustedRequest)).json()).code,'ORIGIN');
    window.webContents.mainFrame.url='https://www.abbeedo.com/app';
    const localAuth=await client(accepted,fixture);
    assert.equal(localAuth.status,200);
    assert.equal(JSON.parse(localAuth.body).userInfo.auth,1);
    window.webContents.emit('did-fail-load', {}, -105, 'offline', 'https://example.test', true);
    assert.equal(window.loadedFile.options.query.lang, 'ar');
    assert.equal(path.basename(window.loadedFile.filename), 'error.html');
    app.emit('before-quit');
    await new Promise(resolve=>setImmediate(resolve));
  } finally {fs.rmSync(appData, {recursive: true, force: true});}
});
