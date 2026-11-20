import {Vault, VaultError} from './storage.js';
import {isNative, nativeRequest, nativeFetch} from './native.js';
export {Vault, VaultError};

export const BRAND = Object.freeze({name: 'ابوناصر TV', name_ar: 'ابوناصر TV', name_en: 'abbeedo TV', phone: '0571514382', whatsapp: 'https://wa.me/966571514382', version: '1.2.1', tagline: 'عالمك من الترفيه'});
export function brandName(language = 'ar') { return language === 'ar' ? BRAND.name_ar : BRAND.name_en; }
export const PROVIDER = 'http://maglobalxx.xyz:2052';
export const ACCOUNT_MODES = Object.freeze(['provider', 'xtream', 'm3u', 'm3u-file', 'auto', 'direct', 'stalker']);
export const DEFAULT_SETTINGS = Object.freeze({
  language: 'ar', accent: '#ff242d', theme: 'dark', background_speed: 'standard', reduced_motion: false,
  text_scale: 1, high_contrast: false, home_order: 'series,live,movie', start_screen: 'home', screensaver_mode: 'off', screensaver_minutes: 5,
  decoder_mode: 'auto', aspect_mode: 'fit', buffer_mode: 0, seek_step_seconds: 10, auto_next: true, data_saver: false,
  auto_categories: true, catalog_refresh_hours: 0, epg_timezone: 'local', epg_offset_minutes: 0,
  parental_enabled: false, privacy_mode: false, dedupe_movies: true, deduplicate_channels: true,
  notifications: false, remember_subscription: true, volume: 1, playback_rate: 1, subtitles: true,
  audio_language: '', subtitle_language: '', sleep_minutes: 0, skip_intro_seconds: 0,
});
export const LIVE_FAMILIES = Object.freeze([
  {id: 'history', ar: 'سجل المشاهدة', en: 'Watching history'}, {id: 'favorites', ar: 'المفضلة', en: 'Favorites'},
  {id: 'all', ar: 'كل القنوات', en: 'All channels'}, {id: 'kids', ar: 'قنوات الأطفال', en: 'Kids'},
  {id: 'news', ar: 'قنوات الأخبار', en: 'News'}, {id: 'sports', ar: 'قنوات الرياضة', en: 'Sports'},
  {id: 'movies', ar: 'قنوات الأفلام', en: 'Movies'}, {id: 'documentary', ar: 'القنوات الوثائقية', en: 'Documentary'},
  {id: 'general', ar: 'القنوات العامة والمنوعة', en: 'General'}, {id: 'religious', ar: 'القنوات الدينية', en: 'Religious'},
  {id: 'music', ar: 'القنوات الموسيقية', en: 'Music'}, {id: 'other', ar: 'بقية القنوات', en: 'Other'},
]);

const ADULT = /(?:adult|\bxxx\b|18\+|للكبار|إباح|اباح)/i;
const textCache = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
export function normalize(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase().trim(); }
function keyHash(value) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let n = 0; n < value.length; n++) { const code = value.charCodeAt(n); h1 = Math.imul(h1 ^ code, 2654435761); h2 = Math.imul(h2 ^ code, 1597334677); } h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909); h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909); return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0'); }
export function accountScope(account) { return keyHash([account?.mode || 'provider', account?.server || PROVIDER, account?.username ?? account?.user ?? '', account?.url || account?.playlist || '', account?.mac || ''].join('|')); }
export function stableKey(scope, item) { return keyHash(`${scope}|${item?.kind || 'live'}|${item?.id ?? item?.providerId ?? item?.url ?? ''}`); }
export function isAdult(item) { return ADULT.test(`${item?.group || ''} ${item?.genre || ''} ${item?.name || ''}`); }
export function safeURL(value, base) { if (!(value instanceof URL) && (typeof value !== 'string' || !value.trim())) return null; try { const url = new URL(value, base); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; } }

export function classifyLive(item) {
  const name = normalize(item?.name);
  // Explicit channel identities take precedence over stale provider categories.
  if (/mbc\s*3|spacetoon|nickelodeon|سبيستون|براعم|طيور الجنه/.test(name)) return 'kids';
  if (/al.?arabiya|al.?jazeera|sky.?news|bbc.?news|العربيه|الجزيره|الميادين|الاخباريه/.test(name)) return 'news';
  if (/be.?in.*sport|alkass|al.?kass|espn|eurosport|\bssc\b|الكاس/.test(name)) return 'sports';
  const text = normalize(`${item?.group || ''} ${item?.name || ''} ${item?.genre || ''}`);
  if (/kids|children|cartoon|disney|nickelodeon|baby|spacetoon|mbc\s*3|أطفال|اطفال|كرتون|سبيستون|براعم|طيور الجنه/.test(text)) return 'kids';
  if (/news|\bcnn\b|\bbbc\b|al.?arabiya|al.?jazeera|sky.?news|اخبار|الاخباريه|العربيه|الجزيره|الميادين|الشرق/.test(text)) return 'news';
  if (/sport|be.?in|alkass|al.?kass|dazn|eurosport|espn|\bssc\b|رياضي|رياضه|الكاس|الكأس/.test(text)) return 'sports';
  if (/document|discovery|national.?geographic|nat.?geo|history|وثائق|ناشيونال|ديسكفري/.test(text)) return 'documentary';
  if (/quran|qur.an|islam|relig|sunnah|قران|قرآن|اسلام|ديني|السنه|الحرم|مكه|مكة/.test(text)) return 'religious';
  if (/music|songs|mtv|rotana.?music|موسيقي|اغاني|اغانى|طرب|روتانا كليب/.test(text)) return 'music';
  if (/movie|cinema|film|افلام|سينما|فيلم/.test(text)) return 'movies';
  if (/general|entertain|variety|\bmbc\b|\bsbc\b|rotana|روتانا|عامه|منوع|ترفيه/.test(text)) return 'general';
  return 'other';
}

