(() => {
  'use strict';

  // Invitation secrets stay only in memory until a claim succeeds or is denied.
  const invitation = new URLSearchParams(window.location.hash.slice(1));
  const invitedId = invitation.get('id');
  let invitationToken = invitation.get('token');
  let claimNonce = null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  invitation.delete('token');

  const $ = (id) => document.getElementById(id);
  const video = $('watch-video');
  const roomTitle = $('room-title');
  const overlay = $('welcome-overlay');
  const startButton = $('start-watch');
  const leaveButton = $('leave-button');
  const muteButton = $('mute-button');
  const fullscreenButton = $('fullscreen-button');
  const notice = $('notice');
  const progress = $('playback-progress');
  const externalButton = $('external-player-button');
  const externalPanel = $('external-player-panel');
  const externalStatus = $('external-player-status');
  const externalLink = $('external-vlc-link');
  const externalCopy = $('external-copy-link');
  const externalInstall = $('external-install-link');
  const storageKey = 'abonasser-watch-room';
  const validId = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
  const validToken = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  let roomId = validId(invitedId) ? invitedId : null;
  let savedId = null;
  try { savedId = sessionStorage.getItem(storageKey); } catch (_) { /* Storage is optional. */ }
  if (!roomId && !invitedId && !invitationToken && validId(savedId)) roomId = savedId;

  let snapshot = null;
  let hls = null;
  let transport = null;
  let playbackEngine = '';
  let detectedRevision = null;
  let detectedType = '';
  let hlsRecoveryRevision = null;
  let externalMediaUrl = null;
  let externalRequest = null;
  let originalSourceUrl = null;
  let browserTicket = null;
  let browserTicketAttempt = null;
  let browserTicketRequest = null;
  let externalMode = false;
  let currentRevision = null;
  let sourceUrl = null;
  let sourceGeneration = 0;
  let sourceController = null;
  let sourceTimeout = null;
  let requestController = null;
  let requestTimeout = null;
  let pollTimer = null;
  let started = false;
  let connected = false;
  let closed = false;
  let left = false;
  let terminal = false;
  let loading = false;
  let buffering = false;
  let sourceBroken = false;
  let sourceReady = false;
  let playPending = false;
  let retrySource = false;
  let overlayAction = null;

  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;

  function showOverlay(title, description, action = null, label = 'بدء المشاهدة') {
    $('overlay-title').textContent = title;
    $('overlay-description').textContent = description;
    $('start-label').textContent = label;
    overlayAction = action;
    startButton.hidden = action === null;
    startButton.disabled = action === null;
    overlay.hidden = false;
    $('buffering-indicator').hidden = true;
  }

  function showNotice(message, kind = 'warning') {
    notice.textContent = message;
    notice.dataset.kind = kind;
    notice.hidden = !message;
  }

  function setConnection(state, label) {
    $('connection').dataset.state = state;
    $('connection-label').textContent = label;
  }

  function clearPoll() {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function abortRequest() {
    if (requestTimeout !== null) clearTimeout(requestTimeout);
    requestTimeout = null;
    if (requestController) requestController.abort();
    requestController = null;
  }

  function destroySource() {
    sourceGeneration += 1;
    if (sourceTimeout !== null) clearTimeout(sourceTimeout);
    sourceTimeout = null;
    if (sourceController) sourceController.abort();
    sourceController = null;
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (transport) { transport.destroy(); transport = null; }
    playbackEngine = '';
    video.pause();
    video.removeAttribute('src');
    video.load();
    loading = false;
    buffering = false;
    playPending = false;
    sourceReady = false;
  }

  function stopSession(title, description, hasError = false) {
    invitationToken = null;
    claimNonce = null;
    closed = true;
    terminal = true;
    connected = false;
    clearPoll();
    abortRequest();
    destroySource();
    if (browserTicketRequest) browserTicketRequest.abort(); browserTicketRequest = null;
    muteButton.disabled = true;
    fullscreenButton.disabled = true;
    leaveButton.disabled = true;
    clearExternal();
    setConnection(hasError ? 'error' : 'closed', hasError ? 'تعذّر الاتصال' : 'انتهت المشاهدة');
    showOverlay(title, description);
    $('playback-status').textContent = title;
    $('sync-note').textContent = description;
    $('time-display').textContent = '— / —';
    progress.value = 0;
    $('speed-label').hidden = true;
    showNotice('');
  }

  function sameOriginMedia(value) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith('/api/watch/') && !url.username && !url.password && !url.hash;
    } catch (_) { return false; }
  }

  function timestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return NaN;
  }

  function finiteNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function normalizeSnapshot(data, roundTripMs, receivedAt) {
    if (!data || data.id !== roomId || !data.state || !sameOriginMedia(data.mediaUrl) || data.mediaRevision === undefined || !['live', 'movie', 'episode'].includes(data.kind)) throw new Error('invalid_room');
    const now = timestamp(data.serverNow);
    const updated = timestamp(data.state.updatedAt);
    if (!Number.isFinite(now) || !Number.isFinite(updated)) throw new Error('invalid_room');
    return {
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'مشاهدة مشتركة',
      kind: data.kind,
      revision: String(data.mediaRevision),
      mediaUrl: data.mediaUrl,
      mediaType: typeof data.mediaType === 'string' ? data.mediaType.toLowerCase() : '',
      videoCodec: /^(?:video\/(?:avc|hevc|av01|x-vnd\.on2\.(?:vp8|vp9)|mp4v-es|mpeg2))$/.test(data.videoCodec || '') ? data.videoCodec : '',
      audioCodec: /^(?:audio\/(?:mp4a-latm|ac3|eac3(?:-joc)?|opus|vorbis|flac|mpeg|raw))$/.test(data.audioCodec || '') ? data.audioCodec : '',
      positionMs: Math.max(0, finiteNumber(data.state.positionMs, 0)),
      durationMs: Math.max(0, finiteNumber(data.state.durationMs, 0)),
      playing: data.state.playing === true,
      speed: Math.min(6, Math.max(0.25, finiteNumber(data.state.speed, 1))),
      liveOffsetMs: finiteNumber(data.state.liveOffsetMs, -1),
      ageMs: Math.max(0, now - updated) + Math.max(0, roundTripMs) / 2,
      receivedAt,
    };
  }

  function updatePlaybackStatus() {
    if (closed || terminal || sourceBroken) return;
    let message;
    if (!connected) message = 'بانتظار عودة الاتصال بالجلسة';
    else if (!started) message = 'اضغط بدء المشاهدة للانضمام';
    else if (loading) message = 'جارٍ تحميل المحتوى';
    else if (snapshot && !snapshot.playing) message = 'أوقف صاحب الجلسة التشغيل مؤقتًا';
    else if (buffering || video.seeking) message = 'جارٍ التخزين المؤقت';
    else if (video.ended) message = 'وصل المحتوى إلى نهايته';
    else if (!video.paused && video.readyState >= 2) message = 'المشاهدة مع صاحب الجلسة';
    else message = 'بانتظار التشغيل';
    $('playback-status').textContent = message;
    $('buffering-indicator').hidden = !(started && connected && overlay.hidden && (loading || buffering || video.seeking));
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '—';
    const whole = Math.floor(seconds);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const remainder = String(whole % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
  }

  function updateTimeline() {
    if (!snapshot || closed) return;
    const isLive = snapshot.kind === 'live';
    progress.hidden = isLive;
    if (isLive) {
      $('time-display').textContent = 'بث مباشر';
      $('time-display').dir = 'rtl';
      return;
    }
    $('time-display').dir = 'ltr';
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : snapshot.durationMs / 1000;
    const position = video.readyState >= 1 && Number.isFinite(video.currentTime) ? video.currentTime : NaN;
    $('time-display').textContent = `${formatTime(position)} / ${duration > 0 ? formatTime(duration) : '—'}`;
    progress.value = duration > 0 && Number.isFinite(position) ? Math.min(100, Math.max(0, position / duration * 100)) : 0;
  }

  function handlePlayFailure(error, generation) {
    if (closed || generation !== sourceGeneration || !snapshot) return;
    if (error && error.name === 'AbortError') return;
    if (error && error.name === 'NotAllowedError') {
      started = false;
      video.pause();
      showOverlay('اضغط للانضمام إلى المشاهدة', 'يحتاج المتصفح إلى ضغطة منك للسماح بتشغيل الفيديو والصوت.', 'start');
      updatePlaybackStatus();
      return;
    }
    if (recoverNativeHls() || recoverBrowserSession(codecMessage())) return;
    sourceError(codecMessage(), true);
  }

  function synchronize() {
    if (!snapshot || closed || sourceBroken || !connected || document.hidden) return;
    if (video.readyState >= 1) {
      let target = null;
      if (snapshot.kind === 'live') {
        if (video.seekable.length > 0) {
          const last = video.seekable.length - 1;
          const end = video.seekable.end(last);
          const beginning = video.seekable.start(last);
          const delay = snapshot.liveOffsetMs >= 0 ? snapshot.liveOffsetMs / 1000 : 1;
          target = Math.max(beginning, end - Math.max(0.25, delay));
        }
      } else {
        const elapsedMs = snapshot.playing ? snapshot.ageMs + Math.max(0, performance.now() - snapshot.receivedAt) : 0;
        target = (snapshot.positionMs + elapsedMs * snapshot.speed) / 1000;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : snapshot.durationMs / 1000;
        target = Math.max(0, duration > 0 ? Math.min(target, duration) : target);
      }
      if (target !== null && Number.isFinite(target) && Math.abs(video.currentTime - target) > 1.5 && !video.seeking) {
        try { video.currentTime = target; } catch (_) { /* A media event will retry after metadata is available. */ }
      }
      try { video.playbackRate = snapshot.speed; } catch (_) { /* The browser will report unsupported playback separately. */ }
    }
    if (!started || !snapshot.playing) {
      video.pause();
    } else if (video.paused && !playPending && sourceUrl) {
      const generation = sourceGeneration;
      playPending = true;
      let result;
      try { result = video.play(); } catch (error) { playPending = false; handlePlayFailure(error, generation); return; }
      Promise.resolve(result).catch((error) => handlePlayFailure(error, generation)).finally(() => {
        if (generation === sourceGeneration) playPending = false;
        updatePlaybackStatus();
      });
    }
    updateTimeline();
    updatePlaybackStatus();
  }

  function sourceError(message, allowRetry = true, allowExternal = true) {
    if (closed || sourceBroken) return;
    sourceBroken = true;
    retrySource = allowRetry;
    destroySource();
    $('playback-status').textContent = 'تعذّر تشغيل المحتوى';
    showOverlay('تعذّر تشغيل المحتوى', message, allowRetry ? 'retry' : null, 'إعادة محاولة التشغيل');
    showNotice(message, 'error');
    muteButton.disabled = true;
    fullscreenButton.disabled = true;
    externalButton.hidden = !allowExternal || !snapshot || closed;
    externalButton.disabled = false;
  }

  function clearExternal() {
    if (externalRequest) externalRequest.abort(); externalRequest = null;
    externalMediaUrl = null;
    externalPanel.hidden = true; externalButton.hidden = true;
    externalLink.hidden = true; externalLink.removeAttribute('href');
    externalCopy.hidden = true; externalStatus.textContent = '';
    externalMode = false;
  }

  function codecMessage() {
    const codecs = snapshot ? [snapshot.videoCodec, snapshot.audioCodec].filter(Boolean).join(' • ') : '';
    return 'تعذّر فك ترميز هذا المحتوى في المتصفح. يمكنك فتحه عبر VLC الذي يدعم صيغًا إضافية.' + (codecs ? ' الترميز: ' + codecs : '');
  }

  function recoverNativeHls() {
    if (playbackEngine !== 'hls-native' || !snapshot || hlsRecoveryRevision === snapshot.revision || !window.Hls?.isSupported()) return false;
    hlsRecoveryRevision = snapshot.revision;
    configureSource(snapshot, true).catch(() => { if (!closed) sourceError(codecMessage()); });
    return true;
  }

  async function privateMedia(controller) {
    const response = await fetch('/api/watch/rooms/' + roomId + '/external', {method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {'Content-Type': 'application/json'}, body: '{}', signal: controller.signal});
    if ([401, 403, 410].includes(response.status)) {
      stopSession('انتهت جلسة المشاهدة', 'انتهت صلاحية الجلسة أو لم يعد رابط الدعوة صالحًا.');
      throw new Error('session_ended');
    }
    if (!response.ok) throw new Error('external_unavailable');
    const data = await response.json();
    const url = new URL(data.mediaUrl, window.location.origin);
    if (!sameOriginMedia(url.href) || url.pathname !== '/api/watch/rooms/' + roomId + '/media' || !url.searchParams.get('e') || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw new Error('invalid_external_media');
    return url.href;
  }

  function recoverBrowserSession(message) {
    if (closed || externalMode || !snapshot || !roomId || browserTicketRequest) return false;
    const key = snapshot.revision + '\n' + snapshot.mediaUrl;
    if (browserTicketAttempt === key) return false;
    browserTicketAttempt = key;
    const generation = sourceGeneration;
    const controller = new AbortController(); browserTicketRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    // Some embedded WebKit players omit the guest cookie on native video
    // requests while fetch/claim/sync work. One room-scoped capability retry
    // avoids depending on that separate media cookie jar, without exposing the
    // upstream URL or retrying forever when the real issue is the codec.
    sourceBroken = true;
    showOverlay('جارٍ تحسين توافق المشاهدة', 'نحاول مسار تشغيل خاصًا بهذه الجلسة.');
    $('playback-status').textContent = 'جارٍ إعادة تجهيز التشغيل';
    privateMedia(controller).then(url => {
      if (closed || generation !== sourceGeneration || !snapshot || key !== snapshot.revision + '\n' + snapshot.mediaUrl) return;
      browserTicket = {key, url}; clearExternal();
      return configureSource(snapshot);
    }).catch(() => {
      if (!closed && generation === sourceGeneration) { sourceBroken = false; sourceError(message); }
    }).finally(() => {
      clearTimeout(timeout); if (browserTicketRequest === controller) browserTicketRequest = null;
    });
    return true;
  }

  function isHlsType(type) {
    return type === 'hls' || /mpegurl/.test(type);
  }

  function isNativeType(type) {
    return /^(video|audio)\//.test(type) && !/mp2t/.test(type) || /^(mp4|webm|m4v|mov)$/.test(type);
  }

  async function configureSource(room, forceHlsMse = false) {
    if (currentRevision !== room.revision || originalSourceUrl !== room.mediaUrl) {
      clearExternal(); hlsRecoveryRevision = null; browserTicket = null; browserTicketAttempt = null;
      if (browserTicketRequest) browserTicketRequest.abort(); browserTicketRequest = null;
    }
    destroySource();
    const generation = sourceGeneration;
    currentRevision = room.revision;
    originalSourceUrl = room.mediaUrl;
    const ticketKey = room.revision + '\n' + room.mediaUrl;
    sourceUrl = browserTicket?.key === ticketKey ? browserTicket.url : room.mediaUrl;
    sourceBroken = false;
    retrySource = false;
    loading = true;
    buffering = false;
    muteButton.disabled = true;
    fullscreenButton.disabled = true;
    externalButton.hidden = true;
    showNotice('');
    if (started) overlay.hidden = true;
    else showOverlay('جارٍ تجهيز المحتوى', 'لحظات ويصبح المحتوى جاهزًا للمشاهدة.');
    updatePlaybackStatus();
    let mediaType = detectedRevision === room.revision ? detectedType : room.mediaType;
    if (detectedRevision !== room.revision) {
      const controller = new AbortController();
      sourceController = controller;
      sourceTimeout = setTimeout(() => controller.abort(), 12000);
      try {
        // Providers can advertise MP4 while returning TS, FLV or Matroska. The
        // proxy sniffs a small range; cancel immediately instead of downloading
        // a film merely to discover its container.
        const response = await fetch(sourceUrl, {method: 'GET', headers: {Range: 'bytes=0-4095'}, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal});
        if (closed || generation !== sourceGeneration) { await response.body?.cancel(); return; }
        if (response.status === 410 || response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          stopSession('انتهت جلسة المشاهدة', 'أغلق صاحب الدعوة الجلسة أو انتهت صلاحيتها.');
          return;
        }
        if (!response.ok) {
          const code = window.WatchMedia?.errorCode ? await window.WatchMedia.errorCode(response) : '';
          if (closed || generation !== sourceGeneration) return;
          if (['SOURCE_HOST','SOURCE_URL','SOURCE'].includes(code)) {
            sourceError('تعذّر الوصول إلى خادم البث بعد تحويل المصدر. أرسل رمز الدعم لصاحب الاشتراك: ' + code + '.', true, false);
            return;
          }
          if (code === 'MEDIA') { sourceError('تعذّر الوصول إلى فيديو المزود. قد تكون وصلة المصدر أو الاتصالات الإضافية غير متاحة. رمز الدعم: MEDIA.', true, false); return; }
          throw new Error('source_unavailable');
        }
        await response.body?.cancel();
        const actual = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (actual && actual !== 'application/octet-stream') mediaType = actual;
        detectedRevision = room.revision; detectedType = mediaType;
      } catch (error) {
        if (closed || generation !== sourceGeneration) return;
        sourceError('تعذّر الوصول إلى مصدر المشاهدة. يمكنك إعادة المحاولة أو انتظار تغيير المحتوى من صاحب الجلسة.');
        return;
      } finally {
        if (generation === sourceGeneration) {
          if (sourceTimeout !== null) clearTimeout(sourceTimeout);
          sourceTimeout = null;
          sourceController = null;
        }
      }
    }
    if (closed || generation !== sourceGeneration) return;
    if (isHlsType(mediaType)) {
      if (!forceHlsMse && video.canPlayType('application/vnd.apple.mpegurl')) {
        playbackEngine = 'hls-native';
        video.src = sourceUrl;
        video.load();
      } else if (window.Hls && window.Hls.isSupported()) {
        const instance = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 2,
          xhrSetup(xhr, url) {
            if (!sameOriginMedia(url)) throw new Error('invalid_media_origin');
            xhr.withCredentials = true;
          },
          fetchSetup(context, init) {
            if (!sameOriginMedia(context.url)) throw new Error('invalid_media_origin');
            return new Request(context.url, {...init, credentials: 'same-origin', redirect: 'error'});
          },
        });
        hls = instance;
        playbackEngine = 'hls-mse';
        instance.on(window.Hls.Events.MEDIA_ATTACHED, () => {
          if (!closed && generation === sourceGeneration) instance.loadSource(sourceUrl);
        });
        instance.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (!closed && generation === sourceGeneration) synchronize();
        });
        instance.on(window.Hls.Events.ERROR, (_event, data) => {
          if (closed || generation !== sourceGeneration || !data.fatal) return;
          const message = data.type === window.Hls.ErrorTypes.MEDIA_ERROR ? codecMessage() : 'تعذّر تحميل البث من المصدر. يمكنك إعادة المحاولة أو انتظار تغيير المحتوى من صاحب الجلسة.';
          if (!recoverBrowserSession(message)) sourceError(message);
        });
        instance.attachMedia(video);
      } else {
        sourceError('هذا المتصفح لا يدعم تشغيل هذا البث. افتح رابط الدعوة في متصفح حديث يدعم الفيديو.', false);
        return;
      }
    } else if (window.WatchMedia?.transportType(mediaType) && window.mpegts?.isSupported()) {
      const mse = window.mpegts;
      mse.LoggingControl.enableAll = false;
      transport = mse.createPlayer({type: window.WatchMedia.transportType(mediaType), url: sourceUrl,
        isLive: room.kind === 'live', duration: room.durationMs > 0 ? room.durationMs : undefined,
        cors: false, withCredentials: true, referrerPolicy: 'no-referrer'}, {
        enableWorker: false, customLoader: window.WatchMedia.createLoader(mse, sameOriginMedia),
        enableStashBuffer: true, stashInitialSize: 128 * 1024, lazyLoadMaxDuration: 30,
        lazyLoadRecoverDuration: 10, autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 30, autoCleanupMinBackwardDuration: 10,
        accurateSeek: true, seekType: 'range', reuseRedirectedURL: false,
      });
      playbackEngine = 'transport-mse';
      transport.on(mse.Events.ERROR, (_type, _detail, info) => {
        if (closed || generation !== sourceGeneration) return;
        if (info && [401, 403, 410].includes(info.code)) stopSession('انتهت جلسة المشاهدة', 'أغلق صاحب الدعوة الجلسة أو انتهت صلاحيتها.');
        else sourceError(codecMessage());
      });
      transport.on(mse.Events.MEDIA_INFO, () => { if (!closed && generation === sourceGeneration) synchronize(); });
      transport.attachMediaElement(video); transport.load();
    } else if (isNativeType(mediaType)) {
      const actualType = /\//.test(mediaType) ? mediaType : `video/${mediaType === 'm4v' ? 'mp4' : mediaType}`;
      if (!video.canPlayType(actualType)) {
        sourceError(codecMessage(), false);
        return;
      }
      video.src = sourceUrl;
      playbackEngine = 'native';
      video.load();
    } else {
      sourceError(codecMessage(), false);
      return;
    }
    sourceReady = true;
    muteButton.disabled = false;
    fullscreenButton.disabled = false;
    if (!started) showOverlay('أهلًا بك في المشاهدة', 'اضغط للبدء. سيبقى التشغيل متزامنًا مع صاحب الجلسة.', 'start');
    synchronize();
  }

  function loadSource(room) {
    const task = configureSource(room);
    const generation = sourceGeneration;
    task.catch(() => {
      if (!closed && generation === sourceGeneration) sourceError('تعذّر إعداد مشغل الفيديو في هذا المتصفح. يمكنك إعادة المحاولة.');
    });
  }

  function applySnapshot(data, roundTripMs, receivedAt) {
    const next = normalizeSnapshot(data, roundTripMs, receivedAt);
    snapshot = next;
    connected = true;
    setConnection('connected', 'متصل بالجلسة');
    roomTitle.textContent = next.title;
    document.title = `${next.title} | ابوناصر TV`;
    const kindBadge = $('content-kind');
    kindBadge.hidden = false;
    kindBadge.dataset.kind = next.kind;
    kindBadge.textContent = next.kind === 'live' ? '● مباشر' : next.kind === 'episode' ? 'حلقة' : 'فيلم';
    $('speed-label').textContent = `${Number(next.speed.toFixed(2))}×`;
    $('speed-label').hidden = next.kind === 'live';
    if (!sourceBroken) showNotice('');
    if (currentRevision !== next.revision || originalSourceUrl !== next.mediaUrl) loadSource(next);
    else synchronize();
    updateTimeline();
    updatePlaybackStatus();
  }

  function handleApiStatus(status) {
    if (status === 409) {
      stopSession('رابط الدعوة مستخدم بالفعل', 'تم فتح هذه الدعوة في متصفح آخر. هذا الرابط مخصص لمشاهد واحد.', true);
      return true;
    }
    if (status === 410 || status === 404) {
      stopSession('انتهت جلسة المشاهدة', 'أغلق صاحب الدعوة الجلسة أو انتهت صلاحيتها. اطلب دعوة جديدة للانضمام.');
      return true;
    }
    if (status === 401 || status === 403) {
      stopSession('تعذّر التحقق من الدعوة', 'افتح رابط الدعوة الأصلي من صاحب الجلسة. قد تكون صلاحية الدعوة انتهت.', true);
      return true;
    }
    if (status === 400) {
      stopSession('رابط الدعوة غير صالح', 'افتح رابط الدعوة كاملًا كما أرسله صاحب الجلسة.', true);
      return true;
    }
    return false;
  }

  async function requestSnapshot() {
    if (closed || requestController) return;
    const controller = new AbortController();
    requestController = controller;
    requestTimeout = setTimeout(() => controller.abort(), 15000);
    const sentAt = performance.now();
    try {
      const options = {credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal};
      let endpoint = `/api/watch/rooms/${roomId}/sync`;
      if (invitationToken !== null) {
        if (claimNonce === null) claimNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
        endpoint = `/api/watch/rooms/${roomId}/claim`;
        options.method = 'POST';
        options.headers = {'Content-Type': 'application/json'};
        options.body = JSON.stringify({token: invitationToken, nonce: claimNonce});
      }
      const response = await fetch(endpoint, options);
      if (closed) return;
      if (!response.ok) {
        if (handleApiStatus(response.status)) return;
        throw new Error('connection_unavailable');
      }
      const data = await response.json();
      const receivedAt = performance.now();
      if (closed) return;
      applySnapshot(data, receivedAt - sentAt, receivedAt);
      invitationToken = null;
      claimNonce = null;
      try { sessionStorage.setItem(storageKey, roomId); } catch (_) { /* Cookie authentication works without storage. */ }
    } catch (error) {
      if (closed || controller.signal.aborted && document.hidden && snapshot) return;
      if (error && error.message === 'invalid_room') {
        stopSession('تعذّر قراءة جلسة المشاهدة', 'بيانات الجلسة غير مكتملة. اطلب من صاحب الدعوة إنشاء جلسة جديدة.', true);
        return;
      }
      connected = false;
      video.pause();
      setConnection('error', 'الاتصال منقطع');
      if (!snapshot) {
        showOverlay('تعذّر الاتصال بالجلسة', 'تحقق من اتصالك ثم أعد المحاولة للانضمام إلى الجلسة.', 'retry-connection', 'إعادة المحاولة');
        $('playback-status').textContent = 'تعذّر الاتصال بالجلسة';
        return;
      }
      showNotice('انقطع الاتصال بالجلسة. توقف التشغيل مؤقتًا وسنحاول الاتصال مجددًا.');
      updatePlaybackStatus();
    } finally {
      if (requestController === controller) {
        if (requestTimeout !== null) clearTimeout(requestTimeout);
        requestTimeout = null;
        requestController = null;
      }
      schedulePoll();
    }
  }

  function schedulePoll() {
    clearPoll();
    if (!closed && !document.hidden && snapshot) pollTimer = setTimeout(() => {
      pollTimer = null;
      requestSnapshot();
    }, 2000);
  }

  startButton.addEventListener('click', () => {
    if (!closed && overlayAction === 'retry-connection') {
      showOverlay('جارٍ الاتصال بالجلسة', 'اضغط بدء المشاهدة بعد الاتصال للانضمام إلى الجلسة.');
      setConnection('connecting', 'جارٍ الاتصال');
      requestSnapshot();
      return;
    }
    if (closed || !snapshot || !connected || (!sourceReady && overlayAction !== 'retry') || !overlayAction) return;
    const action = overlayAction;
    started = true;
    overlay.hidden = true;
    if (action === 'retry' && retrySource) loadSource(snapshot);
    else synchronize();
  });

  muteButton.addEventListener('click', () => {
    video.muted = !video.muted;
  });

  externalButton.addEventListener('click', async () => {
    if (closed || !snapshot || !roomId || externalRequest) return;
    const revision = snapshot.revision;
    const controller = new AbortController(); externalRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    externalButton.disabled = true; externalPanel.hidden = false;
    externalStatus.textContent = 'جارٍ تجهيز رابط خاص للمشغّل الخارجي…';
    externalLink.hidden = true; externalCopy.hidden = true; externalMediaUrl = null;
    const agent = window.navigator?.userAgent || '';
    externalInstall.href = /iPhone|iPad|iPod/i.test(agent) ? 'https://apps.apple.com/app/vlc-media-player/id650377962'
      : /Android/i.test(agent) ? 'https://play.google.com/store/apps/details?id=org.videolan.vlc' : 'https://www.videolan.org/vlc/';
    try {
      const mediaUrl = await privateMedia(controller);
      if (closed || snapshot?.revision !== revision) return;
      const url = new URL(mediaUrl);
      const launch = window.WatchMedia.externalLaunchUrl(url.href, agent);
      externalMediaUrl = url.href; externalLink.href = launch; externalMode = true;
      externalLink.hidden = false; externalCopy.hidden = false;
      externalStatus.textContent = 'الرابط جاهز. اضغط «فتح VLC»؛ إذا لم يفتح، ثبّت التطبيق أو انسخ الرابط وافتحه فيه. ينتهي الرابط مع الجلسة وقد تحتاج إلى تجهيزه من جديد.';
    } catch (_) {
      if (!closed && snapshot?.revision === revision) externalStatus.textContent = 'تعذّر تجهيز رابط المشغّل الخارجي. تحقق من الاتصال واضغط الزر لإعادة المحاولة.';
    } finally {
      clearTimeout(timeout); if (externalRequest === controller) externalRequest = null;
      if (!closed) externalButton.disabled = false;
    }
  });

  externalCopy.addEventListener('click', async () => {
    if (!externalMediaUrl || closed) return;
    try {
      if (window.navigator?.clipboard?.writeText) await window.navigator.clipboard.writeText(externalMediaUrl);
      else {
        const field = document.createElement('textarea'); field.value = externalMediaUrl; field.setAttribute('readonly', '');
        field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select();
        const copied = document.execCommand('copy'); field.remove(); if (!copied) throw new Error('clipboard_unavailable');
      }
      externalStatus.textContent = 'نُسخ رابط خاص مؤقت. افتحه في VLC ولا ترسله لأحد.';
    } catch (_) { externalStatus.textContent = 'لم يسمح المتصفح بالنسخ. استخدم زر «فتح VLC».'; }
  });
  video.addEventListener('volumechange', () => {
    muteButton.setAttribute('aria-pressed', String(video.muted));
    $('mute-label').textContent = video.muted ? 'تشغيل الصوت' : 'كتم الصوت';
  });

  fullscreenButton.addEventListener('click', async () => {
    if (closed) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if ($('video-stage').requestFullscreen) await $('video-stage').requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else showNotice('ملء الشاشة غير متاح في هذا المتصفح.');
    } catch (_) { showNotice('تعذّر فتح ملء الشاشة في هذا المتصفح.'); }
  });

  leaveButton.addEventListener('click', () => {
    left = true;
    try { if (sessionStorage.getItem(storageKey) === roomId) sessionStorage.removeItem(storageKey); } catch (_) { /* Nothing secret is retained. */ }
    stopSession('غادرت جلسة المشاهدة', 'توقّف التشغيل على هذا الجهاز. يمكنك الانضمام مجددًا بفتح رابط الدعوة الأصلي.');
    setConnection('closed', 'غادرت الجلسة');
  });

  ['loadedmetadata', 'canplay', 'durationchange'].forEach((event) => video.addEventListener(event, () => {
    if (closed || sourceBroken || !sourceUrl) return;
    if (event === 'canplay') { loading = false; buffering = false; }
    synchronize();
  }));
  video.addEventListener('playing', () => { loading = false; buffering = false; updatePlaybackStatus(); });
  video.addEventListener('waiting', () => { buffering = true; updatePlaybackStatus(); });
  video.addEventListener('stalled', () => { buffering = true; updatePlaybackStatus(); });
  video.addEventListener('seeking', updatePlaybackStatus);
  video.addEventListener('seeked', () => { buffering = false; updateTimeline(); updatePlaybackStatus(); });
  video.addEventListener('pause', updatePlaybackStatus);
  video.addEventListener('ended', updatePlaybackStatus);
  video.addEventListener('timeupdate', updateTimeline);
  video.addEventListener('progress', () => {
    if (snapshot && snapshot.kind === 'live' && !closed && !sourceBroken) synchronize();
  });
  video.addEventListener('error', () => {
    if (closed || sourceBroken || !sourceUrl || !video.error) return;
    if (video.error.code === 1) return;
    const codecError = video.error.code === 3 || video.error.code === 4;
    if (codecError && recoverNativeHls()) return;
    const message = codecError ? codecMessage() : 'تعذّر تحميل الفيديو من المصدر. تحقق من الاتصال أو أعد المحاولة.';
    if (!recoverBrowserSession(message)) sourceError(message);
  });

  document.addEventListener('visibilitychange', () => {
    if (closed) return;
    if (document.hidden) {
      clearPoll();
      if (snapshot) abortRequest();
      video.pause();
    } else if (snapshot) {
      requestSnapshot();
    }
  });

  window.addEventListener('pagehide', () => {
    if (closed) return;
    closed = true;
    connected = false;
    clearPoll();
    abortRequest();
    destroySource();
    if (browserTicketRequest) browserTicketRequest.abort(); browserTicketRequest = null;
    clearExternal();
    currentRevision = null;
    sourceUrl = null;
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || left || terminal || !roomId) return;
    closed = false;
    started = false;
    showOverlay('جارٍ استعادة الجلسة', 'اضغط بدء المشاهدة بعد الاتصال للانضمام مجددًا.');
    setConnection('connecting', 'جارٍ الاتصال');
    requestSnapshot();
  });

  async function initialize() {
    if (!roomId || invitedId && (!validId(invitedId) || !validToken(invitationToken))) {
      invitationToken = null;
      stopSession('رابط الدعوة غير مكتمل', 'افتح رابط الدعوة كاملًا كما أرسله صاحب الجلسة.', true);
      return;
    }
    if (!invitedId) invitationToken = null;
    await requestSnapshot();
  }

  initialize();
})();
