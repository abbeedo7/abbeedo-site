/* Shared HTML media controller. It remuxes supported containers; it never claims to transcode codecs. */
const VENDOR = {hls: new URL('hls.min.js', document.baseURI).href, ts: new URL('mpegts.min.js', document.baseURI).href};
const scripts = new Map();
const MIME_HLS = /(?:mpegurl|^hls$)/i;
const MIME_TS = /(?:mp2t|mpegts|x-m2ts|x-flv|^flv$)/i;
const RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6]);
export {RATES};

export function mediaType(source = {}) {
  const mime = String(source.mime || source.type || '').split(';')[0].trim().toLowerCase();
  if (MIME_HLS.test(mime)) return 'hls';
  if (MIME_TS.test(mime)) return /flv/.test(mime) ? 'flv' : 'ts';
  if (mime && /^(video|audio)\//.test(mime)) return 'file';
  try { const path = new URL(String(source.url), 'https://app.invalid').pathname.toLowerCase();
    if (/\.m3u8?$/.test(path)) return 'hls';
    if (/\.(ts|mts|m2ts)$/.test(path)) return 'ts';
    if (/\.flv$/.test(path)) return 'flv';
  } catch {}
  return 'file';
}

export function validMediaURL(value, {offline = false, base = globalThis.location?.href || 'https://app.invalid/'} = {}) {
  try { const url = new URL(String(value), base);
    if (offline && url.protocol === 'blob:') return url.href;
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (globalThis.location?.protocol === 'https:' && url.protocol === 'http:') return null;
    return url.href;
  } catch { return null; }
}

export function boundedAlternatives(source = {}) {
  const initial = validMediaURL(source.url, source); if (!initial) return [];
  const seen = new Set([initial]); const output = [{...source, url: initial}];
  // Only explicit candidates issued by the repository are considered. Never fabricate another URL/account.
  for (const candidate of Array.isArray(source.alternatives) ? source.alternatives : []) {
    const entry = typeof candidate === 'string' ? {url: candidate} : candidate;
    if (!entry || typeof entry !== 'object') continue;
    const url = validMediaURL(entry.url); if (!url || seen.has(url)) continue;
    seen.add(url); output.push({...entry, url}); if (output.length === 2) break;
  }
  return output;
}

export function playableRate(rate, live = false) {
  if (live) return 1;
  const value = Number(rate); if (!RATES.includes(value)) throw new RangeError('Unsupported playback rate'); return value;
}

function loadScript(kind) {
  const globalName = kind === 'hls' ? 'Hls' : 'mpegts';
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
  if (!globalThis.document) return Promise.reject(new Error('Media engine unavailable'));
  if (!scripts.has(kind)) scripts.set(kind, new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = VENDOR[kind]; script.async = true;
    const timer = setTimeout(() => {script.remove(); scripts.delete(kind); reject(new Error('Media engine timed out'));}, 10000);
    script.onload = () => {clearTimeout(timer); globalThis[globalName] ? resolve(globalThis[globalName]) : reject(new Error('Media engine unavailable'));};
    script.onerror = () => {clearTimeout(timer); scripts.delete(kind); reject(new Error('Media engine unavailable'));};
    document.head.append(script);
  }));
  return scripts.get(kind);
}
function safeInvoke(callback, ...args) { try { callback?.(...args); } catch {} }
function nativeAvailable() {return !!globalThis.webkit?.messageHandlers?.abunasser;}
async function native(method, payload = {}) {
  if (!nativeAvailable()) throw new Error('Native action unavailable');
  const bridge = await import('./native.js'); return bridge.nativeRequest(method, payload);
}
function failMessage(code, status, language) {
  if (language === 'en') {
    if (status === 401 || status === 403) return `The provider rejected playback (HTTP ${status}). Check the subscription or connection limit.`;
    if (status) return `Playback request failed (HTTP ${status}).`;
    if (code === 'UNSUPPORTED') return 'This device cannot play this container or codec. A supported source or external player is required.';
    return 'Playback could not start. Check the connection and source.';
  }
  if (status === 401 || status === 403) return `رفض المصدر تشغيل المحتوى (HTTP ${status}). تحقق من الاشتراك أو عدد الاتصالات المسموح.`;
  if (status) return `تعذر طلب التشغيل (HTTP ${status}).`;
  if (code === 'UNSUPPORTED') return 'تنسيق الفيديو أو الصوت غير مدعوم على هذا الجهاز. جرّب مصدرًا متوافقًا أو مشغّلًا خارجيًا.';
  return 'تعذر بدء التشغيل. تحقق من الاتصال والمصدر.';
}

