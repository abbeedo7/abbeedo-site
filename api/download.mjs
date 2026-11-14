import {loadReleases,sendJSON,NO_CACHE} from './releases.mjs';

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
export function createDownloadHandler(options={}){
  return async(req,res)=>{
    const head=req.method==='HEAD';
    if(!['GET','HEAD'].includes(req.method))return sendJSON(res,405,{error:'طريقة الطلب غير مدعومة.',code:'METHOD'},{headers:{Allow:'GET, HEAD'}});
    const file=requestedFile(req);if(!file)return sendJSON(res,400,{error:'اختر تطبيق أندرويد أو ويندوز من صفحة التحميل.',code:'DOWNLOAD_FILE'},{head});
    try{
      const {targets}=await loadReleases(options),target=targets[file];
      if(!target)return sendJSON(res,503,{error:'رابط التحميل غير متاح مؤقتًا. أعد المحاولة بعد قليل.',code:'DOWNLOAD_UNAVAILABLE'},{head});
      res.statusCode=307;for(const [key,value]of Object.entries({...NO_CACHE,Location:target,'Content-Length':'0'}))res.setHeader(key,value);res.end();
    }catch{return sendJSON(res,503,{error:'تعذر تجهيز التحميل. تحقق من الاتصال ثم أعد المحاولة.',code:'DOWNLOAD_UNAVAILABLE'},{head});}
  };
}
export default createDownloadHandler();
