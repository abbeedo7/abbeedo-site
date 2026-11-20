'use strict';

const path = require('node:path');
const fs = require('node:fs');
const {spawn}=require('node:child_process');
const {pathToFileURL} = require('node:url');
const {app, BrowserWindow, Menu, shell, ipcMain, screen, net, Notification} = require('electron');
const {createPolicy, windowPreferences, isUserActivation, canSetLanguage} = require('./security.cjs');
const {APP_ID, legacyProfilePath, normalizeLanguage, chooseLanguage, appName, readLanguage, writeLanguage} = require('./presentation.cjs');
const {fitWindow,readWindowState,writeWindowState}=require('./window-state.cjs');
const {createDesktopMonitor}=require('./update-monitor.cjs');
const {createUpdater}=require('./updater.cjs');
const config = require('./app-config.json');
const policy = createPolicy(config.appURL);
const supportedLanguages = config.supportedLanguages || ['ar', 'en'];

// Keep the established profile when the visible product name changes. This
// preserves accounts, IndexedDB, cookies and preferences from version 1.0.
const profileDirectory = legacyProfilePath(app.getPath('appData'));
fs.mkdirSync(profileDirectory, {recursive: true});
app.setPath('userData', profileDirectory);
app.setPath('sessionData', profileDirectory);
app.setName('abbeedo TV');

let window;
let lastUserInput = 0;
let selectedLanguage = 'ar';
let systemLanguage = 'ar';
let languageWrite = Promise.resolve();
let desktopMonitor=null;
let updater=null;
let boundsTimer=null;
const activeNotifications=new Set();
const userActed = () => Date.now() - lastUserInput < 1500;
const localErrorURL = pathToFileURL(path.join(__dirname, 'error.html')).href;

ipcMain.handle('abbeedo:presentation-language', async (event, code) => {
  if (!window || !canSetLanguage(event, window.webContents, policy)) return {ok: false};
  const language = normalizeLanguage(code, supportedLanguages);
  if (!language) return {ok: false};
  // Serialize this one fixed preference file; the renderer never supplies a
  // filename, account information, shell command or arbitrary IPC channel.
  const update = languageWrite.catch(() => {}).then(async () => {
    if (selectedLanguage !== language || readLanguage(profileDirectory, supportedLanguages) !== language) {
      await writeLanguage(profileDirectory, language, supportedLanguages);
    }
    selectedLanguage = language;
    return {ok: true, language};
  });
  languageWrite = update;
  try { return await update; } catch { return {ok: false}; }
});
ipcMain.handle('abbeedo:notifications-get',event=>{
  if(!window||!canSetLanguage(event,window.webContents,policy)||!desktopMonitor)return {ok:false};
  return {ok:true,enabled:desktopMonitor.enabled(),supported:typeof Notification?.isSupported==='function'&&Notification.isSupported()};
});
ipcMain.handle('abbeedo:notifications-set',async(event,enabled)=>{
  if(typeof enabled!=='boolean'||!window||!canSetLanguage(event,window.webContents,policy)||!desktopMonitor)return {ok:false};
  if(enabled&&!Notification?.isSupported?.())return {ok:false,enabled:desktopMonitor.enabled(),supported:false};
  return desktopMonitor.setEnabled(enabled);
});
const trustedUpdaterEvent=event=>Boolean(window&&canSetLanguage(event,window.webContents,policy)&&updater);
for(const [channel,method]of [['abbeedo:update-check','check'],['abbeedo:update-download','startDownload'],['abbeedo:update-cancel','cancel'],['abbeedo:update-install','install']]){
  ipcMain.handle(channel,async(event,...args)=>trustedUpdaterEvent(event)&&args.length===0&&(method!=='install'||userActed())?updater[method]():{ok:false,code:'NOT_ALLOWED'});
}
ipcMain.handle('abbeedo:update-state',(event,...args)=>trustedUpdaterEvent(event)&&args.length===0?updater.snapshot():{ok:false,code:'NOT_ALLOWED'});
function emitUpdater(state){if(window&&policy.trusted(window.webContents.getURL())&&typeof window.webContents.send==='function')window.webContents.send('abbeedo:update-status',state);}

function externalFromUser(value) {
  if (!policy.external(value) || !userActed()) return;
  shell.openExternal(value).catch(() => {});
}