export function createPlayer({video, onStatus, onProgress, onEnded, onError} = {}) {
  if (!video || typeof video.addEventListener !== 'function') throw new TypeError('A video element is required');
  let transportGeneration = 0;
  let generation = 0, item = null, source = null, context = {}, candidates = [], attempt = 0, engine = null, engineKind = '', listeners = [];
  let rate = 1, position = 0, playing = false, nativeMode = false, nativeAttempted = false, progressTimer = null, sleepTimer = null, startTimer = null, objectURL = null;
  let recorder = null, recordingPromise = null, recordingTimer = null;
  let configuration = {aspect: 'fit', buffer: 'balanced', dataSaver: false, language: 'ar', nativeFallback: true};
  const state = () => ({item, position: nativeMode ? position : Number(video.currentTime) || 0, duration: nativeMode ? Number(context.nativeDuration) || 0 : Number.isFinite(video.duration) ? video.duration : 0, rate, playing, native: nativeMode, live: item?.kind === 'live', engine: engineKind});
  const status = text => safeInvoke(onStatus, text);
  const progress = () => { if (item) safeInvoke(onProgress, state()); };
  function listen(name, fn) {video.addEventListener(name, fn); listeners.push([name, fn]);}
  function cleanupEngine() {
    if (recorder?.state === 'recording') recorder.stop();
    clearTimeout(recordingTimer);
    transportGeneration++;
    clearTimeout(startTimer); startTimer = null; clearInterval(progressTimer); progressTimer = null;
    for (const [event, listener] of listeners) video.removeEventListener(event, listener); listeners = [];
    try {if (engineKind === 'hls') engine?.destroy(); else {engine?.pause?.();engine?.unload?.();engine?.detachMediaElement?.();engine?.destroy?.();}} catch {}
    engine = null; engineKind = ''; video.pause?.(); video.removeAttribute?.('src'); video.load?.();
    if (objectURL) {URL.revokeObjectURL(objectURL); objectURL = null;}
  }
  function applySettings() {
    const aspect = configuration.aspect; if (video.style) {video.style.objectFit = aspect === 'fill' || aspect === 'zoom' ? 'cover' : aspect === 'original' ? 'none' : 'contain'; video.style.transform = aspect === 'zoom' ? 'scale(1.12)' : '';}
    if (engineKind === 'hls' && engine) {
      const levels = engine.levels || []; let cap = -1;
      if (configuration.dataSaver) for (let n = 0; n < levels.length; n++) if ((levels[n].height || 0) <= 480 && (levels[n].bitrate || 0) <= 1000000) cap = n;
      engine.autoLevelCapping = cap;
    }
  }
  async function useNative() {
    if (!item || !nativeAvailable()) return false;
    const token = generation, current = candidates[attempt] || source, seek = item.kind === 'live' ? 0 : Number(video.currentTime) || position;
    cleanupEngine(); rate=Math.min(2,Math.max(0.5,rate));nativeMode = true; engineKind = 'native'; nativeAttempted = true;
    try {
      await native('play', {id: item.id, url: current.url, title: item.name || '', kind: item.kind, position: seek, rate, playlist: (context.playlist || []).map(row => ({id: row.id, name: row.name || row.title || '', title: row.name || row.title || '', group: row.group || '', kind: row.kind}))});
      if (token !== generation) return false;
      status(configuration.language === 'en' ? 'Opened in the iPhone player' : 'فُتح في مشغّل الآيفون'); return true;
    } catch (error) {if (token === generation) {nativeMode = false; engineKind = ''; status(configuration.language === 'en' ? 'The native player could not open this source.' : 'تعذر فتح المصدر في مشغّل الآيفون.');} return false;}
  }
  async function failed(code, httpStatus = 0, token = generation, transport = transportGeneration) {
    if (token !== generation || transport !== transportGeneration || !item) return;
    // The same source is never retried endlessly. A repository-issued alternate is attempted once.
    if (attempt + 1 < candidates.length && ['HTTP', 'FORMAT', 'UNSUPPORTED', 'MANIFEST', 'NETWORK'].includes(code)) {
      attempt++; status(configuration.language === 'en' ? 'Trying the source’s alternative format…' : 'جارٍ تجربة صيغة المصدر البديلة…');
      await startCandidate(token); return;
    }
    if ((code === 'UNSUPPORTED' || code === 'FORMAT') && !nativeAttempted && configuration.nativeFallback && nativeAvailable()) {
      if (await useNative()) return;
    }
    if (token !== generation) return;
    playing = false; clearTimeout(startTimer); const error = {code, httpStatus: Number(httpStatus) || 0, message: failMessage(code, Number(httpStatus) || 0, configuration.language), recoverable: true};
    cleanupEngine(); status(error.message); safeInvoke(onError, error);
  }
  async function startCandidate(token) {
    cleanupEngine(); if (token !== generation) return;
    const transport = transportGeneration;
    const current = () => token === generation && transport === transportGeneration;
    nativeMode = false; const candidate = candidates[attempt], kind = mediaType(candidate); let resumed = false;
    if(candidate.offline&&candidate.url.startsWith('blob:'))objectURL=candidate.url;
    // Native HLS can load signed media directly; an opaque bundle Origin must not force CORS.
    if(nativeAvailable())video.removeAttribute?.('crossorigin');
    video.playsInline = true; video.setAttribute?.('playsinline', ''); video.setAttribute?.('webkit-playsinline', ''); video.preload = 'metadata';
    const active = fn => (...args) => {if (current() && item && !nativeMode) fn(...args);};
    listen('loadedmetadata', active(() => {
      if (!resumed && item.kind !== 'live' && position > 0 && Number.isFinite(video.duration) && position < video.duration - 3) {try {video.currentTime = position;} catch {}} resumed = true;
      try {video.playbackRate = rate;} catch {} applySettings();
    }));
    listen('playing', active(() => {playing = true; clearTimeout(startTimer); status(configuration.language === 'en' ? 'Playing' : 'يعمل الآن'); progress();}));
    listen('pause', active(() => {playing = false;progress();}));
    listen('waiting', active(() => status(configuration.language === 'en' ? 'Buffering…' : 'جارٍ تجهيز البث…')));
    listen('ended', active(() => {playing = false;progress();safeInvoke(onEnded, item);}));
    listen('timeupdate', active(() => {position = Number(video.currentTime) || 0;}));
    listen('ratechange', active(() => {if (Number.isFinite(video.playbackRate)) rate = video.playbackRate;progress();}));
    listen('error', active(() => {const code = Number(video.error?.code); if (code === 1) return; failed(code === 4 ? 'UNSUPPORTED' : code === 3 ? 'FORMAT' : 'NETWORK', 0, token, transport);}));
    progressTimer = setInterval(progress, 10000);
    startTimer = setTimeout(() => {if (token === generation && !playing) status(configuration.language === 'en' ? 'The source is taking longer. You can retry or change the channel.' : 'المصدر يتأخر في الاستجابة. يمكنك إعادة المحاولة أو تغيير القناة.');}, 7000);
    const start = async () => {
      if (!current()) return;
      try {await video.play();} catch (error) {
        if (!current() || error?.name === 'AbortError') return;
        if (error?.name === 'NotAllowedError') status(configuration.language === 'en' ? 'Press play to begin.' : 'اضغط التشغيل لبدء المشاهدة.');
        else await failed(error?.name === 'NotSupportedError' ? 'UNSUPPORTED' : 'NETWORK', 0, token, transport);
      }
    };
    try {
      if (kind === 'hls' && video.canPlayType?.('application/vnd.apple.mpegurl')) {
        engineKind = 'native-hls'; video.src = candidate.url; await start();
      } else if (kind === 'hls') {
        const Hls = await loadScript('hls'); if (!current()) return;
        if (!Hls.isSupported()) {await failed('UNSUPPORTED', 0, token, transport); return;}
        const low = configuration.buffer === 'low', stable = configuration.buffer === 'stable';
        const hls = new Hls({enableWorker: true, lowLatencyMode: low, maxBufferLength: low ? 10 : stable ? 60 : 30, maxMaxBufferLength: stable ? 120 : 60, manifestLoadingTimeOut: 8000, manifestLoadingMaxRetry: 0, fragLoadingMaxRetry: 1, xhrSetup: xhr => {xhr.withCredentials = false;}});
        engine = hls; engineKind = 'hls'; hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {if (current()) hls.loadSource(candidate.url);});
        hls.on(Hls.Events.MANIFEST_PARSED, () => {if (current()) {applySettings(); start();}});
        hls.on(Hls.Events.ERROR, (_, data) => {if (!current() || !data.fatal) return;const http = Number(data.response?.code || data.networkDetails?.status) || 0;failed(http ? 'HTTP' : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'FORMAT' : 'MANIFEST', http, token, transport);});
      } else if (kind === 'ts' || kind === 'flv') {
        const mpegts = await loadScript('ts'); if (!current()) return;
        if (!mpegts.isSupported?.()) {await failed('UNSUPPORTED', 0, token, transport);return;}
        engineKind = 'ts'; engine = mpegts.createPlayer({type: kind === 'flv' ? 'flv' : 'mpegts', url: candidate.url, isLive: item.kind === 'live', cors: true, withCredentials: false}, {enableWorker: true, enableStashBuffer: configuration.buffer !== 'low', lazyLoad: item.kind !== 'live', autoCleanupSourceBuffer: true});
        engine.on(mpegts.Events.ERROR, (type, detail, info) => {const http = Number(info?.code || info?.status) || 0;failed(http >= 400 ? 'HTTP' : type === mpegts.ErrorTypes.MEDIA_ERROR ? 'FORMAT' : 'NETWORK', http >= 400 ? http : 0, token, transport);});
        engine.attachMediaElement(video);engine.load();await start();
      } else {engineKind = 'file'; video.src = candidate.url; await start();}
    } catch (error) {if (current()) await failed('UNSUPPORTED', 0, token, transport);}
  }
  const nativeEvent = event => {
    const detail = event.detail || {}; if (!nativeMode || !item || (detail.itemId || detail.id) && (detail.itemId || detail.id) !== item.id) return;
    if (detail.type === 'progress') {position = Number(detail.position) || 0; context.nativeDuration = Number(detail.duration) || 0; if (detail.rate) rate = Number(detail.rate); progress();}
    if (detail.type === 'playing') {playing = true;progress();}
    if (detail.type === 'paused') {playing = false;progress();}
    if (detail.type === 'stopped' && detail.userDismissed) {playing = false;progress();nativeMode=false;engineKind='';}
    if (detail.type === 'ended') {playing = false;progress();safeInvoke(onEnded, item);}
    if (detail.type === 'error') {if(attempt+1<candidates.length){attempt++;void useNative();return;}playing = false;const error = {code: String(detail.code || 'NATIVE'), httpStatus: Number(detail.httpStatus) || 0, message: failMessage('UNSUPPORTED', Number(detail.httpStatus) || 0, configuration.language), recoverable: true};status(error.message);safeInvoke(onError, error);}
  };
  globalThis.addEventListener?.('abunasser:native', nativeEvent);
  return {
    async play(nextItem, resolved, options = {}) {
      const continueNative=nativeMode;generation++;cleanupEngine();
      item = nextItem; source = resolved || {}; context = {...options}; candidates = boundedAlternatives(source); attempt = 0; nativeMode = false; nativeAttempted = false; playing = false;
      position = nextItem?.kind === 'live' ? 0 : Math.max(0, Number(options.position) || 0); rate = playableRate(options.rate ?? 1, nextItem?.kind === 'live');
      if (!item || !candidates.length) {if(continueNative)native('stop').catch(()=>{});const error = {code:'SOURCE', httpStatus:0, message: configuration.language === 'en' ? 'A safe playback URL is required.' : 'لم يوفر المصدر رابط تشغيل صالحًا وآمنًا.', recoverable:true};status(error.message);safeInvoke(onError,error);return false;}
      status(configuration.language === 'en' ? 'Connecting…' : 'جارٍ الاتصال بالبث…');
      if((source.nativePreferred||continueNative)&&nativeAvailable()&&await useNative())return true;
      await startCandidate(generation); return true;
    },
    stop() {progress(); generation++; if (nativeMode) native('stop').catch(() => {}); cleanupEngine();clearTimeout(sleepTimer);sleepTimer = null;item = null;source = null;position = 0;playing = false;nativeMode = false;},
    pause() {if (nativeMode) return native('pause');video.pause();},
    resume() {if (nativeMode) return native('resume');return video.play();},
    seek(seconds) {if (!item || item.kind === 'live') return false;const value = Math.max(0, Number(seconds) || 0), duration = state().duration;const target = duration ? Math.min(value, Math.max(0,duration-0.1)) : value;if (nativeMode) return native('seek',{position:target});video.currentTime = target;position=target;progress();return true;},
    setRate(nextRate) {rate=playableRate(nextRate,item?.kind==='live');if(nativeMode)return native('rate',{rate});video.playbackRate=rate;progress();return rate;},
    configure(settings = {}) {configuration={...configuration,...settings};applySettings();},
    getState:state,
    getTracks() {
      if (nativeMode) return {audio:[],subtitles:[],quality:[],systemManaged:true};
      if (engineKind==='hls'&&engine) return {audio:(engine.audioTracks||[]).map((t,n)=>({id:n,label:t.name||t.lang||`Audio ${n+1}`,language:t.lang||'',selected:engine.audioTrack===n})),subtitles:[{id:-1,label:configuration.language==='en'?'Off':'إيقاف',selected:engine.subtitleTrack<0},...(engine.subtitleTracks||[]).map((t,n)=>({id:n,label:t.name||t.lang||`Subtitle ${n+1}`,language:t.lang||'',selected:engine.subtitleTrack===n}))],quality:[{id:-1,label:configuration.language==='en'?'Automatic':'تلقائي',selected:engine.currentLevel<0},...(engine.levels||[]).map((t,n)=>({id:n,label:t.height?`${t.height}p`:`${Math.round((t.bitrate||0)/1000)} kbps`,selected:engine.currentLevel===n}))]};
      return {audio:Array.from(video.audioTracks||[]).map((t,n)=>({id:n,label:t.label||t.language||`Audio ${n+1}`,selected:!!t.enabled})),subtitles:[{id:-1,label:configuration.language==='en'?'Off':'إيقاف',selected:!Array.from(video.textTracks||[]).some(t=>t.mode==='showing')},...Array.from(video.textTracks||[]).map((t,n)=>({id:n,label:t.label||t.language||`Subtitle ${n+1}`,selected:t.mode==='showing'}))],quality:[],systemManaged:engineKind==='native-hls'};
    },
    setTrack(kind,id) {
      if(nativeMode)return {systemManaged:true};const selected=Number(id);if(!Number.isInteger(selected)||selected< -1) return false;
      if(engineKind==='hls'&&engine){const key=kind==='audio'?'audioTrack':kind==='subtitles'?'subtitleTrack':kind==='quality'?'currentLevel':null;if(!key)return false;const values=kind==='audio'?engine.audioTracks:kind==='subtitles'?engine.subtitleTracks:engine.levels;if(selected>=values.length)return false;engine[key]=selected;return true;}
      const tracks=kind==='audio'?video.audioTracks:kind==='subtitles'?video.textTracks:null;if(!tracks||selected>=tracks.length)return false;for(let n=0;n<tracks.length;n++)if(kind==='audio')tracks[n].enabled=n===selected;else tracks[n].mode=n===selected?'showing':'disabled';return true;
    },
    async togglePiP() {if(nativeMode)return native('pip');if(globalThis.document?.pictureInPictureElement){await document.exitPictureInPicture();return true;}if(video.requestPictureInPicture&&document.pictureInPictureEnabled){await video.requestPictureInPicture();return true;}if(video.webkitSupportsPresentationMode?.('picture-in-picture')){video.webkitSetPresentationMode(video.webkitPresentationMode==='picture-in-picture'?'inline':'picture-in-picture');return true;}return false;},
    async fullscreen() {if(nativeMode)return true;if(video.webkitEnterFullscreen){video.webkitEnterFullscreen();return true;}if(video.requestFullscreen){await video.requestFullscreen();return true;}return false;},
    airplay() {if(video.webkitShowPlaybackTargetPicker){video.webkitShowPlaybackTargetPicker();return true;}return false;},
    useNative,
    getCapabilities() {return {native:nativeAvailable(),nativePlayer:nativeAvailable(),pip:!!(globalThis.document?.pictureInPictureEnabled||video.webkitSupportsPresentationMode?.('picture-in-picture')),airplay:typeof video.webkitShowPlaybackTargetPicker==='function',screenshot:!!globalThis.document,recording:!!(globalThis.MediaRecorder&&(video.captureStream||video.webkitCaptureStream)),decoderSelection:false,audioDelay:false,tracks:this.getTracks()};},
    async screenshot() {if(nativeMode||!video.videoWidth||!video.videoHeight||!globalThis.document)throw new Error('A visible inline video frame is required');const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const drawing=canvas.getContext('2d');if(!drawing)throw new Error('Frame capture unavailable');try{drawing.drawImage(video,0,0);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Frame capture blocked')),'image/png'));}catch{throw new Error('The source or browser does not allow frame capture');}},
    startRecording({maxBytes=256*1024*1024,maxMinutes=60}={}) {
      if(nativeMode||!item||!globalThis.MediaRecorder||!(video.captureStream||video.webkitCaptureStream))throw new Error('Recording this media is unavailable in this browser');
      if(recorder?.state==='recording')throw new Error('Recording is already active');
      if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>512*1024*1024)throw new Error('Invalid recording limit');
      const stream=(video.captureStream||video.webkitCaptureStream).call(video);
      if(!stream.getTracks().length)throw new Error('No recordable media tracks');
      const parts=[];let received=0,failed=null;
      const formats=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
      const mimeType=formats.find(value=>MediaRecorder.isTypeSupported(value));
      const activeRecorder=new MediaRecorder(stream,mimeType?{mimeType}:{});recorder=activeRecorder;
      let timer;
      recordingPromise=new Promise((resolve,reject)=>{
        activeRecorder.ondataavailable=event=>{
          if(!event.data?.size)return;received+=event.data.size;
          if(received>maxBytes){failed=new Error('Recording size limit reached');if(activeRecorder.state==='recording')activeRecorder.stop();}
          else parts.push(event.data);
        };
        activeRecorder.onerror=()=>{failed=new Error('The source or browser refused recording');};
        activeRecorder.onstop=()=>{
          clearTimeout(timer);stream.getTracks().forEach(track=>track.stop());
          if(failed)reject(failed);else resolve(new Blob(parts,{type:activeRecorder.mimeType||mimeType||'video/webm'}));
        };
      });
      recordingPromise.catch(()=>{});activeRecorder.start(1000);
      const minutes=Math.min(60,Math.max(1,Number(maxMinutes)||60));
      timer=setTimeout(()=>{if(activeRecorder.state==='recording')activeRecorder.stop();},minutes*60000);recordingTimer=timer;return true;
    },
    async stopRecording() {if(!recordingPromise)return null;if(recorder?.state==='recording')recorder.stop();return recordingPromise;},
    setSleepTimer(minutes=0) {clearTimeout(sleepTimer);sleepTimer=null;const count=Number(minutes);if(Number.isFinite(count)&&count>0&&count<=720)sleepTimer=setTimeout(()=>{if(nativeMode)native('pause').catch(()=>{});else video.pause();playing=false;progress();status(configuration.language==='en'?'Sleep timer finished':'انتهى مؤقت النوم');},count*60000);return count>0;},
    destroy() {this.stop();globalThis.removeEventListener?.('abunasser:native',nativeEvent);},
  };
}

