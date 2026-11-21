import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOwnedClient,handleOwnedClientMedia} from '../application/vercel/lib/owned-client-relay.mjs';
import {routeAPI} from '../application/vercel/lib/api-router.mjs';

const origin='https://www.abbeedo.com';
const owned='https://abunasser-apple-web.m05871268.chatgpt.site';
const provider='http://maglobalxx.xyz:2052';
const account={mode:'provider',username:'fixture-user',password:'fixture-password'};
const blocked=()=>new Response('source protection',{status:403,headers:{server:'cloudflare','content-type':'text/html'}});
const clientRequest=(input,options={})=>new Request(origin+'/api/client',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...options.headers},body:JSON.stringify(input),signal:options.signal});
const cap=name=>owned+'/api/media?t='+name.repeat(48);
const master=cap('M'),variant=cap('V'),segment=cap('S'),key=cap('K'),init=cap('I'),alternate=cap('A');
const live={op:'resolve',account,kind:'live',id:'7'};
function fixture(overrides={}){
 const calls=[];const env={CLIENT_SECRET:'c'.repeat(64),CLIENT_FALLBACK_ORIGIN:owned,CLIENT_FETCH:async()=>blocked(),...overrides};
 env.CLIENT_FALLBACK_FETCH=async(url,options)=>{calls.push({url,options});return overrides.CLIENT_FALLBACK_FETCH?overrides.CLIENT_FALLBACK_FETCH(url,options):Response.json({url:master,mime:'application/vnd.apple.mpegurl',alternatives:[{url:alternate,mime:'video/mp2t'}],sourceUrl:provider+'/live/fixture-user/fixture-password/7.m3u8',expiresAt:Date.now()+6*3600000});};
 return {env,calls};
}
async function resolved(env){const response=await handleOwnedClient(clientRequest(live),env);assert.equal(response.status,200,await response.clone().text());return response.json();}
function assertFixedHeaders(call){
 assert.equal(new URL(call.url).origin,owned);assert.equal(call.options.redirect,'manual');assert.equal(call.options.credentials,'omit');
 const headers=new Headers(call.options.headers);assert.equal(headers.get('origin'),owned);assert.equal(headers.get('user-agent'),'abbeedo-TV/1.2');
 for(const name of ['cookie','authorization','referer','x-private','if-range'])assert.equal(headers.has(name),false,name);
}

test('fallback is opt-in to one pinned origin and one default provider',async()=>{
 for(const changes of [{CLIENT_FALLBACK_ORIGIN:undefined},{CLIENT_FALLBACK_ORIGIN:'https://other.example'},{CLIENT_FALLBACK_ORIGIN:owned+'/'},{}]){
  const {env,calls}=fixture(changes),foreign=Object.keys(changes).length===0;
  if(foreign)env.CLIENT_ALLOWED_HOSTS='foreign.example';
  const response=await handleOwnedClient(clientRequest({op:'auth',account:foreign?{...account,mode:'xtream',server:'https://foreign.example'}:account}),env);
  assert.equal((await response.json()).code,'UPSTREAM_BLOCKED');assert.equal(calls.length,0);
 }
});

test('ordinary provider authentication failures and JSON HTTP403 are never retried',async()=>{
 for(const response of [new Response('{}',{status:401,headers:{server:'cloudflare','content-type':'application/json'}}),new Response('{}',{status:403,headers:{server:'cloudflare','content-type':'application/json'}}),Response.json({user_info:{auth:0,status:'Disabled'}})]){
  const {env,calls}=fixture({CLIENT_FETCH:async()=>response}),result=await handleOwnedClient(clientRequest({op:'auth',account}),env),data=await result.json();
  assert.ok(['AUTH','UPSTREAM_HTTP'].includes(data.code));assert.equal(calls.length,0);
 }
});

