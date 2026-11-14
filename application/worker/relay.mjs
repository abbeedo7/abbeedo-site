const HOST='maglobalxx.xyz';
const enc=new TextEncoder(),dec=new TextDecoder();
const noCache={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export function validate(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.hostname!==HOST||u.username||u.password||!['','80','443','2052'].includes(u.port))throw Error('هذا الاتصال الوسيط مخصص لسيرفر الاشتراك المحدد فقط.');return u}
async function key(env){if(!env.RELAY_KEY)throw Error('الاتصال الوسيط غير مهيأ.');return crypto.subtle.importKey('raw',Uint8Array.from(env.RELAY_KEY.match(/../g),s=>parseInt(s,16)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
export async function seal(url,env){validate(url);const iv=crypto.getRandomValues(new Uint8Array(12));const body=enc.encode(JSON.stringify({url,exp:Date.now()+12*3600000}));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),body));return b64(new Uint8Array([...iv,...encrypted]))}
async function unseal(token,env){const bytes=unb64(token);const payload=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await key(env),bytes.slice(12))));if(!payload||typeof payload!=='object'||typeof payload.url!=='string'||!Number.isSafeInteger(payload.exp)||payload.exp<=Date.now())throw Error('انتهت جلسة البث أو أنها غير صالحة؛ أعد فتح القناة.');return validate(payload.url)}
export async function upstream(url,headers={}){let current=validate(url);for(let n=0;n<5;n++){const response=await fetch(current.href,{headers,redirect:'manual',signal:AbortSignal.timeout(25000)});if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('تحويل غير صالح من السيرفر.');const next=new URL(location,current);if(next.hostname!==HOST)throw Error('RELAY_REDIRECT_HOST:'+next.hostname);current=validate(next.href);continue}return {response,url:current.href}}throw Error('تحويلات كثيرة من السيرفر.')}
async function boundedText(response,limit=24*1024*1024){const reader=response.body.getReader();let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('القائمة أكبر من الحد المسموح.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}return dec.decode(all)}
export async function rewrite(text,base,env){const output=[];for(const line of text.split(/\r?\n/)){if(line.trim()&&!line.startsWith('#'))output.push('/api/stream?t='+await seal(validate(new URL(line.trim(),base).href).href,env));else {let value=line;const matches=[...line.matchAll(/URI="([^"]+)"/g)];for(const m of matches)value=value.replace(m[0],'URI="/api/stream?t='+await seal(validate(new URL(m[1],base).href).href,env)+'"');output.push(value)}}return output.join('\n')}
export async function relay(request,env){try{const path=new URL(request.url).pathname;
 if(path==='/api/relay'){
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  if(request.headers.get('origin')!==new URL(request.url).origin)return new Response('Forbidden',{status:403});
  if(!(request.headers.get('content-type')||'').includes('application/json'))return new Response('JSON required',{status:415});
  const input=await request.text();if(input.length>16384)throw Error('الطلب كبير جدًا.');const {url,stream}=JSON.parse(input);validate(url);
  if(stream)return Response.json({url:'/api/stream?t='+await seal(url,env)},{headers:noCache});
  const {response}=await upstream(url);if(!response.ok){await response.body?.cancel();return Response.json({error:'رفض سيرفر الاشتراك الطلب (HTTP '+response.status+').'}, {status:502,headers:noCache})}
  return new Response(await boundedText(response),{headers:{...noCache,'Content-Type':'text/plain; charset=utf-8'}});
 }
 if(path==='/api/stream'){
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const token=new URL(request.url).searchParams.get('t');if(!token||token.length>20000)throw Error('جلسة بث غير صالحة.');const url=await unseal(token,env);
  const headers={};if(request.headers.has('range')&&!/\.m3u8(?:\?|$)/i.test(url.href))headers.Range=request.headers.get('range');
  const result=await upstream(url.href,headers),r=result.response;
  if(!r.ok){await r.body?.cancel();throw Error('RELAY_UPSTREAM_STATUS:'+r.status)}
  const type=r.headers.get('content-type')||'application/octet-stream';const hls=/mpegurl/i.test(type)||/\.m3u8(?:\?|$)/i.test(result.url);
  if(hls){const text=await boundedText(r,2*1024*1024);if(!text.trimStart().startsWith('#EXTM3U'))throw Error('RELAY_INVALID_MANIFEST');return new Response(await rewrite(text,result.url,env),{headers:{...noCache,'Content-Type':'application/vnd.apple.mpegurl'}})}
  const out=new Headers(noCache);out.set('Content-Type',type);for(const name of ['content-range','accept-ranges','content-length'])if(r.headers.has(name))out.set(name,r.headers.get(name));
  if(request.method==='HEAD'){await r.body?.cancel();return new Response(null,{status:r.status,headers:out})}
  return new Response(r.body,{status:r.status,headers:out});
 }
 return new Response('Not found',{status:404});
 }catch(error){
 let code='RELAY_CONNECTION',message='تعذّر الاتصال بسيرفر الفيديو. حاول مجددًا.';
 const detail=String(error.message||'');
 if(detail.startsWith('RELAY_REDIRECT_HOST:')){code='RELAY_REDIRECT_HOST';message='مزودك يحوّل الفيديو إلى سيرفر آخر غير مهيأ: '+detail.split(':')[1]+'. أرسل صورة هذه الرسالة لإضافة السيرفر.'}
 else if(detail.startsWith('RELAY_UPSTREAM_STATUS:')){code='RELAY_UPSTREAM_STATUS';message='سيرفر الفيديو رفض التشغيل برمز HTTP '+detail.split(':')[1]+'. تحقق من عمل القناة ووجود جلسة أخرى مفتوحة للاشتراك.'}
 else if(detail==='RELAY_INVALID_MANIFEST'){code=detail;message='السيرفر أعاد محتوى غير صالح بدل قائمة HLS؛ قد لا يدعم هذا البث صيغة M3U8.'}
 else if(detail.includes('مخصص')){code='RELAY_DESTINATION';message='رابط من روابط البث يستخدم سيرفرًا أو منفذًا غير مهيأ في الوسيط.'}
 else if(error.name==='TimeoutError'||error.name==='AbortError'){code='RELAY_TIMEOUT';message='انتهت مهلة الاتصال بسيرفر الفيديو.'}
 else if(detail.includes('جلسة')){code='RELAY_SESSION';message='جلسة البث غير صالحة أو انتهت. أعد فتح القناة.'}
 console.error(JSON.stringify({code,route:new URL(request.url).pathname}));
 return Response.json({error:message,code},{status:502,headers:noCache})}}
