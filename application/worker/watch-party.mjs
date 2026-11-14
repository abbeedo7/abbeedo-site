import {watchSniffMediaType} from './media-sniff.mjs';

// One invited browser, with provider URLs encrypted at rest and behind guest authentication.
const WATCH_TTL = 4 * 60 * 60 * 1000;
const WATCH_HEARTBEAT = 120000;
const WATCH_COOKIE = '__Host-abunasser_watch';
const watchHeaders = {'Cache-Control':'no-store, private','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const watchEncoder = new TextEncoder(), watchDecoder = new TextDecoder('utf-8', {fatal:true});
// The legacy relay uses the same owner secret. Bind this protocol explicitly
// so an opaque watch asset cannot be replayed as a public legacy relay token.
const watchPurpose = watchEncoder.encode('abunasser-watch:v1');
// Native players cannot read the browser's HttpOnly cookie. Their private,
// media-only capability belongs to a separate cryptographic protocol.
const watchExternalPurpose = watchEncoder.encode('abunasser-watch:external:v1');
const watchVideoCodecs = new Set(['video/avc','video/hevc','video/av01','video/x-vnd.on2.vp9','video/x-vnd.on2.vp8','video/mp4v-es','video/mpeg2']);
const watchAudioCodecs = new Set(['audio/mp4a-latm','audio/ac3','audio/eac3','audio/eac3-joc','audio/opus','audio/vorbis','audio/flac','audio/mpeg','audio/raw']);
const watchPlaybackTags = new Set([
  '#EXTM3U','#EXT-X-VERSION','#EXT-X-STREAM-INF','#EXT-X-I-FRAME-STREAM-INF','#EXT-X-MEDIA',
  '#EXTINF','#EXT-X-TARGETDURATION','#EXT-X-MEDIA-SEQUENCE','#EXT-X-DISCONTINUITY-SEQUENCE',
  '#EXT-X-ENDLIST','#EXT-X-PLAYLIST-TYPE','#EXT-X-I-FRAMES-ONLY','#EXT-X-DISCONTINUITY',
  '#EXT-X-KEY','#EXT-X-SESSION-KEY','#EXT-X-MAP','#EXT-X-BYTERANGE','#EXT-X-PROGRAM-DATE-TIME',
  '#EXT-X-INDEPENDENT-SEGMENTS','#EXT-X-START','#EXT-X-SERVER-CONTROL','#EXT-X-PART-INF',
  '#EXT-X-PART','#EXT-X-PRELOAD-HINT','#EXT-X-RENDITION-REPORT','#EXT-X-SKIP','#EXT-X-GAP',
  '#EXT-X-BITRATE','#EXT-X-ALLOW-CACHE',
]);
const watchRoomKey = id => 'watch-rooms/' + id + '.json';
const watchStateKey = id => 'watch-states/' + id + '.json';
const watchGuestKey = id => 'watch-guests/' + id + '.json';
const watchClosedKey = id => 'watch-closed/' + id + '.json';
const watchExternalKey = id => 'watch-external/' + id + '.json';
const watchId = value => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value || '');
const watchToken = value => /^[a-f0-9]{64}$/.test(value || '');
function watchJson(value,status=200,extra={}) { return Response.json(value,{status,headers:{...watchHeaders,...extra}}); }
function watchFail(status,code) { throw {status,code}; }
function watchHex(bytes) { return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join(''); }
function watchRandom() { return watchHex(crypto.getRandomValues(new Uint8Array(32))); }
async function watchHash(value) { return watchHex(new Uint8Array(await crypto.subtle.digest('SHA-256',watchEncoder.encode(value)))); }
function watchEqual(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let value=0;for(let i=0;i<a.length;i++)value|=a.charCodeAt(i)^b.charCodeAt(i);return value===0; }
function watchBase64(bytes) { let text='';for(const value of bytes)text+=String.fromCharCode(value);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function watchUnbase64(value) { if(typeof value!=='string'||value.length>24000||!/^[A-Za-z0-9_-]+$/.test(value))watchFail(403,'TOKEN');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)); }
async function watchCryptoKey(env) {
  if(typeof env.RELAY_KEY!=='string'||!/^[a-f0-9]{64}$/i.test(env.RELAY_KEY))watchFail(503,'CONFIG');
  return crypto.subtle.importKey('raw',Uint8Array.from(env.RELAY_KEY.match(/../g),value=>parseInt(value,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function watchClaimCookie(env,id,nonce) {
  if(typeof env.RELAY_KEY!=='string'||!/^[a-f0-9]{64}$/i.test(env.RELAY_KEY))watchFail(503,'CONFIG');
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(env.RELAY_KEY.match(/../g),value=>parseInt(value,16)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return watchHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,watchEncoder.encode('abunasser-watch:claim-cookie:v1\0'+id+'\0'+nonce))));
}
async function watchSeal(value,env,purpose=watchPurpose) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const body=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:purpose},await watchCryptoKey(env),watchEncoder.encode(JSON.stringify(value))));
  const bytes=new Uint8Array(iv.length+body.length);bytes.set(iv);bytes.set(body,iv.length);return watchBase64(bytes);
}
async function watchUnseal(value,env,purpose=watchPurpose) {
  try {const bytes=watchUnbase64(value);if(bytes.length<29)watchFail(403,'TOKEN');const body=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:purpose},await watchCryptoKey(env),bytes.slice(12));return JSON.parse(watchDecoder.decode(body));}
  catch(error){if(error?.status===503)throw error;watchFail(403,'TOKEN');}
}
export function watchAllowedUrl(value,env,origin) {
  let url;try {url=new URL(value);}catch {watchFail(400,'SOURCE_URL');}
  if(typeof value!=='string'||value.length>8192||!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||!['','80','443','2052','8080','8443','25461'].includes(url.port))watchFail(400,'SOURCE_URL');
  if(url.origin===origin) {
    if(!/^\/watch-demo(?:\d+)?\.(?:m3u8|ts|mp4|m4s)$/.test(url.pathname)||url.search)watchFail(400,'SOURCE_URL');
    return url;
  }
  const configured=typeof env.WATCH_ALLOWED_HOSTS==='string'?env.WATCH_ALLOWED_HOSTS.split(',').map(host=>host.trim().toLowerCase()).filter(Boolean):[];
  const allowed=new Set(['maglobalxx.xyz',...configured]);
  // Configuration is an exact public DNS hostname list, never wildcards or IP literals.
  if(!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)||/\.(?:localhost|local|internal|test|invalid)$/.test(url.hostname))watchFail(400,'SOURCE_URL');
  if(!allowed.has(url.hostname.toLowerCase()))throw {status:400,code:'SOURCE_HOST',blockedHost:url.hostname.toLowerCase()};
  return url;
}
// Redirect-only CDN grants never expand the creation allowlist. Literal public
// addresses avoid the DNS-rebinding gap of resolving a hostname before fetch.
export function watchPublicIp(host) {
  if(typeof host!=='string')return false;
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const parts=host.split('.'),octets=parts.map(Number);if(octets.some((n,i)=>n>255||String(n)!==parts[i]))return false;
    const [a,b,c]=octets;
    if(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31)return false;
    if(a===192&&(b===0&&[0,2].includes(c)||b===88&&c===99||b===168||b===31&&c===196||b===52&&c===193||b===175&&c===48))return false;
    if(a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)return false;
    return true;
  }
  if(!/^\[[0-9a-f:]+\]$/i.test(host))return false;
  const halves=host.slice(1,-1).toLowerCase().split('::');if(halves.length>2)return false;
  const left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  if([...left,...right].some(word=>!/^[0-9a-f]{1,4}$/.test(word)))return false;
  const missing=8-left.length-right.length;if(halves.length===1?missing!==0:missing<1)return false;
  const words=[...left,...Array(missing).fill('0'),...right].map(word=>parseInt(word,16));
  if((words[0]&0xe000)!==0x2000)return false;
  // Exclude transition tunnels, documentation and IANA protocol assignments.
  if(words[0]===0x2001&&(words[1]<=0x01ff||words[1]===0x0db8)||words[0]===0x2002||words[0]>=0x3ffe)return false;
  return true;
}
function watchCdnAddress(value) {
  // Check the original authority before URL canonicalization: WHATWG URLs
  // silently turn integer, hex and octal IPv4 spellings into dotted addresses.
  if(typeof value!=='string'||value.length>8192||/[\\\x00-\x20\x7f]/.test(value))watchFail(400,'SOURCE_URL');
  const literal=/^https?:\/\/(\[[0-9a-f:]+\]|[0-9]+(?:\.[0-9]+){3})(?::([0-9]+))?(?:[/?#]|$)/i.exec(value);
  if(!literal||!watchPublicIp(literal[1])||literal[2]&&!['80','443','2052','8080','8443','25461'].includes(literal[2]))watchFail(400,'SOURCE_URL');
  let url;try{url=new URL(value);}catch{watchFail(400,'SOURCE_URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||!watchPublicIp(url.hostname))watchFail(400,'SOURCE_URL');
  return url;
}
function watchCdnOrigins(value) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>5)watchFail(403,'TOKEN');
  try{return value.map(entry=>{const url=watchCdnAddress(entry);if(url.origin!==entry||value.indexOf(entry)!==value.lastIndexOf(entry))watchFail(403,'TOKEN');return entry;});}
  catch{watchFail(403,'TOKEN');}
}
function watchBlockedHost(error,value) {
  if(error?.code!=='SOURCE_HOST')throw error;
  let host;try{host=new URL(value).hostname;}catch{throw error;}
  if(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host))error.blockedHost=host;
  throw error;
}
function watchScopedUrl(value,env,origin,cdnOrigins=[]) {
  try{return watchAllowedUrl(value,env,origin);}catch(error){
    try{const url=watchCdnAddress(value);if(cdnOrigins.includes(url.origin))return url;}catch{}
    watchBlockedHost(error,value);
  }
}
function watchResolveUrl(value,base) {
  let url;try{url=new URL(value,base);}catch{watchFail(400,'SOURCE_URL');}
  if(/^\[|^\d+(?:\.\d+){3}$/.test(url.hostname)) {
    const raw=/^[a-z][a-z0-9+.-]*:/i.test(value)?value:value.startsWith('//')?new URL(base).protocol+value:/[\\\x00-\x20\x7f]/.test(value)?value:url.href;
    watchCdnAddress(raw);
  }
  return url;
}
function watchTrustedStream(value,env,origin) {
  let url;try{url=watchAllowedUrl(value,env,origin);}catch{return false;}
  if(url.origin===origin||url.search)return false;
  const match=/^\/(?:live|movie|series)\/([^/]{1,512})\/([^/]{1,512})\/[0-9]{1,15}\.(?:m3u8|m3u|ts|mp4|mkv|webm|m4v|mov|avi|flv|mpg|mpeg)$/i.exec(url.pathname);
  if(!match)return false;
  try{return match.slice(1).every(part=>!/[/\\\x00-\x1f\x7f]/.test(decodeURIComponent(part)));}catch{return false;}
}
async function watchBody(request,limit=14000) {
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))watchFail(415,'JSON');
  if(Number(request.headers.get('content-length')||0)>limit)watchFail(413,'SIZE');
  const reader=request.body?.getReader();if(!reader)watchFail(400,'INPUT');let size=0;const chunks=[];
  const deadline=Date.now()+10000;
  try {for(;;){const next=await watchReadChunk(reader,Math.max(1,deadline-Date.now()));if(next.done)break;size+=next.value.length;if(size>limit)watchFail(413,'SIZE');chunks.push(next.value);}}
  finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const value=JSON.parse(watchDecoder.decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value;}catch{watchFail(400,'INPUT');}
}
function watchFields(value,fields) { if(Object.keys(value).some(key=>!fields.includes(key)))watchFail(400,'INPUT'); }
function watchCodec(value,allowed) {if(value===undefined||value===null)return null;if(typeof value!=='string'||!allowed.has(value))watchFail(400,'INPUT');return value;}
function watchMedia(input,env,origin) {
  watchFields(input,['url','title','kind','videoCodec','audioCodec']);
  if(typeof input.title!=='string'||!input.title.trim()||input.title.length>180||/[\u0000-\u001f\u007f]/.test(input.title)||!['live','movie','episode'].includes(input.kind))watchFail(400,'INPUT');
  const url=watchAllowedUrl(input.url,env,origin);
  const mediaType=/\.m3u8$/i.test(url.pathname)?'application/vnd.apple.mpegurl':/\.mp4$/i.test(url.pathname)?'video/mp4':/\.webm$/i.test(url.pathname)?'video/webm':null;
  return {url:url.href,title:input.title.trim(),kind:input.kind,mediaType,videoCodec:watchCodec(input.videoCodec,watchVideoCodecs),audioCodec:watchCodec(input.audioCodec,watchAudioCodecs)};
}
function watchPlayback(input) {
  if(!Number.isSafeInteger(input.positionMs)||input.positionMs<0||input.positionMs>604800000||!Number.isSafeInteger(input.durationMs)||input.durationMs<0||input.durationMs>604800000||typeof input.playing!=='boolean'||typeof input.speed!=='number'||!Number.isFinite(input.speed)||input.speed<.25||input.speed>6||!Number.isSafeInteger(input.liveOffsetMs)||input.liveOffsetMs< -1||input.liveOffsetMs>86400000)watchFail(400,'INPUT');
  return {positionMs:input.positionMs,durationMs:input.durationMs,playing:input.playing,speed:input.speed,liveOffsetMs:input.liveOffsetMs,updatedAt:Date.now()};
}
async function watchRead(env,key) { const object=await env.BUCKET.get(key);if(!object)return null;try{return await object.json();}catch{watchFail(503,'STORAGE');} }
async function watchPut(env,key,value,extra={}) { return env.BUCKET.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},...extra}); }
async function watchRemove(env,id) { await env.BUCKET.delete(watchRoomKey(id));await Promise.all([env.BUCKET.delete(watchStateKey(id)),env.BUCKET.delete(watchGuestKey(id)),env.BUCKET.delete(watchExternalKey(id))]); }
async function watchLoad(env,id) {
  // Deleting a session must remain final even if an in-flight state update
  // completes after the delete. This tombstone outlives that room's expiry.
  if(await watchRead(env,watchClosedKey(id)))watchFail(410,'ENDED');
  const room=await watchRead(env,watchRoomKey(id));if(!room)watchFail(410,'ENDED');
  const state=await watchRead(env,watchStateKey(id));
  if(room.expiresAt<=Date.now()||!state||state.updatedAt+WATCH_HEARTBEAT<=Date.now()){await watchRemove(env,id);watchFail(410,'ENDED');}
  return {room,state};
}
function watchPublic(room,state) { return {id:room.id,title:room.title,kind:room.kind,mediaType:room.mediaType||null,videoCodec:room.videoCodec||null,audioCodec:room.audioCodec||null,mediaRevision:room.mediaRevision,expiresAt:room.expiresAt,mediaUrl:'/api/watch/rooms/'+room.id+'/media?r='+room.mediaRevision,state,serverNow:Date.now()}; }
async function watchHost(request,room) { const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');if(!watchToken(token)||!watchEqual(await watchHash(token),room.hostHash))watchFail(403,'HOST'); }
function watchCookie(request) { const value=(request.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-abunasser_watch=([a-f0-9]{64})(?:;|$)/);return value?.[1]; }
async function watchGuest(request,env,id) {const cookie=watchCookie(request),guest=await watchRead(env,watchGuestKey(id));if(!cookie||!guest||!watchEqual(await watchHash(cookie),guest.hash))watchFail(403,'GUEST');return guest;}
async function watchExternalGuest(token,env,room) {
  if(typeof token!=='string'||token.length>2048)watchFail(403,'TOKEN');
  const value=await watchUnseal(token,env,watchExternalPurpose),now=Date.now();
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['id','guestHash','revision','issuedAt','expiresAt'].includes(key))||value.id!==room.id||!watchToken(value.guestHash)||!Number.isSafeInteger(value.revision)||value.revision!==room.mediaRevision||!Number.isSafeInteger(value.issuedAt)||value.issuedAt<0||value.issuedAt>now||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now||value.expiresAt>room.expiresAt||value.expiresAt<=value.issuedAt||value.expiresAt-value.issuedAt>WATCH_TTL)watchFail(403,'TOKEN');
  const [guest,current]=await Promise.all([watchRead(env,watchGuestKey(room.id)),watchRead(env,watchExternalKey(room.id))]);
  const tokenHash=await watchHash(token);
  if(!guest||!watchEqual(guest.hash,value.guestHash)||!current||!watchEqual(current.hash,tokenHash)||current.revision!==value.revision||current.expiresAt!==value.expiresAt||!watchEqual(current.guestHash,guest.hash))watchFail(403,'TOKEN');
  return {...guest,externalHash:tokenHash,externalExpiresAt:value.expiresAt};
}
async function watchCreationLimit(request,env) {
  const now=Date.now(),window=Math.floor(now/900000),rateKey='watch-rate/'+await watchHash((request.headers.get('cf-connecting-ip')||'unknown')+':'+window);
  const rate=await watchRead(env,rateKey);if(rate?.count>=12)watchFail(429,'RATE');
  await watchPut(env,rateKey,{count:(rate?.count||0)+1,expiresAt:(window+2)*900000});
  const list=await env.BUCKET.list({prefix:'watch-rooms/',limit:129});let active=0;
  for(let offset=0;offset<list.objects.length;offset+=16) {
    const states=await Promise.all(list.objects.slice(offset,offset+16).map(async object=>{
      const id=object.key.slice('watch-rooms/'.length,-5);
      try{await watchLoad(env,id);return true;}catch(error){if(error?.status!==410)throw error;return false;}
    }));active+=states.filter(Boolean).length;
  }
  if(active>=128||list.truncated)watchFail(503,'BUSY');
  const oldRates=await env.BUCKET.list({prefix:'watch-rate/',limit:100});
  // Cleanup must not add hundreds of serial R2 round-trips to the Android
  // create request. Keep concurrency bounded below the worker subrequest cap.
  for(let offset=0;offset<oldRates.objects.length;offset+=16)await Promise.all(oldRates.objects.slice(offset,offset+16).map(async object=>{
    const value=await watchRead(env,object.key);if(value?.expiresAt<=now)await env.BUCKET.delete(object.key);
  }));
  const closed=await env.BUCKET.list({prefix:'watch-closed/',limit:256});
  for(let offset=0;offset<closed.objects.length;offset+=16)await Promise.all(closed.objects.slice(offset,offset+16).map(async object=>{
    const value=await watchRead(env,object.key);if(value?.expiresAt<=now)await env.BUCKET.delete(object.key);
  }));
}
function watchEmbeddedAsset(url,env,headers,method) {
  const asset=env.WATCH_DEMO_ASSETS[url.pathname];
  if(!asset)watchFail(502,'MEDIA');
  const bytes=Uint8Array.from(atob(asset.data),value=>value.charCodeAt(0));
  const output=new Headers({'Content-Type':asset.type,'Accept-Ranges':'bytes','Content-Length':String(bytes.length)});
  const range=headers.Range;
  if(range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||!bytes.length)watchFail(416,'RANGE');
    let start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));
    let end=match[1]?(match[2]?Number(match[2]):bytes.length-1):bytes.length-1;
    if(start>=bytes.length||end<start)watchFail(416,'RANGE');end=Math.min(end,bytes.length-1);
    output.set('Content-Range','bytes '+start+'-'+end+'/'+bytes.length);output.set('Content-Length',String(end-start+1));
    return new Response(method==='HEAD'?null:bytes.slice(start,end+1),{status:206,headers:output});
  }
  return new Response(method==='HEAD'?null:bytes,{headers:output});
}
async function watchFetch(url,env,origin,headers,method='GET',cdnOrigins=[],probe) {
  let current=watchScopedUrl(url,env,origin,cdnOrigins),approved=[...cdnOrigins];
  const trusted=approved.length>0||watchTrustedStream(url,env,origin);
  const deadline=Date.now()+(probe?4500:75000);
  for(let count=0;count<5;count++) {
    // Only the known public test clip can use embedded data; all real sources
    // still pass the exact provider allowlist and normal HTTP validation.
    if(current.origin===origin&&env.WATCH_DEMO_ASSETS)return {response:watchEmbeddedAsset(current,env,headers,method),url:current.href,cdnOrigins:approved};
    if(Date.now()>=deadline)watchFail(502,'MEDIA');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(15000,Math.max(1,deadline-Date.now())));let response;
    try {response=await fetch(current.href,{method,headers,redirect:'manual',signal:controller.signal});}finally{clearTimeout(timer);}
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('location'),cancelled=response.body?.cancel();if(probe)cancelled?.catch(()=>{});else await cancelled;if(!location)watchFail(502,'MEDIA');
      let target;try{target=new URL(location,current);}catch{watchFail(400,'SOURCE_URL');}
      if(probe){probe.redirectHost=target.hostname;probe.port=Number(target.port||(target.protocol==='http:'?80:443));}
      const next=watchResolveUrl(location,current).href;
      try{current=watchScopedUrl(next,env,origin,approved);}catch(error){
        if(!trusted)throw error;
        // Preserve the raw Location authority for the canonical-IP guard.
        let cdn;try{cdn=watchCdnAddress(/^[a-z][a-z0-9+.-]*:/i.test(location)?location:location.startsWith('//')?current.protocol+location:next);}catch{watchBlockedHost(error,next);}
        if(!approved.includes(cdn.origin)){if(approved.length>=5)watchFail(502,'MEDIA');approved.push(cdn.origin);}
        current=cdn;
      }
      continue;
    }
    if(response.status===416&&headers.Range)return {response,url:current.href,cdnOrigins:approved};
    if(!response.ok){if(probe)return {response,url:current.href,cdnOrigins:approved};await response.body?.cancel();watchFail(502,'MEDIA');}
    return {response,url:current.href,cdnOrigins:approved};
  }
  watchFail(502,'MEDIA');
}
async function watchManifest(response,limit=1024*1024) {
  if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();watchFail(502,'MANIFEST');}
  const reader=response.body?.getReader();if(!reader)watchFail(502,'MANIFEST');const chunks=[];let size=0;
  const deadline=Date.now()+15000;
  try {for(;;){const next=await watchReadChunk(reader,Math.max(1,deadline-Date.now()));if(next.done)break;size+=next.value.length;if(size>limit)watchFail(502,'MANIFEST');chunks.push(next.value);}}
  finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length;}
  try {return watchDecoder.decode(bytes);}catch{watchFail(502,'MANIFEST');}
}
async function watchAssetUrl(value,base,room,env,origin,externalToken,cdnOrigins) {
  const url=watchScopedUrl(watchResolveUrl(value,base).href,env,origin,cdnOrigins).href;
  const token=await watchSeal({url,id:room.id,revision:room.mediaRevision,expiresAt:room.expiresAt,...(cdnOrigins.length?{cdnOrigins}:{})},env);
  return '/api/watch/rooms/'+room.id+'/asset?t='+token+(externalToken?'&e='+externalToken:'');
}
async function watchRewrite(text,base,room,env,origin,externalToken,cdnOrigins=[]) {
  if(!text.trimStart().startsWith('#EXTM3U'))watchFail(502,'MANIFEST');
  if(/\{\$/.test(text))watchFail(502,'MANIFEST');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);if(lines.length>10000)watchFail(502,'MANIFEST');
  const result=[];let outputSize=0,assets=0;
  const add=line=>{outputSize+=line.length;if(outputSize>4*1024*1024)watchFail(502,'MANIFEST');result.push(line);};
  for(const rawLine of lines) {
    const line=rawLine.trim();
    if(line&&!line.startsWith('#')){if(++assets>4096)watchFail(502,'MANIFEST');add(await watchAssetUrl(line,base,room,env,origin,externalToken,cdnOrigins));}
    else {
      // Session data, comments, ad metadata and unknown extensions are not
      // required to decode the video and may echo provider account details.
      if(line.startsWith('#')&&!watchPlaybackTags.has(line.split(':',1)[0]))continue;
      let rewritten=line;
      for(const match of line.matchAll(/URI="([^"]+)"/g)){if(++assets>4096)watchFail(502,'MANIFEST');rewritten=rewritten.replace(match[0],'URI="'+await watchAssetUrl(match[1],base,room,env,origin,externalToken,cdnOrigins)+'"');}
      // Optional titles/comments are not needed for playback and may echo a
      // provider URL. Other URL-valued attributes are scoped as opaque assets.
      if(rewritten.startsWith('#EXTINF:'))rewritten=rewritten.split(',')[0]+',';
      for(const match of rewritten.matchAll(/([A-Z0-9-]+)="(https?:\/\/[^\"]+)"/g)){if(++assets>4096)watchFail(502,'MANIFEST');rewritten=rewritten.replace(match[0],match[1]+'="'+await watchAssetUrl(match[2],base,room,env,origin,externalToken,cdnOrigins)+'"');}
      if(/https?:\/\//i.test(rewritten))watchFail(502,'MANIFEST');
      add(rewritten);
    }
  }
  return result.join('\n');
}
async function watchReadChunk(reader,timeout=20000) {
  let timer;
  try {return await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject({status:502,code:'MEDIA'}),timeout);})]);}
  finally {clearTimeout(timer);}
}
async function watchPeek(response) {
  const reader=response.body?.getReader();if(!reader)watchFail(502,'MEDIA');
  const chunks=[];let length=0,ended=false;
  try {
    while(length<512&&!ended) {
      const next=await watchReadChunk(reader);ended=next.done;
      if(!ended){chunks.push(next.value);length+=next.value.length;}
    }
  } catch(error){await reader.cancel().catch(()=>{});throw error;}
  const prefix=new Uint8Array(Math.min(length,512));let at=0;
  for(const chunk of chunks){const take=Math.min(chunk.length,prefix.length-at);prefix.set(chunk.subarray(0,take),at);at+=take;if(at===prefix.length)break;}
  let index=0;
  const body=new ReadableStream({
    async pull(controller) {
      if(index<chunks.length){controller.enqueue(chunks[index++]);return;}
      if(ended){controller.close();return;}
      try{const next=await reader.read();if(next.done)controller.close();else controller.enqueue(next.value);}
      catch{await reader.cancel().catch(()=>{});controller.error(new Error('Media stream unavailable'));}
    },
    cancel(reason){return reader.cancel(reason);},
  });
  return {response:new Response(body,{status:response.status,headers:response.headers}),prefix};
}
function watchRevocableBody(response,env,id,cookieHash,revision,externalHash,externalExpiresAt) {
  const reader=response.body?.getReader();if(!reader)return null;let checked=Date.now();
  return new ReadableStream({
    async pull(controller) {
      try {
        if(externalHash&&Date.now()>=externalExpiresAt)watchFail(403,'TOKEN');
        if(Date.now()-checked>=5000) {
          const [{room},guest,current]=await Promise.all([watchLoad(env,id),watchRead(env,watchGuestKey(id)),externalHash?watchRead(env,watchExternalKey(id)):null]);
          if(room.mediaRevision!==revision||!guest||!watchEqual(guest.hash,cookieHash))watchFail(410,'ENDED');
          if(externalHash&&(!current||!watchEqual(current.hash,externalHash)))watchFail(403,'TOKEN');
          checked=Date.now();
        }
        const next=await watchReadChunk(reader);if(next.done)controller.close();else controller.enqueue(next.value);
      } catch {await reader.cancel().catch(()=>{});controller.error(new Error('Watch session ended'));}
    },
    cancel(reason) {return reader.cancel(reason);},
  });
}
function watchStoredSource(value,room) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['url','id','revision'].includes(key))||value.id!==room.id||!Number.isSafeInteger(value.revision)||value.revision!==room.mediaRevision)watchFail(403,'TOKEN');
  return value.url;
}
async function watchMediaResponse(request,env,origin,room,guest,assetToken,externalToken) {
  let source,cdnOrigins=[];
  if(assetToken!==null) {
    const asset=await watchUnseal(assetToken,env);
    if(!asset||typeof asset!=='object'||Array.isArray(asset)||Object.keys(asset).some(key=>!['url','id','revision','expiresAt','cdnOrigins'].includes(key))||asset.id!==room.id||!Number.isSafeInteger(asset.revision)||asset.revision!==room.mediaRevision||!Number.isSafeInteger(asset.expiresAt)||asset.expiresAt!==room.expiresAt||asset.expiresAt<=Date.now())watchFail(403,'TOKEN');
    cdnOrigins=watchCdnOrigins(asset.cdnOrigins);
    try{source=watchScopedUrl(asset.url,env,origin,cdnOrigins).href;}catch{watchFail(403,'TOKEN');}
  } else {
    const stored=await watchUnseal(room.source,env);
    source=watchAllowedUrl(watchStoredSource(stored,room),env,origin).href;
  }
  const range=request.headers.get('range');if(range&&!/^bytes=(?:[0-9]{1,15}-[0-9]{0,15}|-[0-9]{1,15})$/.test(range))watchFail(416,'RANGE');
  const headers={Accept:'*/*','User-Agent':'Abunasser-TV-Watch/3.8'};
  if(range&&!/\.m3u8(?:\?|$)/i.test(source))headers.Range=range;
  const fetched=await watchFetch(source,env,origin,headers,request.method,cdnOrigins);let response=fetched.response;
  if(response.status===416) {
    const contentRange=response.headers.get('content-range');await response.body?.cancel();
    return new Response(null,{status:416,headers:{...watchHeaders,...(/^bytes \*\/[0-9]{1,15}$/.test(contentRange||'')?{'Content-Range':contentRange}:{})}});
  }
  let type=(response.headers.get('content-type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
  let hls=/mpegurl/.test(type)||/\.m3u8(?:\?|$)/i.test(fetched.url);
  if(request.method!=='HEAD') {
    // A provider may label a playlist as octet-stream, or return an HTML login
    // error with HTTP200. Inspect a bounded prefix before exposing any bytes.
    const peeked=await watchPeek(response);response=peeked.response;
    const beginning=new TextDecoder().decode(peeked.prefix).replace(/^\uFEFF/,'').trimStart();
    if(beginning.startsWith('#EXTM3U'))hls=true;
    else if(/^(?:<!doctype\s+html|<html\b|<\?xml\b|<MPD\b|\{\s*"|\[\s*\{)/i.test(beginning)) {await response.body.cancel();watchFail(502,'MEDIA');}
    else type=watchSniffMediaType(peeked.prefix,type);
  }
  if(hls) {
    if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{headers:{...watchHeaders,'Content-Type':'application/vnd.apple.mpegurl'}});}
    const text=await watchManifest(response);
    return new Response(await watchRewrite(text,fetched.url,room,env,origin,externalToken,fetched.cdnOrigins),{headers:{...watchHeaders,'Content-Type':'application/vnd.apple.mpegurl'}});
  }
  if(!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4|vnd\.apple\.mpegurl))/.test(type)){await response.body?.cancel();watchFail(502,'MEDIA');}
  const output=new Headers({...watchHeaders,'Content-Type':type,'Content-Disposition':'inline'});
  const contentRange=response.headers.get('content-range'),length=response.headers.get('content-length');
  if(/^bytes [0-9]{1,15}-[0-9]{1,15}\/[0-9]{1,15}$/.test(contentRange||''))output.set('Content-Range',contentRange);
  if(response.headers.get('accept-ranges')?.toLowerCase()==='bytes')output.set('Accept-Ranges','bytes');
  if(/^[0-9]{1,15}$/.test(length||''))output.set('Content-Length',length);
  if(request.method==='HEAD'){await response.body?.cancel();return new Response(null,{status:response.status,headers:output});}
  return new Response(watchRevocableBody(response,env,room.id,guest.hash,room.mediaRevision,guest.externalHash,guest.externalExpiresAt),{status:response.status,headers:output});
}
function watchDiagnosticAllowed(request,env,url) {
  const key=env.WATCH_DIAGNOSTIC_KEY,until=env.WATCH_DIAGNOSTIC_UNTIL,now=Date.now();
  if(request.method!=='GET'||url.search||typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key)||typeof until!=='string'||!/^[0-9]{1,16}$/.test(until))return false;
  const deadline=Number(until);
  if(!Number.isSafeInteger(deadline)||deadline<=now||deadline>now+1800000)return false;
  return watchEqual(request.headers.get('authorization')||'','Bearer '+key);
}
async function watchDiagnostics(env,origin) {
  const list=await env.BUCKET.list({prefix:'watch-rooms/',limit:128}),records=[];
  // R2 lists by key, and room IDs are random. Inspect only one bounded page,
  // then use upload timestamps (or creation times) to choose the newest six.
  for(let offset=0;offset<list.objects.length;offset+=16) {
    const batch=await Promise.all(list.objects.slice(offset,offset+16).map(async object=>{
      if(!/^watch-rooms\/[a-f0-9-]{36}\.json$/.test(object.key))return null;
      try {
        const room=await watchRead(env,object.key);if(!room||!watchId(room.id)||object.key!==watchRoomKey(room.id))return null;
        const uploaded=object.uploaded?new Date(object.uploaded).getTime():NaN;
        return {room,time:Number.isFinite(uploaded)?uploaded:Number.isSafeInteger(room.createdAt)?room.createdAt:0};
      } catch{return null;}
    }));records.push(...batch.filter(Boolean));
  }
  const recent=records.sort((a,b)=>b.time-a.time).slice(0,6),probes=[];
  // Keep provider requests below five seconds each and at most two in flight.
  for(let offset=0;offset<recent.length;offset+=2)probes.push(...await Promise.all(recent.slice(offset,offset+2).map(async({room})=>{
    const probe={sourceHost:null,redirectHost:null,port:null,code:'UNAVAILABLE'};
    try {
      const value=watchStoredSource(await watchUnseal(room.source,env),room);
      const parsed=new URL(value);
      if(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(parsed.hostname))probe.sourceHost=parsed.hostname;
      probe.port=Number(parsed.port||(parsed.protocol==='http:'?80:443));
      const source=watchAllowedUrl(value,env,origin).href;
      const fetched=await watchFetch(source,env,origin,{Accept:'*/*','User-Agent':'Abunasser-TV-Watch/3.8',Range:'bytes=0-0'},'GET',[],probe);
      fetched.response.body?.cancel().catch(()=>{});probe.code='HTTP_'+fetched.response.status;
    } catch(error){probe.code=['SOURCE_HOST','SOURCE_URL','TOKEN','MEDIA','MANIFEST','CONFIG','STORAGE'].includes(error?.code)?error.code:'UNAVAILABLE';}
    return probe;
  })));
  return watchJson({probes});
}

