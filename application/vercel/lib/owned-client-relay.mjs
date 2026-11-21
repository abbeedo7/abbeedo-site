import {handleClient,handleClientMedia} from '../../worker/client-api.mjs';

// This is a deliberately pinned, user-owned transport. Configuration cannot
// turn it into a general proxy or change the destination of subscription data.
const OWNED_ORIGIN='https://abunasser-apple-web.m05871268.chatgpt.site';
const PROVIDER_ORIGIN='http://maglobalxx.xyz:2052';
const TOKEN_PREFIX='r1.';
const MAX_INPUT=32768,MAX_TOKEN=24000,MAX_OWNED_TOKEN=16000;
const MAX_AGE=6*3600000,CONNECT_TIMEOUT=6500;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const baseHeaders={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const configured=env=>env.CLIENT_FALLBACK_ORIGIN===OWNED_ORIGIN;
const isFailure=error=>typeof error?.code==='string'&&Number.isInteger(error?.status);
function failure(code='CLIENT_FALLBACK',status=502){return Object.assign(new Error(code==='TIMEOUT'?'انتهت مهلة الاتصال بالمصدر.':'تعذر إكمال الاتصال بالمصدر. حاول مجددًا.'),{code,status});}
function cors(request){const origin=request.headers.get('origin'),own=new URL(request.url).origin;if(origin&&origin!==own&&origin!=='abunasser://app')throw Object.assign(failure('ORIGIN',403),{message:'هذا الاتصال غير مسموح.'});return origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Range','Access-Control-Expose-Headers':'Content-Range, Accept-Ranges, Content-Length'}:{};}
function errorResponse(error,headers={}){return Response.json({error:isFailure(error)?error.message:'تعذر إكمال الاتصال بالمصدر. حاول مجددًا.',code:isFailure(error)?error.code:'CLIENT_FALLBACK'},{status:isFailure(error)?error.status:502,headers:{...baseHeaders,...headers}});}
function publicHeaders(request,type){return new Headers({...baseHeaders,...cors(request),...(type?{'Content-Type':type}:{})});}
function cancelBody(response){void response.body?.cancel().catch(()=>{});}

async function readBytes(body,limit,signal,timeout=CONNECT_TIMEOUT){
 if(!body)return new Uint8Array();
 const reader=body.getReader(),parts=[];let size=0;
 const deadline=Date.now()+timeout;
 try{for(;;){const next=await readNext(reader,signal,Math.max(1,deadline-Date.now()));if(next.done)break;size+=next.value.byteLength;if(size>limit)throw failure('INPUT_SIZE',413);parts.push(next.value);}}
 finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}return bytes;
}
function readNext(reader,signal,timeout){
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=(callback,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);callback(value);};
  const abort=()=>{void reader.cancel().catch(()=>{});finish(reject,failure('TIMEOUT',504));};
  if(signal?.aborted){abort();return;}
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(abort,timeout);
  reader.read().then(value=>finish(resolve,value),error=>finish(reject,error));
 });
}
async function requestInput(request){
 if(request.method!=='POST'||!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return null;
 if(Number(request.headers.get('content-length')||0)>MAX_INPUT)return null;
 try{const bytes=await readBytes(request.clone().body,MAX_INPUT,request.signal,5000),text=decoder.decode(bytes),input=JSON.parse(text);return plain(input)?{input,text}:null;}catch{return null;}
}
function eligible(input){
 const account=input?.account;if(!plain(account))return false;
 const mode=account.mode||'provider';
 if(mode==='provider')return true;
 if(mode!=='xtream')return false;
 try{const url=new URL(account.server||account.url);return url.origin===PROVIDER_ORIGIN&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password;}catch{return false;}
}
function providerURL(value){
 if(typeof value!=='string'||value.length>8192||/[\\\x00-\x20\x7f]/.test(value))throw failure();
 let url;try{url=new URL(value);}catch{throw failure();}
 if(url.origin!==PROVIDER_ORIGIN||url.username||url.password||url.hash)throw failure();return url.href;
}
function ownedMediaURL(value){
 if(typeof value!=='string'||value.length>MAX_OWNED_TOKEN+256||/[\\\x00-\x20\x7f]/.test(value))throw failure('MEDIA_TOKEN',403);
 let url;try{url=new URL(value,OWNED_ORIGIN);}catch{throw failure('MEDIA_TOKEN',403);}
 const entries=[...url.searchParams];
 if(url.origin!==OWNED_ORIGIN||url.pathname!=='/api/media'||url.username||url.password||url.hash||entries.length!==1||entries[0][0]!=='t'||!new RegExp('^[a-z0-9_-]{29,'+MAX_OWNED_TOKEN+'}$','i').test(entries[0][1]))throw failure('MEDIA_TOKEN',403);
 return url.href;
}
async function key(env){
 const secret=env.CLIENT_SECRET||env.RELAY_KEY;
 if(typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))throw failure('CONFIG',503);
 return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g),v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
