'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {newer}=require('./update-monitor.cjs');
const REPOSITORY='/abbeedo7/abbeedo-site/releases/download/';
const ASSET_NAME='abbeedo-TV-Setup.exe';
const CDN_HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com']);
function assetURL(value){
  try{const url=new URL(value),parts=url.pathname.slice(REPOSITORY.length).split('/');return url.origin==='https://github.com'&&url.pathname.startsWith(REPOSITORY)&&parts.length===2&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(parts[0])&&parts[1]===ASSET_NAME&&!url.search&&!url.hash&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function redirectURL(value,base){try{const url=new URL(value,base);if(url.hostname==='github.com')return assetURL(url.href);return url.protocol==='https:'&&CDN_HOSTS.has(url.hostname)&&(!url.port||url.port==='443')&&!url.username&&!url.password&&!url.hash?url.href:null;}catch{return null;}}
async function readJSON(response){
  if(!response.ok||response.redirected||Number(response.headers.get('content-length'))>131072)throw Error('CHECK_UNAVAILABLE');
  const reader=response.body?.getReader();if(!reader)throw Error('CHECK_UNAVAILABLE');
  const chunks=[];let length=0;try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>131072)throw Error('CHECK_UNAVAILABLE');chunks.push(next.value);}}finally{void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function createUpdater({directory,origin='https://www.abbeedo.com',currentVersion,fetcher=globalThis.fetch,emit=()=>{},openInstaller=async()=>'',now=()=>Date.now()}){
  const host=new URL(origin);if(host.origin!=='https://www.abbeedo.com')throw Error('Invalid update origin');
  let state={status:'idle',installedVersion:currentVersion,version:null,received:0,total:0,progress:0},offer=null,checking=null,checkAbort=null,task=null,abort=null,installer=null,checkedAt=0;
  const snapshot=()=>({...state});
  const publish=patch=>{state={...state,...patch};try{emit(snapshot());}catch{}return snapshot();};
  const result=(ok=true)=>({ok,...snapshot()});
  const apiURL=new URL('/api/releases',host).href;
  async function check(){
    if(task||state.status==='ready'||state.status==='installing')return result(true);
    if(checking)return checking;
    publish({status:'checking',code:undefined});
    checking=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);checkAbort=controller;
      try{
        const data=await readJSON(await fetcher(apiURL,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal,headers:{Accept:'application/json','User-Agent':'abbeedo-TV-Windows/'+currentVersion}}));
        const setup=data?.windows?.setup,url=assetURL(setup?.assetUrl);
        if(setup?.available!==true||!url||!Number.isSafeInteger(setup.size)||setup.size<=0||setup.size>512*1024*1024||!/^[a-f0-9]{64}$/i.test(setup.sha256||'')||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(setup.version||''))throw Error('CHECK_UNAVAILABLE');
        checkedAt=now();offer={version:setup.version,size:setup.size,sha256:setup.sha256.toLowerCase(),url};
        publish({status:newer(setup.version,currentVersion)?'available':'current',version:setup.version,total:setup.size,received:0,progress:0,code:undefined});return result();
      }catch{offer=null;publish({status:'unavailable',code:'CHECK_UNAVAILABLE'});return result(false);}
      finally{clearTimeout(timer);checking=null;checkAbort=null;}
    })();return checking;
  }
  async function source(url,signal){
    let current=url;
    for(let redirects=0;redirects<=4;redirects++){
      const response=await fetcher(current,{cache:'no-store',credentials:'omit',redirect:'manual',signal,headers:{Accept:'application/octet-stream','User-Agent':'abbeedo-TV-Windows/'+currentVersion}});
      if([301,302,303,307,308].includes(response.status)){
        const next=redirectURL(response.headers.get('location')||'',current);void response.body?.cancel().catch(()=>{});if(!next)throw Error('DOWNLOAD_ORIGIN');current=next;continue;
      }
      if(response.status!==200||response.redirected||!response.body)throw Error('DOWNLOAD_NETWORK');
      return response;
    }throw Error('DOWNLOAD_ORIGIN');
  }
  async function startDownload(){
    if(task||state.status==='ready')return result();
    if(!offer||now()-checkedAt>300000){const checked=await check();if(!checked.ok)return checked;}
    if(!offer||!newer(offer.version,currentVersion))return result(false);
    const selected={...offer},versionDirectory=path.join(directory,'updates',selected.version),temporary=path.join(versionDirectory,ASSET_NAME+'.download'),destination=path.join(versionDirectory,ASSET_NAME);
    abort=new AbortController();const controller=abort;publish({status:'downloading',version:selected.version,received:0,total:selected.size,progress:0,code:undefined});
    task=(async()=>{
      let handle,reader;const timer=setTimeout(()=>controller.abort(),20*60*1000);
      try{
        await fs.promises.mkdir(versionDirectory,{recursive:true});await fs.promises.rm(temporary,{force:true});
        const response=await source(selected.url,controller.signal),length=response.headers.get('content-length');
        if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==selected.size))throw Error('DOWNLOAD_SIZE');
        handle=await fs.promises.open(temporary,'wx',0o600);reader=response.body.getReader();const hash=crypto.createHash('sha256');let received=0,lastEmit=0;
        for(;;){
          const next=await reader.read();if(next.done)break;if(controller.signal.aborted)throw Error('CANCELLED');
          received+=next.value.byteLength;if(received>selected.size)throw Error('DOWNLOAD_SIZE');hash.update(next.value);
          let offset=0;while(offset<next.value.byteLength){const written=await handle.write(next.value,offset,next.value.byteLength-offset);if(!written.bytesWritten)throw Error('DOWNLOAD_WRITE');offset+=written.bytesWritten;}
          if(now()-lastEmit>=150){publish({received,progress:received/selected.size});lastEmit=now();}
        }
        await handle.close();handle=null;
        if(received!==selected.size)throw Error('DOWNLOAD_SIZE');
        if(hash.digest('hex')!==selected.sha256)throw Error('DOWNLOAD_HASH');
        const prefix=await fs.promises.open(temporary,'r');try{const head=Buffer.alloc(2);await prefix.read(head,0,2,0);if(head.toString('ascii')!=='MZ')throw Error('DOWNLOAD_FORMAT');}finally{await prefix.close();}
        if(controller.signal.aborted)throw Error('CANCELLED');
        await fs.promises.rm(destination,{force:true});await fs.promises.rename(temporary,destination);installer={path:destination,...selected};
        publish({status:'ready',received,total:selected.size,progress:1,code:undefined});
      }catch(error){
        await handle?.close().catch(()=>{});await fs.promises.rm(temporary,{force:true}).catch(()=>{});installer=null;
        const cancelled=controller.signal.aborted||error?.message==='CANCELLED';publish({status:cancelled?'cancelled':'error',code:cancelled?'CANCELLED':/^DOWNLOAD_[A-Z]+$/.test(error?.message||'')?error.message:'DOWNLOAD_NETWORK'});
      }finally{clearTimeout(timer);void reader?.cancel().catch(()=>{});if(abort===controller)abort=null;task=null;}
    })();return result();
  }
  function cancel(){if(state.status==='downloading')abort?.abort();return result();}
  async function install(){
    if(state.status!=='ready'||!installer||task)return result(false);
    publish({status:'installing',code:undefined});
    try{
      const stat=await fs.promises.lstat(installer.path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==installer.size)throw Error('INSTALL_VERIFY');
      const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(installer.path))hash.update(chunk);
      if(hash.digest('hex')!==installer.sha256)throw Error('INSTALL_VERIFY');
      const failed=await openInstaller(installer.path);if(typeof failed==='string'&&failed)throw Error('INSTALL_FAILED');
      return result();
    }catch(error){publish({status:'error',code:error?.message==='INSTALL_VERIFY'?'INSTALL_VERIFY':'INSTALL_FAILED'});return result(false);}
  }
  return {snapshot,check,startDownload,cancel,install,stop:()=>{abort?.abort();checkAbort?.abort();},settled:()=>task||Promise.resolve()};
}
module.exports={createUpdater,assetURL,redirectURL,ASSET_NAME};
