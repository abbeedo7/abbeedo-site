// Match the native app's moving grid and short RGB logo tearing without
// snapshots, navigation delays, or a perpetual JavaScript animation loop.
const controllers = new WeakMap();
const BURST_MS = 300;
const REPEAT_MS = 10000;
const INITIAL_MS = 180;
const QUIET_MS = 320;
const inert = Object.freeze({refresh() {}, trigger() {return false;}, destroy() {}});

export function visualPolicy({background = 'standard', reducedMotion = false, systemReducedMotion = false, hidden = false, playback = false} = {}) {
  const speed = background === 'fast' ? 'fast' : 'standard';
  const state = hidden ? 'hidden' : playback ? 'playback' : reducedMotion || systemReducedMotion ? 'reduced' : background === 'off' ? 'off' : 'running';
  return {state, speed, gridPeriod: speed === 'fast' ? 1900 : 3200,
    backgroundRunning: state === 'running', automaticGlitchEnabled: state === 'running', glitchEnabled: !['hidden', 'playback', 'reduced'].includes(state)};
}

export function startVisualEffects(scope = globalThis) {
  const doc = scope?.document;
  if (!doc?.body || !doc.documentElement || !doc.createElement || !scope.requestAnimationFrame) return inert;
  const previous = controllers.get(doc);
  if (previous) return previous;

  const root = doc.documentElement;
  const background = doc.createElement('div');
  background.id = 'visual-backdrop';
  background.setAttribute('aria-hidden', 'true');
  for (const name of ['motion-glow', 'motion-grid motion-grid-x', 'motion-grid motion-grid-y']) {
    const layer = doc.createElement('div');
    layer.className = name;
    background.append(layer);
  }
  const canvas = doc.createElement('canvas');
  canvas.id = 'visual-glitch';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  doc.body.prepend(background);
  doc.body.append(canvas);
  doc.body.classList.add('visual-effects-ready');
  let context = null;
  try { context = canvas.getContext?.('2d'); } catch {} // Decorative canvas may be unavailable in privacy modes.
  const player = doc.getElementById('player-page');
  let preference;
  try { preference = scope.matchMedia?.('(prefers-reduced-motion: reduce)'); } catch {}
  let systemReducedMotion = !!preference?.matches;
  let suspended = false, closed = false, frame = 0, burst = null, lastBurst = -Infinity, logo = null;
  let destroyedImage = false, automaticTimer = 0, initialShown = false, pendingTarget = null, lastInteraction = -Infinity;
  const now = () => scope.performance?.now?.() ?? Date.now();
  const policy = () => visualPolicy({background: doc.body.dataset.background || 'standard',
    reducedMotion: doc.body.dataset.reducedMotion === 'true', systemReducedMotion,
    hidden: suspended || !!doc.hidden, playback: !!player && !player.hidden});

  function clearBurst() {
    if (frame) scope.cancelAnimationFrame(frame);
    frame = 0;
    if (burst?.motion) burst.motion.cancel();
    burst = null;
    canvas.hidden = true;
    root.dataset.glitchActive = 'false';
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function refresh() {
    if (closed) return;
    const value = policy();
    background.dataset.state = value.state;
    background.dataset.speed = value.speed;
    root.dataset.visualMotion = value.state;
    if (!value.glitchEnabled || doc.querySelector('dialog[open]')) clearBurst();
    if (!value.automaticGlitchEnabled || doc.querySelector('dialog[open]')) cancelAutomatic();
    else scheduleAutomatic();
  }

  function cancelAutomatic() {
    if (automaticTimer) scope.clearTimeout(automaticTimer);
    automaticTimer = 0;
  }

  function visibleBrand(target = doc.body) {
    const candidates = target?.matches?.('.brand-logo') ? [target] : [...(target?.querySelectorAll?.('.brand-logo') || [])];
    const width = scope.innerWidth || root.clientWidth, height = scope.innerHeight || root.clientHeight;
    return candidates.filter(image => {
      if (image.closest?.('[hidden]') || image.getClientRects?.().length === 0) return false;
      const rect = image.getBoundingClientRect(), style = scope.getComputedStyle?.(image);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height && style?.visibility !== 'hidden' && style?.display !== 'none';
    }).sort((left, right) => {
      const area = image => {const r = image.getBoundingClientRect();return Math.max(0, Math.min(width, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(height, r.bottom) - Math.max(0, r.top));};
      return area(right) - area(left);
    })[0] || null;
  }

  function scheduleAutomatic() {
    if (closed || automaticTimer || !logo || !context || !policy().automaticGlitchEnabled || doc.querySelector('dialog[open]')) return;
    automaticTimer = scope.setTimeout(() => {
      automaticTimer = 0;initialShown = true;refresh();
      if (closed || !policy().automaticGlitchEnabled || doc.querySelector('dialog[open]')) return;
      const target = visibleBrand();
      if (target && now() - lastInteraction >= 1500 && !doc.activeElement?.matches?.('input,textarea,[contenteditable="true"]')) trigger(target);
      initialShown = true;
      scheduleAutomatic();
    }, initialShown ? REPEAT_MS : INITIAL_MS);
  }

  function texture(image, color) {
    const result = doc.createElement('canvas');
    const ratio = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    result.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    result.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    let paint;
    try { paint = result.getContext('2d'); } catch { return image; }
    if (!paint) return image;
    paint.drawImage(image, 0, 0, result.width, result.height);
    if (color) {
      paint.globalCompositeOperation = 'source-in';
      paint.fillStyle = color;
      paint.fillRect(0, 0, result.width, result.height);
    }
    return result;
  }

  // The same transparent logo texture is reused for all bursts. It is never
  // reconstructed from page screenshots or copied from the video element.
  if (scope.Image) {
    const image = new scope.Image();
    image.onload = () => {
      if (destroyedImage || closed || !image.naturalWidth) return;
      logo = {white: texture(image), red: texture(image, '#ff164d'), cyan: texture(image, '#00edda')};
      root.dataset.glitchReady = 'true';
      // A burst requested during image loading must not disappear silently.
      const target = pendingTarget;pendingTarget = null;
      if (target && policy().glitchEnabled && !doc.querySelector('dialog[open]')) trigger(visibleBrand(target) || visibleBrand() || target);
      refresh();
    };
    image.onerror = () => {root.dataset.glitchReady = 'error';};
    image.src = new URL('brand.png', doc.baseURI).href;
  }

  function targetBounds(target) {
    const rectangle = target?.getBoundingClientRect?.();
    const width = Math.max(1, scope.innerWidth || root.clientWidth);
    const height = Math.max(1, scope.innerHeight || root.clientHeight);
    if (!rectangle || rectangle.width < 1 || rectangle.height < 1) return {left: 0, top: 0, width, height};
    const left = Math.max(0, rectangle.left), top = Math.max(0, rectangle.top);
    return {left, top, width: Math.max(0, Math.min(width, rectangle.right) - left), height: Math.max(0, Math.min(height, rectangle.bottom) - top)};
  }

  function logoBounds(target, bounds) {
    const candidate = visibleBrand(target);
    if (candidate) return candidate.getBoundingClientRect();
    // Small controls get the native-like panel motion; an extra logo must not
    // obscure a label or appear outside their small hit target.
    if (bounds.width < 150 || bounds.height < 90) return null;
    const size = Math.min(112, bounds.width * .55, bounds.height * .55);
    return {left: bounds.left + (bounds.width - size) / 2, top: bounds.top + (bounds.height - size) / 2, width: size, height: size};
  }

  function drawBurst() {
    frame = 0;
    if (closed || !burst || !policy().glitchEnabled) return clearBurst();
    const elapsed = Math.max(0, now() - burst.began);
    if (elapsed >= BURST_MS) return clearBurst();
    const width = Math.max(1, scope.innerWidth || root.clientWidth), height = Math.max(1, scope.innerHeight || root.clientHeight);
    const scale = Math.min(scope.devicePixelRatio || 1, 1.5, Math.sqrt(2000000 / (width * height)));
    if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    if (context) {
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const bounds = targetBounds(burst.target), rectangle = logoBounds(burst.target, bounds);
      if (logo && rectangle && bounds.width && bounds.height) {
        const strength = Math.sin(Math.PI * elapsed / BURST_MS), fringe = Math.max(1.5, rectangle.width * .04) * strength;
        const tick = Math.floor(elapsed / 34);
        for (let slice = 0; slice < 11; slice++) {
          const seed = (tick * 17 + slice * 13) & 31;
          const displacement = ((seed % 9) - 4) * rectangle.width * .016 * strength;
          const top = rectangle.top + rectangle.height * slice / 11;
          context.save();
          context.beginPath();
          context.rect(Math.max(bounds.left, rectangle.left - fringe * 4), Math.max(bounds.top, top), Math.min(bounds.width, rectangle.width + fringe * 8), Math.min(rectangle.height / 11 + .5, bounds.top + bounds.height - top));
          context.clip();
          for (const [textureName, offset, alpha] of [['red', fringe, .66], ['cyan', -fringe, .68], ['white', 0, .5]]) {
            context.globalAlpha = alpha * strength;
            context.drawImage(logo[textureName], rectangle.left + displacement + offset, rectangle.top, rectangle.width, rectangle.height);
          }
          context.restore();
        }
      }
    }
    frame = scope.requestAnimationFrame(drawBurst);
  }

  function trigger(target = doc.getElementById('app-shell')) {
    if (closed || !policy().glitchEnabled || !target || target.closest?.('[hidden]') || doc.querySelector('dialog[open]')) return false;
    const brand = visibleBrand(target) || visibleBrand();
    if (!brand) return false;
    target = brand;
    if (!logo || !context) {pendingTarget = target;return false;}
    const time = now();
    if (burst) {
      // Navigation can promote a small click burst to the arriving page without
      // extending its duration or scheduling a second animation loop.
      const old = targetBounds(burst.target), next = targetBounds(target);
      if (next.width * next.height > old.width * old.height) burst.target = target;
      return true;
    }
    if (time - lastBurst < BURST_MS + QUIET_MS) return false;
    lastBurst = time;
    burst = {target, began: time, motion: null};
    const motionTarget = visibleBrand(target) || visibleBrand();
    if (motionTarget?.animate) {
      try { burst.motion = motionTarget.animate([
        {translate: '0 0'},
        {translate: '3px 0', offset: .22},
        {translate: '-3px 1px', offset: .48},
        {translate: '1px 0', offset: .76},
        {translate: '0 0'},
      ], {duration: BURST_MS, easing: 'steps(1, end)'}); } catch {}
    }
    root.dataset.glitchActive = 'true';
    root.dataset.glitchCount = String((Number(root.dataset.glitchCount) || 0) + 1);
    canvas.hidden = false;
    frame = scope.requestAnimationFrame(drawBurst);
    return true;
  }

  const onActivity = () => {lastInteraction = now();};
  const updateViewport = () => {
    const viewport = scope.visualViewport;
    background.style.width = Math.ceil(Math.max(scope.innerWidth || root.clientWidth || 1, viewport?.width || 0)) + 'px';
    background.style.height = Math.ceil(Math.max(scope.innerHeight || root.clientHeight || 1, (viewport?.height || 0) + (viewport?.offsetTop || 0))) + 'px';
    clearBurst();refresh();
  };
  const onPointer = event => {
    onActivity();
    const target = event.target?.closest?.('button, a.download-primary, a.download-secondary');
    if (target && !target.disabled && target.getAttribute('aria-disabled') !== 'true') trigger(target);
  };
  const onHide = event => { suspended = true; refresh(); if (!event.persisted) controller.destroy(); };
  const onShow = () => { suspended = false; refresh(); };
  const observer = scope.MutationObserver ? new scope.MutationObserver(refresh) : null;
  const dialogs = scope.MutationObserver ? new scope.MutationObserver(records => {if (records.some(record => record.type === 'attributes' || record.target === doc.body)) refresh();}) : null;
  dialogs?.observe(doc.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open']});
  observer?.observe(doc.body, {attributes: true, attributeFilter: ['data-background', 'data-reduced-motion']});
  if (player) observer?.observe(player, {attributes: true, attributeFilter: ['hidden']});
  doc.addEventListener('visibilitychange', refresh);
  doc.addEventListener('close', refresh, true);
  doc.addEventListener('toggle', refresh, true);
  doc.addEventListener('pointerdown', onPointer, {passive: true});
  doc.addEventListener('keydown', onActivity, {passive: true});
  scope.addEventListener('pagehide', onHide);
  scope.addEventListener('resize', updateViewport, {passive: true});
  scope.addEventListener('focus', refresh);
  scope.visualViewport?.addEventListener?.('resize', updateViewport, {passive: true});
  scope.visualViewport?.addEventListener?.('scroll', updateViewport, {passive: true});
  scope.addEventListener('pageshow', onShow);
  const onPreferenceChange = event => {systemReducedMotion = typeof event?.matches === 'boolean' ? event.matches : !!preference?.matches;refresh();};
  if (preference) preference.onchange = onPreferenceChange;
  if (preference?.addEventListener) preference.addEventListener('change', onPreferenceChange);
  else preference?.addListener?.(onPreferenceChange);

  const controller = {
    refresh, trigger,
    destroy() {
      if (closed) return;
      closed = true; destroyedImage = true;
      clearBurst(); cancelAutomatic(); pendingTarget = null;
      observer?.disconnect();dialogs?.disconnect();
      doc.removeEventListener('visibilitychange', refresh);
      doc.removeEventListener('close', refresh, true);
      doc.removeEventListener('toggle', refresh, true);
      doc.removeEventListener('pointerdown', onPointer);
      doc.removeEventListener('keydown', onActivity);
      scope.removeEventListener('pagehide', onHide);
      scope.removeEventListener('resize', updateViewport);
      scope.removeEventListener('focus', refresh);
      scope.visualViewport?.removeEventListener?.('resize', updateViewport);
      scope.visualViewport?.removeEventListener?.('scroll', updateViewport);
      scope.removeEventListener('pageshow', onShow);
      if (preference?.removeEventListener) preference.removeEventListener('change', onPreferenceChange);
      else preference?.removeListener?.(onPreferenceChange);
      if (preference?.onchange === onPreferenceChange) preference.onchange = null;
      background.remove(); canvas.remove();
      doc.body.classList.remove('visual-effects-ready');
      root.dataset.visualMotion = 'destroyed';
      controllers.delete(doc);
      logo = null;
    },
  };
  controllers.set(doc, controller);
  root.dataset.visualEffects = 'ready';
  root.dataset.glitchActive = 'false';
  root.dataset.glitchReady = 'false';
  updateViewport();
  return controller;
}

export function triggerGlitch(target) {
  try { return startVisualEffects().trigger(target); } catch { return false; }
}