export async function watchParty(request,env) {
  const url=new URL(request.url),diagnostic=url.pathname==='/api/watch/rooms/diagnostics',match=diagnostic?[]:/^\/api\/watch\/rooms(?:\/([a-f0-9-]+)(?:\/(state|claim|sync|media|asset|external))?)?$/.exec(url.pathname);
  if(diagnostic&&!watchDiagnosticAllowed(request,env,url))return watchJson({error:'المسار غير موجود.'},404);
  if(!match)return watchJson({error:'المسار غير موجود.'},404);
  if(!env.BUCKET)return watchJson({error:'خدمة المشاهدة غير متاحة الآن.',code:'CONFIG'},503);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return watchJson({error:'الطلب غير مسموح.'},403);
  try {
    if(diagnostic)return await watchDiagnostics(env,url.origin);
    const id=match[1],operation=match[2];
    if(!id) {
      if(request.method!=='POST')watchFail(405,'METHOD');if(url.search)watchFail(400,'INPUT');
      const input=await watchBody(request);watchFields(input,['url','title','kind','videoCodec','audioCodec','positionMs','durationMs','playing','speed','liveOffsetMs']);
      const media=watchMedia({url:input.url,title:input.title,kind:input.kind,videoCodec:input.videoCodec,audioCodec:input.audioCodec},env,url.origin),state=watchPlayback(input);
      await watchCryptoKey(env);await watchCreationLimit(request,env);
      const roomId=crypto.randomUUID(),hostToken=watchRandom(),inviteToken=watchRandom(),expiresAt=Date.now()+WATCH_TTL;
      const room={id:roomId,title:media.title,kind:media.kind,mediaType:media.mediaType,videoCodec:media.videoCodec,audioCodec:media.audioCodec,mediaRevision:1,createdAt:Date.now(),expiresAt,hostHash:await watchHash(hostToken),inviteHash:await watchHash(inviteToken),sourceHash:await watchHash(media.url),source:await watchSeal({url:media.url,id:roomId,revision:1},env)};
      await watchPut(env,watchStateKey(roomId),state);await watchPut(env,watchRoomKey(roomId),room);
      return watchJson({id:roomId,hostToken,inviteToken,expiresAt,watchUrl:url.origin+'/watch.html#id='+roomId+'&token='+inviteToken},201);
    }
    if(!watchId(id))watchFail(404,'ENDED');
    if(operation==='asset') {if(!url.searchParams.has('t')||url.searchParams.size!==(url.searchParams.has('e')?2:1)||[...url.searchParams.keys()].some(key=>!['t','e'].includes(key)))watchFail(400,'INPUT');}
    else if(operation==='media') {if(url.searchParams.size>2||[...url.searchParams.keys()].some(key=>!['r','e'].includes(key))||url.searchParams.has('r')&&!/^[0-9]{1,8}$/.test(url.searchParams.get('r')||'')||url.searchParams.getAll('e').length>1||url.searchParams.getAll('r').length>1)watchFail(400,'INPUT');}
    else if(url.search)watchFail(400,'INPUT');
    const {room,state}=await watchLoad(env,id);
    if(operation==='claim') {
      if(request.method!=='POST')watchFail(405,'METHOD');
      // Browser claims require an explicit same-origin Origin header.
      if(origin!==url.origin)watchFail(403,'GUEST');
      const input=await watchBody(request,512);watchFields(input,['token','nonce']);
      if(input.nonce!==undefined&&!watchToken(input.nonce))watchFail(400,'INPUT');
      if(!watchToken(input.token)||!watchEqual(await watchHash(input.token),room.inviteHash))watchFail(403,'GUEST');
      const existingCookie=watchCookie(request),nonceHash=input.nonce?await watchHash(input.nonce):null;
      const cookie=existingCookie||(input.nonce?await watchClaimCookie(env,id,input.nonce):watchRandom()),hash=await watchHash(cookie);
      // A browser can safely repeat a claim after losing the Set-Cookie response.
      // The invite alone cannot reproduce a cookie; the browser's private nonce
      // and the server key are also required, and neither is stored in plaintext.
      const matches=guest=>guest&&watchEqual(guest.hash,hash)&&(existingCookie||!nonceHash||watchEqual(guest.nonceHash,nonceHash));
      const existing=await watchRead(env,watchGuestKey(id));
      if(existing&&!matches(existing))watchFail(409,'CLAIMED');
      if(!existing) {
        // R2 conditionally creates this separate object, so simultaneous claims
        // cannot overwrite one another or an owner playback-state update.
        const created=await watchPut(env,watchGuestKey(id),{hash,...(!existingCookie&&nonceHash?{nonceHash}:{}),expiresAt:room.expiresAt},{onlyIf:{etagDoesNotMatch:'*'}});
        if(!created){const winner=await watchRead(env,watchGuestKey(id));if(!matches(winner))watchFail(409,'CLAIMED');}
      }
      return watchJson(watchPublic(room,state),200,{'Set-Cookie':WATCH_COOKIE+'='+cookie+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+Math.max(1,Math.floor((room.expiresAt-Date.now())/1000))});
    }
    if(operation==='external') {
      if(request.method!=='POST')watchFail(405,'METHOD');
      if(origin!==url.origin)watchFail(403,'GUEST');
      const input=await watchBody(request,128);watchFields(input,[]);
      const guest=await watchGuest(request,env,id),issuedAt=Date.now(),expiresAt=room.expiresAt;
      const token=await watchSeal({id,guestHash:guest.hash,revision:room.mediaRevision,issuedAt,expiresAt},env,watchExternalPurpose);
      // Only the newest native link remains valid. No IP binding: Safari's
      // Private Relay and VLC may use different egress addresses on one phone.
      await watchPut(env,watchExternalKey(id),{hash:await watchHash(token),guestHash:guest.hash,revision:room.mediaRevision,expiresAt});
      return watchJson({mediaUrl:url.origin+'/api/watch/rooms/'+id+'/media?r='+room.mediaRevision+'&e='+token,expiresAt});
    }
    if(operation==='sync'||operation==='media'||operation==='asset') {
      if(!['GET','HEAD'].includes(request.method)||operation==='sync'&&request.method!=='GET')watchFail(405,'METHOD');
      const externalToken=operation!=='sync'&&url.searchParams.has('e')?url.searchParams.get('e'):null;
      const guest=externalToken!==null?await watchExternalGuest(externalToken,env,room):await watchGuest(request,env,id);
      if(operation==='sync')return watchJson(watchPublic(room,state));
      return await watchMediaResponse(request,env,url.origin,room,guest,operation==='asset'?url.searchParams.get('t'):null,externalToken);
    }
    await watchHost(request,room);
    if(!operation&&request.method==='GET')return watchJson(watchPublic(room,state));
    if(!operation&&request.method==='DELETE'){await watchPut(env,watchClosedKey(id),{expiresAt:room.expiresAt+WATCH_HEARTBEAT});await watchRemove(env,id);return watchJson({ok:true});}
    if(operation==='state'&&request.method==='PUT') {
      const input=await watchBody(request);watchFields(input,['positionMs','durationMs','playing','speed','liveOffsetMs','media']);const next=watchPlayback(input);
      if(input.media) {
        const media=watchMedia(input.media,env,url.origin),hash=await watchHash(media.url);
        if(hash!==room.sourceHash){room.sourceHash=hash;room.mediaRevision++;room.source=await watchSeal({url:media.url,id,revision:room.mediaRevision},env);}
        room.title=media.title;room.kind=media.kind;room.mediaType=media.mediaType;room.videoCodec=media.videoCodec;room.audioCodec=media.audioCodec;await watchPut(env,watchRoomKey(id),room);
      }
      await watchPut(env,watchStateKey(id),next);return watchJson(watchPublic(room,next));
    }
    watchFail(405,'METHOD');
  } catch(error) {
    const status=Number.isInteger(error?.status)?error.status:503,code=error?.code||'UNAVAILABLE';
    const messages={ENDED:'انتهت جلسة المشاهدة أو غادر صاحبها.',CLAIMED:'الرابط مرتبط بمتصفح صديق آخر. اطلب رابطًا جديدًا.',SOURCE:'المصدر غير مهيأ للمشاركة. تواصل مع الدعم.',SOURCE_HOST:'خادم اشتراكك غير مفعّل للمشاهدة المشتركة بعد. أرسل اسم خادم المصدر للدعم لتفعيله.',SOURCE_URL:'عنوان المصدر أو منفذه غير مدعوم للمشاهدة المشتركة.',MEDIA:'تعذّر تشغيل المصدر. قد يقيّد المزود الاتصالات الإضافية أو صيغة الفيديو.',MANIFEST:'صيغة قائمة البث غير مدعومة للمشاركة.',RATE:'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.',BUSY:'خدمة المشاهدة مشغولة الآن.',HOST:'جلسة المالك غير صالحة.',GUEST:'رابط المشاهدة غير صالح أو يحتاج فتح الدعوة.',TOKEN:'انتهت صلاحية رابط الفيديو.',RANGE:'نطاق الفيديو غير صالح.',CONFIG:'خدمة المشاهدة غير مهيأة.',SIZE:'الطلب أكبر من الحد المسموح.',INPUT:'بيانات الطلب غير صالحة.',JSON:'يلزم إرسال JSON.',METHOD:'طريقة الطلب غير مدعومة.'};
    const blockedHost=code==='SOURCE_HOST'&&typeof error.blockedHost==='string'&&/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(error.blockedHost)?error.blockedHost:null;
    return watchJson({error:messages[code]||'تعذّر الاتصال بخدمة المشاهدة. حاول مجددًا.',code,...(blockedHost?{blockedHost}:{})},status);
  }
}
