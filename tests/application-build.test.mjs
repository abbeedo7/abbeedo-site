import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {buildApplication,applicationServiceWorker} from '../scripts/build-application.mjs';

const projectRoot=path.resolve(import.meta.dirname,'..');

test('combined application build preserves storefront, PWA identity, required assets and isolated streaming backend',async()=>{
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'abbeedo-app-build-'));
  try{
    await fs.mkdir(path.join(output,'static'),{recursive:true});await fs.writeFile(path.join(output,'static/index.html'),'owned storefront');
    const result=await buildApplication({projectRoot,outputRoot:output});
    assert.equal(await fs.readFile(path.join(output,'static/index.html'),'utf8'),'owned storefront');
    assert.ok((await fs.readFile(path.join(output,'static/app.html'),'utf8')).includes('id="app-shell"'));
    for(const name of ['manifest.webmanifest','manifest.en.webmanifest']){const manifest=JSON.parse(await fs.readFile(path.join(output,'static',name),'utf8'));assert.equal(manifest.id,'/app');assert.equal(manifest.scope,'/app');assert.equal(manifest.start_url,'/app?source=installed');}
    assert.ok(result.shell.includes('/app.html'));assert.ok(!result.shell.includes('/index.html'));assert.ok(!result.shell.includes('/version.json'));
    const sw=await fs.readFile(path.join(output,'static/sw.js'),'utf8');assert.match(sw,/abunasser-offline-v1/);assert.ok(!sw.includes('indexedDB.deleteDatabase'));
    const config=JSON.parse(await fs.readFile(path.join(result.functionDir,'.vc-config.json'),'utf8'));assert.equal(config.maxDuration,300);assert.equal(config.supportsResponseStreaming,true);
    const api=await fs.readFile(path.join(result.functionDir,'index.mjs'),'utf8');assert.ok(api.includes('BLOB_READ_WRITE_TOKEN'));assert.ok(api.includes('pipeline'));
    const front=await fs.readFile(path.join(output,'static/app.html'),'utf8');assert.ok(!front.includes('BLOB_READ_WRITE_TOKEN'));
    assert.ok((await fs.readFile(path.join(output,'static/app/entry.js'),'utf8')).includes("new URL('/app',location.href).href"));
    for(const target of ['/downloads/android.apk','/downloads/windows.exe','/downloads/windows-portable.exe'])assert.ok(front.includes('href="'+target+'"'));
    const distribution=await fs.readFile(path.join(output,'static/app/distribution.js'),'utf8');assert.ok(distribution.includes('globalThis.location?.origin'));assert.ok(distribution.includes("'/api/releases'"));assert.ok(!distribution.includes('abbeedo-3.9.3.apk'));
  }finally{await fs.rm(output,{recursive:true,force:true});}
});

function worker(){const listeners=new Map(),calls=[];vm.runInNewContext(applicationServiceWorker({cache:'abunasser-apple-web-1-owned',shell:['/app.html','/app/entry.js']}),{self:{location:{origin:'https://abbeedo.com'},clients:{claim:async()=>{}},addEventListener:(name,listener)=>listeners.set(name,listener)},URL,fetch:async()=>{throw Error('offline')},caches:{match:async(url,options)=>{calls.push({url,options});return 'owned cached app';}}});return {listeners,calls};}
test('offline application navigation matches only exact app routes and the old installed query',async()=>{
  for(const route of ['/app','/app/','/app.html','/open','/?source=installed']){const w=worker();let response;w.listeners.get('fetch')({request:{method:'GET',url:'https://abbeedo.com'+route,mode:'navigate',headers:new Headers()},respondWith(value){response=value;}});assert.equal(await response,'owned cached app');assert.equal(w.calls[0].url,'/app.html');}
});
test('storefront pages, live release metadata, APIs and range requests never fall back to cached application HTML',()=>{
  for(const [route,mode,headers]of [['/','navigate',{}],['/apps','navigate',{}],['/apps?source=installed','navigate',{}],['/site-version.json','cors',{}],['/version.json','cors',{}],['/api/client','cors',{}],['/app/entry.js','cors',{range:'bytes=0-10'}]]){const w=worker();let intercepted=false;w.listeners.get('fetch')({request:{method:'GET',url:'https://abbeedo.com'+route,mode,headers:new Headers(headers)},respondWith(){intercepted=true;}});assert.equal(intercepted,false,route);}
});
test('activation removes obsolete app shell caches while retaining offline media and unrelated site caches',async()=>{
  const listeners=new Map(),removed=[];let done;vm.runInNewContext(applicationServiceWorker({cache:'abunasser-apple-web-1-current',shell:[]}),{self:{addEventListener:(name,listener)=>listeners.set(name,listener),clients:{claim:async()=>{}}},caches:{keys:async()=>['abunasser-apple-web-1-old','abunasser-apple-web-1-current','abunasser-offline-v1','another-site-cache'],delete:async name=>removed.push(name)}});listeners.get('activate')({waitUntil(value){done=value;}});await done;assert.deepEqual(removed,['abunasser-apple-web-1-old']);
});

test('notification clicks keep website and app windows separate without interrupting app playback',async()=>{
 const source=await fs.readFile(path.join(projectRoot,'application/scripts/offline-service-worker.js'),'utf8');
 for(const [target,clients,expected] of [
  ['/app',[['site','/'],['app','/app']],'app'],
  ['/apps',[['app','/app'],['site','/']],'site'],
  ['/app',[['site','/']],'open:/app'],
  ['https://external.invalid/path',[['site','/'],['app','/app']],'app']
 ]){
  const handlers=new Map(),calls=[];let done;
  vm.runInNewContext(source,{URL,Headers,Response,ReadableStream,self:{location:{origin:'https://www.abbeedo.com'},addEventListener:(name,listener)=>handlers.set(name,listener),clients:{matchAll:async()=>clients.map(([id,url])=>({url:'https://www.abbeedo.com'+url,focus:async()=>calls.push(id)})),openWindow:async href=>calls.push('open:'+new URL(href).pathname)}}});
  handlers.get('notificationclick')({notification:{data:{url:target},close(){}},waitUntil(value){done=value}});await done;assert.deepEqual(calls,[expected]);
 }
});
