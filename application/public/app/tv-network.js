// Native package identity selects presentation/network transport only. Account
// credentials and media capabilities remain authenticated by the HTTPS backend.
export const TV_API_ORIGIN='https://www.abbeedo.com';
export const TV_APPLICATION_IDS=Object.freeze({webos:'com.abbeedo.tv.app',tizen:'AbbeedoTV1.tv'});
const installedKey='__abbeedoPackagedTVNetwork';
const knownPublic=new Set(['/version.json','/api/releases']);
const room='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';

export function nativeTVInfo(scope=globalThis){
  try{
    const application=scope.tizen?.application?.getCurrentApplication?.();
    const id=application?.appInfo?.id||application?.id;
    if(id===TV_APPLICATION_IDS.tizen)return {platform:'tizen',appId:id,packaged:!/^https?:$/.test(scope.location?.protocol||'')};
  }catch{}
  try{
    const id=scope.webOSSystem?.identifier;
    if(id===TV_APPLICATION_IDS.webos)return {platform:'webos',appId:id,packaged:!/^https?:$/.test(scope.location?.protocol||'')};
  }catch{}
  // LG's documented hosted application retains the real TV user agent. This
  // fallback only changes display gating at our own HTTPS /app route.
  try{
    const location=scope.location,ua=String(scope.navigator?.userAgent||'');
    if(location?.protocol==='https:'&&['www.abbeedo.com','abbeedo.com'].includes(location.hostname)&&/^\/app(?:\/|\.html)?$/.test(location.pathname)&&/(?:webOS|Web0S)/i.test(ua)&&/(?:Smart[- ]?TV|webOS\.TV|LG Browser)/i.test(ua))return {platform:'webos',appId:TV_APPLICATION_IDS.webos,packaged:false};
  }catch{}
  return null;
}
export const isNativeTV=(scope=globalThis)=>nativeTVInfo(scope)!==null;

export function tvAPIPath(path){
  const original=path.startsWith('/api/tv/')?path.replace('/api/tv/','/api/'):path;
  if(['/api/client','/api/media','/api/announcements','/api/device-pairings','/api/watch/rooms'].includes(original))return original.replace('/api/','/api/tv/');
  if(/^\/api\/device-pairings\/[A-Za-z0-9_-]{22}(?:\/(?:ack|commands(?:\/ack)?|state))?$/.test(original)||new RegExp('^/api/watch/rooms/'+room+'(?:/state)?$','i').test(original))return original.replace('/api/','/api/tv/');
  return null;
}
export function installPackagedTVNetwork(scope=globalThis){
  const info=nativeTVInfo(scope);
  if(!info)return {installed:false,reason:'not-native-tv'};
  const root=scope.document?.documentElement;
  if(root?.dataset){root.dataset.tv=info.platform;root.dataset.tvAppId=info.appId;}
  if(!info.packaged)return {installed:false,...info,reason:'hosted-same-origin'};
  if(scope[installedKey]?.installed)return scope[installedKey];
  if(typeof scope.fetch!=='function')return {installed:false,...info,reason:'fetch-unavailable'};
  const previousFetch=scope.fetch,previousConfig=scope.ABUNASSER_CONFIG,fetcher=scope.fetch.bind(scope),HeadersType=scope.Headers||Headers,RequestType=scope.Request||Request;
  scope.ABUNASSER_CONFIG={...(previousConfig||{}),apiOrigin:TV_API_ORIGIN,apiBase:TV_API_ORIGIN+'/api/client',tvPlatform:info.platform,tvAppId:info.appId,packagedTV:true};
  const wrapped=function(input,init){
    let address;
    try{
      const raw=typeof input==='string'?input:input?.url||input?.href;
      const base=typeof raw==='string'&&raw.startsWith('/api/')?TV_API_ORIGIN:scope.location?.href||TV_API_ORIGIN+'/app';
      address=new URL(raw,base);
    }catch{return fetcher(input,init);}
    if(address.origin!==TV_API_ORIGIN)return fetcher(input,init);
    const path=tvAPIPath(address.pathname),publicMetadata=knownPublic.has(address.pathname);
    if(!path&&!publicMetadata)return fetcher(input,init);
    if(path)address.pathname=path;
    const original=input instanceof RequestType?input:null;
    const outgoingHeaders=new HeadersType(init?.headers||(original?.headers));
    outgoingHeaders.delete('cookie');
    if(path&&path!=='/api/tv/media')outgoingHeaders.set('X-Abbeedo-TV-App',info.appId);
    else outgoingHeaders.delete('X-Abbeedo-TV-App');
    const options={...(init||{}),headers:outgoingHeaders,credentials:'omit',mode:'cors'};
    if(original)return fetcher(new RequestType(new RequestType(address.href,original),options));
    return fetcher(address.href,options);
  };
  scope.fetch=wrapped;
  const controller={installed:true,...info,apiOrigin:TV_API_ORIGIN,restore(){
    if(scope.fetch===wrapped)scope.fetch=previousFetch;
    if(scope.ABUNASSER_CONFIG?.apiOrigin===TV_API_ORIGIN)scope.ABUNASSER_CONFIG=previousConfig;
    if(scope[installedKey]===controller)delete scope[installedKey];
  }};
  scope[installedKey]=controller;
  return controller;
}
