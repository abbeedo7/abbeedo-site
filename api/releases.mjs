import releaseConfig from '../release-config.json' with {type:'json'};

// Repository and storage hosts come only from the deployed publisher configuration.
export const ALIASES=Object.freeze({android:'/downloads/android.apk',windows:'/downloads/windows.exe',portable:'/downloads/windows-portable.exe'});
export const ASSET_NAMES=Object.freeze({android:'abbeedo-TV-Android.apk',windows:'abbeedo-TV-Setup.exe',portable:'abbeedo-TV-Portable.exe'});
export const PUBLIC_ORIGIN='https://www.abbeedo.com';
export const NO_CACHE=Object.freeze({'Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
const VERSION=/^\d{1,5}\.\d{1,5}\.\d{1,5}$/,HASH=/^[a-f\d]{64}$/i,TAG=/^[a-z\d][a-z\d._-]{0,99}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const version=value=>typeof value==='string'&&VERSION.test(value)?value:null;
const checksum=value=>typeof value==='string'&&HASH.test(value)?value.toLowerCase():null;

export function configuredSource(input=releaseConfig){
 if(input?.provider==='github'){
  const owner=input.github?.owner,repository=input.github?.repository,tag=input.github?.tag||'latest';
  if(typeof owner!=='string'||!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)||typeof repository!=='string'||!/^[a-z\d_.-]{1,100}$/i.test(repository)||repository==='.'||repository==='..'||!TAG.test(tag))return null;
  return {provider:'github',owner,repository,tag,base:'https://github.com/'+owner+'/'+repository};
 }
 if(input?.provider==='public-blob'){
  try{const url=new URL(input.blob?.manifestUrl);if(url.protocol!=='https:'||url.port||!/^[a-z\d-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/releases.json'))return null;return {provider:'public-blob',manifestUrl:url.href,origin:url.origin};}catch{return null;}
 }
 return null;
}
export function releaseFeedURL(configuration=releaseConfig){
 const source=configuredSource(configuration);if(!source)return null;
 return source.provider==='github'?source.base+'/releases/'+(source.tag==='latest'?'latest/download/':'download/'+source.tag+'/')+'releases.json':source.manifestUrl;
}
function githubManifestTag(url,source){
 if(url.origin!=='https://github.com'||url.username||url.password||url.search||url.hash)return null;
 const prefix='/'+source.owner+'/'+source.repository+'/releases/download/';
 if(!url.pathname.toLowerCase().startsWith(prefix.toLowerCase())||!url.pathname.endsWith('/releases.json'))return null;
 const tag=url.pathname.slice(prefix.length,-'/releases.json'.length);
 return TAG.test(tag)?tag:null;
}
function allowedManifestURL(url,source,initial){
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash)return false;
 if(source.provider==='public-blob')return url.href===source.manifestUrl;
 if(url.href===initial)return true;
 const tag=githubManifestTag(url,source);if(tag)return source.tag==='latest'||tag===source.tag;
 return ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname)&&url.pathname.startsWith('/github-production-release-asset');
}
async function responseJSON(response){
 if(!response.ok||response.redirected||!/^application\/(?:[a-z\d.+-]*\+)?json(?:\s*;|\s*$)|^application\/octet-stream(?:\s*;|\s*$)/i.test(response.headers.get('content-type')||''))throw Error('Invalid release manifest response');
 const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>131072)throw Error('Release manifest too large');
 if(!response.body)throw Error('Empty release manifest');
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.byteLength;if(count>131072)throw Error('Release manifest too large');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(count);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!plain(value)||value.schemaVersion!==1)throw Error('Invalid release manifest');return value;
}
export async function readFeed(url,{configuration=releaseConfig,fetcher=globalThis.fetch,timeoutMs=6000}={}){
 const source=configuredSource(configuration),initial=releaseFeedURL(configuration);
 if(!source||url!==initial)throw Error('Invalid release source');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let current=new URL(initial),observedTag=null;
 try{
  for(let redirects=0;redirects<=4;redirects++){
   if(!allowedManifestURL(current,source,initial))throw Error('Untrusted release redirect');
   const tag=source.provider==='github'?githubManifestTag(current,source):null;if(tag)observedTag=tag;
   const response=await fetcher(current.href,{headers:{Accept:'application/json, application/octet-stream','User-Agent':'abbeedo-TV/1.2','Cache-Control':'no-cache'},cache:'no-store',redirect:'manual',signal:controller.signal});
   if([301,302,303,307,308].includes(response.status)){
    const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});if(!location||redirects===4)throw Error('Invalid release redirect');current=new URL(location,current);continue;
   }
   const manifest=await responseJSON(response);
   if(source.provider==='github'&&(!TAG.test(manifest.tag||'')||observedTag&&manifest.tag!==observedTag||source.tag!=='latest'&&manifest.tag!==source.tag))throw Error('Release tag mismatch');
   return {manifest,source};
  }
  throw Error('Too many release redirects');
 }finally{clearTimeout(timer);}
}
function binaryTarget(row,id,manifest,source){
 if(!plain(row)||row.filename!==ASSET_NAMES[id]||!Number.isSafeInteger(row.size)||row.size<=0||row.size>2147483648||!checksum(row.sha256))return null;
 if(source.provider==='github'){
  const expected=source.base+'/releases/download/'+manifest.tag+'/'+ASSET_NAMES[id];
  if(row.url!==undefined&&row.url!==expected)return null;return expected;
 }
 try{const target=new URL(row.url);if(target.origin!==source.origin||target.protocol!=='https:'||target.username||target.password||target.search||target.hash||!target.pathname.endsWith('/'+ASSET_NAMES[id]))return null;return target.href;}catch{return null;}
}
function emptyData(now,configurationRequired=false){
 return {app:'ابوناصر TV',name:'abbeedo TV',checkedAt:now().toISOString(),configurationRequired,webVersion:null,
  android:{available:false,version:null,versionCode:null,url:ALIASES.android,size:null,sha256:null,notes:''},
  windows:{setup:{available:false,version:null,url:ALIASES.windows,size:null,sha256:null,assetUrl:null},portable:{available:false,version:null,url:ALIASES.portable,size:null,sha256:null,assetUrl:null}}};
}
export async function loadReleases({configuration=releaseConfig,fetcher=globalThis.fetch,timeoutMs=6000,now=()=>new Date()}={}){
 const data=emptyData(now,!configuredSource(configuration)),targets={android:null,windows:null,portable:null};
 if(data.configurationRequired)return {data:{...data,code:'RELEASE_CONFIG'},targets,status:503};
 try{
  const {manifest,source}=await readFeed(releaseFeedURL(configuration),{configuration,fetcher,timeoutMs});
  data.webVersion=version(manifest.webVersion);
  const av=version(manifest.android?.version),code=manifest.android?.versionCode;
  if(av&&Number.isSafeInteger(code)&&code>0)targets.android=binaryTarget(manifest.android,'android',manifest,source);
  data.android={...data.android,version:av,versionCode:Number.isSafeInteger(code)&&code>0?code:null,notes:typeof manifest.android?.notes==='string'?manifest.android.notes.slice(0,1500):'',...(targets.android?{available:true,size:manifest.android.size,sha256:checksum(manifest.android.sha256)}:{})};
  const wv=version(manifest.windows?.version);
  for(const [id,key]of [['windows','setup'],['portable','portable']]){
   if(wv)targets[id]=binaryTarget(manifest.windows?.[key],id,manifest,source);
   data.windows[key]={...data.windows[key],version:wv,...(targets[id]?{available:true,size:manifest.windows[key].size,sha256:checksum(manifest.windows[key].sha256),assetUrl:targets[id]}:{})};
  }
 }catch{data.code='RELEASE_UNAVAILABLE';}
 return {data,targets,status:Object.values(targets).some(Boolean)?200:503};
}
export function sendJSON(res,status,data,{head=false,headers={}}={}){
 const body=JSON.stringify(data);res.statusCode=status;
 for(const [key,value]of Object.entries({...NO_CACHE,'Content-Type':'application/json; charset=utf-8',...headers}))res.setHeader(key,value);
 res.end(head?undefined:body);
}
export function createReleasesHandler(options={}){
 return async(req,res)=>{
  if(req.method==='OPTIONS'){res.statusCode=204;for(const [key,value]of Object.entries({...NO_CACHE,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS'}))res.setHeader(key,value);res.end();return;}
  if(!['GET','HEAD'].includes(req.method))return sendJSON(res,405,{error:'طريقة الطلب غير مدعومة.',code:'METHOD'},{headers:{Allow:'GET, HEAD, OPTIONS'}});
  let address;try{address=new URL(req.url||'/api/releases',PUBLIC_ORIGIN);}catch{return sendJSON(res,400,{error:'مسار الطلب غير صالح.',code:'RELEASE_FORMAT'},{head:req.method==='HEAD'});}
  const format=address.searchParams.getAll('format'),android=address.pathname==='/updates.json'||format.length>0;
  if(android&&(format.length>1||format.length===1&&format[0]!=='android'||[...address.searchParams.keys()].some(key=>key!=='format')))return sendJSON(res,400,{error:'صيغة الطلب غير صالحة.',code:'RELEASE_FORMAT'},{head:req.method==='HEAD'});
  const release=await loadReleases(options),headers={'Access-Control-Allow-Origin':'*'},head=req.method==='HEAD';
  if(android){
   if(!release.targets.android)return sendJSON(res,503,{error:'تحديث أندرويد غير متاح مؤقتًا.',code:'DOWNLOAD_UNAVAILABLE'},{head,headers});
   const row=release.data.android;return sendJSON(res,200,{versionCode:row.versionCode,versionName:row.version,downloadUrl:PUBLIC_ORIGIN+ALIASES.android,sha256:row.sha256,notes:row.notes},{head,headers});
  }
  return sendJSON(res,release.status,release.data,{head,headers});
 };
}
export default createReleasesHandler();
