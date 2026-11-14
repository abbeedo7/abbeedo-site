// The public website follows the publisher's fixed release feeds. No client URL
// or runtime secret can change the upstream hosts.
export const ANDROID_ORIGIN = 'https://abbeedo-player.m05871268.chatgpt.site';
export const DESKTOP_ORIGIN = 'https://abunasser-apple-web.m05871268.chatgpt.site';
export const FEEDS = Object.freeze({android:ANDROID_ORIGIN+'/updates.json',windows:DESKTOP_ORIGIN+'/api/releases',version:DESKTOP_ORIGIN+'/version.json'});
export const ALIASES = Object.freeze({android:'/downloads/android.apk',windows:'/downloads/windows.exe',portable:'/downloads/windows-portable.exe'});
export const NO_CACHE = Object.freeze({'Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
const VERSION=/^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const HASH=/^[a-f\d]{64}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const version=value=>typeof value==='string'&&VERSION.test(value)?value:null;
const checksum=value=>typeof value==='string'&&HASH.test(value)?value.toLowerCase():null;
function binaryURL(value,origin,path){try{const url=new URL(value,origin);return url.origin===origin&&url.pathname===path&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:null;}catch{return null;}}

export async function readFeed(url,{fetcher=globalThis.fetch,timeoutMs=4500}={}){
  if(!Object.values(FEEDS).includes(url))throw Error('Invalid release source');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  let reader;
  try{
    const response=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'ABBEEDO/1.0'},cache:'no-store',redirect:'error',signal:controller.signal});
    if(!response.ok||response.redirected)throw Error('Release source unavailable');
    if(!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|\s*$)/i.test(response.headers.get('content-type')||''))throw Error('Invalid release response');
    const declared=Number(response.headers.get('content-length'));
    if(Number.isFinite(declared)&&declared>65536)throw Error('Release response too large');
    if(!response.body)throw Error('Empty release response');
    reader=response.body.getReader();const chunks=[];let size=0;
    for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536)throw Error('Release response too large');chunks.push(next.value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!plain(data))throw Error('Invalid release record');return data;
  }finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});}
}

export async function loadReleases({fetcher=globalThis.fetch,timeoutMs=4500,now=()=>new Date()}={}){
  const results=await Promise.allSettled(Object.values(FEEDS).map(url=>readFeed(url,{fetcher,timeoutMs})));
  const [apk,desktop,web]=results.map(result=>result.status==='fulfilled'?result.value:null);
  const targets={android:null,windows:null,portable:null};
  const av=version(apk?.versionName),ac=apk?.versionCode,ah=checksum(apk?.sha256);
  if(av&&Number.isSafeInteger(ac)&&ac>0&&ah)targets.android=binaryURL(apk.downloadUrl,ANDROID_ORIGIN,'/abbeedo-'+av+'.apk');
  const windowsVersion=version(web?.windows?.version)||version(web?.version);
  const makeWindows=(id,key,path)=>{
    const row=desktop?.windows?.[key];
    if(plain(row)&&row.available===true&&Number.isSafeInteger(row.size)&&row.size>0&&row.size<=2147483648&&checksum(row.sha256))targets[id]=binaryURL(row.url||row.path,DESKTOP_ORIGIN,path);
    return {available:!!targets[id],version:windowsVersion,url:ALIASES[id],size:targets[id]?row.size:null,sha256:targets[id]?checksum(row.sha256):null};
  };
  const data={app:'ابوناصر TV',name:'abbeedo TV',checkedAt:now().toISOString(),webVersion:version(web?.version),android:{available:!!targets.android,version:av,versionCode:Number.isSafeInteger(ac)&&ac>0?ac:null,url:ALIASES.android,sha256:targets.android?ah:null},windows:{setup:makeWindows('windows','setup','/downloads/windows/setup.exe'),portable:makeWindows('portable','portable','/downloads/windows/portable.exe')}};
  return {data,targets,status:Object.values(targets).some(Boolean)?200:503};
}

export function sendJSON(res,status,data,{head=false,headers={}}={}){
  const body=JSON.stringify(data);res.statusCode=status;
  for(const [key,value]of Object.entries({...NO_CACHE,'Content-Type':'application/json; charset=utf-8',...headers}))res.setHeader(key,value);
  if(head)res.end();else res.end(body);
}
export function createReleasesHandler(options={}){
  return async(req,res)=>{
    if(req.method==='OPTIONS'){res.statusCode=204;for(const [key,value]of Object.entries({...NO_CACHE,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}))res.setHeader(key,value);res.end();return;}
    if(!['GET','HEAD'].includes(req.method))return sendJSON(res,405,{error:'طريقة الطلب غير مدعومة.',code:'METHOD'},{headers:{Allow:'GET, HEAD, OPTIONS'}});
    try{const release=await loadReleases(options);return sendJSON(res,release.status,release.data,{head:req.method==='HEAD',headers:{'Access-Control-Allow-Origin':'*'}});}
    catch{return sendJSON(res,503,{error:'تعذر التحقق من التنزيلات الآن. حاول مجددًا بعد قليل.',code:'RELEASE_UNAVAILABLE'},{head:req.method==='HEAD'});}
  };
}
export default createReleasesHandler();