function attributes(value) { const result = {}; const expression = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g; for (const match of value.matchAll(expression)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''; return result; }
function metaComma(line) { let quote = ''; for (let n = 0; n < line.length; n++) { if ((line[n] === '"' || line[n] === "'") && (!quote || line[n] === quote)) quote = quote ? '' : line[n]; if (line[n] === ',' && !quote) return n; } return -1; }
function detectM3UKind(meta, url) {
  const declared = normalize(meta['tvg-type'] || meta.type);
  if (['series', 'serial', 'مسلسل', 'مسلسلات'].includes(declared)) return 'series';
  if (['movie', 'vod', 'film', 'فيلم', 'افلام'].includes(declared)) return 'movie';
  if (['live', 'channel', 'قناة'].includes(declared)) return 'live';
  const path = url.pathname.toLowerCase(); if (/\/(?:series|serials)\//.test(path)) return 'series'; if (/\/(?:movie|movies|vod)\//.test(path)) return 'movie';
  return /\.(?:mp4|mkv|avi|mov|webm|m4v)$/.test(path) ? 'movie' : 'live';
}
/** Accepts provider lists, not an HLS segment playlist; preserves source order. */
export function parseM3U(text, base = globalThis.location?.href) {
  if (typeof text !== 'string' || text.length > 64 * 1024 * 1024) throw new Error('ملف القائمة غير صالح أو أكبر من الحد المسموح.');
  if (/#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(text)) throw new Error('هذا رابط بث HLS؛ اختر «رابط بث مباشر» لتشغيله.');
  const items = [], seen = new Set(); let meta = {}, name = '', group = '', headers = {}, epgURL = '';
  for (let line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    if (/^#EXTM3U/i.test(line)) { const attrs = attributes(line); epgURL = attrs['x-tvg-url'] || attrs['url-tvg'] || ''; continue; }
    if (/^#EXTINF:/i.test(line)) { const comma = metaComma(line); meta = attributes(comma < 0 ? line : line.slice(0, comma)); name = comma < 0 ? '' : line.slice(comma + 1).trim().slice(0, 512); group = (meta['group-title'] || 'غير مصنف').slice(0, 256); headers = {}; continue; }
    if (/^#EXTGRP:/i.test(line)) { group = line.slice(8).trim().slice(0, 256); continue; }
    if (/^#EXTVLCOPT:/i.test(line)) { const [key, ...value] = line.slice(11).split('='); if (key.toLowerCase() === 'http-user-agent') headers['User-Agent'] = value.join('=').slice(0, 512); if (key.toLowerCase() === 'http-referrer') { const referrer = safeURL(value.join('=')); if (referrer) headers.Referer = referrer.href; } continue; }
    if (line.startsWith('#')) continue;
    const url = safeURL(line, base); if (!url) { meta = {}; name = ''; group = ''; headers = {}; continue; }
    const kind = detectM3UKind(meta, url), unique = `${kind}|${url.href}`;
    if (!seen.has(unique)) {
      seen.add(unique); const year = /(?:19|20)\d{2}/.exec(meta['tvg-year'] || name)?.[0] || '';
      items.push({id: `${kind}:m3u:${keyHash(url.href)}`, providerId: '', kind, name: name || meta['tvg-name'] || `قناة ${items.length + 1}`, group: group || 'غير مصنف', url: url.href, logo: safeURL(meta['tvg-logo'], base)?.href || '', epgId: meta['tvg-id'] || '', epgURL: safeURL(epgURL, base)?.href || '', year, genre: meta['tvg-genre'] || '', language: meta['tvg-language'] || '', catchupSource: meta['catchup-source'] || '', catchupDays: clamp(meta['catchup-days'], 0, 365), preview: safeURL(meta['tvg-preview'], base)?.href || '', headers: {...headers}});
      if (items.length >= 200000) break;
    }
    meta = {}; name = ''; group = ''; headers = {};
  }
  if (!items.length) throw new Error('لم يتم العثور على محتوى صالح في القائمة.'); return items;
}

function searchable(item) { let cached = textCache.get(item); const signature = [item.name, item.group, item.genre, item.cast, item.plot, item.language, item.year].join('\u0000'); if (!cached || cached.signature !== signature) { cached = {signature, text: normalize(signature)}; textCache.set(item, cached); } return cached.text; }
function matchQuery(item, query) {
  if (!query) return true;
  const tokens = query.match(/-?"[^"]+"|\S+/g) || [];
  for (let token of tokens) {
    let negate = token.startsWith('-'); if (negate) token = token.slice(1); token = token.replace(/^"|"$/g, '');
    const colon = token.indexOf(':'), field = colon > 0 ? token.slice(0, colon) : '', term = normalize(colon > 0 ? token.slice(colon + 1) : token); let found;
    if (!term) continue;
    if (field === 'year') found = String(item.year || item.name || '').includes(term);
    else if (field === 'genre') found = normalize(item.genre || item.group).includes(term);
    else if (field === 'lang') found = normalize(item.language).includes(term);
    else if (field === 'actor' || field === 'cast') found = normalize(item.cast).includes(term);
    else found = searchable(item).includes(normalize(token));
    if (negate ? found : !found) return false;
  }
  return true;
}
function movieKey(item) { return normalize(item.name).replace(/(?:\b(?:4k|8k|uhd|fhd|hd|sd|hevc|h264|h265|x264|x265|1080p|2160p|720p|bluray|web.?dl|dubbed|subbed)\b|\([^)]*\))/g, ' ').replace(/\s+/g, ' ').trim() + '|' + (item.year || /(?:19|20)\d{2}/.exec(item.name || '')?.[0] || ''); }
export function filterItems(items, options = {}) {
  const {scope = '', group = '', family = '', query = '', year = '', genre = '', language = '', ratingFloor = 0, parental = false, favoritesOnly = false, watchlistOnly = false, historyOnly = false, recentOnly = false, dedupeMovies = true, dedupeChannels = true, sort = 'source', order = [], now = Date.now()} = options;
  const asSet = value => value instanceof Set ? value : new Set(value || []), hidden = asSet(options.hidden), favorites = asSet(options.favorites), watchlist = asSet(options.watchlist), history = asSet((options.history || []).map(value => typeof value === 'string' ? value : value.key)), duplicate = new Set(), result = [];
  for (const item of items || []) {
    if (!item || options.kind && item.kind !== options.kind) continue;
    let key; const getKey = () => key ??= item.key || stableKey(scope, item);
    if (hidden.size && (hidden.has(getKey()) || hidden.has(item.id))) continue;
    if (parental && isAdult(item) || group && group !== item.group || family && !['all', 'favorites', 'history'].includes(family) && family !== classifyLive(item)) continue;
    if ((favoritesOnly || family === 'favorites') && !favorites.has(getKey()) || watchlistOnly && !watchlist.has(getKey()) || (historyOnly || family === 'history') && !history.has(getKey())) continue;
    if (item.kind !== 'live' && (year && !String(item.year || item.name || '').includes(String(year)) || genre && !normalize(`${item.genre || ''} ${item.group || ''}`).includes(normalize(genre)) || language && !normalize(item.language).includes(normalize(language)) || ratingFloor > (Number(item.rating) || 0))) continue;
    const stamp = Number(item.added || 0) * (Number(item.added || 0) > 1e11 ? 1 : 1000); if (recentOnly && !(stamp > 0 && now - stamp <= 7 * 86400000 && now >= stamp)) continue;
    if (!matchQuery(item, query.trim())) continue;
    if (item.kind === 'movie' && dedupeMovies || item.kind === 'live' && dedupeChannels) { const duplicateKey = item.kind === 'movie' ? movieKey(item) : item.url || item.id; if (duplicate.has(duplicateKey)) continue; duplicate.add(duplicateKey); }
    result.push(item);
  }
  if (order.length) { const ranks = new Map(order.map((key, rank) => [key, rank])); result.sort((left, right) => (ranks.get(left.id) ?? ranks.get(left.key) ?? Infinity) - (ranks.get(right.id) ?? ranks.get(right.key) ?? Infinity)); }
  if (sort === 'name' || sort === 'az' || sort === 0) result.sort((left, right) => normalize(left.name).localeCompare(normalize(right.name)));
  else if (sort === 'za' || sort === 1) result.sort((left, right) => normalize(right.name).localeCompare(normalize(left.name)));
  else if (sort === 'recent' || sort === 2) result.sort((left, right) => Number(right.added || 0) - Number(left.added || 0));
  else if (sort === 'rating') result.sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
  return result;
}
export function movieVersions(items, selected) { const key = movieKey(selected); return (items || []).filter(item => item.kind === 'movie' && movieKey(item) === key); }
export function categoryCounts(items, {families = false} = {}) { const counts = new Map(); for (const item of items || []) { const key = families ? classifyLive(item) : item.group || 'غير مصنف'; counts.set(key, (counts.get(key) || 0) + 1); } return counts; }
export function formatExpiry(userInfo = {}, {locale = 'ar-SA-u-ca-gregory', now = Date.now()} = {}) {
  const raw = userInfo.exp_date ?? userInfo.expires ?? userInfo.expiry; let end = Number(raw); end = Number.isFinite(end) && end > 0 ? end * (end > 1e11 ? 1 : 1000) : typeof raw === 'string' && raw.trim() && !/^\d+$/.test(raw.trim()) ? Date.parse(raw) : NaN;
  if (!Number.isFinite(end) || end <= 0) return {known: false, date: '', days: null, expired: false, text: 'لم يحدد المزود تاريخ الانتهاء'};
  const days = Math.max(0, Math.ceil((end - now) / 86400000)), expired = end <= now, date = new Date(end).toLocaleDateString(locale);
  return {known: true, date, days, expired, timestamp: end, text: `تاريخ انتهاء الاشتراك: ${date} · ${expired ? 'انتهى الاشتراك' : `المتبقي: ${days} يوم`}`};
}

export class ApiError extends Error {
  constructor(message, {code = 'API_ERROR', status = 0, cause, partial = false, canDirect = false} = {}) { super(message, {cause}); this.name = 'ApiError'; this.code = code; this.status = status; this.partial = partial; this.canDirect = canDirect; }
}
function abortError() { return new ApiError('أُلغي الطلب.', {code: 'ABORTED'}); }
function accountPayload(account) {
  const source = account || {}; let mode = source.mode || 'provider', server = source.server || PROVIDER, username = source.username ?? source.user ?? '', password = source.password || '', url = source.url || source.playlist || (['m3u', 'direct', 'auto'].includes(mode) ? source.server || '' : '');
  if (mode === 'auto') {
    const parsed = safeURL(url || server);
    if (parsed?.searchParams.has('username') && parsed.searchParams.has('password')) { username ||= parsed.searchParams.get('username'); password ||= parsed.searchParams.get('password'); parsed.pathname = parsed.pathname.replace(/\/(?:get|player_api)\.php$/i, ''); parsed.search = ''; parsed.hash = ''; server = parsed.href.replace(/\/$/, ''); mode = 'xtream'; }
    else mode = username && password ? 'xtream' : /\.(?:m3u8|ts|mp4|mkv|webm)(?:[?#]|$)/i.test(url) ? 'direct' : 'm3u';
  }
  return {mode, server, username, password, url, mac: source.mac || (mode === 'stalker' ? source.user || source.username || '' : '')};
}
function deadline(signal, milliseconds) {
  const controller = new AbortController(); let timer, timedOut = false, rejectTimeout;
  const promise = new Promise((_, reject) => { rejectTimeout = reject; }); promise.catch(() => {});
  const cancel = () => { controller.abort(); rejectTimeout(abortError()); };
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, {once: true});
  const reset = duration => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout(new ApiError('تأخر المصدر. حاول التحديث لإعادة المحاولة.', {code: 'TIMEOUT'})); }, duration); };
  reset(milliseconds);
  return {signal: controller.signal, race: task => Promise.race([task, promise]), extend: reset, get timedOut() { return timedOut; }, done() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }};
}

// Compatibility export: all native API consumers share one byte-exact bridge.
export const nativeAPIFetch = nativeFetch;

let providerRequestSerial = 0;
/** A provider selected by the user is contacted on their iPhone, never through
 * an unrestricted public server proxy. The bridge has its own URLSession policy. */
function nativeProviderFetch(url, options = {}) {
  const requestId = `provider-${Date.now()}-${++providerRequestSerial}`;
  if (options.signal?.aborted) return Promise.reject(abortError());
  const abort = () => { void nativeRequest('apiCancel', {requestId}).catch(() => {}); };
  options.signal?.addEventListener('abort', abort, {once: true});
  return nativeRequest('providerRequest', {url: String(url), method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers || {})), requestId, stream: false}).then(data => {
    const status = Number(data.status);
    if (!Number.isInteger(status) || status < 200 || status > 599) throw new ApiError('رد اتصال الآيفون غير صالح.', {code: 'INVALID_RESPONSE'});
    return new Response([204, 205, 304].includes(status) ? null : String(data.body || ''), {status, headers: data.headers || {}});
  }).finally(() => options.signal?.removeEventListener('abort', abort));
}

export class ApiClient {
  constructor({base = globalThis.ABUNASSER_CONFIG?.apiBase || (globalThis.ABUNASSER_CONFIG?.apiOrigin ? globalThis.ABUNASSER_CONFIG.apiOrigin.replace(/\/$/, '') + '/api/client' : '/api/client'), fetch: fetchImpl = null, vault = null, timeout = 7000, onStatus = () => {}} = {}) {
    this.base = base; this.fetch = fetchImpl || (isNative() ? nativeAPIFetch : globalThis.fetch?.bind(globalThis)); this.vault = vault || new Vault({namespace: 'catalog-cache'}); this.timeout = timeout; this.onStatus = onStatus; this.memory = new Map(); this.detailsCache = new Map(); this.lastStatus = {}; this.timings = {};
  }
  _status(kind, value) { this.lastStatus[kind] = {...this.lastStatus[kind], ...value}; this.onStatus(kind, this.lastStatus[kind]); }
  async _response(payload, clock) {
    if (!this.fetch) throw new ApiError('الاتصال غير متاح في هذا الجهاز.', {code: 'FETCH_UNAVAILABLE'});
    let response;
    try { response = await clock.race(this.fetch(this.base, {method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json, application/x-ndjson'}, body: JSON.stringify(payload), signal: clock.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'})); }
    catch (error) { if (error instanceof ApiError) throw error; if (clock.signal.aborted) throw clock.timedOut ? new ApiError('تأخر المصدر. حاول مجددًا.', {code: 'TIMEOUT'}) : abortError(); throw new ApiError('تعذر الاتصال بالمصدر. تحقق من الاتصال وعنوان الاشتراك.', {code: 'NETWORK', cause: error}); }
    if (!response.ok) { let data = {}; try { data = await clock.race(response.json()); } catch {} if (data.code === 'HOST_NOT_ALLOWED' && data.canDirect) return this._directResponse(payload, clock); throw new ApiError(data.error || data.message || `رفض المصدر الطلب (HTTP ${response.status}).`, {status: response.status, code: data.code || `HTTP_${response.status}`, canDirect: !!data.canDirect}); }
    return response;
  }
  async request(op, account, extra = {}, {signal, timeout = this.timeout} = {}) {
    if (signal?.aborted) throw abortError();
    const clock = deadline(signal, timeout);
    try { const response = await this._response({op, account: accountPayload(account), ...extra}, clock); return await clock.race(response.json()); }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('استجابة المصدر غير صالحة.', {code: 'INVALID_RESPONSE', cause: error}); }
    finally { clock.done(); }
  }
  async _directResponse(payload, clock) {
    const account = payload.account;
    const download = async (address, text = false, headers = {}) => {
      const url = safeURL(address); if (!url || !isNative() && url.protocol !== 'https:') throw new ApiError('العنوان غير مهيأ في وسيط الموقع. الاتصال المباشر في المتصفح يحتاج HTTPS ودعم CORS من المزود.', {code: 'DIRECT_HTTPS_REQUIRED', canDirect: true});
      const directFetch = isNative() ? nativeProviderFetch : this.fetch;
      let response; try { response = await clock.race(directFetch(url.href, {signal: clock.signal, headers, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store'})); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(isNative() ? 'تعذر اتصال الآيفون بالمزود. تحقق من العنوان والاشتراك.' : 'لم يسمح المزود باتصال المتصفح المباشر. يلزم تفعيل CORS أو تهيئة عنوان المزود في وسيط الموقع.', {code: isNative() ? 'DIRECT_NETWORK' : 'DIRECT_CORS', cause: error}); }
      if (!response.ok) throw new ApiError(`رفض المصدر الاتصال المباشر (HTTP ${response.status}).`, {code: `HTTP_${response.status}`, status: response.status});
      return clock.race(text ? response.text() : response.json());
    };
    const respond = data => new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
    const directSource = address => { const url = safeURL(address); if (!url || !isNative() && url.protocol !== 'https:') throw new ApiError('تشغيل المصدر في المتصفح يحتاج HTTPS أو وسيطًا مهيأ.', {code: 'DIRECT_HTTPS_REQUIRED'}); return {url: url.href, sourceUrl: url.href, mime: mimeForURL(url.href), alternatives: [], nativePreferred: isNative()}; };
    if (account.mode === 'stalker') {
      if (!isNative()) throw new ApiError('يحتاج اشتراك Stalker إلى تهيئة عنوانه في وسيط الموقع؛ لا يتيح المتصفح رؤوس MAC المطلوبة مباشرة.', {code: 'HOST_NOT_ALLOWED', canDirect: false});
      if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(account.mac)) throw new ApiError('عنوان MAC غير صالح.', {code: 'INVALID_MAC'});
      const portal = safeURL(account.server); if (!portal) throw new ApiError('عنوان البوابة غير صالح.', {code: 'INVALID_URL'});
      portal.pathname = portal.pathname.replace(/\/server\/load\.php$/, '').replace(/\/c\/?$/, '').replace(/\/+$/, '') + '/server/load.php'; portal.search = ''; portal.hash = '';
      const headers = {'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) MAG250/0.2.18 Firmware/0.2.18', 'X-User-Agent': 'Model: MAG250; Link: Ethernet', Cookie: `mac=${account.mac}; stb_lang=en; timezone=GMT`, Referer: portal.origin + portal.pathname.replace('/server/load.php', '/c/')};
      const call = async (token, type, action, extra = {}) => { const address = new URL(portal); for (const [key, value] of Object.entries({type, action, ...extra, JsHttpRequest: '1-xml'})) address.searchParams.set(key, String(value)); const data = await download(address.href, false, token ? {...headers, Authorization: `Bearer ${token}`} : headers); return data?.js && typeof data.js === 'object' ? data.js : data; };
      const handshake = await call('', 'stb', 'handshake'), token = typeof handshake?.token === 'string' ? handshake.token : ''; if (!token || token.length > 4000) throw new ApiError('البوابة لم تعد رمز جلسة صالحًا.', {code: 'STALKER_TOKEN'});
      if (payload.op === 'auth') { await call(token, 'stb', 'get_profile'); return respond({userInfo: {auth: 1, status: 'Active'}}); }
      if (payload.op === 'catalog') {
        if (payload.kind !== 'live') throw new ApiError('المتاح لهذه البوابة هنا هو القنوات المباشرة.', {code: 'STALKER_KIND'});
        const data = await call(token, 'itv', 'get_all_channels'), rows = Array.isArray(data?.data) ? data.data : data?.data?.data;
        if (!Array.isArray(rows)) throw new ApiError('البوابة لم تعد قائمة قنوات صالحة.', {code: 'INVALID_RESPONSE'});
        const seen = new Set(), items = []; for (const [n, row] of rows.slice(0, 200000).entries()) { const id = String(row.id || row.ch_id || n); if (seen.has(id)) continue; seen.add(id); items.push({id: `live:${id}`, providerId: id, kind: 'live', name: String(row.name || row.title || `قناة ${n + 1}`).slice(0, 512), group: String(row.category_name || row.tv_genre_title || row.genre || 'غير مصنف').slice(0, 512), logo: String(row.logo || row.icon || ''), url: '', command: String(row.cmd || row.url || id).slice(0, 8192)}); }
        return respond({items, categories: [], partial: rows.length > 200000});
      }
      if (payload.op === 'resolve') { const command = String(payload.item?.command || ''); if (!command || command.length > 8192) throw new ApiError('أعد فتح قائمة القنوات لتجديد رابطها.', {code: 'STALKER_COMMAND'}); const result = await call(token, 'itv', 'create_link', {cmd: command, series: '0'}), raw = String(result.cmd || result.url || result.data?.cmd || ''), found = /https?:\/\/[^\s"'<>]+/i.exec(raw)?.[0]?.split('|')[0]?.replace(/[,;]+$/, ''); const source = directSource(found); return respond({...source, headers}); }
      if (payload.op === 'details') return respond({info: payload.item || {}, episodes: {}});
      if (payload.op === 'epg') return respond({programs: []});
    }
    if (account.mode === 'direct') {
      if (payload.op === 'resolve') return respond(directSource(payload.item?.url || account.url));
      if (payload.op === 'details') return respond({info: payload.item || {}, episodes: {}});
      if (payload.op === 'epg') return respond({programs: []});
    }
    if (['m3u', 'm3u-file'].includes(account.mode) || account.mode === 'auto' && account.url) {
      if (payload.op === 'auth') { await download(account.url, true); return respond({userInfo: {status: 'Active', local: false}}); }
      if (payload.op === 'catalog') return respond({items: parseM3U(await download(account.url, true), account.url).filter(item => item.kind === payload.kind), categories: []});
      if (payload.op === 'resolve') return respond(directSource(payload.item?.url));
      if (payload.op === 'details') return respond({info: payload.item || {}, episodes: {}});
      if (payload.op === 'epg') return respond({programs: []});
    }
    const server = safeURL(account.server); if (!server || !isNative() && server.protocol !== 'https:') throw new ApiError('أضف عنوان HTTPS أو هيئ هذا المزود في وسيط الموقع.', {code: 'DIRECT_HTTPS_REQUIRED', canDirect: true});
    const endpoint = (action = '', extra = {}) => { const url = new URL(server); url.pathname = url.pathname.replace(/\/$/, '') + '/player_api.php'; url.search = ''; url.searchParams.set('username', account.username); url.searchParams.set('password', account.password); if (action) url.searchParams.set('action', action); for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value); return url; };
    const stream = (kind, id, extension) => { const url = new URL(server); url.pathname = url.pathname.replace(/\/$/, '') + '/' + [kind === 'episode' ? 'series' : kind, account.username, account.password, `${id}.${extension}`].map(encodeURIComponent).join('/'); url.search = ''; url.hash = ''; return url.href; };
    if (payload.op === 'auth') { const data = await download(endpoint()); if (String(data.user_info?.auth) !== '1' || data.user_info.status && !/^active$/i.test(data.user_info.status)) throw new ApiError('بيانات الدخول غير صحيحة أو الاشتراك غير نشط.', {code: 'ACCOUNT_REJECTED', status: 401}); return respond({userInfo: data.user_info, serverInfo: data.server_info || {}}); }
    if (payload.op === 'catalog') {
      const kind = payload.kind, name = kind === 'movie' ? 'vod' : kind, raw = await download(endpoint(`get_${name === 'series' ? 'series' : name + '_streams'}`)); if (!Array.isArray(raw)) throw new ApiError('صيغة قائمة المزود غير صالحة.', {code: 'INVALID_RESPONSE'});
      let categories = []; try { const value = await download(endpoint(`get_${name}_categories`)); if (Array.isArray(value)) categories = value; } catch (error) { if (clock.signal.aborted) throw error; }
      const names = new Map(categories.map(category => [String(category.category_id), category.category_name]));
      const items = raw.filter(row => row[kind === 'series' ? 'series_id' : 'stream_id'] != null).slice(0, 200000).map(row => { const id = String(row[kind === 'series' ? 'series_id' : 'stream_id']), extension = kind === 'live' ? ['ts', 'm3u8'].includes(String(row.container_extension).toLowerCase()) ? String(row.container_extension).toLowerCase() : 'm3u8' : row.container_extension || 'mp4'; return {id: `${kind}:${id}`, providerId: id, kind, name: row.name || 'بدون عنوان', categoryId: String(row.category_id || ''), group: names.get(String(row.category_id)) || 'غير مصنف', logo: row.stream_icon || row.cover || '', url: kind === 'series' ? '' : stream(kind, id, extension), extension, year: row.year || row.releaseDate?.slice(0, 4) || '', genre: row.genre || '', language: row.language || '', rating: row.rating || (Number(row.rating_5based) * 2 || ''), added: row.added || row.last_modified || '', plot: row.plot || '', cast: row.cast || ''}; });
      return respond({items, categories});
    }
    if (payload.op === 'details') { const series = payload.kind === 'series', data = await download(endpoint(series ? 'get_series_info' : 'get_vod_info', {[series ? 'series_id' : 'vod_id']: payload.id})); return respond({info: {...(payload.item || {}), ...(data.movie_data || {}), ...(data.info || {})}, episodes: data.episodes || {}}); }
    if (payload.op === 'epg') { const data = await download(endpoint('get_short_epg', {stream_id: payload.id, limit: 50})); return respond({programs: (data.epg_listings || []).map(program => ({...program, title: decodeProviderText(program.title), description: decodeProviderText(program.description)}))}); }
    if (payload.op === 'resolve') {
      const item = payload.item || {}, kind = payload.kind === 'episode' ? 'series' : payload.kind, extension = kind === 'live' ? item.extension === 'ts' || /\.ts(?:\?|$)/i.test(item.url || '') ? 'ts' : 'm3u8' : item.extension || item.container_extension || 'mp4';
      // Reconstruct generated routes from the current password; a cache scope
      // intentionally does not change when an account password is renewed.
      const generated = ['provider', 'xtream', 'auto'].includes(account.mode) && /^(?:live|movie|series)$/.test(kind) && /^\d+$/.test(String(payload.id));
      const source = generated ? stream(kind, payload.id, extension) : item.url, url = safeURL(source); if (!url || !isNative() && url.protocol !== 'https:') throw new ApiError('رابط الوسائط المباشر يحتاج HTTPS.', {code: 'DIRECT_HTTPS_REQUIRED'});
      return respond({url: url.href, sourceUrl: url.href, mime: mimeForURL(url.href), nativePreferred: isNative(), alternatives: generated && kind === 'live' ? [stream(kind, payload.id, extension === 'ts' ? 'm3u8' : 'ts')].map(address => ({url: address, sourceUrl: address, mime: mimeForURL(address)})) : []});
    }
    throw new ApiError('العملية غير مدعومة.', {code: 'INVALID_OPERATION'});
  }
  async authenticate(account, options = {}) {
    if (['demo', 'm3u-file', 'direct'].includes(account?.mode)) return {userInfo: {status: 'Active', local: true}};
    return this.request('auth', account, {}, options);
  }
  async catalog(account, kind, {signal, onBatch = () => {}, force = false, maxAge = 6 * 3600000} = {}) {
    if (signal?.aborted) throw abortError();
    if (!['live', 'movie', 'series'].includes(kind)) throw new ApiError('قسم غير صالح.', {code: 'INVALID_KIND'});
    if (account?.mode === 'm3u-file') { const rows = (account.items || []).filter(item => item.kind === kind); onBatch(rows, {kind, cached: true, partial: false}); return rows; }
    if (account?.mode === 'direct') { const source = safeURL(account.url); if (!source) throw new ApiError('رابط البث المباشر غير صالح.', {code: 'INVALID_URL'}); const rows = kind === 'live' ? [{id: 'live:direct', providerId: 'direct', kind: 'live', name: account.name || 'بث مباشر', group: 'روابط مباشرة', url: source.href}] : []; onBatch(rows, {kind, cached: true, partial: false}); return rows; }
    const began = performance.now(), scope = accountScope(account), key = `${scope}:${kind}`, memory = this.memory.get(key), first = rows => onBatch(rows.slice(0, 128), {kind, cached: true, partial: true});
    this._status(kind, {loading: true, partial: false, error: null});
    if (!force && memory && Date.now() - memory.savedAt < maxAge) { onBatch(memory.items, {kind, cached: true, partial: false}); this._status(kind, {loading: false, cached: true, count: memory.items.length}); return memory.items; }
    let preview, cached;
    try { preview = await this.vault.get(`preview:${key}`); if (preview?.items?.length) first(preview.items); } catch (error) { this._status(kind, {storageError: error.code || 'STORAGE_ERROR'}); }
    if (!force) {
      try { cached = await this.vault.get(`full:${key}`); if (Array.isArray(cached?.items) && cached.complete && Date.now() - cached.savedAt < maxAge) { this.memory.set(key, cached); onBatch(cached.items, {kind, cached: true, partial: false}); this._status(kind, {loading: false, cached: true, count: cached.items.length}); return cached.items; } } catch (error) { this._status(kind, {storageError: error.code || 'STORAGE_ERROR'}); }
    }
    if (signal?.aborted) throw abortError();
    const clock = deadline(signal, this.timeout), collected = []; let firstReceived = false, lastPublishedAt = 0, categories = null;
    const publish = (rows, partial) => {
      if (!Array.isArray(rows)) return; if (rows.length + collected.length > 200000) throw new ApiError('القائمة تتجاوز حد العناصر.', {code: 'CATALOG_TOO_LARGE'});
      for (const item of rows) collected.push(item);
      if (rows.length && !firstReceived) { firstReceived = true; clock.extend(90000); this.timings[kind] = {firstMs: Math.round(performance.now() - began), rows: collected.length}; void this.vault.set(`preview:${key}`, {items: collected.slice(0, 128), savedAt: Date.now(), complete: false}).catch(() => {}); }
      if (rows.length && (lastPublishedAt === 0 || performance.now() - lastPublishedAt >= 250)) { lastPublishedAt = performance.now(); onBatch(collected.slice(), {kind, cached: false, partial}); }
    };
    try {
      const response = await this._response({op: 'catalog', account: accountPayload(account), kind}, clock);
      if (/application\/(?:x-ndjson|ndjson)/i.test(response.headers.get('content-type') || '') && response.body?.getReader) {
        const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', bytes = 0, done = false;
        const line = text => { if (!text.trim()) return; let data; try { data = JSON.parse(text); } catch { throw new ApiError('استجابة القائمة غير مكتملة.', {code: 'INVALID_RESPONSE'}); } if (data.error) throw new ApiError(data.error, {code: data.code || 'PROVIDER_ERROR'}); if (data.categories) categories = data.categories; if (Array.isArray(data.items)) publish(data.items, !data.done); if (data.done) done = true; };
        try { for (;;) { const chunk = await clock.race(reader.read()); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 64 * 1024 * 1024) throw new ApiError('القائمة أكبر من الحد المسموح.', {code: 'CATALOG_TOO_LARGE'}); pending += decoder.decode(chunk.value, {stream: true}); let split; while ((split = pending.indexOf('\n')) >= 0) { line(pending.slice(0, split)); pending = pending.slice(split + 1); } if (pending.length > 16 * 1024 * 1024) throw new ApiError('دفعة القائمة أكبر من الحد.', {code: 'CATALOG_TOO_LARGE'}); } pending += decoder.decode(); if (pending.trim()) line(pending); if (!done) throw new ApiError('انقطع المصدر قبل اكتمال القائمة.', {code: 'INCOMPLETE_CATALOG'}); }
        finally { if (!done) void reader.cancel().catch(() => {}); reader.releaseLock(); }
      } else {
        const data = await clock.race(response.json()); const rows = Array.isArray(data) ? data : data.items; if (!Array.isArray(rows)) throw new ApiError('صيغة القائمة غير صالحة.', {code: 'INVALID_RESPONSE'}); publish(rows, !!data.partial); if (data.partial) throw new ApiError('وصل جزء من القائمة فقط. يمكنك التحديث لإكمالها.', {code: 'INCOMPLETE_CATALOG'});
      }
      if (categories) { const names = new Map((Array.isArray(categories) ? categories : Object.entries(categories).map(([id, name]) => ({category_id: id, category_name: name}))).map(category => [String(category.category_id ?? category.id), category.category_name ?? category.name])); for (const item of collected) if (names.has(String(item.categoryId))) item.group = names.get(String(item.categoryId)); }
      const entry = {items: collected, complete: true, savedAt: Date.now()}; this.memory.set(key, entry); this.timings[kind] = {...this.timings[kind], totalMs: Math.round(performance.now() - began), rows: collected.length, state: 'ready'};
      this._status(kind, {loading: false, partial: false, cached: false, count: collected.length}); onBatch(collected, {kind, cached: false, partial: false});
      // UI delivery precedes storage encryption. A cancelled/partial read never overwrites a complete catalogue.
      void this.vault.set(`full:${key}`, entry).catch(error => this._status(kind, {storageError: error.code || 'STORAGE_ERROR'})); return collected;
    } catch (error) {
      const failure = error instanceof ApiError ? error : new ApiError('تعذر تحميل القائمة.', {code: 'NETWORK', cause: error});
      this.timings[kind] = {...this.timings[kind], totalMs: Math.round(performance.now() - began), state: failure.code};
      this._status(kind, {loading: false, partial: true, error: failure.message, code: failure.code});
      if (failure.code === 'ABORTED' || signal?.aborted) throw abortError();
      const available = collected.length ? collected : cached?.items || preview?.items || memory?.items; if (available?.length) { onBatch(available, {kind, cached: !collected.length, partial: true, error: failure.message}); return available; } throw failure;
    } finally { clock.done(); }
  }
  async details(account, item, options = {}) {
    if (options.signal?.aborted) throw abortError();
    if (['m3u-file', 'm3u', 'direct'].includes(account?.mode)) return {info: {...item}, episodes: {}};
    const key = `${accountScope(account)}:${item.kind}:${item.providerId || item.id || item.url}`, cached = this.detailsCache.get(key);
    if (!options.force && cached && Date.now() - cached.savedAt < 12 * 3600000) { this.detailsCache.delete(key); this.detailsCache.set(key, cached); return cached.data; }
    const data = await this.request('details', account, {kind: item.kind, id: item.providerId || String(item.id || '').replace(/^[^:]+:/, ''), item}, options);
    // Keep only one series' potentially large episode list, plus recent title info.
    if (item.kind === 'series') for (const [oldKey, entry] of this.detailsCache) if (entry.kind === 'series' && oldKey !== key) this.detailsCache.delete(oldKey);
    this.detailsCache.set(key, {kind: item.kind, data, savedAt: Date.now()});
    while (this.detailsCache.size > 24) this.detailsCache.delete(this.detailsCache.keys().next().value);
    return data;
  }
  async epg(account, item, options = {}) { const data = await this.request('epg', account, {kind: 'live', id: item.providerId || String(item.id || '').replace(/^live:/, ''), item}, options); return data.programs || data.epg_listings || []; }
  async resolve(account, item, options = {}) { if (account?.mode === 'm3u-file') account = {mode: 'direct', url: item.url}; const data = await this.request('resolve', account, {kind: item.kind, id: item.providerId || String(item.id || '').replace(/^[^:]+:/, ''), item}, options); const base = safeURL(this.base, globalThis.location?.href)?.origin || globalThis.ABUNASSER_CONFIG?.apiOrigin; const address = value => typeof value === 'string' && value.startsWith('/') && base ? new URL(value, base).href : value; return {...data, url: address(data.url), alternatives: (data.alternatives || []).map(value => typeof value === 'string' ? address(value) : {...value, url: address(value.url)})}; }
  async clearCatalogs(account) { const scope = accountScope(account); for (const kind of ['live', 'movie', 'series']) { this.memory.delete(`${scope}:${kind}`); await this.vault.remove(`preview:${scope}:${kind}`); await this.vault.remove(`full:${scope}:${kind}`); } }
}

function mimeForURL(address) { const path = safeURL(address)?.pathname.toLowerCase() || ''; return path.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : path.endsWith('.ts') ? 'video/mp2t' : path.endsWith('.webm') ? 'video/webm' : 'video/mp4'; }
function decodeProviderText(value) { const text = String(value || ''); if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) return text; try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(text), char => char.charCodeAt(0))); } catch { return text; } }

