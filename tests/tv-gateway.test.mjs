import test from 'node:test';
import assert from 'node:assert/strict';
import {routeTVAPI,tvJSONBody,rewriteTVMediaText} from '../application/vercel/lib/tv-api.mjs';
import {nativeTVInfo,isNativeTV,installPackagedTVNetwork,TV_API_ORIGIN} from '../application/public/app/tv-network.js';
import {handleClient,handleClientMedia} from '../application/worker/client-api.mjs';
import {watchParty} from '../application/worker/watch-party.mjs';
import {devicePairing} from '../application/worker/device-pairing.mjs';

const origin='https://www.abbeedo.com',app='AbbeedoTV1.tv',room='12345678-1234-4123-8123-123456789abc';
const token='a'.repeat(80),bearer='b'.repeat(64),encoder=new TextEncoder();
const packet=(path,options={})=>new Request(origin+path,{...options,headers:{Origin:'null','X-Abbeedo-TV-App':app,...options.headers}});
const call=(path,options,route)=>routeTVAPI(packet(path,options),{},route);
function scopeFor(platform='tizen'){
 const calls=[];const scope={location:{protocol:'file:',href:'file:///widget/index.html',pathname:'/widget/index.html'},navigator:{userAgent:'TV'},document:{documentElement:{dataset:{}}},Headers,Request,fetch:async(input,init)=>{calls.push({input,init});return new Response('owned');},...(platform==='tizen'?{tizen:{application:{getCurrentApplication:()=>({appInfo:{id:app}})}}}:{webOSSystem:{identifier:'com.abbeedo.tv.app'}})};
 return {scope,calls};
}

test('TV route context is narrow and does not expose browser guest or admin operations',async()=>{
 let delegated=0;
 for(const path of ['/api/tv/admin/login','/api/tv/relay','/api/tv/client/extra','/api/tv/watch/rooms/'+room+'/claim','/api/tv/watch/rooms/'+room+'/sync','/api/tv/watch/rooms/'+room+'/external','/api/tv/watch/rooms/'+room+'/media','/api/tv/watch/rooms/diagnostics']){
  const result=await call(path,{method:'POST'},async()=>{delegated++;return Response.json({ok:true});});assert.equal(result.status,404,path);
 }
 assert.equal(delegated,0);
 const result=await call('/api/tv/client',{method:'POST',headers:{Origin:'https://external.example'}},async()=>{throw Error('Must reject before delegation');});assert.equal(result.status,403);assert.notEqual(result.headers.get('access-control-allow-origin'),'https://external.example');
});