function createWindow() {
  const area=screen?.getPrimaryDisplay?.().workArea||{x:0,y:0,width:1920,height:1080};
  const displays=screen?.getAllDisplays?.().map(display=>display.workArea)||[area];
  const bounds=fitWindow({area,displays,saved:readWindowState(profileDirectory)});
  window = new BrowserWindow({
    ...bounds,
    backgroundColor: '#0a1018',
    title: appName(selectedLanguage),
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...windowPreferences(path.join(__dirname, 'preload.cjs')),
      additionalArguments: ['--abbeedo-language=' + selectedLanguage, '--abbeedo-system-language=' + systemLanguage,'--abbeedo-notifications='+(desktopMonitor?.enabled()?'enabled':'disabled')],
    },
  });
  const contents = window.webContents;
  contents.on('before-input-event', (_event, input) => {
    if (isUserActivation(input.type)) lastUserInput = Date.now();
  });
  contents.on('before-mouse-event', (_event, input) => {
    if (isUserActivation(input.type)) lastUserInput = Date.now();
  });
  contents.setWindowOpenHandler(({url}) => {
    externalFromUser(url);
    return {action: 'deny'};
  });
  contents.on('will-navigate', (event, url) => {
    if (policy.trusted(url)) return;
    event.preventDefault();
    externalFromUser(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (!policy.redirect(url)) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(webContents === contents && policy.permission(details?.requestingUrl || webContents.getURL(), permission));
  });
  contents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return webContents === contents && policy.permission(requestingOrigin || details?.requestingUrl || webContents.getURL(), permission);
  });
  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && contents.getURL().split('?')[0] !== localErrorURL) {
      window.loadFile(path.join(__dirname, 'error.html'), {query: {lang: selectedLanguage}}).catch(() => {});
    }
  });
  window.once('ready-to-show', () => window.show());
  const saveBounds=()=>{if(window&&typeof window.getNormalBounds==='function')try{writeWindowState(profileDirectory,window.getNormalBounds());}catch{}};
  const queueBounds=()=>{clearTimeout(boundsTimer);boundsTimer=setTimeout(saveBounds,500);boundsTimer.unref?.();};
  window.on('resize',queueBounds);window.on('move',queueBounds);
  window.on('close',()=>{clearTimeout(boundsTimer);saveBounds();desktopMonitor?.stop();updater?.stop();});
  window.on('closed', () => { window = null; });
  window.loadURL(policy.appURL).catch(() => {});
}

function nativeNotice(message){
  if(!Notification?.isSupported?.())return;
  const notice=new Notification({title:message.title,body:message.body,icon:path.join(__dirname,'assets/icon.png'),silent:false});
  activeNotifications.add(notice);
  notice.once('close',()=>activeNotifications.delete(notice));
  notice.once('failed',()=>activeNotifications.delete(notice));
  notice.once('click',()=>{
    activeNotifications.delete(notice);
    if(window){if(window.isMinimized())window.restore();window.show();window.focus();}
    if(message.kind==='update')updater?.check().then(state=>emitUpdater({...state,open:true})).catch(()=>{});
  });
  notice.show();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.whenReady().then(() => {
    systemLanguage = normalizeLanguage(app.getLocale(), supportedLanguages) || 'ar';
    selectedLanguage = chooseLanguage({saved: readLanguage(profileDirectory, supportedLanguages), locale: systemLanguage, supported: supportedLanguages});
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);
    desktopMonitor=createDesktopMonitor({directory:profileDirectory,origin:policy.origin,currentVersion:require('./package.json').version,fetcher:net?.fetch?.bind(net)||globalThis.fetch,language:()=>selectedLanguage,notify:nativeNotice});
    updater=createUpdater({directory:profileDirectory,origin:policy.origin,currentVersion:require('./package.json').version,fetcher:net?.fetch?.bind(net)||globalThis.fetch,emit:emitUpdater,openInstaller:async file=>{
      const result=await new Promise(resolve=>{const child=spawn(file,['--updated','/LANG='+(selectedLanguage==='en'?'1033':'1025'),'/ABBEEDOLANG='+selectedLanguage],{detached:true,stdio:'ignore',windowsHide:false});child.once('error',()=>resolve('INSTALL_FAILED'));child.once('spawn',()=>{child.unref();resolve('');});});
      if(!result){const timer=setTimeout(()=>app.quit(),700);timer.unref?.();}return result;
    }});
    createWindow();
    desktopMonitor.start();
  });
  app.on('before-quit',()=>{desktopMonitor?.stop();updater?.stop();clearTimeout(boundsTimer);});
  app.on('window-all-closed', () => app.quit());
}
