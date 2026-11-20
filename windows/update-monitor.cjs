'use strict';
const fs=require('node:fs');
const path=require('node:path');
const STATE_FILE='desktop-notifications.json';
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const validID=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,150}$/.test(value);
function newer(left,right){
  const parse=v=>typeof v==='string'&&/^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(v)?v.split('.').map(Number):null;
  const a=parse(left),b=parse(right);if(!a||!b)return false;
  for(let n=0;n<Math.max(a.length,b.length);n++){if((a[n]||0)!==(b[n]||0))return (a[n]||0)>(b[n]||0);}return false;
}
function readState(directory){try{const value=JSON.parse(fs.readFileSync(path.join(directory,STATE_FILE),'utf8'));return {enabled:value.enabled===true,seen:Array.isArray(value.seen)?value.seen.filter(validID).slice(-200):[],release:clean(value.release,50)};}catch{return {enabled:false,seen:[],release:''};}}
function createDesktopMonitor({directory,origin,currentVersion,fetcher=globalThis.fetch,notify=()=>{},language=()=> 'ar',intervalMs=60000,now=()=>Date.now()}){
  const base=new URL(origin);if(base.protocol!=='https:'||!['abbeedo.com','www.abbeedo.com'].includes(base.hostname)||base.username||base.password)throw Error('Invalid application update origin');
  const state=readState(directory);let timer=null,active=false,busy=false,controller=null,write=Promise.resolve();
  function persist(){const value=JSON.stringify({enabled:state.enabled,seen:state.seen.slice(-200),release:state.release})+'\n';write=write.catch(()=>{}).then(async()=>{await fs.promises.mkdir(directory,{recursive:true});const destination=path.join(directory,STATE_FILE);await fs.promises.writeFile(destination+'.tmp',value,{mode:0o600});await fs.promises.rename(destination+'.tmp',destination);});return write;}
  async function getJSON(address,signal){const response=await fetcher(address,{cache:'no-store',credentials:'omit',redirect:'error',signal,headers:{Accept:'application/json','User-Agent':'abbeedo-TV-Windows/'+currentVersion}});if(!response.ok||response.redirected)throw Error('Update unavailable');if(Number(response.headers.get('content-length'))>131072)throw Error('Update too large');const reader=response.body?.getReader();if(!reader)throw Error('Empty update');const chunks=[];let total=0;try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>131072)throw Error('Update too large');chunks.push(next.value);}}finally{void reader.cancel().catch(()=>{});}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  async function poll(){
    if(!active||busy||typeof fetcher!=='function')return;busy=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),8000);
    try{
      const results=await Promise.allSettled(['/api/releases','/api/announcements'].map(route=>getJSON(new URL(route,base).href,controller.signal)));
      if(!active)return;
      const release=results[0].status==='fulfilled'?results[0].value:null,setup=release?.windows?.setup;
      if(state.enabled&&setup?.available===true&&setup.url==='/downloads/windows.exe'&&newer(setup.version,currentVersion)&&state.release!==setup.version){
        const en=language()==='en';
        await notify({kind:'update',id:'release-'+setup.version,title:en?'abbeedo TV update available':'تحديث جديد لابوناصر TV',body:(en?'Version ':'الإصدار ')+setup.version+(en?' is ready. Click to download.':' جاهز. اضغط للتحميل.'),url:new URL('/downloads/windows.exe',base).href});
        state.release=setup.version;
      }
      const messages=results[1].status==='fulfilled'&&Array.isArray(results[1].value?.messages)?results[1].value.messages.slice(-30):[];
      let notices=0;
      for(const item of messages){
        if(!validID(item?.id)||state.seen.includes(item.id)||!clean(item.title,160)||!clean(item.body,1000)||Number(item.expiresAt)&&Number(item.expiresAt)<=now())continue;
        if(state.enabled&&notices<3){await notify({kind:'announcement',id:item.id,title:clean(item.title,160),body:clean(item.body,1000)});notices++;}
        state.seen.push(item.id);
      }
      state.seen=state.seen.slice(-200);await persist();
    }catch{}finally{clearTimeout(timeout);controller=null;busy=false;}
  }
  return {
    enabled:()=>state.enabled,
    async setEnabled(enabled){if(typeof enabled!=='boolean')return {ok:false,enabled:state.enabled};state.enabled=enabled;try{await persist();if(enabled)void poll();return {ok:true,enabled};}catch{return {ok:false,enabled:state.enabled};}},
    start(){if(active)return;active=true;timer=setInterval(()=>void poll(),Math.max(30000,intervalMs));timer.unref?.();void poll();},
    stop(){active=false;clearInterval(timer);timer=null;controller?.abort();},
    poll,
    flush:()=>write,
  };
}
module.exports={createDesktopMonitor,newer,readState,STATE_FILE};