test('blocked auth retries current validation through fixed owned direct resolution, stripping client headers',async()=>{
 const mappings=new Map();let count=0;
 const {env,calls}=fixture({CLIENT_FALLBACK_FETCH:async(url,options)=>{
  if(url===owned+'/api/client'){
   const input=JSON.parse(options.body);assert.equal(input.op,'resolve');assert.equal(input.account.mode,'direct');
   const address=new URL(input.account.url);assert.equal(address.origin,provider);assert.equal(address.pathname,'/player_api.php');assert.equal(address.searchParams.get('username'),'fixture-user');
   const media=cap('D')+(++count);mappings.set(media,address);return Response.json({url:media});
  }
  assert.ok(mappings.has(url));return Response.json({user_info:{auth:1,status:'Active'},server_info:{timezone:'UTC'}});
 }});
 const response=await handleOwnedClient(clientRequest({op:'auth',account},{headers:{Cookie:'session=private',Authorization:'Bearer private',Referer:'https://private.example', 'X-Private':'private'}}),env);
 assert.equal(response.status,200);assert.equal((await response.json()).userInfo.auth,1);assert.equal(calls.length,2);calls.forEach(assertFixedHeaders);
});

test('current validation still rejects invalid auth returned over the owned transport',async()=>{
 const {env}=fixture({CLIENT_FALLBACK_FETCH:async(url)=>url===owned+'/api/client'?Response.json({url:cap('D')}):Response.json({user_info:{auth:0,status:'Disabled'}})});
 const response=await handleOwnedClient(clientRequest({op:'auth',account}),env);assert.equal(response.status,401);assert.equal((await response.json()).code,'AUTH');
});

test('owned raw JSON transport preserves current NDJSON first records before provider EOF',async()=>{
 let release,ended=false;const tail=new Promise(resolve=>{release=resolve;});
 const rows=Array.from({length:129},(_,n)=>({stream_id:n+1,name:'channel '+(n+1)}));
 const mappings=new Map();let count=0;
 const {env,calls}=fixture({CLIENT_FALLBACK_FETCH:async(url,options)=>{
  if(url===owned+'/api/client'){
   const input=JSON.parse(options.body),media=cap('D')+(++count);assert.equal(input.op,'resolve');assert.equal(input.account.mode,'direct');mappings.set(media,new URL(input.account.url));return Response.json({url:media});
  }
  const upstream=mappings.get(url);assert.ok(upstream);
  if(upstream.searchParams.get('action')==='get_live_categories')return Response.json([]);
  assert.equal(upstream.searchParams.get('action'),'get_live_streams');
  let sent=false;
  return new Response(new ReadableStream({async pull(controller){if(!sent){sent=true;controller.enqueue(new TextEncoder().encode('['+rows.slice(0,128).map(JSON.stringify).join(',')+','));}else{await tail;ended=true;controller.enqueue(new TextEncoder().encode(JSON.stringify(rows[128])+']'));controller.close();}}}),{headers:{'Content-Type':'application/json'}});
 }});
 const response=await handleOwnedClient(clientRequest({op:'catalog',kind:'live',account}),env);assert.match(response.headers.get('content-type'),/ndjson/);
 const reader=response.body.getReader();
 let timer;const first=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('first catalogue record waited for EOF')),1000);})]).finally(()=>clearTimeout(timer));
 assert.equal(ended,false);assert.equal(JSON.parse(new TextDecoder().decode(first.value).trim()).items.length,128);
 release();let remainder='';for(;;){const next=await reader.read();if(next.done)break;remainder+=new TextDecoder().decode(next.value);}assert.match(remainder,/"total":129/);calls.forEach(assertFixedHeaders);
});