/** Optional structured profile library. UI may instead keep its own encrypted state. */
export class UserLibrary {
  constructor({vault = new Vault(), account = {}, profile = 'Default'} = {}) { this.vault = vault.scope(`library:${accountScope(account)}:${keyHash(profile)}`); this.scope = accountScope(account); this.data = {favorites: [], hidden: [], watchlist: [], history: [], progress: {}, channelOrder: []}; this.ready = this.vault.get('library', this.data).then(value => { this.data = {...this.data, ...value}; return this; }); }
  async save() { await this.ready; return this.vault.set('library', this.data); }
  key(item) { return stableKey(this.scope, item); }
  async toggle(collection, item) { await this.ready; if (!['favorites', 'hidden', 'watchlist'].includes(collection)) throw new Error('Invalid collection'); const key = this.key(item), values = new Set(this.data[collection]); values.has(key) ? values.delete(key) : values.add(key); this.data[collection] = [...values]; await this.save(); return values.has(key); }
  async record(item, {position = 0, duration = 0, privacy = false} = {}) { await this.ready; if (privacy) return; const key = this.key(item); this.data.history = [{key, item: {id: item.id, kind: item.kind, name: item.name, group: item.group, logo: item.logo}, at: Date.now()}, ...this.data.history.filter(value => value.key !== key)].slice(0, 200); if (duration > 0 && position >= 0 && item.kind !== 'live') this.data.progress[key] = {position, duration, at: Date.now()}; await this.save(); }
  async clearHistory() { await this.ready; this.data.history = []; this.data.progress = {}; await this.save(); }
  async reorder(ids) { await this.ready; this.data.channelOrder = [...new Set(ids)].slice(0, 200000); await this.save(); }
}