function b64(bytes){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
const purpose=origin=>encoder.encode('abbeedo-owned-client-relay:v1:'+origin);
async function seal(url,exp,env,origin){
 const iv=crypto.getRandomValues(new Uint8Array(12)),plainText=encoder.encode(JSON.stringify({u:ownedMediaURL(url),exp}));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:purpose(origin)},await key(env),plainText)),bytes=new Uint8Array(12+encrypted.length);bytes.set(iv);bytes.set(encrypted,12);
 const token=TOKEN_PREFIX+b64(bytes);if(token.length>MAX_TOKEN)throw failure('MEDIA_TOKEN',403);return origin+'/api/media?t='+token;
}
async function unseal(token,env,origin){
 try{
  if(token.length>MAX_TOKEN||!/^r1\.[a-z0-9_-]+$/i.test(token))throw 0;
  const bytes=Uint8Array.from(atob(token.slice(TOKEN_PREFIX.length).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(bytes.length<29)throw 0;
  const payload=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:purpose(origin)},await key(env),bytes.slice(12))));
  if(!plain(payload)||Object.keys(payload).some(name=>!['u','exp'].includes(name))||!Number.isSafeInteger(payload.exp)||payload.exp<=Date.now()||payload.exp>Date.now()+MAX_AGE)throw 0;
  return {url:ownedMediaURL(payload.u),exp:payload.exp};
 }catch(error){if(error?.code==='CONFIG')throw error;throw failure('MEDIA_TOKEN',403);}
}

// A connection deadline applies to headers; body readers retain the same abort
// signal and impose their own bounded reads while preserving backpressure.
async function ownedFetch(url,env,{method='GET',body,range,signal}={}){
 if(url!==OWNED_ORIGIN+'/api/client')url=ownedMediaURL(url);
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,CONNECT_TIMEOUT);
 const headers={'Origin':OWNED_ORIGIN,'User-Agent':'abbeedo-TV/1.2',...(body?{'Content-Type':'application/json'}:{}),...(range?{'Range':range}:{})};
 try{
  const response=await (env.CLIENT_FALLBACK_FETCH||globalThis.fetch)(url,{method,headers,body,redirect:'manual',credentials:'omit',signal:controller.signal});
  if(controller.signal.aborted)throw failure('TIMEOUT',504);
  if(response.status>=300&&response.status<400){cancelBody(response);throw failure();}
  return {response,signal:controller.signal,cancel(){signal?.removeEventListener('abort',abort);controller.abort();}};
 }catch(error){const aborted=controller.signal.aborted;signal?.removeEventListener('abort',abort);controller.abort();throw isFailure(error)?error:failure(aborted?'TIMEOUT':'CLIENT_FALLBACK',aborted?504:502);}
 finally{clearTimeout(timer);}
}
async function ownedResolve(input,env,signal){
 const result=await ownedFetch(OWNED_ORIGIN+'/api/client',env,{method:'POST',body:JSON.stringify(input),signal});
 try{
  if(!result.response.ok||!/^application\/json(?:\s*;|$)/i.test(result.response.headers.get('content-type')||''))throw failure();
  let value;try{value=JSON.parse(decoder.decode(await readBytes(result.response.body,512*1024,result.signal)));}catch(error){throw isFailure(error)?error:failure();}
  if(!plain(value))throw failure();return value;
 }finally{result.cancel();}
}
function streamResponse(result,{headers,status=result.response.status,maximum=64*1024*1024,firstTimeout=6500,readTimeout=90000}={}){
 const reader=result.response.body?.getReader();if(!reader){result.cancel();return new Response(null,{status,headers});}
 let bytes=0,first=true,finished=false;
 const finish=()=>{if(!finished){finished=true;result.cancel();}};
 const body=new ReadableStream({async pull(controller){try{const next=await readNext(reader,result.signal,first?firstTimeout:readTimeout);first=false;if(next.done){controller.close();finish();return;}bytes+=next.value.byteLength;if(bytes>maximum)throw failure('UPSTREAM_SIZE',413);controller.enqueue(next.value);}catch(error){controller.error(error);void reader.cancel().catch(()=>{});finish();}},cancel(){void reader.cancel().catch(()=>{});finish();}});
 return new Response(body,{status,headers});
}
async function ownedProviderFetch(value,options,env){
 const url=providerURL(typeof value==='string'?value:value.url);
 if(options?.method&&options.method!=='GET')throw failure();
 const resolution=await ownedResolve({op:'resolve',kind:'live',account:{mode:'direct',url}},env,options?.signal);
 const result=await ownedFetch(ownedMediaURL(resolution.url),env,{signal:options?.signal});
 return streamResponse(result,{headers:new Headers({'Content-Type':result.response.headers.get('content-type')||'application/octet-stream'})});
}
async function blocked(response){
 if(response.status!==502||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))return false;
 try{return JSON.parse(decoder.decode(await readBytes(response.clone().body,4096,null))).code==='UPSTREAM_BLOCKED';}catch{return false;}
}

