import {handleClient,handleClientMedia} from '../../worker/client-api.mjs';
import {watchParty} from '../../worker/watch-party.mjs';
import {devicePairing} from '../../worker/device-pairing.mjs';
import {announcements} from '../../worker/announcements.mjs';
import {adminAuth} from '../../worker/admin-auth.mjs';
import {relay} from '../../worker/relay.mjs';

const headers={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const version=typeof __ABBEEDO_VERSION__==='string'?__ABBEEDO_VERSION__:'development';
export const isMediaPath=path=>['/api/media','/api/relay','/api/stream'].includes(path)||/^\/api\/watch\/rooms\/[a-f0-9-]+\/(?:media|asset)$/.test(path);
export function trustedRequest(request,{ip}={}){const next=new Headers(request.headers);next.delete('cf-connecting-ip');if(typeof ip==='string'&&ip.length<=64)next.set('cf-connecting-ip',ip);return new Request(request,{headers:next});}
// Returning a smaller valid range lets media clients make subsequent range
// requests instead of keeping one finite-file invocation open for a whole movie.
export function boundedMediaRequest(request,{maximum=8*1024*1024}={}){if(request.method!=='GET'||!isMediaPath(new URL(request.url).pathname))return request;const range=request.headers.get('range'),match=/^bytes=(\d+)-(\d*)$/.exec(range||'');if(!match)return request;const start=Number(match[1]),end=match[2]?Number(match[2]):Infinity;if(!Number.isSafeInteger(start)||end!==Infinity&&!Number.isSafeInteger(end)||end<start||end-start+1<=maximum)return request;const headers=new Headers(request.headers);headers.set('Range','bytes='+start+'-'+Math.min(end,start+maximum-1));return new Request(request,{headers});}
export async function routeAPI(request,env){
  const path=new URL(request.url).pathname;
  try{
    if(path==='/api/health')return Response.json({app:'ابوناصر TV',name:'abbeedo TV',platforms:['web','iOS','Windows'],version,hosting:'vercel',storage:!!env.BUCKET,mediaConfigured:typeof env.CLIENT_SECRET==='string'&&/^[a-f0-9]{64}$/i.test(env.CLIENT_SECRET)},{headers});
    if(path==='/api/client')return await handleClient(request,env);
    if(path==='/api/media')return await handleClientMedia(boundedMediaRequest(request),env);
    if(path==='/api/relay'||path==='/api/stream')return await relay(boundedMediaRequest(request),env);
    if(path==='/api/watch/rooms/diagnostics')return Response.json({error:'Not found'},{status:404,headers});
    if(path==='/api/watch/rooms'||path.startsWith('/api/watch/rooms/'))return await watchParty(boundedMediaRequest(request),env);
    if(path==='/api/device-pairings'||path.startsWith('/api/device-pairings/'))return await devicePairing(request,env);
    if(path==='/api/announcements'||path==='/api/admin/announcements')return await announcements(request,env);
    if(['/api/admin/login','/api/admin/logout','/api/admin/session'].includes(path))return await adminAuth(request,env);
    return Response.json({error:'المسار غير متاح.',code:'NOT_FOUND'},{status:404,headers});
  }catch{return Response.json({error:'تعذر إكمال الطلب. حاول مجددًا.',code:'REQUEST_FAILED'},{status:502,headers});}
}
