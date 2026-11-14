/* Container compatibility helpers. This transmuxes supported codecs; it is not a video transcoder. */
(() => {
  'use strict';
  const mime = (value) => String(value || '').split(';')[0].trim().toLowerCase();
  const transportType = (value) => /^(?:video\/(?:mp2t|mpegts|x-mpegts|x-m2ts)|application\/mpegts)$/.test(mime(value)) ? 'mpegts'
    : /^(?:video\/(?:x-flv|flv)|application\/x-flv)$/.test(mime(value)) ? 'flv' : null;
  const isHls = (value) => mime(value) === 'hls' || /mpegurl/.test(mime(value));
  const knownType = (value) => isHls(value) || !!transportType(value) || /^(?:video|audio)\//.test(mime(value));
  async function errorCode(response) {
    if (!response.body || !/application\/json/i.test(response.headers.get('Content-Type') || '')) return '';
    const reader = response.body.getReader(); let bytes = 0, text = '';
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength; if (bytes > 4096) return '';
        // The only retained value is a bounded ASCII protocol code. The Arabic
        // error text and any arbitrary upstream details are never displayed.
        for (const value of part.value) text += String.fromCharCode(value);
      }
      const code = JSON.parse(text).code;
      return ['SOURCE_HOST','SOURCE_URL','SOURCE','MEDIA','MANIFEST','RANGE','RATE','BUSY','CONFIG','ENDED','GUEST','TOKEN'].includes(code) ? code : '';
    } catch (_) { return ''; }
    finally { await reader.cancel().catch(() => {}); }
  }

  function externalLaunchUrl(mediaUrl, userAgent) {
    const url = new URL(mediaUrl, window.location.origin);
    if (url.origin !== window.location.origin || !/^\/api\/watch\/rooms\/[a-f0-9-]{36}\/media$/.test(url.pathname) || !url.searchParams.get('e') || url.username || url.password || url.hash) throw new Error('invalid_external_media');
    if (/Android/i.test(userAgent || '')) return 'intent://' + url.host + url.pathname + url.search + '#Intent;scheme=' + url.protocol.slice(0, -1) + ';action=android.intent.action.VIEW;package=org.videolan.vlc;type=video/*;end';
    if (/iPhone|iPad|iPod/i.test(userAgent || '')) return 'vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(url.href);
    return 'vlc://' + url.href;
  }

  function createLoader(mpegts, allowed) {
    return class WatchStreamLoader extends mpegts.BaseLoader {
      constructor() { super('watch-same-origin-stream'); this._needStash = true; this.controller = null; this.reader = null; this.timer = null; }
      abort() { if (this.controller) this.controller.abort(); this.controller = null; if (this.reader) this.reader.cancel().catch(() => {}); this.reader = null; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; this._status = mpegts.LoaderStatus.kIdle; }
      destroy() { this.abort(); super.destroy(); }
      open(source, range) {
        this.abort();
        if (!allowed(source.url)) { this._status = mpegts.LoaderStatus.kError; if (this._onError) this._onError(mpegts.LoaderErrors.EXCEPTION, {code: -1, msg: 'Invalid media origin'}); return; }
        const controller = new AbortController(); this.controller = controller; this._status = mpegts.LoaderStatus.kConnecting;
        const from = Number.isSafeInteger(range.from) && range.from >= 0 ? range.from : 0;
        const to = Number.isSafeInteger(range.to) && range.to >= from ? range.to : -1;
        const headers = {}; if (from || to >= 0) headers.Range = 'bytes=' + from + '-' + (to >= 0 ? to : '');
        const arm = () => { if (this.timer !== null) clearTimeout(this.timer); this.timer = setTimeout(() => controller.abort(), 20000); };
        const fail = (code, kind = mpegts.LoaderErrors.EXCEPTION) => { this._status = mpegts.LoaderStatus.kError; if (this._onError) this._onError(kind, {code, msg: 'Watch media transport failed'}); };
        arm();
        fetch(source.url, {method: 'GET', headers, credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal}).then(async response => {
          if (this.controller !== controller) { await response.body?.cancel(); return; }
          if (!response.ok || (from > 0 && response.status !== 206)) { await response.body?.cancel(); fail(response.status, mpegts.LoaderErrors.HTTP_STATUS_CODE_INVALID); return; }
          const length = Number(response.headers.get('Content-Length'));
          if (Number.isSafeInteger(length) && length > 0 && this._onContentLengthKnown) this._onContentLengthKnown(length);
          if (!response.body) { fail(-1); return; }
          this.reader = response.body.getReader(); let received = 0;
          while (this.controller === controller) {
            arm(); const part = await this.reader.read(); if (this.controller !== controller) return;
            if (part.done) {
              if (Number.isSafeInteger(length) && length > 0 && received < length) { fail(-1, mpegts.LoaderErrors.EARLY_EOF); return; }
              this._status = mpegts.LoaderStatus.kComplete; if (this._onComplete) this._onComplete(from, from + received - 1); return;
            }
            this._status = mpegts.LoaderStatus.kBuffering;
            const data = part.value; const start = from + received; received += data.byteLength;
            const bytes = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength ? data.buffer : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            if (this._onDataArrival) this._onDataArrival(bytes, start, received);
          }
        }).catch(() => { if (this.controller === controller) fail(-1); }).finally(() => { if (this.controller === controller && this.timer !== null) { clearTimeout(this.timer); this.timer = null; } });
      }
    };
  }
  window.WatchMedia = {mime, isHls, transportType, knownType, errorCode, externalLaunchUrl, createLoader};
})();
