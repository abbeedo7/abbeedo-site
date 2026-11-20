import {isNative, nativeRequest} from './native.js';

// Local OS alerts and foreground polling. This is not a background push service.
const SEEN_KEY = 'abbeedo-announcement-ids-v1';
const MAX_IDS = 200, MAX_MESSAGES = 30, MAX_ALERTS = 3, MAX_BYTES = 131072;
const nativePermission = new Map();
let anonymousID = 0;
const cleanText = (value, limit) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit) : '';
const isIOS = () => /iPad|iPhone|iPod/i.test(globalThis.navigator?.userAgent || '')
  || (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator?.maxTouchPoints > 1);
const isMobile = () => isIOS() || /Android/i.test(globalThis.navigator?.userAgent || '');
const standalone = () => globalThis.navigator?.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)')?.matches === true;
const desktopBridge = () => globalThis.abunasserDesktop;
function hash(value) {
  let result = 2166136261;
  for (const char of value) {result ^= char.codePointAt(0);result = Math.imul(result, 16777619);}
  return (result >>> 0).toString(36);
}
function notificationID(value) {
  const raw = cleanText(value, 1024);
  return 'abbeedo-' + (raw && /^[a-z\d_.-]{1,110}$/i.test(raw) ? raw : raw ? hash(raw) : `${Date.now().toString(36)}-${++anonymousID}`);
}
function safeURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const base = new URL(globalThis.location?.href || 'https://localhost/');
    const target = new URL(value, base);
    return /^https?:$/.test(target.protocol) && target.origin === base.origin && !target.username && !target.password ? target.href : undefined;
  } catch {return undefined;}
}
function payloadFor(input = {}) {
  const value = {id: notificationID(input.id), title: cleanText(input.title, 160) || (globalThis.document?.documentElement?.lang === 'ar' ? 'ابوناصر TV' : 'abbeedo TV'),
    body: cleanText(input.body, 1000)};
  const url = safeURL(input.url);
  if (url) value.url = url;
  return value;
}
const allowed = value => value === true || value === 'granted' || value?.granted === true || value?.authorized === true;
const delivered = value => value !== false && value?.delivered !== false && value?.ok !== false && value?.granted !== false && value?.authorized !== false;

/** Call only from an explicit permission button / user gesture. */
export async function requestNotificationPermission() {
  try {
    if (isNative()) {
      const granted = allowed(await nativeRequest('requestNotifications', {}));
      nativePermission.set('native-ios', granted);
      return {granted, mode: 'native-ios', reason: granted ? 'granted' : 'denied'};
    }
    const bridge = desktopBridge();
    if (typeof bridge?.setNotificationsEnabled === 'function') {
      const result=await bridge.setNotificationsEnabled(true);
      const granted=result?.ok===true&&result?.enabled===true&&result?.supported!==false;
      return {granted,mode:'native-windows',reason:granted?'granted':result?.supported===false?'unsupported':'denied'};
    }
    if (typeof bridge?.requestNotifications === 'function') {
      const granted = allowed(await bridge.requestNotifications());
      nativePermission.set('native-windows', granted);
      return {granted, mode: 'native-windows', reason: granted ? 'granted' : 'denied'};
    }
    if (globalThis.isSecureContext === false) return {granted: false, mode: 'unavailable', reason: 'insecure-context'};
    if (isIOS() && !standalone()) return {granted: false, mode: 'unavailable', reason: 'install-required'};
    const api = globalThis.Notification;
    if (!api || typeof api.requestPermission !== 'function') return {granted: false, mode: 'unavailable', reason: 'unsupported'};
    const permission = api.permission === 'granted' || api.permission === 'denied' ? api.permission : await api.requestPermission();
    return {granted: permission === 'granted', mode: 'web', reason: permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'dismissed'};
  } catch {return {granted: false, mode: 'unavailable', reason: 'unavailable'};}
}

