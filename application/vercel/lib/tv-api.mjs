// Public, cookie-free API presentation for packaged TVs. The app ID is a
// context hint, not authentication: every provider login and capability is
// still validated by the existing API, and browser guest/admin routes stay out.
export const TV_APP_IDS=Object.freeze(['com.abbeedo.tv.app','AbbeedoTV1.tv']);
const APP_HEADER='x-abbeedo-tv-app';
const PAIR_ID='[A-Za-z0-9_-]{22}';
const ROOM_ID='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const allowedHeaders=new Set(['accept','authorization','content-type','range','if-range','if-none-match',APP_HEADER]);
const baseHeaders={'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const exposed='Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag';

export function tvRoute(path){
  if(path==='/api/tv/client')return {path:'/api/client',kind:'client',methods:['POST']};
  if(path==='/api/tv/media')return {path:'/api/media',kind:'media',methods:['GET','HEAD']};
  if(path==='/api/tv/announcements')return {path:'/api/announcements',kind:'announcements',methods:['GET']};
  if(path==='/api/tv/device-pairings')return {path:'/api/device-pairings',kind:'pair',methods:['POST']};
  const pair=new RegExp('^/api/tv/device-pairings/('+PAIR_ID+')(?:/(ack|commands(?:/ack)?|state))?$').exec(path);
  if(pair){
    const operation=pair[2],methods=!operation?['GET','POST','DELETE']:operation==='commands'||operation==='state'?['GET','POST']:['POST'];
    return {path:path.replace('/api/tv/','/api/'),kind:'pair',methods,bearer:true};
  }
  if(path==='/api/tv/watch/rooms')return {path:'/api/watch/rooms',kind:'host',methods:['POST']};
  const room=new RegExp('^/api/tv/watch/rooms/('+ROOM_ID+')(?:/(state))?$','i').exec(path);
  if(room)return {path:path.replace('/api/tv/','/api/'),kind:'host',methods:room[2]?['PUT']:['GET','DELETE'],bearer:true};
  return null;
}

function corsHeaders(origin,methods=[]){
  return {...baseHeaders,'Access-Control-Allow-Origin':origin||'null','Vary':'Origin',
    'Access-Control-Allow-Methods':[...methods,'OPTIONS'].join(', '),
    'Access-Control-Allow-Headers':'Accept, Authorization, Content-Type, Range, If-Range, If-None-Match, X-Abbeedo-TV-App',
    'Access-Control-Expose-Headers':exposed,'Access-Control-Max-Age':'600'};
}
function failure(code,status=403,origin,methods=[]){
  return Response.json({error:'هذا الاتصال غير متاح لتطبيق التلفزيون.',code},{status,headers:corsHeaders(origin,methods)});
}
function admittedOrigin(request,url){
  const origin=request.headers.get('origin');
  return origin===null||origin==='null'||origin==='file://'||origin===url.origin?origin||'null':null;
}
function mediaURL(value,origin){
  if(typeof value!=='string'||value.length>32768)return value;
  try{const url=new URL(value);if(url.origin!==origin||url.pathname!=='/api/media')return value;url.pathname='/api/tv/media';return url.href;}catch{return value;}
}
export function rewriteTVMediaText(text,origin){
  // HLS URIs are either an entire line or the value of a quoted URI attribute.
  return text.split('\n').map(line=>{
    const trimmed=line.trim();
    if(trimmed&&!trimmed.startsWith('#')){
      const changed=mediaURL(trimmed,origin);
      return changed===trimmed?line:line.replace(trimmed,changed);
    }
    return line.replace(/URI="([^"]+)"/g,(all,value)=>{const changed=mediaURL(value,origin);return changed===value?all:'URI="'+changed+'"';});
  }).join('\n');
}