test('preflight only allows listed methods/headers and requests a package context for JSON APIs',async()=>{
 const accepted=await call('/api/tv/client',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-abbeedo-tv-app'}},()=>{throw Error('preflight must not access storage');});
 assert.equal(accepted.status,204);assert.equal(accepted.headers.get('access-control-allow-origin'),'null');assert.equal(accepted.headers.get('access-control-allow-credentials'),null);
 for(const headers of [
  {'Access-Control-Request-Method':'DELETE','Access-Control-Request-Headers':'x-abbeedo-tv-app'},
  {'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'cookie,x-abbeedo-tv-app'},
  {'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},
 ])assert.equal((await call('/api/tv/client',{method:'OPTIONS',headers},()=>{throw Error();})).status,403);
 const media=await call('/api/tv/media?t='+token,{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'range'}},()=>{throw Error();});assert.equal(media.status,204);
});

test('context IDs do not authenticate; provider/source rules continue through the real account API',async()=>{
 const env={CLIENT_SECRET:'a'.repeat(64)};
 const request=packet('/api/tv/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'resolve',account:{mode:'direct',url:'http://127.0.0.1/private.mp4'},item:{kind:'movie',url:'http://127.0.0.1/private.mp4'}})});
 const result=await routeTVAPI(request,env,handleClient);assert.equal(result.status,400);assert.equal((await result.json()).code,'HOST_NOT_ALLOWED');assert.equal(result.headers.get('access-control-allow-origin'),'null');
});

test('the gateway strips cookies, browser-origin metadata and context header before delegating host bearer requests',async()=>{
 let captured;
 const result=await call('/api/tv/watch/rooms/'+room+'/state',{method:'PUT',headers:{Authorization:'Bearer '+bearer,Cookie:'__Host-abunasser_watch=private','Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:'{"positionMs":123}'},async request=>{
  captured=request;assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('origin'),null);assert.equal(request.headers.get('sec-fetch-site'),null);assert.equal(request.headers.get('x-abbeedo-tv-app'),null);assert.equal(request.headers.get('authorization'),'Bearer '+bearer);assert.equal(await request.text(),'{"positionMs":123}');
  return Response.json({ok:true},{headers:{'Set-Cookie':'should-not-leave=private; Secure','Access-Control-Allow-Credentials':'true'}});
 });
 assert.equal(new URL(captured.url).pathname,'/api/watch/rooms/'+room+'/state');assert.equal(result.status,200);assert.equal(result.headers.get('set-cookie'),null);assert.equal(result.headers.get('access-control-allow-credentials'),null);
});

test('real Watch Together host and device pairing secrets remain enforced',async()=>{
 const env={BUCKET:{get:async()=>null,list:async()=>({objects:[]})}};
 const watch=await routeTVAPI(packet('/api/tv/watch/rooms/'+room,{headers:{Authorization:'Bearer '+bearer}}),env,watchParty);assert.equal(watch.status,410);
 const pair=await routeTVAPI(packet('/api/tv/device-pairings/'+'p'.repeat(22),{headers:{Authorization:'Bearer '+'q'.repeat(43)}}),env,devicePairing);assert.equal(pair.status,404);
 const absent=await call('/api/tv/watch/rooms/'+room,{method:'GET'},()=>{throw Error('No secret must never reach handler');});assert.equal(absent.status,403);
});

test('media accepts a scoped token without a custom header but the real media cipher validation still rejects forgery',async()=>{
 const missing=await routeTVAPI(new Request(origin+'/api/tv/media',{headers:{Origin:'null'}}),{},()=>{throw Error('Missing token');});assert.equal(missing.status,403);
 const response=await routeTVAPI(new Request(origin+'/api/tv/media?t='+token,{headers:{Origin:'null'}}),{CLIENT_SECRET:'a'.repeat(64)},handleClientMedia);assert.equal(response.status,403);assert.equal((await response.json()).code,'MEDIA_TOKEN');assert.equal(response.headers.get('access-control-allow-origin'),'null');
});

test('an actual resolve capability reaches only its owned source and preserves its requested media range',async()=>{
 const env={CLIENT_SECRET:'c'.repeat(64)},originalFetch=globalThis.fetch,source=origin+'/watch-demo.mp4',bytes=Uint8Array.from([0,1,2,3,4,5,6,7,8,9]);let fetched=0;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),source);assert.equal(new Headers(options.headers).get('range'),'bytes=3-7');fetched++;return new Response(bytes.slice(3,8),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 3-7/10','Content-Length':'5','Accept-Ranges':'bytes'}});};
  const request=packet('/api/tv/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op:'resolve',account:{mode:'direct',url:source},item:{id:'movie:owned',kind:'movie',url:source}})});
  const resolution=await routeTVAPI(request,env,handleClient);assert.equal(resolution.status,200);
  const data=await resolution.json(),url=new URL(data.url);assert.equal(url.pathname,'/api/tv/media');assert.ok(url.searchParams.get('t').length>40);assert.equal(data.sourceUrl,source);
  const response=await routeTVAPI(new Request(data.url,{headers:{Origin:'null',Range:'bytes=3-7'}}),env,handleClientMedia);
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 3-7/10');assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())),[3,4,5,6,7]);assert.equal(fetched,1);
 }finally{globalThis.fetch=originalFetch;}
});

test('binary video range responses retain exact bytes and headers without buffering or cookie forwarding',async()=>{
 let controller,cancelled=false,captured;
 const body=new ReadableStream({start(value){controller=value;},cancel(){cancelled=true;}});
 const response=await call('/api/tv/media?t='+token,{headers:{Range:'bytes=20-24',Cookie:'private'}},async request=>{captured=request;return new Response(body,{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 20-24/100','Content-Length':'5','Accept-Ranges':'bytes'}});});
 assert.equal(captured.headers.get('range'),'bytes=20-24');assert.equal(captured.headers.get('cookie'),null);assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 20-24/100');assert.equal(response.headers.get('content-length'),'5');
 const reader=response.body.getReader(),first=reader.read();controller.enqueue(Uint8Array.from([1,2]));assert.deepEqual(Array.from((await first).value),[1,2]);await reader.cancel();assert.equal(cancelled,true);
});

test('JSON/NDJSON media URLs rewrite across chunks while large catalogues stream before completion',async()=>{
 let controller;
 const body=new ReadableStream({start(value){controller=value;}});
 const response=await call('/api/tv/client',{method:'POST',body:'{}'},async()=>new Response(body,{headers:{'Content-Type':'application/x-ndjson','Content-Length':'999','ETag':'old'}}));
 const reader=response.body.getReader();let first=reader.read();
 controller.enqueue(encoder.encode('{"url":"'+origin+'/api/med'));
 controller.enqueue(encoder.encode('ia?t=signed","nested":["'+origin+'/api/media?t=second"],"sourceUrl":"https://provider.example/film.mp4"}\n'));
 const chunks=[];chunks.push((await first).value);
 while(chunks.map(value=>new TextDecoder().decode(value)).join('').indexOf('\n')<0){chunks.push((await reader.read()).value);}
 const partial=chunks.map(value=>new TextDecoder().decode(value)).join('');assert.ok(partial.includes('/api/tv/media?t=signed'));assert.ok(partial.includes('provider.example/film.mp4'));assert.ok(partial.endsWith('\n'));assert.equal(response.headers.get('content-length'),null);
 controller.enqueue(encoder.encode('{"name":"أطفال","url":"https://other.example/api/media?t=untouched"}\n'));controller.close();
 for(;;){const next=await reader.read();if(next.done)break;chunks.push(next.value);}
 const lines=new TextDecoder().decode(Buffer.concat(chunks)).trim().split('\n').map(JSON.parse);
 assert.equal(lines[0].url,origin+'/api/tv/media?t=signed');assert.equal(lines[0].nested[0],origin+'/api/tv/media?t=second');assert.equal(lines[1].name,'أطفال');assert.equal(lines[1].url,'https://other.example/api/media?t=untouched');
});

test('JSON rewrite never changes a URL embedded inside a provider URL, or long unrelated text',async()=>{
 const data={url:'https://provider.example/film?return='+origin+'/api/media?t=embedded',plot:'Text '+origin+'/api/media?t=words',huge:'z'.repeat(150000),actual:origin+'/api/media?t=owned'};
 const response=new Response(tvJSONBody(new Response(JSON.stringify(data)).body,origin));const result=await response.json();assert.equal(result.url,data.url);assert.equal(result.plot,data.plot);assert.equal(result.huge,data.huge);assert.equal(result.actual,origin+'/api/tv/media?t=owned');
});

test('HLS playlists rewrite exact own media line/URI references, not other hosts or comments',async()=>{
 const input='#EXTM3U\n#COMMENT '+origin+'/api/media?t=words\n#EXT-X-KEY:METHOD=AES-128,URI="'+origin+'/api/media?t=key"\n'+origin+'/api/media?t=segment\nhttps://cdn.example/segment.ts\n';
 const response=await call('/api/tv/media?t='+token,{},async()=>new Response(input,{headers:{'Content-Type':'application/vnd.apple.mpegurl','Content-Length':String(input.length)}}));const output=await response.text();
 assert.ok(output.includes('URI="'+origin+'/api/tv/media?t=key"'));assert.ok(output.includes('\n'+origin+'/api/tv/media?t=segment\n'));assert.ok(output.includes('#COMMENT '+origin+'/api/media?t=words'));assert.ok(output.includes('https://cdn.example/segment.ts'));
 assert.equal(rewriteTVMediaText('https://provider.example/?value='+origin+'/api/media?t=x',origin),'https://provider.example/?value='+origin+'/api/media?t=x');
});

test('TV detection requires the real package ID and leaves normal browsers untouched',()=>{
 const invalid={tizen:{application:{getCurrentApplication:()=>({appInfo:{id:'other.package'}})}},location:{protocol:'file:'}};assert.equal(nativeTVInfo(invalid),null);
 assert.equal(isNativeTV({navigator:{userAgent:'Mozilla/5.0 Tizen SMART-TV'},location:{protocol:'https:',hostname:'www.abbeedo.com',pathname:'/app'}}),false);
 const {scope}=scopeFor();assert.deepEqual(nativeTVInfo(scope),{platform:'tizen',appId:app,packaged:true});
 const lg=scopeFor('webos').scope;assert.equal(nativeTVInfo(lg).platform,'webos');
 const browser={fetch:()=>{throw Error();}};const original=browser.fetch;assert.equal(installPackagedTVNetwork(browser).installed,false);assert.equal(browser.fetch,original);assert.equal(browser.ABUNASSER_CONFIG,undefined);
});

test('packaged TV fetch adapts only known own API paths, preserves body/bearer and strips cookies',async()=>{
 const {scope,calls}=scopeFor();const original=scope.fetch,controller=installPackagedTVNetwork(scope);assert.equal(controller.installed,true);assert.equal(installPackagedTVNetwork(scope),controller);assert.equal(scope.ABUNASSER_CONFIG.apiOrigin,TV_API_ORIGIN);
 await scope.fetch(TV_API_ORIGIN+'/api/client',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'private'},body:'{"op":"auth"}',credentials:'include'});
 const first=calls[0];assert.equal(first.input,TV_API_ORIGIN+'/api/tv/client');assert.equal(first.init.body,'{"op":"auth"}');assert.equal(first.init.headers.get('x-abbeedo-tv-app'),app);assert.equal(first.init.headers.get('cookie'),null);assert.equal(first.init.credentials,'omit');
 await scope.fetch(new Request(TV_API_ORIGIN+'/api/watch/rooms/'+room,{method:'DELETE',headers:{Authorization:'Bearer '+bearer}}));
 assert.equal(calls[1].input.url,TV_API_ORIGIN+'/api/tv/watch/rooms/'+room);assert.equal(calls[1].input.headers.get('authorization'),'Bearer '+bearer);assert.equal(calls[1].input.credentials,'omit');
 await scope.fetch(TV_API_ORIGIN+'/api/tv/media?t='+token);assert.equal(calls[2].input,TV_API_ORIGIN+'/api/tv/media?t='+token);assert.equal(calls[2].init.headers.get('x-abbeedo-tv-app'),null);
 await scope.fetch(TV_API_ORIGIN+'/api/releases');assert.equal(calls[3].input,TV_API_ORIGIN+'/api/releases');assert.equal(calls[3].init.headers.get('x-abbeedo-tv-app'),null);assert.equal(calls[3].init.credentials,'omit');
 await scope.fetch('https://provider.example/live.m3u8');assert.equal(calls[4].input,'https://provider.example/live.m3u8');assert.equal(calls[4].init,undefined);
 controller.restore();assert.equal(scope.fetch,original);assert.equal(scope.ABUNASSER_CONFIG,undefined);
});