export function capabilities(target = globalThis) {
  const native = !!target.webkit?.messageHandlers?.abunasser || !!target.AbunasserNative?.available;
  const video = target.document?.createElement?.('video');
  return {native, encryptedStorage: native || !!target.crypto?.subtle, persistentStorage: native || typeof target.indexedDB !== 'undefined', pip: !!target.document?.pictureInPictureEnabled || !!video?.webkitSupportsPresentationMode, airplay: native || !!target.WebKitPlaybackTargetAvailabilityEvent, share: !!target.navigator?.share, clipboard: !!target.navigator?.clipboard?.writeText, notifications: native || 'Notification' in target, screenCapture: native || !!target.navigator?.mediaDevices?.getDisplayMedia, nativeDownloads: native, decoderSelection: false, hls: !!video?.canPlayType?.('application/vnd.apple.mpegurl'), mediaSource: !!target.MediaSource || !!target.ManagedMediaSource};
}

export async function derivePIN(pin, salt = null) {
  if (!/^\d{4,8}$/.test(String(pin))) throw new Error('استخدم رمزًا من 4 إلى 8 أرقام.');
  if (isNative()) return nativeRequest('derivePIN', {pin: String(pin), ...(salt ? {salt: [...salt]} : {}), iterations: 150000});
  salt ||= crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256'}, material, 256);
  return {salt: [...salt], hash: [...new Uint8Array(bits)]};
}
export async function verifyPIN(pin, record) { if (!record?.salt || !record?.hash || !/^\d{4,8}$/.test(String(pin))) return false; const candidate = await derivePIN(pin, new Uint8Array(record.salt)); if (candidate.hash.length !== record.hash.length) return false; let difference = 0; for (let n = 0; n < candidate.hash.length; n++) difference |= candidate.hash[n] ^ record.hash[n]; return difference === 0; }
