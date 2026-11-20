'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createDesktopMonitor,newer,readState}=require('../update-monitor.cjs');
const origin='https://www.abbeedo.com';
function fixture(){let version='1.3.0',messages=[{id:'message-1',title:'Hello',body:'A new announcement',expiresAt:Date.now()+100000}],calls=[];const fetcher=async(address,options)=>{calls.push({address,options});return Response.json(address.endsWith('/api/releases')?{windows:{setup:{available:true,version,url:'/downloads/windows.exe'}}}:{messages});};return {fetcher,calls,setVersion(value){version=value;},setMessages(value){messages=value;}};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('native release ordering compares numeric versions and rejects malformed display versions',()=>{
 assert.equal(newer('1.10.0','1.9.9'),true);assert.equal(newer('1.2.0','1.2.0'),false);assert.equal(newer('<script>','1.2.0'),false);
});
test('native monitor requires explicit opt-in, reads only fixed own-domain URLs and stores no announcement text',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-monitor-')),feed=fixture(),notices=[];
 const monitor=createDesktopMonitor({directory,origin,currentVersion:'1.2.0',fetcher:feed.fetcher,notify:value=>notices.push(value)});
 try{
  assert.equal(monitor.enabled(),false);monitor.start();await tick();await monitor.flush();assert.equal(notices.length,0);
  assert.deepEqual(feed.calls.map(c=>c.address),[origin+'/api/releases',origin+'/api/announcements']);
  for(const {options}of feed.calls){assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');}
  assert.equal((await monitor.setEnabled('true')).ok,false);
  assert.equal((await monitor.setEnabled(true)).enabled,true);await tick();await monitor.flush();
  assert.equal(notices.length,1);assert.equal(notices[0].kind,'update');assert.equal(notices[0].url,origin+'/downloads/windows.exe');
  feed.setMessages([{id:'message-2',title:'News',body:'Fresh message',expiresAt:Date.now()+100000}]);await monitor.poll();await monitor.poll();
  assert.equal(notices.filter(n=>n.id==='message-2').length,1);
  const saved=fs.readFileSync(path.join(directory,'desktop-notifications.json'),'utf8');assert.ok(!saved.includes('Fresh message')&&!saved.includes('News'));assert.equal(readState(directory).enabled,true);
 }finally{monitor.stop();await monitor.flush();fs.rmSync(directory,{recursive:true,force:true});}
});
test('native opt-out persists across restart and prevents duplicate release/announcement delivery',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-monitor-')),feed=fixture(),notices=[];
 let monitor=createDesktopMonitor({directory,origin,currentVersion:'1.2.0',fetcher:feed.fetcher,notify:value=>notices.push(value)});
 try{
  await monitor.setEnabled(true);monitor.start();await tick();await monitor.flush();assert.equal(notices.length,2);monitor.stop();await monitor.flush();
  monitor=createDesktopMonitor({directory,origin,currentVersion:'1.2.0',fetcher:feed.fetcher,notify:value=>notices.push(value)});monitor.start();await tick();await monitor.flush();assert.equal(notices.length,2);
  await monitor.setEnabled(false);feed.setVersion('1.4.0');feed.setMessages([{id:'message-3',title:'Muted',body:'Must not alert'}]);await monitor.poll();assert.equal(notices.length,2);assert.equal(readState(directory).enabled,false);
 }finally{monitor.stop();await monitor.flush();fs.rmSync(directory,{recursive:true,force:true});}
});
test('foreign update destinations, expired messages and malformed identifiers cannot trigger native actions',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-monitor-')),notices=[];
 const fetcher=async address=>Response.json(address.endsWith('/api/releases')?{windows:{setup:{available:true,version:'9.0.0',url:'https://external.example/a.exe'}}}:{messages:[{id:'../../file',title:'Unsafe',body:'Ignored'},{id:'expired',title:'Past',body:'Ignored',expiresAt:1}]});
 const monitor=createDesktopMonitor({directory,origin,currentVersion:'1.2.0',fetcher,notify:value=>notices.push(value)});
 try{await monitor.setEnabled(true);monitor.start();await tick();await monitor.flush();assert.equal(notices.length,0);}finally{monitor.stop();await monitor.flush();fs.rmSync(directory,{recursive:true,force:true});}
 for(const invalid of ['http://www.abbeedo.com','https://www.abbeedo.com.evil.test','https://user:secret@www.abbeedo.com'])assert.throws(()=>createDesktopMonitor({directory,origin:invalid,currentVersion:'1.2.0'}));
});
test('stopping the native monitor aborts pending network operations without a background process',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'abbeedo-monitor-'));let aborts=0;
 const fetcher=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(new DOMException('Aborted','AbortError'));},{once:true}));
 const monitor=createDesktopMonitor({directory,origin,currentVersion:'1.2.0',fetcher});monitor.start();monitor.stop();await tick();assert.equal(aborts,2);fs.rmSync(directory,{recursive:true,force:true});
});