async function registration() {
  const worker = globalThis.navigator?.serviceWorker;
  if (!worker) return null;
  try {
    // getRegistration settles even when the app has no active service worker;
    // serviceWorker.ready can otherwise remain pending indefinitely.
    if (typeof worker.getRegistration === 'function') return await worker.getRegistration();
    if (typeof worker.getRegistrations === 'function') return (await worker.getRegistrations())[0] || null;
    if (worker.controller && worker.ready) return await worker.ready;
  } catch {}
  return null;
}

/** Delivery never requests permission and never exposes an OS/API error to UI. */
export async function deliverNotification(input) {
  try {
    const value = payloadFor(input);
    if (isNative()) {
      if (nativePermission.get('native-ios') === false) return {delivered: false, mode: 'native-ios'};
      return {delivered: delivered(await nativeRequest('notify', value)), mode: 'native-ios'};
    }
    const bridge = desktopBridge();
    if (typeof bridge?.notify === 'function') {
      if (nativePermission.get('native-windows') === false) return {delivered: false, mode: 'native-windows'};
      return {delivered: delivered(await bridge.notify(value)), mode: 'native-windows'};
    }
    const api = globalThis.Notification;
    if (!api || api.permission !== 'granted' || globalThis.isSecureContext === false) return {delivered: false, mode: 'unavailable'};
    const options = {body: value.body, tag: value.id, icon: 'app-icon.png', badge: 'app-icon.png', renotify: false,
      data: {url: value.url || safeURL('/')}};
    const worker = await registration();
    if (typeof worker?.showNotification === 'function') {
      try {await worker.showNotification(value.title, options);return {delivered: true, mode: 'service-worker'};} catch {}
    }
    // iOS (and most Android browsers) disallow the Notification constructor.
    if (isMobile() || typeof api !== 'function') return {delivered: false, mode: 'unavailable'};
    const notification = new api(value.title, options);
    notification.onclick = () => {
      try {notification.close?.();globalThis.focus?.();if (value.url) globalThis.location?.assign?.(value.url);} catch {}
    };
    return {delivered: true, mode: 'web'};
  } catch {return {delivered: false, mode: 'unavailable'};}
}

function storedIDs() {
  try {
    const raw = globalThis.localStorage?.getItem(SEEN_KEY);
    if (!raw || raw.length > 30000) return {initialized: false, ids: []};
    const data = JSON.parse(raw);
    return data?.version === 1 && data.initialized === true && Array.isArray(data.ids)
      ? {initialized: true, ids: data.ids.filter(validID).slice(-MAX_IDS)} : {initialized: false, ids: []};
  } catch {return {initialized: false, ids: []};}
}
const validID = value => typeof value === 'string' && /^[a-z\d_-]{1,128}$/i.test(value);
function messagesFrom(data) {
  const now = Date.now(), rows = Array.isArray(data?.messages) ? data.messages.slice(-MAX_MESSAGES) : [];
  return rows.filter(row => row && validID(row.id) && (!row.expiresAt || Number(row.expiresAt) > now))
    .map(row => ({id: row.id, title: cleanText(row.title, 160), body: cleanText(row.body, 1000),
      createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : 0, url: safeURL(row.url)}))
    .filter(row => row.title || row.body).sort((a, b) => a.createdAt - b.createdAt);
}
async function limitedJSON(response) {
  if (!response || response.ok === false || Number(response.headers?.get?.('content-length')) > MAX_BYTES) return null;
  if (!response.body?.getReader) return response.json?.();
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {await reader.cancel();return null;}
      text += decoder.decode(value, {stream: true});
    }
    return JSON.parse(text + decoder.decode());
  } finally {reader.releaseLock?.();}
}
function abortable(value, signal) {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise((resolve, reject) => {
    const abort = () => {signal.removeEventListener('abort', abort);reject(new Error('aborted'));};
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(value).then(result => {signal.removeEventListener('abort', abort);resolve(result);}, error => {signal.removeEventListener('abort', abort);reject(error);});
  });
}

/**
 * Poll public announcements while the app is visible, online and enabled.
 * Only non-sensitive message IDs are persisted. The initial feed is seeded
 * silently; at most three newest announcements alert per poll after that.
 * shouldDeliver allows foreground toasts without enabling OS notifications.
 */
