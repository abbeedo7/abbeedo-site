import {loadReleases,sendJSON,NO_CACHE,configuredSource,ASSET_NAMES} from './releases.mjs';

const PATH_FILES=Object.freeze({'/downloads/android.apk':'android','/downloads/windows.exe':'windows','/downloads/windows-portable.exe':'portable'});
export function requestedFile(request){
  try{
    const url=new URL(request.url,'https://abbeedo.com');
    const values=url.searchParams.getAll('file');
    if([...url.searchParams.keys()].some(key=>key!=='file')||values.length>1)return null;
    const file=values[0]||PATH_FILES[url.pathname];
    return ['android','windows','portable'].includes(file)?file:null;
  }catch{return null;}
}
function publicAssetURL(url){
 return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&!url.hash&&['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname)&&url.pathname.startsWith('/github-production-release-asset');
}
/** Resolve the public binary on the server so clients never open GitHub's UI/app. */
export async function resolvePublicDownload(target,file,{configuration,fetcher=globalThis.fetch,timeoutMs=6000}={}){
 const source=configuredSource(configuration);if(!source||!ASSET_NAMES[file])throw Error('Invalid publisher');
 const url=new URL(target);
 if(source.provider==='public-blob'){
  if(url.origin!==source.origin||url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.pathname.endsWith('/'+ASSET_NAMES[file]))throw Error('Invalid public file');
  return url.href;
 }
 const prefix='/'+source.owner+'/'+source.repository+'/releases/download/';
 if(url.origin!=='https://github.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith(prefix)||!url.pathname.endsWith('/'+ASSET_NAMES[file]))throw Error('Invalid release file');
 const tag=url.pathname.slice(prefix.length,-('/'+ASSET_NAMES[file]).length);
 if(!/^[a-z\d][a-z\d._-]{0,99}$/i.test(tag)||source.tag!=='latest'&&tag!==source.tag)throw Error('Invalid release tag');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(url.href,{method:'GET',headers:{Accept:'application/octet-stream','Range':'bytes=0-0','User-Agent':'abbeedo-TV/1.2','Cache-Control':'no-cache'},cache:'no-store',redirect:'manual',signal:controller.signal});
  const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});
  if(![301,302,303,307,308].includes(response.status)||!location)throw Error('Public file redirect unavailable');
  const asset=new URL(location,url);if(!publicAssetURL(asset))throw Error('Untrusted public file redirect');
  return asset.href;
 }finally{clearTimeout(timer);}
}
export function createDownloadHandler(options={}){
  return async(req,res)=>{
    const head=req.method==='HEAD';
    if(!['GET','HEAD'].includes(req.method))return sendJSON(res,405,{error:'طريقة الطلب غير مدعومة.',code:'METHOD'},{headers:{Allow:'GET, HEAD'}});
    const file=requestedFile(req);if(!file)return sendJSON(res,400,{error:'اختر تطبيق أندرويد أو ويندوز من صفحة التحميل.',code:'DOWNLOAD_FILE'},{head});
    try{
      const {targets}=await loadReleases(options),target=targets[file];
      if(!target)return sendJSON(res,503,{error:'رابط التحميل غير متاح مؤقتًا. أعد المحاولة بعد قليل.',code:'DOWNLOAD_UNAVAILABLE'},{head});
      const direct=await resolvePublicDownload(target,file,options);
      res.statusCode=307;for(const [key,value]of Object.entries({...NO_CACHE,Location:direct,'Content-Length':'0'}))res.setHeader(key,value);res.end();
    }catch{return sendJSON(res,503,{error:'تعذر تجهيز التحميل. تحقق من الاتصال ثم أعد المحاولة.',code:'DOWNLOAD_UNAVAILABLE'},{head});}
  };
}
export default createDownloadHandler();
