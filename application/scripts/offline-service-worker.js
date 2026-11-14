// Only completed, profile-scoped local media are served here. API responses are never cached.
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith('/__offline__/')||!['GET','HEAD'].includes(request.method))return;
  event.respondWith((async()=>{
    const cache=await caches.open('abunasser-offline-v1'),response=await cache.match(url.href);
    if(!response)return new Response('Offline media missing',{status:404});
    const headers=new Headers(response.headers);headers.set('Accept-Ranges','bytes');headers.set('Cache-Control','no-store');
    const total=Number(headers.get('Content-Length')),range=request.headers.get('Range');
    if(!range)return new Response(request.method==='HEAD'?null:response.body,{headers});
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    let start=match?.[1]?Number(match[1]):Math.max(0,total-Number(match?.[2])),end=match?.[1]?(match[2]?Number(match[2]):total-1):total-1;
    if(!match||!match[1]&&!match[2]||!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=total||start>end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+total}});
    end=Math.min(end,total-1);headers.set('Content-Range','bytes '+start+'-'+end+'/'+total);headers.set('Content-Length',String(end-start+1));
    if(request.method==='HEAD')return new Response(null,{status:206,headers});
    const reader=response.body.getReader();let offset=0;
    const body=new ReadableStream({async pull(controller){try{for(;;){const {done,value}=await reader.read();if(done){controller.close();return;}const begin=Math.max(0,start-offset),finish=Math.min(value.byteLength,end+1-offset);offset+=value.byteLength;if(finish>begin)controller.enqueue(value.subarray(begin,finish));if(offset>end){controller.close();void reader.cancel().catch(()=>{});return;}if(finish>begin)return;}}catch(error){controller.error(error);}},cancel(){return reader.cancel();}});
    return new Response(body,{status:206,headers});
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let url;try{url=new URL(event.notification.data?.url||'/app',self.location.origin);}catch{url=new URL('/app',self.location.origin);}
    if(url.origin!==self.location.origin||!['https:','http:'].includes(url.protocol))url=new URL('/app',self.location.origin);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>{try{return new URL(client.url).origin===self.location.origin;}catch{return false;}});
    // Focus the current app rather than interrupt an existing playback session.
    if(existing?.focus)return existing.focus();
    return self.clients.openWindow(url.href);
  })());
});
