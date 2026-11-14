// Match the native app's moving grid and short RGB logo tearing without
// snapshots, navigation delays, or a perpetual JavaScript animation loop.
const controllers = new WeakMap();
const BURST_MS = 220;
const QUIET_MS = 320;
const inert = Object.freeze({refresh() {}, trigger() {return false;}, destroy() {}});

export function visualPolicy({background = 'standard', reducedMotion = false, systemReducedMotion = false, hidden = false, playback = false} = {}) {
  const speed = background === 'fast' ? 'fast' : 'standard';
  const state = hidden ? 'hidden' : playback ? 'playback' : reducedMotion || systemReducedMotion ? 'reduced' : background === 'off' ? 'off' : 'running';
  return {state, speed, gridPeriod: speed === 'fast' ? 1900 : 3200,
    backgroundRunning: state === 'running', glitchEnabled: !['hidden', 'playback', 'reduced'].includes(state)};
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
  let suspended = false, closed = false, frame = 0, burst = null, lastBurst = -Infinity, logo = null;
  let destroyedImage = false;
  const now = () => scope.performance?.now?.() ?? Date.now();
  const policy = () => visualPolicy({background: doc.body.dataset.background || 'standard',
    reducedMotion: doc.body.dataset.reducedMotion === 'true', systemReducedMotion: !!preference?.matches,
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
    if (!value.glitchEnabled) clearBurst();
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
    };
    image.onerror = () => {};
    image.src = new URL('/brand.png', doc.baseURI).href;
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
    const candidate = target?.matches?.('.brand-logo') ? target : [...(target?.querySelectorAll?.('.brand-logo') || [])].find(image => !image.closest('[hidden]') && image.getClientRects().length);
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
        const strength = Math.sin(Math.PI * elapsed / BURST_MS), fringe = Math.max(1, rectangle.width * .025) * strength;
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
    if (closed || !policy().glitchEnabled || !target || target.closest?.('[hidden]')) return false;
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
    if (target.animate) {
      try { burst.motion = target.animate([
        {translate: '0 0', filter: 'none'},
        {translate: '3px 0', filter: 'drop-shadow(2px 0 #ff164d88) drop-shadow(-2px 0 #00edda88)', offset: .22},
        {translate: '-3px 1px', filter: 'drop-shadow(-1px 0 #ff164d66) drop-shadow(1px 0 #00edda66)', offset: .48},
        {translate: '1px 0', filter: 'none', offset: .76},
        {translate: '0 0', filter: 'none'},
      ], {duration: BURST_MS, easing: 'steps(1, end)'}); } catch {}
    }
    root.dataset.glitchActive = 'true';
    root.dataset.glitchCount = String((Number(root.dataset.glitchCount) || 0) + 1);
    canvas.hidden = false;
    frame = scope.requestAnimationFrame(drawBurst);
    return true;
  }

  const onPointer = event => {
    const target = event.target?.closest?.('button, a.download-primary, a.download-secondary');
    if (target && !target.disabled && target.getAttribute('aria-disabled') !== 'true') trigger(target);
  };
  const onHide = event => { suspended = true; refresh(); if (!event.persisted) controller.destroy(); };
  const onShow = () => { suspended = false; refresh(); };
  const observer = scope.MutationObserver ? new scope.MutationObserver(refresh) : null;
  observer?.observe(doc.body, {attributes: true, attributeFilter: ['data-background', 'data-reduced-motion']});
  if (player) observer?.observe(player, {attributes: true, attributeFilter: ['hidden']});
  doc.addEventListener('visibilitychange', refresh);
  doc.addEventListener('pointerdown', onPointer, {passive: true});
  scope.addEventListener('pagehide', onHide);
  scope.addEventListener('pageshow', onShow);
  if (preference?.addEventListener) preference.addEventListener('change', refresh);
  else preference?.addListener?.(refresh);

  const controller = {
    refresh, trigger,
    destroy() {
      if (closed) return;
      closed = true; destroyedImage = true;
      clearBurst();
      observer?.disconnect();
      doc.removeEventListener('visibilitychange', refresh);
      doc.removeEventListener('pointerdown', onPointer);
      scope.removeEventListener('pagehide', onHide);
      scope.removeEventListener('pageshow', onShow);
      if (preference?.removeEventListener) preference.removeEventListener('change', refresh);
      else preference?.removeListener?.(refresh);
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
  refresh();
  return controller;
}

export function triggerGlitch(target) {
  try { return startVisualEffects().trigger(target); } catch { return false; }
}