test('resolve issues origin-bound encrypted own capabilities and rewrites nested HLS, keys and segments',async()=>{
 const {env,calls}=fixture({CLIENT_FALLBACK_FETCH:async(url)=>{
  if(url===owned+'/api/client')return Response.json({url:master,mime:'application/vnd.apple.mpegurl',alternatives:[{url:alternate,mime:'video/mp2t'}],sourceUrl:provider+'/live/fixture-user/fixture-password/7.m3u8',expiresAt:Date.now()+6*3600000});
  if(url===master)return new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="'+key+'"\n#EXT-X-STREAM-INF:BANDWIDTH=128000\n'+variant+'\n',{headers:{'Content-Type':'application/vnd.apple.mpegurl','Set-Cookie':'private=secret'}});
  if(url===variant)return new Response('#EXTM3U\n#EXT-X-MAP:URI="'+init+'"\n#EXTINF:4,\n'+segment+'\n#EXT-X-ENDLIST\n',{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
  if([segment,key,init,alternate].includes(url))return new Response(new Uint8Array([1,2,3,4]),{headers:{'Content-Type':'video/mp2t'}});
  throw Error('unexpected destination');
 }});
 const data=await resolved(env);assert.match(data.url,/^https:\/\/www\.abbeedo\.com\/api\/media\?t=r1\./);assert.equal(JSON.stringify(data).includes(owned),false);assert.equal(data.url.includes('fixture'),false);
 assert.equal(new URL(data.alternatives[0].url).origin,origin);
 const response=await handleOwnedClientMedia(new Request(data.url,{headers:{Origin:origin,Cookie:'private',Authorization:'private'}}),env);assert.equal(response.status,200);assert.equal(response.headers.has('set-cookie'),false);
 const manifest=await response.text();assert.equal(manifest.includes(owned),false);assert.equal(manifest.includes(master),false);
 const child=manifest.split('\n').find(line=>line.startsWith(origin+'/api/media'));
 const childResponse=await handleOwnedClientMedia(new Request(child),env);assert.equal(childResponse.status,200);
 const childManifest=await childResponse.text();assert.equal(childManifest.includes(owned),false);
 const segmentURL=childManifest.split('\n').find(line=>line.startsWith(origin+'/api/media'));
 const media=await handleOwnedClientMedia(new Request(segmentURL),env);assert.deepEqual(new Uint8Array(await media.arrayBuffer()),new Uint8Array([1,2,3,4]));
 const keyURL=manifest.match(/URI="([^"]+)"/)[1],keyResponse=await handleOwnedClientMedia(new Request(keyURL),env);assert.equal(keyResponse.status,200);await keyResponse.arrayBuffer();
 calls.forEach(assertFixedHeaders);
});

test('Range, bounded ranges, HEAD and media response metadata pass through without private headers',async()=>{
 const {env,calls}=fixture({CLIENT_FALLBACK_FETCH:async(url,options)=>{
  if(url===owned+'/api/client')return Response.json({url:alternate,alternatives:[],expiresAt:Date.now()+6*3600000});
  return new Response(options.method==='HEAD'?null:new Uint8Array([4,5,6]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 4-6/99','Content-Length':'3','Accept-Ranges':'bytes','Set-Cookie':'private=secret'}});
 }});
 const data=await resolved(env),response=await handleOwnedClientMedia(new Request(data.url,{headers:{Origin:origin,Range:'bytes=4-6',Cookie:'private','If-Range':'private'}}),env);
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 4-6/99');assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.has('set-cookie'),false);assert.equal(await response.arrayBuffer().then(b=>b.byteLength),3);assert.equal(new Headers(calls.at(-1).options.headers).get('range'),'bytes=4-6');
 const head=await handleOwnedClientMedia(new Request(data.url,{method:'HEAD',headers:{Range:'bytes=4-6'}}),env);assert.equal(head.status,206);assert.equal(await head.text(),'');assert.equal(calls.at(-1).options.method,'HEAD');
 const bounded=await routeAPI(new Request(data.url,{headers:{Range:'bytes=0-'}}),env);await bounded.arrayBuffer();assert.equal(new Headers(calls.at(-1).options.headers).get('range'),'bytes=0-8388607');calls.forEach(assertFixedHeaders);
});

test('cross-origin requests, tampered capabilities and changed configuration cannot reach the owned service',async()=>{
 const {env,calls}=fixture();const data=await resolved(env);const before=calls.length;
 for(const request of [new Request(data.url,{headers:{Origin:'https://foreign.example'}}),new Request(data.url.replace('t=r1.','t=r1.A')),new Request(data.url.replace(origin,'https://other.example'))]){
  const response=await handleOwnedClientMedia(request,env);assert.equal(response.status,403);assert.equal(calls.length,before);
 }
 const disabled=await handleOwnedClientMedia(new Request(data.url),{...env,CLIENT_FALLBACK_ORIGIN:'https://other.example'});assert.equal(disabled.status,403);assert.equal(calls.length,before);
 const client=await handleOwnedClient(clientRequest(live,{headers:{Origin:'https://foreign.example'}}),env);assert.equal(client.status,403);assert.equal(calls.length,before);
});

test('owned redirects and foreign or malformed manifest references fail closed',async()=>{
 for(const body of ['#EXTM3U\nhttps://foreign.example/segment.ts\n','#EXTM3U\nhttp://maglobalxx.xyz:2052/live/private/segment.ts\n','#EXTM3U\n#EXT-X-KEY:URI="'+key+'",URI=http://foreign.example/key\n','#EXTM3U\n#EXT-X-KEY:URI=\''+key+'\'\n']){
  const {env}=fixture({CLIENT_FALLBACK_FETCH:async(url)=>url===owned+'/api/client'?Response.json({url:master,expiresAt:Date.now()+6*3600000}):new Response(body,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}})}),data=await resolved(env),response=await handleOwnedClientMedia(new Request(data.url),env);
  assert.ok(response.status>=400);assert.equal((await response.text()).includes('foreign.example'),false);
 }
 const {env,calls}=fixture({CLIENT_FALLBACK_FETCH:async()=>new Response(null,{status:302,headers:{Location:'https://foreign.example'}})});
 const response=await handleOwnedClient(clientRequest(live),env);assert.equal(response.status,502);assert.equal(calls.length,1);
});

test('client abort cancels the owned fetch and media cancellation aborts its transport',async()=>{
 const controller=new AbortController();let started,observed=false;const startedPromise=new Promise(resolve=>{started=resolve;});
 const {env}=fixture({CLIENT_FALLBACK_FETCH:async(url,options)=>new Promise((resolve,reject)=>{started();options.signal.addEventListener('abort',()=>{observed=true;reject(new DOMException('Aborted','AbortError'));},{once:true});})});
 const pending=handleOwnedClient(clientRequest(live,{signal:controller.signal}),env);await startedPromise;controller.abort();const response=await pending;assert.equal(response.status,504);assert.equal(observed,true);
 let mediaSignal,cancelled=false;
 const {env:mediaEnv}=fixture({CLIENT_FALLBACK_FETCH:async(url,options)=>{
  if(url===owned+'/api/client')return Response.json({url:alternate,expiresAt:Date.now()+6*3600000});
  mediaSignal=options.signal;return new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'video/mp2t'}});
 }});
 const data=await resolved(mediaEnv),media=await handleOwnedClientMedia(new Request(data.url),mediaEnv),reader=media.body.getReader();await reader.read();await reader.cancel();assert.equal(mediaSignal.aborted,true);assert.equal(cancelled,true);
});

test('oversized input and foreign owned resolve media destinations never become capabilities',async()=>{
 const {env,calls}=fixture();
 const big=await handleOwnedClient(clientRequest({...live,padding:'x'.repeat(33000)}),env);assert.equal(big.status,413);assert.equal(calls.length,0);
 const foreign=fixture({CLIENT_FALLBACK_FETCH:async()=>Response.json({url:'https://foreign.example/api/media?t='+'A'.repeat(48),expiresAt:Date.now()+6*3600000})});
 const response=await handleOwnedClient(clientRequest(live),foreign.env);assert.equal(response.status,403);assert.equal((await response.text()).includes('foreign.example'),false);
});