export async function handleOwnedClient(request,env){
 if(!configured(env))return handleClient(request,env);
 const parsed=await requestInput(request);
 const response=await handleClient(request,env);
 if(!parsed||!eligible(parsed.input))return response;
 if(parsed.input.op==='resolve'&&response.ok){
  let headers={};
  try{
   headers=cors(request);const resolution=await ownedResolve(parsed.input,env,request.signal),origin=new URL(request.url).origin;
   if(!Number.isSafeInteger(resolution.expiresAt)||resolution.expiresAt<=Date.now()||resolution.expiresAt>Date.now()+MAX_AGE)throw failure();
   const exp=resolution.expiresAt,url=await seal(resolution.url,exp,env,origin);
   if(resolution.alternatives!==undefined&&!Array.isArray(resolution.alternatives))throw failure();
   if((resolution.alternatives||[]).length>2)throw failure();
   const alternatives=await Promise.all((resolution.alternatives||[]).map(async item=>{if(!plain(item))throw failure();return {...item,url:await seal(item.url,exp,env,origin)};}));
   cancelBody(response);
   return Response.json({...resolution,url,alternatives},{headers:{...baseHeaders,...headers}});
  }catch(error){cancelBody(response);return errorResponse(error,headers);}
 }
 if(!await blocked(response))return response;
 cancelBody(response);
 // Retry only classified source blocking. Current parsing, authentication and
 // incremental catalogue output remain in the shared, unchanged worker.
 const retry=new Request(request.url,{method:request.method,headers:request.headers,body:parsed.text,signal:request.signal});
 return handleClient(retry,{...env,CLIENT_FETCH:(url,options)=>ownedProviderFetch(url,options,env)});
}
async function rewriteManifest(source,exp,env,origin){
 if(!source.trimStart().startsWith('#EXTM3U'))throw failure('MANIFEST');
 let count=0;const lines=[];
 const wrap=async value=>{if(++count>5000)throw failure('MANIFEST_SIZE',413);return seal(ownedMediaURL(value),exp,env,origin);};
 for(const line of source.split(/\r?\n/)){
  if(line.trim()&&!line.trimStart().startsWith('#')){lines.push(await wrap(line.trim()));continue;}
  const matches=[...line.matchAll(/\bURI="([^"]+)"/g)];
  // URI-bearing tags must use the quoted form rewritten below.
  if([...line.matchAll(/\bURI\s*=/g)].some(match=>!matches.some(valid=>valid.index===match.index)))throw failure('MANIFEST');
  let output=line;for(const match of matches)output=output.replace(match[0],'URI="'+await wrap(match[1])+'"');
  lines.push(output);
 }
 return lines.join('\n');
}
export async function handleOwnedClientMedia(request,env){
 const token=new URL(request.url).searchParams.get('t')||'';
 if(!token.startsWith(TOKEN_PREFIX))return handleClientMedia(request,env);
 let headers={};
 try{
  headers=cors(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...baseHeaders,...headers}});
  if(!['GET','HEAD'].includes(request.method))return Response.json({error:'Method not allowed',code:'METHOD'},{status:405,headers:{...baseHeaders,...headers}});
  if(!configured(env))throw failure('MEDIA_TOKEN',403);
  const origin=new URL(request.url).origin,payload=await unseal(token,env,origin),range=request.headers.get('range');
  if(range&&(!/^bytes=\d*-\d*$/.test(range)||range.length>100))throw failure('RANGE',416);
  const result=await ownedFetch(payload.url,env,{method:request.method,range,signal:request.signal}),response=result.response;
  if(!response.ok){cancelBody(response);result.cancel();return Response.json({error:'المصدر رفض التشغيل (HTTP '+response.status+').',code:'MEDIA_HTTP',httpStatus:response.status},{status:response.status>=400?response.status:502,headers:{...baseHeaders,...headers}});}
  const type=response.headers.get('content-type')||'application/octet-stream',output=publicHeaders(request,type);
  if(/mpegurl/i.test(type)&&request.method!=='HEAD'){
   try{const source=decoder.decode(await readBytes(response.body,2*1024*1024,result.signal,12000)),body=await rewriteManifest(source,payload.exp,env,origin);output.set('Content-Type','application/vnd.apple.mpegurl');return new Response(body,{headers:output});}
   finally{result.cancel();}
  }
  for(const name of ['content-length','content-range','accept-ranges','etag','last-modified'])if(response.headers.has(name))output.set(name,response.headers.get(name));
  if(request.method==='HEAD'){cancelBody(response);result.cancel();return new Response(null,{status:response.status,headers:output});}
  return streamResponse(result,{headers:output,readTimeout:12000,maximum:512*1024*1024});
 }catch(error){return errorResponse(error,headers);}
}