// Streaming JSON/NDJSON string-token rewriting keeps large catalogues flowing.
// Only a complete string which IS an own-origin media URL is changed; a URL
// embedded in a provider URL or a plot sentence is left byte-for-byte intact.
export function tvJSONBody(body,origin){
  const decoder=new TextDecoder(),encoder=new TextEncoder();
  let inString=false,escaped=false,passthrough=false,pending='';
  function process(text){
    const output=[];
    for(const character of text){
      if(!inString){
        if(character==='"'){inString=true;escaped=false;passthrough=false;pending='"';}
        else output.push(character);
        continue;
      }
      if(passthrough)output.push(character);else pending+=character;
      if(!escaped&&character==='"'){
        if(!passthrough){
          try{const value=JSON.parse(pending),changed=mediaURL(value,origin);output.push(changed===value?pending:JSON.stringify(changed));}
          catch{output.push(pending);}
        }
        inString=false;pending='';escaped=false;passthrough=false;
      }else{
        if(character==='\\')escaped=!escaped;else escaped=false;
        if(!passthrough&&pending.length>131072){output.push(pending);pending='';passthrough=true;}
      }
    }
    return output.join('');
  }
  return body.pipeThrough(new TransformStream({
    transform(chunk,controller){const text=process(decoder.decode(chunk,{stream:true}));if(text)controller.enqueue(encoder.encode(text));},
    flush(controller){let text=process(decoder.decode());if(pending)text+=pending;if(text)controller.enqueue(encoder.encode(text));}
  }));
}
async function hlsText(response,maximum=2*1024*1024){
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maximum)throw Error('TV_MANIFEST_SIZE');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>maximum)throw Error('TV_MANIFEST_SIZE');parts.push(next.value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let index=0;for(const part of parts){bytes.set(part,index);index+=part.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
async function tvResponse(response,{origin,methods,request}){
  const headers=new Headers(response.headers);
  headers.delete('set-cookie');headers.delete('access-control-allow-credentials');
  for(const [key,value]of Object.entries(corsHeaders(origin,methods)))headers.set(key,value);
  if(!response.body||request.method==='HEAD')return new Response(null,{status:response.status,statusText:response.statusText,headers});
  const type=headers.get('content-type')||'';
  if(/(?:application|text)\/(?:[\w.+-]*\+)?json|application\/(?:x-)?ndjson/i.test(type)){
    headers.delete('content-length');headers.delete('etag');
    return new Response(tvJSONBody(response.body,new URL(request.url).origin),{status:response.status,statusText:response.statusText,headers});
  }
  if(/mpegurl/i.test(type)){
    const body=rewriteTVMediaText(await hlsText(response),new URL(request.url).origin);
    headers.delete('content-length');headers.delete('etag');
    return new Response(body,{status:response.status,statusText:response.statusText,headers});
  }
  // Audio/video/range bytes retain their streaming body, status and lengths.
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export async function routeTVAPI(request,env,route){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/tv/'))return null;
  const descriptor=tvRoute(url.pathname);
  if(!descriptor)return failure('TV_ROUTE',404);
  const origin=admittedOrigin(request,url);
  if(origin===null)return failure('TV_ORIGIN',403);
  const method=request.method.toUpperCase(),headers=request.headers;
  if(method==='OPTIONS'){
    const intended=(headers.get('access-control-request-method')||'').toUpperCase();
    const requested=(headers.get('access-control-request-headers')||'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
    if(!descriptor.methods.includes(intended)||requested.some(value=>!allowedHeaders.has(value))||descriptor.kind!=='media'&&!requested.includes(APP_HEADER))return failure('TV_PREFLIGHT',403,origin,descriptor.methods);
    return new Response(null,{status:204,headers:corsHeaders(origin,descriptor.methods)});
  }
  if(!descriptor.methods.includes(method))return failure('TV_METHOD',405,origin,descriptor.methods);
  if(descriptor.kind==='media'){
    const tokens=url.searchParams.getAll('t');
    if(tokens.length!==1||[...url.searchParams.keys()].some(key=>key!=='t')||!/^[a-z\d_-]{40,24000}$/i.test(tokens[0]))return failure('TV_MEDIA_TOKEN',403,origin,descriptor.methods);
  }else{
    if(!TV_APP_IDS.includes(headers.get(APP_HEADER)))return failure('TV_CONTEXT',403,origin,descriptor.methods);
    if(url.search)return failure('TV_QUERY',400,origin,descriptor.methods);
    if(descriptor.bearer&&!(descriptor.kind==='pair'?/^Bearer [A-Za-z0-9_-]{43}$/:/^Bearer [a-f0-9]{64}$/i).test(headers.get('authorization')||''))return failure('TV_BEARER',403,origin,descriptor.methods);
  }
  if(typeof route!=='function')return failure('TV_CONFIG',503,origin,descriptor.methods);
  const clean=new Headers();
  for(const name of ['accept','authorization','content-type','range','if-range','if-none-match','cf-connecting-ip'])if(headers.has(name))clean.set(name,headers.get(name));
  url.pathname=descriptor.path;
  try{
    const inner=new Request(url,{method,headers:clean,signal:request.signal,...(!['GET','HEAD'].includes(method)&&request.body?{body:request.body,duplex:'half'}:{})});
    const result=await route(inner,env);
    if(!(result instanceof Response))throw Error('TV_RESPONSE');
    return await tvResponse(result,{origin,methods:descriptor.methods,request});
  }catch{return failure('TV_UNAVAILABLE',502,origin,descriptor.methods);}
}
export const createTVRouter=({route}={})=>(request,env)=>routeTVAPI(request,env,route);
