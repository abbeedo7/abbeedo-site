'use strict';

const {contextBridge, ipcRenderer} = require('electron');
const argument = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
let updateListener=null;

// Named, bounded capabilities reach main. The renderer cannot choose an IPC
// channel, filesystem path, raw fetch destination or signing key.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('abunasserDesktop', Object.freeze({
    isDesktop: true,
    platform: process.platform,
    version: '1.2.1',
    nativeProvider: true,
    clientRequest: payload => {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !['auth', 'catalog', 'details', 'epg', 'resolve'].includes(payload.op)) return Promise.resolve({status:400,headers:{'content-type':'application/json'},body:'{"code":"OP","error":"Unsupported operation"}'});
      try {if (JSON.stringify(payload).length > 32768) throw new Error();} catch {return Promise.resolve({status:413,headers:{'content-type':'application/json'},body:'{"code":"INPUT_SIZE","error":"Request too large"}'});}
      return ipcRenderer.invoke('abbeedo:client-request', payload);
    },
    language: argument('--abbeedo-language') || 'ar',
    systemLanguage: argument('--abbeedo-system-language') || 'ar',
    nativeAnnouncements: true,
    nativeUpdates: true,
    nativeUpdater: true,
    notificationsEnabled: argument('--abbeedo-notifications') === 'enabled',
    getNotificationsEnabled: () => ipcRenderer.invoke('abbeedo:notifications-get'),
    setNotificationsEnabled: enabled => typeof enabled === 'boolean'
      ? ipcRenderer.invoke('abbeedo:notifications-set', enabled)
      : Promise.resolve({ok:false}),
    getUpdateStatus: () => ipcRenderer.invoke('abbeedo:update-state'),
    checkForUpdates: () => ipcRenderer.invoke('abbeedo:update-check'),
    downloadUpdate: () => ipcRenderer.invoke('abbeedo:update-download'),
    cancelUpdate: () => ipcRenderer.invoke('abbeedo:update-cancel'),
    installUpdate: () => ipcRenderer.invoke('abbeedo:update-install'),
    onUpdateStatus: callback => {
      if(typeof callback!=='function')return ()=>{};
      if(updateListener)ipcRenderer.removeListener('abbeedo:update-status',updateListener);
      const listener=(_event,state)=>{try{callback(state);}catch{}};
      updateListener=listener;ipcRenderer.on('abbeedo:update-status',listener);
      return ()=>{ipcRenderer.removeListener('abbeedo:update-status',listener);if(updateListener===listener)updateListener=null;};
    },
    setLanguage: code => typeof code === 'string' && code.length <= 35
      ? ipcRenderer.invoke('abbeedo:presentation-language', code)
      : Promise.resolve({ok: false}),
  }));
}