export function downloadPolicy(item, source = {}, maxBytes = 512 * 1024 * 1024) {
  if (!item || item.kind === 'live' || item.kind === 'series') return {allowed:false,reason:'finite_only'};
  if (source.drm || source.encrypted || item.drm || item.encrypted) return {allowed:false,reason:'protected'};
  const url=validMediaURL(source.url);if(!url)return {allowed:false,reason:'source'};
  if (mediaType(source)!=='file')return {allowed:false,reason:'native_download_required'};
  if (!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024*1024)return {allowed:false,reason:'size_limit'};
  return {allowed:true,url,maxBytes};
}

const OFFLINE_CACHE='abunasser-offline-v1';
let downloadsDB;
function database() {
  if(!globalThis.indexedDB)return Promise.reject(new Error('Persistent storage unavailable'));
  if(!downloadsDB)downloadsDB=new Promise((resolve,reject)=>{const request=indexedDB.open('abunasser-downloads-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('items',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Persistent storage unavailable'));});return downloadsDB;
}
async function record(action,value) {const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('items',action==='list'?'readonly':'readwrite'),store=tx.objectStore('items');const request=action==='list'?store.getAll():action==='remove'?store.delete(value):store.put(value);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Could not save download'));});}
function downloadKey(scope,id) {return `${encodeURIComponent(String(scope))}/${encodeURIComponent(String(id))}`;}
function cacheAddress(key) {return new URL(`/__offline__/${key}`,globalThis.location?.origin||'https://app.invalid').href;}

export function downloadItemSnapshot(item={}) {
  const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
  return {id:text(String(item.id||''),1024),kind:item.kind==='episode'?'episode':'movie',name:text(item.name,300),group:text(item.group,500),genre:text(item.genre,500)};
}
export class DownloadManager {
  constructor({scope='default',maxBytes=512*1024*1024,preferNative=true}={}) {
    this.scope=String(scope);this.maxBytes=maxBytes;this.preferNative=preferNative;this.jobs=new Map();this.listeners=new Set();
    this.nativeListener=event=>{
      const data=event.detail||{};if(!data.id)return;
      const job=this.jobs.get(data.id)||[...this.jobs.values()].find(value=>value.nativeId===data.id);if(!job)return;
      if(data.type==='downloadProgress'){
        job.received=Number(data.received||data.bytes)||0;job.total=Number(data.total||data.expected)||0;
        job.progress=Number(data.progress)||0;if(['downloading','paused','cancelled','failed'].includes(data.status))job.state=data.status;
        this.emit(job);
      }else if(data.type==='downloadComplete'){
        job.state='complete';job.native=true;job.progress=1;job.received=Number(data.bytes)||job.received;this.emit(job);
      }else if(data.type==='downloadError'){
        job.state='failed';job.reason=String(data.message||'Native download failed').slice(0,400);this.emit(job);
      }
    };
    globalThis.addEventListener?.('abunasser:native',this.nativeListener);
  }
  subscribe(listener) {this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(job) {const view={id:job.id,name:job.name,kind:job.kind,state:job.state,received:job.received||0,total:job.total||0,progress:job.total?Math.min(1,(job.received||0)/job.total):job.progress||0,native:!!job.native,reason:job.reason||''};for(const listener of this.listeners)safeInvoke(listener,view);}
  async enqueue(item,source) {
    const id=String(item?.id||'');if(!id)throw new Error('Download item required');
    if(this.jobs.has(id)&&this.jobs.get(id).state==='downloading')return this.jobs.get(id).promise;
    const policy=downloadPolicy(item,source,this.maxBytes);if(!policy.allowed&&!(policy.reason==='native_download_required'&&this.preferNative&&nativeAvailable()))throw Object.assign(new Error(policy.reason),{code:policy.reason});
    if(!item||item.kind==='live'||item.kind==='series'||source.drm||source.encrypted||item.drm)throw new Error('finite_only');
    const job={id,name:item.name||'',kind:item.kind,state:'downloading',item,source,received:0,total:0,controller:new AbortController(),native:false};this.jobs.set(id,job);this.emit(job);
    job.promise=(async()=>{
      if(this.preferNative&&nativeAvailable()){job.native=true;job.nativeId=downloadKey(this.scope,id);const result=await native('download',{id:job.nativeId,url:source.url,title:item.name||'',kind:item.kind,mime:source.mime||''});job.state=result?.complete||result?.status==='complete'?'complete':'downloading';this.emit(job);return {...result,id,native:true};}
      if(!globalThis.caches||!globalThis.indexedDB)throw new Error('Persistent offline storage is unavailable in this browser');
      const response=await fetch(policy.url,{signal:job.controller.signal,credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Object.assign(new Error(`HTTP ${response.status}`),{httpStatus:response.status});
      const contentType=response.headers.get('Content-Type')||source.mime||'video/mp4';if(MIME_HLS.test(contentType)||/text\/html|application\/json/i.test(contentType))throw new Error('finite_video_required');
      const length=Number(response.headers.get('Content-Length'));if(Number.isFinite(length)&&length>0)job.total=length;if(job.total>this.maxBytes)throw new Error('size_limit');
      const quota=await globalThis.navigator?.storage?.estimate?.();if(quota&&job.total&&quota.quota-quota.usage<job.total*1.15)throw new Error('storage_quota');
      if(!response.body)throw new Error('Empty download response');const reader=response.body.getReader(),chunks=[];
      try {for(;;){const result=await reader.read();if(result.done)break;job.received+=result.value.byteLength;if(job.received>this.maxBytes)throw new Error('size_limit');chunks.push(result.value);this.emit(job);}}finally {await reader.cancel().catch(()=>{});}
      if(job.controller.signal.aborted)throw new DOMException('Cancelled','AbortError');if(job.total&&job.received!==job.total)throw new Error('incomplete_download');
      const blob=new Blob(chunks,{type:contentType}),key=downloadKey(this.scope,id),address=cacheAddress(key),cache=await caches.open(OFFLINE_CACHE);
      await cache.put(address,new Response(blob,{headers:{'Content-Type':contentType,'Content-Length':String(blob.size)}}));
      const metadata={key,scope:this.scope,id,name:item.name||'',kind:item.kind,item:downloadItemSnapshot(item),metadataVersion:2,mime:contentType,bytes:blob.size,createdAt:Date.now(),native:false};
      try{await record('put',metadata);}catch(error){await cache.delete(address);throw error;}
      job.state='complete';this.emit(job);return metadata;
    })().catch(error=>{if(job.state!=='paused')job.state=error?.name==='AbortError'?'cancelled':'failed';job.reason=error?.name==='AbortError'?'':String(error.code||error.message||'download');this.emit(job);throw error;});
    return job.promise;
  }
  cancel(id) {const job=this.jobs.get(String(id));if(!job)return false;job.state='cancelled';if(job.native)native('cancelDownload',{id:downloadKey(this.scope,id)}).catch(()=>{});else job.controller.abort();this.emit(job);return true;}
  pause(id) {
    const job=this.jobs.get(String(id));if(!job||job.state!=='downloading')return false;
    if(job.native)return native('pauseDownload',{id:downloadKey(this.scope,id)}).then(()=>{job.state='paused';this.emit(job);return true;});
    job.state='paused';job.controller.abort();this.emit(job);return true;
  }
  resume(id) {
    const job=this.jobs.get(String(id));if(!job||job.state!=='paused')return false;
    if(job.native)return native('resumeDownload',{id:downloadKey(this.scope,id)}).then(()=>{job.state='downloading';this.emit(job);return true;});
    return this.enqueue(job.item,job.source);
  }
  async list() {
    let local=[];try{local=(await record('list')).filter(row=>row.scope===this.scope).map(row=>({...row,state:'complete'}));}catch{}
    if(this.preferNative&&nativeAvailable())try{
      const rows=await native('downloads');local.push(...(Array.isArray(rows)?rows:rows?.items||[])
        .filter(row=>String(row.id||'').startsWith(`${encodeURIComponent(this.scope)}/`))
        .map(row=>({...row,name:row.name||row.title||'',state:row.state||row.status||'complete',id:decodeURIComponent(row.id.split('/').slice(1).join('/')),native:true})));
    }catch{}
    const entries=new Map(local.map(row=>[String(row.id),row]));
    for(const job of this.jobs.values())if(job.state!=='complete'||!entries.has(job.id))entries.set(job.id,{...(entries.get(job.id)||{}),id:job.id,name:job.name,kind:job.kind,item:downloadItemSnapshot(job.item),metadataVersion:2,state:job.state,received:job.received,total:job.total,native:job.native,reason:job.reason||''});
    return [...entries.values()];
  }
  async openNativeDownload(id) {if(!nativeAvailable())return false;return native('openDownload',{id:downloadKey(this.scope,id)});}
  async getOfflineURL(id) {if(!globalThis.caches)return null;const key=downloadKey(this.scope,id),cache=await caches.open(OFFLINE_CACHE),address=cacheAddress(key),response=await cache.match(address);if(!response)return null;if(globalThis.navigator?.serviceWorker?.controller)return address;return URL.createObjectURL(await response.blob());}
  async remove(id) {this.cancel(id);const key=downloadKey(this.scope,id);if(globalThis.caches){const cache=await caches.open(OFFLINE_CACHE);await cache.delete(cacheAddress(key));}try{await record('remove',key);}catch{}if(this.preferNative&&nativeAvailable())await native('removeDownload',{id:key});this.jobs.delete(String(id));}
  async clear() {for(const job of this.jobs.values())this.cancel(job.id);for(const entry of await this.list())await this.remove(entry.id);}
  destroy() {for(const job of this.jobs.values())if(job.state==='downloading'&&!job.native)this.cancel(job.id);this.listeners.clear();globalThis.removeEventListener?.('abunasser:native',this.nativeListener);}
}
