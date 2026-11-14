/** Temporary encrypted device pairing and owner-only Watch Together sessions. */
import * as Native from './native.js';
const DEFAULT_ORIGIN='https://abunasser-apple-web.m05871268.chatgpt.site';
const PAIR_ROOT='/api/device-pairings', WATCH_ROOT='/api/watch/rooms';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const PAIR_ID=/^[A-Za-z0-9_-]{22}$/,PAIR_SECRET=/^[A-Za-z0-9_-]{43}$/;
const ROOM_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,ROOM_TOKEN=/^[a-f0-9]{64}$/;
const COMMANDS=new Set(['up','down','left','right','ok','back','home','play_pause','volume_down','volume_up','previous_channel','next_channel','seek','search','export_settings','import_settings','resume_playback']);
const VIDEO_CODECS=new Set(['video/avc','video/hevc','video/av01','video/x-vnd.on2.vp9','video/x-vnd.on2.vp8','video/mp4v-es','video/mpeg2']);
const AUDIO_CODECS=new Set(['audio/mp4a-latm','audio/ac3','audio/eac3','audio/eac3-joc','audio/opus','audio/vorbis','audio/flac','audio/mpeg','audio/raw']);
const messages={CLOSED:'انتهت الجلسة.',ABORTED:'أُلغي الطلب.',TIMEOUT:'انتهت مهلة الاتصال. حاول مجددًا.',NETWORK:'تعذر الاتصال بالخدمة.',PROTOCOL:'رد الخدمة غير متوافق.',INPUT:'تحقق من بيانات الطلب.',SIZE:'البيانات أكبر من الحد المسموح.',CRYPTO:'المتصفح لا يدعم التشفير المطلوب.',DECRYPT:'تعذر التحقق من البيانات المشفرة.',PAIR_EXPIRED:'انتهت جلسة الربط. أنشئ رمزًا جديدًا.',PAIR_AUTH:'رابط الربط غير صالح.',RATE:'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.',BUSY:'انتظر اكتمال الطلب السابق.',CONFIG:'الخدمة غير مهيأة حاليًا.',SOURCE_HOST:'خادم المصدر غير مفعّل للمشاهدة المشتركة. تواصل مع الدعم.',SOURCE_URL:'هذا المصدر غير متاح للمشاركة.',HOST:'جلسة المالك غير صالحة.',ENDED:'انتهت جلسة المشاهدة.',MEDIA:'المصدر لم يقبل تشغيل المشاركة.',MANIFEST:'صيغة البث غير متوافقة مع المشاركة.',STORAGE:'تعذر حفظ الجلسة.',UNAVAILABLE:'الخدمة غير متاحة الآن.'};
export class ConnectError extends Error{constructor(code='NETWORK',status=0){super(messages[code]||messages.NETWORK);this.name='ConnectError';this.code=code;this.status=status;}}
function safeHttp(value,base){let u;try{u=new URL(value,base);}catch{throw new ConnectError('SOURCE_URL');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.href.length>8192)throw new ConnectError('SOURCE_URL');return u.href;}
function encode64(value){let text='';for(const byte of value)text+=String.fromCharCode(byte);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decode64(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length>131072)throw new ConnectError('DECRYPT');try{return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{throw new ConnectError('DECRYPT');}}
// A custom WKWebView URL scheme may not expose SubtleCrypto. Keep pairing
// cryptography inside the native CryptoKit bridge in that case, without ever
// placing the QR key in a network request or persistent browser storage.
function nativePairCrypto(){
 const keys=new WeakMap();
 const invoke=async(op,payload={})=>{const result=await Native.nativeRequest('pairCrypto',{op,...payload});if(!result||typeof result.data!=='string')throw new ConnectError('CRYPTO');return decode64(result.data);};
 const valueOf=value=>value instanceof ArrayBuffer?new Uint8Array(value):ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;
 const crypt=async(op,algorithm,key,data)=>{const raw=keys.get(key),iv=valueOf(algorithm?.iv),bytes=valueOf(data);if(algorithm?.name!=='AES-GCM'||!raw||iv?.length!==12||!bytes||bytes.length>98304)throw new ConnectError('CRYPTO');return (await invoke(op,{key:encode64(raw),iv:encode64(iv),data:encode64(bytes)})).buffer;};
 return {
  randomBytes:async count=>{if(!Number.isInteger(count)||count<1||count>64)throw new ConnectError('CRYPTO');if(globalThis.crypto?.getRandomValues)return globalThis.crypto.getRandomValues(new Uint8Array(count));const bytes=await invoke('random',{count});if(bytes.length!==count)throw new ConnectError('CRYPTO');return bytes;},
  subtle:{
   digest:async(algorithm,data)=>{if((typeof algorithm==='string'?algorithm:algorithm?.name)!=='SHA-256')throw new ConnectError('CRYPTO');const bytes=valueOf(data);if(!bytes||bytes.length>98304)throw new ConnectError('CRYPTO');const result=await invoke('digest',{data:encode64(bytes)});if(result.length!==32)throw new ConnectError('CRYPTO');return result.buffer;},
   importKey:async(format,data,algorithm)=>{const bytes=valueOf(data);if(format!=='raw'||algorithm?.name!=='AES-GCM'||bytes?.length!==32)throw new ConnectError('CRYPTO');const key=Object.freeze({type:'secret',algorithm:Object.freeze({name:'AES-GCM',length:256})});keys.set(key,bytes.slice());return key;},
   encrypt:(algorithm,key,data)=>crypt('encrypt',algorithm,key,data),
   decrypt:(algorithm,key,data)=>crypt('decrypt',algorithm,key,data),
  },
 };
}
async function randomBytes(crypto,count){if(crypto?.randomBytes)return crypto.randomBytes(count);if(crypto?.getRandomValues)return crypto.getRandomValues(new Uint8Array(count));throw new ConnectError('CRYPTO');}
function bounded(value,min,max,fallback=min){return Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;}
function accountValue(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ConnectError('INPUT');
 let mode=raw.type||raw.mode||'provider';if(['abbeedo','abunasser'].includes(mode))mode='provider';if(!['provider','xtream','m3u','stalker'].includes(mode))throw new ConnectError('INPUT');
 const server=safeHttp(mode==='provider'?'http://maglobalxx.xyz:2052':String(raw.server||raw.url||'').trim());
 let username=String(raw.username||raw.user||'').trim(),password=String(raw.password||''),mac='';
 if(mode==='stalker'){mac=String(raw.mac||username).trim().toUpperCase();if(!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac))throw new ConnectError('INPUT');username=mac;password='';}
 else if(mode==='m3u'){username='';password='';}else if(!username||!password)throw new ConnectError('INPUT');
 if(server.length>4096||username.length>512||password.length>2048)throw new ConnectError('SIZE');
 return {mode,type:mode,server,...(mode==='m3u'?{url:server}:{}),username,user:username,password,mac,name:String(raw.name|| (mode==='provider'?'اشتراك أبوناصر':mode==='m3u'?'M3U':username)).trim().slice(0,80)};
}
class Transport{
 constructor(options={}){
  const native=Native.isNative();this.fetch=options.fetch||(native?((...args)=>Native.nativeFetch(...args)):globalThis.fetch?.bind(globalThis));this.crypto=options.crypto||(native&&!globalThis.crypto?.subtle?nativePairCrypto():globalThis.crypto);this.now=options.now||Date.now;this.timeout=options.timeoutMs||8000;this.document=options.document===undefined?globalThis.document:options.document;this.events=options.events===undefined?globalThis:options.events;this.schedule=options.setTimeout||globalThis.setTimeout.bind(globalThis);this.unschedule=options.clearTimeout||globalThis.clearTimeout.bind(globalThis);this.controllers=new Set();this.timer=null;this.paused=!!this.document?.hidden;this.epoch=0;
  const browserOrigin=globalThis.location?.origin,configured=globalThis.ABUNASSER_CONFIG?.apiOrigin;const current=options.origin||configured||(/^https?:\/\//.test(browserOrigin||'')?browserOrigin:DEFAULT_ORIGIN);this.origin=new URL(current).origin;if(!/^https?:$/.test(new URL(this.origin).protocol))throw new ConnectError('INPUT');
  this.visibility=()=>this.document?.hidden?this.pause():this.resume();this.leaving=()=>{void this.close().catch(()=>{});};this.document?.addEventListener?.('visibilitychange',this.visibility);this.events?.addEventListener?.('pagehide',this.leaving);
 }
 clearTimer(){if(this.timer!==null)this.unschedule(this.timer);this.timer=null;}
 abort(){for(const c of this.controllers)c.abort();this.controllers.clear();}
 pause(){this.paused=true;this.clearTimer();this.abort();}
 resume(){this.paused=false;}
 destroy(){this.document?.removeEventListener?.('visibilitychange',this.visibility);this.events?.removeEventListener?.('pagehide',this.leaving);return this.close();}
 async request(path,method='GET',token,body,{independent=false}={}){
  const c=new AbortController();if(!independent)this.controllers.add(c);let timedOut=false;
  const timer=this.schedule(()=>{timedOut=true;c.abort();},this.timeout);
  try{
   const response=await this.fetch(new URL(path,this.origin).href,{method,signal:c.signal,redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(Number(response.headers.get('content-length'))>131072){await response.body?.cancel().catch(()=>{});throw new ConnectError('SIZE');}
   let bytes;
   if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>131072)throw new ConnectError('SIZE');chunks.push(part.value);}bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength;}}finally{await reader.cancel().catch(()=>{});}}
   else{bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>131072)throw new ConnectError('SIZE');}
   let data;try{data=bytes.length?JSON.parse(decoder.decode(bytes)):{};}catch{throw new ConnectError('PROTOCOL',response.status);}
   if(!response.ok){const code=Object.hasOwn(messages,data.code)?data.code:response.status===429?'RATE':response.status===403?'PAIR_AUTH':response.status===404?'PAIR_EXPIRED':response.status>=500?'UNAVAILABLE':'INPUT';throw new ConnectError(code,response.status);}
   if(!data||typeof data!=='object'||Array.isArray(data))throw new ConnectError('PROTOCOL');return data;
  }catch(error){if(error instanceof ConnectError)throw error;if(timedOut)throw new ConnectError('TIMEOUT');if(c.signal.aborted)throw new ConnectError('ABORTED');throw new ConnectError('NETWORK');}
  finally{this.unschedule(timer);this.controllers.delete(c);}
 }
}
export class PairingClient extends Transport{
 #session=null;#key=null;#receive=null;#failures=0;#lastCommand=0;#delivered=false;#polling=false;
 get active(){return !!this.#session&&this.#session.expiresAt>this.now();}
 get expiresAt(){return this.#session?.expiresAt||0;}
 get url(){return this.#session?.url||'';}
 async create({deviceName='ابوناصر TV · متصفح',deviceId,mac}={}){
  await this.close();if(!this.crypto?.subtle)throw new ConnectError('CRYPTO');const epoch=++this.epoch;
  const random=n=>randomBytes(this.crypto,n);const id=encode64(await random(16)),token=encode64(await random(32)),key=await random(32);
  if(!mac)mac='00:1A:79:'+Array.from(await random(3),b=>b.toString(16).padStart(2,'0')).join(':').toUpperCase();
  const name=String(deviceName).trim();if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name)||! /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac))throw new ConnectError('INPUT');
  deviceId=deviceId||encode64(await random(16));if(!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId))throw new ConnectError('INPUT');
  const tokenHash=Array.from(new Uint8Array(await this.crypto.subtle.digest('SHA-256',encoder.encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  const keyObject=await this.crypto.subtle.importKey('raw',key,{name:'AES-GCM'},false,['encrypt','decrypt']);const url=this.origin+'/pair.html#'+new URLSearchParams({id,token,key:encode64(key)});key.fill(0);
  const session={id,token,url,expiresAt:this.now()+1200000};this.#session=session;this.#key=keyObject;this.#lastCommand=0;this.#delivered=false;this.#failures=0;
  try{const data=await this.request(PAIR_ROOT,'POST',null,{id,tokenHash,deviceName:name,deviceId,mac});if(data.id!==id||!Number.isFinite(data.expiresAt)||data.expiresAt<=this.now())throw new ConnectError('PROTOCOL');session.expiresAt=Math.min(data.expiresAt,this.now()+1200000);if(epoch!==this.epoch){await this.request(PAIR_ROOT+'/'+id,'DELETE',token,undefined,{independent:true}).catch(()=>{});throw new ConnectError('CLOSED');}return {id,url,expiresAt:session.expiresAt,deviceId,mac};}
  catch(error){if(this.#session===session){this.#session=null;this.#key=null;await this.request(PAIR_ROOT+'/'+session.id,'DELETE',session.token,undefined,{independent:true}).catch(()=>{});}throw error;}
 }
 async #encrypt(value,max=65536){const data=encoder.encode(JSON.stringify(value));if(data.length>max)throw new ConnectError('SIZE');const iv=await randomBytes(this.crypto,12);return {iv:encode64(iv),ciphertext:encode64(new Uint8Array(await this.crypto.subtle.encrypt({name:'AES-GCM',iv},this.#key,data)))};}
 async #decrypt(envelope){try{const iv=decode64(envelope?.iv),cipher=decode64(envelope?.ciphertext);if(iv.length!==12||cipher.length<16||cipher.length>98304)throw new Error();const plain=await this.crypto.subtle.decrypt({name:'AES-GCM',iv},this.#key,cipher);return JSON.parse(decoder.decode(plain));}catch{throw new ConnectError('DECRYPT');}}
 startReceiving(callbacks={}){if(typeof callbacks==='function')callbacks={onAccount:callbacks};if(typeof callbacks.onAccount!=='function')throw new ConnectError('INPUT');this.#receive=callbacks;this.#failures=0;this.clearTimer();if(this.active&&!this.paused)void this.#poll();return()=>this.stopReceiving();}
 stopReceiving(){this.#receive=null;this.clearTimer();this.abort();}
 resume(){super.resume();if(this.#receive&&this.active&&!this.#polling)void this.#poll();}
 async receive(){
  if(!this.active){await this.close();throw new ConnectError('PAIR_EXPIRED');}const session=this.#session,epoch=this.epoch;
  const info=await this.request(PAIR_ROOT+'/'+session.id,'GET',session.token);if(epoch!==this.epoch||this.#session!==session)throw new ConnectError('CLOSED');
  if(!['waiting','submitted','received'].includes(info.status)||info.id!==session.id||!Number.isFinite(info.expiresAt))throw new ConnectError('PROTOCOL');
  let receivedAccount=null;session.expiresAt=Math.min(session.expiresAt,info.expiresAt);if(session.expiresAt<=this.now()){await this.close();throw new ConnectError('PAIR_EXPIRED');}
  this.#receive?.onStatus?.({status:info.status,expiresAt:session.expiresAt});
  if(info.status==='submitted'&&info.payload){const account=accountValue(await this.#decrypt(info.payload));receivedAccount=account;if(!this.#delivered){await this.#receive?.onAccount?.(account);if(epoch!==this.epoch)throw new ConnectError('CLOSED');this.#delivered=true;}await this.request(PAIR_ROOT+'/'+session.id+'/ack','POST',session.token,{});info.status='received';}
  if(info.status==='received'){
   if(this.#receive?.onCommand){const data=await this.request(PAIR_ROOT+'/'+session.id+'/commands','GET',session.token);if(epoch!==this.epoch)throw new ConnectError('CLOSED');if(!Array.isArray(data.commands)||data.commands.length>25)throw new ConnectError('PROTOCOL');let through=this.#lastCommand;
    for(const envelope of data.commands){if(!Number.isSafeInteger(envelope?.id)||envelope.id<=through)continue;through=envelope.id;let command;try{command=await this.#decrypt(envelope);}catch{continue;}if(COMMANDS.has(command?.action)&&Number.isFinite(command.createdAt)&&Math.abs(this.now()-command.createdAt)<120000){await this.#receive.onCommand({action:command.action,value:command.value,createdAt:command.createdAt});if(epoch!==this.epoch)throw new ConnectError('CLOSED');}}
    if(through>this.#lastCommand){await this.request(PAIR_ROOT+'/'+session.id+'/commands/ack','POST',session.token,{through});this.#lastCommand=through;}}
   if(this.#receive?.getState){const state=await this.#receive.getState();if(epoch!==this.epoch)throw new ConnectError('CLOSED');if(state&&typeof state==='object')await this.request(PAIR_ROOT+'/'+session.id+'/state','POST',session.token,await this.#encrypt(state));}
  }
  return {status:info.status,expiresAt:session.expiresAt,...(receivedAccount?{account:receivedAccount}:{})};
 }
 async #poll(){if(this.#polling||!this.#receive||this.paused)return;if(!this.active){this.#receive?.onError?.(new ConnectError('PAIR_EXPIRED'));await this.close();return;}this.#polling=true;const epoch=this.epoch;try{await this.receive();this.#failures=0;}catch(error){if(error.code!=='ABORTED'&&epoch===this.epoch){this.#receive?.onError?.(error);if([403,404,410].includes(error.status)||++this.#failures>=3)await this.close();}}finally{this.#polling=false;if(epoch===this.epoch&&this.#receive&&this.active&&!this.paused)this.timer=this.schedule(()=>{this.timer=null;void this.#poll();},2000);}}
 async close(){++this.epoch;this.clearTimer();this.abort();const session=this.#session;this.#session=null;this.#key=null;this.#receive=null;this.#delivered=false;if(session)await this.request(PAIR_ROOT+'/'+session.id,'DELETE',session.token,undefined,{independent:true}).catch(()=>{});}
}
function watchMedia(item,resolved,origin){
 const source=resolved?.sourceUrl||resolved?.sourceURL||resolved?.upstream||item?.url||resolved?.url;
 const url=safeHttp(source,origin),kind=item?.kind==='episode'?'episode':item?.kind==='movie'?'movie':item?.kind==='live'?'live':'';
 if(!kind||new URL(url).pathname.startsWith('/api/media'))throw new ConnectError('SOURCE_URL');
 const media={url,title:String(item?.name||item?.title||'المحتوى').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,180),kind};
 if(VIDEO_CODECS.has(resolved?.videoCodec))media.videoCodec=resolved.videoCodec;if(AUDIO_CODECS.has(resolved?.audioCodec))media.audioCodec=resolved.audioCodec;return media;
}
function watchState(snapshot={},kind){return {positionMs:Math.round(bounded(snapshot.positionMs??(Number(snapshot.currentTime)||0)*1000,0,604800000)),durationMs:Math.round(bounded(snapshot.durationMs??(Number(snapshot.duration)||0)*1000,0,604800000)),playing:!!(snapshot.playing??snapshot.isPlaying),speed:kind==='live'?1:bounded(snapshot.speed??snapshot.rate,0.25,6,1),liveOffsetMs:Math.round(bounded(snapshot.liveOffsetMs,-1,86400000,-1))};}
export class WatchHost extends Transport{
 #session=null;#media=null;#creating=false;#updating=null;#pending=null;#sample=null;#onError=null;#failures=0;
 get active(){return !!this.#session&&this.#session.expiresAt>this.now();}
 get joinURL(){return this.#session?.joinURL||'';}
 get expiresAt(){return this.#session?.expiresAt||0;}
 async create(item,resolved,{snapshot={}}={}){
  if(this.#creating)throw new ConnectError('BUSY');this.#creating=true;
  try{await this.close();const media=watchMedia(item,resolved,this.origin),epoch=++this.epoch;const data=await this.request(WATCH_ROOT,'POST',null,{...media,...watchState(snapshot,media.kind)});const valid=ROOM_ID.test(data.id)&&ROOM_TOKEN.test(data.hostToken)&&ROOM_TOKEN.test(data.inviteToken)&&data.hostToken!==data.inviteToken&&Number.isFinite(data.expiresAt)&&data.expiresAt>this.now();
   if(!valid||data.watchUrl!==this.origin+'/watch.html#id='+data.id+'&token='+data.inviteToken){if(ROOM_ID.test(data.id)&&ROOM_TOKEN.test(data.hostToken))await this.request(WATCH_ROOT+'/'+data.id,'DELETE',data.hostToken,undefined,{independent:true}).catch(()=>{});throw new ConnectError('PROTOCOL');}const session={id:data.id,hostToken:data.hostToken,joinURL:data.watchUrl,expiresAt:Math.min(data.expiresAt,this.now()+14400000)};
   if(epoch!==this.epoch){await this.request(WATCH_ROOT+'/'+session.id,'DELETE',session.hostToken,undefined,{independent:true}).catch(()=>{});throw new ConnectError('CLOSED');}
   this.#session=session;this.#media=media;this.#failures=0;return {id:session.id,joinURL:session.joinURL,watchUrl:session.joinURL,expiresAt:session.expiresAt};
  }finally{this.#creating=false;}
 }
 async update(snapshot={},item,resolved){
  if(!this.active)throw new ConnectError('ENDED');this.#pending={snapshot,item,resolved};if(this.#updating)return this.#updating;const epoch=this.epoch;
  this.#updating=(async()=>{while(this.#pending&&this.active&&epoch===this.epoch&&!this.paused){const pending=this.#pending;this.#pending=null;const session=this.#session;const media=pending.item?watchMedia(pending.item,pending.resolved,this.origin):this.#media;const changed=JSON.stringify(media)!==JSON.stringify(this.#media);await this.request(WATCH_ROOT+'/'+session.id+'/state','PUT',session.hostToken,{...watchState(pending.snapshot,media.kind),...(changed?{media}:{})});if(epoch!==this.epoch)throw new ConnectError('CLOSED');this.#media=media;this.#failures=0;}})();
  try{return await this.#updating;}catch(error){if(error.code!=='ABORTED'&&epoch===this.epoch){if([403,404,410].includes(error.status)||++this.#failures>=3)await this.close();}throw error;}finally{this.#updating=null;}
 }
 startHeartbeat(sample,{onError}={}){if(typeof sample!=='function')throw new ConnectError('INPUT');this.#sample=sample;this.#onError=onError;this.clearTimer();if(this.active&&!this.paused)void this.#pulse();return()=>{this.#sample=null;this.clearTimer();};}
 async #pulse(){if(!this.#sample||this.paused)return;if(!this.active){this.#onError?.(new ConnectError('ENDED'));await this.close();return;}const epoch=this.epoch;try{const sampled=await this.#sample();if(sampled?.item)await this.update(sampled.snapshot||sampled,sampled.item,sampled.resolved);else await this.update(sampled||{});}catch(error){if(error.code!=='ABORTED'&&epoch===this.epoch)this.#onError?.(error);}finally{if(epoch===this.epoch&&this.#sample&&this.active&&!this.paused)this.timer=this.schedule(()=>{this.timer=null;void this.#pulse();},2000);}}
 resume(){super.resume();if(this.#sample&&this.active)void this.#pulse();else if(this.#session&&!this.active)void this.close();}
 async close(){++this.epoch;this.clearTimer();this.abort();const session=this.#session;this.#session=null;this.#media=null;this.#sample=null;this.#pending=null;this.#failures=0;if(session)await this.request(WATCH_ROOT+'/'+session.id,'DELETE',session.hostToken,undefined,{independent:true}).catch(()=>{});}
}
