import assets from '../.generated/assets.mjs';
import {handleReleases} from './releases.mjs';
import {handleClient,handleClientMedia} from './client-api.mjs';
import {watchParty} from './watch-party.mjs';
import {devicePairing} from './device-pairing.mjs';
import {announcements} from './announcements.mjs';
import {adminAuth} from './admin-auth.mjs';
import {relay} from './relay.mjs';

const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' https:; media-src 'self' https: blob:; worker-src 'self' blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const headers={'Cache-Control':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
export default {async fetch(request,env={}){
  const url=new URL(request.url),pathname=url.pathname;
  try{
    const release=await handleReleases(request,env);if(release)return release;
    if(pathname==='/api/client')return await handleClient(request,env);
    if(pathname==='/api/media')return await handleClientMedia(request,env);
    if(pathname==='/api/watch/rooms/diagnostics')return Response.json({error:'Not found'},{status:404,headers:{...headers,'Cache-Control':'no-store'}});
    if(pathname==='/api/watch/rooms'||pathname.startsWith('/api/watch/rooms/'))return await watchParty(request,{...env,WATCH_DEMO_ASSETS:assets});
    if(pathname==='/api/device-pairings'||pathname.startsWith('/api/device-pairings/'))return await devicePairing(request,env);
    if(pathname==='/api/announcements'||pathname==='/api/admin/announcements')return await announcements(request,env);
    if(['/api/admin/login','/api/admin/logout','/api/admin/session'].includes(pathname))return await adminAuth(request,env);
    if(pathname==='/api/relay'||pathname==='/api/stream')return await relay(request,env);
    if(pathname==='/api/health')return Response.json({app:'ابوناصر TV',platforms:['web','iOS','Windows'],version:'1.1.0',storage:!!env.BUCKET,mediaConfigured:!!env.CLIENT_SECRET},{headers:{...headers,'Cache-Control':'no-store'}});
    if(pathname.startsWith('/api/'))return Response.json({error:'المسار غير متاح.',code:'NOT_FOUND'},{status:404,headers:{...headers,'Cache-Control':'no-store'}});
    const asset=assets[pathname==='/'?'/index.html':pathname];
    if(!asset)return new Response('Not found',{status:404,headers});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
    const bytes=Uint8Array.from(atob(asset.data),value=>value.charCodeAt(0)),outHeaders={...headers,'Content-Type':asset.type,'Content-Security-Policy':csp};
    if(pathname==='/sw.js')outHeaders['Service-Worker-Allowed']='/';
    if(pathname==='/pair.html'||pathname==='/watch.html')outHeaders['Cache-Control']='no-store';
    if(asset.type.startsWith('video/')){
      outHeaders['Accept-Ranges']='bytes';const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range')||'');
      if(match){let start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):bytes.length-1):bytes.length-1;
        if(start>=bytes.length||start>end)return new Response(null,{status:416,headers:{...outHeaders,'Content-Range':`bytes */${bytes.length}`}});end=Math.min(end,bytes.length-1);outHeaders['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;outHeaders['Content-Length']=String(end-start+1);return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:outHeaders});}
    }
    outHeaders['Content-Length']=String(bytes.length);return new Response(request.method==='HEAD'?null:bytes,{headers:outHeaders});
  }catch{
    // Never log a provider URL, credentials, token or request body.
    return Response.json({error:'تعذر إكمال الطلب. حاول مجددًا.',code:'REQUEST_FAILED'},{status:502,headers:{...headers,'Cache-Control':'no-store'}});
  }
}};