export function createAnnouncementMonitor({fetcher = (...args) => globalThis.fetch(...args), endpoint = '/api/announcements', onMessage = () => {}, isEnabled = () => true, shouldDeliver = () => true, intervalMs = 60000} = {}) {
  const saved = storedIDs();
  let initialized = saved.initialized, seen = new Set(saved.ids), running = false, timer = null, timeout = null, controller = null, inFlight = null, inFlightGeneration = -1, generation = 0;
  const delay = Math.max(15000, Math.min(900000, Number(intervalMs) || 60000));
  const doc = globalThis.document;
  const enabled = () => {try {return isEnabled() !== false;} catch {return false;}};
  const available = () => enabled() && doc?.hidden !== true && doc?.visibilityState !== 'hidden' && globalThis.navigator?.onLine !== false;
  const clearTimer = () => {if (timer !== null) clearTimeout(timer);timer = null;};
  const clearRequest = () => {if (timeout !== null) clearTimeout(timeout);timeout = null;controller?.abort();controller = null;};
  const save = () => {
    seen = new Set([...seen].slice(-MAX_IDS));
    try {globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify({version: 1, initialized: true, ids: [...seen]}));} catch {}
  };
  const schedule = () => {clearTimer();if (running && available()) timer = setTimeout(() => {timer = null;void poll();}, delay);};
  function activity() {
    clearTimer();
    if (!available()) {generation++;clearRequest();return;}
    if (running) void poll();
  }
  async function perform(token) {
    let request;
    try {
      request = new URL(String(endpoint), globalThis.location?.href || 'https://localhost/');
      if (!/^https?:$/.test(request.protocol) || request.username || request.password) return {status: 'unavailable', count: 0};
      controller = new AbortController();
      const signal = controller.signal;
      timeout = setTimeout(() => controller?.abort(), 15000);
      const response = await abortable(fetcher(request.href, {cache: 'no-store', credentials: 'omit', signal}), signal);
      const data = await abortable(limitedJSON(response), signal);
      if (!data || !Array.isArray(data.messages)) return {status: 'unavailable', count: 0};
      if (!running || token !== generation || !available()) return {status: 'paused', count: 0};
      const messages = messagesFrom(data), fresh = [];
      for (const message of messages) {
        if (!seen.has(message.id)) fresh.push(message);
        seen.add(message.id);
      }
      if (!initialized) {initialized = true;save();return {status: 'seeded', count: 0};}
      save();
      let count = 0;
      for (const message of fresh.slice(-MAX_ALERTS)) {
        if (!running || token !== generation || !available()) break;
        try {await onMessage(message);} catch {}
        let system = false;
        try {system = shouldDeliver() !== false;} catch {}
        if (system && running && token === generation && available()) await deliverNotification(message);
        count++;
      }
      return {status: 'ok', count};
    } catch {return {status: 'unavailable', count: 0};}
    finally {clearRequest();}
  }
  function poll() {
    clearTimer();
    if (!running) return Promise.resolve({status: 'stopped', count: 0});
    if (!available()) return Promise.resolve({status: 'paused', count: 0});
    if (inFlight) return inFlightGeneration === generation ? inFlight : inFlight.then(() => poll());
    const token = generation;
    const job = perform(token).finally(() => {if (inFlight === job) inFlight = null;schedule();});
    inFlight = job;inFlightGeneration = token;
    return job;
  }
  function start() {
    if (!running) {
      running = true;generation++;
      doc?.addEventListener?.('visibilitychange', activity);
      globalThis.addEventListener?.('online', activity);
      globalThis.addEventListener?.('offline', activity);
    }
    return poll();
  }
  function stop() {
    running = false;generation++;clearTimer();clearRequest();
    doc?.removeEventListener?.('visibilitychange', activity);
    globalThis.removeEventListener?.('online', activity);
    globalThis.removeEventListener?.('offline', activity);
  }
  return Object.freeze({start, stop, poll});
}
