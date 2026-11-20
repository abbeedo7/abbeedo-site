'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {createUpdater,assetURL,redirectURL}=require('../updater.cjs');
const origin='https://www.abbeedo.com',asset='https://github.com/abbeedo7/abbeedo-site/releases/download/v1.3.0/abbeedo-TV-Setup.exe';
const bytes=Buffer.from('MZ owned installer fixture'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
function descriptor(extra={}){return {windows:{setup:{available:true,version:'1.3.0',size:bytes.length,sha256:sha,url:'/downloads/windows.exe',assetUrl:asset,...extra}}};}
test('native installer source is pinned to the exact public repository and named setup asset',()=>{
 assert.equal(assetURL(asset),asset);
 for(const value of [asset.replace('abbeedo7/abbeedo-site','other/repo'),asset.replace('Setup.exe','Portable.exe'),asset+'?url=https://evil.test',asset.replace('https:','http:'),'https://user:secret@github.com/abbeedo7/abbeedo-site/releases/download/v1.3.0/abbeedo-TV-Setup.exe'])assert.equal(assetURL(value),null);
 assert.equal(redirectURL(asset.replace('abbeedo7/abbeedo-site','foreign/repo'),asset),null);
 assert.ok(redirectURL('https://release-assets.githubusercontent.com/owned/token?signature=valid',asset));assert.equal(redirectURL('https://evil.test/payload.exe',asset),null);
});
test('in-app updater streams verified bytes, emits progress and runs only the verified private installer on explicit install',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-updater-')),events=[],launched=[],requests=[];
 const updater=createUpdater({directory,origin,currentVersion:'1.2.0',emit:value=>events.push(value),openInstaller:async file=>{launched.push(file);return '';},fetcher:async url=>{requests.push(url);return url===origin+'/api/releases'?Response.json(descriptor()):new Response(bytes,{headers:{'content-length':String(bytes.length)}});}});
 try{
  const checked=await updater.check();assert.equal(checked.status,'available');assert.equal(launched.length,0);
  const downloading=await updater.startDownload();assert.equal(downloading.status,'downloading');await updater.settled();assert.equal(updater.snapshot().status,'ready');assert.equal(updater.snapshot().progress,1);assert.equal(launched.length,0);
  const result=await updater.install();assert.equal(result.ok,true);assert.equal(result.status,'installing');assert.equal(launched.length,1);assert.equal(path.relative(directory,launched[0]),path.join('updates','1.3.0','abbeedo-TV-Setup.exe'));assert.ok(fs.readFileSync(launched[0]).equals(bytes));
  assert.deepEqual(requests,[origin+'/api/releases',asset]);assert.ok(events.some(state=>state.status==='downloading'));assert.ok(events.every(value=>!JSON.stringify(value).includes(directory)));
 }finally{updater.stop();await updater.settled();fs.rmSync(directory,{recursive:true,force:true});}
});
test('wrong checksums, incomplete bodies and modified cached installers never execute',async()=>{
 for(const corrupt of ['hash','size','modified']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-updater-'));let launches=0;
  const updater=createUpdater({directory,origin,currentVersion:'1.2.0',openInstaller:async()=>{launches++;return '';},fetcher:async url=>url===origin+'/api/releases'?Response.json(descriptor(corrupt==='hash'?{sha256:'0'.repeat(64)}:{})):new Response(corrupt==='size'?bytes.subarray(0,5):bytes)});
  try{
   await updater.check();await updater.startDownload();await updater.settled();
   if(corrupt==='modified'){assert.equal(updater.snapshot().status,'ready');fs.writeFileSync(path.join(directory,'updates/1.3.0/abbeedo-TV-Setup.exe'),Buffer.alloc(bytes.length));assert.equal((await updater.install()).code,'INSTALL_VERIFY');}
   else assert.equal(updater.snapshot().status,'error');
   assert.equal((await updater.install()).ok,false);assert.equal(launches,0);
  }finally{updater.stop();await updater.settled();fs.rmSync(directory,{recursive:true,force:true});}
 }
});
test('an unapproved redirect cannot fetch or run another host',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-updater-')),calls=[];
 const updater=createUpdater({directory,origin,currentVersion:'1.2.0',fetcher:async url=>{calls.push(url);return url===origin+'/api/releases'?Response.json(descriptor()):new Response(null,{status:302,headers:{Location:'https://evil.example/a.exe'}});}});
 try{await updater.check();await updater.startDownload();await updater.settled();assert.equal(updater.snapshot().code,'DOWNLOAD_ORIGIN');assert.equal(calls.length,2);}finally{updater.stop();await updater.settled();fs.rmSync(directory,{recursive:true,force:true});}
});
test('cancel aborts the active transfer and removes partial cache files',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-updater-'));let requested;
 const started=new Promise(resolve=>requested=resolve);
 const updater=createUpdater({directory,origin,currentVersion:'1.2.0',fetcher:async(url,{signal})=>{
  if(url===origin+'/api/releases')return Response.json(descriptor());
  requested();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 }});
 try{await updater.check();await updater.startDownload();await started;updater.cancel();await updater.settled();assert.equal(updater.snapshot().status,'cancelled');assert.equal(fs.existsSync(path.join(directory,'updates/1.3.0/abbeedo-TV-Setup.exe.download')),false);}finally{updater.stop();await updater.settled();fs.rmSync(directory,{recursive:true,force:true});}
});
test('unpublished or foreign metadata is clearly unavailable, not falsely up-to-date',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-updater-'));
 try{for(const response of [new Response('',{status:503}),Response.json(descriptor({assetUrl:'https://github.com/foreign/repo/releases/download/v1.3.0/abbeedo-TV-Setup.exe'}))]){
  const updater=createUpdater({directory,origin,currentVersion:'1.2.0',fetcher:async()=>response});const result=await updater.check();assert.equal(result.ok,false);assert.equal(result.status,'unavailable');assert.equal((await updater.install()).ok,false);
 }}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
