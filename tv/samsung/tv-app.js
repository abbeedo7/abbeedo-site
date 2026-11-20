(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // tv/samsung/app/tv-network.js
  function nativeTVInfo(scope2 = globalThis) {
    try {
      const application = scope2.tizen?.application?.getCurrentApplication?.();
      const id = application?.appInfo?.id || application?.id;
      if (id === TV_APPLICATION_IDS.tizen) return { platform: "tizen", appId: id, packaged: !/^https?:$/.test(scope2.location?.protocol || "") };
    } catch {
    }
    try {
      const id = scope2.webOSSystem?.identifier;
      if (id === TV_APPLICATION_IDS.webos) return { platform: "webos", appId: id, packaged: !/^https?:$/.test(scope2.location?.protocol || "") };
    } catch {
    }
    try {
      const location2 = scope2.location, ua = String(scope2.navigator?.userAgent || "");
      if (location2?.protocol === "https:" && ["www.abbeedo.com", "abbeedo.com"].includes(location2.hostname) && /^\/app(?:\/|\.html)?$/.test(location2.pathname) && /(?:webOS|Web0S)/i.test(ua) && /(?:Smart[- ]?TV|webOS\.TV|LG Browser)/i.test(ua)) return { platform: "webos", appId: TV_APPLICATION_IDS.webos, packaged: false };
    } catch {
    }
    return null;
  }
  function tvAPIPath(path2) {
    const original = path2.startsWith("/api/tv/") ? path2.replace("/api/tv/", "/api/") : path2;
    if (["/api/client", "/api/media", "/api/announcements", "/api/device-pairings", "/api/watch/rooms"].includes(original)) return original.replace("/api/", "/api/tv/");
    if (/^\/api\/device-pairings\/[A-Za-z0-9_-]{22}(?:\/(?:ack|commands(?:\/ack)?|state))?$/.test(original) || new RegExp("^/api/watch/rooms/" + room + "(?:/state)?$", "i").test(original)) return original.replace("/api/", "/api/tv/");
    return null;
  }
  function installPackagedTVNetwork(scope2 = globalThis) {
    const info = nativeTVInfo(scope2);
    if (!info) return { installed: false, reason: "not-native-tv" };
    const root = scope2.document?.documentElement;
    if (root?.dataset) {
      root.dataset.tv = info.platform;
      root.dataset.tvAppId = info.appId;
    }
    if (!info.packaged) return { installed: false, ...info, reason: "hosted-same-origin" };
    if (scope2[installedKey]?.installed) return scope2[installedKey];
    if (typeof scope2.fetch !== "function") return { installed: false, ...info, reason: "fetch-unavailable" };
    const previousFetch = scope2.fetch, previousConfig = scope2.ABUNASSER_CONFIG, fetcher = scope2.fetch.bind(scope2), HeadersType = scope2.Headers || Headers, RequestType = scope2.Request || Request;
    scope2.ABUNASSER_CONFIG = { ...previousConfig || {}, apiOrigin: TV_API_ORIGIN, apiBase: TV_API_ORIGIN + "/api/client", tvPlatform: info.platform, tvAppId: info.appId, packagedTV: true };
    const wrapped = function(input, init) {
      let address;
      try {
        const raw = typeof input === "string" ? input : input?.url || input?.href;
        const base = typeof raw === "string" && raw.startsWith("/api/") ? TV_API_ORIGIN : scope2.location?.href || TV_API_ORIGIN + "/app";
        address = new URL(raw, base);
      } catch {
        return fetcher(input, init);
      }
      if (address.origin !== TV_API_ORIGIN) return fetcher(input, init);
      const path2 = tvAPIPath(address.pathname), publicMetadata = knownPublic.has(address.pathname);
      if (!path2 && !publicMetadata) return fetcher(input, init);
      if (path2) address.pathname = path2;
      const original = input instanceof RequestType ? input : null;
      const outgoingHeaders = new HeadersType(init?.headers || original?.headers);
      outgoingHeaders.delete("cookie");
      if (path2 && path2 !== "/api/tv/media") outgoingHeaders.set("X-Abbeedo-TV-App", info.appId);
      else outgoingHeaders.delete("X-Abbeedo-TV-App");
      const options = { ...init || {}, headers: outgoingHeaders, credentials: "omit", mode: "cors" };
      if (original) return fetcher(new RequestType(new RequestType(address.href, original), options));
      return fetcher(address.href, options);
    };
    scope2.fetch = wrapped;
    const controller2 = { installed: true, ...info, apiOrigin: TV_API_ORIGIN, restore() {
      if (scope2.fetch === wrapped) scope2.fetch = previousFetch;
      if (scope2.ABUNASSER_CONFIG?.apiOrigin === TV_API_ORIGIN) scope2.ABUNASSER_CONFIG = previousConfig;
      if (scope2[installedKey] === controller2) delete scope2[installedKey];
    } };
    scope2[installedKey] = controller2;
    return controller2;
  }
  var TV_API_ORIGIN, TV_APPLICATION_IDS, installedKey, knownPublic, room;
  var init_tv_network = __esm({
    "tv/samsung/app/tv-network.js"() {
      TV_API_ORIGIN = "https://www.abbeedo.com";
      TV_APPLICATION_IDS = Object.freeze({ webos: "com.abbeedo.tv.app", tizen: "AbbeedoTV1.tv" });
      installedKey = "__abbeedoPackagedTVNetwork";
      knownPublic = /* @__PURE__ */ new Set(["/version.json", "/api/releases"]);
      room = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
    }
  });

  // tv/samsung/app/glitch.js?site=2.1
  function visualPolicy({ background = "standard", reducedMotion = false, systemReducedMotion = false, hidden = false, playback = false } = {}) {
    const speed = background === "fast" ? "fast" : "standard";
    const state2 = hidden ? "hidden" : playback ? "playback" : reducedMotion || systemReducedMotion ? "reduced" : background === "off" ? "off" : "running";
    return {
      state: state2,
      speed,
      gridPeriod: speed === "fast" ? 1900 : 3200,
      backgroundRunning: state2 === "running",
      automaticGlitchEnabled: state2 === "running",
      glitchEnabled: !["hidden", "playback", "reduced"].includes(state2)
    };
  }
  function startVisualEffects(scope2 = globalThis) {
    const doc = scope2?.document;
    if (!doc?.body || !doc.documentElement || !doc.createElement || !scope2.requestAnimationFrame) return inert;
    const previous = controllers.get(doc);
    if (previous) return previous;
    const root = doc.documentElement;
    const background = doc.createElement("div");
    background.id = "visual-backdrop";
    background.setAttribute("aria-hidden", "true");
    for (const name of ["motion-glow", "motion-grid motion-grid-x", "motion-grid motion-grid-y"]) {
      const layer = doc.createElement("div");
      layer.className = name;
      background.append(layer);
    }
    const canvas = doc.createElement("canvas");
    canvas.id = "visual-glitch";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    doc.body.prepend(background);
    doc.body.append(canvas);
    doc.body.classList.add("visual-effects-ready");
    let context = null;
    try {
      context = canvas.getContext?.("2d");
    } catch {
    }
    const player = doc.getElementById("player-page");
    let preference;
    try {
      preference = scope2.matchMedia?.("(prefers-reduced-motion: reduce)");
    } catch {
    }
    let systemReducedMotion = !!preference?.matches;
    let suspended = false, closed = false, frame = 0, burst = null, lastBurst = -Infinity, logo = null;
    let destroyedImage = false, automaticTimer = 0, initialShown = false, pendingTarget = null, lastInteraction = -Infinity;
    const now = () => scope2.performance?.now?.() ?? Date.now();
    const policy = () => visualPolicy({
      background: doc.body.dataset.background || "standard",
      reducedMotion: doc.body.dataset.reducedMotion === "true",
      systemReducedMotion,
      hidden: suspended || !!doc.hidden,
      playback: !!player && !player.hidden
    });
    function clearBurst() {
      if (frame) scope2.cancelAnimationFrame(frame);
      frame = 0;
      if (burst?.motion) burst.motion.cancel();
      burst = null;
      canvas.hidden = true;
      root.dataset.glitchActive = "false";
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }
    function refresh() {
      if (closed) return;
      const value = policy();
      background.dataset.state = value.state;
      background.dataset.speed = value.speed;
      root.dataset.visualMotion = value.state;
      if (!value.glitchEnabled || doc.querySelector("dialog[open]")) clearBurst();
      if (!value.automaticGlitchEnabled || doc.querySelector("dialog[open]")) cancelAutomatic();
      else scheduleAutomatic();
    }
    function cancelAutomatic() {
      if (automaticTimer) scope2.clearTimeout(automaticTimer);
      automaticTimer = 0;
    }
    function visibleBrand(target = doc.body) {
      const candidates = target?.matches?.(".brand-logo") ? [target] : [...target?.querySelectorAll?.(".brand-logo") || []];
      const width = scope2.innerWidth || root.clientWidth, height = scope2.innerHeight || root.clientHeight;
      return candidates.filter((image) => {
        if (image.closest?.("[hidden]") || image.getClientRects?.().length === 0) return false;
        const rect = image.getBoundingClientRect(), style = scope2.getComputedStyle?.(image);
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height && style?.visibility !== "hidden" && style?.display !== "none";
      }).sort((left, right) => {
        const area = (image) => {
          const r = image.getBoundingClientRect();
          return Math.max(0, Math.min(width, r.right) - Math.max(0, r.left)) * Math.max(0, Math.min(height, r.bottom) - Math.max(0, r.top));
        };
        return area(right) - area(left);
      })[0] || null;
    }
    function scheduleAutomatic() {
      if (closed || automaticTimer || !logo || !context || !policy().automaticGlitchEnabled || doc.querySelector("dialog[open]")) return;
      automaticTimer = scope2.setTimeout(() => {
        automaticTimer = 0;
        initialShown = true;
        refresh();
        if (closed || !policy().automaticGlitchEnabled || doc.querySelector("dialog[open]")) return;
        const target = visibleBrand();
        if (target && now() - lastInteraction >= 1500 && !doc.activeElement?.matches?.('input,textarea,[contenteditable="true"]')) trigger(target);
        initialShown = true;
        scheduleAutomatic();
      }, initialShown ? REPEAT_MS : INITIAL_MS);
    }
    function texture(image, color2) {
      const result = doc.createElement("canvas");
      const ratio = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      result.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      result.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      let paint;
      try {
        paint = result.getContext("2d");
      } catch {
        return image;
      }
      if (!paint) return image;
      paint.drawImage(image, 0, 0, result.width, result.height);
      if (color2) {
        paint.globalCompositeOperation = "source-in";
        paint.fillStyle = color2;
        paint.fillRect(0, 0, result.width, result.height);
      }
      return result;
    }
    if (scope2.Image) {
      const image = new scope2.Image();
      image.onload = () => {
        if (destroyedImage || closed || !image.naturalWidth) return;
        logo = { white: texture(image), red: texture(image, "#ff164d"), cyan: texture(image, "#00edda") };
        root.dataset.glitchReady = "true";
        const target = pendingTarget;
        pendingTarget = null;
        if (target && policy().glitchEnabled && !doc.querySelector("dialog[open]")) trigger(visibleBrand(target) || visibleBrand() || target);
        refresh();
      };
      image.onerror = () => {
        root.dataset.glitchReady = "error";
      };
      image.src = new URL("brand.png", doc.baseURI).href;
    }
    function targetBounds(target) {
      const rectangle = target?.getBoundingClientRect?.();
      const width = Math.max(1, scope2.innerWidth || root.clientWidth);
      const height = Math.max(1, scope2.innerHeight || root.clientHeight);
      if (!rectangle || rectangle.width < 1 || rectangle.height < 1) return { left: 0, top: 0, width, height };
      const left = Math.max(0, rectangle.left), top = Math.max(0, rectangle.top);
      return { left, top, width: Math.max(0, Math.min(width, rectangle.right) - left), height: Math.max(0, Math.min(height, rectangle.bottom) - top) };
    }
    function logoBounds(target, bounds) {
      const candidate = visibleBrand(target);
      if (candidate) return candidate.getBoundingClientRect();
      if (bounds.width < 150 || bounds.height < 90) return null;
      const size = Math.min(112, bounds.width * 0.55, bounds.height * 0.55);
      return { left: bounds.left + (bounds.width - size) / 2, top: bounds.top + (bounds.height - size) / 2, width: size, height: size };
    }
    function drawBurst() {
      frame = 0;
      if (closed || !burst || !policy().glitchEnabled) return clearBurst();
      const elapsed = Math.max(0, now() - burst.began);
      if (elapsed >= BURST_MS) return clearBurst();
      const width = Math.max(1, scope2.innerWidth || root.clientWidth), height = Math.max(1, scope2.innerHeight || root.clientHeight);
      const scale = Math.min(scope2.devicePixelRatio || 1, 1.5, Math.sqrt(2e6 / (width * height)));
      if (canvas.width !== Math.round(width * scale) || canvas.height !== Math.round(height * scale)) {
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
      }
      if (context) {
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, width, height);
        const bounds = targetBounds(burst.target), rectangle = logoBounds(burst.target, bounds);
        if (logo && rectangle && bounds.width && bounds.height) {
          const strength = Math.sin(Math.PI * elapsed / BURST_MS), fringe = Math.max(1.5, rectangle.width * 0.04) * strength;
          const tick = Math.floor(elapsed / 34);
          for (let slice = 0; slice < 11; slice++) {
            const seed = tick * 17 + slice * 13 & 31;
            const displacement = (seed % 9 - 4) * rectangle.width * 0.016 * strength;
            const top = rectangle.top + rectangle.height * slice / 11;
            context.save();
            context.beginPath();
            context.rect(Math.max(bounds.left, rectangle.left - fringe * 4), Math.max(bounds.top, top), Math.min(bounds.width, rectangle.width + fringe * 8), Math.min(rectangle.height / 11 + 0.5, bounds.top + bounds.height - top));
            context.clip();
            for (const [textureName, offset, alpha] of [["red", fringe, 0.66], ["cyan", -fringe, 0.68], ["white", 0, 0.5]]) {
              context.globalAlpha = alpha * strength;
              context.drawImage(logo[textureName], rectangle.left + displacement + offset, rectangle.top, rectangle.width, rectangle.height);
            }
            context.restore();
          }
        }
      }
      frame = scope2.requestAnimationFrame(drawBurst);
    }
    function trigger(target = doc.getElementById("app-shell")) {
      if (closed || !policy().glitchEnabled || !target || target.closest?.("[hidden]") || doc.querySelector("dialog[open]")) return false;
      const brand = visibleBrand(target) || visibleBrand();
      if (!brand) return false;
      target = brand;
      if (!logo || !context) {
        pendingTarget = target;
        return false;
      }
      const time = now();
      if (burst) {
        const old = targetBounds(burst.target), next = targetBounds(target);
        if (next.width * next.height > old.width * old.height) burst.target = target;
        return true;
      }
      if (time - lastBurst < BURST_MS + QUIET_MS) return false;
      lastBurst = time;
      burst = { target, began: time, motion: null };
      const motionTarget = visibleBrand(target) || visibleBrand();
      if (motionTarget?.animate) {
        try {
          burst.motion = motionTarget.animate([
            { translate: "0 0" },
            { translate: "3px 0", offset: 0.22 },
            { translate: "-3px 1px", offset: 0.48 },
            { translate: "1px 0", offset: 0.76 },
            { translate: "0 0" }
          ], { duration: BURST_MS, easing: "steps(1, end)" });
        } catch {
        }
      }
      root.dataset.glitchActive = "true";
      root.dataset.glitchCount = String((Number(root.dataset.glitchCount) || 0) + 1);
      canvas.hidden = false;
      frame = scope2.requestAnimationFrame(drawBurst);
      return true;
    }
    const onActivity = () => {
      lastInteraction = now();
    };
    const updateViewport = () => {
      const viewport = scope2.visualViewport;
      background.style.width = Math.ceil(Math.max(scope2.innerWidth || root.clientWidth || 1, viewport?.width || 0)) + "px";
      background.style.height = Math.ceil(Math.max(scope2.innerHeight || root.clientHeight || 1, (viewport?.height || 0) + (viewport?.offsetTop || 0))) + "px";
      clearBurst();
      refresh();
    };
    const onPointer = (event) => {
      onActivity();
      const target = event.target?.closest?.("button, a.download-primary, a.download-secondary");
      if (target && !target.disabled && target.getAttribute("aria-disabled") !== "true") trigger(target);
    };
    const onHide = (event) => {
      suspended = true;
      refresh();
      if (!event.persisted) controller2.destroy();
    };
    const onShow = () => {
      suspended = false;
      refresh();
    };
    const observer = scope2.MutationObserver ? new scope2.MutationObserver(refresh) : null;
    const dialogs = scope2.MutationObserver ? new scope2.MutationObserver((records) => {
      if (records.some((record2) => record2.type === "attributes" || record2.target === doc.body)) refresh();
    }) : null;
    dialogs?.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    observer?.observe(doc.body, { attributes: true, attributeFilter: ["data-background", "data-reduced-motion"] });
    if (player) observer?.observe(player, { attributes: true, attributeFilter: ["hidden"] });
    doc.addEventListener("visibilitychange", refresh);
    doc.addEventListener("close", refresh, true);
    doc.addEventListener("toggle", refresh, true);
    doc.addEventListener("pointerdown", onPointer, { passive: true });
    doc.addEventListener("keydown", onActivity, { passive: true });
    scope2.addEventListener("pagehide", onHide);
    scope2.addEventListener("resize", updateViewport, { passive: true });
    scope2.addEventListener("focus", refresh);
    scope2.visualViewport?.addEventListener?.("resize", updateViewport, { passive: true });
    scope2.visualViewport?.addEventListener?.("scroll", updateViewport, { passive: true });
    scope2.addEventListener("pageshow", onShow);
    const onPreferenceChange = (event) => {
      systemReducedMotion = typeof event?.matches === "boolean" ? event.matches : !!preference?.matches;
      refresh();
    };
    if (preference) preference.onchange = onPreferenceChange;
    if (preference?.addEventListener) preference.addEventListener("change", onPreferenceChange);
    else preference?.addListener?.(onPreferenceChange);
    const controller2 = {
      refresh,
      trigger,
      destroy() {
        if (closed) return;
        closed = true;
        destroyedImage = true;
        clearBurst();
        cancelAutomatic();
        pendingTarget = null;
        observer?.disconnect();
        dialogs?.disconnect();
        doc.removeEventListener("visibilitychange", refresh);
        doc.removeEventListener("close", refresh, true);
        doc.removeEventListener("toggle", refresh, true);
        doc.removeEventListener("pointerdown", onPointer);
        doc.removeEventListener("keydown", onActivity);
        scope2.removeEventListener("pagehide", onHide);
        scope2.removeEventListener("resize", updateViewport);
        scope2.removeEventListener("focus", refresh);
        scope2.visualViewport?.removeEventListener?.("resize", updateViewport);
        scope2.visualViewport?.removeEventListener?.("scroll", updateViewport);
        scope2.removeEventListener("pageshow", onShow);
        if (preference?.removeEventListener) preference.removeEventListener("change", onPreferenceChange);
        else preference?.removeListener?.(onPreferenceChange);
        if (preference?.onchange === onPreferenceChange) preference.onchange = null;
        background.remove();
        canvas.remove();
        doc.body.classList.remove("visual-effects-ready");
        root.dataset.visualMotion = "destroyed";
        controllers.delete(doc);
        logo = null;
      }
    };
    controllers.set(doc, controller2);
    root.dataset.visualEffects = "ready";
    root.dataset.glitchActive = "false";
    root.dataset.glitchReady = "false";
    updateViewport();
    return controller2;
  }
  function triggerGlitch(target) {
    try {
      return startVisualEffects().trigger(target);
    } catch {
      return false;
    }
  }
  var controllers, BURST_MS, REPEAT_MS, INITIAL_MS, QUIET_MS, inert;
  var init_glitch = __esm({
    "tv/samsung/app/glitch.js?site=2.1"() {
      controllers = /* @__PURE__ */ new WeakMap();
      BURST_MS = 300;
      REPEAT_MS = 1e4;
      INITIAL_MS = 180;
      QUIET_MS = 320;
      inert = Object.freeze({ refresh() {
      }, trigger() {
        return false;
      }, destroy() {
      } });
    }
  });

  // tv/samsung/app/shared-accent.js
  function stored(storage, key2) {
    try {
      return JSON.parse(storage?.getItem(key2) || "null");
    } catch {
      return null;
    }
  }
  function valid(record2) {
    return record2?.version === 1 && color(record2.accent) ? { version: 1, accent: color(record2.accent), updatedAt: Number(record2.updatedAt) || 0 } : null;
  }
  function current(storage) {
    const persisted = valid(stored(storage, SHARED_ACCENT_KEY)), pending2 = storage ? fallbacks.get(storage) : memory;
    if (persisted && (!pending2 || persisted.updatedAt >= pending2.updatedAt)) {
      if (storage) fallbacks.delete(storage);
      return persisted;
    }
    return pending2 || persisted;
  }
  function setSharedAccent(value, storage = appearanceStorage()) {
    const accent = color(value);
    if (!accent) return null;
    const old = current(storage);
    if (old?.accent === accent) return old;
    const record2 = { version: 1, accent, updatedAt: Math.max(Date.now(), (old?.updatedAt || 0) + 1) };
    if (!storage) memory = record2;
    else try {
      storage.setItem(SHARED_ACCENT_KEY, JSON.stringify(record2));
      fallbacks.delete(storage);
    } catch {
      fallbacks.set(storage, record2);
    }
    return record2;
  }
  function getSharedAccent(fallback = null, storage = appearanceStorage()) {
    const saved = current(storage);
    if (saved) return saved.accent;
    const website = color(stored(storage, WEBSITE_KEY)?.accent) || color(stored(storage, "f7rv.site.preferences.v1")?.accent), app = color(stored(storage, APP_KEY)?.values?.accent);
    const migrated = website && website !== DEFAULT_ACCENT ? website : app || website;
    if (migrated) return setSharedAccent(migrated, storage).accent;
    return color(fallback);
  }
  var SHARED_ACCENT_KEY, WEBSITE_KEY, APP_KEY, DEFAULT_ACCENT, fallbacks, memory, appearanceStorage, color;
  var init_shared_accent = __esm({
    "tv/samsung/app/shared-accent.js"() {
      SHARED_ACCENT_KEY = "abbeedo:appearance:v1";
      WEBSITE_KEY = "abbeedo:website:preferences:v2";
      APP_KEY = "abbeedo:preferences:v1";
      DEFAULT_ACCENT = "#ff242d";
      fallbacks = /* @__PURE__ */ new WeakMap();
      memory = null;
      appearanceStorage = () => {
        try {
          return globalThis.localStorage || null;
        } catch {
          return null;
        }
      };
      color = (value) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value.toLowerCase() : null;
    }
  });

  // tv/samsung/app/accent-colors.js
  function channels(color2) {
    const value = String(color2 || "").trim(), hex2 = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
    if (hex2) {
      const full = hex2.length < 5 ? [...hex2].map((x2) => x2 + x2).join("") : hex2;
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1);
    }
    const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgb) return null;
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const result = parts.slice(0, 3).map((x2) => Number.parseFloat(x2) * (x2.endsWith("%") ? 2.55 : 1)), alpha = parts[3] === void 0 ? 1 : Number.parseFloat(parts[3]) / (parts[3].endsWith("%") ? 100 : 1);
    return result.every((x2) => Number.isFinite(x2) && x2 >= 0 && x2 <= 255) && Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? [...result, alpha] : null;
  }
  function hex(color2) {
    return "#" + color2.slice(0, 3).map((x2) => Math.round(x2).toString(16).padStart(2, "0")).join("");
  }
  function composite(foreground, background) {
    const f = channels(foreground), b = channels(background);
    return hex(b.slice(0, 3).map((x2, i) => f[i] * f[3] + x2 * (1 - f[3])));
  }
  function mix(foreground, background, amount) {
    const f = channels(foreground), b = channels(background);
    return hex(b.slice(0, 3).map((x2, i) => f[i] * amount + x2 * (1 - amount)));
  }
  function luminance(color2) {
    const rgb = channels(color2);
    if (!rgb) throw new TypeError("Invalid contrast color");
    const linear = rgb.slice(0, 3).map((x2) => {
      const v = x2 / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  function contrastRatio(first, second) {
    const a = luminance(first), b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function accentPalette(accent, { theme = "dark", application = false, highContrast = false, background, panel } = {}) {
    const raw = channels(accent) ? hex(channels(accent)) : "#ff242d", defaults = THEMES[application ? "application" : "website"][theme] || THEMES.website.dark, bg = channels(background) ? composite(background, defaults[0]) : defaults[0], card = highContrast && !application ? bg : composite(channels(panel) ? panel : defaults[1], bg), glow = mix(raw, bg, 0.27), greenGlow = composite("#10493166", bg), surfaces = [bg, card, glow, greenGlow, mix(raw, greenGlow, 0.27), mix(raw, card, 0.22)], worst = (color2) => Math.min(...surfaces.map((surface) => contrastRatio(color2, surface))), ink = contrastRatio(BLACK, raw) >= contrastRatio(WHITE, raw) ? BLACK : WHITE, target = worst(BLACK) >= worst(WHITE) ? BLACK : WHITE;
    let readable = raw;
    if (worst(readable) < 4.6) {
      let low = 0, high = 1;
      for (let step = 0; step < 20; step++) {
        const middle = (low + high) / 2;
        if (worst(mix(target, raw, middle)) >= 4.6) high = middle;
        else low = middle;
      }
      readable = mix(target, raw, high);
    }
    return { accent: raw, ink, readable, surfaces };
  }
  function applyAccentColors(doc, accent, options = {}) {
    const body = doc?.body, root = doc?.documentElement;
    if (!root) return;
    let computed;
    try {
      computed = doc.defaultView?.getComputedStyle(body || root);
    } catch {
    }
    const palette = accentPalette(accent, { ...options, background: computed?.getPropertyValue("--bg").trim(), panel: computed?.getPropertyValue(options.application ? "--panel" : "--surface").trim() });
    for (const node2 of [root, body]) if (node2?.style) {
      node2.style.setProperty("--accent", palette.accent);
      node2.style.setProperty("--accent-ink", palette.ink);
      node2.style.setProperty("--accent-readable", palette.readable);
    }
    return palette;
  }
  var BLACK, WHITE, THEMES;
  var init_accent_colors = __esm({
    "tv/samsung/app/accent-colors.js"() {
      BLACK = "#000000";
      WHITE = "#ffffff";
      THEMES = { website: { dark: ["#0a1018", "#101720e8"], light: ["#eef1f3", "#fffffff0"], sport: ["#071e20", "#092a31ed"], cinema: ["#190d13", "#24121aee"] }, application: { dark: ["#0b1017", "#101722"], light: ["#e9edf1", "#f6f8fc"], sport: ["#061b1b", "#09292e"], cinema: ["#170c1b", "#211426"] } };
    }
  });

  // tv/samsung/app/preferences.js
  function cleanPreferenceValues(input = {}) {
    const values = {};
    if (!input || typeof input !== "object") return values;
    for (const key2 of fields) {
      const value = input[key2];
      if (key2 === "language" && LANGUAGES.some((row) => row.code === value)) values[key2] = value;
      else if (key2 === "accent" && /^#[a-f\d]{6}$/i.test(value || "")) values[key2] = value.toLowerCase();
      else if (key2 === "theme" && ["dark", "light", "sport", "cinema"].includes(value)) values[key2] = value;
      else if (key2 === "background_speed" && ["standard", "fast", "off"].includes(value)) values[key2] = value;
      else if (key2 === "text_scale" && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 1.5) values[key2] = Number(value);
      else if (["reduced_motion", "high_contrast"].includes(key2) && typeof value === "boolean") values[key2] = value;
    }
    return values;
  }
  function readOwnPreferences(storage = storageOrNull()) {
    if (storage && storageFallbacks.has(storage)) return storageFallbacks.get(storage);
    try {
      const parsed = JSON.parse(storage?.getItem(PREFERENCES_KEY) || "null");
      if (parsed && parsed.version === 1) return { version: 1, values: cleanPreferenceValues(parsed.values), chosenLanguage: parsed.chosenLanguage === true && LANGUAGES.some((row) => row.code === parsed.values?.language), updatedAt: Number(parsed.updatedAt) || 0 };
    } catch {
      return storage ? storageFallbacks.get(storage) || { version: 1, values: {}, chosenLanguage: false, updatedAt: 0 } : memoryRecord || { version: 1, values: {}, chosenLanguage: false, updatedAt: 0 };
    }
    return !storage && memoryRecord || { version: 1, values: {}, chosenLanguage: false, updatedAt: 0 };
  }
  function readPreferences(storage = storageOrNull()) {
    const record2 = readOwnPreferences(storage), accent = getSharedAccent(null, storage);
    return accent ? { ...record2, values: { ...record2.values, accent } } : record2;
  }
  function clearPreferences(storage = storageOrNull()) {
    memoryRecord = null;
    setSharedAccent(PREFERENCE_DEFAULTS.accent, storage);
    if (storage) {
      storageFallbacks.delete(storage);
      try {
        storage.removeItem(PREFERENCES_KEY);
      } catch {
      }
    }
  }
  function preferenceValues(record2 = readPreferences()) {
    return { ...PREFERENCE_DEFAULTS, ...cleanPreferenceValues(record2.values) };
  }
  function mergeVaultPreferences(settings = {}, record2 = readPreferences()) {
    return { ...settings, ...cleanPreferenceValues(record2.values) };
  }
  function writePreferences(patch, { chooseLanguage = false, storage = storageOrNull(), notify = true } = {}) {
    const old = readPreferences(storage), clean = cleanPreferenceValues(patch), values = { ...old.values, ...clean }, chosenLanguage = old.chosenLanguage || chooseLanguage && LANGUAGES.some((row) => row.code === values.language);
    if (Object.hasOwn(clean, "accent")) setSharedAccent(clean.accent, storage);
    if (JSON.stringify(values) === JSON.stringify(old.values) && chosenLanguage === old.chosenLanguage) return old;
    const record2 = { version: 1, values, chosenLanguage, updatedAt: Date.now() };
    if (!storage) memoryRecord = record2;
    else try {
      storage.setItem(PREFERENCES_KEY, JSON.stringify(record2));
      storageFallbacks.delete(storage);
    } catch {
      storageFallbacks.set(storage, record2);
    }
    if (notify && typeof globalThis.dispatchEvent === "function" && typeof globalThis.CustomEvent === "function") globalThis.dispatchEvent(new CustomEvent("abbeedo:preferences", { detail: record2 }));
    return record2;
  }
  function migrateVaultPreferences(settings, storage = storageOrNull()) {
    const record2 = readPreferences(storage);
    if (record2.chosenLanguage) return record2;
    return writePreferences({ ...cleanPreferenceValues(settings), ...record2.values }, { chooseLanguage: LANGUAGES.some((row) => row.code === settings?.language), storage, notify: false });
  }
  function errorText(error, language = preferenceValues().language) {
    const raw = String(error?.message || error || ""), arabic = /[\u0600-\u06ff]/.test(raw);
    if (raw && (language === "en" && !arabic || language !== "en" && arabic)) return raw;
    const code = String(error?.code || ""), http = Number(error?.httpStatus || error?.status) || Number(raw.match(/HTTP\s*(\d{3})/i)?.[1]) || 0;
    let words = { TIMEOUT: ["\u062A\u0623\u062E\u0631 \u0627\u0644\u0645\u0635\u062F\u0631. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "The source timed out. Please retry."], ABORTED: ["\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0637\u0644\u0628.", "Request canceled."], NETWORK: ["\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0645\u0635\u062F\u0631. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A \u0648\u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "Could not connect to the source. Check your connection and retry."], ACCOUNT_REJECTED: ["\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643.", "The provider rejected the subscription. Check its details and expiry."], INVALID_URL: ["\u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", "The subscription URL is invalid."], INVALID_MAC: ["\u0639\u0646\u0648\u0627\u0646 MAC \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", "The MAC address is invalid."], HOST_NOT_ALLOWED: ["\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0646\u0635\u0629.", "The provider address is unavailable on this platform."], DIRECT_HTTPS_REQUIRED: ["\u064A\u0644\u0632\u0645 \u0631\u0627\u0628\u0637 HTTPS \u0644\u062A\u0634\u063A\u064A\u0644 \u0647\u0630\u0627 \u0627\u0644\u0645\u0635\u062F\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D.", "An HTTPS URL is required for this source in the browser."], INVALID_RESPONSE: ["\u0623\u0631\u0633\u0644 \u0627\u0644\u0645\u0635\u062F\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "The provider returned invalid data. Please retry."], INCOMPLETE_CATALOG: ["\u0648\u0635\u0644\u062A \u0642\u0627\u0626\u0645\u0629 \u062C\u0632\u0626\u064A\u0629 \u0641\u0642\u0637. \u062D\u062F\u0651\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0644\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.", "Only part of the list arrived. Refresh to retry."] }[code] || ["\u062A\u0639\u0630\u0631 \u0625\u062A\u0645\u0627\u0645 \u0627\u0644\u0637\u0644\u0628. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "Could not complete the request. Please retry."];
    if (http === 401 || http === 403) words = ["\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0637\u0644\u0628. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0639\u062F\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A.", "The provider rejected the request. Check your subscription and connection limit."];
    return text(...words, language) + (http ? ` (HTTP ${http})` : "");
  }
  function applyClientPreferences(record2 = readPreferences(), doc = globalThis.document) {
    const p = preferenceValues(record2);
    if (!doc) return p;
    doc.documentElement.lang = p.language;
    doc.documentElement.dir = p.language === "en" ? "ltr" : "rtl";
    doc.documentElement.style.setProperty("--accent", p.accent);
    doc.documentElement.style.setProperty("--scale", String(p.text_scale));
    if (doc.body) {
      doc.body.dataset.theme = p.theme;
      doc.body.dataset.reducedMotion = String(p.reduced_motion);
      doc.body.dataset.highContrast = String(p.high_contrast);
      doc.body.dataset.background = p.background_speed;
      doc.body.classList.toggle("large-text", p.text_scale > 1.1);
    }
    applyAccentColors(doc, p.accent, { theme: p.theme, application: true, highContrast: p.high_contrast });
    doc.title = brandName(p.language);
    doc.querySelector('link[rel="manifest"]')?.setAttribute("href", p.language === "en" ? "/manifest.en.webmanifest" : "/manifest.webmanifest");
    doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", brandName(p.language));
    doc.querySelector('meta[name="description"]')?.setAttribute("content", text("\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV: \u0642\u0646\u0648\u0627\u062A\u0643 \u0648\u0623\u0641\u0644\u0627\u0645\u0643 \u0648\u0645\u0633\u0644\u0633\u0644\u0627\u062A\u0643 \u0645\u0646 \u0627\u0634\u062A\u0631\u0627\u0643\u0643.", "abbeedo TV: your subscription channels, movies and series.", p.language));
    localizeDocument(doc, p.language);
    if (record2.chosenLanguage && lastNativeLanguage !== p.language) {
      try {
        if (typeof globalThis.abunasserDesktop?.setLanguage === "function") {
          lastNativeLanguage = p.language;
          Promise.resolve(globalThis.abunasserDesktop.setLanguage(p.language)).catch(() => {
          });
        }
      } catch {
      }
    }
    doc.documentElement.dataset.preferencesReady = "true";
    return p;
  }
  function localizeDocument(doc = globalThis.document, language = preferenceValues().language) {
    if (!doc) return;
    for (const [selector, ar, en] of fixedText) doc.querySelectorAll(selector).forEach((el) => el.textContent = text(ar, en, language));
    for (const [selector, attribute, ar, en] of fixedAttributes) doc.querySelectorAll(selector).forEach((el) => el.setAttribute(attribute, text(ar, en, language)));
  }
  function chooseInitialLanguage({ doc = globalThis.document } = {}) {
    if (readPreferences().chosenLanguage) return Promise.resolve(preferenceValues().language);
    return new Promise((resolve) => {
      const dialog = make(doc, "dialog", "language-choice");
      dialog.id = "language-choice";
      dialog.setAttribute("aria-labelledby", "language-choice-title");
      const title = make(doc, "h2", "", "\u0627\u062E\u062A\u0631 \u0644\u063A\u062A\u0643 \xB7 Choose your language");
      title.id = "language-choice-title";
      const logo = make(doc, "img", "preferences-logo");
      logo.src = "brand.png";
      logo.alt = "abbeedo TV";
      const choices2 = make(doc, "div", "language-options");
      for (const language of LANGUAGES) {
        const button = make(doc, "button", "", language.name);
        button.type = "button";
        button.dataset.languageChoice = language.code;
        button.lang = language.code;
        button.dir = language.dir;
        button.onclick = () => {
          const record2 = writePreferences({ language: language.code }, { chooseLanguage: true });
          applyClientPreferences(record2, doc);
          dialog.close();
          dialog.remove();
          resolve(language.code);
        };
        choices2.append(button);
      }
      dialog.append(logo, title, choices2);
      dialog.addEventListener("cancel", (event) => event.preventDefault());
      doc.body.append(dialog);
      dialog.showModal();
      choices2.firstElementChild?.focus();
    });
  }
  function openPublicPreferences({ doc = globalThis.document } = {}) {
    let dialog = doc.getElementById("public-preferences");
    if (dialog?.open) return;
    dialog = make(doc, "dialog", "public-preferences");
    dialog.id = "public-preferences";
    dialog.setAttribute("aria-labelledby", "public-preferences-title");
    const previousFocus = doc.activeElement;
    const focusClose = () => dialog.querySelector(".preferences-close")?.focus({ preventScroll: true });
    const closeLanguagePicker = () => {
      const picker = dialog.querySelector("#preference-language");
      if (picker) picker.open = false;
    };
    const draw = () => {
      const p = preferenceValues(), t = (ar, en) => text(ar, en, p.language);
      dialog.replaceChildren();
      const header = make(doc, "div", "preferences-heading"), title = make(doc, "h2", "", t("\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "Settings"));
      title.id = "public-preferences-title";
      const close = make(doc, "button", "preferences-close", "\xD7");
      close.type = "button";
      close.autofocus = true;
      close.setAttribute("aria-label", t("\u0625\u063A\u0644\u0627\u0642", "Close"));
      close.onclick = () => dialog.close();
      header.append(title, close);
      dialog.append(header, make(doc, "p", "preferences-intro", t("\u062E\u0635\u0635 \u0627\u0644\u0645\u0638\u0647\u0631 \u0648\u0627\u0644\u0644\u063A\u0629 \u062F\u0648\u0646 \u0627\u0634\u062A\u0631\u0627\u0643. \u062A\u062D\u0641\u0638 \u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.", "Choose your appearance and language without a subscription. Preferences stay on this device.")));
      const form = make(doc, "div", "preferences-grid");
      const change = (patch) => {
        const record2 = writePreferences(patch, { chooseLanguage: Object.hasOwn(patch, "language") });
        applyClientPreferences(record2, doc);
      };
      const languageRow = make(doc, "div", "preferences-field"), languageCaption = make(doc, "span", "", t("\u0627\u0644\u0644\u063A\u0629", "Language"));
      languageCaption.id = "preference-language-label";
      const languagePicker = make(doc, "details", "language-picker");
      languagePicker.id = "preference-language";
      languagePicker.open = false;
      const languageName = LANGUAGES.find((row) => row.code === p.language)?.name || LANGUAGES[0].name;
      const languageSummary = make(doc, "summary", "", languageName);
      languageSummary.id = "preference-language-summary";
      languageSummary.setAttribute("aria-label", t("\u0627\u0644\u0644\u063A\u0629: ", "Language: ") + languageName);
      const languageOptions = make(doc, "div", "language-picker-options");
      languageOptions.setAttribute("role", "group");
      languageOptions.setAttribute("aria-labelledby", languageCaption.id);
      for (const language of LANGUAGES) {
        const option = make(doc, "button", "", language.name);
        option.type = "button";
        option.lang = language.code;
        option.dir = language.dir;
        option.dataset.preferenceLanguage = language.code;
        option.setAttribute("aria-pressed", String(p.language === language.code));
        option.onclick = () => {
          languagePicker.open = false;
          change({ language: language.code });
          draw();
          focusClose();
        };
        languageOptions.append(option);
      }
      languagePicker.append(languageSummary, languageOptions);
      languagePicker.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && languagePicker.open) {
          event.preventDefault();
          event.stopPropagation();
          languagePicker.open = false;
          languageSummary.focus({ preventScroll: true });
        }
      });
      languageRow.append(languageCaption, languagePicker);
      form.append(languageRow);
      const select = (label2, key2, options) => {
        const row = make(doc, "label", "preferences-field"), caption = make(doc, "span", "", label2), control = make(doc, "select");
        control.id = "preference-" + key2;
        for (const [value, name] of options) {
          const option = make(doc, "option", "", name);
          option.value = String(value);
          control.append(option);
        }
        control.value = String(p[key2]);
        control.onchange = () => change({ [key2]: key2 === "text_scale" ? Number(control.value) : control.value });
        row.append(caption, control);
        form.append(row);
      };
      select(t("\u0627\u0644\u062B\u064A\u0645", "Theme"), "theme", [["dark", t("\u062F\u0627\u0643\u0646", "Dark")], ["light", t("\u0641\u0627\u062A\u062D", "Light")], ["sport", t("\u0631\u064A\u0627\u0636\u064A", "Sport")], ["cinema", t("\u0633\u064A\u0646\u0645\u0627\u0626\u064A", "Cinema")]]);
      select(t("\u062D\u062C\u0645 \u0627\u0644\u0646\u0635", "Text size"), "text_scale", [[1, "100%"], [1.15, "115%"], [1.3, "130%"], [1.5, "150%"]]);
      select(t("\u062D\u0631\u0643\u0629 \u0627\u0644\u062E\u0644\u0641\u064A\u0629", "Background motion"), "background_speed", [["standard", t("\u0648\u0627\u0636\u062D\u0629", "Visible")], ["fast", t("\u0633\u0631\u064A\u0639\u0629", "Fast")], ["off", t("\u062B\u0627\u0628\u062A\u0629", "Still")]]);
      const colorRow = make(doc, "label", "preferences-field"), color2 = make(doc, "input");
      color2.type = "color";
      color2.id = "preference-accent";
      color2.value = p.accent;
      color2.oninput = () => change({ accent: color2.value });
      colorRow.append(make(doc, "span", "", t("\u0644\u0648\u0646 \u0627\u0644\u062A\u0645\u064A\u064A\u0632", "Accent color")), color2);
      form.append(colorRow);
      for (const [key2, label2] of [["high_contrast", t("\u062A\u0628\u0627\u064A\u0646 \u0645\u0631\u062A\u0641\u0639 \u0648\u062A\u062D\u062F\u064A\u062F \u0623\u0648\u0636\u062D", "High contrast and clearer focus")], ["reduced_motion", t("\u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629", "Reduce motion")]]) {
        const row = make(doc, "label", "preferences-toggle"), input = make(doc, "input");
        input.type = "checkbox";
        input.id = "preference-" + key2;
        input.checked = p[key2];
        input.onchange = () => change({ [key2]: input.checked });
        row.append(input, make(doc, "span", "", label2));
        form.append(row);
      }
      dialog.append(form);
    };
    draw();
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "BrowserBack") {
        event.preventDefault();
        event.stopPropagation();
        dialog.close();
      }
    });
    dialog.addEventListener("close", () => {
      closeLanguagePicker();
      dialog.remove();
      previousFocus?.focus?.({ preventScroll: true });
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
      }
    });
    doc.body.append(dialog);
    closeLanguagePicker();
    dialog.showModal();
    focusClose();
    return dialog;
  }
  var PREFERENCES_KEY, LANGUAGES, PREFERENCE_DEFAULTS, fields, memoryRecord, storageFallbacks, lastNativeLanguage, storageOrNull, brandName, text, fixedText, fixedAttributes, make;
  var init_preferences = __esm({
    "tv/samsung/app/preferences.js"() {
      init_shared_accent();
      init_accent_colors();
      PREFERENCES_KEY = "abbeedo:preferences:v1";
      LANGUAGES = Object.freeze([{ code: "ar", name: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", dir: "rtl" }, { code: "en", name: "English", dir: "ltr" }]);
      PREFERENCE_DEFAULTS = Object.freeze({ language: "ar", accent: "#ff242d", theme: "dark", text_scale: 1, background_speed: "standard", reduced_motion: false, high_contrast: false });
      fields = Object.keys(PREFERENCE_DEFAULTS);
      memoryRecord = null;
      storageFallbacks = /* @__PURE__ */ new WeakMap();
      lastNativeLanguage = null;
      storageOrNull = () => {
        try {
          return globalThis.localStorage || null;
        } catch {
          return null;
        }
      };
      brandName = (language = preferenceValues().language) => language === "en" ? "abbeedo TV" : "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV";
      text = (ar, en, language = preferenceValues().language) => language === "en" ? en : ar;
      fixedText = [
        ["#gate-website-home", "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Home"],
        [".install-brand h1, .brand-block h2, [data-brand-name]", "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", "abbeedo TV"],
        [".install-brand > p, .tagline", "\u0639\u0627\u0644\u0645\u0643 \u0645\u0646 \u0627\u0644\u062A\u0631\u0641\u064A\u0647", "Your world of entertainment"],
        ["#website-settings-button span, #settings-button span", "\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "Settings"],
        ["#login-brand .login-hint", "\u0623\u062F\u062E\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0644\u0628\u062F\u0621 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Enter your subscription to start watching"],
        [".source-label", "\u0637\u0631\u064A\u0642\u0629 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Subscription method"],
        ['#source-mode option[value="provider"]', "\u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0628\u0648\u0646\u0627\u0635\u0631", "Abunasser subscription"],
        ['#source-mode option[value="m3u"]', "\u0631\u0627\u0628\u0637 \u0623\u0648 \u0645\u0644\u0641 M3U", "M3U URL or file"],
        ['#source-mode option[value="direct"]', "\u0631\u0627\u0628\u0637 \u0628\u062B \u0645\u0628\u0627\u0634\u0631", "Direct stream URL"],
        ['#source-mode option[value="auto"]', "\u0627\u0644\u062A\u0639\u0631\u0641 \u0639\u0644\u0649 \u0631\u0627\u0628\u0637 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627", "Detect subscription URL automatically"],
        [".remember span", "\u062D\u0641\u0638 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 (\u0645\u0634\u0641\u0631)", "Save subscription on this device (encrypted)"],
        ["#qr-button span", "\u0625\u0636\u0627\u0641\u0629 \u0639\u0628\u0631 QR", "Add with QR"],
        ["#file-button span", "\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0644\u0641 M3U", "Choose an M3U file"],
        ["#login-button", "\u062F\u062E\u0648\u0644", "Sign in"],
        ["#demo-button", "\u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u062F\u0648\u0646 \u0627\u0634\u062A\u0631\u0627\u0643", "Try without a subscription"],
        ["#subscribe-button", "\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "Subscribe to the app"],
        ["#developer-button", "\u0628\u0631\u0645\u062C\u0629 \u0627\u0628\u0648\u0646\u0627\u0635\u0631", "Developed by Abunasser"],
        ["#catalog-more", "\u0639\u0631\u0636 \u0627\u0644\u0645\u0632\u064A\u062F", "Show more"],
        ["#catalog-empty", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0639\u0646\u0627\u0635\u0631 \u062A\u0637\u0627\u0628\u0642 \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631.", "No matching items."],
        [".settings-intro p", "\u062A\u0641\u0636\u064A\u0644\u0627\u062A\u0643\u060C \u0628\u0627\u0644\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062A\u064A \u062A\u0646\u0627\u0633\u0628\u0643.", "Your preferences, your way."],
        [".settings-intro span", "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u0635\u0641\u062D\u0629 \u0648\u0627\u062D\u062F\u0629", "Device and subscription settings in one page"],
        ["[data-developer-credit]", "\u0628\u0631\u0645\u062C\u0629 \u0627\u0628\u0648\u0646\u0627\u0635\u0631", "Developed by Abunasser"],
        ["#previous-channel span", "\u0627\u0644\u0633\u0627\u0628\u0642\u0629", "Previous"],
        ["#next-channel span", "\u0627\u0644\u062A\u0627\u0644\u064A\u0629", "Next"],
        ["#last-channel span", "\u0622\u062E\u0631 \u0642\u0646\u0627\u0629", "Last channel"],
        ["#channel-number span", "\u0631\u0642\u0645 \u0627\u0644\u0642\u0646\u0627\u0629", "Channel number"],
        ["#receiver-toggle", "OK \xB7 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "OK \xB7 Channel list"],
        ["#player-guide span", "\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Program guide"],
        ["#seek-back span", "\u0625\u0631\u062C\u0627\u0639", "Rewind"],
        ["#seek-forward span", "\u062A\u0642\u062F\u064A\u0645", "Forward"],
        ["#subtitle-button span", "\u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u062A\u0631\u062C\u0645\u0629", "Audio and subtitles"],
        ["#pip-button span", "\u0635\u0648\u0631\u0629 \u062F\u0627\u062E\u0644 \u0635\u0648\u0631\u0629", "Picture in picture"],
        ["#fullscreen-button span", "\u0645\u0644\u0621 \u0627\u0644\u0634\u0627\u0634\u0629", "Fullscreen"],
        ["#sleep-button span", "\u0645\u0624\u0642\u062A \u0627\u0644\u0646\u0648\u0645", "Sleep timer"],
        ["#watch-button span", "\u0634\u0627\u0647\u062F \u0645\u0639\u064A", "Watch together"],
        ["#capture-button span", "\u0627\u0644\u062A\u0642\u0627\u0637", "Capture"],
        [".receiver-header h3", "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Channel list"],
        ["#receiver-guide", "\u062F\u0644\u064A\u0644", "Guide"],
        ["#unlock-form h2", "\u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0642\u0641\u0644", "App locked"],
        ["#unlock-form button", "\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "Unlock app"],
        ["#screensaver p", "\u0627\u0636\u063A\u0637 \u0644\u0644\u0639\u0648\u062F\u0629", "Press to return"],
        ["#install-button", "\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Add to Home Screen"],
        ["#copy-install-link", "\u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637 \u0644\u0641\u062A\u062D\u0647 \u0641\u064A Safari", "Copy link to open in Safari"],
        ["#retry-download-check", "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u062D\u0645\u064A\u0644", "Check downloads again"],
        ["#windows-portable", "\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 EXE", "Download portable EXE"]
      ];
      fixedAttributes = [
        ["#gate-website-home", "aria-label", "\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Back to the website"],
        ["#back-button", "aria-label", "\u0631\u062C\u0648\u0639", "Back"],
        ["#login-page", "aria-label", "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644", "Sign in"],
        ["#source-mode", "aria-label", "\u0637\u0631\u064A\u0642\u0629 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Subscription method"],
        ["#username", "placeholder", "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", "Username"],
        ["#username", "aria-label", "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645", "Username"],
        ["#password", "placeholder", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Password"],
        ["#password", "aria-label", "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Password"],
        ["#reveal-password", "aria-label", "\u0625\u0638\u0647\u0627\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Show password"],
        ["#server", "placeholder", "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 https://", "Server address https://"],
        ["#server", "aria-label", "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u064A\u0631\u0641\u0631", "Server address"],
        ["#playlist-url", "placeholder", "\u0631\u0627\u0628\u0637 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0648 \u0627\u0644\u0628\u062B", "Playlist or stream URL"],
        ["#playlist-url", "aria-label", "\u0631\u0627\u0628\u0637 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0648 \u0627\u0644\u0628\u062B", "Playlist or stream URL"],
        ["#mac", "aria-label", "\u0639\u0646\u0648\u0627\u0646 MAC", "MAC address"],
        ["#home-page", "aria-label", "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Home"],
        ["#home-tools", "aria-label", "\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Home tools"],
        ["#catalog-tabs", "aria-label", "\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Content sections"],
        ["#catalog-search", "placeholder", "\u0627\u0628\u062D\u062B \u0639\u0646 \u0639\u0646\u0648\u0627\u0646 \u0623\u0648 \u0645\u0645\u062B\u0644\u2026", "Search a title or actor\u2026"],
        ["#catalog-search", "aria-label", "\u0627\u0644\u0628\u062D\u062B \u0641\u064A \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Search content"],
        ["#catalog-sort", "aria-label", "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Sort content"],
        ["#catalog-filters", "aria-label", "\u0641\u0644\u0627\u062A\u0631 \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0648\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062A", "Movie and series filters"],
        ["#catalog-favorites", "aria-label", "\u0627\u0644\u0645\u0641\u0636\u0644\u0629", "Favorites"],
        ["#catalog-refresh", "aria-label", "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0627\u0626\u0645\u0629", "Refresh list"],
        ["#category-list", "aria-label", "\u0627\u0644\u062A\u0635\u0646\u064A\u0641\u0627\u062A", "Categories"],
        ["#player-page", "aria-label", "\u0645\u0634\u063A\u0644 \u0627\u0644\u0641\u064A\u062F\u064A\u0648", "Video player"],
        ["#close-player", "aria-label", "\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0645\u0634\u063A\u0644", "Close player"],
        ["#player-options", "aria-label", "\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0634\u063A\u0644", "Player options"],
        ["#receiver-close", "aria-label", "\u0625\u063A\u0644\u0627\u0642 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Close channel list"],
        ["#receiver-search", "placeholder", "\u0627\u0628\u062D\u062B \u0639\u0646 \u0642\u0646\u0627\u0629 \u0623\u0648 \u062A\u0635\u0646\u064A\u0641", "Search channels or categories"],
        ["#receiver-search", "aria-label", "\u0627\u0644\u0628\u062D\u062B \u0639\u0646 \u0642\u0646\u0627\u0629 \u0623\u0648 \u062A\u0635\u0646\u064A\u0641", "Search channels or categories"],
        ["#receiver-categories", "aria-label", "\u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Channel categories"],
        ["#receiver-channels", "aria-label", "\u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Channels"],
        ["#sheet-close", "aria-label", "\u0625\u063A\u0644\u0627\u0642", "Close"],
        ["#unlock-pin", "placeholder", "\u0631\u0645\u0632 PIN", "PIN"],
        ["#unlock-pin", "aria-label", "\u0631\u0645\u0632 PIN", "PIN"],
        [".brand-logo, #unlock-form img", "alt", "\u0634\u0639\u0627\u0631 \u0627\u0628\u0648\u0646\u0627\u0635\u0631", "abbeedo logo"]
      ];
      make = (doc, tag, cls, value) => {
        const el = doc.createElement(tag);
        if (cls) el.className = cls;
        if (value !== void 0) el.textContent = value;
        return el;
      };
    }
  });

  // tv/samsung/app/native.js
  var native_exports = {};
  __export(native_exports, {
    capabilities: () => capabilities,
    isNative: () => isNative,
    nativeFetch: () => nativeFetch,
    nativeRequest: () => nativeRequest
  });
  function nativeRequest(method, payload = {}) {
    if (!isNative()) return Promise.reject(Object.assign(new Error("\u0647\u0630\u0647 \u0627\u0644\u0648\u0638\u064A\u0641\u0629 \u062A\u062D\u062A\u0627\u062C \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0622\u064A\u0641\u0648\u0646. \u064A\u0645\u0643\u0646\u0643 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D."), { code: "NATIVE_UNAVAILABLE" }));
    if (!/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(method)) return Promise.reject(new TypeError("Invalid native method"));
    const id = String(++serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error("\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u062C\u0647\u0627\u0632."), { code: "NATIVE_TIMEOUT" }));
      }, 3e5);
      pending.set(id, { resolve, reject, timer });
      try {
        globalThis.webkit.messageHandlers.abunasser.postMessage({ id, method, payload });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }
  async function nativeFetch(input, options = {}) {
    if (!isNative()) return globalThis.fetch(input, options);
    const origin = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.ABUNASSER_NATIVE_CONFIG?.apiOrigin || "https://www.abbeedo.com";
    const raw = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, origin);
    if (url.origin !== new URL(origin).origin || url.protocol !== "https:" || url.username || url.password) throw new TypeError("Native API destination is not allowed");
    const headers = Object.fromEntries(new Headers(options.headers || (input instanceof Request ? input.headers : void 0)));
    const method = options.method || (input instanceof Request ? input.method : "GET");
    const signal = options.signal || (input instanceof Request ? input.signal : void 0);
    const body = options.body ?? (input instanceof Request && !["GET", "HEAD"].includes(method.toUpperCase()) ? await input.clone().text() : "");
    const requestId = `native-${Date.now()}-${++requestSerial}`;
    return new Promise((resolve, reject) => {
      let controller2, responded = false, ended = false, pendingACK = null, lastSequence = 0;
      const clean = () => {
        globalThis.removeEventListener("abunasser:native", event);
        signal?.removeEventListener("abort", abort);
      };
      const failure = (error) => {
        if (ended) return;
        ended = true;
        clean();
        if (responded) controller2?.error(error);
        else reject(error);
      };
      const cancel = () => {
        void nativeRequest("apiCancel", { requestId }).catch(() => {
        });
      };
      const abort = () => {
        cancel();
        failure(new DOMException("Aborted", "AbortError"));
      };
      const acknowledge = () => {
        if (pendingACK === null || ended) return;
        const sequence = pendingACK;
        pendingACK = null;
        void nativeRequest("apiAck", { requestId, sequence }).catch(failure);
      };
      const response = (data) => {
        if (responded || ended) return;
        const status = Number(data.status) || 200;
        const stream = [204, 205, 304].includes(status) || method.toUpperCase() === "HEAD" ? null : new ReadableStream({ start(value) {
          controller2 = value;
        }, pull() {
          acknowledge();
        }, cancel() {
          abort();
        } });
        responded = true;
        resolve(new Response(stream, { status, headers: data.headers || {} }));
      };
      const event = (value) => {
        const data = value.detail;
        if (data?.requestId !== requestId || ended) return;
        if (data.type === "api-response") response(data);
        else if (data.type === "api-chunk") {
          if (!responded || !controller2) {
            cancel();
            failure(new Error("Unexpected native response body"));
            return;
          }
          try {
            const sequence = Number(data.sequence);
            if (Number.isSafeInteger(sequence) && sequence > 0 && sequence !== lastSequence + 1) throw new Error("Native response sequence is invalid");
            const bytes = data.dataBase64 ? Uint8Array.from(atob(data.dataBase64.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0)) : new TextEncoder().encode(data.data || "");
            if (bytes.byteLength > 32768) throw new Error("Native response chunk is too large");
            controller2.enqueue(bytes);
            if (Number.isSafeInteger(sequence) && sequence > 0) {
              lastSequence = sequence;
              pendingACK = sequence;
              if (controller2.desiredSize > 0) acknowledge();
            }
          } catch (error) {
            cancel();
            failure(error);
          }
        } else if (data.type === "api-end") {
          if (!responded) response({ status: 200 });
          ended = true;
          clean();
          controller2?.close();
        } else if (data.type === "api-error") failure(Object.assign(new Error(data.message || "Native connection failed"), { code: data.code || "NATIVE_NETWORK" }));
      };
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      globalThis.addEventListener("abunasser:native", event);
      signal?.addEventListener("abort", abort, { once: true });
      nativeRequest("apiRequest", { url: url.href, method, headers, body, requestId, stream: true }).then((data) => {
        if (ended) return;
        if (!responded) {
          ended = true;
          clean();
          const status = Number(data.status) || 200;
          resolve(new Response([204, 205, 304].includes(status) || method.toUpperCase() === "HEAD" ? null : data.body || "", { status, headers: data.headers || {} }));
        }
      }, failure);
    });
  }
  var pending, serial, isNative, capabilities, requestSerial;
  var init_native = __esm({
    "tv/samsung/app/native.js"() {
      pending = /* @__PURE__ */ new Map();
      serial = 0;
      isNative = () => Boolean(globalThis.webkit?.messageHandlers?.abunasser);
      capabilities = Object.freeze({
        native: isNative(),
        keychain: isNative(),
        nativePlayer: isNative(),
        backgroundDownloads: isNative(),
        nativeFileImport: isNative(),
        qrCamera: isNative(),
        replayKit: isNative(),
        nativeNotifications: isNative(),
        airPlay: isNative(),
        nativePiPAutomatic: isNative(),
        programmaticPiP: false
      });
      globalThis.AbunasserBridge = Object.freeze({
        resolve(id, result, error) {
          const job = pending.get(String(id));
          if (!job) return;
          pending.delete(String(id));
          clearTimeout(job.timer);
          if (error) {
            const failure = new Error(error.message || "\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632.");
            failure.code = error.code || "NATIVE_ERROR";
            job.reject(failure);
          } else job.resolve(result);
        },
        event(detail) {
          if (detail && typeof detail === "object") globalThis.dispatchEvent(new CustomEvent("abunasser:native", { detail }));
        }
      });
      requestSerial = 0;
    }
  });

  // tv/samsung/app/storage.js
  function cryptoAPI() {
    if (!globalThis.crypto?.subtle) throw new VaultError("\u0627\u0644\u062D\u0641\u0638 \u0627\u0644\u0645\u0634\u0641\u0631 \u064A\u062D\u062A\u0627\u062C \u0627\u062A\u0635\u0627\u0644 HTTPS \u0623\u0648 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0622\u064A\u0641\u0648\u0646.", "CRYPTO_UNAVAILABLE");
    return globalThis.crypto;
  }
  function b64(bytes) {
    let result = "";
    for (let n2 = 0; n2 < bytes.length; n2 += 32768) result += String.fromCharCode(...bytes.subarray(n2, n2 + 32768));
    return btoa(result);
  }
  function unb64(value) {
    if (typeof value !== "string" || value.length > MAX_BACKUP_BYTES * 2 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new VaultError("\u0635\u064A\u063A\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u0634\u0641\u0631\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", "INVALID_BACKUP");
    return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  }
  function request(result) {
    return new Promise((resolve, reject) => {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    });
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("Storage aborted"));
      tx.onerror = () => reject(tx.error);
    });
  }
  async function openDatabase(name) {
    if (!databases.has(name)) databases.set(name, new Promise((resolve, reject) => {
      const opening = indexedDB.open(name, VERSION);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
      };
      opening.onsuccess = () => {
        opening.result.onversionchange = () => {
          opening.result.close();
          databases.delete(name);
        };
        resolve(opening.result);
      };
      opening.onerror = () => {
        databases.delete(name);
        reject(opening.error);
      };
      opening.onblocked = () => {
        databases.delete(name);
        reject(new VaultError("\u0623\u063A\u0644\u0642 \u0646\u0633\u062E\u0629 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0623\u062E\u0631\u0649 \u062B\u0645 \u062D\u0627\u0648\u0644 \u0627\u0644\u062D\u0641\u0638 \u0645\u062C\u062F\u062F\u064B\u0627.", "STORAGE_BLOCKED"));
      };
    }));
    return databases.get(name);
  }
  async function backupKey(password, salt, iterations) {
    const material = await cryptoAPI().subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return cryptoAPI().subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  function copyTVRecord(record2) {
    return { ...record2, ...record2.iv ? { iv: record2.iv.slice() } : {}, ...record2.ciphertext ? { ciphertext: record2.ciphertext.slice(0) } : {} };
  }
  var databases, memories, encoder, decoder, VERSION, MAX_VALUE_BYTES, MAX_BACKUP_BYTES, VaultError, MemoryDriver, IDBDriver, NativeDriver, Vault;
  var init_storage = __esm({
    "tv/samsung/app/storage.js"() {
      init_native();
      databases = /* @__PURE__ */ new Map();
      memories = /* @__PURE__ */ new Map();
      encoder = new TextEncoder();
      decoder = new TextDecoder();
      VERSION = 1;
      MAX_VALUE_BYTES = 32 * 1024 * 1024;
      MAX_BACKUP_BYTES = 96 * 1024 * 1024;
      VaultError = class extends Error {
        constructor(message, code = "VAULT_ERROR", cause) {
          super(message, { cause });
          this.name = "VaultError";
          this.code = code;
        }
      };
      MemoryDriver = class {
        constructor(name) {
          if (!memories.has(name)) memories.set(name, { records: /* @__PURE__ */ new Map(), key: null });
          this.data = memories.get(name);
          this.durable = false;
        }
        async get(id) {
          return this.data.records.get(id);
        }
        async set(record2) {
          this.data.records.set(record2.id, copyTVRecord(record2));
        }
        async remove(id) {
          this.data.records.delete(id);
        }
        async rows() {
          return [...this.data.records.values()].map((value) => copyTVRecord(value));
        }
        async key() {
          return this.data.key ||= cryptoAPI().subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        }
        async bulk(records, replace) {
          const next = replace ? /* @__PURE__ */ new Map() : new Map(this.data.records);
          for (const record2 of records) next.set(record2.id, copyTVRecord(record2));
          this.data.records = next;
        }
      };
      IDBDriver = class {
        constructor(db) {
          this.db = db;
          this.durable = true;
        }
        async get(id) {
          return request(this.db.transaction("records").objectStore("records").get(id));
        }
        async set(record2) {
          const tx = this.db.transaction("records", "readwrite");
          const done = transactionDone(tx);
          tx.objectStore("records").put(record2);
          await done;
        }
        async remove(id) {
          const tx = this.db.transaction("records", "readwrite");
          const done = transactionDone(tx);
          tx.objectStore("records").delete(id);
          await done;
        }
        async rows() {
          return request(this.db.transaction("records").objectStore("records").getAll());
        }
        async bulk(records, replace) {
          const tx = this.db.transaction("records", "readwrite"), done = transactionDone(tx), store = tx.objectStore("records");
          if (replace) store.clear();
          for (const record2 of records) store.put(record2);
          await done;
        }
        async key() {
          const old = await request(this.db.transaction("meta").objectStore("meta").get("master-key"));
          if (old?.key) return old.key;
          const candidate = await cryptoAPI().subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
          return new Promise((resolve, reject) => {
            const tx = this.db.transaction("meta", "readwrite"), store = tx.objectStore("meta"), read = store.get("master-key");
            let key2;
            read.onsuccess = () => {
              key2 = read.result?.key || candidate;
              if (!read.result) store.put({ id: "master-key", key: key2 });
            };
            tx.oncomplete = () => resolve(key2);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error("Key creation aborted"));
          });
        }
      };
      NativeDriver = class {
        constructor(name) {
          this.name = name;
          this.durable = true;
          this.native = true;
        }
        _parts(id) {
          const [namespace, key2] = JSON.parse(id);
          return { namespace: `${this.name}|${namespace}`, key: key2 };
        }
        async get(id) {
          const result = await nativeRequest("storageGet", this._parts(id));
          return result?.found ? { id, value: result.value } : void 0;
        }
        async set(record2) {
          await nativeRequest("storageSet", { ...this._parts(record2.id), value: record2.value });
        }
        async remove(id) {
          await nativeRequest("storageRemove", this._parts(id));
        }
        async rows() {
          const result = await nativeRequest("storageList");
          return (result.records || []).filter((row) => row.namespace.startsWith(`${this.name}|`)).map((row) => ({ id: JSON.stringify([row.namespace.slice(this.name.length + 1), row.key]), value: row.value }));
        }
        async bulk(records, replace) {
          await nativeRequest("storageCommit", { replace, namespacePrefix: `${this.name}|`, records: records.map((record2) => ({ ...this._parts(record2.id), value: record2.value })) });
        }
      };
      Vault = class _Vault {
        constructor({ name = "abunasser-apple-web", namespace = "default", memory: memory2 = false, driver = null } = {}) {
          if (typeof namespace !== "string" || !namespace || namespace.length > 256) throw new VaultError("Invalid namespace", "INVALID_KEY");
          this.name = name;
          this.namespace = namespace;
          this.durable = false;
          this.fallbackReason = null;
          this.ready = driver ? Promise.resolve(driver) : this._open(memory2);
          this.ready.then((value) => {
            this.durable = value.durable;
          }, () => {
          });
        }
        async _open(memory2) {
          if (!memory2 && isNative()) return new NativeDriver(this.name);
          cryptoAPI();
          if (!memory2 && typeof indexedDB !== "undefined") {
            try {
              return new IDBDriver(await openDatabase(this.name));
            } catch (error) {
              if (error?.code === "STORAGE_BLOCKED") throw error;
              this.fallbackReason = "STORAGE_UNAVAILABLE";
            }
          } else this.fallbackReason = memory2 ? "MEMORY_REQUESTED" : "STORAGE_UNAVAILABLE";
          return new MemoryDriver(this.name);
        }
        _id(key2) {
          if (typeof key2 !== "string" || !key2 || key2.length > 2048) throw new VaultError("Invalid storage key", "INVALID_KEY");
          return JSON.stringify([this.namespace, key2]);
        }
        scope(namespace) {
          return new _Vault({ name: this.name, namespace, driver: this.ready });
        }
        async _driver() {
          let driver = await this.ready;
          if (driver instanceof Promise) driver = await driver;
          this.durable = driver.durable;
          return driver;
        }
        async get(key2, fallback = null) {
          const id = this._id(key2), driver = await this._driver(), record2 = await driver.get(id);
          if (!record2) return fallback;
          if (driver.native) return record2.value;
          try {
            const plain = await cryptoAPI().subtle.decrypt({ name: "AES-GCM", iv: record2.iv, additionalData: encoder.encode(id) }, await driver.key(), record2.ciphertext);
            return JSON.parse(decoder.decode(plain));
          } catch (error) {
            throw new VaultError("\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629 \u0627\u0644\u0645\u0634\u0641\u0631\u0629. \u0644\u0645 \u062A\u064F\u062D\u0630\u0641 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629.", "DECRYPT_FAILED", error);
          }
        }
        async set(key2, value) {
          const id = this._id(key2), driver = await this._driver();
          let json;
          try {
            json = JSON.stringify(value);
          } catch (error) {
            throw new VaultError("\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0641\u0638 \u0647\u0630\u0647 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.", "INVALID_VALUE", error);
          }
          if (json === void 0) throw new VaultError("Cannot store undefined", "INVALID_VALUE");
          const plain = encoder.encode(json);
          if (plain.byteLength > MAX_VALUE_BYTES) throw new VaultError("\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062A\u062A\u062C\u0627\u0648\u0632 \u062D\u062F \u0627\u0644\u062D\u0641\u0638 \u0627\u0644\u0645\u062D\u0644\u064A.", "VALUE_TOO_LARGE");
          if (driver.native) {
            await driver.set({ id, value: JSON.parse(json) });
            return value;
          }
          const iv = cryptoAPI().getRandomValues(new Uint8Array(12));
          const ciphertext = await cryptoAPI().subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(id) }, await driver.key(), plain);
          await driver.set({ id, iv, ciphertext, savedAt: Date.now() });
          return value;
        }
        async remove(key2) {
          await (await this._driver()).remove(this._id(key2));
        }
        async list(prefix = "") {
          const records = await (await this._driver()).rows();
          const result = [];
          for (const row of records) {
            let id;
            try {
              id = JSON.parse(row.id);
            } catch {
              continue;
            }
            if (id[0] === this.namespace && typeof id[1] === "string" && id[1].startsWith(prefix)) result.push(id[1]);
          }
          return result.sort();
        }
        async clear({ allNamespaces = false } = {}) {
          const driver = await this._driver();
          for (const row of await driver.rows()) {
            let id;
            try {
              id = JSON.parse(row.id);
            } catch {
              continue;
            }
            if (allNamespaces || id[0] === this.namespace) await driver.remove(row.id);
          }
        }
        async exportBackup(password, { allNamespaces = true } = {}) {
          if (typeof password !== "string" || password.length < 8) throw new VaultError("\u0627\u0633\u062A\u062E\u062F\u0645 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0645\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629.", "WEAK_PASSWORD");
          const driver = await this._driver(), rows = [];
          for (const record2 of await driver.rows()) {
            const [namespace, key3] = JSON.parse(record2.id);
            if (!allNamespaces && namespace !== this.namespace) continue;
            rows.push({ namespace, key: key3, value: await this.scope(namespace).get(key3) });
          }
          const plain = encoder.encode(JSON.stringify({ schema: 1, createdAt: (/* @__PURE__ */ new Date()).toISOString(), records: rows }));
          if (plain.byteLength > MAX_BACKUP_BYTES) throw new VaultError("\u0627\u0644\u0646\u0633\u062E\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.", "VALUE_TOO_LARGE");
          if (driver.native) {
            const result = await nativeRequest("backupEncrypt", { plaintext: decoder.decode(plain), password });
            return typeof result === "string" ? result : JSON.stringify(result);
          }
          const salt = cryptoAPI().getRandomValues(new Uint8Array(16)), iv = cryptoAPI().getRandomValues(new Uint8Array(12)), iterations = 25e4;
          const key2 = await backupKey(password, salt, iterations);
          const ciphertext = await cryptoAPI().subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("ABUNASSER-BACKUP-1") }, key2, plain);
          return JSON.stringify({ format: "abunasser-encrypted-backup", version: 1, kdf: "PBKDF2-SHA256", iterations, salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext)) });
        }
        async importBackup(text2, password, { replace = false } = {}) {
          if (typeof text2 !== "string" || text2.length > MAX_BACKUP_BYTES * 2 || typeof password !== "string") throw new VaultError("\u0645\u0644\u0641 \u0627\u0644\u0646\u0633\u062E\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", "INVALID_BACKUP");
          let envelope, decoded;
          const driver = await this._driver();
          try {
            envelope = JSON.parse(text2);
            if (envelope.format !== "abunasser-encrypted-backup" || envelope.version !== 1 || envelope.kdf !== "PBKDF2-SHA256" || !Number.isInteger(envelope.iterations) || envelope.iterations < 1e5 || envelope.iterations > 1e6) throw new Error("Invalid envelope");
            const salt = unb64(envelope.salt), iv = unb64(envelope.iv);
            if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid cipher parameters");
            let plain;
            if (driver.native) {
              const result = await nativeRequest("backupDecrypt", { envelope, password });
              plain = encoder.encode(result.plaintext);
            } else {
              const key2 = await backupKey(password, salt, envelope.iterations);
              plain = await cryptoAPI().subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode("ABUNASSER-BACKUP-1") }, key2, unb64(envelope.ciphertext));
            }
            if (plain.byteLength > MAX_BACKUP_BYTES) throw new Error("Backup too large");
            decoded = JSON.parse(decoder.decode(plain));
            if (decoded.schema !== 1 || !Array.isArray(decoded.records) || decoded.records.length > 1e5) throw new Error("Invalid records");
            for (const record2 of decoded.records) {
              const scope2 = this.scope(record2.namespace);
              scope2._id(record2.key);
              if (!Object.hasOwn(record2, "value")) throw new Error("Invalid value");
              const size = encoder.encode(JSON.stringify(record2.value));
              if (size.length > MAX_VALUE_BYTES) throw new Error("Record too large");
            }
          } catch (error) {
            throw new VaultError("\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0646\u0633\u062E\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u0623\u0648 \u0627\u0644\u0645\u0644\u0641 \u062A\u0627\u0644\u0641.", "INVALID_BACKUP", error);
          }
          const encryptionKey = driver.native ? null : await driver.key(), records = [], ids = /* @__PURE__ */ new Set();
          for (const record2 of decoded.records) {
            const id = this.scope(record2.namespace)._id(record2.key);
            if (ids.has(id)) throw new VaultError("Duplicate backup record", "INVALID_BACKUP");
            ids.add(id);
            if (driver.native) {
              records.push({ id, value: record2.value });
              continue;
            }
            const iv = cryptoAPI().getRandomValues(new Uint8Array(12)), plain = encoder.encode(JSON.stringify(record2.value));
            const ciphertext = await cryptoAPI().subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(id) }, encryptionKey, plain);
            records.push({ id, iv, ciphertext, savedAt: Date.now() });
          }
          await driver.bulk(records, replace);
          return decoded.records.length;
        }
      };
    }
  });

  // tv/samsung/app/core.js?release=1.2.2
  var core_exports = {};
  __export(core_exports, {
    ACCOUNT_MODES: () => ACCOUNT_MODES,
    ApiClient: () => ApiClient,
    ApiError: () => ApiError,
    BRAND: () => BRAND,
    DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
    LIVE_FAMILIES: () => LIVE_FAMILIES,
    PROVIDER: () => PROVIDER,
    UserLibrary: () => UserLibrary,
    Vault: () => Vault,
    VaultError: () => VaultError,
    accountScope: () => accountScope,
    brandName: () => brandName2,
    capabilities: () => capabilities2,
    categoryCounts: () => categoryCounts,
    classifyLive: () => classifyLive,
    derivePIN: () => derivePIN,
    filterItems: () => filterItems,
    formatExpiry: () => formatExpiry,
    isAdult: () => isAdult,
    movieVersions: () => movieVersions,
    nativeAPIFetch: () => nativeAPIFetch,
    normalize: () => normalize,
    parseM3U: () => parseM3U,
    safeURL: () => safeURL,
    stableKey: () => stableKey,
    verifyPIN: () => verifyPIN
  });
  function brandName2(language = "ar") {
    return language === "ar" ? BRAND.name_ar : BRAND.name_en;
  }
  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").toLowerCase().trim();
  }
  function keyHash(value) {
    let h1 = 3735928559, h2 = 1103547991;
    for (let n2 = 0; n2 < value.length; n2++) {
      const code = value.charCodeAt(n2);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  function accountScope(account) {
    return keyHash([account?.mode || "provider", account?.server || PROVIDER, account?.username ?? account?.user ?? "", account?.url || account?.playlist || "", account?.mac || ""].join("|"));
  }
  function stableKey(scope2, item) {
    return keyHash(`${scope2}|${item?.kind || "live"}|${item?.id ?? item?.providerId ?? item?.url ?? ""}`);
  }
  function isAdult(item) {
    return ADULT.test(`${item?.group || ""} ${item?.genre || ""} ${item?.name || ""}`);
  }
  function safeURL(value, base) {
    if (!(value instanceof URL) && (typeof value !== "string" || !value.trim())) return null;
    try {
      const url = new URL(value, base);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }
  function classifyLive(item) {
    const name = normalize(item?.name);
    if (/mbc\s*3|spacetoon|nickelodeon|سبيستون|براعم|طيور الجنه/.test(name)) return "kids";
    if (/al.?arabiya|al.?jazeera|sky.?news|bbc.?news|العربيه|الجزيره|الميادين|الاخباريه/.test(name)) return "news";
    if (/be.?in.*sport|alkass|al.?kass|espn|eurosport|\bssc\b|الكاس/.test(name)) return "sports";
    const text2 = normalize(`${item?.group || ""} ${item?.name || ""} ${item?.genre || ""}`);
    if (/kids|children|cartoon|disney|nickelodeon|baby|spacetoon|mbc\s*3|أطفال|اطفال|كرتون|سبيستون|براعم|طيور الجنه/.test(text2)) return "kids";
    if (/news|\bcnn\b|\bbbc\b|al.?arabiya|al.?jazeera|sky.?news|اخبار|الاخباريه|العربيه|الجزيره|الميادين|الشرق/.test(text2)) return "news";
    if (/sport|be.?in|alkass|al.?kass|dazn|eurosport|espn|\bssc\b|رياضي|رياضه|الكاس|الكأس/.test(text2)) return "sports";
    if (/document|discovery|national.?geographic|nat.?geo|history|وثائق|ناشيونال|ديسكفري/.test(text2)) return "documentary";
    if (/quran|qur.an|islam|relig|sunnah|قران|قرآن|اسلام|ديني|السنه|الحرم|مكه|مكة/.test(text2)) return "religious";
    if (/music|songs|mtv|rotana.?music|موسيقي|اغاني|اغانى|طرب|روتانا كليب/.test(text2)) return "music";
    if (/movie|cinema|film|افلام|سينما|فيلم/.test(text2)) return "movies";
    if (/general|entertain|variety|\bmbc\b|\bsbc\b|rotana|روتانا|عامه|منوع|ترفيه/.test(text2)) return "general";
    return "other";
  }
  function attributes(value) {
    const result = {};
    const expression = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
    for (const match of value.matchAll(expression)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    return result;
  }
  function metaComma(line2) {
    let quote = "";
    for (let n2 = 0; n2 < line2.length; n2++) {
      if ((line2[n2] === '"' || line2[n2] === "'") && (!quote || line2[n2] === quote)) quote = quote ? "" : line2[n2];
      if (line2[n2] === "," && !quote) return n2;
    }
    return -1;
  }
  function detectM3UKind(meta, url) {
    const declared = normalize(meta["tvg-type"] || meta.type);
    if (["series", "serial", "\u0645\u0633\u0644\u0633\u0644", "\u0645\u0633\u0644\u0633\u0644\u0627\u062A"].includes(declared)) return "series";
    if (["movie", "vod", "film", "\u0641\u064A\u0644\u0645", "\u0627\u0641\u0644\u0627\u0645"].includes(declared)) return "movie";
    if (["live", "channel", "\u0642\u0646\u0627\u0629"].includes(declared)) return "live";
    const path2 = url.pathname.toLowerCase();
    if (/\/(?:series|serials)\//.test(path2)) return "series";
    if (/\/(?:movie|movies|vod)\//.test(path2)) return "movie";
    return /\.(?:mp4|mkv|avi|mov|webm|m4v)$/.test(path2) ? "movie" : "live";
  }
  function parseM3U(text2, base = globalThis.location?.href) {
    if (typeof text2 !== "string" || text2.length > 64 * 1024 * 1024) throw new Error("\u0645\u0644\u0641 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.");
    if (/#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(text2)) throw new Error("\u0647\u0630\u0627 \u0631\u0627\u0628\u0637 \u0628\u062B HLS\u061B \u0627\u062E\u062A\u0631 \xAB\u0631\u0627\u0628\u0637 \u0628\u062B \u0645\u0628\u0627\u0634\u0631\xBB \u0644\u062A\u0634\u063A\u064A\u0644\u0647.");
    const items = [], seen = /* @__PURE__ */ new Set();
    let meta = {}, name = "", group = "", headers = {}, epgURL = "";
    for (let line2 of text2.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      line2 = line2.trim();
      if (!line2) continue;
      if (/^#EXTM3U/i.test(line2)) {
        const attrs = attributes(line2);
        epgURL = attrs["x-tvg-url"] || attrs["url-tvg"] || "";
        continue;
      }
      if (/^#EXTINF:/i.test(line2)) {
        const comma = metaComma(line2);
        meta = attributes(comma < 0 ? line2 : line2.slice(0, comma));
        name = comma < 0 ? "" : line2.slice(comma + 1).trim().slice(0, 512);
        group = (meta["group-title"] || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641").slice(0, 256);
        headers = {};
        continue;
      }
      if (/^#EXTGRP:/i.test(line2)) {
        group = line2.slice(8).trim().slice(0, 256);
        continue;
      }
      if (/^#EXTVLCOPT:/i.test(line2)) {
        const [key2, ...value] = line2.slice(11).split("=");
        if (key2.toLowerCase() === "http-user-agent") headers["User-Agent"] = value.join("=").slice(0, 512);
        if (key2.toLowerCase() === "http-referrer") {
          const referrer = safeURL(value.join("="));
          if (referrer) headers.Referer = referrer.href;
        }
        continue;
      }
      if (line2.startsWith("#")) continue;
      const url = safeURL(line2, base);
      if (!url) {
        meta = {};
        name = "";
        group = "";
        headers = {};
        continue;
      }
      const kind = detectM3UKind(meta, url), unique = `${kind}|${url.href}`;
      if (!seen.has(unique)) {
        seen.add(unique);
        const year = /(?:19|20)\d{2}/.exec(meta["tvg-year"] || name)?.[0] || "";
        items.push({ id: `${kind}:m3u:${keyHash(url.href)}`, providerId: "", kind, name: name || meta["tvg-name"] || `\u0642\u0646\u0627\u0629 ${items.length + 1}`, group: group || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", url: url.href, logo: safeURL(meta["tvg-logo"], base)?.href || "", epgId: meta["tvg-id"] || "", epgURL: safeURL(epgURL, base)?.href || "", year, genre: meta["tvg-genre"] || "", language: meta["tvg-language"] || "", catchupSource: meta["catchup-source"] || "", catchupDays: clamp(meta["catchup-days"], 0, 365), preview: safeURL(meta["tvg-preview"], base)?.href || "", headers: { ...headers } });
        if (items.length >= 2e5) break;
      }
      meta = {};
      name = "";
      group = "";
      headers = {};
    }
    if (!items.length) throw new Error("\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u062D\u062A\u0648\u0649 \u0635\u0627\u0644\u062D \u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629.");
    return items;
  }
  function searchable(item) {
    let cached = textCache.get(item);
    const signature = [item.name, item.group, item.genre, item.cast, item.plot, item.language, item.year].join("\0");
    if (!cached || cached.signature !== signature) {
      cached = { signature, text: normalize(signature) };
      textCache.set(item, cached);
    }
    return cached.text;
  }
  function matchQuery(item, query) {
    if (!query) return true;
    const tokens = query.match(/-?"[^"]+"|\S+/g) || [];
    for (let token of tokens) {
      let negate = token.startsWith("-");
      if (negate) token = token.slice(1);
      token = token.replace(/^"|"$/g, "");
      const colon = token.indexOf(":"), field = colon > 0 ? token.slice(0, colon) : "", term = normalize(colon > 0 ? token.slice(colon + 1) : token);
      let found;
      if (!term) continue;
      if (field === "year") found = String(item.year || item.name || "").includes(term);
      else if (field === "genre") found = normalize(item.genre || item.group).includes(term);
      else if (field === "lang") found = normalize(item.language).includes(term);
      else if (field === "actor" || field === "cast") found = normalize(item.cast).includes(term);
      else found = searchable(item).includes(normalize(token));
      if (negate ? found : !found) return false;
    }
    return true;
  }
  function movieKey(item) {
    return normalize(item.name).replace(/(?:\b(?:4k|8k|uhd|fhd|hd|sd|hevc|h264|h265|x264|x265|1080p|2160p|720p|bluray|web.?dl|dubbed|subbed)\b|\([^)]*\))/g, " ").replace(/\s+/g, " ").trim() + "|" + (item.year || /(?:19|20)\d{2}/.exec(item.name || "")?.[0] || "");
  }
  function filterItems(items, options = {}) {
    const { scope: scope2 = "", group = "", family = "", query = "", year = "", genre = "", language = "", ratingFloor = 0, parental = false, favoritesOnly = false, watchlistOnly = false, historyOnly = false, recentOnly = false, dedupeMovies = true, dedupeChannels = true, sort = "source", order = [], now = Date.now() } = options;
    const asSet = (value) => value instanceof Set ? value : new Set(value || []), hidden = asSet(options.hidden), favorites = asSet(options.favorites), watchlist = asSet(options.watchlist), history = asSet((options.history || []).map((value) => typeof value === "string" ? value : value.key)), duplicate = /* @__PURE__ */ new Set(), result = [];
    for (const item of items || []) {
      if (!item || options.kind && item.kind !== options.kind) continue;
      let key2;
      const getKey = () => key2 ??= item.key || stableKey(scope2, item);
      if (hidden.size && (hidden.has(getKey()) || hidden.has(item.id))) continue;
      if (parental && isAdult(item) || group && group !== item.group || family && !["all", "favorites", "history"].includes(family) && family !== classifyLive(item)) continue;
      if ((favoritesOnly || family === "favorites") && !favorites.has(getKey()) || watchlistOnly && !watchlist.has(getKey()) || (historyOnly || family === "history") && !history.has(getKey())) continue;
      if (item.kind !== "live" && (year && !String(item.year || item.name || "").includes(String(year)) || genre && !normalize(`${item.genre || ""} ${item.group || ""}`).includes(normalize(genre)) || language && !normalize(item.language).includes(normalize(language)) || ratingFloor > (Number(item.rating) || 0))) continue;
      const stamp = Number(item.added || 0) * (Number(item.added || 0) > 1e11 ? 1 : 1e3);
      if (recentOnly && !(stamp > 0 && now - stamp <= 7 * 864e5 && now >= stamp)) continue;
      if (!matchQuery(item, query.trim())) continue;
      if (item.kind === "movie" && dedupeMovies || item.kind === "live" && dedupeChannels) {
        const duplicateKey = item.kind === "movie" ? movieKey(item) : item.url || item.id;
        if (duplicate.has(duplicateKey)) continue;
        duplicate.add(duplicateKey);
      }
      result.push(item);
    }
    if (order.length) {
      const ranks = new Map(order.map((key2, rank) => [key2, rank]));
      result.sort((left, right) => (ranks.get(left.id) ?? ranks.get(left.key) ?? Infinity) - (ranks.get(right.id) ?? ranks.get(right.key) ?? Infinity));
    }
    if (sort === "name" || sort === "az" || sort === 0) result.sort((left, right) => normalize(left.name).localeCompare(normalize(right.name)));
    else if (sort === "za" || sort === 1) result.sort((left, right) => normalize(right.name).localeCompare(normalize(left.name)));
    else if (sort === "recent" || sort === 2) result.sort((left, right) => Number(right.added || 0) - Number(left.added || 0));
    else if (sort === "rating") result.sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
    return result;
  }
  function movieVersions(items, selected) {
    const key2 = movieKey(selected);
    return (items || []).filter((item) => item.kind === "movie" && movieKey(item) === key2);
  }
  function categoryCounts(items, { families = false } = {}) {
    const counts = /* @__PURE__ */ new Map();
    for (const item of items || []) {
      const key2 = families ? classifyLive(item) : item.group || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641";
      counts.set(key2, (counts.get(key2) || 0) + 1);
    }
    return counts;
  }
  function formatExpiry(userInfo = {}, { locale = "ar-SA-u-ca-gregory", now = Date.now() } = {}) {
    const raw = userInfo.exp_date ?? userInfo.expires ?? userInfo.expiry;
    let end = Number(raw);
    end = Number.isFinite(end) && end > 0 ? end * (end > 1e11 ? 1 : 1e3) : typeof raw === "string" && raw.trim() && !/^\d+$/.test(raw.trim()) ? Date.parse(raw) : NaN;
    if (!Number.isFinite(end) || end <= 0) return { known: false, date: "", days: null, expired: false, text: "\u0644\u0645 \u064A\u062D\u062F\u062F \u0627\u0644\u0645\u0632\u0648\u062F \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621" };
    const days = Math.max(0, Math.ceil((end - now) / 864e5)), expired = end <= now, date = new Date(end).toLocaleDateString(locale);
    return { known: true, date, days, expired, timestamp: end, text: `\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643: ${date} \xB7 ${expired ? "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643" : `\u0627\u0644\u0645\u062A\u0628\u0642\u064A: ${days} \u064A\u0648\u0645`}` };
  }
  function abortError() {
    return new ApiError("\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0637\u0644\u0628.", { code: "ABORTED" });
  }
  function accountPayload(account) {
    const source = account || {};
    let mode = source.mode || "provider", server = source.server || PROVIDER, username = source.username ?? source.user ?? "", password = source.password || "", url = source.url || source.playlist || (["m3u", "direct", "auto"].includes(mode) ? source.server || "" : "");
    if (mode === "auto") {
      const parsed = safeURL(url || server);
      if (parsed?.searchParams.has("username") && parsed.searchParams.has("password")) {
        username ||= parsed.searchParams.get("username");
        password ||= parsed.searchParams.get("password");
        parsed.pathname = parsed.pathname.replace(/\/(?:get|player_api)\.php$/i, "");
        parsed.search = "";
        parsed.hash = "";
        server = parsed.href.replace(/\/$/, "");
        mode = "xtream";
      } else mode = username && password ? "xtream" : /\.(?:m3u8|ts|mp4|mkv|webm)(?:[?#]|$)/i.test(url) ? "direct" : "m3u";
    }
    return { mode, server, username, password, url, mac: source.mac || (mode === "stalker" ? source.user || source.username || "" : "") };
  }
  function deadline(signal, milliseconds) {
    const controller2 = new AbortController();
    let timer, timedOut = false, rejectTimeout;
    const promise = new Promise((_, reject) => {
      rejectTimeout = reject;
    });
    promise.catch(() => {
    });
    const cancel = () => {
      controller2.abort();
      rejectTimeout(abortError());
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    const reset = (duration) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller2.abort();
        rejectTimeout(new ApiError("\u062A\u0623\u062E\u0631 \u0627\u0644\u0645\u0635\u062F\u0631. \u062D\u0627\u0648\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", { code: "TIMEOUT" }));
      }, duration);
    };
    reset(milliseconds);
    return { signal: controller2.signal, race: (task) => Promise.race([task, promise]), extend: reset, get timedOut() {
      return timedOut;
    }, done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    } };
  }
  function nativeProviderFetch(url, options = {}) {
    const requestId = `provider-${Date.now()}-${++providerRequestSerial}`;
    if (options.signal?.aborted) return Promise.reject(abortError());
    const abort = () => {
      void nativeRequest("apiCancel", { requestId }).catch(() => {
      });
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    return nativeRequest("providerRequest", { url: String(url), method: options.method || "GET", headers: Object.fromEntries(new Headers(options.headers || {})), requestId, stream: false }).then((data) => {
      const status = Number(data.status);
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new ApiError("\u0631\u062F \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_RESPONSE" });
      return new Response([204, 205, 304].includes(status) ? null : String(data.body || ""), { status, headers: data.headers || {} });
    }).finally(() => options.signal?.removeEventListener("abort", abort));
  }
  function mimeForURL(address) {
    const path2 = safeURL(address)?.pathname.toLowerCase() || "";
    return path2.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : path2.endsWith(".ts") ? "video/mp2t" : path2.endsWith(".webm") ? "video/webm" : "video/mp4";
  }
  function decodeProviderText(value) {
    const text2 = String(value || "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text2) || text2.length % 4 !== 0) return text2;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(text2), (char) => char.charCodeAt(0)));
    } catch {
      return text2;
    }
  }
  function capabilities2(target = globalThis) {
    const native2 = !!target.webkit?.messageHandlers?.abunasser || !!target.AbunasserNative?.available;
    const video = target.document?.createElement?.("video");
    return { native: native2, encryptedStorage: native2 || !!target.crypto?.subtle, persistentStorage: native2 || typeof target.indexedDB !== "undefined", pip: !!target.document?.pictureInPictureEnabled || !!video?.webkitSupportsPresentationMode, airplay: native2 || !!target.WebKitPlaybackTargetAvailabilityEvent, share: !!target.navigator?.share, clipboard: !!target.navigator?.clipboard?.writeText, notifications: native2 || "Notification" in target, screenCapture: native2 || !!target.navigator?.mediaDevices?.getDisplayMedia, nativeDownloads: native2, decoderSelection: false, hls: !!video?.canPlayType?.("application/vnd.apple.mpegurl"), mediaSource: !!target.MediaSource || !!target.ManagedMediaSource };
  }
  async function derivePIN(pin, salt = null) {
    if (!/^\d{4,8}$/.test(String(pin))) throw new Error("\u0627\u0633\u062A\u062E\u062F\u0645 \u0631\u0645\u0632\u064B\u0627 \u0645\u0646 4 \u0625\u0644\u0649 8 \u0623\u0631\u0642\u0627\u0645.");
    if (isNative()) return nativeRequest("derivePIN", { pin: String(pin), ...salt ? { salt: [...salt] } : {}, iterations: 15e4 });
    salt ||= crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 15e4, hash: "SHA-256" }, material, 256);
    return { salt: [...salt], hash: [...new Uint8Array(bits)] };
  }
  async function verifyPIN(pin, record2) {
    if (!record2?.salt || !record2?.hash || !/^\d{4,8}$/.test(String(pin))) return false;
    const candidate = await derivePIN(pin, new Uint8Array(record2.salt));
    if (candidate.hash.length !== record2.hash.length) return false;
    let difference = 0;
    for (let n2 = 0; n2 < candidate.hash.length; n2++) difference |= candidate.hash[n2] ^ record2.hash[n2];
    return difference === 0;
  }
  var BRAND, PROVIDER, ACCOUNT_MODES, DEFAULT_SETTINGS, LIVE_FAMILIES, ADULT, textCache, clamp, ApiError, nativeAPIFetch, providerRequestSerial, ApiClient, UserLibrary;
  var init_core = __esm({
    "tv/samsung/app/core.js?release=1.2.2"() {
      init_storage();
      init_native();
      BRAND = Object.freeze({ name: "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", name_ar: "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", name_en: "abbeedo TV", phone: "0571514382", whatsapp: "https://wa.me/966571514382", version: "1.2.2", tagline: "\u0639\u0627\u0644\u0645\u0643 \u0645\u0646 \u0627\u0644\u062A\u0631\u0641\u064A\u0647" });
      PROVIDER = "http://maglobalxx.xyz:2052";
      ACCOUNT_MODES = Object.freeze(["provider", "xtream", "m3u", "m3u-file", "auto", "direct", "stalker"]);
      DEFAULT_SETTINGS = Object.freeze({
        language: "ar",
        accent: "#ff242d",
        theme: "dark",
        background_speed: "standard",
        reduced_motion: false,
        text_scale: 1,
        high_contrast: false,
        home_order: "series,live,movie",
        start_screen: "home",
        screensaver_mode: "off",
        screensaver_minutes: 5,
        decoder_mode: "auto",
        aspect_mode: "fit",
        buffer_mode: 0,
        seek_step_seconds: 10,
        auto_next: true,
        data_saver: false,
        auto_categories: true,
        catalog_refresh_hours: 0,
        epg_timezone: "local",
        epg_offset_minutes: 0,
        parental_enabled: false,
        privacy_mode: false,
        dedupe_movies: true,
        deduplicate_channels: true,
        notifications: false,
        remember_subscription: true,
        volume: 1,
        playback_rate: 1,
        subtitles: true,
        audio_language: "",
        subtitle_language: "",
        sleep_minutes: 0,
        skip_intro_seconds: 0
      });
      LIVE_FAMILIES = Object.freeze([
        { id: "history", ar: "\u0633\u062C\u0644 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", en: "Watching history" },
        { id: "favorites", ar: "\u0627\u0644\u0645\u0641\u0636\u0644\u0629", en: "Favorites" },
        { id: "all", ar: "\u0643\u0644 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", en: "All channels" },
        { id: "kids", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u0637\u0641\u0627\u0644", en: "Kids" },
        { id: "news", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u062E\u0628\u0627\u0631", en: "News" },
        { id: "sports", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0631\u064A\u0627\u0636\u0629", en: "Sports" },
        { id: "movies", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u0641\u0644\u0627\u0645", en: "Movies" },
        { id: "documentary", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0648\u062B\u0627\u0626\u0642\u064A\u0629", en: "Documentary" },
        { id: "general", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629 \u0648\u0627\u0644\u0645\u0646\u0648\u0639\u0629", en: "General" },
        { id: "religious", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u062F\u064A\u0646\u064A\u0629", en: "Religious" },
        { id: "music", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0645\u0648\u0633\u064A\u0642\u064A\u0629", en: "Music" },
        { id: "other", ar: "\u0628\u0642\u064A\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", en: "Other" }
      ]);
      ADULT = /(?:adult|\bxxx\b|18\+|للكبار|إباح|اباح)/i;
      textCache = /* @__PURE__ */ new WeakMap();
      clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
      ApiError = class extends Error {
        constructor(message, { code = "API_ERROR", status = 0, cause, partial = false, canDirect = false } = {}) {
          super(message, { cause });
          this.name = "ApiError";
          this.code = code;
          this.status = status;
          this.partial = partial;
          this.canDirect = canDirect;
        }
      };
      nativeAPIFetch = nativeFetch;
      providerRequestSerial = 0;
      ApiClient = class {
        constructor({ base = globalThis.ABUNASSER_CONFIG?.apiBase || (globalThis.ABUNASSER_CONFIG?.apiOrigin ? globalThis.ABUNASSER_CONFIG.apiOrigin.replace(/\/$/, "") + "/api/client" : "/api/client"), fetch: fetchImpl = null, vault: vault2 = null, timeout = 7e3, onStatus = () => {
        } } = {}) {
          this.base = base;
          this.fetch = fetchImpl || (isNative() ? nativeAPIFetch : globalThis.fetch?.bind(globalThis));
          this.vault = vault2 || new Vault({ namespace: "catalog-cache" });
          this.timeout = timeout;
          this.onStatus = onStatus;
          this.memory = /* @__PURE__ */ new Map();
          this.detailsCache = /* @__PURE__ */ new Map();
          this.lastStatus = {};
          this.timings = {};
        }
        _status(kind, value) {
          this.lastStatus[kind] = { ...this.lastStatus[kind], ...value };
          this.onStatus(kind, this.lastStatus[kind]);
        }
        async _response(payload, clock) {
          if (!this.fetch) throw new ApiError("\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.", { code: "FETCH_UNAVAILABLE" });
          let response;
          try {
            response = await clock.race(this.fetch(this.base, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, application/x-ndjson" }, body: JSON.stringify(payload), signal: clock.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }));
          } catch (error) {
            if (error instanceof ApiError) throw error;
            if (clock.signal.aborted) throw clock.timedOut ? new ApiError("\u062A\u0623\u062E\u0631 \u0627\u0644\u0645\u0635\u062F\u0631. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.", { code: "TIMEOUT" }) : abortError();
            throw new ApiError("\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0645\u0635\u062F\u0631. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643.", { code: "NETWORK", cause: error });
          }
          if (!response.ok) {
            let data = {};
            try {
              data = await clock.race(response.json());
            } catch {
            }
            if (data.code === "HOST_NOT_ALLOWED" && data.canDirect) return this._directResponse(payload, clock);
            throw new ApiError(data.error || data.message || `\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0637\u0644\u0628 (HTTP ${response.status}).`, { status: response.status, code: data.code || `HTTP_${response.status}`, canDirect: !!data.canDirect });
          }
          return response;
        }
        async request(op, account, extra = {}, { signal, timeout = this.timeout } = {}) {
          if (signal?.aborted) throw abortError();
          const clock = deadline(signal, timeout);
          try {
            const response = await this._response({ op, account: accountPayload(account), ...extra }, clock);
            return await clock.race(response.json());
          } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE", cause: error });
          } finally {
            clock.done();
          }
        }
        async _directResponse(payload, clock) {
          const account = payload.account;
          const download = async (address, text2 = false, headers = {}) => {
            const url = safeURL(address);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError("\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u063A\u064A\u0631 \u0645\u0647\u064A\u0623 \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639. \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u064A\u062D\u062A\u0627\u062C HTTPS \u0648\u062F\u0639\u0645 CORS \u0645\u0646 \u0627\u0644\u0645\u0632\u0648\u062F.", { code: "DIRECT_HTTPS_REQUIRED", canDirect: true });
            const directFetch = isNative() ? nativeProviderFetch : this.fetch;
            let response;
            try {
              response = await clock.race(directFetch(url.href, { signal: clock.signal, headers, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" }));
            } catch (error) {
              if (error instanceof ApiError) throw error;
              throw new ApiError(isNative() ? "\u062A\u0639\u0630\u0631 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0628\u0627\u0644\u0645\u0632\u0648\u062F. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643." : "\u0644\u0645 \u064A\u0633\u0645\u062D \u0627\u0644\u0645\u0632\u0648\u062F \u0628\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0627\u0644\u0645\u0628\u0627\u0634\u0631. \u064A\u0644\u0632\u0645 \u062A\u0641\u0639\u064A\u0644 CORS \u0623\u0648 \u062A\u0647\u064A\u0626\u0629 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0632\u0648\u062F \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639.", { code: isNative() ? "DIRECT_NETWORK" : "DIRECT_CORS", cause: error });
            }
            if (!response.ok) throw new ApiError(`\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 (HTTP ${response.status}).`, { code: `HTTP_${response.status}`, status: response.status });
            return clock.race(text2 ? response.text() : response.json());
          };
          const respond = (data) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
          const directSource = (address) => {
            const url = safeURL(address);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError("\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0635\u062F\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u064A\u062D\u062A\u0627\u062C HTTPS \u0623\u0648 \u0648\u0633\u064A\u0637\u064B\u0627 \u0645\u0647\u064A\u0623.", { code: "DIRECT_HTTPS_REQUIRED" });
            return { url: url.href, sourceUrl: url.href, mime: mimeForURL(url.href), alternatives: [], nativePreferred: isNative() };
          };
          if (account.mode === "stalker") {
            if (!isNative()) throw new ApiError("\u064A\u062D\u062A\u0627\u062C \u0627\u0634\u062A\u0631\u0627\u0643 Stalker \u0625\u0644\u0649 \u062A\u0647\u064A\u0626\u0629 \u0639\u0646\u0648\u0627\u0646\u0647 \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639\u061B \u0644\u0627 \u064A\u062A\u064A\u062D \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0631\u0624\u0648\u0633 MAC \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0645\u0628\u0627\u0634\u0631\u0629.", { code: "HOST_NOT_ALLOWED", canDirect: false });
            if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(account.mac)) throw new ApiError("\u0639\u0646\u0648\u0627\u0646 MAC \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_MAC" });
            const portal = safeURL(account.server);
            if (!portal) throw new ApiError("\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_URL" });
            portal.pathname = portal.pathname.replace(/\/server\/load\.php$/, "").replace(/\/c\/?$/, "").replace(/\/+$/, "") + "/server/load.php";
            portal.search = "";
            portal.hash = "";
            const headers = { "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) MAG250/0.2.18 Firmware/0.2.18", "X-User-Agent": "Model: MAG250; Link: Ethernet", Cookie: `mac=${account.mac}; stb_lang=en; timezone=GMT`, Referer: portal.origin + portal.pathname.replace("/server/load.php", "/c/") };
            const call = async (token2, type, action, extra = {}) => {
              const address = new URL(portal);
              for (const [key2, value] of Object.entries({ type, action, ...extra, JsHttpRequest: "1-xml" })) address.searchParams.set(key2, String(value));
              const data = await download(address.href, false, token2 ? { ...headers, Authorization: `Bearer ${token2}` } : headers);
              return data?.js && typeof data.js === "object" ? data.js : data;
            };
            const handshake = await call("", "stb", "handshake"), token = typeof handshake?.token === "string" ? handshake.token : "";
            if (!token || token.length > 4e3) throw new ApiError("\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0644\u0645 \u062A\u0639\u062F \u0631\u0645\u0632 \u062C\u0644\u0633\u0629 \u0635\u0627\u0644\u062D\u064B\u0627.", { code: "STALKER_TOKEN" });
            if (payload.op === "auth") {
              await call(token, "stb", "get_profile");
              return respond({ userInfo: { auth: 1, status: "Active" } });
            }
            if (payload.op === "catalog") {
              if (payload.kind !== "live") throw new ApiError("\u0627\u0644\u0645\u062A\u0627\u062D \u0644\u0647\u0630\u0647 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0647\u0646\u0627 \u0647\u0648 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629.", { code: "STALKER_KIND" });
              const data = await call(token, "itv", "get_all_channels"), rows = Array.isArray(data?.data) ? data.data : data?.data?.data;
              if (!Array.isArray(rows)) throw new ApiError("\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0644\u0645 \u062A\u0639\u062F \u0642\u0627\u0626\u0645\u0629 \u0642\u0646\u0648\u0627\u062A \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
              const seen = /* @__PURE__ */ new Set(), items = [];
              for (const [n2, row] of rows.slice(0, 2e5).entries()) {
                const id = String(row.id || row.ch_id || n2);
                if (seen.has(id)) continue;
                seen.add(id);
                items.push({ id: `live:${id}`, providerId: id, kind: "live", name: String(row.name || row.title || `\u0642\u0646\u0627\u0629 ${n2 + 1}`).slice(0, 512), group: String(row.category_name || row.tv_genre_title || row.genre || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641").slice(0, 512), logo: String(row.logo || row.icon || ""), url: "", command: String(row.cmd || row.url || id).slice(0, 8192) });
              }
              return respond({ items, categories: [], partial: rows.length > 2e5 });
            }
            if (payload.op === "resolve") {
              const command = String(payload.item?.command || "");
              if (!command || command.length > 8192) throw new ApiError("\u0623\u0639\u062F \u0641\u062A\u062D \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0644\u062A\u062C\u062F\u064A\u062F \u0631\u0627\u0628\u0637\u0647\u0627.", { code: "STALKER_COMMAND" });
              const result = await call(token, "itv", "create_link", { cmd: command, series: "0" }), raw = String(result.cmd || result.url || result.data?.cmd || ""), found = /https?:\/\/[^\s"'<>]+/i.exec(raw)?.[0]?.split("|")[0]?.replace(/[,;]+$/, "");
              const source = directSource(found);
              return respond({ ...source, headers });
            }
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          if (account.mode === "direct") {
            if (payload.op === "resolve") return respond(directSource(payload.item?.url || account.url));
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          if (["m3u", "m3u-file"].includes(account.mode) || account.mode === "auto" && account.url) {
            if (payload.op === "auth") {
              await download(account.url, true);
              return respond({ userInfo: { status: "Active", local: false } });
            }
            if (payload.op === "catalog") return respond({ items: parseM3U(await download(account.url, true), account.url).filter((item) => item.kind === payload.kind), categories: [] });
            if (payload.op === "resolve") return respond(directSource(payload.item?.url));
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          const server = safeURL(account.server);
          if (!server || !isNative() && server.protocol !== "https:") throw new ApiError("\u0623\u0636\u0641 \u0639\u0646\u0648\u0627\u0646 HTTPS \u0623\u0648 \u0647\u064A\u0626 \u0647\u0630\u0627 \u0627\u0644\u0645\u0632\u0648\u062F \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639.", { code: "DIRECT_HTTPS_REQUIRED", canDirect: true });
          const endpoint = (action = "", extra = {}) => {
            const url = new URL(server);
            url.pathname = url.pathname.replace(/\/$/, "") + "/player_api.php";
            url.search = "";
            url.searchParams.set("username", account.username);
            url.searchParams.set("password", account.password);
            if (action) url.searchParams.set("action", action);
            for (const [key2, value] of Object.entries(extra)) url.searchParams.set(key2, value);
            return url;
          };
          const stream = (kind, id, extension) => {
            const url = new URL(server);
            url.pathname = url.pathname.replace(/\/$/, "") + "/" + [kind === "episode" ? "series" : kind, account.username, account.password, `${id}.${extension}`].map(encodeURIComponent).join("/");
            url.search = "";
            url.hash = "";
            return url.href;
          };
          if (payload.op === "auth") {
            const data = await download(endpoint());
            if (String(data.user_info?.auth) !== "1" || data.user_info.status && !/^active$/i.test(data.user_info.status)) throw new ApiError("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u0623\u0648 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u063A\u064A\u0631 \u0646\u0634\u0637.", { code: "ACCOUNT_REJECTED", status: 401 });
            return respond({ userInfo: data.user_info, serverInfo: data.server_info || {} });
          }
          if (payload.op === "catalog") {
            const kind = payload.kind, name = kind === "movie" ? "vod" : kind, raw = await download(endpoint(`get_${name === "series" ? "series" : name + "_streams"}`));
            if (!Array.isArray(raw)) throw new ApiError("\u0635\u064A\u063A\u0629 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0632\u0648\u062F \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
            let categories = [];
            try {
              const value = await download(endpoint(`get_${name}_categories`));
              if (Array.isArray(value)) categories = value;
            } catch (error) {
              if (clock.signal.aborted) throw error;
            }
            const names = new Map(categories.map((category) => [String(category.category_id), category.category_name]));
            const items = raw.filter((row) => row[kind === "series" ? "series_id" : "stream_id"] != null).slice(0, 2e5).map((row) => {
              const id = String(row[kind === "series" ? "series_id" : "stream_id"]), extension = kind === "live" ? ["ts", "m3u8"].includes(String(row.container_extension).toLowerCase()) ? String(row.container_extension).toLowerCase() : "m3u8" : row.container_extension || "mp4";
              return { id: `${kind}:${id}`, providerId: id, kind, name: row.name || "\u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646", categoryId: String(row.category_id || ""), group: names.get(String(row.category_id)) || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", logo: row.stream_icon || row.cover || "", url: kind === "series" ? "" : stream(kind, id, extension), extension, year: row.year || row.releaseDate?.slice(0, 4) || "", genre: row.genre || "", language: row.language || "", rating: row.rating || (Number(row.rating_5based) * 2 || ""), added: row.added || row.last_modified || "", plot: row.plot || "", cast: row.cast || "" };
            });
            return respond({ items, categories });
          }
          if (payload.op === "details") {
            const series = payload.kind === "series", data = await download(endpoint(series ? "get_series_info" : "get_vod_info", { [series ? "series_id" : "vod_id"]: payload.id }));
            return respond({ info: { ...payload.item || {}, ...data.movie_data || {}, ...data.info || {} }, episodes: data.episodes || {} });
          }
          if (payload.op === "epg") {
            const data = await download(endpoint("get_short_epg", { stream_id: payload.id, limit: 50 }));
            return respond({ programs: (data.epg_listings || []).map((program) => ({ ...program, title: decodeProviderText(program.title), description: decodeProviderText(program.description) })) });
          }
          if (payload.op === "resolve") {
            const item = payload.item || {}, kind = payload.kind === "episode" ? "series" : payload.kind, extension = kind === "live" ? item.extension === "ts" || /\.ts(?:\?|$)/i.test(item.url || "") ? "ts" : "m3u8" : item.extension || item.container_extension || "mp4";
            const generated = ["provider", "xtream", "auto"].includes(account.mode) && /^(?:live|movie|series)$/.test(kind) && /^\d+$/.test(String(payload.id));
            const source = generated ? stream(kind, payload.id, extension) : item.url, url = safeURL(source);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError("\u0631\u0627\u0628\u0637 \u0627\u0644\u0648\u0633\u0627\u0626\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u064A\u062D\u062A\u0627\u062C HTTPS.", { code: "DIRECT_HTTPS_REQUIRED" });
            return respond({ url: url.href, sourceUrl: url.href, mime: mimeForURL(url.href), nativePreferred: isNative(), alternatives: generated && kind === "live" ? [stream(kind, payload.id, extension === "ts" ? "m3u8" : "ts")].map((address) => ({ url: address, sourceUrl: address, mime: mimeForURL(address) })) : [] });
          }
          throw new ApiError("\u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.", { code: "INVALID_OPERATION" });
        }
        async authenticate(account, options = {}) {
          if (["demo", "m3u-file", "direct"].includes(account?.mode)) return { userInfo: { status: "Active", local: true } };
          return this.request("auth", account, {}, options);
        }
        async catalog(account, kind, { signal, onBatch = () => {
        }, force = false, maxAge = 6 * 36e5 } = {}) {
          if (signal?.aborted) throw abortError();
          if (!["live", "movie", "series"].includes(kind)) throw new ApiError("\u0642\u0633\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_KIND" });
          if (account?.mode === "m3u-file") {
            const rows = (account.items || []).filter((item) => item.kind === kind);
            onBatch(rows, { kind, cached: true, partial: false });
            return rows;
          }
          if (account?.mode === "direct") {
            const source = safeURL(account.url);
            if (!source) throw new ApiError("\u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_URL" });
            const rows = kind === "live" ? [{ id: "live:direct", providerId: "direct", kind: "live", name: account.name || "\u0628\u062B \u0645\u0628\u0627\u0634\u0631", group: "\u0631\u0648\u0627\u0628\u0637 \u0645\u0628\u0627\u0634\u0631\u0629", url: source.href }] : [];
            onBatch(rows, { kind, cached: true, partial: false });
            return rows;
          }
          const began = performance.now(), scope2 = accountScope(account), key2 = `${scope2}:${kind}`, memory2 = this.memory.get(key2), first = (rows) => onBatch(rows.slice(0, 128), { kind, cached: true, partial: true });
          this._status(kind, { loading: true, partial: false, error: null });
          if (!force && memory2 && Date.now() - memory2.savedAt < maxAge) {
            onBatch(memory2.items, { kind, cached: true, partial: false });
            this._status(kind, { loading: false, cached: true, count: memory2.items.length });
            return memory2.items;
          }
          let preview, cached;
          try {
            preview = await this.vault.get(`preview:${key2}`);
            if (preview?.items?.length) first(preview.items);
          } catch (error) {
            this._status(kind, { storageError: error.code || "STORAGE_ERROR" });
          }
          if (!force) {
            try {
              cached = await this.vault.get(`full:${key2}`);
              if (Array.isArray(cached?.items) && cached.complete && Date.now() - cached.savedAt < maxAge) {
                this.memory.set(key2, cached);
                onBatch(cached.items, { kind, cached: true, partial: false });
                this._status(kind, { loading: false, cached: true, count: cached.items.length });
                return cached.items;
              }
            } catch (error) {
              this._status(kind, { storageError: error.code || "STORAGE_ERROR" });
            }
          }
          if (signal?.aborted) throw abortError();
          const clock = deadline(signal, this.timeout), collected = [];
          let firstReceived = false, lastPublishedAt = 0, categories = null;
          const publish = (rows, partial) => {
            if (!Array.isArray(rows)) return;
            if (rows.length + collected.length > 2e5) throw new ApiError("\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u062A\u062A\u062C\u0627\u0648\u0632 \u062D\u062F \u0627\u0644\u0639\u0646\u0627\u0635\u0631.", { code: "CATALOG_TOO_LARGE" });
            for (const item of rows) collected.push(item);
            if (rows.length && !firstReceived) {
              firstReceived = true;
              clock.extend(9e4);
              this.timings[kind] = { firstMs: Math.round(performance.now() - began), rows: collected.length };
              void this.vault.set(`preview:${key2}`, { items: collected.slice(0, 128), savedAt: Date.now(), complete: false }).catch(() => {
              });
            }
            if (rows.length && (lastPublishedAt === 0 || performance.now() - lastPublishedAt >= 250)) {
              lastPublishedAt = performance.now();
              onBatch(collected.slice(), { kind, cached: false, partial });
            }
          };
          try {
            const response = await this._response({ op: "catalog", account: accountPayload(account), kind }, clock);
            if (/application\/(?:x-ndjson|ndjson)/i.test(response.headers.get("content-type") || "") && response.body?.getReader) {
              const reader = response.body.getReader(), decoder3 = new TextDecoder();
              let pending2 = "", bytes = 0, done = false;
              const line2 = (text2) => {
                if (!text2.trim()) return;
                let data;
                try {
                  data = JSON.parse(text2);
                } catch {
                  throw new ApiError("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.", { code: "INVALID_RESPONSE" });
                }
                if (data.error) throw new ApiError(data.error, { code: data.code || "PROVIDER_ERROR" });
                if (data.categories) categories = data.categories;
                if (Array.isArray(data.items)) publish(data.items, !data.done);
                if (data.done) done = true;
              };
              try {
                for (; ; ) {
                  const chunk = await clock.race(reader.read());
                  if (chunk.done) break;
                  bytes += chunk.value.length;
                  if (bytes > 64 * 1024 * 1024) throw new ApiError("\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.", { code: "CATALOG_TOO_LARGE" });
                  pending2 += decoder3.decode(chunk.value, { stream: true });
                  let split;
                  while ((split = pending2.indexOf("\n")) >= 0) {
                    line2(pending2.slice(0, split));
                    pending2 = pending2.slice(split + 1);
                  }
                  if (pending2.length > 16 * 1024 * 1024) throw new ApiError("\u062F\u0641\u0639\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F.", { code: "CATALOG_TOO_LARGE" });
                }
                pending2 += decoder3.decode();
                if (pending2.trim()) line2(pending2);
                if (!done) throw new ApiError("\u0627\u0646\u0642\u0637\u0639 \u0627\u0644\u0645\u0635\u062F\u0631 \u0642\u0628\u0644 \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", { code: "INCOMPLETE_CATALOG" });
              } finally {
                if (!done) void reader.cancel().catch(() => {
                });
                reader.releaseLock();
              }
            } else {
              const data = await clock.race(response.json());
              const rows = Array.isArray(data) ? data : data.items;
              if (!Array.isArray(rows)) throw new ApiError("\u0635\u064A\u063A\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
              publish(rows, !!data.partial);
              if (data.partial) throw new ApiError("\u0648\u0635\u0644 \u062C\u0632\u0621 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0641\u0642\u0637. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0644\u0625\u0643\u0645\u0627\u0644\u0647\u0627.", { code: "INCOMPLETE_CATALOG" });
            }
            if (categories) {
              const names = new Map((Array.isArray(categories) ? categories : Object.entries(categories).map(([id, name]) => ({ category_id: id, category_name: name }))).map((category) => [String(category.category_id ?? category.id), category.category_name ?? category.name]));
              for (const item of collected) if (names.has(String(item.categoryId))) item.group = names.get(String(item.categoryId));
            }
            const entry = { items: collected, complete: true, savedAt: Date.now() };
            this.memory.set(key2, entry);
            this.timings[kind] = { ...this.timings[kind], totalMs: Math.round(performance.now() - began), rows: collected.length, state: "ready" };
            this._status(kind, { loading: false, partial: false, cached: false, count: collected.length });
            onBatch(collected, { kind, cached: false, partial: false });
            void this.vault.set(`full:${key2}`, entry).catch((error) => this._status(kind, { storageError: error.code || "STORAGE_ERROR" }));
            return collected;
          } catch (error) {
            const failure = error instanceof ApiError ? error : new ApiError("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", { code: "NETWORK", cause: error });
            this.timings[kind] = { ...this.timings[kind], totalMs: Math.round(performance.now() - began), state: failure.code };
            this._status(kind, { loading: false, partial: true, error: failure.message, code: failure.code });
            if (failure.code === "ABORTED" || signal?.aborted) throw abortError();
            const available = collected.length ? collected : cached?.items || preview?.items || memory2?.items;
            if (available?.length) {
              onBatch(available, { kind, cached: !collected.length, partial: true, error: failure.message });
              return available;
            }
            throw failure;
          } finally {
            clock.done();
          }
        }
        async details(account, item, options = {}) {
          if (options.signal?.aborted) throw abortError();
          if (["m3u-file", "m3u", "direct"].includes(account?.mode)) return { info: { ...item }, episodes: {} };
          const key2 = `${accountScope(account)}:${item.kind}:${item.providerId || item.id || item.url}`, cached = this.detailsCache.get(key2);
          if (!options.force && cached && Date.now() - cached.savedAt < 12 * 36e5) {
            this.detailsCache.delete(key2);
            this.detailsCache.set(key2, cached);
            return cached.data;
          }
          const data = await this.request("details", account, { kind: item.kind, id: item.providerId || String(item.id || "").replace(/^[^:]+:/, ""), item }, options);
          if (item.kind === "series") {
            for (const [oldKey, entry] of this.detailsCache) if (entry.kind === "series" && oldKey !== key2) this.detailsCache.delete(oldKey);
          }
          this.detailsCache.set(key2, { kind: item.kind, data, savedAt: Date.now() });
          while (this.detailsCache.size > 24) this.detailsCache.delete(this.detailsCache.keys().next().value);
          return data;
        }
        async epg(account, item, options = {}) {
          const data = await this.request("epg", account, { kind: "live", id: item.providerId || String(item.id || "").replace(/^live:/, ""), item }, options);
          return data.programs || data.epg_listings || [];
        }
        async resolve(account, item, options = {}) {
          if (account?.mode === "m3u-file") account = { mode: "direct", url: item.url };
          const data = await this.request("resolve", account, { kind: item.kind, id: item.providerId || String(item.id || "").replace(/^[^:]+:/, ""), item }, options);
          const base = safeURL(this.base, globalThis.location?.href)?.origin || globalThis.ABUNASSER_CONFIG?.apiOrigin;
          const address = (value) => typeof value === "string" && value.startsWith("/") && base ? new URL(value, base).href : value;
          return { ...data, url: address(data.url), alternatives: (data.alternatives || []).map((value) => typeof value === "string" ? address(value) : { ...value, url: address(value.url) }) };
        }
        async clearCatalogs(account) {
          const scope2 = accountScope(account);
          for (const kind of ["live", "movie", "series"]) {
            this.memory.delete(`${scope2}:${kind}`);
            await this.vault.remove(`preview:${scope2}:${kind}`);
            await this.vault.remove(`full:${scope2}:${kind}`);
          }
        }
      };
      UserLibrary = class {
        constructor({ vault: vault2 = new Vault(), account = {}, profile = "Default" } = {}) {
          this.vault = vault2.scope(`library:${accountScope(account)}:${keyHash(profile)}`);
          this.scope = accountScope(account);
          this.data = { favorites: [], hidden: [], watchlist: [], history: [], progress: {}, channelOrder: [] };
          this.ready = this.vault.get("library", this.data).then((value) => {
            this.data = { ...this.data, ...value };
            return this;
          });
        }
        async save() {
          await this.ready;
          return this.vault.set("library", this.data);
        }
        key(item) {
          return stableKey(this.scope, item);
        }
        async toggle(collection2, item) {
          await this.ready;
          if (!["favorites", "hidden", "watchlist"].includes(collection2)) throw new Error("Invalid collection");
          const key2 = this.key(item), values = new Set(this.data[collection2]);
          values.has(key2) ? values.delete(key2) : values.add(key2);
          this.data[collection2] = [...values];
          await this.save();
          return values.has(key2);
        }
        async record(item, { position = 0, duration = 0, privacy = false } = {}) {
          await this.ready;
          if (privacy) return;
          const key2 = this.key(item);
          this.data.history = [{ key: key2, item: { id: item.id, kind: item.kind, name: item.name, group: item.group, logo: item.logo }, at: Date.now() }, ...this.data.history.filter((value) => value.key !== key2)].slice(0, 200);
          if (duration > 0 && position >= 0 && item.kind !== "live") this.data.progress[key2] = { position, duration, at: Date.now() };
          await this.save();
        }
        async clearHistory() {
          await this.ready;
          this.data.history = [];
          this.data.progress = {};
          await this.save();
        }
        async reorder(ids) {
          await this.ready;
          this.data.channelOrder = [...new Set(ids)].slice(0, 2e5);
          await this.save();
        }
      };
    }
  });

  // tv/samsung/app/desktop-updates.js?site=2.1
  function bindDesktopUpdates(open) {
    const bridge = globalThis.abunasserDesktop;
    if (connected || !bridge?.nativeUpdater || typeof bridge.onUpdateStatus !== "function") return;
    connected = true;
    bridge.onUpdateStatus((state2) => {
      if (!state2 || typeof state2.status !== "string") return;
      globalThis.dispatchEvent(new CustomEvent(EVENT, { detail: state2 }));
      if (state2.open === true) Promise.resolve(open()).catch(() => {
      });
    });
  }
  function openDesktopUpdates({ sheet: sheet2, node: node2, btn: btn2, actions: actions2, x: x2, toast: toast2 }) {
    const bridge = globalThis.abunasserDesktop;
    if (!bridge?.nativeUpdater) return false;
    disposePanel?.();
    const box2 = node2("div", "desktop-updater");
    let latest = null, busy = false;
    const bytes = (value) => {
      const n2 = Math.max(0, Number(value) || 0);
      return (n2 / 1048576).toFixed(1) + " MB";
    };
    const invoke = async (method) => {
      if (busy) return;
      busy = true;
      try {
        const value = await bridge[method]();
        if (value) draw(value);
      } catch {
        box2.replaceChildren(node2("p", "inline-error", x2("\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "The update could not finish. Try again.")));
      } finally {
        busy = false;
      }
    };
    function draw(state2) {
      if (!state2 || !box2.isConnected) return;
      latest = state2;
      box2.replaceChildren();
      box2.append(node2("p", "", x2("\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u062B\u0628\u062A: ", "Installed version: ") + (state2.installedVersion || bridge.version)));
      if (state2.version) box2.append(node2("p", "", x2("\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u062A\u0627\u062D: ", "Available version: ") + state2.version));
      const messages2 = {
        idle: x2("\u064A\u0645\u0643\u0646\u0643 \u0641\u062D\u0635 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0622\u0646.", "You can check for updates now."),
        checking: x2("\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u2026", "Checking for updates\u2026"),
        available: x2("\u0627\u0644\u062A\u062D\u062F\u064A\u062B \u062C\u0627\u0647\u0632 \u0644\u0644\u062A\u0646\u0632\u064A\u0644 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "The update can be downloaded inside the app."),
        current: x2("\u062A\u0633\u062A\u062E\u062F\u0645 \u0623\u062D\u062F\u062B \u0625\u0635\u062F\u0627\u0631 \u0645\u0646\u0634\u0648\u0631.", "You are using the latest published release."),
        unavailable: x2("\u0644\u0627 \u064A\u0648\u062C\u062F \u0625\u0635\u062F\u0627\u0631 \u0645\u0646\u0634\u0648\u0631 \u0645\u062A\u0627\u062D \u0627\u0644\u0622\u0646. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0644\u0627\u062D\u0642\u064B\u0627.", "No published release is available right now. Try again later."),
        downloading: x2("\u062C\u0627\u0631\u064D \u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0648\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0633\u0644\u0627\u0645\u062A\u0647\u2026", "Downloading and verifying the update\u2026"),
        cancelled: x2("\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u062A\u0646\u0632\u064A\u0644. \u064A\u0645\u0643\u0646\u0643 \u0628\u062F\u0621 \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.", "Download cancelled. You can start it again."),
        ready: x2("\u0627\u0643\u062A\u0645\u0644 \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0648\u0627\u0644\u062A\u062D\u0642\u0642. \u0627\u0636\u063A\u0637 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B.", "Download verified. Choose Install to finish updating."),
        installing: x2("\u062C\u0627\u0631\u064D \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u062B\u0628\u062A. \u0623\u0643\u0645\u0644 \u0627\u0644\u062E\u0637\u0648\u0627\u062A \u0644\u0625\u0639\u0627\u062F\u0629 \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "Opening setup. Complete it to reopen the app."),
        error: x2("\u062A\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0628\u0623\u0645\u0627\u0646. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "The update could not be completed safely. Try again.")
      };
      box2.append(node2("p", state2.status === "error" ? "inline-error" : "", messages2[state2.status] || messages2.idle));
      if (state2.status === "downloading") {
        const progress = node2("progress");
        progress.max = 1;
        progress.value = Math.min(1, Math.max(0, Number(state2.progress) || 0));
        progress.setAttribute("aria-label", x2("\u062A\u0642\u062F\u0645 \u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", "Update download progress"));
        box2.append(progress, node2("p", "muted", bytes(state2.received) + " / " + bytes(state2.total)), btn2(x2("\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u0646\u0632\u064A\u0644", "Cancel download"), () => invoke("cancelUpdate"), "close"));
      } else if (state2.status === "ready") {
        box2.append(btn2(x2("\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0622\u0646", "Install update now"), () => invoke("installUpdate"), "update", "primary"));
      } else if (["available", "cancelled"].includes(state2.status)) {
        box2.append(btn2(x2("\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", "Download update"), () => invoke("downloadUpdate"), "download", "primary"));
      } else if (!["checking", "installing"].includes(state2.status)) {
        box2.append(btn2(x2("\u0641\u062D\u0635 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", "Check for update"), () => invoke("checkForUpdates"), "refresh"));
      }
    }
    const update = (event) => draw(event.detail);
    globalThis.addEventListener(EVENT, update);
    disposePanel = () => globalThis.removeEventListener(EVENT, update);
    sheet2(x2("\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "App update"), box2);
    void bridge.getUpdateStatus().then((state2) => {
      draw(state2);
      if (!["downloading", "ready", "installing", "checking"].includes(state2?.status)) void invoke("checkForUpdates");
    }).catch(() => void invoke("checkForUpdates"));
    return true;
  }
  var EVENT, connected, disposePanel;
  var init_desktop_updates = __esm({
    "tv/samsung/app/desktop-updates.js?site=2.1"() {
      EVENT = "abbeedo:desktop-update";
      connected = false;
      disposePanel = null;
    }
  });

  // tv/samsung/app/core.js?release=1.2
  function normalize2(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").toLowerCase().trim();
  }
  function keyHash2(value) {
    let h1 = 3735928559, h2 = 1103547991;
    for (let n2 = 0; n2 < value.length; n2++) {
      const code = value.charCodeAt(n2);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
  }
  function accountScope2(account) {
    return keyHash2([account?.mode || "provider", account?.server || PROVIDER2, account?.username ?? account?.user ?? "", account?.url || account?.playlist || "", account?.mac || ""].join("|"));
  }
  function stableKey2(scope2, item) {
    return keyHash2(`${scope2}|${item?.kind || "live"}|${item?.id ?? item?.providerId ?? item?.url ?? ""}`);
  }
  function isAdult2(item) {
    return ADULT2.test(`${item?.group || ""} ${item?.genre || ""} ${item?.name || ""}`);
  }
  function safeURL2(value, base) {
    if (!(value instanceof URL) && (typeof value !== "string" || !value.trim())) return null;
    try {
      const url = new URL(value, base);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }
  function classifyLive2(item) {
    const name = normalize2(item?.name);
    if (/mbc\s*3|spacetoon|nickelodeon|سبيستون|براعم|طيور الجنه/.test(name)) return "kids";
    if (/al.?arabiya|al.?jazeera|sky.?news|bbc.?news|العربيه|الجزيره|الميادين|الاخباريه/.test(name)) return "news";
    if (/be.?in.*sport|alkass|al.?kass|espn|eurosport|\bssc\b|الكاس/.test(name)) return "sports";
    const text2 = normalize2(`${item?.group || ""} ${item?.name || ""} ${item?.genre || ""}`);
    if (/kids|children|cartoon|disney|nickelodeon|baby|spacetoon|mbc\s*3|أطفال|اطفال|كرتون|سبيستون|براعم|طيور الجنه/.test(text2)) return "kids";
    if (/news|\bcnn\b|\bbbc\b|al.?arabiya|al.?jazeera|sky.?news|اخبار|الاخباريه|العربيه|الجزيره|الميادين|الشرق/.test(text2)) return "news";
    if (/sport|be.?in|alkass|al.?kass|dazn|eurosport|espn|\bssc\b|رياضي|رياضه|الكاس|الكأس/.test(text2)) return "sports";
    if (/document|discovery|national.?geographic|nat.?geo|history|وثائق|ناشيونال|ديسكفري/.test(text2)) return "documentary";
    if (/quran|qur.an|islam|relig|sunnah|قران|قرآن|اسلام|ديني|السنه|الحرم|مكه|مكة/.test(text2)) return "religious";
    if (/music|songs|mtv|rotana.?music|موسيقي|اغاني|اغانى|طرب|روتانا كليب/.test(text2)) return "music";
    if (/movie|cinema|film|افلام|سينما|فيلم/.test(text2)) return "movies";
    if (/general|entertain|variety|\bmbc\b|\bsbc\b|rotana|روتانا|عامه|منوع|ترفيه/.test(text2)) return "general";
    return "other";
  }
  function attributes2(value) {
    const result = {};
    const expression = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
    for (const match of value.matchAll(expression)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    return result;
  }
  function metaComma2(line2) {
    let quote = "";
    for (let n2 = 0; n2 < line2.length; n2++) {
      if ((line2[n2] === '"' || line2[n2] === "'") && (!quote || line2[n2] === quote)) quote = quote ? "" : line2[n2];
      if (line2[n2] === "," && !quote) return n2;
    }
    return -1;
  }
  function detectM3UKind2(meta, url) {
    const declared = normalize2(meta["tvg-type"] || meta.type);
    if (["series", "serial", "\u0645\u0633\u0644\u0633\u0644", "\u0645\u0633\u0644\u0633\u0644\u0627\u062A"].includes(declared)) return "series";
    if (["movie", "vod", "film", "\u0641\u064A\u0644\u0645", "\u0627\u0641\u0644\u0627\u0645"].includes(declared)) return "movie";
    if (["live", "channel", "\u0642\u0646\u0627\u0629"].includes(declared)) return "live";
    const path2 = url.pathname.toLowerCase();
    if (/\/(?:series|serials)\//.test(path2)) return "series";
    if (/\/(?:movie|movies|vod)\//.test(path2)) return "movie";
    return /\.(?:mp4|mkv|avi|mov|webm|m4v)$/.test(path2) ? "movie" : "live";
  }
  function parseM3U2(text2, base = globalThis.location?.href) {
    if (typeof text2 !== "string" || text2.length > 64 * 1024 * 1024) throw new Error("\u0645\u0644\u0641 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.");
    if (/#EXT-X-(?:TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(text2)) throw new Error("\u0647\u0630\u0627 \u0631\u0627\u0628\u0637 \u0628\u062B HLS\u061B \u0627\u062E\u062A\u0631 \xAB\u0631\u0627\u0628\u0637 \u0628\u062B \u0645\u0628\u0627\u0634\u0631\xBB \u0644\u062A\u0634\u063A\u064A\u0644\u0647.");
    const items = [], seen = /* @__PURE__ */ new Set();
    let meta = {}, name = "", group = "", headers = {}, epgURL = "";
    for (let line2 of text2.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      line2 = line2.trim();
      if (!line2) continue;
      if (/^#EXTM3U/i.test(line2)) {
        const attrs = attributes2(line2);
        epgURL = attrs["x-tvg-url"] || attrs["url-tvg"] || "";
        continue;
      }
      if (/^#EXTINF:/i.test(line2)) {
        const comma = metaComma2(line2);
        meta = attributes2(comma < 0 ? line2 : line2.slice(0, comma));
        name = comma < 0 ? "" : line2.slice(comma + 1).trim().slice(0, 512);
        group = (meta["group-title"] || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641").slice(0, 256);
        headers = {};
        continue;
      }
      if (/^#EXTGRP:/i.test(line2)) {
        group = line2.slice(8).trim().slice(0, 256);
        continue;
      }
      if (/^#EXTVLCOPT:/i.test(line2)) {
        const [key2, ...value] = line2.slice(11).split("=");
        if (key2.toLowerCase() === "http-user-agent") headers["User-Agent"] = value.join("=").slice(0, 512);
        if (key2.toLowerCase() === "http-referrer") {
          const referrer = safeURL2(value.join("="));
          if (referrer) headers.Referer = referrer.href;
        }
        continue;
      }
      if (line2.startsWith("#")) continue;
      const url = safeURL2(line2, base);
      if (!url) {
        meta = {};
        name = "";
        group = "";
        headers = {};
        continue;
      }
      const kind = detectM3UKind2(meta, url), unique = `${kind}|${url.href}`;
      if (!seen.has(unique)) {
        seen.add(unique);
        const year = /(?:19|20)\d{2}/.exec(meta["tvg-year"] || name)?.[0] || "";
        items.push({ id: `${kind}:m3u:${keyHash2(url.href)}`, providerId: "", kind, name: name || meta["tvg-name"] || `\u0642\u0646\u0627\u0629 ${items.length + 1}`, group: group || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", url: url.href, logo: safeURL2(meta["tvg-logo"], base)?.href || "", epgId: meta["tvg-id"] || "", epgURL: safeURL2(epgURL, base)?.href || "", year, genre: meta["tvg-genre"] || "", language: meta["tvg-language"] || "", catchupSource: meta["catchup-source"] || "", catchupDays: clamp2(meta["catchup-days"], 0, 365), preview: safeURL2(meta["tvg-preview"], base)?.href || "", headers: { ...headers } });
        if (items.length >= 2e5) break;
      }
      meta = {};
      name = "";
      group = "";
      headers = {};
    }
    if (!items.length) throw new Error("\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u062D\u062A\u0648\u0649 \u0635\u0627\u0644\u062D \u0641\u064A \u0627\u0644\u0642\u0627\u0626\u0645\u0629.");
    return items;
  }
  function searchable2(item) {
    let cached = textCache2.get(item);
    const signature = [item.name, item.group, item.genre, item.cast, item.plot, item.language, item.year].join("\0");
    if (!cached || cached.signature !== signature) {
      cached = { signature, text: normalize2(signature) };
      textCache2.set(item, cached);
    }
    return cached.text;
  }
  function matchQuery2(item, query) {
    if (!query) return true;
    const tokens = query.match(/-?"[^"]+"|\S+/g) || [];
    for (let token of tokens) {
      let negate = token.startsWith("-");
      if (negate) token = token.slice(1);
      token = token.replace(/^"|"$/g, "");
      const colon = token.indexOf(":"), field = colon > 0 ? token.slice(0, colon) : "", term = normalize2(colon > 0 ? token.slice(colon + 1) : token);
      let found;
      if (!term) continue;
      if (field === "year") found = String(item.year || item.name || "").includes(term);
      else if (field === "genre") found = normalize2(item.genre || item.group).includes(term);
      else if (field === "lang") found = normalize2(item.language).includes(term);
      else if (field === "actor" || field === "cast") found = normalize2(item.cast).includes(term);
      else found = searchable2(item).includes(normalize2(token));
      if (negate ? found : !found) return false;
    }
    return true;
  }
  function movieKey2(item) {
    return normalize2(item.name).replace(/(?:\b(?:4k|8k|uhd|fhd|hd|sd|hevc|h264|h265|x264|x265|1080p|2160p|720p|bluray|web.?dl|dubbed|subbed)\b|\([^)]*\))/g, " ").replace(/\s+/g, " ").trim() + "|" + (item.year || /(?:19|20)\d{2}/.exec(item.name || "")?.[0] || "");
  }
  function filterItems2(items, options = {}) {
    const { scope: scope2 = "", group = "", family = "", query = "", year = "", genre = "", language = "", ratingFloor = 0, parental = false, favoritesOnly = false, watchlistOnly = false, historyOnly = false, recentOnly = false, dedupeMovies = true, dedupeChannels = true, sort = "source", order = [], now = Date.now() } = options;
    const asSet = (value) => value instanceof Set ? value : new Set(value || []), hidden = asSet(options.hidden), favorites = asSet(options.favorites), watchlist = asSet(options.watchlist), history = asSet((options.history || []).map((value) => typeof value === "string" ? value : value.key)), duplicate = /* @__PURE__ */ new Set(), result = [];
    for (const item of items || []) {
      if (!item || options.kind && item.kind !== options.kind) continue;
      let key2;
      const getKey = () => key2 ??= item.key || stableKey2(scope2, item);
      if (hidden.size && (hidden.has(getKey()) || hidden.has(item.id))) continue;
      if (parental && isAdult2(item) || group && group !== item.group || family && !["all", "favorites", "history"].includes(family) && family !== classifyLive2(item)) continue;
      if ((favoritesOnly || family === "favorites") && !favorites.has(getKey()) || watchlistOnly && !watchlist.has(getKey()) || (historyOnly || family === "history") && !history.has(getKey())) continue;
      if (item.kind !== "live" && (year && !String(item.year || item.name || "").includes(String(year)) || genre && !normalize2(`${item.genre || ""} ${item.group || ""}`).includes(normalize2(genre)) || language && !normalize2(item.language).includes(normalize2(language)) || ratingFloor > (Number(item.rating) || 0))) continue;
      const stamp = Number(item.added || 0) * (Number(item.added || 0) > 1e11 ? 1 : 1e3);
      if (recentOnly && !(stamp > 0 && now - stamp <= 7 * 864e5 && now >= stamp)) continue;
      if (!matchQuery2(item, query.trim())) continue;
      if (item.kind === "movie" && dedupeMovies || item.kind === "live" && dedupeChannels) {
        const duplicateKey = item.kind === "movie" ? movieKey2(item) : item.url || item.id;
        if (duplicate.has(duplicateKey)) continue;
        duplicate.add(duplicateKey);
      }
      result.push(item);
    }
    if (order.length) {
      const ranks = new Map(order.map((key2, rank) => [key2, rank]));
      result.sort((left, right) => (ranks.get(left.id) ?? ranks.get(left.key) ?? Infinity) - (ranks.get(right.id) ?? ranks.get(right.key) ?? Infinity));
    }
    if (sort === "name" || sort === "az" || sort === 0) result.sort((left, right) => normalize2(left.name).localeCompare(normalize2(right.name)));
    else if (sort === "za" || sort === 1) result.sort((left, right) => normalize2(right.name).localeCompare(normalize2(left.name)));
    else if (sort === "recent" || sort === 2) result.sort((left, right) => Number(right.added || 0) - Number(left.added || 0));
    else if (sort === "rating") result.sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
    return result;
  }
  function formatExpiry2(userInfo = {}, { locale = "ar-SA-u-ca-gregory", now = Date.now() } = {}) {
    const raw = userInfo.exp_date ?? userInfo.expires ?? userInfo.expiry;
    let end = Number(raw);
    end = Number.isFinite(end) && end > 0 ? end * (end > 1e11 ? 1 : 1e3) : typeof raw === "string" && raw.trim() && !/^\d+$/.test(raw.trim()) ? Date.parse(raw) : NaN;
    if (!Number.isFinite(end) || end <= 0) return { known: false, date: "", days: null, expired: false, text: "\u0644\u0645 \u064A\u062D\u062F\u062F \u0627\u0644\u0645\u0632\u0648\u062F \u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0646\u062A\u0647\u0627\u0621" };
    const days = Math.max(0, Math.ceil((end - now) / 864e5)), expired = end <= now, date = new Date(end).toLocaleDateString(locale);
    return { known: true, date, days, expired, timestamp: end, text: `\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643: ${date} \xB7 ${expired ? "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643" : `\u0627\u0644\u0645\u062A\u0628\u0642\u064A: ${days} \u064A\u0648\u0645`}` };
  }
  function abortError2() {
    return new ApiError2("\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0637\u0644\u0628.", { code: "ABORTED" });
  }
  function accountPayload2(account) {
    const source = account || {};
    let mode = source.mode || "provider", server = source.server || PROVIDER2, username = source.username ?? source.user ?? "", password = source.password || "", url = source.url || source.playlist || (["m3u", "direct", "auto"].includes(mode) ? source.server || "" : "");
    if (mode === "auto") {
      const parsed = safeURL2(url || server);
      if (parsed?.searchParams.has("username") && parsed.searchParams.has("password")) {
        username ||= parsed.searchParams.get("username");
        password ||= parsed.searchParams.get("password");
        parsed.pathname = parsed.pathname.replace(/\/(?:get|player_api)\.php$/i, "");
        parsed.search = "";
        parsed.hash = "";
        server = parsed.href.replace(/\/$/, "");
        mode = "xtream";
      } else mode = username && password ? "xtream" : /\.(?:m3u8|ts|mp4|mkv|webm)(?:[?#]|$)/i.test(url) ? "direct" : "m3u";
    }
    return { mode, server, username, password, url, mac: source.mac || (mode === "stalker" ? source.user || source.username || "" : "") };
  }
  function deadline2(signal, milliseconds) {
    const controller2 = new AbortController();
    let timer, timedOut = false, rejectTimeout;
    const promise = new Promise((_, reject) => {
      rejectTimeout = reject;
    });
    promise.catch(() => {
    });
    const cancel = () => {
      controller2.abort();
      rejectTimeout(abortError2());
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    const reset = (duration) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller2.abort();
        rejectTimeout(new ApiError2("\u062A\u0623\u062E\u0631 \u0627\u0644\u0645\u0635\u062F\u0631. \u062D\u0627\u0648\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", { code: "TIMEOUT" }));
      }, duration);
    };
    reset(milliseconds);
    return { signal: controller2.signal, race: (task) => Promise.race([task, promise]), extend: reset, get timedOut() {
      return timedOut;
    }, done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    } };
  }
  function nativeProviderFetch2(url, options = {}) {
    const requestId = `provider-${Date.now()}-${++providerRequestSerial2}`;
    if (options.signal?.aborted) return Promise.reject(abortError2());
    const abort = () => {
      void nativeRequest("apiCancel", { requestId }).catch(() => {
      });
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    return nativeRequest("providerRequest", { url: String(url), method: options.method || "GET", headers: Object.fromEntries(new Headers(options.headers || {})), requestId, stream: false }).then((data) => {
      const status = Number(data.status);
      if (!Number.isInteger(status) || status < 200 || status > 599) throw new ApiError2("\u0631\u062F \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_RESPONSE" });
      return new Response([204, 205, 304].includes(status) ? null : String(data.body || ""), { status, headers: data.headers || {} });
    }).finally(() => options.signal?.removeEventListener("abort", abort));
  }
  function mimeForURL2(address) {
    const path2 = safeURL2(address)?.pathname.toLowerCase() || "";
    return path2.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : path2.endsWith(".ts") ? "video/mp2t" : path2.endsWith(".webm") ? "video/webm" : "video/mp4";
  }
  function decodeProviderText2(value) {
    const text2 = String(value || "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text2) || text2.length % 4 !== 0) return text2;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(text2), (char) => char.charCodeAt(0)));
    } catch {
      return text2;
    }
  }
  async function derivePIN2(pin, salt = null) {
    if (!/^\d{4,8}$/.test(String(pin))) throw new Error("\u0627\u0633\u062A\u062E\u062F\u0645 \u0631\u0645\u0632\u064B\u0627 \u0645\u0646 4 \u0625\u0644\u0649 8 \u0623\u0631\u0642\u0627\u0645.");
    if (isNative()) return nativeRequest("derivePIN", { pin: String(pin), ...salt ? { salt: [...salt] } : {}, iterations: 15e4 });
    salt ||= crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 15e4, hash: "SHA-256" }, material, 256);
    return { salt: [...salt], hash: [...new Uint8Array(bits)] };
  }
  async function verifyPIN2(pin, record2) {
    if (!record2?.salt || !record2?.hash || !/^\d{4,8}$/.test(String(pin))) return false;
    const candidate = await derivePIN2(pin, new Uint8Array(record2.salt));
    if (candidate.hash.length !== record2.hash.length) return false;
    let difference = 0;
    for (let n2 = 0; n2 < candidate.hash.length; n2++) difference |= candidate.hash[n2] ^ record2.hash[n2];
    return difference === 0;
  }
  var BRAND2, PROVIDER2, ACCOUNT_MODES2, DEFAULT_SETTINGS2, LIVE_FAMILIES2, ADULT2, textCache2, clamp2, ApiError2, nativeAPIFetch2, providerRequestSerial2, ApiClient2;
  var init_core2 = __esm({
    "tv/samsung/app/core.js?release=1.2"() {
      init_storage();
      init_native();
      BRAND2 = Object.freeze({ name: "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", name_ar: "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", name_en: "abbeedo TV", phone: "0571514382", whatsapp: "https://wa.me/966571514382", version: "1.2.2", tagline: "\u0639\u0627\u0644\u0645\u0643 \u0645\u0646 \u0627\u0644\u062A\u0631\u0641\u064A\u0647" });
      PROVIDER2 = "http://maglobalxx.xyz:2052";
      ACCOUNT_MODES2 = Object.freeze(["provider", "xtream", "m3u", "m3u-file", "auto", "direct", "stalker"]);
      DEFAULT_SETTINGS2 = Object.freeze({
        language: "ar",
        accent: "#ff242d",
        theme: "dark",
        background_speed: "standard",
        reduced_motion: false,
        text_scale: 1,
        high_contrast: false,
        home_order: "series,live,movie",
        start_screen: "home",
        screensaver_mode: "off",
        screensaver_minutes: 5,
        decoder_mode: "auto",
        aspect_mode: "fit",
        buffer_mode: 0,
        seek_step_seconds: 10,
        auto_next: true,
        data_saver: false,
        auto_categories: true,
        catalog_refresh_hours: 0,
        epg_timezone: "local",
        epg_offset_minutes: 0,
        parental_enabled: false,
        privacy_mode: false,
        dedupe_movies: true,
        deduplicate_channels: true,
        notifications: false,
        remember_subscription: true,
        volume: 1,
        playback_rate: 1,
        subtitles: true,
        audio_language: "",
        subtitle_language: "",
        sleep_minutes: 0,
        skip_intro_seconds: 0
      });
      LIVE_FAMILIES2 = Object.freeze([
        { id: "history", ar: "\u0633\u062C\u0644 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", en: "Watching history" },
        { id: "favorites", ar: "\u0627\u0644\u0645\u0641\u0636\u0644\u0629", en: "Favorites" },
        { id: "all", ar: "\u0643\u0644 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", en: "All channels" },
        { id: "kids", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u0637\u0641\u0627\u0644", en: "Kids" },
        { id: "news", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u062E\u0628\u0627\u0631", en: "News" },
        { id: "sports", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0631\u064A\u0627\u0636\u0629", en: "Sports" },
        { id: "movies", ar: "\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0623\u0641\u0644\u0627\u0645", en: "Movies" },
        { id: "documentary", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0648\u062B\u0627\u0626\u0642\u064A\u0629", en: "Documentary" },
        { id: "general", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629 \u0648\u0627\u0644\u0645\u0646\u0648\u0639\u0629", en: "General" },
        { id: "religious", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u062F\u064A\u0646\u064A\u0629", en: "Religious" },
        { id: "music", ar: "\u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0645\u0648\u0633\u064A\u0642\u064A\u0629", en: "Music" },
        { id: "other", ar: "\u0628\u0642\u064A\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", en: "Other" }
      ]);
      ADULT2 = /(?:adult|\bxxx\b|18\+|للكبار|إباح|اباح)/i;
      textCache2 = /* @__PURE__ */ new WeakMap();
      clamp2 = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
      ApiError2 = class extends Error {
        constructor(message, { code = "API_ERROR", status = 0, cause, partial = false, canDirect = false } = {}) {
          super(message, { cause });
          this.name = "ApiError";
          this.code = code;
          this.status = status;
          this.partial = partial;
          this.canDirect = canDirect;
        }
      };
      nativeAPIFetch2 = nativeFetch;
      providerRequestSerial2 = 0;
      ApiClient2 = class {
        constructor({ base = globalThis.ABUNASSER_CONFIG?.apiBase || (globalThis.ABUNASSER_CONFIG?.apiOrigin ? globalThis.ABUNASSER_CONFIG.apiOrigin.replace(/\/$/, "") + "/api/client" : "/api/client"), fetch: fetchImpl = null, vault: vault2 = null, timeout = 7e3, onStatus = () => {
        } } = {}) {
          this.base = base;
          this.fetch = fetchImpl || (isNative() ? nativeAPIFetch2 : globalThis.fetch?.bind(globalThis));
          this.vault = vault2 || new Vault({ namespace: "catalog-cache" });
          this.timeout = timeout;
          this.onStatus = onStatus;
          this.memory = /* @__PURE__ */ new Map();
          this.detailsCache = /* @__PURE__ */ new Map();
          this.lastStatus = {};
          this.timings = {};
        }
        _status(kind, value) {
          this.lastStatus[kind] = { ...this.lastStatus[kind], ...value };
          this.onStatus(kind, this.lastStatus[kind]);
        }
        async _response(payload, clock) {
          if (!this.fetch) throw new ApiError2("\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.", { code: "FETCH_UNAVAILABLE" });
          let response;
          try {
            response = await clock.race(this.fetch(this.base, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, application/x-ndjson" }, body: JSON.stringify(payload), signal: clock.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }));
          } catch (error) {
            if (error instanceof ApiError2) throw error;
            if (clock.signal.aborted) throw clock.timedOut ? new ApiError2("\u062A\u0623\u062E\u0631 \u0627\u0644\u0645\u0635\u062F\u0631. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.", { code: "TIMEOUT" }) : abortError2();
            throw new ApiError2("\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0645\u0635\u062F\u0631. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643.", { code: "NETWORK", cause: error });
          }
          if (!response.ok) {
            let data = {};
            try {
              data = await clock.race(response.json());
            } catch {
            }
            if (data.code === "HOST_NOT_ALLOWED" && data.canDirect) return this._directResponse(payload, clock);
            throw new ApiError2(data.error || data.message || `\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0637\u0644\u0628 (HTTP ${response.status}).`, { status: response.status, code: data.code || `HTTP_${response.status}`, canDirect: !!data.canDirect });
          }
          return response;
        }
        async request(op, account, extra = {}, { signal, timeout = this.timeout } = {}) {
          if (signal?.aborted) throw abortError2();
          const clock = deadline2(signal, timeout);
          try {
            const response = await this._response({ op, account: accountPayload2(account), ...extra }, clock);
            return await clock.race(response.json());
          } catch (error) {
            if (error instanceof ApiError2) throw error;
            throw new ApiError2("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE", cause: error });
          } finally {
            clock.done();
          }
        }
        async _directResponse(payload, clock) {
          const account = payload.account;
          const download = async (address, text2 = false, headers = {}) => {
            const url = safeURL2(address);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError2("\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u063A\u064A\u0631 \u0645\u0647\u064A\u0623 \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639. \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u064A\u062D\u062A\u0627\u062C HTTPS \u0648\u062F\u0639\u0645 CORS \u0645\u0646 \u0627\u0644\u0645\u0632\u0648\u062F.", { code: "DIRECT_HTTPS_REQUIRED", canDirect: true });
            const directFetch = isNative() ? nativeProviderFetch2 : this.fetch;
            let response;
            try {
              response = await clock.race(directFetch(url.href, { signal: clock.signal, headers, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" }));
            } catch (error) {
              if (error instanceof ApiError2) throw error;
              throw new ApiError2(isNative() ? "\u062A\u0639\u0630\u0631 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0628\u0627\u0644\u0645\u0632\u0648\u062F. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643." : "\u0644\u0645 \u064A\u0633\u0645\u062D \u0627\u0644\u0645\u0632\u0648\u062F \u0628\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0627\u0644\u0645\u0628\u0627\u0634\u0631. \u064A\u0644\u0632\u0645 \u062A\u0641\u0639\u064A\u0644 CORS \u0623\u0648 \u062A\u0647\u064A\u0626\u0629 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0632\u0648\u062F \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639.", { code: isNative() ? "DIRECT_NETWORK" : "DIRECT_CORS", cause: error });
            }
            if (!response.ok) throw new ApiError2(`\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 (HTTP ${response.status}).`, { code: `HTTP_${response.status}`, status: response.status });
            return clock.race(text2 ? response.text() : response.json());
          };
          const respond = (data) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
          const directSource = (address) => {
            const url = safeURL2(address);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError2("\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0635\u062F\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u064A\u062D\u062A\u0627\u062C HTTPS \u0623\u0648 \u0648\u0633\u064A\u0637\u064B\u0627 \u0645\u0647\u064A\u0623.", { code: "DIRECT_HTTPS_REQUIRED" });
            return { url: url.href, sourceUrl: url.href, mime: mimeForURL2(url.href), alternatives: [], nativePreferred: isNative() };
          };
          if (account.mode === "stalker") {
            if (!isNative()) throw new ApiError2("\u064A\u062D\u062A\u0627\u062C \u0627\u0634\u062A\u0631\u0627\u0643 Stalker \u0625\u0644\u0649 \u062A\u0647\u064A\u0626\u0629 \u0639\u0646\u0648\u0627\u0646\u0647 \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639\u061B \u0644\u0627 \u064A\u062A\u064A\u062D \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0631\u0624\u0648\u0633 MAC \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0645\u0628\u0627\u0634\u0631\u0629.", { code: "HOST_NOT_ALLOWED", canDirect: false });
            if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(account.mac)) throw new ApiError2("\u0639\u0646\u0648\u0627\u0646 MAC \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_MAC" });
            const portal = safeURL2(account.server);
            if (!portal) throw new ApiError2("\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_URL" });
            portal.pathname = portal.pathname.replace(/\/server\/load\.php$/, "").replace(/\/c\/?$/, "").replace(/\/+$/, "") + "/server/load.php";
            portal.search = "";
            portal.hash = "";
            const headers = { "User-Agent": "Mozilla/5.0 (QtEmbedded; U; Linux; C) MAG250/0.2.18 Firmware/0.2.18", "X-User-Agent": "Model: MAG250; Link: Ethernet", Cookie: `mac=${account.mac}; stb_lang=en; timezone=GMT`, Referer: portal.origin + portal.pathname.replace("/server/load.php", "/c/") };
            const call = async (token2, type, action, extra = {}) => {
              const address = new URL(portal);
              for (const [key2, value] of Object.entries({ type, action, ...extra, JsHttpRequest: "1-xml" })) address.searchParams.set(key2, String(value));
              const data = await download(address.href, false, token2 ? { ...headers, Authorization: `Bearer ${token2}` } : headers);
              return data?.js && typeof data.js === "object" ? data.js : data;
            };
            const handshake = await call("", "stb", "handshake"), token = typeof handshake?.token === "string" ? handshake.token : "";
            if (!token || token.length > 4e3) throw new ApiError2("\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0644\u0645 \u062A\u0639\u062F \u0631\u0645\u0632 \u062C\u0644\u0633\u0629 \u0635\u0627\u0644\u062D\u064B\u0627.", { code: "STALKER_TOKEN" });
            if (payload.op === "auth") {
              await call(token, "stb", "get_profile");
              return respond({ userInfo: { auth: 1, status: "Active" } });
            }
            if (payload.op === "catalog") {
              if (payload.kind !== "live") throw new ApiError2("\u0627\u0644\u0645\u062A\u0627\u062D \u0644\u0647\u0630\u0647 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0647\u0646\u0627 \u0647\u0648 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629.", { code: "STALKER_KIND" });
              const data = await call(token, "itv", "get_all_channels"), rows = Array.isArray(data?.data) ? data.data : data?.data?.data;
              if (!Array.isArray(rows)) throw new ApiError2("\u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0644\u0645 \u062A\u0639\u062F \u0642\u0627\u0626\u0645\u0629 \u0642\u0646\u0648\u0627\u062A \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
              const seen = /* @__PURE__ */ new Set(), items = [];
              for (const [n2, row] of rows.slice(0, 2e5).entries()) {
                const id = String(row.id || row.ch_id || n2);
                if (seen.has(id)) continue;
                seen.add(id);
                items.push({ id: `live:${id}`, providerId: id, kind: "live", name: String(row.name || row.title || `\u0642\u0646\u0627\u0629 ${n2 + 1}`).slice(0, 512), group: String(row.category_name || row.tv_genre_title || row.genre || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641").slice(0, 512), logo: String(row.logo || row.icon || ""), url: "", command: String(row.cmd || row.url || id).slice(0, 8192) });
              }
              return respond({ items, categories: [], partial: rows.length > 2e5 });
            }
            if (payload.op === "resolve") {
              const command = String(payload.item?.command || "");
              if (!command || command.length > 8192) throw new ApiError2("\u0623\u0639\u062F \u0641\u062A\u062D \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0644\u062A\u062C\u062F\u064A\u062F \u0631\u0627\u0628\u0637\u0647\u0627.", { code: "STALKER_COMMAND" });
              const result = await call(token, "itv", "create_link", { cmd: command, series: "0" }), raw = String(result.cmd || result.url || result.data?.cmd || ""), found = /https?:\/\/[^\s"'<>]+/i.exec(raw)?.[0]?.split("|")[0]?.replace(/[,;]+$/, "");
              const source = directSource(found);
              return respond({ ...source, headers });
            }
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          if (account.mode === "direct") {
            if (payload.op === "resolve") return respond(directSource(payload.item?.url || account.url));
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          if (["m3u", "m3u-file"].includes(account.mode) || account.mode === "auto" && account.url) {
            if (payload.op === "auth") {
              await download(account.url, true);
              return respond({ userInfo: { status: "Active", local: false } });
            }
            if (payload.op === "catalog") return respond({ items: parseM3U2(await download(account.url, true), account.url).filter((item) => item.kind === payload.kind), categories: [] });
            if (payload.op === "resolve") return respond(directSource(payload.item?.url));
            if (payload.op === "details") return respond({ info: payload.item || {}, episodes: {} });
            if (payload.op === "epg") return respond({ programs: [] });
          }
          const server = safeURL2(account.server);
          if (!server || !isNative() && server.protocol !== "https:") throw new ApiError2("\u0623\u0636\u0641 \u0639\u0646\u0648\u0627\u0646 HTTPS \u0623\u0648 \u0647\u064A\u0626 \u0647\u0630\u0627 \u0627\u0644\u0645\u0632\u0648\u062F \u0641\u064A \u0648\u0633\u064A\u0637 \u0627\u0644\u0645\u0648\u0642\u0639.", { code: "DIRECT_HTTPS_REQUIRED", canDirect: true });
          const endpoint = (action = "", extra = {}) => {
            const url = new URL(server);
            url.pathname = url.pathname.replace(/\/$/, "") + "/player_api.php";
            url.search = "";
            url.searchParams.set("username", account.username);
            url.searchParams.set("password", account.password);
            if (action) url.searchParams.set("action", action);
            for (const [key2, value] of Object.entries(extra)) url.searchParams.set(key2, value);
            return url;
          };
          const stream = (kind, id, extension) => {
            const url = new URL(server);
            url.pathname = url.pathname.replace(/\/$/, "") + "/" + [kind === "episode" ? "series" : kind, account.username, account.password, `${id}.${extension}`].map(encodeURIComponent).join("/");
            url.search = "";
            url.hash = "";
            return url.href;
          };
          if (payload.op === "auth") {
            const data = await download(endpoint());
            if (String(data.user_info?.auth) !== "1" || data.user_info.status && !/^active$/i.test(data.user_info.status)) throw new ApiError2("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629 \u0623\u0648 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u063A\u064A\u0631 \u0646\u0634\u0637.", { code: "ACCOUNT_REJECTED", status: 401 });
            return respond({ userInfo: data.user_info, serverInfo: data.server_info || {} });
          }
          if (payload.op === "catalog") {
            const kind = payload.kind, name = kind === "movie" ? "vod" : kind, raw = await download(endpoint(`get_${name === "series" ? "series" : name + "_streams"}`));
            if (!Array.isArray(raw)) throw new ApiError2("\u0635\u064A\u063A\u0629 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0632\u0648\u062F \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
            let categories = [];
            try {
              const value = await download(endpoint(`get_${name}_categories`));
              if (Array.isArray(value)) categories = value;
            } catch (error) {
              if (clock.signal.aborted) throw error;
            }
            const names = new Map(categories.map((category) => [String(category.category_id), category.category_name]));
            const items = raw.filter((row) => row[kind === "series" ? "series_id" : "stream_id"] != null).slice(0, 2e5).map((row) => {
              const id = String(row[kind === "series" ? "series_id" : "stream_id"]), extension = kind === "live" ? ["ts", "m3u8"].includes(String(row.container_extension).toLowerCase()) ? String(row.container_extension).toLowerCase() : "m3u8" : row.container_extension || "mp4";
              return { id: `${kind}:${id}`, providerId: id, kind, name: row.name || "\u0628\u062F\u0648\u0646 \u0639\u0646\u0648\u0627\u0646", categoryId: String(row.category_id || ""), group: names.get(String(row.category_id)) || "\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", logo: row.stream_icon || row.cover || "", url: kind === "series" ? "" : stream(kind, id, extension), extension, year: row.year || row.releaseDate?.slice(0, 4) || "", genre: row.genre || "", language: row.language || "", rating: row.rating || (Number(row.rating_5based) * 2 || ""), added: row.added || row.last_modified || "", plot: row.plot || "", cast: row.cast || "" };
            });
            return respond({ items, categories });
          }
          if (payload.op === "details") {
            const series = payload.kind === "series", data = await download(endpoint(series ? "get_series_info" : "get_vod_info", { [series ? "series_id" : "vod_id"]: payload.id }));
            return respond({ info: { ...payload.item || {}, ...data.movie_data || {}, ...data.info || {} }, episodes: data.episodes || {} });
          }
          if (payload.op === "epg") {
            const data = await download(endpoint("get_short_epg", { stream_id: payload.id, limit: 50 }));
            return respond({ programs: (data.epg_listings || []).map((program) => ({ ...program, title: decodeProviderText2(program.title), description: decodeProviderText2(program.description) })) });
          }
          if (payload.op === "resolve") {
            const item = payload.item || {}, kind = payload.kind === "episode" ? "series" : payload.kind, extension = kind === "live" ? item.extension === "ts" || /\.ts(?:\?|$)/i.test(item.url || "") ? "ts" : "m3u8" : item.extension || item.container_extension || "mp4";
            const generated = ["provider", "xtream", "auto"].includes(account.mode) && /^(?:live|movie|series)$/.test(kind) && /^\d+$/.test(String(payload.id));
            const source = generated ? stream(kind, payload.id, extension) : item.url, url = safeURL2(source);
            if (!url || !isNative() && url.protocol !== "https:") throw new ApiError2("\u0631\u0627\u0628\u0637 \u0627\u0644\u0648\u0633\u0627\u0626\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u064A\u062D\u062A\u0627\u062C HTTPS.", { code: "DIRECT_HTTPS_REQUIRED" });
            return respond({ url: url.href, sourceUrl: url.href, mime: mimeForURL2(url.href), nativePreferred: isNative(), alternatives: generated && kind === "live" ? [stream(kind, payload.id, extension === "ts" ? "m3u8" : "ts")].map((address) => ({ url: address, sourceUrl: address, mime: mimeForURL2(address) })) : [] });
          }
          throw new ApiError2("\u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645\u0629.", { code: "INVALID_OPERATION" });
        }
        async authenticate(account, options = {}) {
          if (["demo", "m3u-file", "direct"].includes(account?.mode)) return { userInfo: { status: "Active", local: true } };
          return this.request("auth", account, {}, options);
        }
        async catalog(account, kind, { signal, onBatch = () => {
        }, force = false, maxAge = 6 * 36e5 } = {}) {
          if (signal?.aborted) throw abortError2();
          if (!["live", "movie", "series"].includes(kind)) throw new ApiError2("\u0642\u0633\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_KIND" });
          if (account?.mode === "m3u-file") {
            const rows = (account.items || []).filter((item) => item.kind === kind);
            onBatch(rows, { kind, cached: true, partial: false });
            return rows;
          }
          if (account?.mode === "direct") {
            const source = safeURL2(account.url);
            if (!source) throw new ApiError2("\u0631\u0627\u0628\u0637 \u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", { code: "INVALID_URL" });
            const rows = kind === "live" ? [{ id: "live:direct", providerId: "direct", kind: "live", name: account.name || "\u0628\u062B \u0645\u0628\u0627\u0634\u0631", group: "\u0631\u0648\u0627\u0628\u0637 \u0645\u0628\u0627\u0634\u0631\u0629", url: source.href }] : [];
            onBatch(rows, { kind, cached: true, partial: false });
            return rows;
          }
          const began = performance.now(), scope2 = accountScope2(account), key2 = `${scope2}:${kind}`, memory2 = this.memory.get(key2), first = (rows) => onBatch(rows.slice(0, 128), { kind, cached: true, partial: true });
          this._status(kind, { loading: true, partial: false, error: null });
          if (!force && memory2 && Date.now() - memory2.savedAt < maxAge) {
            onBatch(memory2.items, { kind, cached: true, partial: false });
            this._status(kind, { loading: false, cached: true, count: memory2.items.length });
            return memory2.items;
          }
          let preview, cached;
          try {
            preview = await this.vault.get(`preview:${key2}`);
            if (preview?.items?.length) first(preview.items);
          } catch (error) {
            this._status(kind, { storageError: error.code || "STORAGE_ERROR" });
          }
          if (!force) {
            try {
              cached = await this.vault.get(`full:${key2}`);
              if (Array.isArray(cached?.items) && cached.complete && Date.now() - cached.savedAt < maxAge) {
                this.memory.set(key2, cached);
                onBatch(cached.items, { kind, cached: true, partial: false });
                this._status(kind, { loading: false, cached: true, count: cached.items.length });
                return cached.items;
              }
            } catch (error) {
              this._status(kind, { storageError: error.code || "STORAGE_ERROR" });
            }
          }
          if (signal?.aborted) throw abortError2();
          const clock = deadline2(signal, this.timeout), collected = [];
          let firstReceived = false, lastPublishedAt = 0, categories = null;
          const publish = (rows, partial) => {
            if (!Array.isArray(rows)) return;
            if (rows.length + collected.length > 2e5) throw new ApiError2("\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u062A\u062A\u062C\u0627\u0648\u0632 \u062D\u062F \u0627\u0644\u0639\u0646\u0627\u0635\u0631.", { code: "CATALOG_TOO_LARGE" });
            for (const item of rows) collected.push(item);
            if (rows.length && !firstReceived) {
              firstReceived = true;
              clock.extend(9e4);
              this.timings[kind] = { firstMs: Math.round(performance.now() - began), rows: collected.length };
              void this.vault.set(`preview:${key2}`, { items: collected.slice(0, 128), savedAt: Date.now(), complete: false }).catch(() => {
              });
            }
            if (rows.length && (lastPublishedAt === 0 || performance.now() - lastPublishedAt >= 250)) {
              lastPublishedAt = performance.now();
              onBatch(collected.slice(), { kind, cached: false, partial });
            }
          };
          try {
            const response = await this._response({ op: "catalog", account: accountPayload2(account), kind }, clock);
            if (/application\/(?:x-ndjson|ndjson)/i.test(response.headers.get("content-type") || "") && response.body?.getReader) {
              const reader = response.body.getReader(), decoder3 = new TextDecoder();
              let pending2 = "", bytes = 0, done = false;
              const line2 = (text2) => {
                if (!text2.trim()) return;
                let data;
                try {
                  data = JSON.parse(text2);
                } catch {
                  throw new ApiError2("\u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.", { code: "INVALID_RESPONSE" });
                }
                if (data.error) throw new ApiError2(data.error, { code: data.code || "PROVIDER_ERROR" });
                if (data.categories) categories = data.categories;
                if (Array.isArray(data.items)) publish(data.items, !data.done);
                if (data.done) done = true;
              };
              try {
                for (; ; ) {
                  const chunk = await clock.race(reader.read());
                  if (chunk.done) break;
                  bytes += chunk.value.length;
                  if (bytes > 64 * 1024 * 1024) throw new ApiError2("\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.", { code: "CATALOG_TOO_LARGE" });
                  pending2 += decoder3.decode(chunk.value, { stream: true });
                  let split;
                  while ((split = pending2.indexOf("\n")) >= 0) {
                    line2(pending2.slice(0, split));
                    pending2 = pending2.slice(split + 1);
                  }
                  if (pending2.length > 16 * 1024 * 1024) throw new ApiError2("\u062F\u0641\u0639\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F.", { code: "CATALOG_TOO_LARGE" });
                }
                pending2 += decoder3.decode();
                if (pending2.trim()) line2(pending2);
                if (!done) throw new ApiError2("\u0627\u0646\u0642\u0637\u0639 \u0627\u0644\u0645\u0635\u062F\u0631 \u0642\u0628\u0644 \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", { code: "INCOMPLETE_CATALOG" });
              } finally {
                if (!done) void reader.cancel().catch(() => {
                });
                reader.releaseLock();
              }
            } else {
              const data = await clock.race(response.json());
              const rows = Array.isArray(data) ? data : data.items;
              if (!Array.isArray(rows)) throw new ApiError2("\u0635\u064A\u063A\u0629 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", { code: "INVALID_RESPONSE" });
              publish(rows, !!data.partial);
              if (data.partial) throw new ApiError2("\u0648\u0635\u0644 \u062C\u0632\u0621 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0641\u0642\u0637. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0644\u0625\u0643\u0645\u0627\u0644\u0647\u0627.", { code: "INCOMPLETE_CATALOG" });
            }
            if (categories) {
              const names = new Map((Array.isArray(categories) ? categories : Object.entries(categories).map(([id, name]) => ({ category_id: id, category_name: name }))).map((category) => [String(category.category_id ?? category.id), category.category_name ?? category.name]));
              for (const item of collected) if (names.has(String(item.categoryId))) item.group = names.get(String(item.categoryId));
            }
            const entry = { items: collected, complete: true, savedAt: Date.now() };
            this.memory.set(key2, entry);
            this.timings[kind] = { ...this.timings[kind], totalMs: Math.round(performance.now() - began), rows: collected.length, state: "ready" };
            this._status(kind, { loading: false, partial: false, cached: false, count: collected.length });
            onBatch(collected, { kind, cached: false, partial: false });
            void this.vault.set(`full:${key2}`, entry).catch((error) => this._status(kind, { storageError: error.code || "STORAGE_ERROR" }));
            return collected;
          } catch (error) {
            const failure = error instanceof ApiError2 ? error : new ApiError2("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629.", { code: "NETWORK", cause: error });
            this.timings[kind] = { ...this.timings[kind], totalMs: Math.round(performance.now() - began), state: failure.code };
            this._status(kind, { loading: false, partial: true, error: failure.message, code: failure.code });
            if (failure.code === "ABORTED" || signal?.aborted) throw abortError2();
            const available = collected.length ? collected : cached?.items || preview?.items || memory2?.items;
            if (available?.length) {
              onBatch(available, { kind, cached: !collected.length, partial: true, error: failure.message });
              return available;
            }
            throw failure;
          } finally {
            clock.done();
          }
        }
        async details(account, item, options = {}) {
          if (options.signal?.aborted) throw abortError2();
          if (["m3u-file", "m3u", "direct"].includes(account?.mode)) return { info: { ...item }, episodes: {} };
          const key2 = `${accountScope2(account)}:${item.kind}:${item.providerId || item.id || item.url}`, cached = this.detailsCache.get(key2);
          if (!options.force && cached && Date.now() - cached.savedAt < 12 * 36e5) {
            this.detailsCache.delete(key2);
            this.detailsCache.set(key2, cached);
            return cached.data;
          }
          const data = await this.request("details", account, { kind: item.kind, id: item.providerId || String(item.id || "").replace(/^[^:]+:/, ""), item }, options);
          if (item.kind === "series") {
            for (const [oldKey, entry] of this.detailsCache) if (entry.kind === "series" && oldKey !== key2) this.detailsCache.delete(oldKey);
          }
          this.detailsCache.set(key2, { kind: item.kind, data, savedAt: Date.now() });
          while (this.detailsCache.size > 24) this.detailsCache.delete(this.detailsCache.keys().next().value);
          return data;
        }
        async epg(account, item, options = {}) {
          const data = await this.request("epg", account, { kind: "live", id: item.providerId || String(item.id || "").replace(/^live:/, ""), item }, options);
          return data.programs || data.epg_listings || [];
        }
        async resolve(account, item, options = {}) {
          if (account?.mode === "m3u-file") account = { mode: "direct", url: item.url };
          const data = await this.request("resolve", account, { kind: item.kind, id: item.providerId || String(item.id || "").replace(/^[^:]+:/, ""), item }, options);
          const base = safeURL2(this.base, globalThis.location?.href)?.origin || globalThis.ABUNASSER_CONFIG?.apiOrigin;
          const address = (value) => typeof value === "string" && value.startsWith("/") && base ? new URL(value, base).href : value;
          return { ...data, url: address(data.url), alternatives: (data.alternatives || []).map((value) => typeof value === "string" ? address(value) : { ...value, url: address(value.url) }) };
        }
        async clearCatalogs(account) {
          const scope2 = accountScope2(account);
          for (const kind of ["live", "movie", "series"]) {
            this.memory.delete(`${scope2}:${kind}`);
            await this.vault.remove(`preview:${scope2}:${kind}`);
            await this.vault.remove(`full:${scope2}:${kind}`);
          }
        }
      };
    }
  });

  // tv/samsung/app/distribution.js?site=2.1
  var RELEASE_ORIGIN2, ANDROID_APK2, WINDOWS_SETUP2, WINDOWS_PORTABLE2, RELEASE_INDEX2;
  var init_distribution = __esm({
    "tv/samsung/app/distribution.js?site=2.1"() {
      RELEASE_ORIGIN2 = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.location?.origin || "https://abbeedo.com";
      ANDROID_APK2 = RELEASE_ORIGIN2 + "/downloads/android.apk";
      WINDOWS_SETUP2 = RELEASE_ORIGIN2 + "/downloads/windows.exe";
      WINDOWS_PORTABLE2 = RELEASE_ORIGIN2 + "/downloads/windows-portable.exe";
      RELEASE_INDEX2 = RELEASE_ORIGIN2 + "/api/releases";
    }
  });

  // tv/samsung/app/updates.js?site=2.1
  function compareVersions(left, right) {
    const parse = (value) => typeof value === "string" && /^\d{1,5}(?:\.\d{1,5}){1,3}$/.test(value) ? value.split(".").map(Number) : null;
    const a = parse(left), b = parse(right);
    if (!a || !b) return null;
    for (let n2 = 0; n2 < Math.max(a.length, b.length); n2++) {
      const delta = (a[n2] || 0) - (b[n2] || 0);
      if (delta) return delta > 0 ? 1 : -1;
    }
    return 0;
  }
  async function checkForUpdates({ fetcher = globalThis.fetch, registration: registration2, platform = globalThis.ABUNASSER_CONFIG?.tvPackaged ? globalThis.ABUNASSER_CONFIG.tvPlatform : globalThis.abunasserDesktop?.isDesktop ? "windows" : "web", currentVersion = BRAND2.version, nativeVersion = globalThis.abunasserDesktop?.version, origin = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.location?.origin } = {}) {
    const controller2 = new AbortController(), timer = setTimeout(() => controller2.abort(), 12e3), base = origin || RELEASE_ORIGIN2;
    try {
      const response = await fetcher(new URL("/version.json", base), { cache: "no-store", signal: controller2.signal });
      if (!response.ok) throw Object.assign(new Error("Could not check updates"), { code: "UPDATE_NETWORK", httpStatus: response.status });
      const feed = await response.json();
      if (compareVersions(feed.version, currentVersion) === null) throw Object.assign(new Error("Invalid release information"), { code: "UPDATE_FEED" });
      const tvPackaged = globalThis.ABUNASSER_CONFIG?.tvPackaged === true;
      let webAvailable = !tvPackaged && compareVersions(feed.version, currentVersion) > 0;
      if (!tvPackaged && !registration2 && platform === "web" && globalThis.navigator?.serviceWorker) registration2 = await navigator.serviceWorker.getRegistration();
      if (!tvPackaged && registration2) {
        await registration2.update();
        webAvailable = webAvailable || !!registration2.waiting;
      }
      let latest = feed.version, releaseUnavailable = false;
      if (["windows", "android"].includes(platform)) {
        try {
          const release = await fetcher(new URL("/api/releases", base), { cache: "no-store", signal: controller2.signal });
          if (!release.ok) throw Error("No published release");
          const data = await release.json(), row = platform === "windows" ? data.windows?.setup : data.android;
          if (row?.available !== true || compareVersions(row.version, "0.0.0") === null) throw Error("No published release");
          latest = row.version;
        } catch {
          latest = null;
          releaseUnavailable = true;
        }
      }
      const installed = tvPackaged ? globalThis.ABUNASSER_CONFIG.tvVersion || currentVersion : platform === "windows" ? nativeVersion || currentVersion : currentVersion;
      return {
        platform,
        currentVersion,
        installedVersion: installed,
        latestVersion: latest,
        available: latest !== null && compareVersions(latest, installed) > 0,
        webAvailable,
        registration: registration2,
        releaseUnavailable,
        tvPackaged,
        downloadURL: platform === "windows" ? WINDOWS_SETUP2 : platform === "android" ? ANDROID_APK2 : null,
        portableURL: platform === "windows" ? WINDOWS_PORTABLE2 : null
      };
    } finally {
      clearTimeout(timer);
    }
  }
  async function applyWebUpdate(registration2, { reload = () => globalThis.location.reload(), serviceWorker = globalThis.navigator?.serviceWorker } = {}) {
    if (!registration2?.waiting) {
      reload();
      return;
    }
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        serviceWorker?.removeEventListener?.("controllerchange", finish);
        resolve();
      };
      const timer = setTimeout(finish, 5e3);
      serviceWorker?.addEventListener?.("controllerchange", finish, { once: true });
      registration2.waiting.postMessage({ type: "SKIP_WAITING" });
    });
    reload();
  }
  function createUpdateMonitor({ onUpdate = () => {
  }, check = checkForUpdates, intervalMs = 6e4, document: document2 = globalThis.document, online = () => globalThis.navigator?.onLine !== false } = {}) {
    let active2 = false, timer = null, busy = false, lastVersion = "", lastCheck = 0, generation = 0;
    async function poll() {
      if (!active2 || busy || document2?.hidden || !online()) return;
      busy = true;
      const token = generation;
      try {
        const result = await check();
        if (!active2 || token !== generation) return;
        lastCheck = Date.now();
        if ((result.available || result.webAvailable) && lastVersion !== result.latestVersion) {
          lastVersion = result.latestVersion;
          await onUpdate(result);
        }
      } catch {
      } finally {
        busy = false;
      }
    }
    const visible = () => {
      if (!document2?.hidden && Date.now() - lastCheck >= 6e4) void poll();
    };
    return { poll, start() {
      if (active2) return;
      active2 = true;
      generation++;
      document2?.addEventListener?.("visibilitychange", visible);
      timer = setInterval(() => void poll(), Math.max(6e4, intervalMs));
      void poll();
    }, stop() {
      active2 = false;
      generation++;
      clearInterval(timer);
      document2?.removeEventListener?.("visibilitychange", visible);
    } };
  }
  var init_updates = __esm({
    "tv/samsung/app/updates.js?site=2.1"() {
      init_core2();
      init_distribution();
    }
  });

  // tv/samsung/app/notifications.js
  function hash(value) {
    let result = 2166136261;
    for (const char of value) {
      result ^= char.codePointAt(0);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }
  function notificationID(value) {
    const raw = cleanText(value, 1024);
    return "abbeedo-" + (raw && /^[a-z\d_.-]{1,110}$/i.test(raw) ? raw : raw ? hash(raw) : `${Date.now().toString(36)}-${++anonymousID}`);
  }
  function safeURL3(value) {
    if (typeof value !== "string" || value.length > 2048) return void 0;
    try {
      const base = new URL(globalThis.location?.href || "https://localhost/");
      const target = new URL(value, base);
      return /^https?:$/.test(target.protocol) && target.origin === base.origin && !target.username && !target.password ? target.href : void 0;
    } catch {
      return void 0;
    }
  }
  function payloadFor(input = {}) {
    const value = {
      id: notificationID(input.id),
      title: cleanText(input.title, 160) || (globalThis.document?.documentElement?.lang === "ar" ? "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV" : "abbeedo TV"),
      body: cleanText(input.body, 1e3)
    };
    const url = safeURL3(input.url);
    if (url) value.url = url;
    return value;
  }
  async function requestNotificationPermission() {
    try {
      if (isNative()) {
        const granted = allowed(await nativeRequest("requestNotifications", {}));
        nativePermission.set("native-ios", granted);
        return { granted, mode: "native-ios", reason: granted ? "granted" : "denied" };
      }
      const bridge = desktopBridge();
      if (typeof bridge?.setNotificationsEnabled === "function") {
        const result = await bridge.setNotificationsEnabled(true);
        const granted = result?.ok === true && result?.enabled === true && result?.supported !== false;
        return { granted, mode: "native-windows", reason: granted ? "granted" : result?.supported === false ? "unsupported" : "denied" };
      }
      if (typeof bridge?.requestNotifications === "function") {
        const granted = allowed(await bridge.requestNotifications());
        nativePermission.set("native-windows", granted);
        return { granted, mode: "native-windows", reason: granted ? "granted" : "denied" };
      }
      if (globalThis.isSecureContext === false) return { granted: false, mode: "unavailable", reason: "insecure-context" };
      if (isIOS() && !standalone()) return { granted: false, mode: "unavailable", reason: "install-required" };
      const api2 = globalThis.Notification;
      if (!api2 || typeof api2.requestPermission !== "function") return { granted: false, mode: "unavailable", reason: "unsupported" };
      const permission = api2.permission === "granted" || api2.permission === "denied" ? api2.permission : await api2.requestPermission();
      return { granted: permission === "granted", mode: "web", reason: permission === "granted" ? "granted" : permission === "denied" ? "denied" : "dismissed" };
    } catch {
      return { granted: false, mode: "unavailable", reason: "unavailable" };
    }
  }
  async function registration() {
    const worker = globalThis.navigator?.serviceWorker;
    if (!worker) return null;
    try {
      if (typeof worker.getRegistration === "function") return await worker.getRegistration();
      if (typeof worker.getRegistrations === "function") return (await worker.getRegistrations())[0] || null;
      if (worker.controller && worker.ready) return await worker.ready;
    } catch {
    }
    return null;
  }
  async function deliverNotification(input) {
    try {
      const value = payloadFor(input);
      if (isNative()) {
        if (nativePermission.get("native-ios") === false) return { delivered: false, mode: "native-ios" };
        return { delivered: delivered(await nativeRequest("notify", value)), mode: "native-ios" };
      }
      const bridge = desktopBridge();
      if (typeof bridge?.notify === "function") {
        if (nativePermission.get("native-windows") === false) return { delivered: false, mode: "native-windows" };
        return { delivered: delivered(await bridge.notify(value)), mode: "native-windows" };
      }
      const api2 = globalThis.Notification;
      if (!api2 || api2.permission !== "granted" || globalThis.isSecureContext === false) return { delivered: false, mode: "unavailable" };
      const options = {
        body: value.body,
        tag: value.id,
        icon: "app-icon.png",
        badge: "app-icon.png",
        renotify: false,
        data: { url: value.url || safeURL3("/") }
      };
      const worker = await registration();
      if (typeof worker?.showNotification === "function") {
        try {
          await worker.showNotification(value.title, options);
          return { delivered: true, mode: "service-worker" };
        } catch {
        }
      }
      if (isMobile() || typeof api2 !== "function") return { delivered: false, mode: "unavailable" };
      const notification = new api2(value.title, options);
      notification.onclick = () => {
        try {
          notification.close?.();
          globalThis.focus?.();
          if (value.url) globalThis.location?.assign?.(value.url);
        } catch {
        }
      };
      return { delivered: true, mode: "web" };
    } catch {
      return { delivered: false, mode: "unavailable" };
    }
  }
  function storedIDs() {
    try {
      const raw = globalThis.localStorage?.getItem(SEEN_KEY);
      if (!raw || raw.length > 3e4) return { initialized: false, ids: [] };
      const data = JSON.parse(raw);
      return data?.version === 1 && data.initialized === true && Array.isArray(data.ids) ? { initialized: true, ids: data.ids.filter(validID).slice(-MAX_IDS) } : { initialized: false, ids: [] };
    } catch {
      return { initialized: false, ids: [] };
    }
  }
  function messagesFrom(data) {
    const now = Date.now(), rows = Array.isArray(data?.messages) ? data.messages.slice(-MAX_MESSAGES) : [];
    return rows.filter((row) => row && validID(row.id) && (!row.expiresAt || Number(row.expiresAt) > now)).map((row) => ({
      id: row.id,
      title: cleanText(row.title, 160),
      body: cleanText(row.body, 1e3),
      createdAt: Number.isFinite(Number(row.createdAt)) ? Number(row.createdAt) : 0,
      url: safeURL3(row.url)
    })).filter((row) => row.title || row.body).sort((a, b) => a.createdAt - b.createdAt);
  }
  async function limitedJSON(response) {
    if (!response || response.ok === false || Number(response.headers?.get?.("content-length")) > MAX_BYTES) return null;
    if (!response.body?.getReader) return response.json?.();
    const reader = response.body.getReader(), decoder3 = new TextDecoder();
    let text2 = "", size = 0;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        text2 += decoder3.decode(value, { stream: true });
      }
      return JSON.parse(text2 + decoder3.decode());
    } finally {
      reader.releaseLock?.();
    }
  }
  function abortable(value, signal) {
    if (!signal) return Promise.resolve(value);
    if (signal.aborted) return Promise.reject(new Error("aborted"));
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(value).then((result) => {
        signal.removeEventListener("abort", abort);
        resolve(result);
      }, (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      });
    });
  }
  function createAnnouncementMonitor({ fetcher = (...args) => globalThis.fetch(...args), endpoint = "/api/announcements", onMessage = () => {
  }, isEnabled = () => true, shouldDeliver = () => true, intervalMs = 6e4 } = {}) {
    const saved = storedIDs();
    let initialized = saved.initialized, seen = new Set(saved.ids), running = false, timer = null, timeout = null, controller2 = null, inFlight = null, inFlightGeneration = -1, generation = 0;
    const delay = Math.max(15e3, Math.min(9e5, Number(intervalMs) || 6e4));
    const doc = globalThis.document;
    const enabled = () => {
      try {
        return isEnabled() !== false;
      } catch {
        return false;
      }
    };
    const available = () => enabled() && doc?.hidden !== true && doc?.visibilityState !== "hidden" && globalThis.navigator?.onLine !== false;
    const clearTimer = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const clearRequest = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      controller2?.abort();
      controller2 = null;
    };
    const save = () => {
      seen = new Set([...seen].slice(-MAX_IDS));
      try {
        globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify({ version: 1, initialized: true, ids: [...seen] }));
      } catch {
      }
    };
    const schedule = () => {
      clearTimer();
      if (running && available()) timer = setTimeout(() => {
        timer = null;
        void poll();
      }, delay);
    };
    function activity() {
      clearTimer();
      if (!available()) {
        generation++;
        clearRequest();
        return;
      }
      if (running) void poll();
    }
    async function perform(token) {
      let request2;
      try {
        request2 = new URL(String(endpoint), globalThis.location?.href || "https://localhost/");
        if (!/^https?:$/.test(request2.protocol) || request2.username || request2.password) return { status: "unavailable", count: 0 };
        controller2 = new AbortController();
        const signal = controller2.signal;
        timeout = setTimeout(() => controller2?.abort(), 15e3);
        const response = await abortable(fetcher(request2.href, { cache: "no-store", credentials: "omit", signal }), signal);
        const data = await abortable(limitedJSON(response), signal);
        if (!data || !Array.isArray(data.messages)) return { status: "unavailable", count: 0 };
        if (!running || token !== generation || !available()) return { status: "paused", count: 0 };
        const messages2 = messagesFrom(data), fresh = [];
        for (const message of messages2) {
          if (!seen.has(message.id)) fresh.push(message);
          seen.add(message.id);
        }
        if (!initialized) {
          initialized = true;
          save();
          return { status: "seeded", count: 0 };
        }
        save();
        let count = 0;
        for (const message of fresh.slice(-MAX_ALERTS)) {
          if (!running || token !== generation || !available()) break;
          try {
            await onMessage(message);
          } catch {
          }
          let system = false;
          try {
            system = shouldDeliver() !== false;
          } catch {
          }
          if (system && running && token === generation && available()) await deliverNotification(message);
          count++;
        }
        return { status: "ok", count };
      } catch {
        return { status: "unavailable", count: 0 };
      } finally {
        clearRequest();
      }
    }
    function poll() {
      clearTimer();
      if (!running) return Promise.resolve({ status: "stopped", count: 0 });
      if (!available()) return Promise.resolve({ status: "paused", count: 0 });
      if (inFlight) return inFlightGeneration === generation ? inFlight : inFlight.then(() => poll());
      const token = generation;
      const job = perform(token).finally(() => {
        if (inFlight === job) inFlight = null;
        schedule();
      });
      inFlight = job;
      inFlightGeneration = token;
      return job;
    }
    function start() {
      if (!running) {
        running = true;
        generation++;
        doc?.addEventListener?.("visibilitychange", activity);
        globalThis.addEventListener?.("online", activity);
        globalThis.addEventListener?.("offline", activity);
      }
      return poll();
    }
    function stop() {
      running = false;
      generation++;
      clearTimer();
      clearRequest();
      doc?.removeEventListener?.("visibilitychange", activity);
      globalThis.removeEventListener?.("online", activity);
      globalThis.removeEventListener?.("offline", activity);
    }
    return Object.freeze({ start, stop, poll });
  }
  var SEEN_KEY, MAX_IDS, MAX_MESSAGES, MAX_ALERTS, MAX_BYTES, nativePermission, anonymousID, cleanText, isIOS, isMobile, standalone, desktopBridge, allowed, delivered, validID;
  var init_notifications = __esm({
    "tv/samsung/app/notifications.js"() {
      init_native();
      SEEN_KEY = "abbeedo-announcement-ids-v1";
      MAX_IDS = 200;
      MAX_MESSAGES = 30;
      MAX_ALERTS = 3;
      MAX_BYTES = 131072;
      nativePermission = /* @__PURE__ */ new Map();
      anonymousID = 0;
      cleanText = (value, limit) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, limit) : "";
      isIOS = () => /iPad|iPhone|iPod/i.test(globalThis.navigator?.userAgent || "") || globalThis.navigator?.platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1;
      isMobile = () => isIOS() || /Android/i.test(globalThis.navigator?.userAgent || "");
      standalone = () => globalThis.navigator?.standalone === true || globalThis.matchMedia?.("(display-mode: standalone)")?.matches === true;
      desktopBridge = () => globalThis.abunasserDesktop;
      allowed = (value) => value === true || value === "granted" || value?.granted === true || value?.authorized === true;
      delivered = (value) => value !== false && value?.delivered !== false && value?.ok !== false && value?.granted !== false && value?.authorized !== false;
      validID = (value) => typeof value === "string" && /^[a-z\d_-]{1,128}$/i.test(value);
    }
  });

  // tv/samsung/app/icons.js?release=1.1
  function arcGeometry(l, t, r, b, start, sweep) {
    const rx = (r - l) / 2, ry = (b - t) / 2, cx = (r + l) / 2, cy = (b + t) / 2;
    const a = start * Math.PI / 180, end = (start + sweep) * Math.PI / 180;
    return {
      rx,
      ry,
      cx,
      cy,
      end,
      x: cx + rx * Math.cos(end),
      y: cy + ry * Math.sin(end),
      d: `M${n(cx + rx * Math.cos(a))} ${n(cy + ry * Math.sin(a))}A${n(rx)} ${n(ry)} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep >= 0 ? 1 : 0} ${n(cx + rx * Math.cos(end))} ${n(cy + ry * Math.sin(end))}`
    };
  }
  function wedge(...args) {
    const a = arcGeometry(...args);
    return path(`${a.d}L${a.cx} ${a.cy}Z`, fill);
  }
  function arrow(x2, y, a, b) {
    const length = Math.hypot(a - x2, b - y);
    if (!length) return "";
    const dx = (a - x2) / length, dy = (b - y) / length;
    return line(x2, y, a, b) + chevron(a - dx * 6 - dy * 5, b - dy * 6 + dx * 5, a, b, a - dx * 6 + dy * 5, b - dy * 6 - dx * 5);
  }
  function circularArrow(...args) {
    const a = arcGeometry(...args), sign = args[5] >= 0 ? 1 : -1;
    const dx = -a.rx * Math.sin(a.end), dy = a.ry * Math.cos(a.end), length = Math.hypot(dx, dy);
    const tx = dx / length * sign, ty = dy / length * sign;
    return path(a.d) + chevron(a.x - tx * 6 - ty * 5, a.y - ty * 6 + tx * 5, a.x, a.y, a.x - tx * 6 + ty * 5, a.y - ty * 6 - tx * 5);
  }
  function corners(l, t, r, b) {
    const arm = Math.min(r - l, b - t) * 0.25;
    return chevron(l, t + arm, l, t, l + arm, t) + chevron(r - arm, t, r, t, r, t + arm) + chevron(l, b - arm, l, b, l + arm, b) + chevron(r - arm, b, r, b, r, b - arm);
  }
  function star(active2 = false) {
    return path(Array.from({ length: 10 }, (_, i) => {
      const angle = (-90 + i * 36) * Math.PI / 180, radius = i % 2 ? 9 : 20;
      return `${i ? "L" : "M"}${n(24 + radius * Math.cos(angle))} ${n(24 + radius * Math.sin(angle))}`;
    }).join("") + "Z", active2 ? fill : "");
  }
  function people(multiple = false) {
    return circle(21, 13, 7) + arc(7, 23, 35, 48, 180, 180) + (multiple ? arc(26, 6, 42, 21, -70, 210) + arc(32, 26, 46, 43, -90, 90) : "");
  }
  function homeArt(kind) {
    let drawing;
    if (kind === "live") {
      drawing = box(60, 36, 180, 112, 14) + triangle(108, 57, 108, 91, 139, 74, fill) + arc(36, 40, 74, 108, 115, 130) + arc(166, 40, 204, 108, -65, 130) + '<path d="M98 124H142" stroke="#e9f3ff"/>';
    } else if (kind === "movie") {
      drawing = `<g transform="rotate(-9 120 75)">${box(59, 30, 181, 121, 10)}${line(59, 51, 181, 51)}${Array.from({ length: 5 }, (_, i) => line(68 + i * 23, 30, 82 + i * 23, 50)).join("")}${triangle(108, 68, 108, 103, 139, 85, ' stroke="#fff"')}</g>`;
    } else {
      drawing = `<g opacity=".35294">${box(48, 26, 167, 104, 12)}</g><g opacity=".58824">${box(61, 35, 180, 113, 12)}</g>` + box(74, 44, 193, 122, 12, fill) + triangle(120, 62, 120, 103, 151, 82, ' fill="#0b111a" stroke="none"');
    }
    return `<g transform="translate(-6 5) scale(.25)">${drawing}</g>`;
  }
  function icon(name) {
    const key2 = Object.hasOwn(aliases, name) ? aliases[name] : Object.hasOwn(paths, name) ? name : "info";
    const home = key2 === "live" || key2 === "movie" || key2 === "series";
    return `<svg class="app-icon${home ? " app-icon--artwork" : ""}" data-app-icon="${key2}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key2]}</svg>`;
  }
  function paintIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      if (!el.querySelector(":scope > svg")) el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    });
  }
  var n, path, line, box, circle, chevron, triangle, fill, arc, finder, monitor, eye, cloud, heart, wave, paths, aliases, ICON_NAMES;
  var init_icons = __esm({
    "tv/samsung/app/icons.js?release=1.1"() {
      n = (value) => String(Math.round(value * 1e4) / 1e4);
      path = (d, attrs = "") => `<path d="${d}"${attrs}/>`;
      line = (x2, y, a, b) => path(`M${n(x2)} ${n(y)}L${n(a)} ${n(b)}`);
      box = (l, t, r, b, radius = 0, attrs = "") => `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" rx="${radius}"${attrs}/>`;
      circle = (x2, y, r, attrs = "") => `<circle cx="${x2}" cy="${y}" r="${r}"${attrs}/>`;
      chevron = (x2, y, a, b, u, v) => path(`M${n(x2)} ${n(y)}L${n(a)} ${n(b)}L${n(u)} ${n(v)}`);
      triangle = (x2, y, a, b, u, v, attrs = "") => path(`M${x2} ${y}L${a} ${b}L${u} ${v}Z`, attrs);
      fill = ' fill="currentColor" stroke="none"';
      arc = (...args) => path(arcGeometry(...args).d);
      finder = (x2, y) => box(x2, y, x2 + 14, y + 14, 1) + box(x2 + 5, y + 5, x2 + 9, y + 9);
      monitor = () => box(4, 5, 44, 35, 4) + line(24, 35, 24, 42) + line(15, 43, 33, 43);
      eye = () => path("M3 24Q24 2 45 24Q24 46 3 24Z") + circle(24, 24, 7);
      cloud = () => path("M13 33C0 33 0 17 12 17C13 3 34 3 36 17C48 17 48 33 36 33");
      heart = (active2 = false) => path("M24 41C18 36 5 27 5 16C5 5 19 3 24 13C29 3 43 5 43 16C43 27 30 36 24 41Z", active2 ? fill : "");
      wave = (y) => path(`M5 ${y}C13 ${y - 7} 19 ${y + 7} 27 ${y}C33 ${y - 5} 37 ${y - 5} 43 ${y}`);
      paths = {
        accounts: people(true),
        profiles: people() + box(29, 27, 44, 42, 3) + line(33, 32, 40, 32) + line(33, 37, 39, 37),
        account: box(5, 9, 43, 39, 4) + circle(16, 20, 4) + arc(8, 25, 24, 36, 190, 160) + line(29, 18, 37, 18) + line(29, 25, 37, 25) + line(29, 32, 34, 32),
        qr: finder(5, 5) + finder(29, 5) + finder(5, 29) + box(30, 30, 35, 35) + line(41, 29, 41, 36) + line(29, 41, 36, 41) + line(40, 41, 43, 41),
        remote: box(13, 3, 35, 45, 7) + circle(24, 19, 7) + circle(24, 19, 1.2) + line(24, 9, 24, 12) + line(24, 26, 24, 29) + line(14, 19, 17, 19) + line(31, 19, 34, 19) + line(19, 36, 21, 36) + line(27, 36, 29, 36),
        language: circle(24, 24, 19) + '<ellipse cx="24" cy="24" rx="8" ry="19"/>' + line(5, 24, 43, 24) + arc(6, 7, 42, 25, 15, 150) + arc(6, 23, 42, 41, 195, 150),
        palette: path("M24 4C1 4-2 33 15 41C26 47 31 39 26 34C22 29 31 27 37 29C49 31 47 7 24 4Z") + [[15, 13], [30, 12], [10, 25], [37, 21]].map(([x2, y]) => circle(x2, y, 2)).join(""),
        theme: circle(24, 24, 17) + wedge(7, 7, 41, 41, 90, 180) + line(24, 7, 24, 41),
        motion: wave(11) + wave(23) + wave(35) + arrow(35, 8, 43, 8),
        reduced: circle(24, 24, 18) + line(18, 15, 18, 33) + line(30, 15, 30, 33),
        text: line(5, 12, 29, 12) + line(17, 12, 17, 39) + line(10, 39, 24, 39) + line(36, 11, 36, 39) + chevron(32, 15, 36, 11, 40, 15) + chevron(32, 35, 36, 39, 40, 35),
        contrast: circle(24, 24, 15) + wedge(9, 9, 39, 39, -90, 180) + Array.from({ length: 8 }, (_, i) => {
          const a = i * Math.PI / 4;
          return line(24 + 20 * Math.cos(a), 24 + 20 * Math.sin(a), 24 + 22 * Math.cos(a), 24 + 22 * Math.sin(a));
        }).join(""),
        layout: box(4, 9, 44, 39, 4) + line(16, 9, 16, 39) + line(32, 9, 32, 39),
        start: monitor() + triangle(20, 13, 20, 29, 32, 21),
        screensaver: monitor() + circle(24, 21, 9) + line(24, 15, 24, 21) + line(24, 21, 29, 24),
        timer: circle(24, 27, 16) + line(19, 4, 29, 4) + line(24, 4, 24, 11) + line(35, 11, 39, 7) + line(24, 16, 24, 27) + line(24, 27, 31, 31),
        decoder: box(11, 11, 37, 37, 3) + box(17, 17, 31, 31, 2) + [16, 24, 32].map((v) => line(v, 4, v, 11) + line(v, 37, v, 44) + line(4, v, 11, v) + line(37, v, 44, v)).join(""),
        aspect: corners(5, 10, 43, 38) + arrow(13, 24, 35, 24) + arrow(35, 24, 13, 24),
        buffer: box(5, 10, 43, 38, 4) + [11, 19, 27, 35].map((v) => box(v, 18, v + 4, 31, 0, fill)).join(""),
        seek: chevron(6, 14, 18, 24, 6, 34) + chevron(23, 14, 35, 24, 23, 34) + line(42, 12, 42, 36),
        next: triangle(11, 9, 11, 39, 33, 24) + line(39, 9, 39, 39),
        data: arrow(14, 6, 14, 34) + line(7, 41, 41, 41) + line(25, 35, 25, 27) + line(32, 35, 32, 20) + line(39, 35, 39, 12),
        categories: [7, 27].flatMap((y) => [7, 27].map((x2) => box(x2, y, x2 + 14, y + 14, 3))).join(""),
        refresh: circularArrow(7, 7, 41, 41, 45, 285),
        guide: box(5, 8, 43, 40, 4) + line(5, 18, 43, 18) + line(17, 18, 17, 40) + line(28, 18, 28, 40) + line(5, 29, 43, 29) + line(14, 4, 14, 11) + line(34, 4, 34, 11),
        pin: box(10, 20, 38, 43, 4) + arc(15, 4, 33, 35, 180, 180) + line(15, 19, 15, 14) + line(33, 19, 33, 14) + [17, 24, 31].map((v) => circle(v, 31, 1)).join(""),
        parental: circle(17, 11, 6) + arc(5, 19, 29, 43, 180, 180) + circle(34, 24, 4) + arc(26, 30, 43, 47, 180, 180),
        hidden: eye() + line(5, 5, 43, 43),
        privacy: path("M24 4L41 11L38 28Q35 39 24 45Q13 39 10 28L7 11Z") + line(24, 14, 24, 27) + circle(24, 33, 1),
        history: circularArrow(8, 7, 42, 41, -100, 300) + line(25, 14, 25, 25) + line(25, 25, 33, 29),
        backup: cloud() + arrow(24, 39, 24, 21),
        restore: cloud() + arrow(24, 21, 24, 40),
        delete: box(12, 12, 36, 43, 3) + line(8, 11, 40, 11) + line(18, 5, 30, 5) + line(20, 20, 20, 35) + line(28, 20, 28, 35),
        support: arc(7, 5, 41, 39, 180, 180) + box(5, 22, 13, 35, 3) + box(35, 22, 43, 35, 3) + line(39, 35, 39, 39) + line(39, 39, 27, 42) + line(23, 42, 28, 42),
        network: arc(3, 7, 45, 49, 220, 100) + arc(10, 17, 38, 45, 220, 100) + arc(18, 29, 30, 41, 220, 100) + circle(24, 40, 2, fill),
        tools: path("M32 4C17 2 14 14 20 22L5 37L11 43L27 27C41 31 48 17 42 10L33 18L27 12L35 4"),
        setup: box(7, 5, 41, 43, 4) + [14, 24, 34].map((y) => chevron(12, y, 15, y + 3, 19, y - 3) + line(25, y, 35, y)).join(""),
        demo: box(5, 8, 43, 40, 5) + triangle(19, 15, 19, 33, 32, 24),
        update: circularArrow(6, 7, 42, 43, 40, 280) + arrow(24, 36, 24, 15),
        notifications: path("M8 35L12 29L12 19C12 4 36 4 36 19L36 29L40 35Z") + arc(18, 34, 30, 46, 0, 180),
        filter: [16, 32, 22].map((v, i) => line(5, 10 + i * 14, v - 5, 10 + i * 14) + line(v + 5, 10 + i * 14, 43, 10 + i * 14) + circle(v, 10 + i * 14, 4)).join(""),
        voice: box(17, 4, 31, 31, 7) + arc(11, 13, 37, 39, 0, 180) + line(11, 20, 11, 26) + line(37, 20, 37, 26) + line(24, 39, 24, 44) + line(16, 44, 32, 44),
        favorite: heart(),
        favorite_active: heart(true),
        watchlist: star(),
        watchlist_active: star(true),
        sort: arrow(14, 7, 14, 40) + arrow(34, 40, 34, 7),
        close: line(12, 12, 36, 36) + line(36, 12, 12, 36),
        previous_channel: arrow(24, 40, 24, 8),
        next_channel: arrow(24, 8, 24, 40),
        logout: box(7, 5, 27, 43, 3) + line(25, 24, 44, 24) + chevron(36, 16, 44, 24, 36, 32),
        help: circle(24, 24, 19) + path("M17 16C17 6 34 8 32 18C31 23 24 23 24 29") + circle(24, 36, 1),
        live: homeArt("live"),
        movie: homeArt("movie"),
        series: homeArt("series"),
        // Web-only controls retain the same round-ended, 48-unit stroke system.
        settings: path("M19 6L17.8 10A16 16 0 0 0 14.8 11.8L10.8 10.8L6.8 17.6L9.6 20.6A16 16 0 0 0 9.6 24.2L6.8 27.2L10.8 34L14.8 33A16 16 0 0 0 17.8 34.8L19 38.8H27L28.2 34.8A16 16 0 0 0 31.2 33L35.2 34L39.2 27.2L36.4 24.2A16 16 0 0 0 36.4 20.6L39.2 17.6L35.2 10.8L31.2 11.8A16 16 0 0 0 28.2 10L27 6Z") + circle(23, 22, 6),
        back: chevron(18, 12, 30, 24, 18, 36),
        search: circle(21, 21, 13) + line(32, 32, 42, 42),
        download: arrow(24, 5, 24, 30) + path("M7 33V42H41V33"),
        upload: arrow(24, 31, 24, 6) + path("M7 33V42H41V33"),
        eye: eye(),
        play: triangle(16, 6, 16, 42, 42, 24),
        number: path("M18 4L10 44M38 4L30 44M4 18H44M2 32H42"),
        rewind: chevron(22, 10, 4, 24, 22, 38) + chevron(44, 10, 26, 24, 44, 38),
        forward: chevron(4, 10, 22, 24, 4, 38) + chevron(26, 10, 44, 24, 26, 38),
        subtitles: box(4, 8, 44, 40, 4) + path("M10 20H18M24 20H38M10 30H26M32 30H38"),
        pip: box(4, 6, 44, 42, 4) + box(24, 24, 40, 38, 2),
        fullscreen: corners(6, 6, 42, 42),
        camera: path("M4 14H14L18 8H30L34 14H44V42H4Z") + circle(24, 28, 8),
        copy: box(16, 16, 43, 43, 2) + path("M8 32H4V4H32V8"),
        chat: path("M6 6H42V34H18L6 44Z") + line(14, 16, 34, 16) + line(14, 26, 28, 26),
        info: circle(24, 24, 19) + line(24, 22, 24, 36) + circle(24, 13, 1, fill),
        check: chevron(6, 24, 18, 36, 42, 12)
      };
      aliases = Object.freeze({ heart: "favorite", star: "watchlist", bookmark: "watchlist", calendar: "guide", friends: "accounts", up: "previous_channel", down: "next_channel" });
      ICON_NAMES = Object.freeze([...Object.keys(paths), ...Object.keys(aliases)].sort());
    }
  });

  // tv/samsung/app/player.js?release=1.1
  function mediaType(source = {}) {
    const mime = String(source.mime || source.type || "").split(";")[0].trim().toLowerCase();
    if (MIME_HLS.test(mime)) return "hls";
    if (MIME_TS.test(mime)) return /flv/.test(mime) ? "flv" : "ts";
    if (mime && /^(video|audio)\//.test(mime)) return "file";
    try {
      const path2 = new URL(String(source.url), "https://app.invalid").pathname.toLowerCase();
      if (/\.m3u8?$/.test(path2)) return "hls";
      if (/\.(ts|mts|m2ts)$/.test(path2)) return "ts";
      if (/\.flv$/.test(path2)) return "flv";
    } catch {
    }
    return "file";
  }
  function validMediaURL(value, { offline = false, base = globalThis.location?.href || "https://app.invalid/" } = {}) {
    try {
      const url = new URL(String(value), base);
      if (offline && url.protocol === "blob:") return url.href;
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
      if (globalThis.location?.protocol === "https:" && url.protocol === "http:") return null;
      return url.href;
    } catch {
      return null;
    }
  }
  function boundedAlternatives(source = {}) {
    const initial = validMediaURL(source.url, source);
    if (!initial) return [];
    const seen = /* @__PURE__ */ new Set([initial]);
    const output = [{ ...source, url: initial }];
    for (const candidate of Array.isArray(source.alternatives) ? source.alternatives : []) {
      const entry = typeof candidate === "string" ? { url: candidate } : candidate;
      if (!entry || typeof entry !== "object") continue;
      const url = validMediaURL(entry.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      output.push({ ...entry, url });
      if (output.length === 2) break;
    }
    return output;
  }
  function playableRate(rate, live = false) {
    if (live) return 1;
    const value = Number(rate);
    if (!RATES.includes(value)) throw new RangeError("Unsupported playback rate");
    return value;
  }
  function loadScript(kind) {
    const globalName = kind === "hls" ? "Hls" : "mpegts";
    if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    if (!globalThis.document) return Promise.reject(new Error("Media engine unavailable"));
    if (!scripts.has(kind)) scripts.set(kind, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = VENDOR[kind];
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        scripts.delete(kind);
        reject(new Error("Media engine timed out"));
      }, 1e4);
      script.onload = () => {
        clearTimeout(timer);
        globalThis[globalName] ? resolve(globalThis[globalName]) : reject(new Error("Media engine unavailable"));
      };
      script.onerror = () => {
        clearTimeout(timer);
        scripts.delete(kind);
        reject(new Error("Media engine unavailable"));
      };
      document.head.append(script);
    }));
    return scripts.get(kind);
  }
  function safeInvoke(callback, ...args) {
    try {
      callback?.(...args);
    } catch {
    }
  }
  function nativeAvailable() {
    return !!globalThis.webkit?.messageHandlers?.abunasser;
  }
  async function native(method, payload = {}) {
    if (!nativeAvailable()) throw new Error("Native action unavailable");
    const bridge = await Promise.resolve().then(() => (init_native(), native_exports));
    return bridge.nativeRequest(method, payload);
  }
  function failMessage(code, status, language) {
    if (language === "en") {
      if (status === 401 || status === 403) return `The provider rejected playback (HTTP ${status}). Check the subscription or connection limit.`;
      if (status) return `Playback request failed (HTTP ${status}).`;
      if (code === "UNSUPPORTED") return "This device cannot play this container or codec. A supported source or external player is required.";
      return "Playback could not start. Check the connection and source.";
    }
    if (status === 401 || status === 403) return `\u0631\u0641\u0636 \u0627\u0644\u0645\u0635\u062F\u0631 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 (HTTP ${status}). \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0623\u0648 \u0639\u062F\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D.`;
    if (status) return `\u062A\u0639\u0630\u0631 \u0637\u0644\u0628 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 (HTTP ${status}).`;
    if (code === "UNSUPPORTED") return "\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u0623\u0648 \u0627\u0644\u0635\u0648\u062A \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u062C\u0631\u0651\u0628 \u0645\u0635\u062F\u0631\u064B\u0627 \u0645\u062A\u0648\u0627\u0641\u0642\u064B\u0627 \u0623\u0648 \u0645\u0634\u063A\u0651\u0644\u064B\u0627 \u062E\u0627\u0631\u062C\u064A\u064B\u0627.";
    return "\u062A\u0639\u0630\u0631 \u0628\u062F\u0621 \u0627\u0644\u062A\u0634\u063A\u064A\u0644. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0645\u0635\u062F\u0631.";
  }
  function createPlayer({ video, onStatus, onProgress, onEnded, onError } = {}) {
    if (!video || typeof video.addEventListener !== "function") throw new TypeError("A video element is required");
    let transportGeneration = 0;
    let generation = 0, item = null, source = null, context = {}, candidates = [], attempt = 0, engine = null, engineKind = "", listeners = [];
    let rate = 1, position = 0, playing = false, nativeMode = false, nativeAttempted = false, progressTimer = null, sleepTimer2 = null, startTimer = null, objectURL = null;
    let recorder = null, recordingPromise = null, recordingTimer = null;
    let configuration = { aspect: "fit", buffer: "balanced", dataSaver: false, language: "ar", nativeFallback: true };
    const state2 = () => ({ item, position: nativeMode ? position : Number(video.currentTime) || 0, duration: nativeMode ? Number(context.nativeDuration) || 0 : Number.isFinite(video.duration) ? video.duration : 0, rate, playing, native: nativeMode, live: item?.kind === "live", engine: engineKind });
    const status = (text2) => safeInvoke(onStatus, text2);
    const progress = () => {
      if (item) safeInvoke(onProgress, state2());
    };
    function listen(name, fn) {
      video.addEventListener(name, fn);
      listeners.push([name, fn]);
    }
    function cleanupEngine() {
      if (recorder?.state === "recording") recorder.stop();
      clearTimeout(recordingTimer);
      transportGeneration++;
      clearTimeout(startTimer);
      startTimer = null;
      clearInterval(progressTimer);
      progressTimer = null;
      for (const [event, listener] of listeners) video.removeEventListener(event, listener);
      listeners = [];
      try {
        if (engineKind === "hls") engine?.destroy();
        else {
          engine?.pause?.();
          engine?.unload?.();
          engine?.detachMediaElement?.();
          engine?.destroy?.();
        }
      } catch {
      }
      engine = null;
      engineKind = "";
      video.pause?.();
      video.removeAttribute?.("src");
      video.load?.();
      if (objectURL) {
        URL.revokeObjectURL(objectURL);
        objectURL = null;
      }
    }
    function applySettings() {
      const aspect = configuration.aspect;
      if (video.style) {
        video.style.objectFit = aspect === "fill" || aspect === "zoom" ? "cover" : aspect === "original" ? "none" : "contain";
        video.style.transform = aspect === "zoom" ? "scale(1.12)" : "";
      }
      if (engineKind === "hls" && engine) {
        const levels = engine.levels || [];
        let cap = -1;
        if (configuration.dataSaver) {
          for (let n2 = 0; n2 < levels.length; n2++) if ((levels[n2].height || 0) <= 480 && (levels[n2].bitrate || 0) <= 1e6) cap = n2;
        }
        engine.autoLevelCapping = cap;
      }
    }
    async function useNative() {
      if (!item || !nativeAvailable()) return false;
      const token = generation, current2 = candidates[attempt] || source, seek = item.kind === "live" ? 0 : Number(video.currentTime) || position;
      cleanupEngine();
      rate = Math.min(2, Math.max(0.5, rate));
      nativeMode = true;
      engineKind = "native";
      nativeAttempted = true;
      try {
        await native("play", { id: item.id, url: current2.url, title: item.name || "", kind: item.kind, position: seek, rate, playlist: (context.playlist || []).map((row) => ({ id: row.id, name: row.name || row.title || "", title: row.name || row.title || "", group: row.group || "", kind: row.kind })) });
        if (token !== generation) return false;
        status(configuration.language === "en" ? "Opened in the iPhone player" : "\u0641\u064F\u062A\u062D \u0641\u064A \u0645\u0634\u063A\u0651\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646");
        return true;
      } catch (error) {
        if (token === generation) {
          nativeMode = false;
          engineKind = "";
          status(configuration.language === "en" ? "The native player could not open this source." : "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u0645\u0635\u062F\u0631 \u0641\u064A \u0645\u0634\u063A\u0651\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646.");
        }
        return false;
      }
    }
    async function failed(code, httpStatus = 0, token = generation, transport = transportGeneration) {
      if (token !== generation || transport !== transportGeneration || !item) return;
      if (attempt + 1 < candidates.length && ["HTTP", "FORMAT", "UNSUPPORTED", "MANIFEST", "NETWORK"].includes(code)) {
        attempt++;
        status(configuration.language === "en" ? "Trying the source\u2019s alternative format\u2026" : "\u062C\u0627\u0631\u064D \u062A\u062C\u0631\u0628\u0629 \u0635\u064A\u063A\u0629 \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u0644\u0628\u062F\u064A\u0644\u0629\u2026");
        await startCandidate(token);
        return;
      }
      if ((code === "UNSUPPORTED" || code === "FORMAT") && !nativeAttempted && configuration.nativeFallback && nativeAvailable()) {
        if (await useNative()) return;
      }
      if (token !== generation) return;
      playing = false;
      clearTimeout(startTimer);
      const error = { code, httpStatus: Number(httpStatus) || 0, message: failMessage(code, Number(httpStatus) || 0, configuration.language), recoverable: true };
      cleanupEngine();
      status(error.message);
      safeInvoke(onError, error);
    }
    async function startCandidate(token) {
      cleanupEngine();
      if (token !== generation) return;
      const transport = transportGeneration;
      const current2 = () => token === generation && transport === transportGeneration;
      nativeMode = false;
      const candidate = candidates[attempt], kind = mediaType(candidate);
      let resumed = false;
      if (candidate.offline && candidate.url.startsWith("blob:")) objectURL = candidate.url;
      if (nativeAvailable()) video.removeAttribute?.("crossorigin");
      video.playsInline = true;
      video.setAttribute?.("playsinline", "");
      video.setAttribute?.("webkit-playsinline", "");
      video.preload = "metadata";
      const active2 = (fn) => (...args) => {
        if (current2() && item && !nativeMode) fn(...args);
      };
      listen("loadedmetadata", active2(() => {
        if (!resumed && item.kind !== "live" && position > 0 && Number.isFinite(video.duration) && position < video.duration - 3) {
          try {
            video.currentTime = position;
          } catch {
          }
        }
        resumed = true;
        try {
          video.playbackRate = rate;
        } catch {
        }
        applySettings();
      }));
      listen("playing", active2(() => {
        playing = true;
        clearTimeout(startTimer);
        status(configuration.language === "en" ? "Playing" : "\u064A\u0639\u0645\u0644 \u0627\u0644\u0622\u0646");
        progress();
      }));
      listen("pause", active2(() => {
        playing = false;
        progress();
      }));
      listen("waiting", active2(() => status(configuration.language === "en" ? "Buffering\u2026" : "\u062C\u0627\u0631\u064D \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u0628\u062B\u2026")));
      listen("ended", active2(() => {
        playing = false;
        progress();
        safeInvoke(onEnded, item);
      }));
      listen("timeupdate", active2(() => {
        position = Number(video.currentTime) || 0;
      }));
      listen("ratechange", active2(() => {
        if (Number.isFinite(video.playbackRate)) rate = video.playbackRate;
        progress();
      }));
      listen("error", active2(() => {
        const code = Number(video.error?.code);
        if (code === 1) return;
        failed(code === 4 ? "UNSUPPORTED" : code === 3 ? "FORMAT" : "NETWORK", 0, token, transport);
      }));
      progressTimer = setInterval(progress, 1e4);
      startTimer = setTimeout(() => {
        if (token === generation && !playing) status(configuration.language === "en" ? "The source is taking longer. You can retry or change the channel." : "\u0627\u0644\u0645\u0635\u062F\u0631 \u064A\u062A\u0623\u062E\u0631 \u0641\u064A \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629. \u064A\u0645\u0643\u0646\u0643 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0623\u0648 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0642\u0646\u0627\u0629.");
      }, 7e3);
      const start = async () => {
        if (!current2()) return;
        try {
          await video.play();
        } catch (error) {
          if (!current2() || error?.name === "AbortError") return;
          if (error?.name === "NotAllowedError") status(configuration.language === "en" ? "Press play to begin." : "\u0627\u0636\u063A\u0637 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0644\u0628\u062F\u0621 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.");
          else await failed(error?.name === "NotSupportedError" ? "UNSUPPORTED" : "NETWORK", 0, token, transport);
        }
      };
      try {
        if (kind === "hls" && video.canPlayType?.("application/vnd.apple.mpegurl")) {
          engineKind = "native-hls";
          video.src = candidate.url;
          await start();
        } else if (kind === "hls") {
          const Hls = await loadScript("hls");
          if (!current2()) return;
          if (!Hls.isSupported()) {
            await failed("UNSUPPORTED", 0, token, transport);
            return;
          }
          const low = configuration.buffer === "low", stable = configuration.buffer === "stable";
          const hls = new Hls({ enableWorker: true, lowLatencyMode: low, maxBufferLength: low ? 10 : stable ? 60 : 30, maxMaxBufferLength: stable ? 120 : 60, manifestLoadingTimeOut: 8e3, manifestLoadingMaxRetry: 0, fragLoadingMaxRetry: 1, xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          } });
          engine = hls;
          engineKind = "hls";
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (current2()) hls.loadSource(candidate.url);
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (current2()) {
              applySettings();
              start();
            }
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!current2() || !data.fatal) return;
            const http = Number(data.response?.code || data.networkDetails?.status) || 0;
            failed(http ? "HTTP" : data.type === Hls.ErrorTypes.MEDIA_ERROR ? "FORMAT" : "MANIFEST", http, token, transport);
          });
        } else if (kind === "ts" || kind === "flv") {
          const mpegts = await loadScript("ts");
          if (!current2()) return;
          if (!mpegts.isSupported?.()) {
            await failed("UNSUPPORTED", 0, token, transport);
            return;
          }
          engineKind = "ts";
          engine = mpegts.createPlayer({ type: kind === "flv" ? "flv" : "mpegts", url: candidate.url, isLive: item.kind === "live", cors: true, withCredentials: false }, { enableWorker: true, enableStashBuffer: configuration.buffer !== "low", lazyLoad: item.kind !== "live", autoCleanupSourceBuffer: true });
          engine.on(mpegts.Events.ERROR, (type, detail, info) => {
            const http = Number(info?.code || info?.status) || 0;
            failed(http >= 400 ? "HTTP" : type === mpegts.ErrorTypes.MEDIA_ERROR ? "FORMAT" : "NETWORK", http >= 400 ? http : 0, token, transport);
          });
          engine.attachMediaElement(video);
          engine.load();
          await start();
        } else {
          engineKind = "file";
          video.src = candidate.url;
          await start();
        }
      } catch (error) {
        if (current2()) await failed("UNSUPPORTED", 0, token, transport);
      }
    }
    const nativeEvent = (event) => {
      const detail = event.detail || {};
      if (!nativeMode || !item || (detail.itemId || detail.id) && (detail.itemId || detail.id) !== item.id) return;
      if (detail.type === "progress") {
        position = Number(detail.position) || 0;
        context.nativeDuration = Number(detail.duration) || 0;
        if (detail.rate) rate = Number(detail.rate);
        progress();
      }
      if (detail.type === "playing") {
        playing = true;
        progress();
      }
      if (detail.type === "paused") {
        playing = false;
        progress();
      }
      if (detail.type === "stopped" && detail.userDismissed) {
        playing = false;
        progress();
        nativeMode = false;
        engineKind = "";
      }
      if (detail.type === "ended") {
        playing = false;
        progress();
        safeInvoke(onEnded, item);
      }
      if (detail.type === "error") {
        if (attempt + 1 < candidates.length) {
          attempt++;
          void useNative();
          return;
        }
        playing = false;
        const error = { code: String(detail.code || "NATIVE"), httpStatus: Number(detail.httpStatus) || 0, message: failMessage("UNSUPPORTED", Number(detail.httpStatus) || 0, configuration.language), recoverable: true };
        status(error.message);
        safeInvoke(onError, error);
      }
    };
    globalThis.addEventListener?.("abunasser:native", nativeEvent);
    return {
      async play(nextItem, resolved, options = {}) {
        const continueNative = nativeMode;
        generation++;
        cleanupEngine();
        item = nextItem;
        source = resolved || {};
        context = { ...options };
        candidates = boundedAlternatives(source);
        attempt = 0;
        nativeMode = false;
        nativeAttempted = false;
        playing = false;
        position = nextItem?.kind === "live" ? 0 : Math.max(0, Number(options.position) || 0);
        rate = playableRate(options.rate ?? 1, nextItem?.kind === "live");
        if (!item || !candidates.length) {
          if (continueNative) native("stop").catch(() => {
          });
          const error = { code: "SOURCE", httpStatus: 0, message: configuration.language === "en" ? "A safe playback URL is required." : "\u0644\u0645 \u064A\u0648\u0641\u0631 \u0627\u0644\u0645\u0635\u062F\u0631 \u0631\u0627\u0628\u0637 \u062A\u0634\u063A\u064A\u0644 \u0635\u0627\u0644\u062D\u064B\u0627 \u0648\u0622\u0645\u0646\u064B\u0627.", recoverable: true };
          status(error.message);
          safeInvoke(onError, error);
          return false;
        }
        status(configuration.language === "en" ? "Connecting\u2026" : "\u062C\u0627\u0631\u064D \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0628\u062B\u2026");
        if ((source.nativePreferred || continueNative) && nativeAvailable() && await useNative()) return true;
        await startCandidate(generation);
        return true;
      },
      stop() {
        progress();
        generation++;
        if (nativeMode) native("stop").catch(() => {
        });
        cleanupEngine();
        clearTimeout(sleepTimer2);
        sleepTimer2 = null;
        item = null;
        source = null;
        position = 0;
        playing = false;
        nativeMode = false;
      },
      pause() {
        if (nativeMode) return native("pause");
        video.pause();
      },
      resume() {
        if (nativeMode) return native("resume");
        return video.play();
      },
      seek(seconds) {
        if (!item || item.kind === "live") return false;
        const value = Math.max(0, Number(seconds) || 0), duration = state2().duration;
        const target = duration ? Math.min(value, Math.max(0, duration - 0.1)) : value;
        if (nativeMode) return native("seek", { position: target });
        video.currentTime = target;
        position = target;
        progress();
        return true;
      },
      setRate(nextRate) {
        rate = playableRate(nextRate, item?.kind === "live");
        if (nativeMode) return native("rate", { rate });
        video.playbackRate = rate;
        progress();
        return rate;
      },
      configure(settings = {}) {
        configuration = { ...configuration, ...settings };
        applySettings();
      },
      getState: state2,
      getTracks() {
        if (nativeMode) return { audio: [], subtitles: [], quality: [], systemManaged: true };
        if (engineKind === "hls" && engine) return { audio: (engine.audioTracks || []).map((t, n2) => ({ id: n2, label: t.name || t.lang || `Audio ${n2 + 1}`, language: t.lang || "", selected: engine.audioTrack === n2 })), subtitles: [{ id: -1, label: configuration.language === "en" ? "Off" : "\u0625\u064A\u0642\u0627\u0641", selected: engine.subtitleTrack < 0 }, ...(engine.subtitleTracks || []).map((t, n2) => ({ id: n2, label: t.name || t.lang || `Subtitle ${n2 + 1}`, language: t.lang || "", selected: engine.subtitleTrack === n2 }))], quality: [{ id: -1, label: configuration.language === "en" ? "Automatic" : "\u062A\u0644\u0642\u0627\u0626\u064A", selected: engine.currentLevel < 0 }, ...(engine.levels || []).map((t, n2) => ({ id: n2, label: t.height ? `${t.height}p` : `${Math.round((t.bitrate || 0) / 1e3)} kbps`, selected: engine.currentLevel === n2 }))] };
        return { audio: Array.from(video.audioTracks || []).map((t, n2) => ({ id: n2, label: t.label || t.language || `Audio ${n2 + 1}`, selected: !!t.enabled })), subtitles: [{ id: -1, label: configuration.language === "en" ? "Off" : "\u0625\u064A\u0642\u0627\u0641", selected: !Array.from(video.textTracks || []).some((t) => t.mode === "showing") }, ...Array.from(video.textTracks || []).map((t, n2) => ({ id: n2, label: t.label || t.language || `Subtitle ${n2 + 1}`, selected: t.mode === "showing" }))], quality: [], systemManaged: engineKind === "native-hls" };
      },
      setTrack(kind, id) {
        if (nativeMode) return { systemManaged: true };
        const selected = Number(id);
        if (!Number.isInteger(selected) || selected < -1) return false;
        if (engineKind === "hls" && engine) {
          const key2 = kind === "audio" ? "audioTrack" : kind === "subtitles" ? "subtitleTrack" : kind === "quality" ? "currentLevel" : null;
          if (!key2) return false;
          const values = kind === "audio" ? engine.audioTracks : kind === "subtitles" ? engine.subtitleTracks : engine.levels;
          if (selected >= values.length) return false;
          engine[key2] = selected;
          return true;
        }
        const tracks = kind === "audio" ? video.audioTracks : kind === "subtitles" ? video.textTracks : null;
        if (!tracks || selected >= tracks.length) return false;
        for (let n2 = 0; n2 < tracks.length; n2++) if (kind === "audio") tracks[n2].enabled = n2 === selected;
        else tracks[n2].mode = n2 === selected ? "showing" : "disabled";
        return true;
      },
      async togglePiP() {
        if (nativeMode) return native("pip");
        if (globalThis.document?.pictureInPictureElement) {
          await document.exitPictureInPicture();
          return true;
        }
        if (video.requestPictureInPicture && document.pictureInPictureEnabled) {
          await video.requestPictureInPicture();
          return true;
        }
        if (video.webkitSupportsPresentationMode?.("picture-in-picture")) {
          video.webkitSetPresentationMode(video.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
          return true;
        }
        return false;
      },
      async fullscreen() {
        if (nativeMode) return true;
        if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
          return true;
        }
        if (video.requestFullscreen) {
          await video.requestFullscreen();
          return true;
        }
        return false;
      },
      airplay() {
        if (video.webkitShowPlaybackTargetPicker) {
          video.webkitShowPlaybackTargetPicker();
          return true;
        }
        return false;
      },
      useNative,
      getCapabilities() {
        return { native: nativeAvailable(), nativePlayer: nativeAvailable(), pip: !!(globalThis.document?.pictureInPictureEnabled || video.webkitSupportsPresentationMode?.("picture-in-picture")), airplay: typeof video.webkitShowPlaybackTargetPicker === "function", screenshot: !!globalThis.document, recording: !!(globalThis.MediaRecorder && (video.captureStream || video.webkitCaptureStream)), decoderSelection: false, audioDelay: false, tracks: this.getTracks() };
      },
      async screenshot() {
        if (nativeMode || !video.videoWidth || !video.videoHeight || !globalThis.document) throw new Error("A visible inline video frame is required");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const drawing = canvas.getContext("2d");
        if (!drawing) throw new Error("Frame capture unavailable");
        try {
          drawing.drawImage(video, 0, 0);
          return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Frame capture blocked")), "image/png"));
        } catch {
          throw new Error("The source or browser does not allow frame capture");
        }
      },
      startRecording({ maxBytes = 256 * 1024 * 1024, maxMinutes = 60 } = {}) {
        if (nativeMode || !item || !globalThis.MediaRecorder || !(video.captureStream || video.webkitCaptureStream)) throw new Error("Recording this media is unavailable in this browser");
        if (recorder?.state === "recording") throw new Error("Recording is already active");
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024) throw new Error("Invalid recording limit");
        const stream = (video.captureStream || video.webkitCaptureStream).call(video);
        if (!stream.getTracks().length) throw new Error("No recordable media tracks");
        const parts = [];
        let received = 0, failed2 = null;
        const formats = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
        const mimeType = formats.find((value) => MediaRecorder.isTypeSupported(value));
        const activeRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
        recorder = activeRecorder;
        let timer;
        recordingPromise = new Promise((resolve, reject) => {
          activeRecorder.ondataavailable = (event) => {
            if (!event.data?.size) return;
            received += event.data.size;
            if (received > maxBytes) {
              failed2 = new Error("Recording size limit reached");
              if (activeRecorder.state === "recording") activeRecorder.stop();
            } else parts.push(event.data);
          };
          activeRecorder.onerror = () => {
            failed2 = new Error("The source or browser refused recording");
          };
          activeRecorder.onstop = () => {
            clearTimeout(timer);
            stream.getTracks().forEach((track) => track.stop());
            if (failed2) reject(failed2);
            else resolve(new Blob(parts, { type: activeRecorder.mimeType || mimeType || "video/webm" }));
          };
        });
        recordingPromise.catch(() => {
        });
        activeRecorder.start(1e3);
        const minutes = Math.min(60, Math.max(1, Number(maxMinutes) || 60));
        timer = setTimeout(() => {
          if (activeRecorder.state === "recording") activeRecorder.stop();
        }, minutes * 6e4);
        recordingTimer = timer;
        return true;
      },
      async stopRecording() {
        if (!recordingPromise) return null;
        if (recorder?.state === "recording") recorder.stop();
        return recordingPromise;
      },
      setSleepTimer(minutes = 0) {
        clearTimeout(sleepTimer2);
        sleepTimer2 = null;
        const count = Number(minutes);
        if (Number.isFinite(count) && count > 0 && count <= 720) sleepTimer2 = setTimeout(() => {
          if (nativeMode) native("pause").catch(() => {
          });
          else video.pause();
          playing = false;
          progress();
          status(configuration.language === "en" ? "Sleep timer finished" : "\u0627\u0646\u062A\u0647\u0649 \u0645\u0624\u0642\u062A \u0627\u0644\u0646\u0648\u0645");
        }, count * 6e4);
        return count > 0;
      },
      destroy() {
        this.stop();
        globalThis.removeEventListener?.("abunasser:native", nativeEvent);
      }
    };
  }
  function downloadPolicy(item, source = {}, maxBytes = 512 * 1024 * 1024) {
    if (!item || item.kind === "live" || item.kind === "series") return { allowed: false, reason: "finite_only" };
    if (source.drm || source.encrypted || item.drm || item.encrypted) return { allowed: false, reason: "protected" };
    const url = validMediaURL(source.url);
    if (!url) return { allowed: false, reason: "source" };
    if (mediaType(source) !== "file") return { allowed: false, reason: "native_download_required" };
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024 * 1024) return { allowed: false, reason: "size_limit" };
    return { allowed: true, url, maxBytes };
  }
  function database() {
    if (!globalThis.indexedDB) return Promise.reject(new Error("Persistent storage unavailable"));
    if (!downloadsDB) downloadsDB = new Promise((resolve, reject) => {
      const request2 = indexedDB.open("abunasser-downloads-v1", 1);
      request2.onupgradeneeded = () => request2.result.createObjectStore("items", { keyPath: "key" });
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => reject(new Error("Persistent storage unavailable"));
    });
    return downloadsDB;
  }
  async function record(action, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("items", action === "list" ? "readonly" : "readwrite"), store = tx.objectStore("items");
      const request2 = action === "list" ? store.getAll() : action === "remove" ? store.delete(value) : store.put(value);
      request2.onsuccess = () => resolve(request2.result);
      request2.onerror = () => reject(new Error("Could not save download"));
    });
  }
  function downloadKey(scope2, id) {
    return `${encodeURIComponent(String(scope2))}/${encodeURIComponent(String(id))}`;
  }
  function cacheAddress(key2) {
    return new URL(`/__offline__/${key2}`, globalThis.location?.origin || "https://app.invalid").href;
  }
  function downloadItemSnapshot(item = {}) {
    const text2 = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
    return { id: text2(String(item.id || ""), 1024), kind: item.kind === "episode" ? "episode" : "movie", name: text2(item.name, 300), group: text2(item.group, 500), genre: text2(item.genre, 500) };
  }
  var VENDOR, scripts, MIME_HLS, MIME_TS, RATES, OFFLINE_CACHE, downloadsDB, DownloadManager;
  var init_player = __esm({
    "tv/samsung/app/player.js?release=1.1"() {
      VENDOR = { hls: new URL("hls.min.js", document.baseURI).href, ts: new URL("mpegts.min.js", document.baseURI).href };
      scripts = /* @__PURE__ */ new Map();
      MIME_HLS = /(?:mpegurl|^hls$)/i;
      MIME_TS = /(?:mp2t|mpegts|x-m2ts|x-flv|^flv$)/i;
      RATES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6]);
      OFFLINE_CACHE = "abunasser-offline-v1";
      DownloadManager = class {
        constructor({ scope: scope2 = "default", maxBytes = 512 * 1024 * 1024, preferNative = true } = {}) {
          this.scope = String(scope2);
          this.maxBytes = maxBytes;
          this.preferNative = preferNative;
          this.jobs = /* @__PURE__ */ new Map();
          this.listeners = /* @__PURE__ */ new Set();
          this.nativeListener = (event) => {
            const data = event.detail || {};
            if (!data.id) return;
            const job = this.jobs.get(data.id) || [...this.jobs.values()].find((value) => value.nativeId === data.id);
            if (!job) return;
            if (data.type === "downloadProgress") {
              job.received = Number(data.received || data.bytes) || 0;
              job.total = Number(data.total || data.expected) || 0;
              job.progress = Number(data.progress) || 0;
              if (["downloading", "paused", "cancelled", "failed"].includes(data.status)) job.state = data.status;
              this.emit(job);
            } else if (data.type === "downloadComplete") {
              job.state = "complete";
              job.native = true;
              job.progress = 1;
              job.received = Number(data.bytes) || job.received;
              this.emit(job);
            } else if (data.type === "downloadError") {
              job.state = "failed";
              job.reason = String(data.message || "Native download failed").slice(0, 400);
              this.emit(job);
            }
          };
          globalThis.addEventListener?.("abunasser:native", this.nativeListener);
        }
        subscribe(listener) {
          this.listeners.add(listener);
          return () => this.listeners.delete(listener);
        }
        emit(job) {
          const view = { id: job.id, name: job.name, kind: job.kind, state: job.state, received: job.received || 0, total: job.total || 0, progress: job.total ? Math.min(1, (job.received || 0) / job.total) : job.progress || 0, native: !!job.native, reason: job.reason || "" };
          for (const listener of this.listeners) safeInvoke(listener, view);
        }
        async enqueue(item, source) {
          const id = String(item?.id || "");
          if (!id) throw new Error("Download item required");
          if (this.jobs.has(id) && this.jobs.get(id).state === "downloading") return this.jobs.get(id).promise;
          const policy = downloadPolicy(item, source, this.maxBytes);
          if (!policy.allowed && !(policy.reason === "native_download_required" && this.preferNative && nativeAvailable())) throw Object.assign(new Error(policy.reason), { code: policy.reason });
          if (!item || item.kind === "live" || item.kind === "series" || source.drm || source.encrypted || item.drm) throw new Error("finite_only");
          const job = { id, name: item.name || "", kind: item.kind, state: "downloading", item, source, received: 0, total: 0, controller: new AbortController(), native: false };
          this.jobs.set(id, job);
          this.emit(job);
          job.promise = (async () => {
            if (this.preferNative && nativeAvailable()) {
              job.native = true;
              job.nativeId = downloadKey(this.scope, id);
              const result = await native("download", { id: job.nativeId, url: source.url, title: item.name || "", kind: item.kind, mime: source.mime || "" });
              job.state = result?.complete || result?.status === "complete" ? "complete" : "downloading";
              this.emit(job);
              return { ...result, id, native: true };
            }
            if (!globalThis.caches || !globalThis.indexedDB) throw new Error("Persistent offline storage is unavailable in this browser");
            const response = await fetch(policy.url, { signal: job.controller.signal, credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer" });
            if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { httpStatus: response.status });
            const contentType = response.headers.get("Content-Type") || source.mime || "video/mp4";
            if (MIME_HLS.test(contentType) || /text\/html|application\/json/i.test(contentType)) throw new Error("finite_video_required");
            const length = Number(response.headers.get("Content-Length"));
            if (Number.isFinite(length) && length > 0) job.total = length;
            if (job.total > this.maxBytes) throw new Error("size_limit");
            const quota = await globalThis.navigator?.storage?.estimate?.();
            if (quota && job.total && quota.quota - quota.usage < job.total * 1.15) throw new Error("storage_quota");
            if (!response.body) throw new Error("Empty download response");
            const reader = response.body.getReader(), chunks = [];
            try {
              for (; ; ) {
                const result = await reader.read();
                if (result.done) break;
                job.received += result.value.byteLength;
                if (job.received > this.maxBytes) throw new Error("size_limit");
                chunks.push(result.value);
                this.emit(job);
              }
            } finally {
              await reader.cancel().catch(() => {
              });
            }
            if (job.controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
            if (job.total && job.received !== job.total) throw new Error("incomplete_download");
            const blob = new Blob(chunks, { type: contentType }), key2 = downloadKey(this.scope, id), address = cacheAddress(key2), cache = await caches.open(OFFLINE_CACHE);
            await cache.put(address, new Response(blob, { headers: { "Content-Type": contentType, "Content-Length": String(blob.size) } }));
            const metadata = { key: key2, scope: this.scope, id, name: item.name || "", kind: item.kind, item: downloadItemSnapshot(item), metadataVersion: 2, mime: contentType, bytes: blob.size, createdAt: Date.now(), native: false };
            try {
              await record("put", metadata);
            } catch (error) {
              await cache.delete(address);
              throw error;
            }
            job.state = "complete";
            this.emit(job);
            return metadata;
          })().catch((error) => {
            if (job.state !== "paused") job.state = error?.name === "AbortError" ? "cancelled" : "failed";
            job.reason = error?.name === "AbortError" ? "" : String(error.code || error.message || "download");
            this.emit(job);
            throw error;
          });
          return job.promise;
        }
        cancel(id) {
          const job = this.jobs.get(String(id));
          if (!job) return false;
          job.state = "cancelled";
          if (job.native) native("cancelDownload", { id: downloadKey(this.scope, id) }).catch(() => {
          });
          else job.controller.abort();
          this.emit(job);
          return true;
        }
        pause(id) {
          const job = this.jobs.get(String(id));
          if (!job || job.state !== "downloading") return false;
          if (job.native) return native("pauseDownload", { id: downloadKey(this.scope, id) }).then(() => {
            job.state = "paused";
            this.emit(job);
            return true;
          });
          job.state = "paused";
          job.controller.abort();
          this.emit(job);
          return true;
        }
        resume(id) {
          const job = this.jobs.get(String(id));
          if (!job || job.state !== "paused") return false;
          if (job.native) return native("resumeDownload", { id: downloadKey(this.scope, id) }).then(() => {
            job.state = "downloading";
            this.emit(job);
            return true;
          });
          return this.enqueue(job.item, job.source);
        }
        async list() {
          let local = [];
          try {
            local = (await record("list")).filter((row) => row.scope === this.scope).map((row) => ({ ...row, state: "complete" }));
          } catch {
          }
          if (this.preferNative && nativeAvailable()) try {
            const rows = await native("downloads");
            local.push(...(Array.isArray(rows) ? rows : rows?.items || []).filter((row) => String(row.id || "").startsWith(`${encodeURIComponent(this.scope)}/`)).map((row) => ({ ...row, name: row.name || row.title || "", state: row.state || row.status || "complete", id: decodeURIComponent(row.id.split("/").slice(1).join("/")), native: true })));
          } catch {
          }
          const entries = new Map(local.map((row) => [String(row.id), row]));
          for (const job of this.jobs.values()) if (job.state !== "complete" || !entries.has(job.id)) entries.set(job.id, { ...entries.get(job.id) || {}, id: job.id, name: job.name, kind: job.kind, item: downloadItemSnapshot(job.item), metadataVersion: 2, state: job.state, received: job.received, total: job.total, native: job.native, reason: job.reason || "" });
          return [...entries.values()];
        }
        async openNativeDownload(id) {
          if (!nativeAvailable()) return false;
          return native("openDownload", { id: downloadKey(this.scope, id) });
        }
        async getOfflineURL(id) {
          if (!globalThis.caches) return null;
          const key2 = downloadKey(this.scope, id), cache = await caches.open(OFFLINE_CACHE), address = cacheAddress(key2), response = await cache.match(address);
          if (!response) return null;
          if (globalThis.navigator?.serviceWorker?.controller) return address;
          return URL.createObjectURL(await response.blob());
        }
        async remove(id) {
          this.cancel(id);
          const key2 = downloadKey(this.scope, id);
          if (globalThis.caches) {
            const cache = await caches.open(OFFLINE_CACHE);
            await cache.delete(cacheAddress(key2));
          }
          try {
            await record("remove", key2);
          } catch {
          }
          if (this.preferNative && nativeAvailable()) await native("removeDownload", { id: key2 });
          this.jobs.delete(String(id));
        }
        async clear() {
          for (const job of this.jobs.values()) this.cancel(job.id);
          for (const entry of await this.list()) await this.remove(entry.id);
        }
        destroy() {
          for (const job of this.jobs.values()) if (job.state === "downloading" && !job.native) this.cancel(job.id);
          this.listeners.clear();
          globalThis.removeEventListener?.("abunasser:native", this.nativeListener);
        }
      };
    }
  });

  // tv/samsung/app/connect.js
  function safeHttp(value, base) {
    let u;
    try {
      u = new URL(value, base);
    } catch {
      throw new ConnectError("SOURCE_URL");
    }
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || u.hash || u.href.length > 8192) throw new ConnectError("SOURCE_URL");
    return u.href;
  }
  function encode64(value) {
    let text2 = "";
    for (const byte of value) text2 += String.fromCharCode(byte);
    return btoa(text2).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
  function decode64(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 131072) throw new ConnectError("DECRYPT");
    try {
      return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    } catch {
      throw new ConnectError("DECRYPT");
    }
  }
  function nativePairCrypto() {
    const keys = /* @__PURE__ */ new WeakMap();
    const invoke = async (op, payload = {}) => {
      const result = await nativeRequest("pairCrypto", { op, ...payload });
      if (!result || typeof result.data !== "string") throw new ConnectError("CRYPTO");
      return decode64(result.data);
    };
    const valueOf = (value) => value instanceof ArrayBuffer ? new Uint8Array(value) : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
    const crypt = async (op, algorithm, key2, data) => {
      const raw = keys.get(key2), iv = valueOf(algorithm?.iv), bytes = valueOf(data);
      if (algorithm?.name !== "AES-GCM" || !raw || iv?.length !== 12 || !bytes || bytes.length > 98304) throw new ConnectError("CRYPTO");
      return (await invoke(op, { key: encode64(raw), iv: encode64(iv), data: encode64(bytes) })).buffer;
    };
    return {
      randomBytes: async (count) => {
        if (!Number.isInteger(count) || count < 1 || count > 64) throw new ConnectError("CRYPTO");
        if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint8Array(count));
        const bytes = await invoke("random", { count });
        if (bytes.length !== count) throw new ConnectError("CRYPTO");
        return bytes;
      },
      subtle: {
        digest: async (algorithm, data) => {
          if ((typeof algorithm === "string" ? algorithm : algorithm?.name) !== "SHA-256") throw new ConnectError("CRYPTO");
          const bytes = valueOf(data);
          if (!bytes || bytes.length > 98304) throw new ConnectError("CRYPTO");
          const result = await invoke("digest", { data: encode64(bytes) });
          if (result.length !== 32) throw new ConnectError("CRYPTO");
          return result.buffer;
        },
        importKey: async (format, data, algorithm) => {
          const bytes = valueOf(data);
          if (format !== "raw" || algorithm?.name !== "AES-GCM" || bytes?.length !== 32) throw new ConnectError("CRYPTO");
          const key2 = Object.freeze({ type: "secret", algorithm: Object.freeze({ name: "AES-GCM", length: 256 }) });
          keys.set(key2, bytes.slice());
          return key2;
        },
        encrypt: (algorithm, key2, data) => crypt("encrypt", algorithm, key2, data),
        decrypt: (algorithm, key2, data) => crypt("decrypt", algorithm, key2, data)
      }
    };
  }
  async function randomBytes(crypto2, count) {
    if (crypto2?.randomBytes) return crypto2.randomBytes(count);
    if (crypto2?.getRandomValues) return crypto2.getRandomValues(new Uint8Array(count));
    throw new ConnectError("CRYPTO");
  }
  function bounded(value, min, max, fallback = min) {
    return Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  }
  function accountValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ConnectError("INPUT");
    let mode = raw.type || raw.mode || "provider";
    if (["abbeedo", "abunasser"].includes(mode)) mode = "provider";
    if (!["provider", "xtream", "m3u", "stalker"].includes(mode)) throw new ConnectError("INPUT");
    const server = safeHttp(mode === "provider" ? "http://maglobalxx.xyz:2052" : String(raw.server || raw.url || "").trim());
    let username = String(raw.username || raw.user || "").trim(), password = String(raw.password || ""), mac = "";
    if (mode === "stalker") {
      mac = String(raw.mac || username).trim().toUpperCase();
      if (!/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac)) throw new ConnectError("INPUT");
      username = mac;
      password = "";
    } else if (mode === "m3u") {
      username = "";
      password = "";
    } else if (!username || !password) throw new ConnectError("INPUT");
    if (server.length > 4096 || username.length > 512 || password.length > 2048) throw new ConnectError("SIZE");
    return { mode, type: mode, server, ...mode === "m3u" ? { url: server } : {}, username, user: username, password, mac, name: String(raw.name || (mode === "provider" ? "\u0627\u0634\u062A\u0631\u0627\u0643 \u0623\u0628\u0648\u0646\u0627\u0635\u0631" : mode === "m3u" ? "M3U" : username)).trim().slice(0, 80) };
  }
  function watchMedia(item, resolved, origin) {
    const source = resolved?.sourceUrl || resolved?.sourceURL || resolved?.upstream || item?.url || resolved?.url;
    const url = safeHttp(source, origin), kind = item?.kind === "episode" ? "episode" : item?.kind === "movie" ? "movie" : item?.kind === "live" ? "live" : "";
    if (!kind || new URL(url).pathname.startsWith("/api/media")) throw new ConnectError("SOURCE_URL");
    const media = { url, title: String(item?.name || item?.title || "\u0627\u0644\u0645\u062D\u062A\u0648\u0649").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180), kind };
    if (VIDEO_CODECS.has(resolved?.videoCodec)) media.videoCodec = resolved.videoCodec;
    if (AUDIO_CODECS.has(resolved?.audioCodec)) media.audioCodec = resolved.audioCodec;
    return media;
  }
  function watchState(snapshot = {}, kind) {
    return { positionMs: Math.round(bounded(snapshot.positionMs ?? (Number(snapshot.currentTime) || 0) * 1e3, 0, 6048e5)), durationMs: Math.round(bounded(snapshot.durationMs ?? (Number(snapshot.duration) || 0) * 1e3, 0, 6048e5)), playing: !!(snapshot.playing ?? snapshot.isPlaying), speed: kind === "live" ? 1 : bounded(snapshot.speed ?? snapshot.rate, 0.25, 6, 1), liveOffsetMs: Math.round(bounded(snapshot.liveOffsetMs, -1, 864e5, -1)) };
  }
  var DEFAULT_ORIGIN, PAIR_ROOT, WATCH_ROOT, encoder2, decoder2, ROOM_ID, ROOM_TOKEN, COMMANDS, VIDEO_CODECS, AUDIO_CODECS, messages, ConnectError, Transport, PairingClient, WatchHost;
  var init_connect = __esm({
    "tv/samsung/app/connect.js"() {
      init_native();
      DEFAULT_ORIGIN = "https://www.abbeedo.com";
      PAIR_ROOT = "/api/device-pairings";
      WATCH_ROOT = "/api/watch/rooms";
      encoder2 = new TextEncoder();
      decoder2 = new TextDecoder("utf-8", { fatal: true });
      ROOM_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
      ROOM_TOKEN = /^[a-f0-9]{64}$/;
      COMMANDS = /* @__PURE__ */ new Set(["up", "down", "left", "right", "ok", "back", "home", "play_pause", "volume_down", "volume_up", "previous_channel", "next_channel", "seek", "search", "export_settings", "import_settings", "resume_playback"]);
      VIDEO_CODECS = /* @__PURE__ */ new Set(["video/avc", "video/hevc", "video/av01", "video/x-vnd.on2.vp9", "video/x-vnd.on2.vp8", "video/mp4v-es", "video/mpeg2"]);
      AUDIO_CODECS = /* @__PURE__ */ new Set(["audio/mp4a-latm", "audio/ac3", "audio/eac3", "audio/eac3-joc", "audio/opus", "audio/vorbis", "audio/flac", "audio/mpeg", "audio/raw"]);
      messages = { CLOSED: "\u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629.", ABORTED: "\u0623\u064F\u0644\u063A\u064A \u0627\u0644\u0637\u0644\u0628.", TIMEOUT: "\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.", NETWORK: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u062E\u062F\u0645\u0629.", PROTOCOL: "\u0631\u062F \u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0627\u0641\u0642.", INPUT: "\u062A\u062D\u0642\u0642 \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0637\u0644\u0628.", SIZE: "\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D.", CRYPTO: "\u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0644\u0627 \u064A\u062F\u0639\u0645 \u0627\u0644\u062A\u0634\u0641\u064A\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628.", DECRYPT: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0634\u0641\u0631\u0629.", PAIR_EXPIRED: "\u0627\u0646\u062A\u0647\u062A \u062C\u0644\u0633\u0629 \u0627\u0644\u0631\u0628\u0637. \u0623\u0646\u0634\u0626 \u0631\u0645\u0632\u064B\u0627 \u062C\u062F\u064A\u062F\u064B\u0627.", PAIR_AUTH: "\u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", RATE: "\u0637\u0644\u0628\u0627\u062A \u0643\u062B\u064A\u0631\u0629. \u0627\u0646\u062A\u0638\u0631 \u0642\u0644\u064A\u0644\u064B\u0627 \u062B\u0645 \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.", BUSY: "\u0627\u0646\u062A\u0638\u0631 \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0633\u0627\u0628\u0642.", CONFIG: "\u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u0647\u064A\u0623\u0629 \u062D\u0627\u0644\u064A\u064B\u0627.", SOURCE_HOST: "\u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644 \u0644\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629. \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u062F\u0639\u0645.", SOURCE_URL: "\u0647\u0630\u0627 \u0627\u0644\u0645\u0635\u062F\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629.", HOST: "\u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0627\u0644\u0643 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629.", ENDED: "\u0627\u0646\u062A\u0647\u062A \u062C\u0644\u0633\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.", MEDIA: "\u0627\u0644\u0645\u0635\u062F\u0631 \u0644\u0645 \u064A\u0642\u0628\u0644 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629.", MANIFEST: "\u0635\u064A\u063A\u0629 \u0627\u0644\u0628\u062B \u063A\u064A\u0631 \u0645\u062A\u0648\u0627\u0641\u0642\u0629 \u0645\u0639 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629.", STORAGE: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u062C\u0644\u0633\u0629.", UNAVAILABLE: "\u0627\u0644\u062E\u062F\u0645\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0627\u0644\u0622\u0646." };
      ConnectError = class extends Error {
        constructor(code = "NETWORK", status = 0) {
          super(messages[code] || messages.NETWORK);
          this.name = "ConnectError";
          this.code = code;
          this.status = status;
        }
      };
      Transport = class {
        constructor(options = {}) {
          const native2 = isNative();
          this.fetch = options.fetch || (native2 ? ((...args) => nativeFetch(...args)) : globalThis.fetch?.bind(globalThis));
          this.crypto = options.crypto || (native2 && !globalThis.crypto?.subtle ? nativePairCrypto() : globalThis.crypto);
          this.now = options.now || Date.now;
          this.timeout = options.timeoutMs || 8e3;
          this.document = options.document === void 0 ? globalThis.document : options.document;
          this.events = options.events === void 0 ? globalThis : options.events;
          this.schedule = options.setTimeout || globalThis.setTimeout.bind(globalThis);
          this.unschedule = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);
          this.controllers = /* @__PURE__ */ new Set();
          this.timer = null;
          this.paused = !!this.document?.hidden;
          this.epoch = 0;
          const browserOrigin = globalThis.location?.origin, configured = globalThis.ABUNASSER_CONFIG?.apiOrigin;
          const current2 = options.origin || configured || (/^https?:\/\//.test(browserOrigin || "") ? browserOrigin : DEFAULT_ORIGIN);
          this.origin = new URL(current2).origin;
          if (!/^https?:$/.test(new URL(this.origin).protocol)) throw new ConnectError("INPUT");
          this.visibility = () => this.document?.hidden ? this.pause() : this.resume();
          this.leaving = () => {
            void this.close().catch(() => {
            });
          };
          this.document?.addEventListener?.("visibilitychange", this.visibility);
          this.events?.addEventListener?.("pagehide", this.leaving);
        }
        clearTimer() {
          if (this.timer !== null) this.unschedule(this.timer);
          this.timer = null;
        }
        abort() {
          for (const c of this.controllers) c.abort();
          this.controllers.clear();
        }
        pause() {
          this.paused = true;
          this.clearTimer();
          this.abort();
        }
        resume() {
          this.paused = false;
        }
        destroy() {
          this.document?.removeEventListener?.("visibilitychange", this.visibility);
          this.events?.removeEventListener?.("pagehide", this.leaving);
          return this.close();
        }
        async request(path2, method = "GET", token, body, { independent = false } = {}) {
          const c = new AbortController();
          if (!independent) this.controllers.add(c);
          let timedOut = false;
          const timer = this.schedule(() => {
            timedOut = true;
            c.abort();
          }, this.timeout);
          try {
            const response = await this.fetch(new URL(path2, this.origin).href, { method, signal: c.signal, redirect: "error", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json", ...token ? { Authorization: "Bearer " + token } : {}, ...body ? { "Content-Type": "application/json" } : {} }, ...body ? { body: JSON.stringify(body) } : {} });
            if (Number(response.headers.get("content-length")) > 131072) {
              await response.body?.cancel().catch(() => {
              });
              throw new ConnectError("SIZE");
            }
            let bytes;
            if (response.body?.getReader) {
              const reader = response.body.getReader(), chunks = [];
              let size = 0;
              try {
                for (; ; ) {
                  const part = await reader.read();
                  if (part.done) break;
                  size += part.value.byteLength;
                  if (size > 131072) throw new ConnectError("SIZE");
                  chunks.push(part.value);
                }
                bytes = new Uint8Array(size);
                let at = 0;
                for (const part of chunks) {
                  bytes.set(part, at);
                  at += part.byteLength;
                }
              } finally {
                await reader.cancel().catch(() => {
                });
              }
            } else {
              bytes = new Uint8Array(await response.arrayBuffer());
              if (bytes.length > 131072) throw new ConnectError("SIZE");
            }
            let data;
            try {
              data = bytes.length ? JSON.parse(decoder2.decode(bytes)) : {};
            } catch {
              throw new ConnectError("PROTOCOL", response.status);
            }
            if (!response.ok) {
              const code = Object.hasOwn(messages, data.code) ? data.code : response.status === 429 ? "RATE" : response.status === 403 ? "PAIR_AUTH" : response.status === 404 ? "PAIR_EXPIRED" : response.status >= 500 ? "UNAVAILABLE" : "INPUT";
              throw new ConnectError(code, response.status);
            }
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new ConnectError("PROTOCOL");
            return data;
          } catch (error) {
            if (error instanceof ConnectError) throw error;
            if (timedOut) throw new ConnectError("TIMEOUT");
            if (c.signal.aborted) throw new ConnectError("ABORTED");
            throw new ConnectError("NETWORK");
          } finally {
            this.unschedule(timer);
            this.controllers.delete(c);
          }
        }
      };
      PairingClient = class extends Transport {
        #session = null;
        #key = null;
        #receive = null;
        #failures = 0;
        #lastCommand = 0;
        #delivered = false;
        #polling = false;
        get active() {
          return !!this.#session && this.#session.expiresAt > this.now();
        }
        get expiresAt() {
          return this.#session?.expiresAt || 0;
        }
        get url() {
          return this.#session?.url || "";
        }
        async create({ deviceName = "\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \xB7 \u0645\u062A\u0635\u0641\u062D", deviceId, mac } = {}) {
          await this.close();
          if (!this.crypto?.subtle) throw new ConnectError("CRYPTO");
          const epoch = ++this.epoch;
          const random = (n2) => randomBytes(this.crypto, n2);
          const id = encode64(await random(16)), token = encode64(await random(32)), key2 = await random(32);
          if (!mac) mac = "00:1A:79:" + Array.from(await random(3), (b) => b.toString(16).padStart(2, "0")).join(":").toUpperCase();
          const name = String(deviceName).trim();
          if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) throw new ConnectError("INPUT");
          deviceId = deviceId || encode64(await random(16));
          if (!/^[A-Za-z0-9_-]{8,80}$/.test(deviceId)) throw new ConnectError("INPUT");
          const tokenHash = Array.from(new Uint8Array(await this.crypto.subtle.digest("SHA-256", encoder2.encode(token))), (b) => b.toString(16).padStart(2, "0")).join("");
          const keyObject = await this.crypto.subtle.importKey("raw", key2, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
          const url = this.origin + "/pair.html#" + new URLSearchParams({ id, token, key: encode64(key2) });
          key2.fill(0);
          const session = { id, token, url, expiresAt: this.now() + 12e5 };
          this.#session = session;
          this.#key = keyObject;
          this.#lastCommand = 0;
          this.#delivered = false;
          this.#failures = 0;
          try {
            const data = await this.request(PAIR_ROOT, "POST", null, { id, tokenHash, deviceName: name, deviceId, mac });
            if (data.id !== id || !Number.isFinite(data.expiresAt) || data.expiresAt <= this.now()) throw new ConnectError("PROTOCOL");
            session.expiresAt = Math.min(data.expiresAt, this.now() + 12e5);
            if (epoch !== this.epoch) {
              await this.request(PAIR_ROOT + "/" + id, "DELETE", token, void 0, { independent: true }).catch(() => {
              });
              throw new ConnectError("CLOSED");
            }
            return { id, url, expiresAt: session.expiresAt, deviceId, mac };
          } catch (error) {
            if (this.#session === session) {
              this.#session = null;
              this.#key = null;
              await this.request(PAIR_ROOT + "/" + session.id, "DELETE", session.token, void 0, { independent: true }).catch(() => {
              });
            }
            throw error;
          }
        }
        async #encrypt(value, max = 65536) {
          const data = encoder2.encode(JSON.stringify(value));
          if (data.length > max) throw new ConnectError("SIZE");
          const iv = await randomBytes(this.crypto, 12);
          return { iv: encode64(iv), ciphertext: encode64(new Uint8Array(await this.crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.#key, data))) };
        }
        async #decrypt(envelope) {
          try {
            const iv = decode64(envelope?.iv), cipher = decode64(envelope?.ciphertext);
            if (iv.length !== 12 || cipher.length < 16 || cipher.length > 98304) throw new Error();
            const plain = await this.crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.#key, cipher);
            return JSON.parse(decoder2.decode(plain));
          } catch {
            throw new ConnectError("DECRYPT");
          }
        }
        startReceiving(callbacks = {}) {
          if (typeof callbacks === "function") callbacks = { onAccount: callbacks };
          if (typeof callbacks.onAccount !== "function") throw new ConnectError("INPUT");
          this.#receive = callbacks;
          this.#failures = 0;
          this.clearTimer();
          if (this.active && !this.paused) void this.#poll();
          return () => this.stopReceiving();
        }
        stopReceiving() {
          this.#receive = null;
          this.clearTimer();
          this.abort();
        }
        resume() {
          super.resume();
          if (this.#receive && this.active && !this.#polling) void this.#poll();
        }
        async receive() {
          if (!this.active) {
            await this.close();
            throw new ConnectError("PAIR_EXPIRED");
          }
          const session = this.#session, epoch = this.epoch;
          const info = await this.request(PAIR_ROOT + "/" + session.id, "GET", session.token);
          if (epoch !== this.epoch || this.#session !== session) throw new ConnectError("CLOSED");
          if (!["waiting", "submitted", "received"].includes(info.status) || info.id !== session.id || !Number.isFinite(info.expiresAt)) throw new ConnectError("PROTOCOL");
          let receivedAccount = null;
          session.expiresAt = Math.min(session.expiresAt, info.expiresAt);
          if (session.expiresAt <= this.now()) {
            await this.close();
            throw new ConnectError("PAIR_EXPIRED");
          }
          this.#receive?.onStatus?.({ status: info.status, expiresAt: session.expiresAt });
          if (info.status === "submitted" && info.payload) {
            const account = accountValue(await this.#decrypt(info.payload));
            receivedAccount = account;
            if (!this.#delivered) {
              await this.#receive?.onAccount?.(account);
              if (epoch !== this.epoch) throw new ConnectError("CLOSED");
              this.#delivered = true;
            }
            await this.request(PAIR_ROOT + "/" + session.id + "/ack", "POST", session.token, {});
            info.status = "received";
          }
          if (info.status === "received") {
            if (this.#receive?.onCommand) {
              const data = await this.request(PAIR_ROOT + "/" + session.id + "/commands", "GET", session.token);
              if (epoch !== this.epoch) throw new ConnectError("CLOSED");
              if (!Array.isArray(data.commands) || data.commands.length > 25) throw new ConnectError("PROTOCOL");
              let through = this.#lastCommand;
              for (const envelope of data.commands) {
                if (!Number.isSafeInteger(envelope?.id) || envelope.id <= through) continue;
                through = envelope.id;
                let command;
                try {
                  command = await this.#decrypt(envelope);
                } catch {
                  continue;
                }
                if (COMMANDS.has(command?.action) && Number.isFinite(command.createdAt) && Math.abs(this.now() - command.createdAt) < 12e4) {
                  await this.#receive.onCommand({ action: command.action, value: command.value, createdAt: command.createdAt });
                  if (epoch !== this.epoch) throw new ConnectError("CLOSED");
                }
              }
              if (through > this.#lastCommand) {
                await this.request(PAIR_ROOT + "/" + session.id + "/commands/ack", "POST", session.token, { through });
                this.#lastCommand = through;
              }
            }
            if (this.#receive?.getState) {
              const state2 = await this.#receive.getState();
              if (epoch !== this.epoch) throw new ConnectError("CLOSED");
              if (state2 && typeof state2 === "object") await this.request(PAIR_ROOT + "/" + session.id + "/state", "POST", session.token, await this.#encrypt(state2));
            }
          }
          return { status: info.status, expiresAt: session.expiresAt, ...receivedAccount ? { account: receivedAccount } : {} };
        }
        async #poll() {
          if (this.#polling || !this.#receive || this.paused) return;
          if (!this.active) {
            this.#receive?.onError?.(new ConnectError("PAIR_EXPIRED"));
            await this.close();
            return;
          }
          this.#polling = true;
          const epoch = this.epoch;
          try {
            await this.receive();
            this.#failures = 0;
          } catch (error) {
            if (error.code !== "ABORTED" && epoch === this.epoch) {
              this.#receive?.onError?.(error);
              if ([403, 404, 410].includes(error.status) || ++this.#failures >= 3) await this.close();
            }
          } finally {
            this.#polling = false;
            if (epoch === this.epoch && this.#receive && this.active && !this.paused) this.timer = this.schedule(() => {
              this.timer = null;
              void this.#poll();
            }, 2e3);
          }
        }
        async close() {
          ++this.epoch;
          this.clearTimer();
          this.abort();
          const session = this.#session;
          this.#session = null;
          this.#key = null;
          this.#receive = null;
          this.#delivered = false;
          if (session) await this.request(PAIR_ROOT + "/" + session.id, "DELETE", session.token, void 0, { independent: true }).catch(() => {
          });
        }
      };
      WatchHost = class extends Transport {
        #session = null;
        #media = null;
        #creating = false;
        #updating = null;
        #pending = null;
        #sample = null;
        #onError = null;
        #failures = 0;
        get active() {
          return !!this.#session && this.#session.expiresAt > this.now();
        }
        get joinURL() {
          return this.#session?.joinURL || "";
        }
        get expiresAt() {
          return this.#session?.expiresAt || 0;
        }
        async create(item, resolved, { snapshot = {} } = {}) {
          if (this.#creating) throw new ConnectError("BUSY");
          this.#creating = true;
          try {
            await this.close();
            const media = watchMedia(item, resolved, this.origin), epoch = ++this.epoch;
            const data = await this.request(WATCH_ROOT, "POST", null, { ...media, ...watchState(snapshot, media.kind) });
            const valid2 = ROOM_ID.test(data.id) && ROOM_TOKEN.test(data.hostToken) && ROOM_TOKEN.test(data.inviteToken) && data.hostToken !== data.inviteToken && Number.isFinite(data.expiresAt) && data.expiresAt > this.now();
            if (!valid2 || data.watchUrl !== this.origin + "/watch.html#id=" + data.id + "&token=" + data.inviteToken) {
              if (ROOM_ID.test(data.id) && ROOM_TOKEN.test(data.hostToken)) await this.request(WATCH_ROOT + "/" + data.id, "DELETE", data.hostToken, void 0, { independent: true }).catch(() => {
              });
              throw new ConnectError("PROTOCOL");
            }
            const session = { id: data.id, hostToken: data.hostToken, joinURL: data.watchUrl, expiresAt: Math.min(data.expiresAt, this.now() + 144e5) };
            if (epoch !== this.epoch) {
              await this.request(WATCH_ROOT + "/" + session.id, "DELETE", session.hostToken, void 0, { independent: true }).catch(() => {
              });
              throw new ConnectError("CLOSED");
            }
            this.#session = session;
            this.#media = media;
            this.#failures = 0;
            return { id: session.id, joinURL: session.joinURL, watchUrl: session.joinURL, expiresAt: session.expiresAt };
          } finally {
            this.#creating = false;
          }
        }
        async update(snapshot = {}, item, resolved) {
          if (!this.active) throw new ConnectError("ENDED");
          this.#pending = { snapshot, item, resolved };
          if (this.#updating) return this.#updating;
          const epoch = this.epoch;
          this.#updating = (async () => {
            while (this.#pending && this.active && epoch === this.epoch && !this.paused) {
              const pending2 = this.#pending;
              this.#pending = null;
              const session = this.#session;
              const media = pending2.item ? watchMedia(pending2.item, pending2.resolved, this.origin) : this.#media;
              const changed = JSON.stringify(media) !== JSON.stringify(this.#media);
              await this.request(WATCH_ROOT + "/" + session.id + "/state", "PUT", session.hostToken, { ...watchState(pending2.snapshot, media.kind), ...changed ? { media } : {} });
              if (epoch !== this.epoch) throw new ConnectError("CLOSED");
              this.#media = media;
              this.#failures = 0;
            }
          })();
          try {
            return await this.#updating;
          } catch (error) {
            if (error.code !== "ABORTED" && epoch === this.epoch) {
              if ([403, 404, 410].includes(error.status) || ++this.#failures >= 3) await this.close();
            }
            throw error;
          } finally {
            this.#updating = null;
          }
        }
        startHeartbeat(sample, { onError } = {}) {
          if (typeof sample !== "function") throw new ConnectError("INPUT");
          this.#sample = sample;
          this.#onError = onError;
          this.clearTimer();
          if (this.active && !this.paused) void this.#pulse();
          return () => {
            this.#sample = null;
            this.clearTimer();
          };
        }
        async #pulse() {
          if (!this.#sample || this.paused) return;
          if (!this.active) {
            this.#onError?.(new ConnectError("ENDED"));
            await this.close();
            return;
          }
          const epoch = this.epoch;
          try {
            const sampled = await this.#sample();
            if (sampled?.item) await this.update(sampled.snapshot || sampled, sampled.item, sampled.resolved);
            else await this.update(sampled || {});
          } catch (error) {
            if (error.code !== "ABORTED" && epoch === this.epoch) this.#onError?.(error);
          } finally {
            if (epoch === this.epoch && this.#sample && this.active && !this.paused) this.timer = this.schedule(() => {
              this.timer = null;
              void this.#pulse();
            }, 2e3);
          }
        }
        resume() {
          super.resume();
          if (this.#sample && this.active) void this.#pulse();
          else if (this.#session && !this.active) void this.close();
        }
        async close() {
          ++this.epoch;
          this.clearTimer();
          this.abort();
          const session = this.#session;
          this.#session = null;
          this.#media = null;
          this.#sample = null;
          this.#pending = null;
          this.#failures = 0;
          if (session) await this.request(WATCH_ROOT + "/" + session.id, "DELETE", session.hostToken, void 0, { independent: true }).catch(() => {
          });
        }
      };
    }
  });

  // tv/samsung/app/ui.js?release=1.2.2
  var ui_exports = {};
  __export(ui_exports, {
    appReady: () => appReady
  });
  function btn(text2, fn, iconName = "", cls = "") {
    const b = node("button", cls);
    b.type = "button";
    if (iconName) b.insertAdjacentHTML("afterbegin", icon(iconName));
    b.append(node("span", "", text2));
    b.onclick = () => Promise.resolve(fn?.()).catch(report);
    return b;
  }
  function updateWebsiteLinks() {
    const hide = isNative2() || globalThis.abunasserDesktop?.isDesktop === true || !!nativeTVInfo();
    for (const id of ["gate-website-home", "app-website-home"]) {
      const el = $(id);
      if (!el) continue;
      el.hidden = hide;
      el.setAttribute("aria-label", x("\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Back to website"));
      const span = el.querySelector("span");
      if (span) span.textContent = x("\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Website");
      else el.textContent = x("\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Website");
    }
  }
  async function syncDesktopNotifications() {
    const bridge = globalThis.abunasserDesktop;
    if (typeof bridge?.getNotificationsEnabled !== "function") return;
    try {
      const native2 = await bridge.getNotificationsEnabled();
      if (native2?.ok) {
        const wanted = state.settings.notifications === true || native2.enabled === true;
        const result = wanted && !native2.enabled ? await bridge.setNotificationsEnabled(true) : native2;
        state.settings.notifications = result?.enabled === true;
      }
    } catch {
    }
  }
  function desktopUpdatePanel() {
    return openDesktopUpdates({ sheet, node, btn, actions, x, toast });
  }
  function toast(message) {
    $("toast").textContent = String(message);
    $("toast").hidden = false;
    clearTimeout(toastTick);
    toastTick = setTimeout(() => $("toast").hidden = true, 4400);
  }
  function report(error) {
    const message = errorText(error, state.settings.language);
    state.errorLog.unshift({ at: Date.now(), code: String(error?.code || "CLIENT"), http: Number(error?.httpStatus) || 0 });
    state.errorLog = state.errorLog.slice(0, 30);
    toast(message);
    return message;
  }
  function sheet(title, content) {
    $("sheet-title").textContent = title;
    $("sheet-body").replaceChildren();
    if (typeof content === "string") $("sheet-body").append(node("p", "", content));
    else if (content) $("sheet-body").append(content);
    if (!$("sheet").open) $("sheet").showModal();
    paintIcons($("sheet"));
    triggerGlitch($("sheet"));
    return $("sheet-body");
  }
  function closeSheet() {
    $("sheet").close();
    triggerGlitch($(state.page + "-page"));
  }
  function actions(...buttons) {
    const row = node("div", "sheet-actions");
    row.append(...buttons);
    return row;
  }
  function fieldsForm(title, fields2, { submit = x("\u062D\u0641\u0638", "Save"), description = "" } = {}) {
    return new Promise((resolve) => {
      const form = node("form");
      if (description) form.append(node("p", "", description));
      const inputs = {};
      for (const f of fields2) {
        const l = node("label", "", f.label), input = node(f.options ? "select" : f.multiline ? "textarea" : "input");
        input.name = f.name;
        input.type = f.type || "text";
        input.value = f.value ?? "";
        input.required = f.required ?? true;
        if (f.inputmode) input.inputMode = f.inputmode;
        if (f.placeholder) input.placeholder = f.placeholder;
        if (f.options) {
          for (const o of f.options) {
            const op = node("option", "", typeof o === "string" ? o : o.label);
            op.value = typeof o === "string" ? o : o.value;
            input.append(op);
          }
          input.value = f.value ?? "";
        }
        inputs[f.name] = input;
        l.append(input);
        form.append(l);
      }
      const save = btn(submit, null, "check", "primary");
      save.type = "submit";
      form.append(actions(save, btn(x("\u0625\u0644\u063A\u0627\u0621", "Cancel"), closeSheet)));
      sheet(title, form);
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        $("sheet").removeEventListener("close", cancel);
        resolve(value);
      };
      const cancel = () => finish(null);
      $("sheet").addEventListener("close", cancel);
      form.onsubmit = (e) => {
        e.preventDefault();
        const values = Object.fromEntries(Object.entries(inputs).map(([key2, input]) => [key2, input.value]));
        finish(values);
        closeSheet();
      };
      setTimeout(() => Object.values(inputs)[0]?.focus(), 50);
    });
  }
  function choices(title, rows, onChoose) {
    const list = node("div", "choice-list");
    for (const row of rows) {
      const v = typeof row === "string" ? { label: row, value: row } : row;
      const b = btn(v.label, () => {
        closeSheet();
        return onChoose(v.value ?? v.label);
      }, v.icon || "");
      if (v.detail) b.append(node("small", "choice-value", v.detail));
      if (v.selected) b.classList.add("selected");
      list.append(b);
    }
    sheet(title, list);
  }
  async function confirmAction(title, message, fn) {
    const box2 = node("div");
    box2.append(node("p", "", message), actions(btn(x("\u062A\u0623\u0643\u064A\u062F", "Confirm"), async () => {
      closeSheet();
      await fn();
    }, "check", "danger"), btn(x("\u0625\u0644\u063A\u0627\u0621", "Cancel"), closeSheet)));
    sheet(title, box2);
  }
  function scope() {
    return accountScope2?.(state.account) || `${state.account?.mode || "demo"}|${state.account?.server || ""}|${state.account?.username || ""}`;
  }
  function collection() {
    const id = scope() + "|" + state.profile;
    return state.collections[id] ??= { favorites: [], hidden: [], watchlist: [], history: [], progress: {}, order: [], saved: {} };
  }
  function key(item) {
    return stableKey2(scope(), item);
  }
  function inSet(name, item) {
    return collection()[name].includes(key(item));
  }
  async function persist() {
    const data = { accounts: state.accounts, profile: state.profile, profiles: state.profiles, settings: state.settings, collections: state.collections, pin: state.pin, lastChannel: state.lastChannel, account: $("remember-account").checked && !state.demo ? state.account : null, userInfo: state.userInfo };
    if (state.settings.privacy_mode) data.lastChannel = null;
    await vault.set("ui", data);
  }
  function saveSoon() {
    clearTimeout(savedTick);
    savedTick = setTimeout(() => persist().catch(report), 200);
  }
  function applyPreferences() {
    updateWebsiteLinks();
    const p = state.settings;
    const record2 = writePreferences(p, { chooseLanguage: true, notify: false });
    applyClientPreferences(record2);
    const title = { settings: x("\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "Settings"), details: x("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Title details"), catalog: label(state.kind) }[state.page];
    if (title) $("page-heading").textContent = title;
    $("video").style.objectFit = p.aspect_mode === "fill" ? "fill" : p.aspect_mode === "zoom" ? "cover" : "contain";
    controller?.configure?.({ aspect: p.aspect_mode, buffer: ["balanced", "low", "stable"][Number(p.buffer_mode) || 0], dataSaver: p.data_saver, language: p.language });
    $("content-hint").textContent = state.demo ? x("\u0648\u0636\u0639 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \xB7 \u0645\u0642\u0627\u0637\u0639 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0645\u0644\u0648\u0643\u0629\u060C \u062F\u0648\u0646 \u0627\u0634\u062A\u0631\u0627\u0643 \u062D\u0642\u064A\u0642\u064A", "Demo mode \xB7 owned test clips, no real subscription") : x("\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u0646 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \xB7 \u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0644\u064B\u0627 \u0644\u0644\u0645\u0641\u0636\u0644\u0629 \u0648\u0627\u0644\u062A\u0631\u062A\u064A\u0628 \u0648\u0627\u0644\u0625\u062E\u0641\u0627\u0621", "Your subscription content \xB7 hold for favorites, order and hiding");
    paintIcons();
  }
  function showPage(page, { title = "", remember = true } = {}) {
    if (remember && state.page !== page) state.previous = state.page;
    if (page !== "catalog") {
      loadAbort?.abort();
      state.generation++;
    }
    state.page = page;
    for (const p of ["login", "home", "catalog", "details", "settings", "collection"]) $(p + "-page").hidden = p !== page;
    $("back-button").hidden = ["home", "login"].includes(page);
    $("settings-button").hidden = page === "settings";
    $("page-heading").textContent = title || ({ catalog: label(state.kind), settings: x("\u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A", "Settings"), details: x("\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Title details") }[page] || "");
    if (page === "home") {
      renderHome();
      setTimeout(() => {
        if (state.page === "home" && $("sheet").open === false && $("player-page").hidden) $("home-cards").querySelector("[data-kind=live]")?.focus({ preventScroll: true });
      }, 0);
    }
    if (page === "settings") renderSettings();
    $("main-content").scrollTop = 0;
    document.title = page === "home" || page === "login" ? brandName(state.settings.language) : `${$("page-heading").textContent} \xB7 ${brandName(state.settings.language)}`;
    triggerGlitch($(page + "-page"));
  }
  function contact(title = x("\u0628\u0631\u0645\u062C\u0629 \u0627\u0628\u0648\u0646\u0627\u0635\u0631", "Developed by Abunasser"), support = false) {
    const box2 = node("div");
    box2.append(node("p", "", support ? x("\u0644\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0623\u0648 \u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A\u060C \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0628\u0648\u0646\u0627\u0635\u0631.", "Contact Abunasser for subscription or support.") : x(`\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \xB7 \u0628\u0631\u0645\u062C\u0629 \u0648\u062A\u0637\u0648\u064A\u0631 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 \xB7 \u0627\u0644\u0625\u0635\u062F\u0627\u0631 ${APP_VERSION}`, `abbeedo TV \xB7 Developed by Abunasser \xB7 Version ${APP_VERSION}`)), node("p", "phone-number", "0571514382"));
    box2.append(actions(btn(x("\u0646\u0633\u062E \u0627\u0644\u0631\u0642\u0645", "Copy number"), () => copyText("0571514382"), "copy"), btn(x("\u0645\u0631\u0627\u0633\u0644\u0629 \u0648\u0627\u062A\u0633\u0627\u0628", "Message on WhatsApp"), () => openExternal(BRAND2.whatsapp), "chat", "primary")));
    if (support) box2.append(btn(x("\u0625\u0631\u0633\u0627\u0644 \u062A\u0642\u0631\u064A\u0631 \u062A\u0634\u062E\u064A\u0635 \u0628\u062F\u0648\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Send a report without subscription details"), () => {
      const summary = `${brandName(state.settings.language)} ${APP_VERSION}
${isNative2() ? "iPhone app" : "Web"}
${navigator.onLine ? "Online" : "Offline"}
${JSON.stringify({ timings: state.timings, errors: state.errorLog.slice(0, 5) })}`;
      openExternal(BRAND2.whatsapp + "?text=" + encodeURIComponent(summary));
    }, "support"));
    sheet(title, box2);
  }
  async function copyText(value) {
    try {
      if (isNative2()) await nativeRequest2("copy", { text: value });
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const input = node("textarea");
        input.value = value;
        document.body.append(input);
        input.select();
        if (!document.execCommand("copy")) throw Error("clipboard");
        input.remove();
      }
      toast(x("\u062A\u0645 \u0627\u0644\u0646\u0633\u062E", "Copied"));
    } catch {
      const box2 = node("div");
      const input = node("input");
      input.value = value;
      input.readOnly = true;
      input.dir = "ltr";
      box2.append(node("p", "", x("\u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0644\u064B\u0627 \u0639\u0644\u0649 \u0627\u0644\u0646\u0635 \u062B\u0645 \u0627\u0646\u0633\u062E.", "Hold the text and copy.")), input);
      sheet(x("\u0646\u0633\u062E", "Copy"), box2);
      input.select();
    }
  }
  function openExternal(value) {
    const u = safeURL2(value, location.href);
    if (!u) throw Error(x("\u0627\u0644\u0631\u0627\u0628\u0637 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D", "Invalid link"));
    if (isNative2()) nativeRequest2("openURL", { url: u.href }).catch(() => {
      location.href = u.href;
    });
    else window.open(u.href, "_blank", "noopener,noreferrer");
  }
  function sourceMode() {
    const mode = $("source-mode").value, credentials = ["provider", "xtream"].includes(mode);
    $("credentials-row").hidden = !credentials;
    $("username").required = credentials && mode !== "stalker";
    $("password").required = credentials && mode !== "stalker";
    $("server").hidden = !["xtream", "stalker"].includes(mode);
    $("playlist-url").hidden = !["m3u", "direct", "auto"].includes(mode);
    $("mac").hidden = mode !== "stalker";
    $("file-button").hidden = mode !== "m3u";
    for (const id of ["server", "playlist-url", "mac"]) $(id).disabled = $(id).hidden;
    $("username").disabled = !credentials;
    $("password").disabled = !credentials;
    $("login-error").hidden = true;
  }
  async function doLogin(account, { remember = $("remember-account").checked } = {}) {
    loadAbort?.abort();
    loadAbort = new AbortController();
    $("login-button").disabled = true;
    $("login-button").textContent = x("\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642\u2026", "Checking\u2026");
    $("login-error").hidden = true;
    try {
      const started = performance.now();
      const auth = await api.authenticate(account, { signal: loadAbort.signal });
      await closePlayer();
      state.account = { ...account };
      state.userInfo = auth?.userInfo || auth?.user_info || {};
      state.demo = false;
      state.catalogs = {};
      if (remember) {
        const id = accountScope2(account);
        const existing = state.accounts.findIndex((a) => accountScope2(a) === id);
        const saved = { ...account, name: account.name || account.username || x("\u0627\u0634\u062A\u0631\u0627\u0643", "Subscription") };
        if (existing >= 0) state.accounts[existing] = saved;
        else state.accounts.push(saved);
      }
      state.timings.login = { ms: Math.round(performance.now() - started), state: "ready" };
      $("password").value = "";
      state.profile = state.profiles[0] || "Default";
      state.lastChannel = collection().lastChannel || null;
      applyPreferences();
      await persist();
      showPage("home");
      setupDownloads();
      runStartScreen();
    } catch (error) {
      $("login-error").textContent = report(error);
      $("login-error").hidden = false;
    } finally {
      $("login-button").disabled = false;
      $("login-button").textContent = x("\u062F\u062E\u0648\u0644", "Sign in");
    }
  }
  function accountFromForm() {
    const mode = $("source-mode").value;
    if (mode === "auto") return detectAccountURL($("playlist-url").value.trim());
    const account = { mode, server: mode === "provider" ? PROVIDER2 : ["xtream", "stalker"].includes(mode) ? $("server").value.trim() : "", username: ["provider", "xtream"].includes(mode) ? $("username").value.trim() : "", password: ["provider", "xtream"].includes(mode) ? $("password").value : "", url: ["m3u", "direct"].includes(mode) ? $("playlist-url").value.trim() : "", mac: mode === "stalker" ? $("mac").value.trim() : "" };
    if (["provider", "xtream"].includes(mode) && (!account.username || !account.password)) throw Error(x("\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631.", "Enter your username and password."));
    if (["xtream", "stalker"].includes(mode) && !safeURL2(account.server)) throw Error(x("\u0623\u062F\u062E\u0644 \u0639\u0646\u0648\u0627\u0646 \u0633\u064A\u0631\u0641\u0631 \u0635\u062D\u064A\u062D\u064B\u0627 \u064A\u0628\u062F\u0623 \u0628\u0640 HTTP \u0623\u0648 HTTPS.", "Enter a valid HTTP or HTTPS server address."));
    if (["m3u", "direct"].includes(mode) && !safeURL2(account.url)) throw Error(x("\u0623\u062F\u062E\u0644 \u0631\u0627\u0628\u0637\u064B\u0627 \u0635\u0627\u0644\u062D\u064B\u0627 \u0623\u0648 \u0627\u062E\u062A\u0631 \u0645\u0644\u0641 M3U.", "Enter a valid URL or choose an M3U file."));
    return account;
  }
  function demoItems() {
    const fixture = new URL("/watch-demo.mp4", globalThis.ABUNASSER_CONFIG?.apiOrigin || location.href).href, result = { live: [], movie: [], series: [] };
    const channels2 = [[x("\u0642\u0646\u0627\u0629 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0623\u0648\u0644\u0649", "First demo channel"), x("\u0631\u064A\u0627\u0636\u0629", "Sports")], [x("\u0623\u062E\u0628\u0627\u0631 \u0627\u0644\u062A\u062C\u0631\u0628\u0629", "Demo news"), x("\u0623\u062E\u0628\u0627\u0631", "News")], [x("\u0639\u0627\u0644\u0645 \u0627\u0644\u0623\u0637\u0641\u0627\u0644 \xB7 \u062A\u062C\u0631\u0628\u0629", "Kids world \xB7 Demo"), x("\u0623\u0637\u0641\u0627\u0644", "Kids")], [x("\u0623\u0641\u0644\u0627\u0645 \u0627\u0644\u062A\u062C\u0631\u0628\u0629", "Demo movies"), x("\u0623\u0641\u0644\u0627\u0645", "Movies")], [x("\u0648\u062B\u0627\u0626\u0642\u064A\u0627\u062A \u0627\u0644\u062A\u062C\u0631\u0628\u0629", "Demo documentaries"), x("\u0648\u062B\u0627\u0626\u0642\u064A", "Documentary")]];
    channels2.forEach(([name, group], i) => result.live.push({ id: "live:demo" + i, kind: "live", name, group, url: fixture + "?channel=" + i, logo: "", demo: true }));
    const names = x(["\u0631\u062D\u0644\u0629 \u0627\u0644\u0636\u0648\u0621", "\u0648\u0642\u062A \u0627\u0644\u062D\u0643\u0627\u064A\u0629", "\u0646\u0627\u0641\u0630\u0629 \u0639\u0644\u0649 \u0627\u0644\u0639\u0627\u0644\u0645", "\u0644\u062D\u0638\u0627\u062A \u0647\u0627\u062F\u0626\u0629", "\u062F\u0631\u0648\u0628 \u062C\u062F\u064A\u062F\u0629", "\u062D\u0643\u0627\u064A\u0629 \u0645\u0643\u0627\u0646"], ["A journey of light", "Story time", "A window on the world", "Quiet moments", "New paths", "A place to remember"]);
    for (let n2 = 0; n2 < 6; n2++) result.movie.push({ id: "movie:demo" + n2, kind: "movie", name: names[n2] + x(" \xB7 \u062A\u062C\u0631\u0628\u0629", " \xB7 Demo"), group: n2 % 2 ? x("\u0648\u062B\u0627\u0626\u0642\u064A", "Documentary") : x("\u0645\u0642\u0627\u0637\u0639 \u0645\u0645\u0644\u0648\u0643\u0629", "Owned clips"), url: fixture, year: "2026", rating: "", plot: x("\u0645\u0642\u0637\u0639 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0645\u0644\u0648\u0643 \u0644\u0639\u0631\u0636 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u0648\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u061B \u0644\u064A\u0633 \u0641\u064A\u0644\u0645\u064B\u0627 \u0645\u0646 \u0627\u0634\u062A\u0631\u0627\u0643 \u062D\u0642\u064A\u0642\u064A.", "An owned test clip showing the interface and playback controls; sample content without a real subscription."), demo: true });
    for (let n2 = 0; n2 < 3; n2++) result.series.push({ id: "series:demo" + n2, kind: "series", name: x(["\u062D\u0643\u0627\u064A\u0627\u062A \u0627\u0644\u062A\u062C\u0631\u0628\u0629", "\u0639\u0627\u0644\u0645 \u0627\u0644\u0648\u0627\u062C\u0647\u0629", "\u062E\u0637\u0648\u0627\u062A \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629"], ["Demo stories", "Interface world", "Watching steps"])[n2], group: x("\u0645\u0633\u0644\u0633\u0644\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629", "Demo series"), year: "2026", plot: x("\u0645\u0633\u0644\u0633\u0644 \u062A\u0648\u0636\u064A\u062D\u064A \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0645\u0642\u0627\u0637\u0639 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0645\u0644\u0648\u0643\u0629.", "Sample series using owned test clips."), demo: true });
    return result;
  }
  function demo() {
    state.account = { mode: "demo", username: "demo", server: "" };
    state.userInfo = {};
    state.demo = true;
    state.catalogs = demoItems();
    state.group = "";
    state.family = "all";
    state.view = "all";
    applyPreferences();
    showPage("home");
    setupDownloads();
    closeSheet();
  }
  function renderHome() {
    const cards = $("home-cards");
    cards.replaceChildren();
    let order = String(state.settings.home_order || "series,live,movie").split(",");
    if (order.length !== 3 || new Set(order).size !== 3 || order.some((k) => !NAMES[k])) order = ["series", "live", "movie"];
    for (const kind of order) {
      const b = btn(label(kind), () => kind === "live" ? openLive() : openCatalog(kind), kind, "home-card");
      b.dataset.kind = kind;
      cards.append(b);
    }
    $("home-tools").replaceChildren(...HOME_TOOLS.map(([id, ar, en, ic]) => {
      const b = btn(x(ar, en), () => homeAction(id), ic);
      b.dataset.action = id;
      return b;
    }));
    const expiry = formatExpiry2(state.userInfo, { locale: state.settings.language === "en" ? "en-GB" : "ar-SA-u-ca-gregory" });
    $("subscription-expiry").textContent = state.demo ? x("\u062A\u062C\u0631\u0628\u0629 \u062F\u0648\u0646 \u0627\u0634\u062A\u0631\u0627\u0643 \xB7 \u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0641\u0642\u0637", "Demo without subscription \xB7 sample data only") : expiry.known ? x(`\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643: ${expiry.date} \xB7 \u0627\u0644\u0645\u062A\u0628\u0642\u064A: ${expiry.days} \u064A\u0648\u0645`, `Subscription ends: ${expiry.date} \xB7 ${expiry.days} days left`) : x("\u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643: \u0644\u0645 \u064A\u062D\u062F\u062F\u0647 \u0627\u0644\u0645\u0635\u062F\u0631", "Subscription expiry: not supplied by the provider");
    applyPreferences();
  }
  async function homeAction(action) {
    if (action === "refresh") {
      if (state.demo) {
        toast(x("\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \u062C\u0627\u0647\u0632\u0629", "Demo data is ready"));
        return;
      }
      delete state.catalogs[state.kind];
      await openCatalog(state.kind, { force: true });
    } else if (action === "notifications") await showNotifications();
    else if (action === "account") showAccount();
    else if (action === "accounts") showAccounts();
    else if (action === "downloads") showDownloads();
    else if (action === "last") {
      if (state.lastChannel) await playItem(state.lastChannel);
      else toast(x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0646\u0627\u0629 \u0633\u0627\u0628\u0642\u0629 \u0628\u0639\u062F", "No previous channel yet"));
    } else if (action === "epg") showGuide();
    else await showSavedCollection(action);
  }
  async function getCatalog(kind, { force = false, onBatch } = {}) {
    if (state.catalogs[kind] && !force) {
      onBatch?.(state.catalogs[kind], { cached: true });
      return state.catalogs[kind];
    }
    if (state.demo) return state.catalogs[kind] || [];
    if (state.account?.mode === "m3u-file") {
      return state.catalogs[kind] || [];
    }
    const started = performance.now();
    const rows = await api.catalog(state.account, kind, { force, signal: loadAbort?.signal, onBatch: (items, meta) => {
      if (!state.timings[kind]?.first) state.timings[kind] = { first: Math.round(performance.now() - started), rows: items.length, state: "partial" };
      onBatch?.(items, meta);
    } });
    state.catalogs[kind] = Array.isArray(rows) ? rows : rows.items || [];
    state.timings[kind] = { ...state.timings[kind], total: Math.round(performance.now() - started), rows: state.catalogs[kind].length, state: "ready" };
    return state.catalogs[kind];
  }
  async function openCatalog(kind, { force = false, view = "all" } = {}) {
    if (!state.account) return showPage("login");
    loadAbort?.abort();
    loadAbort = new AbortController();
    const generation = ++state.generation;
    state.kind = kind;
    state.view = view;
    state.group = "";
    state.family = "all";
    state.query = "";
    state.filters = {};
    state.limit = 60;
    $("catalog-search").value = "";
    showPage("catalog");
    state.settings.last_section = kind;
    saveSoon();
    state.loading = true;
    $("catalog-status").textContent = x("\u062C\u0627\u0631\u064D \u062C\u0644\u0628 \u0627\u0644\u0645\u062D\u062A\u0648\u0649\u2026 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0631\u062C\u0648\u0639 \u0641\u064A \u0623\u064A \u0648\u0642\u062A.", "Fetching content\u2026 you can go back at any time.");
    renderCatalog();
    try {
      const rows = await getCatalog(kind, { force, onBatch: (items) => {
        if (state.generation !== generation || state.page !== "catalog") return;
        state.catalogs[kind] = items;
        renderCatalog();
        $("catalog-status").textContent = x("\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0630\u064A \u0648\u0635\u0644 \u0645\u062A\u0627\u062D \u0627\u0644\u0622\u0646\u061B \u062C\u0627\u0631\u064D \u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u2026", "Received content is ready; fetching the rest\u2026");
      } });
      if (state.generation !== generation || state.page !== "catalog") return;
      state.catalogs[kind] = rows;
      $("catalog-status").textContent = "";
      renderCatalog();
    } catch (error) {
      if (error.name === "AbortError" || state.generation !== generation) return;
      $("catalog-status").textContent = report(error);
    } finally {
      if (state.generation === generation) state.loading = false;
    }
  }
  function filtered(rows = state.catalogs[state.kind] || [], options = {}) {
    const c = collection();
    return filterItems2(rows, { scope: scope(), kind: state.kind, group: state.group, family: state.kind === "live" ? state.family : "", query: state.query, ...state.filters, parental: state.settings.parental_enabled, hidden: c.hidden, favorites: c.favorites, watchlist: c.watchlist, history: c.history, favoritesOnly: state.view === "favorites" || state.family === "favorites", watchlistOnly: state.view === "watchlist", historyOnly: state.view === "continue" || state.family === "history", recentOnly: state.view === "recent", dedupeMovies: state.settings.dedupe_movies, dedupeChannels: state.settings.deduplicate_channels, sort: state.sort, order: c.order, ...options });
  }
  function categoryButtons(rows, { receiver = false } = {}) {
    rows = rows.filter((item) => !collection().hidden.includes(key(item)) && (!state.settings.parental_enabled || !isAdult2(item)));
    const box2 = node("div");
    const counts = /* @__PURE__ */ new Map();
    for (const item of rows) {
      if (state.settings.parental_enabled && isAdult2(item) || collection().hidden.includes(key(item))) continue;
      counts.set(item.group || x("\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", "Uncategorized"), (counts.get(item.group || x("\u063A\u064A\u0631 \u0645\u0635\u0646\u0641", "Uncategorized")) || 0) + 1);
    }
    const choose = (family, group) => {
      state.family = family;
      state.group = group;
      state.limit = 60;
      receiver ? renderReceiver() : renderCatalog();
    };
    if ((state.kind === "live" || receiver) && state.settings.auto_categories) {
      for (const family of LIVE_FAMILIES2) {
        const count = family.id === "all" ? rows.length : family.id === "favorites" ? rows.filter((i) => inSet("favorites", i)).length : family.id === "history" ? rows.filter((i) => collection().history.some((h) => h.key === key(i))).length : rows.filter((i) => classifyLive2(i) === family.id).length;
        if (!count && !["all", "favorites", "history"].includes(family.id)) continue;
        const b = btn(`${String([...box2.children].length + 1).padStart(3, "0")}  ${x(family.ar, family.en)} (${count})`, () => choose(family.id, ""));
        b.classList.toggle("selected", state.family === family.id && !state.group);
        b.dataset.family = family.id;
        box2.append(b);
      }
    } else {
      const b = btn(x(`\u0643\u0644 ${label(state.kind)} (${rows.length})`, `All ${label(state.kind)} (${rows.length})`), () => choose("all", ""));
      b.classList.toggle("selected", !state.group);
      box2.append(b);
    }
    for (const [group, count] of counts) {
      const b = btn(`${group} (${count})`, () => choose("all", group));
      b.classList.toggle("selected", state.group === group);
      box2.append(b);
    }
    return [...box2.children];
  }
  function renderCatalog() {
    if (state.page !== "catalog") return;
    $("catalog-tabs").replaceChildren(...["live", "movie", "series"].map((kind) => {
      const b = btn(label(kind), () => kind === "live" ? openLive() : openCatalog(kind));
      b.classList.toggle("selected", kind === state.kind);
      return b;
    }));
    $("catalog-filters").hidden = state.kind === "live";
    $("catalog-favorites").classList.toggle("selected", state.view === "favorites");
    const source = state.catalogs[state.kind] || [];
    $("category-list").replaceChildren(...categoryButtons(source));
    let rows = filtered(source);
    if (state.view === "recommend") {
      const groups = new Set(collection().history.map((h) => h.item?.group).filter(Boolean));
      rows = [...rows].sort((a, b) => Number(groups.has(b.group)) - Number(groups.has(a.group)) || Number(b.rating || 0) - Number(a.rating || 0));
    }
    $("collection-title").textContent = state.group || label(state.kind);
    $("catalog-count").textContent = String(rows.length);
    $("catalog-grid").classList.toggle("live-grid", state.kind === "live");
    $("catalog-grid").replaceChildren(...rows.slice(0, state.limit).map((item, index) => mediaCard(item, index)));
    $("catalog-empty").hidden = rows.length > 0 || state.loading;
    $("catalog-more").hidden = rows.length <= state.limit;
  }
  function posterImage(item, className = "") {
    const url = safeURL2(item.logo || item.cover || item.poster, location.href);
    if (url) {
      const img = node("img", className);
      img.src = url.href;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.replaceWith(fallbackPoster(item));
      };
      return img;
    }
    return fallbackPoster(item);
  }
  function fallbackPoster(item) {
    const wrap = node("span", "fallback-poster");
    wrap.insertAdjacentHTML("afterbegin", icon(item.kind === "episode" ? "series" : item.kind || "play"));
    return wrap;
  }
  function mediaCard(item, index) {
    const card = node("article", "content-card");
    card.dataset.itemId = item.id;
    const poster = btn("", () => item.kind === "live" ? playItem(item) : showDetails(item));
    poster.className = "poster-button";
    poster.setAttribute("aria-label", item.kind === "live" ? x("\u062A\u0634\u063A\u064A\u0644 " + item.name, "Play " + item.name) : x("\u0645\u0639\u0644\u0648\u0645\u0627\u062A " + item.name, "Details for " + item.name));
    poster.replaceChildren(posterImage(item));
    let held = false, holdTick;
    poster.addEventListener("pointerdown", () => {
      held = false;
      holdTick = setTimeout(() => {
        held = true;
        itemMenu(item);
      }, 550);
    });
    for (const event of ["pointerup", "pointercancel", "pointerleave"]) poster.addEventListener(event, () => clearTimeout(holdTick));
    poster.addEventListener("click", (e) => {
      if (held) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    poster.oncontextmenu = (e) => {
      e.preventDefault();
      itemMenu(item);
    };
    const info = node("div", "card-info");
    info.append(node("h3", "", (item.kind === "live" ? `${String(index + 1).padStart(3, "0")}  ` : "") + item.name), node("small", "", item.group || ""));
    const tools = node("div", "card-actions");
    const favorite = btn("", () => toggleCollection("favorites", item), "heart");
    favorite.classList.toggle("selected", inSet("favorites", item));
    favorite.setAttribute("aria-label", x("\u0627\u0644\u0645\u0641\u0636\u0644\u0629: ", "Favorite: ") + item.name);
    favorite.setAttribute("aria-pressed", String(inSet("favorites", item)));
    const menu = btn("", () => itemMenu(item), "info");
    menu.setAttribute("aria-label", x("\u062E\u064A\u0627\u0631\u0627\u062A: ", "Options: ") + item.name);
    tools.append(favorite, menu);
    card.append(poster, info, tools);
    return card;
  }
  function toggleCollection(name, item) {
    const values = collection()[name], id = key(item), at = values.indexOf(id);
    at < 0 ? values.push(id) : values.splice(at, 1);
    collection().saved ??= {};
    if (at < 0) collection().saved[id] = { ...item };
    saveSoon();
    if (state.page === "catalog") renderCatalog();
    else if (state.page === "collection") showSavedCollection(state.view);
    if (!$("receiver-panel").hidden) renderReceiver();
    toast(at < 0 ? x("\u062A\u0645\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u0629", "Added") : x("\u062A\u0645\u062A \u0627\u0644\u0625\u0632\u0627\u0644\u0629", "Removed"));
  }
  function itemMenu(item) {
    const rows = [{ label: inSet("favorites", item) ? x("\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0627\u0644\u0645\u0641\u0636\u0644\u0629", "Remove favorite") : x("\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0645\u0641\u0636\u0644\u0629", "Add favorite"), value: "favorite", icon: "heart" }, { label: inSet("watchlist", item) ? x("\u0625\u0632\u0627\u0644\u0629 \u0645\u0646 \u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647", "Remove from watchlist") : x("\u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647", "Add to watchlist"), value: "watchlist", icon: "bookmark" }, { label: x("\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Hide this title"), value: "hide", icon: "hidden" }];
    if (item.kind !== "live") rows.push({ label: x("\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Title details"), value: "details", icon: "info" }, { label: x("\u062A\u0646\u0632\u064A\u0644 \u0644\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0644\u0627\u062D\u0642\u064B\u0627", "Download for later"), value: "download", icon: "download" });
    else rows.push({ label: x("\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Program guide"), value: "epg", icon: "calendar" }, { label: x("\u062A\u0642\u062F\u064A\u0645 \u0627\u0644\u0642\u0646\u0627\u0629 \u0641\u064A \u0627\u0644\u062A\u0631\u062A\u064A\u0628", "Move channel up"), value: "up", icon: "up" }, { label: x("\u062A\u0623\u062E\u064A\u0631 \u0627\u0644\u0642\u0646\u0627\u0629 \u0641\u064A \u0627\u0644\u062A\u0631\u062A\u064A\u0628", "Move channel down"), value: "down", icon: "down" });
    choices(item.name, rows, async (value) => {
      if (value === "favorite") toggleCollection("favorites", item);
      if (value === "watchlist") toggleCollection("watchlist", item);
      if (value === "hide") {
        if (!inSet("hidden", item)) collection().hidden.push(key(item));
        collection().saved ??= {};
        collection().saved[key(item)] = { ...item };
        saveSoon();
        renderCatalog();
      }
      if (value === "details") showDetails(item);
      if (value === "download") enqueueDownload(item);
      if (value === "epg") showGuide(item);
      if (value === "up" || value === "down") {
        const rows2 = filtered(state.catalogs.live || [], { group: "", family: "all" });
        const at = rows2.findIndex((i) => i.id === item.id), next = at + (value === "up" ? -1 : 1);
        if (at >= 0 && next >= 0 && next < rows2.length) {
          [rows2[at], rows2[next]] = [rows2[next], rows2[at]];
          collection().order = rows2.map((i) => i.id);
          saveSoon();
          renderCatalog();
        }
      }
    });
  }
  async function showDetails(item) {
    const generation = ++detailGeneration;
    state.detail = { item, info: { ...item }, episodes: null, loading: true };
    showPage("details");
    renderDetails();
    try {
      let data;
      if (item.demo) {
        data = { info: { ...item, duration: x("50 \u062B\u0627\u0646\u064A\u0629", "50 seconds"), cast: "", director: "", production_company: "", trailer: "" }, episodes: item.kind === "series" ? { "1": [1, 2, 3].map((n2) => ({ id: "episode:demo" + n2, kind: "episode", name: x(`\u062D\u0644\u0642\u0629 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 ${n2}`, `Demo episode ${n2}`), title: x(`\u062D\u0644\u0642\u0629 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 ${n2}`, `Demo episode ${n2}`), episode_num: n2, url: new URL("/watch-demo.mp4", globalThis.ABUNASSER_CONFIG?.apiOrigin || location.href).href, demo: true })) } : null };
      } else data = await api.details(state.account, item, {});
      if (item.kind === "series" && item.url && !flattenEpisodes(data.episodes).length) data.episodes = { "1": [{ ...item, id: "episode:" + item.id, providerId: "", kind: "episode", episode_num: 1, name: item.name, url: item.url }] };
      if (generation !== detailGeneration || state.page !== "details") return;
      state.detail = { item, info: { ...item, ...data.info || {} }, episodes: data.episodes || null, loading: false };
      renderDetails();
    } catch (error) {
      if (generation !== detailGeneration) return;
      state.detail.loading = false;
      state.detail.error = errorText(error, state.settings.language);
      renderDetails();
    }
  }
  function renderDetails() {
    const d = state.detail;
    if (!d) return;
    const { item, info } = d, root = node("div", "details-layout");
    const image = posterImage({ ...item, logo: info.cover || info.movie_image || item.logo }, "details-poster");
    if (!(image instanceof HTMLImageElement)) image.classList.add("details-poster");
    root.append(image);
    const meta = node("div", "details-meta");
    meta.append(node("h2", "", info.name || item.name));
    const badges = node("div", "detail-badges");
    for (const value of [info.year || item.year, info.genre || item.genre, info.rating ? `\u2605 ${info.rating}` : "", info.duration || info.duration_secs ? `${info.duration || Math.round(Number(info.duration_secs) / 60) + " " + x("\u062F\u0642\u064A\u0642\u0629", "min")}` : "", info.language || item.language]) if (value) badges.append(node("span", "", String(value)));
    meta.append(badges);
    meta.append(node("p", "details-plot", info.plot || info.description || x("\u0644\u0645 \u064A\u0631\u0633\u0644 \u0627\u0644\u0645\u0635\u062F\u0631 \u0642\u0635\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649.", "The provider has not supplied a synopsis for this title.")));
    const facts = node("div", "details-facts");
    for (const [ar, en, value] of [["\u0627\u0644\u0645\u0645\u062B\u0644\u0648\u0646", "Cast", info.cast || info.actors], ["\u0627\u0644\u0645\u062E\u0631\u062C", "Director", info.director], ["\u0627\u0644\u0625\u0646\u062A\u0627\u062C", "Production", info.production_company || info.production_companies || info.production || info.company], ["\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0635\u062F\u0627\u0631", "Release date", info.releasedate || info.releaseDate || info.release_date]]) {
      const box2 = node("div");
      box2.append(node("strong", "", x(ar, en)), node("span", "", Array.isArray(value) ? value.join(", ") : String(value || x("\u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631", "Not supplied by the provider"))));
      facts.append(box2);
    }
    meta.append(facts);
    const row = node("div", "detail-actions");
    if (item.kind !== "series") row.append(btn(x("\u0645\u0634\u0627\u0647\u062F\u0629", "Watch"), () => playItem({ ...item, url: info.url || item.url }), "play", "primary"));
    else row.append(btn(x("\u0627\u0628\u062F\u0623 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Start watching"), () => playFirstEpisode(), "play", "primary"));
    const trailer = safeTrailer(info.youtube_trailer || info.trailer || info.trailer_url);
    row.append(btn(x("\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A", "Trailer"), () => trailer ? openExternal(trailer) : toast(x("\u0644\u0645 \u064A\u0648\u0641\u0631 \u0627\u0644\u0645\u0635\u062F\u0631 \u062A\u0631\u064A\u0644\u0631 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649.", "No trailer was supplied for this title.")), "movie"), btn(x("\u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647", "Watchlist"), () => toggleCollection("watchlist", item), "bookmark"), btn(x("\u062A\u0646\u0632\u064A\u0644", "Download"), () => item.kind === "series" ? toast(x("\u0627\u062E\u062A\u0631 \u062D\u0644\u0642\u0629 \u062B\u0645 \u0627\u0641\u062A\u062D \u062E\u064A\u0627\u0631\u0627\u062A\u0647\u0627 \u0644\u062A\u0646\u0632\u064A\u0644\u0647\u0627.", "Choose an episode and download it from its options.")) : enqueueDownload(item), "download"));
    meta.append(row);
    if (d.loading) meta.append(node("p", "muted", x("\u062C\u0627\u0631\u064D \u062C\u0644\u0628 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0641\u0642\u0637\u2026", "Fetching details for this title\u2026")));
    if (d.error) meta.append(node("p", "inline-error", d.error));
    const versions = (state.catalogs.movie || []).filter((other) => other.id !== item.id && normalize2(other.name).replace(/\b(4k|uhd|fhd|hd|sd|hevc|1080p|720p)\b/g, "").trim() === normalize2(item.name).replace(/\b(4k|uhd|fhd|hd|sd|hevc|1080p|720p)\b/g, "").trim());
    if (versions.length) {
      meta.append(btn(x(`\u0646\u0633\u062E \u0648\u062C\u0648\u062F\u0627\u062A \u0623\u062E\u0631\u0649 (${versions.length})`, `Other versions (${versions.length})`), () => choices(x("\u0646\u0633\u062E \u0627\u0644\u0645\u0635\u062F\u0631", "Provider versions"), versions.map((v) => ({ label: v.name, value: v.id })), (id) => showDetails(versions.find((v) => v.id === id)))));
    }
    root.append(meta);
    if (item.kind === "series") {
      const episodes = node("div", "episode-list");
      state.episodes = flattenEpisodes(d.episodes);
      if (!state.episodes.length && !d.loading) episodes.append(node("p", "muted", x("\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0644\u0642\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631.", "No episodes were supplied.")));
      const seasons = /* @__PURE__ */ new Map();
      for (const ep of state.episodes) {
        const season = String(ep.season || 1);
        if (!seasons.has(season)) seasons.set(season, []);
        seasons.get(season).push(ep);
      }
      for (const [season, list] of [...seasons].sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const detail = node("details");
        detail.open = seasons.size === 1 || season === "1";
        detail.append(node("summary", "", x(`\u0627\u0644\u0645\u0648\u0633\u0645 ${season} \xB7 ${list.length} \u062D\u0644\u0642\u0629`, `Season ${season} \xB7 ${list.length} episodes`)));
        for (const ep of list) {
          const b = btn(ep.name || ep.title || x(`\u062D\u0644\u0642\u0629 ${ep.episode_num}`, `Episode ${ep.episode_num}`), () => playItem(ep), "play");
          b.oncontextmenu = (e) => {
            e.preventDefault();
            itemMenu(ep);
          };
          detail.append(b);
        }
        episodes.append(detail);
      }
      root.append(episodes);
    }
    $("title-details").replaceChildren(root);
  }
  function flattenEpisodes(value) {
    if (!value) return [];
    const rows = [];
    if (Array.isArray(value)) {
      for (const ep of value) rows.push({ ...ep, kind: "episode", name: ep.name || ep.title });
    } else for (const [season, episodes] of Object.entries(value)) for (const ep of Array.isArray(episodes) ? episodes : []) {
      rows.push({ ...ep, season, kind: "episode", providerId: String(ep.providerId || ep.id || ""), id: String(ep.id || "").startsWith("episode:") ? String(ep.id) : "episode:" + ep.id, name: ep.name || ep.title || x("\u062D\u0644\u0642\u0629", "Episode") });
    }
    return rows.sort((a, b) => Number(a.season || 1) - Number(b.season || 1) || Number(a.episode_num || a.episode || 0) - Number(b.episode_num || b.episode || 0));
  }
  function safeTrailer(value) {
    if (!value) return "";
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return "https://www.youtube.com/watch?v=" + value;
    const u = safeURL2(value);
    return u && ["www.youtube.com", "youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"].includes(u.hostname) ? u.href : "";
  }
  async function playFirstEpisode() {
    const ep = state.episodes[0];
    if (ep) await playItem(ep);
    else toast(x("\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0644\u0642\u0629 \u0645\u062A\u0627\u062D\u0629 \u0628\u0639\u062F.", "No episode is available yet."));
  }
  async function openLive() {
    if (!state.account) return showPage("login");
    loadAbort?.abort();
    loadAbort = new AbortController();
    const generation = ++state.generation;
    state.kind = "live";
    state.family = "all";
    state.group = "";
    state.view = "all";
    let opened = false;
    const start = async (rows) => {
      if (opened || !rows.length || generation !== state.generation) return;
      const first = filtered(rows, { kind: "live", family: "all", group: "", query: "" })[0];
      if (first) {
        opened = true;
        await playItem(first);
      }
    };
    try {
      await start(state.catalogs.live || []);
      const rows = await getCatalog("live", { onBatch: (rows2) => {
        state.catalogs.live = rows2;
        if (!opened) start(rows2).catch(report);
        else if (!$("receiver-panel").hidden) renderReceiver();
      } });
      state.catalogs.live = rows;
      if (!opened) await start(rows);
      if (!opened) {
        await openCatalog("live");
        toast(x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0646\u0648\u0627\u062A \u0645\u0633\u0645\u0648\u062D\u0629 \u0636\u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641.", "No channels are allowed by this profile."));
      }
    } catch (error) {
      report(error);
      if (!opened) await openCatalog("live");
    }
  }
  async function playItem(item, { offlineSource = null } = {}) {
    if (!$("screen-lock").hidden) return toast(x("\u0627\u0641\u062A\u062D \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0644\u0628\u062F\u0621 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.", "Unlock the app to start watching."));
    if (state.settings.parental_enabled && isAdult2(item)) return toast(x("\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u062D\u062C\u0648\u0628 \u0628\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629.", "This content is blocked by parental controls."));
    if (inSet("hidden", item)) return toast(x("\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u062E\u0641\u064A \u0641\u064A \u0645\u0644\u0641\u0643.", "This content is hidden in this profile."));
    controller?.stop();
    state.playingSource = null;
    lastPlayerPage = state.page;
    const previous = state.current;
    if (previous?.kind === "live" && previous.id !== item.id) state.lastChannel = previous;
    if (!state.settings.privacy_mode && previous?.kind === "live" && previous.id !== item.id) collection().lastChannel = previous;
    state.current = item;
    playbackOwner = { itemId: item.id, scope: scope(), profile: state.profile };
    const generation = state.playGeneration = (state.playGeneration || 0) + 1;
    $("player-page").hidden = false;
    $("app-shell").inert = true;
    $("playing-title").textContent = item.name || item.title || label(item.kind);
    $("player-status").textContent = x("\u062C\u0627\u0631\u064D \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u2026", "Connecting\u2026");
    $("receiver-panel").hidden = true;
    $("live-player-tools").hidden = item.kind !== "live";
    $("vod-player-tools").hidden = item.kind === "live";
    $("video").controls = true;
    closeSheet();
    if (!controller) {
      controller = createPlayer({ video: $("video"), onStatus: (message) => $("player-status").textContent = typeof message === "string" ? message : message?.message || "", onError: (error) => {
        $("player-status").textContent = report(error);
      }, onProgress: (progress) => {
        const played = progress.item, owner = playbackOwner;
        if (!played || !owner || played.id !== owner.itemId || state.settings.privacy_mode || scope() !== owner.scope || state.profile !== owner.profile) return;
        const collectionId = owner.scope + "|" + owner.profile, c = state.collections[collectionId] ??= { favorites: [], hidden: [], watchlist: [], history: [], progress: {}, order: [], saved: {} }, id = stableKey2(owner.scope, played);
        c.progress[id] = { position: Number(progress.position) || 0, duration: Number(progress.duration) || 0, at: Date.now(), item: played };
        saveSoon();
      }, onEnded: () => {
        if (state.settings.auto_next && state.current?.kind === "episode") {
          const at = state.episodes.findIndex((i) => i.id === state.current.id);
          if (at >= 0 && state.episodes[at + 1]) playItem(state.episodes[at + 1]).catch(report);
        }
      } });
    }
    applyPreferences();
    try {
      const source = offlineSource || (item.demo ? { url: item.url, mime: "video/mp4" } : await api.resolve(state.account, item, {}));
      if (generation !== state.playGeneration) return;
      state.playingSource = source;
      const progress = collection().progress[key(item)], resume = item.kind === "live" ? 0 : progress && progress.duration > 0 && progress.position < progress.duration - 15 ? progress.position : 0;
      await controller.play(item, source, { account: state.account, playlist: item.kind === "live" ? state.catalogs.live : state.episodes, position: resume, rate: item.kind === "live" ? 1 : Number(state.settings.playback_rate) || 1 });
      if (!state.settings.privacy_mode) {
        const c = collection(), id = key(item);
        c.history = [{ key: id, item, at: Date.now() }, ...c.history.filter((h) => h.key !== id)].slice(0, 300);
        saveSoon();
      }
      if (watchSession?.active) await watchSession.update(playerSnapshot(), item, source).catch(report);
    } catch (error) {
      if (generation !== state.playGeneration) return;
      $("player-status").textContent = report(error);
    }
  }
  function playerSnapshot() {
    const s = controller?.getState?.() || {}, v = $("video");
    return { positionMs: Math.max(0, Math.round(Number(s.position ?? v.currentTime ?? 0) * 1e3)), durationMs: Math.max(0, Math.round(Number.isFinite(Number(s.duration ?? v.duration)) ? Number(s.duration ?? v.duration) * 1e3 : 0)), playing: s.playing ?? !v.paused, speed: state.current?.kind === "live" ? 1 : Number(s.rate || v.playbackRate || 1), liveOffsetMs: -1 };
  }
  async function closePlayer() {
    state.playGeneration = (state.playGeneration || 0) + 1;
    await watchSession?.close().catch(() => {
    });
    watchSession = null;
    if (state.current?.kind === "live" && !state.settings.privacy_mode) {
      state.lastChannel = state.current;
      collection().lastChannel = state.current;
      saveSoon();
    }
    controller?.stop();
    $("player-page").hidden = true;
    $("receiver-panel").hidden = true;
    $("app-shell").inert = false;
    if (state.page === "home") renderHome();
  }
  async function changeChannel(delta) {
    const rows = filtered(state.catalogs.live || [], { kind: "live", group: "", family: "all", query: "", favoritesOnly: false, historyOnly: false });
    if (!rows.length) return;
    const at = rows.findIndex((i) => i.id === state.current?.id);
    await playItem(rows[(Math.max(0, at) + delta + rows.length) % rows.length]);
  }
  function toggleReceiver() {
    const open = $("receiver-panel").hidden;
    $("receiver-panel").hidden = !open;
    if (open) {
      state.kind = "live";
      state.group = "";
      state.family = "all";
      state.receiverLimit = 350;
      state.receiverFilter = "";
      $("receiver-search").value = "";
      renderReceiver();
      setTimeout(() => $("receiver-categories").querySelector("button.selected,button")?.focus(), 0);
    }
  }
  function renderReceiver() {
    const rows = state.catalogs.live || [];
    state.kind = "live";
    $("receiver-categories").replaceChildren(...categoryButtons(rows, { receiver: true }));
    const q = $("receiver-search").value;
    const filteredRows = filtered(rows, { kind: "live", query: q }), filterKey = JSON.stringify([state.family, state.group, q]);
    if (state.receiverFilter !== filterKey) {
      state.receiverFilter = filterKey;
      state.receiverLimit = 350;
    }
    const receiverLimit = state.receiverLimit || 350;
    const sourceIndices = new Map(rows.map((item, i) => [item.id, i + 1]));
    $("receiver-channels").replaceChildren(...filteredRows.slice(0, receiverLimit).map((item) => {
      const button = btn("", async () => {
        if (item.id === state.current?.id) {
          $("receiver-panel").hidden = true;
          return;
        }
        await playItem(item);
        $("receiver-panel").hidden = false;
        renderReceiver();
      });
      button.dataset.channelId = item.id;
      button.classList.toggle("selected", item.id === state.current?.id);
      button.replaceChildren(node("small", "", String(sourceIndices.get(item.id)).padStart(3, "0")));
      const logo = safeURL2(item.logo, location.href);
      if (logo) {
        const image = node("img");
        image.src = logo.href;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        button.append(image);
      }
      button.append(node("span", "", (item.id === state.current?.id ? "\u25B6 " : "") + item.name));
      return button;
    }));
    if (filteredRows.length > receiverLimit) $("receiver-channels").append(btn(x(`\u0639\u0631\u0636 \u0627\u0644\u0645\u0632\u064A\u062F \u0645\u0646 \u0627\u0644\u0642\u0646\u0648\u0627\u062A (${filteredRows.length - receiverLimit})`, `Show more channels (${filteredRows.length - receiverLimit})`), () => {
      const nextId = filteredRows[receiverLimit]?.id;
      state.receiverLimit = receiverLimit + 350;
      renderReceiver();
      Array.from($("receiver-channels").querySelectorAll("[data-channel-id]")).find((button) => button.dataset.channelId === nextId)?.focus({ preventScroll: false });
    }, "down", "receiver-more"));
    $("receiver-now").textContent = state.current?.name || x("\u0627\u062E\u062A\u0631 \u0642\u0646\u0627\u0629", "Choose a channel");
  }
  async function chooseRate() {
    if (state.current?.kind === "live") return;
    choices(x("\u0633\u0631\u0639\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644", "Playback speed"), [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6].filter((rate) => !controller?.getState?.().native || rate <= 2).map((rate) => ({ label: rate + "\xD7", value: rate })), async (rate) => {
      await controller?.setRate(rate);
      $("rate-button").textContent = rate + "\xD7";
      state.settings.playback_rate = rate;
      saveSoon();
    });
  }
  function playerOptions() {
    choices(x("\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0634\u063A\u0644", "Player options"), [{ label: x("\u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0635\u0648\u0631\u0629", "Picture size"), value: "aspect", icon: "aspect" }, { label: x("\u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u062A\u0631\u062C\u0645\u0629", "Audio and subtitles"), value: "tracks", icon: "subtitles" }, { label: x("\u0645\u0624\u0642\u062A \u0627\u0644\u0646\u0648\u0645", "Sleep timer"), value: "sleep", icon: "timer" }, { label: x("\u0627\u0644\u062A\u0642\u0627\u0637 \u0635\u0648\u0631\u0629 \u0623\u0648 \u062A\u0633\u062C\u064A\u0644", "Capture or recording"), value: "capture", icon: "camera" }, ...isNative2() ? [{ label: x("\u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0641\u064A \u0645\u0634\u063A\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646", "Open native iPhone player"), value: "native", icon: "play" }] : [], { label: x("\u0625\u0639\u0627\u062F\u0629 \u0645\u062D\u0627\u0648\u0644\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644", "Retry playback"), value: "retry", icon: "refresh" }], async (value) => {
      if (value === "aspect") chooseSetting("aspect_mode", x("\u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0635\u0648\u0631\u0629", "Picture size"), [["fit", "\u0627\u062D\u062A\u0648\u0627\u0621", "Fit"], ["fill", "\u062A\u0645\u062F\u064A\u062F", "Fill"], ["zoom", "\u062A\u0643\u0628\u064A\u0631", "Zoom"], ["original", "\u0627\u0644\u062D\u062C\u0645 \u0627\u0644\u0623\u0635\u0644\u064A", "Original"]]);
      if (value === "tracks") showTracks();
      if (value === "sleep") sleepTimer();
      if (value === "capture") captureMenu();
      if (value === "native") {
        if (isNative2() && state.playingSource?.url) await controller.useNative();
        else toast(x("\u0627\u0644\u0645\u0634\u063A\u0644 \u0627\u0644\u0623\u0635\u0644\u064A \u0645\u062A\u0627\u062D \u062F\u0627\u062E\u0644 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0622\u064A\u0641\u0648\u0646\u061B \u0647\u0646\u0627 \u0627\u0633\u062A\u062E\u062F\u0645 \u0645\u0644\u0621 \u0627\u0644\u0634\u0627\u0634\u0629 \u0623\u0648 AirPlay \u0645\u0646 \u0627\u0644\u0641\u064A\u062F\u064A\u0648.", "The native player is available in the iPhone app. Here use fullscreen or AirPlay in the video."));
      }
      if (value === "retry") playItem(state.current);
    });
  }
  async function showTracks() {
    const tracks = await Promise.resolve(controller?.getTracks?.() || {});
    const box2 = node("div");
    for (const [kind, title] of [["audio", x("\u0627\u0644\u0635\u0648\u062A", "Audio")], ["subtitles", x("\u0627\u0644\u062A\u0631\u062C\u0645\u0629", "Subtitles")], ["quality", x("\u0627\u0644\u062C\u0648\u062F\u0629", "Quality")]]) {
      box2.append(node("h3", "", title));
      const rows = tracks[kind] || tracks[kind === "subtitles" ? "text" : kind] || [];
      if (!rows.length) box2.append(node("p", "", x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u0627\u0631\u0627\u062A \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u0635\u062F\u0631 \u0623\u0648 \u0627\u0644\u0645\u0634\u063A\u0644.", "No selectable tracks are available from this source or player.")));
      else for (const track of rows) {
        const b = btn(track.label || track.name || track.language || String(track.id), () => controller.setTrack(kind, track.id));
        b.classList.toggle("selected", !!track.selected);
        box2.append(b);
      }
    }
    box2.append(node("p", "", x("\u062F\u0627\u062E\u0644 \u0645\u0634\u063A\u0644 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0627\u0644\u0623\u0635\u0644\u064A \u062A\u062A\u0648\u0641\u0631 \u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0648AirPlay \u0645\u0646 \u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645.", "The native iPhone player offers supported audio, subtitles and AirPlay through system controls.")));
    sheet(x("\u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0648\u0627\u0644\u062C\u0648\u062F\u0629", "Audio, subtitles and quality"), box2);
  }
  function sleepTimer() {
    choices(x("\u0645\u0624\u0642\u062A \u0627\u0644\u0646\u0648\u0645", "Sleep timer"), [{ label: x("\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0624\u0642\u062A", "Cancel timer"), value: 0 }, ...[15, 30, 45, 60, 90, 120].map((n2) => ({ label: x(`${n2} \u062F\u0642\u064A\u0642\u0629`, `${n2} minutes`), value: n2 }))], (minutes) => {
      clearTimeout(sleepTick);
      controller?.setSleepTimer?.(minutes);
      if (minutes) sleepTick = setTimeout(() => {
        toast(x("\u0627\u0646\u062A\u0647\u0649 \u0645\u0624\u0642\u062A \u0627\u0644\u0646\u0648\u0645", "Sleep timer ended"));
      }, minutes * 6e4);
      toast(minutes ? x(`\u0633\u064A\u062A\u0648\u0642\u0641 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0628\u0639\u062F ${minutes} \u062F\u0642\u064A\u0642\u0629`, `Playback stops in ${minutes} minutes`) : x("\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0645\u0624\u0642\u062A", "Timer cancelled"));
    });
  }
  async function captureMenu() {
    const box2 = node("div");
    box2.append(node("p", "", x("\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u064A\u0639\u062A\u0645\u062F \u0639\u0644\u0649 \u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0648\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u0645\u0635\u062F\u0631. \u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0633\u062C\u064A\u0644 \u0645\u062D\u062A\u0648\u0649 \u0645\u062D\u0645\u064A.", "Capture depends on system permission and source protection. Protected content cannot be captured.")));
    box2.append(actions(btn(x("\u0627\u0644\u062A\u0642\u0627\u0637 \u0635\u0648\u0631\u0629", "Take screenshot"), async () => {
      try {
        const blob = await controller.screenshot();
        saveBlob(blob, "Abunasser-TV-screenshot.png");
        toast(x("\u062A\u0645 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u0635\u0648\u0631\u0629 \u0644\u0644\u062D\u0641\u0638", "Screenshot is ready to save"));
      } catch (error) {
        report(error);
      }
    }, "camera"), btn(x("\u0628\u062F\u0621 \u062A\u0633\u062C\u064A\u0644", "Start recording"), async () => {
      if (isNative2()) {
        await nativeRequest2("record", { action: "start" });
        toast(x("\u0628\u062F\u0623 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0634\u0627\u0634\u0629 \u0628\u0645\u0648\u0627\u0641\u0642\u0629 \u0627\u0644\u0646\u0638\u0627\u0645", "Screen recording started with system consent"));
      } else {
        await controller.startRecording({ maxMinutes: 10, maxBytes: 150 * 1024 * 1024 });
        toast(x("\u0628\u062F\u0623 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0642\u0637\u0639", "Recording started"));
      }
    }, "play"), btn(x("\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0648\u062D\u0641\u0638\u0647", "Stop and save recording"), async () => {
      if (isNative2()) {
        await nativeRequest2("stopRecording");
        toast(x("\u062A\u0645 \u0641\u062A\u062D \u062E\u064A\u0627\u0631\u0627\u062A \u062D\u0641\u0638 \u0627\u0644\u062A\u0633\u062C\u064A\u0644", "Recording save options opened"));
      } else {
        const blob = await controller.stopRecording();
        saveBlob(blob, "Abunasser-TV-recording.webm");
      }
    }, "download")));
    sheet(x("\u0627\u0644\u0627\u0644\u062A\u0642\u0627\u0637 \u0648\u0627\u0644\u062A\u0633\u062C\u064A\u0644", "Capture and recording"), box2);
  }
  function watchSource() {
    return state.current?.demo ? { ...state.playingSource, sourceUrl: new URL("/watch-demo.mp4", globalThis.ABUNASSER_CONFIG?.apiOrigin || location.href).href } : state.playingSource;
  }
  async function hostWatch() {
    if (!state.current || !state.playingSource) return;
    try {
      if (!watchSession?.active) {
        watchSession = new WatchHost();
        await watchSession.create(state.current, watchSource(), { snapshot: playerSnapshot() });
        watchSession.startHeartbeat(() => ({ item: state.current, resolved: watchSource(), snapshot: playerSnapshot() }), { onError: report });
      }
      const url = watchSession.joinURL || watchSession.watchUrl;
      const box2 = node("div");
      box2.append(node("p", "", x("\u0634\u0627\u0634\u0629 \u0648\u0627\u062D\u062F\u0629 \u0645\u0647\u0645\u0627 \u0628\u0639\u062F\u062A \u0627\u0644\u0645\u0633\u0627\u0641\u0629. \u0623\u0628\u0642\u0650 \u0627\u0644\u0645\u0634\u063A\u0644 \u0645\u0641\u062A\u0648\u062D\u064B\u0627 \u0644\u062A\u0633\u062A\u0645\u0631 \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062C\u0644\u0633\u0629. \u064A\u062F\u0639\u0645 \u0627\u0644\u0636\u064A\u0641 \u0641\u0642\u0637 \u0627\u0644\u0635\u064A\u063A \u0627\u0644\u062A\u064A \u064A\u0633\u062A\u0637\u064A\u0639 \u0645\u062A\u0635\u0641\u062D\u0647 \u062A\u0634\u063A\u064A\u0644\u0647\u0627.", "One screen, wherever you are. Keep the player open to synchronize. Guest playback depends on browser codec support.")));
      box2.append(actions(btn(x("\u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0631\u0627\u0628\u0637", "Share invitation"), async () => {
        if (isNative2()) await nativeRequest2("share", { text: x("\u0634\u0627\u0647\u062F \u0645\u0639\u064A \u0639\u0644\u0649 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV", "Watch together on abbeedo TV"), url });
        else if (navigator.share) await navigator.share({ title: brandName(state.settings.language), url });
        else await copyText(url);
      }, "friends", "primary"), btn(x("\u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637", "Copy invitation"), () => copyText(url), "copy"), btn(x("\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629", "End session"), async () => {
        await watchSession.close();
        watchSession = null;
        closeSheet();
      }, "close", "danger")));
      sheet(x("\u0634\u0627\u0647\u062F \u0645\u0639\u064A", "Watch together"), box2);
    } catch (error) {
      watchSession = null;
      report(error);
    }
  }
  async function setupDownloads() {
    if (!state.account) return;
    downloads?.destroy?.();
    downloads = new DownloadManager({ scope: scope() + "/" + state.profile, maxBytes: 512 * 1024 * 1024 });
    downloads.subscribe?.(() => {
      if (state.page === "collection" && state.view === "downloads") showDownloads();
    });
  }
  async function enqueueDownload(item) {
    if (item.kind === "live" || item.kind === "series") return toast(x("\u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0645\u062A\u0627\u062D \u0644\u0644\u0641\u064A\u0644\u0645 \u0623\u0648 \u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u0645\u062D\u062F\u0648\u062F\u0629 \u0641\u0642\u0637.", "Downloads are available only for finite movies or episodes."));
    if (!downloads) await setupDownloads();
    const source = item.demo ? { url: item.url, mime: "video/mp4" } : await api.resolve(state.account, item, {}), manager = downloads;
    void Promise.resolve(manager.enqueue(item, source)).catch((error) => {
      if (error?.name !== "AbortError" && manager === downloads) report(error);
    });
    toast(isNative2() ? x("\u0623\u064F\u0636\u064A\u0641 \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0625\u0644\u0649 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0622\u064A\u0641\u0648\u0646\u061B \u0631\u0627\u0642\u0628 \u062D\u0627\u0644\u062A\u0647 \u0641\u064A \u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A.", "Added to the iPhone download queue; check Downloads for progress.") : x("\u0623\u064F\u0636\u064A\u0641 \u0627\u0644\u062A\u0646\u0632\u064A\u0644. \u0623\u0628\u0642\u0650 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0641\u062A\u0648\u062D\u064B\u0627 \u0648\u062A\u0627\u0628\u0639 \u062D\u0627\u0644\u062A\u0647 \u0645\u0646 \u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A.", "Download added. Keep the app open and check Downloads for progress."));
  }
  function downloadLabel(value) {
    return { downloading: x("\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u0646\u0632\u064A\u0644", "Downloading"), paused: x("\u0645\u062A\u0648\u0642\u0641 \u0645\u0624\u0642\u062A\u064B\u0627", "Paused"), complete: x("\u0645\u0643\u062A\u0645\u0644", "Complete"), completed: x("\u0645\u0643\u062A\u0645\u0644", "Complete"), ready: x("\u062C\u0627\u0647\u0632", "Ready"), failed: x("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u0646\u0632\u064A\u0644", "Failed"), cancelled: x("\u0645\u0644\u063A\u0649", "Canceled") }[value] || String(value || "");
  }
  async function showDownloads() {
    state.view = "downloads";
    showPage("collection", { title: x("\u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A", "Downloads") });
    const root = $("collection-body");
    root.replaceChildren(node("h2", "collection-heading", x("\u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A", "Downloads")), node("p", "muted", isNative2() ? x("\u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0645\u0644\u0629 \u0645\u062D\u0641\u0648\u0638\u0629 \u0639\u0644\u0649 \u0627\u0644\u0622\u064A\u0641\u0648\u0646.", "Completed downloads are stored on the iPhone.") : x("\u064A\u0633\u062A\u0645\u0631 \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0623\u062B\u0646\u0627\u0621 \u0628\u0642\u0627\u0621 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0641\u062A\u0648\u062D\u064B\u0627. \u0627\u0633\u062A\u0626\u0646\u0627\u0641 \u062A\u0646\u0632\u064A\u0644 \u0645\u062A\u0648\u0642\u0641 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u064A\u0628\u062F\u0623 \u0627\u0644\u0645\u0644\u0641 \u0645\u0646 \u0627\u0644\u0628\u062F\u0627\u064A\u0629.", "Downloads run while the app stays open. Resuming a paused browser download restarts the file.")));
    if (!downloads) await setupDownloads();
    const manager = downloads, rows = await manager?.list?.() || [];
    if (manager !== downloads || state.page !== "collection" || state.view !== "downloads") return;
    if (!rows.length) {
      root.append(node("p", "empty-message", x("\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0646\u0632\u064A\u0644\u0627\u062A. \u0627\u0641\u062A\u062D \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0641\u064A\u0644\u0645 \u0623\u0648 \u062E\u064A\u0627\u0631\u0627\u062A \u062D\u0644\u0642\u0629 \u0644\u0628\u062F\u0621 \u062A\u0646\u0632\u064A\u0644.", "No downloads. Open a movie or episode options to download it.")));
      return;
    }
    for (const row of rows) {
      const status = row.status || row.state || "", line2 = node("div", "list-row"), words = node("div"), progress = row.progress ?? (row.total ? row.received / row.total : null);
      words.append(node("h3", "", row.name || row.title || row.item?.name || x("\u062A\u0646\u0632\u064A\u0644", "Download")), node("p", "", downloadLabel(status) + (progress != null ? " " + Math.round(progress * 100) + "%" : "")));
      line2.append(words);
      if (["completed", "complete", "ready"].includes(status)) line2.append(btn(x("\u0645\u0634\u0627\u0647\u062F\u0629", "Watch"), async () => {
        const kind = row.kind || (String(row.id).startsWith("episode:") ? "episode" : "movie"), known = Array.from(allKnown().values()).find((item) => item.id === row.id && item.kind === kind), offlineItem = row.item || known || { id: row.id, name: row.name || row.title, kind };
        if (!$("screen-lock").hidden) return toast(x("\u0627\u0641\u062A\u062D \u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0644\u0628\u062F\u0621 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.", "Unlock the app to start watching."));
        if (state.settings.parental_enabled && !row.item && !known) throw Error(x("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0635\u0646\u064A\u0641 \u0647\u0630\u0627 \u0627\u0644\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0642\u062F\u064A\u0645. \u0627\u0641\u062A\u062D \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0646 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0648\u0623\u0639\u062F \u062A\u0646\u0632\u064A\u0644\u0647.", "This older download has no verifiable content category. Open its title details from your subscription and download it again."));
        if (state.settings.parental_enabled && isAdult2(offlineItem)) return toast(x("\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u062D\u062C\u0648\u0628 \u0628\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629.", "This content is blocked by parental controls."));
        if (inSet("hidden", offlineItem)) return toast(x("\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u062E\u0641\u064A \u0641\u064A \u0645\u0644\u0641\u0643.", "This content is hidden in this profile."));
        if (isNative2() && manager.openNativeDownload) await manager.openNativeDownload(row.id);
        else {
          const source = await manager.getOfflineURL(row.id);
          if (!source) throw Error(x("\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u062D\u0644\u064A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F. \u0623\u0639\u062F \u062A\u0646\u0632\u064A\u0644\u0647.", "The local file is unavailable. Download it again."));
          await playItem(offlineItem, { offlineSource: { url: typeof source === "string" ? source : source.url, offline: true, mime: row.mime || "video/mp4" } });
        }
      }, "play"));
      else if (status === "downloading") {
        if (typeof manager.pause === "function") line2.append(btn(x("\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A", "Pause"), async () => {
          await manager.pause(row.id);
          if (manager === downloads) showDownloads();
        }, "pause"));
        line2.append(btn(x("\u0625\u0644\u063A\u0627\u0621", "Cancel"), () => manager.cancel(row.id), "close"));
      } else if (status === "paused" && typeof manager.resume === "function") line2.append(btn(x("\u0627\u0633\u062A\u0626\u0646\u0627\u0641", "Resume"), () => {
        void Promise.resolve(manager.resume(row.id)).catch((error) => {
          if (error?.name !== "AbortError" && manager === downloads) report(error);
        });
        if (manager === downloads) showDownloads();
      }, "play"));
      line2.append(btn(x("\u062D\u0630\u0641", "Delete"), () => confirmAction(x("\u062D\u0630\u0641 \u0627\u0644\u062A\u0646\u0632\u064A\u0644\u061F", "Delete download?"), x("\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u062D\u0644\u064A \u0641\u0642\u0637.", "Only the local file will be removed."), async () => {
        await manager.remove(row.id);
        if (manager === downloads) showDownloads();
      }), "delete"));
      root.append(line2);
    }
  }
  function allKnown() {
    const map = /* @__PURE__ */ new Map();
    for (const item of Object.values(state.catalogs).flat()) map.set(key(item), item);
    const c = collection();
    for (const [id, item] of Object.entries(c.saved || {})) map.set(id, item);
    for (const row of c.history) if (row.item) map.set(row.key, row.item);
    return map;
  }
  async function showSavedCollection(view) {
    state.view = view;
    const titles = { favorites: ["\u0627\u0644\u0645\u0641\u0636\u0644\u0629", "Favorites"], watchlist: ["\u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647", "Watchlist"], continue: ["\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Continue watching"], recent: ["\u0627\u0644\u0645\u0636\u0627\u0641 \u062D\u062F\u064A\u062B\u064B\u0627", "Recently added"], recommend: ["\u0645\u0642\u062A\u0631\u062D\u0627\u062A \u0645\u062D\u0644\u064A\u0629", "Local suggestions"] };
    if (["recent", "recommend"].includes(view)) return openCatalog(state.kind === "live" ? "movie" : state.kind, { view });
    showPage("collection", { title: x(...titles[view] || ["\u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Content"]) });
    const c = collection(), known = allKnown();
    let rows = view === "continue" ? c.history.map((h) => known.get(h.key)).filter(Boolean) : (c[view] || []).map((id) => known.get(id)).filter(Boolean);
    rows = rows.filter((item) => !c.hidden.includes(key(item)) && (!state.settings.parental_enabled || !isAdult2(item)));
    const root = $("collection-body");
    root.replaceChildren(node("h2", "collection-heading", x(...titles[view] || ["\u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Content"])));
    if (!rows.length) root.append(node("p", "empty-message", x("\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062D\u062A\u0648\u0649 \u0645\u062D\u0641\u0648\u0638 \u0647\u0646\u0627 \u0628\u0639\u062F. \u0627\u0641\u062A\u062D \u0623\u062D\u062F \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0648\u0627\u062E\u062A\u0631 \u0645\u0646 \u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0646\u0648\u0627\u0646.", "Nothing is saved here yet. Open a section and use title options.")));
    else {
      const grid = node("div", "catalog-grid");
      grid.append(...rows.map(mediaCard));
      root.append(grid);
    }
  }
  function showAccount() {
    if (!state.account) return toast(x("\u0623\u0636\u0641 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0623\u0648\u0644\u064B\u0627.", "Add a subscription first."));
    const a = state.account, u = state.userInfo || {}, expiry = formatExpiry2(u, { locale: state.settings.language === "en" ? "en-GB" : "ar-SA-u-ca-gregory" }), box2 = node("div");
    box2.append(node("p", "", x("\u0646\u0648\u0639 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643: ", "Subscription type: ") + (a.mode || "")), node("p", "", x("\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645: ", "Username: ") + (a.username || a.name || x("\u063A\u064A\u0631 \u0645\u0637\u0644\u0648\u0628", "Not required"))), node("p", "", expiry.known ? x(expiry.text, `Subscription ends: ${expiry.date} \xB7 ${expiry.expired ? "Expired" : `${expiry.days} days left`}`) : x("\u0644\u0645 \u064A\u0631\u0633\u0644 \u0627\u0644\u0645\u0635\u062F\u0631 \u062A\u0627\u0631\u064A\u062E \u0627\u0646\u062A\u0647\u0627\u0621.", "No expiry date was supplied.")), node("p", "", x("\u0627\u0644\u062D\u0627\u0644\u0629: ", "Status: ") + (u.status || x(state.demo ? "\u062A\u062C\u0631\u0628\u0629" : "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F\u0629", state.demo ? "Demo" : "Not supplied"))));
    let revealed = false;
    const pass = node("p", "", x("\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631: ", "Password: ") + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
    if (a.password) {
      box2.append(pass, btn(x("\u0625\u0638\u0647\u0627\u0631 / \u0625\u062E\u0641\u0627\u0621 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Show / hide password"), () => {
        revealed = !revealed;
        pass.textContent = x("\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631: ", "Password: ") + (revealed ? a.password : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
      }, "eye"));
    }
    box2.append(actions(btn(x("\u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Refresh subscription info"), async () => {
      if (state.demo) return;
      const auth = await api.authenticate(a, {});
      state.userInfo = auth.userInfo || {};
      persist();
      showAccount();
    }, "refresh")));
    sheet(x("\u062D\u0633\u0627\u0628\u064A", "My account"), box2);
  }
  function showAccounts() {
    const box2 = node("div");
    if (!state.accounts.length) box2.append(node("p", "", x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0645\u062D\u0641\u0648\u0638\u0629. \u0641\u0639\u0651\u0644 \u0627\u0644\u062D\u0641\u0638 \u0639\u0646\u062F \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644.", "No saved subscriptions. Enable saving when signing in.")));
    for (const account of state.accounts) {
      const row = node("div", "list-row"), words = node("div");
      words.append(node("h3", "", account.name || account.username || account.mode), node("p", "", account.mode));
      row.append(words, btn(x("\u062F\u062E\u0648\u0644", "Sign in"), async () => {
        closeSheet();
        await doLogin(account, { remember: true });
      }, "play"), btn(x("\u062A\u0633\u0645\u064A\u0629", "Rename"), async () => {
        const values = await fieldsForm(x("\u062A\u0633\u0645\u064A\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Rename subscription"), [{ name: "name", label: x("\u0627\u0644\u0627\u0633\u0645", "Name"), value: account.name || account.username }]);
        if (values) {
          account.name = values.name;
          await persist();
          showAccounts();
        }
      }, "text"), btn(x("\u062D\u0630\u0641", "Delete"), () => confirmAction(x("\u062D\u0630\u0641 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u061F", "Delete subscription?"), x("\u0633\u064A\u064F\u062D\u0630\u0641 \u062D\u0641\u0638 \u0647\u0630\u0627 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0645\u0646 \u0627\u0644\u062C\u0647\u0627\u0632.", "This subscription will be removed from this device."), async () => {
        state.accounts = state.accounts.filter((a) => a !== account);
        await persist();
        showAccounts();
      }), "delete"));
      box2.append(row);
    }
    box2.append(btn(x("\u0625\u0636\u0627\u0641\u0629 \u0627\u0634\u062A\u0631\u0627\u0643", "Add subscription"), () => {
      closeSheet();
      showPage("login");
    }, "accounts", "primary"));
    sheet(x("\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629", "Saved subscriptions"), box2);
  }
  function showProfiles() {
    const box2 = node("div");
    for (const name of state.profiles) {
      const row = node("div", "list-row"), words = node("div");
      words.append(node("h3", "", name), node("p", "", name === state.profile ? x("\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u062D\u0627\u0644\u064A", "Current profile") : x("\u0645\u0641\u0636\u0644\u0629 \u0648\u0633\u062C\u0644 \u0648\u0625\u062E\u0641\u0627\u0621 \u0645\u0633\u062A\u0642\u0644\u0629", "Separate favorites, history and hidden items")));
      row.append(words, btn(x("\u0627\u062E\u062A\u064A\u0627\u0631", "Select"), async () => {
        await closePlayer();
        state.profile = name;
        state.lastChannel = collection().lastChannel || null;
        state.group = "";
        state.family = "all";
        await persist();
        setupDownloads();
        closeSheet();
        if (state.page === "catalog") renderCatalog();
        toast(x("\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0645\u0644\u0641", "Profile changed"));
      }, "account"));
      if (state.profiles.length > 1) row.append(btn(x("\u062D\u0630\u0641", "Delete"), () => confirmAction(x("\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641\u061F", "Delete profile?"), x("\u0633\u064A\u064F\u062D\u0630\u0641 \u0627\u0644\u0645\u0644\u0641 \u0648\u062A\u0641\u0636\u064A\u0644\u0627\u062A\u0647 \u0627\u0644\u0645\u062D\u0644\u064A\u0629.", "The profile and its local preferences will be deleted."), async () => {
        state.profiles = state.profiles.filter((p) => p !== name);
        for (const id of Object.keys(state.collections)) if (id.endsWith("|" + name)) delete state.collections[id];
        if (state.profile === name) state.profile = state.profiles[0];
        await persist();
        showProfiles();
      }), "delete"));
      box2.append(row);
    }
    box2.append(btn(x("\u0645\u0644\u0641 \u062C\u062F\u064A\u062F", "New profile"), async () => {
      const values = await fieldsForm(x("\u0645\u0644\u0641 \u062C\u062F\u064A\u062F", "New profile"), [{ name: "name", label: x("\u0627\u0633\u0645 \u0627\u0644\u0645\u0644\u0641", "Profile name") }]);
      if (values) {
        const name = values.name.trim().slice(0, 50);
        if (name && !state.profiles.includes(name)) {
          state.profiles.push(name);
          await persist();
        }
        showProfiles();
      }
    }, "profiles", "primary"));
    sheet(x("\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646", "User profiles"), box2);
  }
  async function logout() {
    await closePlayer();
    loadAbort?.abort();
    await pairSession?.close?.().catch(() => {
    });
    pairSession = null;
    state.account = null;
    state.userInfo = null;
    state.demo = false;
    state.catalogs = {};
    state.current = null;
    $("password").value = "";
    await persist();
    showPage("login");
  }
  async function showGuide(channel = state.current?.kind === "live" ? state.current : null) {
    if (!channel) {
      if (!(state.catalogs.live || []).length) {
        try {
          await getCatalog("live");
        } catch (error) {
          return report(error);
        }
      }
      const rows = filtered(state.catalogs.live || [], { kind: "live", family: "all", group: "", query: "" });
      if (!rows.length) return toast(x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0646\u0648\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u0644\u0639\u0631\u0636 \u062F\u0644\u064A\u0644\u0647\u0627.", "No channels are available for the guide."));
      return choices(x("\u0627\u062E\u062A\u0631 \u0642\u0646\u0627\u0629 \u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Choose a channel"), rows.slice(0, 300).map((item) => ({ label: item.name, value: item.id })), (id) => showGuide(rows.find((i) => i.id === id)));
    }
    const box2 = node("div");
    box2.append(node("p", "", x("\u062C\u0627\u0631\u064D \u062C\u0644\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631\u2026", "Fetching guide data from the provider\u2026")));
    sheet(x("\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C: ", "Program guide: ") + channel.name, box2);
    try {
      let programs = [];
      if (state.demo) programs = [{ title: x("\u0645\u0642\u0637\u0639 \u062A\u062C\u0631\u064A\u0628\u064A \u0645\u0645\u0644\u0648\u0643", "Owned demo clip"), description: x("\u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0648\u0636\u064A\u062D\u064A\u0629 \u0644\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C.", "Sample guide data."), start: Date.now() / 1e3, end: Date.now() / 1e3 + 1800 }];
      else programs = await api.epg(state.account, channel, {});
      if (!Array.isArray(programs)) programs = programs.programs || programs.epg_listings || [];
      if (state.localEpg?.length) {
        const mapping = state.settings.epg_mapping?.[channel.id] || channel.epgId || channel.name;
        const local = state.localEpg.filter((p) => p.channel === mapping);
        if (local.length) programs = local;
      }
      box2.replaceChildren();
      const tools = actions(btn(x("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062F\u0644\u064A\u0644", "Guide settings"), () => guideSettings(channel), "settings"), btn(x("\u0625\u0636\u0627\u0641\u0629 XMLTV", "Import XMLTV"), () => importXMLTV(channel), "upload"));
      box2.append(tools);
      if (!programs.length) box2.append(node("p", "", x("\u0644\u0645 \u064A\u0648\u0641\u0631 \u0627\u0644\u0645\u0635\u062F\u0631 \u0628\u0631\u0627\u0645\u062C \u0644\u0647\u0630\u0647 \u0627\u0644\u0642\u0646\u0627\u0629. \u064A\u0645\u0643\u0646\u0643 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0645\u0644\u0641 XMLTV \u0648\u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u0642\u0646\u0627\u0629.", "No guide data was supplied. Import an XMLTV file and map the channel.")));
      for (const program of programs.slice(0, 200)) {
        const row = node("div", "list-row"), words = node("div"), start = programTime(program.start || program.start_timestamp || program.startTime), end = programTime(program.end || program.stop || program.stop_timestamp);
        words.append(node("h3", "", decodeText(program.title || program.name) || x("\u0628\u0631\u0646\u0627\u0645\u062C", "Program")), node("p", "", `${guideTime(start)} \u2013 ${guideTime(end)}`), node("p", "", decodeText(program.description || program.desc) || ""));
        row.append(words);
        if (start > Date.now()) row.append(btn(x("\u062A\u0630\u0643\u064A\u0631", "Remind"), () => addReminder(channel, program, start), "notifications"));
        const replay = safeURL2(program.catchup_url || program.url || "");
        if (replay && end < Date.now() && ["direct", "m3u", "m3u-file"].includes(state.account?.mode)) row.append(btn(x("\u0625\u0639\u0627\u062F\u0629", "Replay"), () => playItem({ ...channel, id: channel.id + ":catchup:" + start, kind: "movie", url: replay.href }), "history"));
        box2.append(row);
      }
    } catch (error) {
      box2.replaceChildren(node("p", "inline-error", report(error)));
    }
  }
  function decodeText(value) {
    const text2 = String(value || "");
    if (!text2 || text2.length % 4 || !/[A-Za-z0-9+/]+=*$/.test(text2)) return text2;
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(text2), (c) => c.charCodeAt(0)));
      return /[\p{L}\p{N}]/u.test(decoded) && !decoded.includes("\uFFFD") ? decoded : text2;
    } catch {
      return text2;
    }
  }
  function programTime(value) {
    if (!value) return NaN;
    const n2 = Number(value);
    if (Number.isFinite(n2) && n2 > 0) return n2 < 1e12 ? n2 * 1e3 : n2;
    const xml = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/.exec(String(value));
    if (xml) return Date.parse(`${xml[1]}-${xml[2]}-${xml[3]}T${xml[4]}:${xml[5]}:${xml[6]}${xml[7] ? xml[7].slice(0, 3) + ":" + xml[7].slice(3) : "Z"}`);
    return Date.parse(value);
  }
  function guideTime(time) {
    if (!Number.isFinite(time)) return "\u2014";
    const zone = state.settings.epg_timezone === "local" ? void 0 : state.settings.epg_timezone;
    try {
      return new Date(time + Number(state.settings.epg_offset_minutes || 0) * 6e4).toLocaleString(state.settings.language === "en" ? "en-GB" : "ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: zone });
    } catch {
      return new Date(time).toLocaleTimeString();
    }
  }
  async function guideSettings(channel) {
    const values = await fieldsForm(x("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Guide settings"), [{ name: "zone", label: x("\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0632\u0645\u0646\u064A\u0629", "Time zone"), value: state.settings.epg_timezone || "local", options: [{ value: "local", label: x("\u062D\u0633\u0628 \u0627\u0644\u062C\u0647\u0627\u0632", "Device time zone") }, { value: "Asia/Riyadh", label: x("\u0627\u0644\u0631\u064A\u0627\u0636", "Riyadh") }, { value: "UTC", label: "UTC" }] }, { name: "offset", label: x("\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u062A\u0648\u0642\u064A\u062A \u0628\u0627\u0644\u062F\u0642\u0627\u0626\u0642", "Time offset in minutes"), type: "number", value: state.settings.epg_offset_minutes || 0 }, { name: "mapping", label: x("\u0645\u0639\u0631\u0641 \u0642\u0646\u0627\u0629 XMLTV (\u0627\u062E\u062A\u064A\u0627\u0631\u064A)", "XMLTV channel ID (optional)"), value: state.settings.epg_mapping?.[channel.id] || channel.epgId || "", required: false }]);
    if (values) {
      state.settings.epg_timezone = values.zone;
      state.settings.epg_offset_minutes = Math.max(-1440, Math.min(1440, Number(values.offset) || 0));
      state.settings.epg_mapping ??= {};
      state.settings.epg_mapping[channel.id] = values.mapping;
      saveSoon();
      showGuide(channel);
    }
  }
  function importXMLTV(channel) {
    const input = node("input");
    input.type = "file";
    input.accept = ".xml,.xmltv,text/xml,application/xml";
    input.onchange = async () => {
      try {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) throw Error(x("\u062D\u062C\u0645 \u0645\u0644\u0641 \u0627\u0644\u062F\u0644\u064A\u0644 \u0623\u0643\u0628\u0631 \u0645\u0646 25 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.", "Guide file exceeds 25 MB."));
        const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
        if (xml.querySelector("parsererror")) throw Error(x("\u0645\u0644\u0641 XMLTV \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.", "Invalid XMLTV file."));
        const programs = [...xml.querySelectorAll("programme")].slice(0, 1e5).map((p) => ({ channel: p.getAttribute("channel"), start: p.getAttribute("start"), stop: p.getAttribute("stop"), title: p.querySelector("title")?.textContent || "", description: p.querySelector("desc")?.textContent || "" }));
        state.localEpg = programs;
        await vault.set("epg", programs);
        toast(x(`\u062A\u0645 \u0627\u0633\u062A\u064A\u0631\u0627\u062F ${programs.length} \u0628\u0631\u0646\u0627\u0645\u062C. \u0627\u062E\u062A\u0631 \u0645\u0639\u0631\u0641 \u0627\u0644\u0642\u0646\u0627\u0629 \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062F\u0644\u064A\u0644.`, `Imported ${programs.length} programs. Map the channel ID in guide settings.`));
        guideSettings(channel);
      } catch (error) {
        report(error);
      }
    };
    input.click();
  }
  async function addReminder(channel, program, time) {
    state.reminders ??= [];
    state.reminders.push({ channel: channel.name, title: decodeText(program.title || program.name), time });
    await vault.set("reminders", state.reminders);
    scheduleReminders();
    toast(x("\u062A\u0645 \u0636\u0628\u0637 \u0627\u0644\u062A\u0630\u0643\u064A\u0631 \u0623\u062B\u0646\u0627\u0621 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062A\u0637\u0628\u064A\u0642. \u0644\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u062E\u0627\u0631\u062C \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0633\u062A\u062E\u062F\u0645 \u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0627\u0644\u0645\u062F\u0639\u0648\u0645\u0629.", "Reminder set while the app is active. Outside the app, iPhone notification support and permission apply."));
  }
  function scheduleReminders() {
    for (const reminder of state.reminders || []) {
      if (reminder.scheduled || reminder.time < Date.now()) continue;
      const delay = reminder.time - Date.now();
      if (delay > 2147483e3) continue;
      reminder.scheduled = true;
      setTimeout(async () => {
        toast(reminder.channel + " \xB7 " + reminder.title);
        if (state.settings.notifications) await deliverNotification({ id: reminder.channel + "|" + reminder.title + "|" + reminder.time, title: reminder.channel, body: reminder.title, url: location.origin + "/app" });
      }, delay);
    }
  }
  async function showNotifications() {
    const box2 = node("div");
    box2.append(node("p", "", x("\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0648\u0627\u0644\u062A\u0630\u0643\u064A\u0631\u0627\u062A \u0627\u0644\u0645\u062D\u0644\u064A\u0629 \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632\u0643.", "App announcements and local reminders available on your device.")));
    try {
      const base = globalThis.ABUNASSER_CONFIG?.apiOrigin || location.origin;
      const response = await appFetch(new URL("/api/announcements", base), { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        for (const message of data.messages || []) {
          box2.append(node("h3", "", message.title), node("p", "", message.body));
        }
        if (!data.messages?.length) box2.append(node("p", "", x("\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0646\u0628\u064A\u0647\u0627\u062A \u062D\u0627\u0644\u064A\u064B\u0627.", "There are no announcements right now.")));
      } else throw Error("Announcements unavailable");
    } catch {
      box2.append(node("p", "", x("\u062A\u0639\u0630\u0631 \u062C\u0644\u0628 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u0622\u0646.", "Could not fetch announcements right now.")));
    }
    box2.append(btn(x("\u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", "Notification permissions"), requestNotifications, "notifications"));
    sheet(x("\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A", "Notifications"), box2);
  }
  async function requestNotifications() {
    if (state.settings.notifications) {
      const box2 = node("div");
      box2.append(node("p", "", x("\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0645\u0641\u0639\u0651\u0644\u0629 \u0644\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0627\u0644\u062C\u062F\u064A\u062F\u0629 \u0648\u0627\u0644\u062A\u0630\u0643\u064A\u0631\u0627\u062A \u0623\u062B\u0646\u0627\u0621 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "System alerts are enabled for new announcements and reminders while the app is running.")), actions(btn(x("\u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u062A\u062C\u0631\u064A\u0628\u064A", "Send a test notification"), async () => {
        const message2 = x("\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u062A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.", "Notifications are working on this device.");
        const result2 = await deliverNotification({ id: "notification-test", title: brandName(state.settings.language), body: message2, url: location.origin + "/app" });
        toast(result2.delivered ? x("\u0623\u064F\u0631\u0633\u0644 \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A.", "Test notification sent.") : x("\u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u0645\u062A\u0627\u062D \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642. \u0631\u0627\u062C\u0639 \u0625\u0630\u0646 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0641\u064A \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632.", "In-app alert shown. Check notification permission in device settings."));
      }, "notifications", "primary"), btn(x("\u0625\u064A\u0642\u0627\u0641 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u0644\u062A\u0637\u0628\u064A\u0642", "Turn off app system alerts"), async () => {
        if (typeof globalThis.abunasserDesktop?.setNotificationsEnabled === "function") {
          const result2 = await globalThis.abunasserDesktop.setNotificationsEnabled(false);
          if (result2?.ok === false) throw Error("Notification preference failed");
        }
        state.settings.notifications = false;
        await persist();
        closeSheet();
        if (state.page === "settings") renderSettings();
        toast(x("\u0623\u064F\u0648\u0642\u0641\u062A \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645. \u062A\u0628\u0642\u0649 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "System alerts are off. Announcements remain available inside the app."));
      }, "close")));
      return sheet(x("\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", "Notifications"), box2);
    }
    const result = await requestNotificationPermission();
    state.settings.notifications = result.granted === true;
    await persist();
    if (state.page === "settings") renderSettings();
    if (result.granted) return toast(x("\u062A\u0645 \u0627\u0644\u0633\u0645\u0627\u062D \u0628\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A. \u064A\u0645\u0643\u0646\u0643 \u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u062A\u062C\u0631\u064A\u0628\u064A \u0645\u0646 \u0627\u0644\u062E\u064A\u0627\u0631 \u0646\u0641\u0633\u0647.", "Notifications enabled. Open this setting again to send a test alert."));
    const message = { denied: x("\u0644\u0645 \u064A\u064F\u0633\u0645\u062D \u0628\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A. \u063A\u064A\u0651\u0631 \u0627\u0644\u0625\u0630\u0646 \u0645\u0646 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0623\u0648 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0625\u0646 \u0631\u063A\u0628\u062A. \u062A\u0628\u0642\u0649 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "Notifications were denied. You can change permission in device or browser settings. In-app announcements remain available."), dismissed: x("\u0644\u0645 \u064A\u0643\u062A\u0645\u0644 \u0627\u0644\u0633\u0645\u0627\u062D \u0628\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.", "Notification permission was not granted. You can try again."), "install-required": x("\u0639\u0644\u0649 \u0627\u0644\u0622\u064A\u0641\u0648\u0646\u060C \u0623\u0636\u0641 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0648\u0627\u0641\u062A\u062D\u0647 \u0645\u0646\u0647\u0627. \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0648\u064A\u0628 \u062A\u062D\u062A\u0627\u062C iOS 16.4 \u0623\u0648 \u0623\u062D\u062F\u062B.", "On iPhone, add the app to your Home Screen and open its icon. Web notifications require iOS 16.4 or later."), "insecure-context": x("\u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u062A\u062D\u062A\u0627\u062C \u0645\u0648\u0642\u0639\u064B\u0627 \u0622\u0645\u0646\u064B\u0627 \u0639\u0628\u0631 HTTPS. \u062A\u0628\u0642\u0649 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0645\u062A\u0627\u062D\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "System notifications need a secure HTTPS site. In-app announcements remain available."), unsupported: x("\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u0644\u0627 \u064A\u0648\u0641\u0631 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u0647\u0630\u0627 \u0627\u0644\u062A\u0637\u0628\u064A\u0642. \u062A\u0638\u0647\u0631 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u0623\u062B\u0646\u0627\u0621 \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "This device does not expose system notifications for this app. Announcements appear while the app is open.") }[result.reason] || x("\u062A\u0639\u0630\u0631 \u062A\u0641\u0639\u064A\u0644 \u0625\u0634\u0639\u0627\u0631\u0627\u062A \u0627\u0644\u0646\u0638\u0627\u0645. \u062A\u0638\u0647\u0631 \u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A \u062F\u0627\u062E\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0623\u062B\u0646\u0627\u0621 \u0641\u062A\u062D\u0647.", "System notifications could not be enabled. Announcements appear while the app is open.");
    sheet(x("\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", "Notifications"), message);
  }
  function settingsGroups() {
    return [
      ["\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A", "Subscriptions and accounts", [["accounts", "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629", "Saved subscriptions"], ["profiles", "\u0645\u0644\u0641\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646", "User profiles"], ["account", "\u062D\u0633\u0627\u0628\u064A", "My account"], ["qr", "\u0625\u0636\u0627\u0641\u0629 \u0627\u0634\u062A\u0631\u0627\u0643 QR", "Add with QR"], ["remote", "\u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0648\u0627\u0644\u0631\u064A\u0645\u0648\u062A", "Devices and remote"]]],
      ["\u0627\u0644\u0645\u0638\u0647\u0631 \u0648\u0633\u0647\u0648\u0644\u0629 \u0627\u0644\u0648\u0635\u0648\u0644", "Appearance and accessibility", [["language", "\u0627\u0644\u0644\u063A\u0629", "Language"], ["palette", "\u0644\u0648\u0646 \u0627\u0644\u062A\u0645\u064A\u064A\u0632", "Accent color"], ["theme", "\u0627\u0644\u062B\u064A\u0645", "Theme"], ["motion", "\u062D\u0631\u0643\u0629 \u0627\u0644\u062E\u0644\u0641\u064A\u0629", "Background motion"], ["reduced", "\u062A\u0642\u0644\u064A\u0644 \u0627\u0644\u062D\u0631\u0643\u0629", "Reduce motion"], ["text", "\u062D\u062C\u0645 \u0627\u0644\u0646\u0635", "Text size"], ["contrast", "\u0627\u0644\u062A\u0628\u0627\u064A\u0646 \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062F", "Contrast and focus"], ["layout", "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Home layout"], ["start", "\u0634\u0627\u0634\u0629 \u0627\u0644\u0628\u062F\u0627\u064A\u0629", "Start screen"], ["screensaver", "\u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0648\u0642\u0641", "Screensaver"], ["timer", "\u0645\u0647\u0644\u0629 \u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0648\u0642\u0641", "Screensaver delay"]]],
      ["\u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0648\u0627\u0644\u0623\u062F\u0627\u0621", "Playback and performance", [["decoder", "\u0641\u0643 \u062A\u0631\u0645\u064A\u0632 \u0627\u0644\u0641\u064A\u062F\u064A\u0648", "Video decoding"], ["aspect", "\u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0635\u0648\u0631\u0629", "Picture size"], ["buffer", "\u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u0624\u0642\u062A", "Buffer"], ["seek", "\u0627\u0644\u062A\u0642\u062F\u064A\u0645 \u0648\u0627\u0644\u0625\u0631\u062C\u0627\u0639", "Seek interval"], ["next", "\u0627\u0644\u062D\u0644\u0642\u0629 \u0627\u0644\u062A\u0627\u0644\u064A\u0629", "Next episode"], ["data", "\u062A\u0648\u0641\u064A\u0631 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", "Data saver"], ["categories", "\u062A\u0635\u0646\u064A\u0641 \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Channel categories"], ["refresh", "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Channel refresh"], ["guide", "\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Program guide"]]],
      ["\u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629 \u0648\u0627\u0644\u062A\u062D\u0643\u0645", "Privacy and control", [["pin", "\u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "App PIN lock"], ["parental", "\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629", "Parental controls"], ["hidden", "\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0645\u062E\u0641\u064A", "Hidden content"], ["privacy", "\u0648\u0636\u0639 \u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629", "Privacy mode"], ["history", "\u0645\u0633\u062D \u0633\u062C\u0644 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Clear watch history"], ["backup", "\u0646\u0633\u062E\u0629 \u0645\u0634\u0641\u0631\u0629", "Encrypted backup"], ["restore", "\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", "Import data"], ["delete", "\u062D\u0630\u0641 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A", "Delete data"]]],
      ["\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629 \u0648\u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A", "Help and updates", [["support", "\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", "Technical support"], ["network", "\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0623\u062E\u0637\u0627\u0621", "Connection and errors"], ["tools", "\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u0639\u0637\u0627\u0644", "Troubleshooting"], ["setup", "\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643", "Set up subscription"], ["demo", "\u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0648\u0627\u062C\u0647\u0629", "Try the interface"], ["update", "\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "App update"], ["notifications", "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A", "Notifications"], ["help", "\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629", "Help"], ...state.account ? [["logout", "\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C", "Sign out"]] : []]]
    ];
  }
  function settingValue(id) {
    const p = state.settings, yes = x("\u0645\u0641\u0639\u0651\u0644", "On"), no = x("\u0645\u062A\u0648\u0642\u0641", "Off");
    const toggles = { reduced: "reduced_motion", contrast: "high_contrast", next: "auto_next", data: "data_saver", categories: "auto_categories", privacy: "privacy_mode", parental: "parental_enabled", notifications: "notifications" };
    if (toggles[id]) return p[toggles[id]] ? yes : no;
    return { language: p.language === "en" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", palette: p.accent, theme: { dark: x("\u062F\u0627\u0643\u0646", "Dark"), light: x("\u0641\u0627\u062A\u062D", "Light"), sport: x("\u0631\u064A\u0627\u0636\u064A", "Sport"), cinema: x("\u0633\u064A\u0646\u0645\u0627\u0626\u064A", "Cinema") }[p.theme], motion: { standard: x("\u0648\u0627\u0636\u062D\u0629", "Visible"), fast: x("\u0633\u0631\u064A\u0639\u0629", "Fast"), off: x("\u062B\u0627\u0628\u062A\u0629", "Still") }[p.background_speed], text: Math.round(p.text_scale * 100) + "%", timer: p.screensaver_minutes + x(" \u062F\u0642\u0627\u0626\u0642", " minutes"), seek: p.seek_step_seconds + x(" \u062B\u0627\u0646\u064A\u0629", " seconds"), decoder: x("\u062A\u0644\u0642\u0627\u0626\u064A \u062D\u0633\u0628 \u0627\u0644\u0646\u0638\u0627\u0645", "Automatic by the system"), aspect: p.aspect_mode, buffer: [x("\u0645\u062A\u0648\u0627\u0632\u0646", "Balanced"), x("\u0632\u0645\u0646 \u0623\u0642\u0644", "Low latency"), x("\u062B\u0628\u0627\u062A \u0623\u0639\u0644\u0649", "Stable")][Number(p.buffer_mode) || 0], refresh: p.catalog_refresh_hours ? x(`\u0643\u0644 ${p.catalog_refresh_hours} \u0633\u0627\u0639\u0627\u062A`, `Every ${p.catalog_refresh_hours} hours`) : x("\u064A\u062F\u0648\u064A \u0641\u0642\u0637", "Manual only"), profiles: state.profile, pin: state.pin ? yes : no, remote: pairSession?.active ? x("\u062C\u0644\u0633\u0629 \u0645\u0631\u062A\u0628\u0637\u0629", "Active session") : x("\u0631\u0628\u0637 \u0645\u0624\u0642\u062A", "Temporary pairing"), update: APP_VERSION }[id] || "";
  }
  function renderSettings() {
    const root = $("settings-groups");
    root.replaceChildren();
    for (const [ar, en, entries] of settingsGroups()) {
      const section = node("section", "settings-group");
      section.append(node("h2", "", x(ar, en)));
      const grid = node("div", "settings-grid");
      for (const [id, labelAR, labelEN] of entries) {
        const b = btn("", () => settingAction(id), id, "setting-tile");
        b.dataset.setting = id;
        b.append(node("strong", "", x(labelAR, labelEN)));
        const value = settingValue(id);
        if (value) b.append(node("small", "", value));
        grid.append(b);
      }
      section.append(grid);
      root.append(section);
    }
    const intro = $("settings-page").querySelector(".settings-intro");
    intro.querySelector("p").textContent = x("\u062A\u0641\u0636\u064A\u0644\u0627\u062A\u0643\u060C \u0628\u0627\u0644\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062A\u064A \u062A\u0646\u0627\u0633\u0628\u0643.", "Make it feel like yours.");
    intro.querySelector("span").textContent = x("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0648\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u0635\u0641\u062D\u0629 \u0648\u0627\u062D\u062F\u0629", "Device and subscription settings on one page");
  }
  function chooseSetting(keyName, title, options) {
    choices(title, options.map(([value, ar, en]) => ({ value, label: x(ar, en), selected: state.settings[keyName] === value })), async (value) => {
      state.settings[keyName] = value;
      if (keyName === "language" && state.demo) state.catalogs = demoItems();
      if (keyName === "privacy_mode" && value) {
        collection().history = [];
        collection().progress = {};
      }
      applyPreferences();
      if (state.page === "settings") renderSettings();
      if (state.page === "home") renderHome();
      if (state.page === "catalog") renderCatalog();
      await persist();
    });
  }
  async function toggleSetting(keyName) {
    state.settings[keyName] = !state.settings[keyName];
    if (keyName === "privacy_mode" && state.settings[keyName]) {
      collection().history = [];
      collection().progress = {};
    }
    applyPreferences();
    renderSettings();
    await persist();
  }
  async function settingAction(id) {
    const toggle = { reduced: "reduced_motion", contrast: "high_contrast", next: "auto_next", data: "data_saver", categories: "auto_categories", privacy: "privacy_mode" };
    if (toggle[id]) return toggleSetting(toggle[id]);
    switch (id) {
      case "accounts":
        return showAccounts();
      case "profiles":
        return showProfiles();
      case "account":
        return showAccount();
      case "qr":
        return addWithQR();
      case "remote":
        return remoteDevices();
      case "language":
        return chooseSetting("language", x("\u0627\u0644\u0644\u063A\u0629", "Language"), LANGUAGES.map((row) => [row.code, row.name, row.name]));
      case "palette": {
        const box2 = node("div");
        box2.append(node("p", "", x("\u0627\u062E\u062A\u0631 \u0644\u0648\u0646 \u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0627\u062A \u0648\u0627\u0644\u062A\u0645\u064A\u064A\u0632.", "Choose icon and focus color.")));
        const color2 = node("input");
        color2.type = "color";
        color2.value = state.settings.accent;
        color2.oninput = () => {
          state.settings.accent = color2.value;
          applyPreferences();
          saveSoon();
        };
        box2.append(color2);
        return sheet(x("\u0644\u0648\u0646 \u0627\u0644\u062A\u0645\u064A\u064A\u0632", "Accent color"), box2);
      }
      case "theme":
        return chooseSetting("theme", x("\u0627\u0644\u062B\u064A\u0645", "Theme"), [["dark", "\u062F\u0627\u0643\u0646", "Dark"], ["light", "\u0641\u0627\u062A\u062D", "Light"], ["sport", "\u0631\u064A\u0627\u0636\u064A", "Sport"], ["cinema", "\u0633\u064A\u0646\u0645\u0627\u0626\u064A", "Cinema"]]);
      case "motion":
        return chooseSetting("background_speed", x("\u062D\u0631\u0643\u0629 \u0627\u0644\u062E\u0644\u0641\u064A\u0629", "Background motion"), [["standard", "\u0648\u0627\u0636\u062D\u0629", "Visible"], ["fast", "\u0633\u0631\u064A\u0639\u0629", "Fast"], ["off", "\u062B\u0627\u0628\u062A\u0629", "Still"]]);
      case "text":
        return chooseSetting("text_scale", x("\u062D\u062C\u0645 \u0627\u0644\u0646\u0635", "Text size"), [1, 1.15, 1.3, 1.5].map((v) => [v, Math.round(v * 100) + "%", Math.round(v * 100) + "%"]));
      case "layout":
        return chooseSetting("home_order", x("\u062A\u0631\u062A\u064A\u0628 \u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629 \u0645\u0646 \u0627\u0644\u064A\u0633\u0627\u0631", "Home sections from the left"), ["series,live,movie", "live,movie,series", "movie,series,live", "series,movie,live", "live,series,movie", "movie,live,series"].map((v) => [v, v.split(",").map(label).join(" \xB7 "), v.split(",").map(label).join(" \xB7 ")]));
      case "start":
        return chooseSetting("start_screen", x("\u0634\u0627\u0634\u0629 \u0627\u0644\u0628\u062F\u0627\u064A\u0629", "Start screen"), [["home", "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629", "Home"], ["live", "\u0627\u0644\u0642\u0646\u0648\u0627\u062A", "Live TV"], ["movie", "\u0627\u0644\u0623\u0641\u0644\u0627\u0645", "Movies"], ["series", "\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062A", "Series"], ["last_section", "\u0622\u062E\u0631 \u0642\u0633\u0645", "Last section"], ["last_channel", "\u0622\u062E\u0631 \u0642\u0646\u0627\u0629", "Last channel"]]);
      case "screensaver":
        return chooseSetting("screensaver_mode", x("\u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0648\u0642\u0641", "Screensaver"), [["off", "\u0645\u062A\u0648\u0642\u0641\u0629", "Off"], ["clock", "\u0633\u0627\u0639\u0629", "Clock"], ["black", "\u0634\u0627\u0634\u0629 \u0633\u0648\u062F\u0627\u0621", "Black screen"]]);
      case "timer":
        return chooseSetting("screensaver_minutes", x("\u0628\u062F\u0621 \u0634\u0627\u0634\u0629 \u0627\u0644\u062A\u0648\u0642\u0641 \u0628\u0639\u062F", "Screensaver delay"), [1, 3, 5, 10, 15].map((v) => [v, v + " \u062F\u0642\u0627\u0626\u0642", v + " minutes"]));
      case "decoder":
        return sheet(x("\u0641\u0643 \u062A\u0631\u0645\u064A\u0632 \u0627\u0644\u0641\u064A\u062F\u064A\u0648", "Video decoding"), x("\u064A\u062E\u062A\u0627\u0631 iOS \u0623\u0648 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0641\u0643 \u0627\u0644\u062A\u0631\u0645\u064A\u0632 \u0627\u0644\u0645\u062A\u0627\u062D \u062D\u0633\u0628 \u0627\u0644\u062C\u0647\u0627\u0632 \u0648\u0627\u0644\u0645\u062D\u062A\u0648\u0649. \u0644\u0627 \u062A\u0633\u0645\u062D \u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0647\u0646\u0627 \u0628\u0641\u0631\u0636 \u0641\u0643 \u0628\u0631\u0645\u062C\u064A \u0623\u0648 \u0639\u062A\u0627\u062F\u064A. \u0644\u0644\u0635\u064A\u063A \u063A\u064A\u0631 \u0627\u0644\u0645\u062F\u0639\u0648\u0645\u0629 \u0627\u062E\u062A\u0631 \u0646\u0633\u062E\u0629 \u0645\u062A\u0648\u0627\u0641\u0642\u0629 \u0645\u0646 \u0627\u0644\u0645\u0632\u0648\u062F.", "iOS or the browser selects an available decoder for the device and media. This playback API cannot force software or hardware decoding. Choose a compatible provider version for unsupported formats."));
      case "aspect":
        return chooseSetting("aspect_mode", x("\u0623\u0628\u0639\u0627\u062F \u0627\u0644\u0635\u0648\u0631\u0629", "Picture size"), [["fit", "\u0627\u062D\u062A\u0648\u0627\u0621", "Fit"], ["fill", "\u062A\u0645\u062F\u064A\u062F", "Fill"], ["zoom", "\u062A\u0643\u0628\u064A\u0631", "Zoom"], ["original", "\u0627\u0644\u0623\u0635\u0644\u064A\u0629", "Original"]]);
      case "buffer":
        return chooseSetting("buffer_mode", x("\u0627\u0644\u062A\u062E\u0632\u064A\u0646 \u0627\u0644\u0645\u0624\u0642\u062A", "Buffer"), [[0, "\u0645\u062A\u0648\u0627\u0632\u0646", "Balanced"], [1, "\u0632\u0645\u0646 \u0623\u0642\u0644", "Low latency"], [2, "\u062B\u0628\u0627\u062A \u0623\u0639\u0644\u0649", "Stable"]]);
      case "seek":
        return chooseSetting("seek_step_seconds", x("\u0627\u0644\u062A\u0642\u062F\u064A\u0645 \u0648\u0627\u0644\u0625\u0631\u062C\u0627\u0639", "Seek interval"), [5, 10, 15, 30, 60].map((v) => [v, v + " \u062B\u0627\u0646\u064A\u0629", v + " seconds"]));
      case "refresh":
        return chooseSetting("catalog_refresh_hours", x("\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645", "Channel refresh while active"), [[0, "\u064A\u062F\u0648\u064A \u0641\u0642\u0637", "Manual only"], [1, "\u0643\u0644 \u0633\u0627\u0639\u0629", "Every hour"], [6, "\u0643\u0644 6 \u0633\u0627\u0639\u0627\u062A", "Every 6 hours"], [12, "\u0643\u0644 12 \u0633\u0627\u0639\u0629", "Every 12 hours"], [24, "\u064A\u0648\u0645\u064A\u064B\u0627", "Daily"]]);
      case "guide":
        return showGuide();
      case "pin":
        return managePIN();
      case "parental":
        return parentalControls();
      case "hidden":
        return hiddenContent();
      case "history":
        return confirmAction(x("\u0645\u0633\u062D \u0633\u062C\u0644 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629\u061F", "Clear history?"), x("\u0633\u062A\u0628\u0642\u0649 \u0627\u0644\u0645\u0641\u0636\u0644\u0629 \u0648\u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647 \u0645\u062D\u0641\u0648\u0638\u062A\u064A\u0646.", "Favorites and watchlist will be kept."), async () => {
          collection().history = [];
          collection().progress = {};
          await persist();
          toast(x("\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0633\u062C\u0644", "History cleared"));
        });
      case "backup":
        return exportBackup();
      case "restore":
        $("backup-file").click();
        return;
      case "delete":
        return confirmAction(x("\u062D\u0630\u0641 \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A\u061F", "Delete all local data?"), x("\u0633\u064A\u064F\u062D\u0630\u0641 \u062D\u0641\u0638 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0648\u0627\u0644\u062A\u0641\u0636\u064A\u0644\u0627\u062A \u0648\u0627\u0644\u0633\u062C\u0644 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639.", "This removes saved subscriptions, preferences and history from this device. This cannot be undone."), async () => {
          await logout();
          await vault.clear({ allNamespaces: true });
          clearPreferences();
          if (isNative2()) {
            const rows = await nativeRequest2("downloads");
            for (const row of Array.isArray(rows) ? rows : rows?.items || []) await nativeRequest2("removeDownload", { id: row.id }).catch(() => {
            });
          }
          if (globalThis.caches) await caches.delete("abunasser-offline-v1");
          if (globalThis.indexedDB) await new Promise((resolve) => {
            const request2 = indexedDB.open("abunasser-downloads-v1");
            request2.onsuccess = () => {
              const db = request2.result;
              if (!db.objectStoreNames.contains("items")) {
                db.close();
                resolve();
                return;
              }
              const tx = db.transaction("items", "readwrite");
              tx.objectStore("items").clear();
              tx.oncomplete = tx.onerror = () => {
                db.close();
                resolve();
              };
            };
            request2.onerror = () => resolve();
          });
          location.reload();
        });
      case "support":
        return contact(x("\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", "Technical support"), true);
      case "network":
        return networkDiagnostics();
      case "tools":
        return troubleshoot();
      case "setup":
        return setupGuide();
      case "demo":
        return demo();
      case "update":
        return checkUpdates();
      case "notifications":
        return requestNotifications();
      case "help":
        return help();
      case "logout":
        return confirmAction(x("\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062E\u0631\u0648\u062C\u061F", "Sign out?"), x("\u062A\u0628\u0642\u0649 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0625\u0644\u0649 \u0623\u0646 \u062A\u062D\u0630\u0641\u0647\u0627 \u0628\u0646\u0641\u0633\u0643.", "Saved subscriptions remain until you delete them."), logout);
    }
  }
  async function managePIN() {
    if (state.pin) {
      const check = await fieldsForm(x("\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0631\u0645\u0632 \u0627\u0644\u062D\u0627\u0644\u064A", "Verify current PIN"), [{ name: "pin", label: x("\u0631\u0645\u0632 PIN \u0627\u0644\u062D\u0627\u0644\u064A", "Current PIN"), type: "password", inputmode: "numeric" }]);
      if (!check) return;
      if (!await verifyPIN2(check.pin, state.pin)) throw Error(x("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.", "Incorrect PIN."));
      choices(x("\u0642\u0641\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "App lock"), [{ value: "change", label: x("\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0631\u0645\u0632", "Change PIN") }, { value: "remove", label: x("\u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0642\u0641\u0644", "Remove lock") }], async (value) => {
        if (value === "remove") {
          state.pin = null;
          await persist();
          renderSettings();
        } else await setPIN();
      });
    } else await setPIN();
  }
  async function setPIN() {
    const values = await fieldsForm(x("\u0631\u0645\u0632 PIN \u062C\u062F\u064A\u062F", "New PIN"), [{ name: "pin", label: x("\u0645\u0646 4 \u0625\u0644\u0649 8 \u0623\u0631\u0642\u0627\u0645", "4 to 8 digits"), type: "password", inputmode: "numeric" }, { name: "confirm", label: x("\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0631\u0645\u0632", "Confirm PIN"), type: "password", inputmode: "numeric" }]);
    if (!values) return;
    if (!/^\d{4,8}$/.test(values.pin) || values.pin !== values.confirm) throw Error(x("\u0623\u062F\u062E\u0644 \u0631\u0645\u0632\u064B\u0627 \u0645\u0646 4 \u0625\u0644\u0649 8 \u0623\u0631\u0642\u0627\u0645 \u0648\u0637\u0627\u0628\u0642 \u0627\u0644\u062A\u0623\u0643\u064A\u062F.", "Use matching 4 to 8 digit PINs."));
    state.pin = await derivePIN2(values.pin);
    await persist();
    renderSettings();
    toast(x("\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u0642\u0641\u0644", "App lock saved"));
  }
  async function parentalControls() {
    if (state.pin) {
      const values = await fieldsForm(x("\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629", "Parental controls"), [{ name: "pin", label: x("\u0631\u0645\u0632 PIN", "PIN"), type: "password", inputmode: "numeric" }]);
      if (!values) return;
      if (!await verifyPIN2(values.pin, state.pin)) throw Error(x("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.", "Incorrect PIN."));
    } else {
      const box2 = node("div");
      box2.append(node("p", "", x("\u0646\u0646\u0635\u062D \u0628\u062A\u0639\u064A\u064A\u0646 \u0631\u0645\u0632 PIN \u0644\u062D\u0645\u0627\u064A\u0629 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629.", "Set a PIN to protect parental control changes.")), actions(btn(x("\u062A\u0639\u064A\u064A\u0646 \u0631\u0645\u0632", "Set PIN"), () => setPIN(), "pin"), btn(x("\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u062C\u0628 \u0627\u0644\u0622\u0646", "Enable blocking"), async () => {
        state.settings.parental_enabled = true;
        await persist();
        closeSheet();
        renderSettings();
      }, "parental")));
      return sheet(x("\u0627\u0644\u0631\u0642\u0627\u0628\u0629 \u0627\u0644\u0623\u0628\u0648\u064A\u0629", "Parental controls"), box2);
    }
    state.settings.parental_enabled = !state.settings.parental_enabled;
    await persist();
    renderSettings();
    toast(state.settings.parental_enabled ? x("\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u062D\u062C\u0628 \u062A\u0635\u0646\u064A\u0641\u0627\u062A \u0627\u0644\u0643\u0628\u0627\u0631", "Adult category blocking enabled") : x("\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u062D\u062C\u0628", "Blocking disabled"));
  }
  function hiddenContent() {
    const c = collection(), known = allKnown(), box2 = node("div");
    if (!c.hidden.length) box2.append(node("p", "", x("\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062D\u062A\u0648\u0649 \u0645\u062E\u0641\u064A.", "No content is hidden.")));
    for (const id of c.hidden) {
      const row = node("div", "list-row");
      row.append(node("div", "", known.get(id)?.name || x("\u0639\u0646\u0635\u0631 \u0645\u062D\u0641\u0648\u0638", "Saved item")), btn(x("\u0625\u0638\u0647\u0627\u0631", "Unhide"), async () => {
        c.hidden = c.hidden.filter((v) => v !== id);
        await persist();
        hiddenContent();
      }, "eye"));
      box2.append(row);
    }
    sheet(x("\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u0645\u062E\u0641\u064A", "Hidden content"), box2);
  }
  async function exportBackup() {
    const values = await fieldsForm(x("\u0646\u0633\u062E\u0629 \u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629 \u0645\u0634\u0641\u0631\u0629", "Encrypted backup"), [{ name: "password", label: x("\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0642\u0648\u064A\u0629 \u0644\u0644\u0646\u0633\u062E\u0629", "Strong backup password"), type: "password" }, { name: "confirm", label: x("\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Confirm password"), type: "password" }], { description: x("\u062A\u062A\u0636\u0645\u0646 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0648\u0627\u0644\u062A\u0641\u0636\u064A\u0644\u0627\u062A. \u0627\u062D\u062A\u0641\u0638 \u0628\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631\u061B \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u062F\u0648\u0646\u0647\u0627.", "The backup contains saved subscriptions and preferences. Keep its password; it cannot be recovered without it.") });
    if (!values) return;
    if (values.password.length < 8 || values.password !== values.confirm) throw Error(x("\u0627\u0633\u062A\u062E\u062F\u0645 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u0629 \u0645\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.", "Use matching passwords of at least 8 characters."));
    await persist();
    const text2 = await vault.exportBackup(values.password);
    saveBlob(new Blob([text2], { type: "application/json" }), "Abunasser-TV-encrypted-backup.json");
  }
  async function importBackupFile(file) {
    if (!file) return;
    const values = await fieldsForm(x("\u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u0634\u0641\u0631\u0629", "Import encrypted backup"), [{ name: "password", label: x("\u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0646\u0633\u062E\u0629", "Backup password"), type: "password" }]);
    if (!values) return;
    await vault.importBackup(await file.text(), values.password, { replace: false });
    toast(x("\u062A\u0645 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u0633\u064A\u0639\u0627\u062F \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642.", "Data imported. The app will reopen."));
    setTimeout(() => location.reload(), 800);
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = node("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  async function networkDiagnostics() {
    const box2 = node("div");
    box2.append(node("p", "", x("\u062C\u0627\u0631\u064D \u0641\u062D\u0635 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0648\u0642\u0639\u2026", "Checking site connection\u2026")));
    sheet(x("\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u0627\u0644\u0623\u062E\u0637\u0627\u0621", "Connection and errors"), box2);
    const start = performance.now();
    let status = 0;
    try {
      const response = await appFetch(new URL("/version.json", globalThis.ABUNASSER_CONFIG?.apiOrigin || location.origin), { cache: "no-store", signal: AbortSignal.timeout(7e3) });
      status = response.status;
    } catch {
    }
    box2.replaceChildren(node("p", "", x(`\u062D\u0627\u0644\u0629 \u0627\u0644\u0634\u0628\u0643\u0629: ${navigator.onLine ? "\u0645\u062A\u0635\u0644" : "\u063A\u064A\u0631 \u0645\u062A\u0635\u0644"}`, `Network: ${navigator.onLine ? "online" : "offline"}`)), node("p", "", `HTTP ${status || "\u2014"} \xB7 ${Math.round(performance.now() - start)} ms`), node("p", "", x("\u0647\u0630\u0647 \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0645\u0648\u0642\u0639\u060C \u0648\u0644\u064A\u0633\u062A \u062F\u0644\u064A\u0644\u064B\u0627 \u0639\u0644\u0649 \u0642\u0628\u0648\u0644 \u0645\u0632\u0648\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0644\u0644\u0628\u062B.", "These numbers describe site connectivity, not provider playback authorization.")));
    for (const [kind, timing] of Object.entries(state.timings)) box2.append(node("p", "", `${label(kind)} \xB7 ${JSON.stringify(timing)}`));
    for (const error of state.errorLog.slice(0, 8)) box2.append(node("p", "", `${new Date(error.at).toLocaleTimeString()} \xB7 ${error.code} \xB7 HTTP ${error.http || "\u2014"}`));
    box2.append(btn(x("\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", "Technical support"), () => contact(x("\u0627\u0644\u062F\u0639\u0645 \u0627\u0644\u0641\u0646\u064A", "Technical support"), true), "support"));
  }
  function troubleshoot() {
    choices(x("\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u0639\u0637\u0627\u0644 \u0627\u0644\u0645\u062D\u0644\u064A", "Local troubleshooting"), [{ label: x("\u0627\u0644\u0628\u062B \u0644\u0627 \u064A\u0639\u0645\u0644 \u0623\u0648 \u064A\u0638\u0647\u0631 401", "Playback fails or shows 401"), value: "401" }, { label: x("\u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0628\u0637\u064A\u0626\u0629", "Catalog is slow"), value: "catalog" }, { label: x("\u0627\u0644\u0641\u064A\u062F\u064A\u0648 \u064A\u0639\u0645\u0644 \u062F\u0648\u0646 \u0635\u0648\u062A", "Video plays without sound"), value: "audio" }, { label: x("\u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0645\u0639 \u0627\u0644\u0635\u062F\u064A\u0642 \u0644\u0627 \u062A\u0639\u0645\u0644", "Watch together fails"), value: "watch" }], (value) => {
      const messages2 = { 401: x("401 \u064A\u0639\u0646\u064A \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631. \u062C\u0631\u0651\u0628 \u062A\u062D\u062F\u064A\u062B \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0648\u062A\u0623\u0643\u062F \u0645\u0646 \u0639\u062F\u062F \u0627\u0644\u0627\u062A\u0635\u0627\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D\u0629. \u064A\u0639\u0627\u0644\u062C \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0635\u064A\u063A \u0627\u0644\u0631\u0648\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0644\u062F\u0629\u060C \u0644\u0643\u0646 \u0644\u0627 \u064A\u0645\u0643\u0646\u0647 \u062A\u062C\u0627\u0648\u0632 \u0631\u0641\u0636 \u0627\u0644\u0645\u0632\u0648\u062F. \u0644\u0627 \u062A\u0631\u0633\u0644 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631\u0643 \u0641\u064A \u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062A\u0634\u062E\u064A\u0635.", "401 means the source rejected playback. Refresh your subscription and check its connection limit. Generated format fallback cannot bypass provider rejection. Do not include passwords in diagnostics."), catalog: x("\u0639\u0646\u062F \u0641\u062A\u062D \u0642\u0633\u0645 \u0645\u062D\u0641\u0648\u0638 \u062A\u0638\u0647\u0631 \u0623\u0648\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646. \u064A\u0639\u062A\u0645\u062F \u0623\u0648\u0644 \u0627\u062A\u0635\u0627\u0644 \u0639\u0644\u0649 \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0645\u0632\u0648\u062F. \u062C\u0631\u0651\u0628 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0642\u0633\u0645\u060C \u062B\u0645 \u0641\u062D\u0635 \u0627\u0644\u0627\u062A\u0635\u0627\u0644. \u0644\u0627 \u062A\u0645\u0633\u062D \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0644\u0645\u062C\u0631\u062F \u0628\u0637\u0621 \u0645\u0624\u0642\u062A.", "Cached sections show their first data from storage. The first network load depends on the provider. Refresh the section and check connectivity; do not delete subscriptions for temporary slowness."), audio: x("\u0642\u062F \u064A\u0643\u0648\u0646 \u0627\u0644\u0635\u0648\u062A AC3 \u0623\u0648 \u062A\u0631\u0645\u064A\u0632\u064B\u0627 \u0644\u0627 \u064A\u062F\u0639\u0645\u0647 \u0627\u0644\u0645\u062A\u0635\u0641\u062D. \u0627\u0641\u062D\u0635 \u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u0635\u0648\u062A \u0623\u0648 \u0627\u062E\u062A\u0631 \u0646\u0633\u062E\u0629 AAC/H.264 \u0645\u0646 \u0627\u0644\u0645\u0635\u062F\u0631. \u0639\u0644\u0649 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u062C\u0631\u0651\u0628 \u0627\u0644\u0645\u0634\u063A\u0644 \u0627\u0644\u0623\u0635\u0644\u064A.", "Audio may use AC3 or another unsupported codec. Check audio tracks or choose an AAC/H.264 version. On iPhone try the native player."), watch: x("\u0623\u0628\u0642\u0650 \u0645\u0634\u063A\u0644 \u0635\u0627\u062D\u0628 \u0627\u0644\u062F\u0639\u0648\u0629 \u0645\u0641\u062A\u0648\u062D\u064B\u0627\u060C \u0648\u0623\u0646\u0634\u0626 \u0631\u0627\u0628\u0637\u064B\u0627 \u062C\u062F\u064A\u062F\u064B\u0627 \u0625\u0646 \u0627\u0646\u062A\u0647\u062A \u0627\u0644\u062C\u0644\u0633\u0629. \u064A\u062D\u062A\u0627\u062C \u0627\u0644\u0645\u0635\u062F\u0631 \u0627\u062A\u0635\u0627\u0644\u064B\u0627 \u0625\u0636\u0627\u0641\u064A\u064B\u0627 \u0648\u062A\u0631\u0645\u064A\u0632\u064B\u0627 \u064A\u062F\u0639\u0645\u0647 \u0645\u062A\u0635\u0641\u062D \u0627\u0644\u0636\u064A\u0641. \u0644\u0627 \u064A\u0645\u0643\u0646 \u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062C\u0644\u0633\u0629 \u0648\u062D\u062F\u0647\u0627 \u062A\u062D\u0648\u064A\u0644 \u062A\u0631\u0645\u064A\u0632 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645.", "Keep the host player open and create a fresh invitation if the session expired. The source needs an extra connection and a guest-compatible codec. Session synchronization does not transcode unsupported formats.") };
      sheet(x("\u0625\u0631\u0634\u0627\u062F\u0627\u062A \u0645\u062D\u0644\u064A\u0629", "Local guidance"), messages2[value]);
    });
  }
  function setupGuide() {
    sheet(x("\u0625\u0636\u0627\u0641\u0629 \u0627\u0634\u062A\u0631\u0627\u0643\u0643", "Add your subscription"), x("\u0627\u0634\u062A\u0631\u0627\u0643 \u0627\u0628\u0648\u0646\u0627\u0635\u0631: \u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631. Xtream: \u0623\u0636\u0641 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0648\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644. M3U: \u0623\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0648 \u0627\u062E\u062A\u0631 \u0645\u0644\u0641\u064B\u0627 \u0645\u0646 \u062C\u0647\u0627\u0632\u0643. \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u064A\u0634\u063A\u0644 \u0642\u0646\u0627\u0629 \u0648\u0627\u062D\u062F\u0629. Stalker \u064A\u062D\u062A\u0627\u062C \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0648MAC \u0645\u0633\u062C\u0644\u064B\u0627 \u0644\u062F\u0649 \u0627\u0644\u0645\u0632\u0648\u062F. \u0632\u0631 QR \u064A\u0631\u0628\u0637 \u062C\u0647\u0627\u0632\u064B\u0627 \u0622\u062E\u0631 \u0644\u0646\u0642\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0645\u0624\u0642\u062A\u064B\u0627.", "Abunasser subscription: enter your username and password. Xtream: add the server address and credentials. M3U: paste a playlist URL or choose a file. Direct URL plays one stream. Stalker needs a portal URL and provider-registered MAC. QR temporarily pairs another device to transfer a subscription."));
  }
  function help() {
    sheet(x("\u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629", "Help"), x("\u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0648\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062A \u062A\u0641\u062A\u062D \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0642\u0628\u0644 \u0627\u0644\u062A\u0634\u063A\u064A\u0644. \u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0644\u064B\u0627 \u0639\u0644\u0649 \u0628\u0637\u0627\u0642\u0629 \u0644\u0644\u0645\u0641\u0636\u0644\u0629 \u0648\u0627\u0644\u0625\u062E\u0641\u0627\u0621 \u0648\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A. \u0641\u064A \u0627\u0644\u0642\u0646\u0648\u0627\u062A \u0627\u0636\u063A\u0637 OK \u0644\u0641\u062A\u062D \u0627\u0644\u0642\u0627\u0626\u0645\u0629\u061B \u0627\u062E\u062A\u0631 \u0642\u0646\u0627\u0629 \u062B\u0645 \u0627\u0636\u063A\u0637 OK \u0639\u0644\u0649 \u0627\u0644\u0642\u0646\u0627\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0644\u0625\u063A\u0644\u0627\u0642 \u0627\u0644\u0642\u0627\u0626\u0645\u0629. \u062A\u0638\u0644 \u0627\u0644\u0645\u064A\u0632\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0639\u0644\u0649 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0635\u062F\u0631 \u0645\u062B\u0644 \u0627\u0644\u062A\u0631\u064A\u0644\u0631 \u0648\u0627\u0644\u062F\u0644\u064A\u0644 \u0648\u0627\u0644\u062A\u0631\u062C\u0645\u0629 \u0645\u062A\u0627\u062D\u0629 \u0641\u0642\u0637 \u0639\u0646\u062F\u0645\u0627 \u064A\u0648\u0641\u0631\u0647\u0627. HLS \u0648MP4 \u0627\u0644\u0645\u062A\u0648\u0627\u0641\u0642\u0629 \u0647\u064A \u0627\u0644\u0623\u0646\u0633\u0628 \u0644\u0644\u0622\u064A\u0641\u0648\u0646\u061B \u0644\u0627 \u064A\u0642\u0648\u0645 \u0627\u0644\u0645\u0648\u0642\u0639 \u0628\u062A\u062D\u0648\u064A\u0644 HEVC \u0623\u0648 AC3. \u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A \u0648\u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0648\u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u062A\u062A\u0628\u0639 \u0642\u062F\u0631\u0627\u062A \u0627\u0644\u062C\u0647\u0627\u0632 \u0648\u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u0645\u0635\u062F\u0631.", "Movies and series open title details before playback. Hold a card for favorites, hiding and more. During live TV, OK opens the channel list; select a channel and press OK on the current channel to close it. Source-dependent trailers, guides and subtitles appear when supplied. Compatible HLS and MP4 work best on iPhone; this site does not transcode HEVC or AC3. Downloads, recording and shared viewing depend on device and source capabilities."));
  }
  async function checkUpdates() {
    if (globalThis.abunasserDesktop?.nativeUpdater) return desktopUpdatePanel();
    const box2 = node("div");
    box2.append(node("p", "", x("\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A\u2026", "Checking for updates\u2026")));
    sheet(x("\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "App update"), box2);
    try {
      const update = await checkForUpdates({ fetcher: appFetch });
      box2.replaceChildren(node("p", "", x(`\u0627\u0644\u0625\u0635\u062F\u0627\u0631 \u0627\u0644\u0645\u062B\u0628\u062A: ${update.installedVersion} \xB7 \u0623\u062D\u062F\u062B \u0625\u0635\u062F\u0627\u0631: ${update.latestVersion || "\u2014"}`, `Installed: ${update.installedVersion} \xB7 Latest: ${update.latestVersion || "\u2014"}`)));
      if (update.releaseUnavailable) box2.append(node("p", "", x("\u0644\u0627 \u064A\u0648\u062C\u062F \u0625\u0635\u062F\u0627\u0631 \u0645\u0646\u0634\u0648\u0631 \u0645\u062A\u0627\u062D \u0644\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u0622\u0646. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u0646\u0634\u0631 \u0627\u0644\u0625\u0635\u062F\u0627\u0631.", "No published release can be checked right now. Try again after it is published.")));
      if (update.tvPackaged) box2.append(node("p", "", x("\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062B\u0628\u062A\u0629 \u0639\u0644\u0649 \u0627\u0644\u062A\u0644\u0641\u0632\u064A\u0648\u0646 \u064A\u062A\u0645 \u0645\u0646 \u0645\u062A\u062C\u0631 Samsung \u0628\u0639\u062F \u0646\u0634\u0631\u0647\u0627.", "Installed TV package updates are delivered through the Samsung TV store.")));
      if (update.platform === "windows" && update.available) {
        box2.append(node("p", "", x("\u064A\u062A\u0648\u0641\u0631 \u062A\u062D\u062F\u064A\u062B \u0644\u0648\u064A\u0646\u062F\u0648\u0632. \u0627\u062E\u062A\u0631 \u0646\u0633\u062E\u0629 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0623\u0648 \u0645\u0644\u0641 EXE \u0627\u0644\u0645\u062D\u0645\u0648\u0644.", "A Windows update is available. Choose the installer or the single portable EXE.")), actions(btn(x("\u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062A\u062D\u062F\u064A\u062B", "Download update"), () => openExternal(update.downloadURL), "download", "primary"), btn(x("\u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 EXE", "Download portable EXE"), () => openExternal(update.portableURL), "download")));
      }
      if (update.webAvailable || update.available && update.platform === "web") box2.append(node("p", "", x("\u064A\u062A\u0648\u0641\u0631 \u062A\u062D\u062F\u064A\u062B \u0644\u0644\u0648\u0627\u062C\u0647\u0629. \u0627\u062D\u0641\u0638 \u062A\u0642\u062F\u0645\u0643 \u062B\u0645 \u0627\u0636\u063A\u0637 \u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062A\u062D\u062F\u064A\u062B.", "An interface update is available. Save your progress, then apply it.")), btn(x("\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u062A\u062D\u062F\u064A\u062B \u0648\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0641\u062A\u062D", "Apply update and reopen"), () => applyWebUpdate(update.registration), "refresh", "primary"));
      if (!update.releaseUnavailable && !update.available && !update.webAvailable) box2.append(node("p", "", x("\u062A\u0633\u062A\u062E\u062F\u0645 \u0623\u062D\u062F\u062B \u0625\u0635\u062F\u0627\u0631 \u0645\u062A\u0627\u062D.", "You are using the latest available version.")));
      if (isNative2()) box2.append(node("p", "muted", x("\u062A\u062D\u062F\u064A\u062B \u063A\u0644\u0627\u0641 \u0627\u0644\u0622\u064A\u0641\u0648\u0646 \u0627\u0644\u0623\u0635\u0644\u064A \u064A\u062A\u0645 \u0645\u0646 App Store \u0623\u0648 TestFlight \u062D\u0633\u0628 \u0637\u0631\u064A\u0642\u0629 \u062A\u062B\u0628\u064A\u062A\u0647.", "Updates to the native iPhone shell are delivered through App Store or TestFlight.")));
    } catch (error) {
      box2.replaceChildren(node("p", "inline-error", errorText(error, state.settings.language)), btn(x("\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629", "Retry"), checkUpdates, "refresh"));
    }
  }
  function appFetch(url, options = {}) {
    return isNative2() && nativeFetch ? nativeFetch(String(url), options) : fetch(url, options);
  }
  function detectAccountURL(value) {
    const url = safeURL2(value);
    if (!url) throw Error(x("\u0623\u062F\u062E\u0644 \u0631\u0627\u0628\u0637 \u0627\u0634\u062A\u0631\u0627\u0643 \u0635\u0627\u0644\u062D\u064B\u0627.", "Enter a valid subscription link."));
    const username = url.searchParams.get("username"), password = url.searchParams.get("password");
    if (username && password) {
      const server = new URL(url);
      server.pathname = server.pathname.replace(/\/(?:get|player_api)\.php\/?$/i, "");
      server.search = "";
      server.hash = "";
      return { mode: "xtream", server: server.href.replace(/\/$/, ""), username, password };
    }
    return { mode: /\.m3u(?:$|\?)/i.test(url.pathname + url.search) || /\/(?:get|playlist)\.php$/i.test(url.pathname) ? "m3u" : "direct", url: url.href, server: "", username: "", password: "" };
  }
  function loadLocalScript(path2, globalName) {
    if (globalThis[globalName]) return Promise.resolve(globalThis[globalName]);
    return new Promise((resolve, reject) => {
      const script = node("script");
      script.src = path2;
      script.onload = () => globalThis[globalName] ? resolve(globalThis[globalName]) : reject(Error(x("\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0623\u062F\u0627\u0629 QR.", "Could not load QR tools.")));
      script.onerror = () => reject(Error(x("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u062F\u0627\u0629 QR.", "Could not load QR tools.")));
      document.head.append(script);
    });
  }
  async function qrPicture(url) {
    qrScript ??= loadLocalScript("/qrcode.js", "qrcode").catch((error) => {
      qrScript = null;
      throw error;
    });
    const generate = await qrScript;
    const qr = generate(0, "M");
    qr.addData(url);
    qr.make();
    const wrapper = node("div", "qr-picture");
    wrapper.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    wrapper.setAttribute("aria-label", x("\u0631\u0645\u0632 \u0627\u0644\u0631\u0628\u0637 \u0627\u0644\u0645\u0634\u0641\u0631", "Encrypted pairing code"));
    return wrapper;
  }
  async function addWithQR() {
    const box2 = node("div");
    box2.append(node("p", "", x("\u0627\u0639\u0631\u0636 \u0631\u0645\u0632\u064B\u0627 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632\u060C \u062B\u0645 \u0627\u0645\u0633\u062D\u0647 \u0645\u0646 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0630\u064A \u0633\u062A\u062F\u062E\u0644 \u0645\u0646\u0647 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643. \u064A\u062A\u0645 \u0627\u0644\u0646\u0642\u0644 \u0645\u0634\u0641\u0631\u064B\u0627 \u0648\u0644\u062C\u0644\u0633\u0629 \u0645\u0624\u0642\u062A\u0629.", "Show a code on this device and scan it from the device where you will enter your subscription. The temporary transfer is encrypted.")));
    box2.append(actions(btn(x("\u0625\u0646\u0634\u0627\u0621 \u0631\u0645\u0632 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632", "Create code on this device"), createPairing, "qr", "primary"), btn(x("\u0645\u0633\u062D \u0631\u0645\u0632 \u0628\u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627", "Scan with camera"), scanQR, "camera"), btn(x("\u0635\u0648\u0631\u0629 \u0631\u0645\u0632 QR", "Choose QR image"), () => $("qr-image").click(), "upload"), btn(x("\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637", "Paste pairing link"), async () => {
      const values = await fieldsForm(x("\u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637", "Pairing link"), [{ name: "url", label: x("\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0630\u064A \u0638\u0647\u0631 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0622\u062E\u0631", "Link from the other device"), type: "url" }]);
      if (values) await handleScannedQR(values.url);
    }, "copy")));
    sheet(x("\u0625\u0636\u0627\u0641\u0629 \u0639\u0628\u0631 QR", "Add with QR"), box2);
  }
  async function createPairing() {
    if (pairSession?.active) return showPairing();
    await pairSession?.destroy?.().catch(() => {
    });
    pairSession = new PairingClient();
    const status = node("p", "muted", x("\u062C\u0627\u0631\u064D \u0625\u0646\u0634\u0627\u0621 \u062C\u0644\u0633\u0629 \u0627\u0644\u0631\u0628\u0637\u2026", "Creating a pairing session\u2026"));
    sheet(x("\u0631\u0628\u0637 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632", "Pair this device"), status);
    try {
      const invitation = await pairSession.create({ deviceName: brandName(state.settings.language) + (isNative2() ? " \xB7 iPhone" : " \xB7 Web") });
      state.pairStatus = "waiting";
      pairSession.startReceiving({ onAccount: async (account) => {
        await doLogin(account, { remember: $("remember-account").checked });
        if (!state.account) throw Error(x("\u0644\u0645 \u064A\u0646\u062C\u062D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643.", "Subscription validation failed."));
        state.pairStatus = "received";
        closeSheet();
        toast(x("\u062A\u0645 \u0627\u0633\u062A\u0642\u0628\u0627\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646\u0647", "Subscription received and validated"));
      }, onStatus: (value) => {
        state.pairStatus = value.status;
        const label2 = $("pair-status");
        if (label2) label2.textContent = value.status === "received" ? x("\u062A\u0645 \u0627\u0644\u0631\u0628\u0637. \u064A\u0645\u0643\u0646\u0643 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0631\u064A\u0645\u0648\u062A \u0645\u0646 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0622\u062E\u0631.", "Connected. The other device can now control playback.") : x("\u0641\u064A \u0627\u0646\u062A\u0638\u0627\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0645\u0646 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0622\u062E\u0631\u2026", "Waiting for subscription details from the other device\u2026");
      }, onError: report, onCommand: applyRemoteCommand, getState: () => ({ currentTitle: state.current?.name || "", ...playerSnapshot(), isPlaying: !!controller?.getState?.().playing, remoteActions: ["up", "down", "left", "right", "ok", "back", "home", "play_pause", "volume_down", "volume_up", "previous_channel", "next_channel", "seek", "search"] }) });
      await showPairing(invitation);
    } catch (error) {
      await pairSession?.close().catch(() => {
      });
      pairSession = null;
      throw error;
    }
  }
  async function showPairing(invitation = { url: pairSession?.url, expiresAt: pairSession?.expiresAt }) {
    if (!pairSession?.active) return createPairing();
    const box2 = node("div");
    box2.append(node("p", "", x("\u0627\u0645\u0633\u062D \u0627\u0644\u0631\u0645\u0632 \u0628\u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0622\u062E\u0631 \u0648\u0623\u062F\u062E\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0647\u0646\u0627\u0643. \u0644\u0627 \u062A\u0634\u0627\u0631\u0643 \u0627\u0644\u0631\u0645\u0632 \u0639\u0644\u0646\u064B\u0627.", "Scan this code with your other device and enter the subscription there. Do not publish this code.")));
    box2.append(await qrPicture(invitation.url));
    const status = node("p", "muted", state.pairStatus === "received" ? x("\u062A\u0645 \u0627\u0644\u0631\u0628\u0637", "Connected") : x("\u0641\u064A \u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u062C\u0647\u0627\u0632 \u0627\u0644\u0622\u062E\u0631\u2026", "Waiting for the other device\u2026"));
    status.id = "pair-status";
    box2.append(status, node("p", "", x("\u062A\u0646\u062A\u0647\u064A \u0627\u0644\u062C\u0644\u0633\u0629 \u062E\u0644\u0627\u0644 20 \u062F\u0642\u064A\u0642\u0629. \u064A\u0645\u0643\u0646\u0643 \u0625\u0646\u0647\u0627\u0624\u0647\u0627 \u0627\u0644\u0622\u0646 \u0645\u0646 \u0627\u0644\u0632\u0631 \u0623\u062F\u0646\u0627\u0647.", "The session expires within 20 minutes. You can end it using the button below.")), actions(btn(x("\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637", "Copy pairing link"), () => copyText(invitation.url), "copy"), btn(x("\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u0631\u0628\u0637", "End pairing"), async () => {
      await pairSession?.close();
      pairSession = null;
      closeSheet();
    }, "close", "danger")));
    sheet(x("\u0631\u0628\u0637 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632", "Pair this device"), box2);
  }
  function remoteDevices() {
    if (pairSession?.active) return showPairing();
    const box2 = node("div");
    box2.append(node("p", "", x("\u0627\u0631\u0628\u0637 \u0645\u062A\u0635\u0641\u062D\u064B\u0627 \u0623\u0648 \u062C\u0648\u0627\u0644\u064B\u0627 \u0622\u062E\u0631 \u0645\u0624\u0642\u062A\u064B\u0627 \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647 \u0631\u064A\u0645\u0648\u062A\u064B\u0627 \u0644\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0644\u0627 \u062A\u064F\u0639\u0631\u0636 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0641\u064A \u062D\u0627\u0644\u0629 \u0627\u0644\u0631\u064A\u0645\u0648\u062A.", "Temporarily pair another browser or phone as a remote for this device. Remote state never displays your subscription credentials.")), btn(x("\u0628\u062F\u0621 \u0627\u0644\u0631\u0628\u0637", "Start pairing"), createPairing, "qr", "primary"));
    sheet(x("\u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0648\u0627\u0644\u0631\u064A\u0645\u0648\u062A", "Devices and remote"), box2);
  }
  async function handleScannedQR(value) {
    const url = safeURL2(String(value || "").trim());
    if (!url) throw Error(x("\u0631\u0645\u0632 QR \u0644\u0627 \u064A\u062D\u062A\u0648\u064A \u0631\u0627\u0628\u0637\u064B\u0627 \u0635\u0627\u0644\u062D\u064B\u0627.", "The QR code does not contain a valid link."));
    const trusted = new URL(globalThis.ABUNASSER_CONFIG?.apiOrigin || (/^https?:/.test(location.protocol) ? location.origin : "https://www.abbeedo.com")).origin;
    if (url.origin !== trusted || url.pathname !== "/pair.html" || !url.hash) throw Error(x("\u0647\u0630\u0627 \u0644\u064A\u0633 \u0631\u0645\u0632 \u0631\u0628\u0637 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0642\u0639.", "This is not an Abunasser pairing code for this site."));
    stopCamera();
    closeSheet();
    openExternal(url.href);
  }
  function stopCamera() {
    cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    for (const track of cameraStream?.getTracks() || []) track.stop();
    cameraStream = null;
  }
  async function decodeQRImage(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) throw Error(x("\u0627\u0644\u0635\u0648\u0631\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 15 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.", "Image exceeds 15 MB."));
    scanScript ??= loadLocalScript("jsqr.js", "jsQR").catch((error) => {
      scanScript = null;
      throw error;
    });
    const decode = await scanScript;
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = node("canvas"), ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), code = decode(pixels.data, pixels.width, pixels.height);
      if (!code) throw Error(x("\u0644\u0645 \u064A\u064F\u0639\u062B\u0631 \u0639\u0644\u0649 \u0631\u0645\u0632 QR \u0648\u0627\u0636\u062D \u0641\u064A \u0627\u0644\u0635\u0648\u0631\u0629.", "No readable QR code was found in the image."));
      await handleScannedQR(code.data);
    } finally {
      bitmap.close();
    }
  }
  async function scanQR() {
    if (isNative2()) {
      const value = await nativeRequest2("scanQR", {});
      return handleScannedQR(value?.value || value?.text || value);
    }
    if (!navigator.mediaDevices?.getUserMedia) return sheet(x("\u0643\u0627\u0645\u064A\u0631\u0627 QR", "QR camera"), x("\u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0647\u0646\u0627. \u0627\u0633\u062A\u062E\u062F\u0645 \u0635\u0648\u0631\u0629 \u0627\u0644\u0631\u0645\u0632 \u0623\u0648 \u0627\u0644\u0635\u0642 \u0631\u0627\u0628\u0637 \u0627\u0644\u0631\u0628\u0637.", "The camera is unavailable here. Choose a QR image or paste the pairing link."));
    stopCamera();
    scanScript ??= loadLocalScript("jsqr.js", "jsQR").catch((error) => {
      scanScript = null;
      throw error;
    });
    const decode = await scanScript;
    const video = node("video", "qr-camera");
    video.playsInline = true;
    video.muted = true;
    const box2 = node("div");
    box2.append(node("p", "", x("\u0648\u062C\u0651\u0647 \u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627 \u0646\u062D\u0648 \u0631\u0645\u0632 \u0627\u0644\u0631\u0628\u0637.", "Point the camera at the pairing code.")), video, btn(x("\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627", "Stop camera"), () => {
      stopCamera();
      closeSheet();
    }, "close"));
    sheet(x("\u0645\u0633\u062D \u0631\u0645\u0632 QR", "Scan QR"), box2);
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = cameraStream;
      await video.play();
      const canvas = node("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
      let last = 0;
      const frame = (now) => {
        if (!cameraStream || !$("sheet").open) return stopCamera();
        if (video.videoWidth && now - last > 300) {
          last = now;
          const ratio = Math.min(1, 800 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * ratio);
          canvas.height = Math.round(video.videoHeight * ratio);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), code = decode(pixels.data, pixels.width, pixels.height);
          if (code) {
            stopCamera();
            handleScannedQR(code.data).catch(report);
            return;
          }
        }
        cameraFrame = requestAnimationFrame(frame);
      };
      cameraFrame = requestAnimationFrame(frame);
    } catch (error) {
      stopCamera();
      throw error;
    }
  }
  async function importPlaylist(file) {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) throw Error(x("\u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 64 \u0645\u064A\u063A\u0627\u0628\u0627\u064A\u062A.", "Playlist exceeds 64 MB."));
    const items = parseM3U2(await file.text(), globalThis.ABUNASSER_CONFIG?.apiOrigin || location.href);
    await doLogin({ mode: "m3u-file", name: file.name, items }, { remember: $("remember-account").checked });
    if (state.account?.mode === "m3u-file") {
      state.catalogs = Object.fromEntries(["live", "movie", "series"].map((kind) => [kind, items.filter((item) => item.kind === kind)]));
      await persist();
      renderHome();
    }
  }
  async function pickPlaylist() {
    if (isNative2()) {
      const value = await nativeRequest2("importFile", { types: ["public.m3u-playlist", "public.text"] });
      const text2 = value?.text ?? value?.contents;
      if (typeof text2 === "string") return importPlaylist(new File([text2], value.name || "playlist.m3u", { type: "text/plain" }));
    } else $("m3u-file").click();
  }
  function goBack() {
    if ($("sheet").open) {
      closeSheet();
      return;
    }
    if (!$("player-page").hidden) {
      if (!$("receiver-panel").hidden) {
        $("receiver-panel").hidden = true;
        return;
      }
      closePlayer().catch(report);
      return;
    }
    if (state.page === "details") {
      showPage("catalog");
      renderCatalog();
      return;
    }
    if (state.page === "settings") {
      showPage(state.account ? "home" : "login");
      return;
    }
    showPage(state.account ? "home" : "login");
  }
  function moveFocus(direction) {
    const active2 = document.activeElement;
    if (/INPUT|TEXTAREA|SELECT/.test(active2?.tagName)) return false;
    const container = document.querySelector("dialog[open]") || ($("sheet").open ? $("sheet") : !$("receiver-panel").hidden ? $("receiver-panel") : !$("player-page").hidden ? $("player-page") : document.querySelector(".page:not([hidden])"));
    const current2 = active2?.getBoundingClientRect();
    let candidates = [...container.querySelectorAll("button,a,input,select,summary")].filter((el) => !el.disabled && el.getClientRects().length && !el.closest("[hidden]"));
    const rowOnly = ["left", "right"].includes(direction) && active2?.classList.contains("home-card");
    if (rowOnly) candidates = candidates.filter((el) => el.classList.contains("home-card"));
    if (!candidates.length) return false;
    if (!current2 || !container.contains(active2)) {
      candidates[0].focus();
      return true;
    }
    const cx = current2.x + current2.width / 2, cy = current2.y + current2.height / 2;
    let best = null, bestScore = Infinity;
    for (const candidate of candidates) {
      if (candidate === active2) continue;
      const r = candidate.getBoundingClientRect(), dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy;
      if (direction === "left" && dx >= -4 || direction === "right" && dx <= 4 || direction === "up" && dy >= -4 || direction === "down" && dy <= 4) continue;
      const primary = ["left", "right"].includes(direction) ? Math.abs(dx) : Math.abs(dy), secondary = ["left", "right"].includes(direction) ? Math.abs(dy) : Math.abs(dx), score = primary + secondary * 2.5;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
    return rowOnly;
  }
  async function applyRemoteCommand(command) {
    if (!$("screen-lock").hidden) return;
    const value = command?.value;
    if (["up", "down", "left", "right"].includes(command.action)) return moveFocus(command.action);
    switch (command.action) {
      case "ok":
        if (!$("player-page").hidden && state.current?.kind === "live" && ($("receiver-panel").hidden || !$("receiver-panel").contains(document.activeElement))) toggleReceiver();
        else document.activeElement?.click?.();
        break;
      case "back":
        goBack();
        break;
      case "home":
        await closePlayer();
        showPage(state.account ? "home" : "login");
        break;
      case "play_pause":
        if (controller?.getState?.().playing) await controller.pause();
        else await controller?.resume?.();
        break;
      case "previous_channel":
        await changeChannel(-1);
        break;
      case "next_channel":
        await changeChannel(1);
        break;
      case "volume_up":
        $("video").volume = Math.min(1, $("video").volume + 0.1);
        break;
      case "volume_down":
        $("video").volume = Math.max(0, $("video").volume - 0.1);
        break;
      case "seek":
        if (state.current?.kind !== "live") await controller?.seek?.(Math.max(0, Number(value?.positionMs ?? value) || 0) / 1e3);
        break;
      case "search":
        if (!$("receiver-panel").hidden) {
          $("receiver-search").value = String(value?.query ?? value ?? "").slice(0, 300);
          renderReceiver();
        } else if (state.page === "catalog") {
          $("catalog-search").value = String(value?.query ?? value ?? "").slice(0, 300);
          state.query = $("catalog-search").value;
          renderCatalog();
        }
        break;
    }
  }
  function runStartScreen() {
    const start = state.settings.start_screen;
    if (start === "last_channel" && state.lastChannel) {
      playItem(state.lastChannel).catch(report);
      return;
    }
    if (start === "last_section" && ["live", "movie", "series"].includes(state.settings.last_section)) {
      state.settings.last_section === "live" ? openLive() : openCatalog(state.settings.last_section);
      return;
    }
    if (["live", "movie", "series"].includes(start)) {
      start === "live" ? openLive() : openCatalog(start);
    }
  }
  function localActivity() {
    lastActive = Date.now();
    $("screensaver").hidden = true;
  }
  function tickIdle() {
    const now = Date.now();
    if (state.settings.screensaver_mode !== "off" && now - lastActive > Number(state.settings.screensaver_minutes || 5) * 6e4 && $("player-page").hidden && !$("sheet").open && $("screen-lock").hidden) {
      $("screensaver").hidden = false;
      $("screensaver").querySelector("time").hidden = state.settings.screensaver_mode === "black";
      $("screensaver").querySelector("time").textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString(state.settings.language === "en" ? "en" : "ar-SA", { hour: "2-digit", minute: "2-digit" });
    }
    const hours = Number(state.settings.catalog_refresh_hours) || 0;
    if (hours > 0 && state.account && !state.demo && document.visibilityState === "visible" && now - (state.lastRefresh || now) > hours * 36e5 && !state.loading) {
      state.lastRefresh = now;
      api.memory?.clear();
      state.catalogs = {};
      if (state.page === "catalog") openCatalog(state.kind, { force: true }).catch(report);
    }
  }
  function bindActions() {
    $("login-form").onsubmit = (event) => {
      event.preventDefault();
      try {
        doLogin(accountFromForm()).catch(report);
      } catch (error) {
        $("login-error").textContent = report(error);
        $("login-error").hidden = false;
      }
    };
    $("source-mode").onchange = sourceMode;
    $("reveal-password").onclick = () => {
      $("password").type = $("password").type === "password" ? "text" : "password";
      $("reveal-password").setAttribute("aria-label", $("password").type === "password" ? x("\u0625\u0638\u0647\u0627\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Show password") : x("\u0625\u062E\u0641\u0627\u0621 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631", "Hide password"));
    };
    $("demo-button").onclick = demo;
    $("subscribe-button").onclick = () => contact(x("\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "Subscribe to the app"));
    $("developer-button").onclick = () => contact();
    $("settings-button").onclick = () => showPage("settings");
    $("back-button").onclick = goBack;
    $("sheet-close").onclick = closeSheet;
    $("sheet").addEventListener("close", stopCamera);
    $("file-button").onclick = () => pickPlaylist().catch(report);
    $("qr-button").onclick = () => addWithQR().catch(report);
    $("m3u-file").onchange = () => importPlaylist($("m3u-file").files[0]).catch(report);
    $("backup-file").onchange = () => importBackupFile($("backup-file").files[0]).catch(report);
    $("qr-image").onchange = () => decodeQRImage($("qr-image").files[0]).catch(report);
    $("catalog-search").oninput = () => {
      state.query = $("catalog-search").value;
      state.limit = 60;
      renderCatalog();
    };
    $("catalog-more").onclick = () => {
      state.limit += 60;
      renderCatalog();
    };
    $("catalog-refresh").onclick = () => openCatalog(state.kind, { force: true }).catch(report);
    $("catalog-favorites").onclick = () => {
      state.view = state.view === "favorites" ? "all" : "favorites";
      renderCatalog();
    };
    $("catalog-sort").onclick = () => choices(x("\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Sort content"), [["source", "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u0635\u062F\u0631", "Source order"], ["name", "\u0623\u0628\u062C\u062F\u064A \u062A\u0635\u0627\u0639\u062F\u064A", "A\u2013Z"], ["za", "\u0623\u0628\u062C\u062F\u064A \u062A\u0646\u0627\u0632\u0644\u064A", "Z\u2013A"], ["recent", "\u0627\u0644\u0623\u062D\u062F\u062B", "Newest"]].map(([value, ar, en]) => ({ value, label: x(ar, en), selected: state.sort === value })), (value) => {
      state.sort = value;
      renderCatalog();
    });
    $("catalog-filters").onclick = () => advancedFilters().catch(report);
    $("close-player").onclick = () => closePlayer().catch(report);
    $("previous-channel").onclick = () => changeChannel(-1).catch(report);
    $("next-channel").onclick = () => changeChannel(1).catch(report);
    $("last-channel").onclick = () => state.lastChannel ? playItem(state.lastChannel).catch(report) : toast(x("\u0644\u0627 \u062A\u0648\u062C\u062F \u0642\u0646\u0627\u0629 \u0633\u0627\u0628\u0642\u0629", "No previous channel"));
    $("channel-number").onclick = async () => {
      const values = await fieldsForm(x("\u0631\u0642\u0645 \u0627\u0644\u0642\u0646\u0627\u0629", "Channel number"), [{ name: "number", label: x("\u0631\u0642\u0645 \u0627\u0644\u0642\u0646\u0627\u0629 \u062D\u0633\u0628 \u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u0635\u062F\u0631", "Channel number in source order"), type: "number", inputmode: "numeric" }]);
      if (values) {
        const item = (state.catalogs.live || [])[Number(values.number) - 1];
        if (item) await playItem(item);
        else toast(x("\u0631\u0642\u0645 \u0627\u0644\u0642\u0646\u0627\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D", "Channel number is unavailable"));
      }
    };
    $("receiver-toggle").onclick = toggleReceiver;
    $("receiver-close").onclick = () => $("receiver-panel").hidden = true;
    $("receiver-search").oninput = renderReceiver;
    $("receiver-guide").onclick = () => showGuide();
    $("player-guide").onclick = () => showGuide();
    $("rate-button").onclick = () => chooseRate().catch(report);
    $("subtitle-button").onclick = () => showTracks().catch(report);
    $("player-options").onclick = playerOptions;
    $("seek-back").onclick = () => controller?.seek?.(Math.max(0, (controller.getState().position || 0) - Number(state.settings.seek_step_seconds || 10)));
    $("seek-forward").onclick = () => controller?.seek?.((controller.getState().position || 0) + Number(state.settings.seek_step_seconds || 10));
    $("pip-button").onclick = () => Promise.resolve(controller?.togglePiP?.()).then((ok) => {
      if (!ok) toast(x("\u0635\u0648\u0631\u0629 \u062F\u0627\u062E\u0644 \u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0648\u0636\u0639.", "Picture in picture is unavailable in this mode."));
    }).catch(report);
    $("fullscreen-button").onclick = () => Promise.resolve(controller?.fullscreen?.()).catch(report);
    $("sleep-button").onclick = sleepTimer;
    $("watch-button").onclick = () => hostWatch().catch(report);
    $("capture-button").onclick = () => captureMenu().catch(report);
    $("unlock-form").onsubmit = async (event) => {
      event.preventDefault();
      try {
        if (await verifyPIN2($("unlock-pin").value, state.pin)) {
          $("screen-lock").hidden = true;
          $("unlock-pin").value = "";
          $("unlock-error").textContent = "";
          localActivity();
          if (state.startAfterUnlock) {
            state.startAfterUnlock = false;
            runStartScreen();
          }
        } else $("unlock-error").textContent = x("\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D", "Incorrect PIN");
      } catch (error) {
        $("unlock-error").textContent = report(error);
      }
    };
    for (const event of ["pointerdown", "touchstart", "keydown"]) document.addEventListener(event, localActivity, { passive: true });
    $("screensaver").onclick = localActivity;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" || event.key === "BrowserBack") {
        event.preventDefault();
        goBack();
        return;
      }
      if (!$("screen-lock").hidden) return;
      const text2 = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
      if (!text2 && event.key === "Enter" && !$("player-page").hidden && state.current?.kind === "live" && ["BODY", "VIDEO"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        toggleReceiver();
        return;
      }
      if (!text2 && event.key.startsWith("Arrow") && moveFocus(event.key.slice(5).toLowerCase())) event.preventDefault();
    });
    globalThis.addEventListener("abunasser:native", (event) => {
      const value = event.detail;
      if (value?.type === "channelRequested") {
        const item = (state.catalogs.live || []).find((row) => row.id === value.id || row.id === value.itemId);
        if (item) playItem(item).catch(report);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (state.pin) {
          $("screen-lock").hidden = false;
          controller?.pause?.();
        }
        void persist().catch(() => {
        });
      } else {
        scheduleReminders();
        localActivity();
      }
    });
    globalThis.addEventListener("pageshow", () => {
      updateMonitor?.start();
      void announcementMonitor?.start();
    });
    globalThis.addEventListener("pagehide", () => {
      updateMonitor?.stop();
      announcementMonitor?.stop();
      loadAbort?.abort();
      pairSession?.pause?.();
      watchSession?.pause?.();
      void persist().catch(() => {
      });
    });
  }
  async function advancedFilters() {
    if (state.kind === "live") return;
    const rows = state.catalogs[state.kind] || [], unique = (field) => [...new Set(rows.map((item) => String(item[field] || "").trim()).filter(Boolean))].sort();
    const options = (items, title) => [{ value: "", label: title }, ...items.slice(0, 150).map((value) => ({ value, label: value }))];
    const values = await fieldsForm(x("\u0641\u0644\u0627\u062A\u0631 \u0627\u0644\u0623\u0641\u0644\u0627\u0645 \u0648\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062A", "Movie and series filters"), [{ name: "year", label: x("\u0633\u0646\u0629 \u0627\u0644\u0625\u0635\u062F\u0627\u0631", "Release year"), value: state.filters.year || "", options: options(unique("year"), x("\u0643\u0644 \u0627\u0644\u0633\u0646\u0648\u0627\u062A", "All years")), required: false }, { name: "genre", label: x("\u0627\u0644\u0646\u0648\u0639", "Genre"), value: state.filters.genre || "", options: options(unique("genre"), x("\u0643\u0644 \u0627\u0644\u0623\u0646\u0648\u0627\u0639", "All genres")), required: false }, { name: "language", label: x("\u0627\u0644\u0644\u063A\u0629", "Language"), value: state.filters.language || "", options: options(unique("language"), x("\u0643\u0644 \u0627\u0644\u0644\u063A\u0627\u062A", "All languages")), required: false }, { name: "ratingFloor", label: x("\u0623\u0642\u0644 \u062A\u0642\u064A\u064A\u0645", "Minimum rating"), value: String(state.filters.ratingFloor || ""), options: [{ value: "", label: x("\u0643\u0644 \u0627\u0644\u062A\u0642\u064A\u064A\u0645\u0627\u062A", "Any rating") }, ...[5, 6, 7, 8, 9].map((value) => ({ value: String(value), label: `${value}+` }))], required: false }], { description: x("\u062A\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u0641\u0644\u0627\u062A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0632\u0648\u062F \u0627\u0644\u0645\u062A\u0627\u062D\u0629 \u0648\u0644\u0627 \u062A\u0641\u062A\u0631\u0636 \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0644\u0645 \u064A\u0648\u0641\u0631\u0647\u0627.", "Filters use available provider metadata and do not invent missing information.") });
    if (values) {
      state.filters = { ...values, ratingFloor: Number(values.ratingFloor) || 0 };
      state.limit = 60;
      renderCatalog();
    }
  }
  async function boot() {
    bindActions();
    sourceMode();
    paintIcons();
    try {
      const data = await vault.get("ui", null);
      if (data && typeof data === "object") {
        state.accounts = Array.isArray(data.accounts) ? data.accounts.filter((a) => a && typeof a === "object").slice(0, 100) : [];
        state.profiles = Array.isArray(data.profiles) && data.profiles.length ? data.profiles.filter((value) => typeof value === "string" && value.length < 100).slice(0, 50) : ["Default"];
        state.profile = state.profiles.includes(data.profile) ? data.profile : state.profiles[0] || "Default";
        state.settings = { ...DEFAULT_SETTINGS2, ...data.settings || {} };
        state.collections = data.collections && typeof data.collections === "object" ? data.collections : {};
        state.pin = data.pin || null;
        state.lastChannel = data.lastChannel || null;
        state.account = data.account && typeof data.account === "object" ? data.account : null;
        state.userInfo = data.userInfo || {};
        if (state.account?.mode === "m3u-file") state.catalogs = Object.fromEntries(["live", "movie", "series"].map((kind) => [kind, (state.account.items || []).filter((item) => item.kind === kind)]));
      }
      state.reminders = await vault.get("reminders", []);
      state.localEpg = await vault.get("epg", []);
    } catch (error) {
      report(error);
    }
    state.settings = mergeVaultPreferences(state.settings, readPreferences());
    await syncDesktopNotifications();
    state.lastRefresh = Date.now();
    applyPreferences();
    showPage(state.account ? "home" : "login", { remember: false });
    if (state.pin) $("screen-lock").hidden = false;
    if (state.account) {
      await setupDownloads();
      if (state.pin) state.startAfterUnlock = true;
      else runStartScreen();
    }
    scheduleReminders();
    idleTick = setInterval(tickIdle, 1e3);
    if (!isNative2() && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {
    });
    bindDesktopUpdates(desktopUpdatePanel);
    updateWebsiteLinks();
    updateMonitor = createUpdateMonitor({ check: () => checkForUpdates({ fetcher: appFetch }), onUpdate: async (update) => {
      const message = x(`\u064A\u062A\u0648\u0641\u0631 \u062A\u062D\u062F\u064A\u062B ${update.latestVersion}. \u0627\u0641\u062A\u062D \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u062B\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u062A\u0637\u0628\u064A\u0642.`, `Update ${update.latestVersion} is available. Open Settings, then App update.`);
      toast(message);
      if (state.settings.notifications && !globalThis.abunasserDesktop?.nativeUpdates) await deliverNotification({ id: "release-" + update.latestVersion, title: brandName(state.settings.language), body: message, url: location.origin + "/app" });
    } });
    updateMonitor.start();
    announcementMonitor = createAnnouncementMonitor({ fetcher: appFetch, endpoint: new URL("/api/announcements", globalThis.ABUNASSER_CONFIG?.apiOrigin || location.origin).href, isEnabled: () => true, shouldDeliver: () => state.settings.notifications === true && !globalThis.abunasserDesktop?.nativeAnnouncements, onMessage: (message) => toast([message.title, message.body].filter(Boolean).join(" \xB7 ")) });
    void announcementMonitor.start();
    document.documentElement.dataset.appReady = "true";
  }
  var isNative2, nativeRequest2, $, x, api, vault, APP_VERSION, state, playbackOwner, updateMonitor, announcementMonitor, controller, downloads, savedTick, toastTick, loadAbort, sleepTick, idleTick, lastActive, watchSession, pairSession, lastPlayerPage, detailGeneration, NAMES, label, node, HOME_TOOLS, qrScript, scanScript, cameraStream, cameraFrame, appReady;
  var init_ui = __esm({
    "tv/samsung/app/ui.js?release=1.2.2"() {
      init_desktop_updates();
      init_tv_network();
      init_glitch();
      init_updates();
      init_notifications();
      init_preferences();
      init_core2();
      init_icons();
      init_player();
      init_native();
      init_connect();
      ({ isNative: isNative2, nativeRequest: nativeRequest2 } = native_exports);
      $ = (id) => document.getElementById(id);
      x = (ar, en) => state.settings.language === "en" ? en : ar;
      api = new ApiClient2();
      vault = new Vault({ namespace: "interface-v1" });
      APP_VERSION = $("app-version")?.textContent || "\u2014";
      state = { page: "login", previous: "home", account: null, userInfo: null, accounts: [], profile: "Default", profiles: ["Default"], settings: { ...DEFAULT_SETTINGS2, ...preferenceValues() }, collections: {}, catalogs: {}, kind: "movie", group: "", family: "all", query: "", view: "all", sort: "source", filters: {}, limit: 60, demo: false, current: null, lastChannel: null, playingSource: null, detail: null, episodes: [], generation: 0, loading: false, errorLog: [], timings: {}, pin: null, pair: null, watch: null };
      playbackOwner = null;
      updateMonitor = null;
      announcementMonitor = null;
      controller = null;
      downloads = null;
      savedTick = 0;
      toastTick = 0;
      loadAbort = null;
      sleepTick = 0;
      idleTick = 0;
      lastActive = Date.now();
      watchSession = null;
      pairSession = null;
      lastPlayerPage = "home";
      detailGeneration = 0;
      NAMES = { live: ["\u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631", "Live TV"], movie: ["\u0627\u0644\u0623\u0641\u0644\u0627\u0645", "Movies"], series: ["\u0627\u0644\u0645\u0633\u0644\u0633\u0644\u0627\u062A", "Series"] };
      label = (kind) => x(...NAMES[kind] || ["\u0627\u0644\u0645\u062D\u062A\u0648\u0649", "Content"]);
      node = (tag, cls, text2) => {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text2 !== void 0) el.textContent = text2;
        return el;
      };
      globalThis.addEventListener("abbeedo:preferences", () => {
        state.settings.accent = preferenceValues().accent;
      });
      HOME_TOOLS = [["refresh", "\u062A\u062D\u062F\u064A\u062B", "Refresh", "refresh"], ["notifications", "\u0627\u0644\u062A\u0646\u0628\u064A\u0647\u0627\u062A", "Notifications", "notifications"], ["account", "\u062D\u0633\u0627\u0628\u064A", "My account", "account"], ["accounts", "\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A", "Accounts", "accounts"], ["downloads", "\u0627\u0644\u062A\u0646\u0632\u064A\u0644\u0627\u062A", "Downloads", "download"], ["favorites", "\u0627\u0644\u0645\u0641\u0636\u0644\u0629", "Favorites", "heart"], ["watchlist", "\u0623\u0631\u064A\u062F \u0645\u0634\u0627\u0647\u062F\u062A\u0647", "Watchlist", "bookmark"], ["continue", "\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Continue watching", "history"], ["last", "\u0622\u062E\u0631 \u0642\u0646\u0627\u0629", "Last channel", "live"], ["recent", "\u0627\u0644\u0645\u0636\u0627\u0641 \u062D\u062F\u064A\u062B\u064B\u0627", "Recently added", "calendar"], ["recommend", "\u0645\u0642\u062A\u0631\u062D\u0627\u062A \u0645\u062D\u0644\u064A\u0629", "Local suggestions", "star"], ["epg", "\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C", "Program guide", "calendar"]];
      qrScript = null;
      scanScript = null;
      cameraStream = null;
      cameraFrame = 0;
      window.addEventListener("abunasser:native", (event) => {
        const data = event.detail || {};
        if (data.type === "stopped" && data.userDismissed && !$("player-page").hidden && (!(data.itemId || data.id) || (data.itemId || data.id) === state.current?.id)) closePlayer().catch(report);
      });
      appReady = boot().catch((error) => {
        report(error);
        document.documentElement.dataset.appReady = "true";
      });
    }
  });

  // tv/samsung/app/tv-presentation.js
  init_tv_network();
  var active = /* @__PURE__ */ new WeakMap();
  function configureTVPresentation(scope2 = globalThis) {
    const info = nativeTVInfo(scope2), doc = scope2.document;
    if (!info || !doc) return null;
    if (active.has(doc)) return active.get(doc);
    doc.documentElement.dataset.tv = info.platform;
    if (!info.packaged && !doc.getElementById("native-tv-styles")) {
      const link = doc.createElement("link");
      link.id = "native-tv-styles";
      link.rel = "stylesheet";
      link.href = "/tv-overrides.css?tv=1.2";
      doc.head.append(link);
    }
    const key2 = (event) => {
      const code = event.keyCode || event.which;
      if ([461, 10009].includes(code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        (doc.activeElement || doc.body).dispatchEvent(new scope2.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return;
      }
      if (doc.documentElement.dataset.appReady === "true" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const dialog = doc.querySelector("dialog[open]");
      if (!dialog) return;
      const buttons = [...dialog.querySelectorAll("button:not([disabled]),select,input,summary")].filter((el) => el.getClientRects().length);
      if (!buttons.length) return;
      const current2 = buttons.indexOf(doc.activeElement), step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      buttons[(Math.max(0, current2) + step + buttons.length) % buttons.length].focus();
      event.preventDefault();
    };
    doc.addEventListener("keydown", key2, true);
    const result = { ...info, destroy() {
      doc.removeEventListener("keydown", key2, true);
      delete doc.documentElement.dataset.tv;
      active.delete(doc);
    } };
    active.set(doc, result);
    return result;
  }

  // tv/samsung/app/tv-entry.mjs
  init_glitch();

  // tv/samsung/app/install-gate.js?site=2.1
  init_tv_network();
  function isAppContext(scope2 = globalThis) {
    try {
      if (nativeTVInfo(scope2)) return true;
      if (scope2.webkit?.messageHandlers?.abunasser) return true;
      if (scope2.abunasserDesktop?.isDesktop === true && scope2.abunasserDesktop.platform === "win32") return true;
      const platform = detectPlatform(scope2);
      if (["android", "android-tv", "windows"].includes(platform)) return false;
      if (scope2.navigator?.standalone === true) return true;
      return scope2.matchMedia?.("(display-mode: standalone)")?.matches === true;
    } catch {
      return false;
    }
  }
  function installationPlatform(scope2 = globalThis) {
    try {
      return detectPlatform(scope2);
    } catch {
      return "other";
    }
  }
  function detectPlatform(scope2) {
    const navigator2 = scope2.navigator || {};
    const userAgent = String(navigator2.userAgent || "");
    const isIPadDesktop = (navigator2.platform === "MacIntel" || /Macintosh/i.test(userAgent)) && Number(navigator2.maxTouchPoints) > 1;
    const isIOS2 = /iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktop;
    if (isIOS2) {
      const anotherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|FBAN|FBAV|Instagram|Snapchat|TikTok|Line\/|NAVER/i.test(userAgent);
      return /Safari\//i.test(userAgent) && !anotherBrowser ? "ios-safari" : "ios-other";
    }
    if (/\b(?:Tizen|webOS|Web0S|NetCast)\b/i.test(userAgent)) return "other";
    if (/\b(?:Android[\s_-]*TV|Google[\s_-]*TV|AFT[A-Z0-9]*|BRAVIA|SHIELD|SMART[\s_-]*TV|Chromecast|Nexus[\s_-]*Player|Mi[\s_-]*TV)\b/i.test(userAgent)) return "android-tv";
    if (/Android/i.test(userAgent)) return "android";
    if (/Windows\s+NT/i.test(userAgent) || /^Win(?:32|64|CE)$/i.test(String(navigator2.platform || "")) || navigator2.userAgentData?.platform === "Windows") return "windows";
    return "other";
  }

  // tv/samsung/app/tv-entry.mjs
  init_shared_accent();

  // tv/samsung/app/distribution.js?site=2.0
  var RELEASE_ORIGIN = globalThis.ABUNASSER_CONFIG?.apiOrigin || globalThis.location?.origin || "https://abbeedo.com";
  var ANDROID_APK = RELEASE_ORIGIN + "/downloads/android.apk";
  var WINDOWS_SETUP = RELEASE_ORIGIN + "/downloads/windows.exe";
  var WINDOWS_PORTABLE = RELEASE_ORIGIN + "/downloads/windows-portable.exe";
  var RELEASE_INDEX = RELEASE_ORIGIN + "/api/releases";

  // tv/samsung/app/tv-entry.mjs
  init_preferences();
  init_tv_network();
  (async function() {
    const tv = installPackagedTVNetwork(globalThis);
    if (!tv.installed) throw Error("Native Samsung TV application context is required.");
    applyClientPreferences();
    configureTVPresentation();
    const visualEffects = startVisualEffects();
    const gate = document.getElementById("install-gate");
    const shell = document.getElementById("app-shell");
    const status = document.getElementById("install-status");
    const installButton = document.getElementById("install-button");
    const platform = installationPlatform();
    const nativeDownload = ["android", "android-tv", "windows"].includes(platform);
    let pendingInstall = null, starting = false, loadFailed = false, statusWords = null, downloadWords = ["\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0648\u0641\u0631 \u0646\u0633\u062E\u0629 \u0648\u064A\u0646\u062F\u0648\u0632\u2026", "Checking Windows download availability\u2026"];
    const setStatus = (ar, en) => {
      statusWords = [ar, en];
      status.hidden = false;
      status.textContent = text(ar, en);
    };
    function renderGate() {
      const set = (id, ar, en) => document.getElementById(id).textContent = text(ar, en);
      set("install-heading", ...loadFailed ? ["\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642", "Could not open the app"] : platform === "windows" ? ["\u062A\u0637\u0628\u064A\u0642 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \u0644\u0648\u064A\u0646\u062F\u0648\u0632", "abbeedo TV for Windows"] : platform === "android-tv" ? ["\u062A\u0637\u0628\u064A\u0642 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \u0644\u0634\u0627\u0634\u062A\u0643", "abbeedo TV for your television"] : platform === "android" ? ["\u062A\u0637\u0628\u064A\u0642 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \u0644\u0623\u0646\u062F\u0631\u0648\u064A\u062F", "abbeedo TV for Android"] : ["\u0623\u0636\u0641 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0644\u0628\u062F\u0621 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629", "Add the app to start watching"]);
      set("install-intro", ...loadFailed ? ["\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A\u060C \u062B\u0645 \u0623\u063A\u0644\u0642 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0648\u0627\u0641\u062A\u062D\u0647 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.", "Check your internet connection, then close and reopen the app."] : platform === "windows" ? ["\u0623\u0641\u0644\u0627\u0645\u0643 \u0648\u0645\u0633\u0644\u0633\u0644\u0627\u062A\u0643 \u0648\u0627\u0644\u0628\u062B \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0645\u0646 \u0627\u0634\u062A\u0631\u0627\u0643\u0643\u060C \u0641\u064A \u062A\u0637\u0628\u064A\u0642 \u0639\u0644\u0649 \u0627\u0644\u0643\u0645\u0628\u064A\u0648\u062A\u0631.", "Your subscription movies, series and live channels in a desktop app."] : nativeDownload ? ["\u062D\u0645\u0651\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0627\u0644\u0645\u062E\u0635\u0635 \u0644\u0623\u062C\u0647\u0632\u0629 \u0623\u0646\u062F\u0631\u0648\u064A\u062F \u0648\u0627\u0633\u062A\u0645\u062A\u0639 \u0628\u0645\u062D\u062A\u0648\u0649 \u0627\u0634\u062A\u0631\u0627\u0643\u0643.", "Download the Android app to enjoy your subscription content."] : ["\u064A\u0639\u0645\u0644 \u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV \u0645\u0646 \u0623\u064A\u0642\u0648\u0646\u062A\u0647 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629. \u0623\u0636\u0641\u0647 \u0623\u0648\u0644\u064B\u0627\u060C \u062B\u0645 \u0627\u0641\u062A\u062D\u0647 \u0645\u0646 \u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629.", "abbeedo TV opens from its Home Screen icon. Add it first, then open the new icon."]);
      set("install-note", ...platform === "windows" ? ["\u0627\u0633\u062A\u062E\u062F\u0645 \u0646\u0633\u062E\u0629 \u0627\u0644\u062A\u062B\u0628\u064A\u062A\u060C \u0623\u0648 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 \u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u062F\u0648\u0646 \u062A\u062B\u0628\u064A\u062A.", "Use the installer, or run the single portable EXE without installation."] : platform === "android-tv" ? ["\u064A\u062F\u0639\u0645 Android TV \u0648Google TV \u0648\u0627\u0644\u062A\u0646\u0642\u0644 \u0628\u0627\u0644\u0631\u064A\u0645\u0648\u062A. \u0627\u0633\u062A\u062E\u062F\u0645 \u0631\u0627\u0628\u0637 \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \u0646\u0641\u0633\u0647 \u0641\u064A \u062A\u0637\u0628\u064A\u0642 Downloader.", "Supports Android TV, Google TV and remote navigation. Use the same link in Downloader."] : platform === "android" ? ["\u0627\u0644\u0645\u0644\u0641 \u0646\u0641\u0633\u0647 \u064A\u062F\u0639\u0645 \u0627\u0644\u062C\u0648\u0627\u0644 \u0648\u0623\u062C\u0647\u0632\u0629 Android TV \u0648Google TV.", "The same APK supports phones, Android TV and Google TV."] : ["\u0628\u0639\u062F \u0627\u0644\u0625\u0636\u0627\u0641\u0629\u060C \u0627\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0646 \u0623\u064A\u0642\u0648\u0646\u062A\u0647 \u0644\u062A\u0638\u0647\u0631 \u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0648\u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.", "After adding it, open its Home Screen icon to sign in and start watching."]);
      const steps = {
        "ios-safari": [["\u0627\u0636\u063A\u0637 \u0632\u0631 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629 \u0641\u064A Safari.", "Tap Share in Safari."], ["\u0627\u062E\u062A\u0631 \xAB\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629\xBB \u062B\u0645 \u0627\u0636\u063A\u0637 \xAB\u0625\u0636\u0627\u0641\u0629\xBB.", "Choose Add to Home Screen, then tap Add."], ["\u0627\u0641\u062A\u062D \xAB\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV\xBB \u0645\u0646 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629.", "Open abbeedo TV from your Home Screen."]],
        "ios-other": [["\u0627\u0646\u0633\u062E \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0627\u0641\u062A\u062D\u0647 \u0641\u064A Safari.", "Copy the website link and open it in Safari."], ["\u0627\u0636\u063A\u0637 \xAB\u0645\u0634\u0627\u0631\u0643\u0629\xBB\u060C \u062B\u0645 \xAB\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629\xBB \u0648\xAB\u0625\u0636\u0627\u0641\u0629\xBB.", "Tap Share, then Add to Home Screen and Add."], ["\u0627\u0641\u062A\u062D \xAB\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV\xBB \u0645\u0646 \u0623\u064A\u0642\u0648\u0646\u062A\u0647 \u0627\u0644\u062C\u062F\u064A\u062F\u0629.", "Open abbeedo TV from its new icon."]],
        other: [["\u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0627\u062E\u062A\u0631 \xAB\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642\xBB \u0623\u0648 \xAB\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629\xBB.", "Choose Install app or Add to Home Screen in the browser menu."], ["\u0623\u0643\u062F \u0627\u0644\u0625\u0636\u0627\u0641\u0629\u060C \u062B\u0645 \u0627\u0641\u062A\u062D \xAB\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV\xBB \u0645\u0646 \u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629.", "Confirm, then open abbeedo TV from the new icon."]],
        "android android-tv": [["\u062D\u0645\u0651\u0644 \u0645\u0644\u0641 \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0628\u0635\u064A\u063A\u0629 APK.", "Download the APK file."], ["\u0627\u0641\u062A\u062D \u0627\u0644\u0645\u0644\u0641 \u0648\u0627\u062A\u0628\u0639 \u062E\u0637\u0648\u0627\u062A \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u062A\u064A \u064A\u0639\u0631\u0636\u0647\u0627 \u062C\u0647\u0627\u0632\u0643.", "Open the file and follow your device installation steps."], ["\u0627\u0641\u062A\u062D \xAB\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV\xBB \u0648\u0623\u062F\u062E\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0634\u062A\u0631\u0627\u0643\u0643.", "Open abbeedo TV and enter your subscription."]],
        windows: [["\u062D\u0645\u0651\u0644 \u0646\u0633\u062E\u0629 Windows 10 \u0623\u0648 Windows 11 \u200F(64 \u0628\u062A).", "Download for Windows 10 or Windows 11 (64-bit)."], ["\u0634\u063A\u0651\u0644 \u0645\u0644\u0641 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0623\u0648 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0645\u062D\u0645\u0648\u0644\u0629 EXE.", "Run the installer or the portable EXE."], ["\u0623\u062F\u062E\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0648\u0627\u0628\u062F\u0623 \u0627\u0644\u0645\u0634\u0627\u0647\u062F\u0629.", "Enter your subscription and start watching."]]
      };
      for (const list of document.querySelectorAll("ol[data-install-platforms]")) list.querySelectorAll("li > span").forEach((span, index) => {
        const words = steps[list.dataset.installPlatforms]?.[index];
        if (words) {
          const svg = span.querySelector("svg");
          span.textContent = text(...words);
          if (svg) span.append(" ", svg);
        }
      });
      for (const [id, ar, en, arDetail, enDetail] of [["android-download", "\u062A\u062D\u0645\u064A\u0644 \u062A\u0637\u0628\u064A\u0642 \u0623\u0646\u062F\u0631\u0648\u064A\u062F", "Download Android app", "\u0644\u0644\u062C\u0648\u0627\u0644 \u0648Android TV \u0648Google TV", "Phone, Android TV and Google TV"], ["windows-download", "\u062A\u062D\u0645\u064A\u0644 \u062A\u0637\u0628\u064A\u0642 \u0648\u064A\u0646\u062F\u0648\u0632", "Download Windows app", "Windows 10 \u064811 \xB7 64 \u0628\u062A", "Windows 10 and 11 \xB7 64-bit"]]) {
        const label2 = document.getElementById(id).lastElementChild, detail = label2.querySelector(".download-detail");
        label2.firstChild.textContent = text(ar, en);
        detail.textContent = text(arDetail, enDetail);
      }
      document.getElementById("download-status").textContent = text(...downloadWords);
      if (statusWords) status.textContent = text(...statusWords);
    }
    gate.dataset.platform = platform;
    for (const element of document.querySelectorAll("[data-install-platforms]")) element.hidden = !element.dataset.installPlatforms.split(" ").includes(platform);
    renderGate();
    document.getElementById("website-settings-button").onclick = () => openPublicPreferences();
    window.addEventListener("abbeedo:preferences", () => {
      const p = applyClientPreferences(), color2 = document.getElementById("preference-accent");
      if (color2) color2.value = p.accent;
      renderGate();
    });
    function refreshSharedAccent() {
      const accent = getSharedAccent();
      if (accent && accent !== document.documentElement.style.getPropertyValue("--accent").trim()) window.dispatchEvent(new CustomEvent("abbeedo:preferences", { detail: readPreferences() }));
    }
    window.addEventListener("storage", (event) => {
      if (event.key === SHARED_ACCENT_KEY || event.key === null) refreshSharedAccent();
    });
    window.addEventListener("pageshow", refreshSharedAccent);
    window.addEventListener("focus", refreshSharedAccent);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshSharedAccent();
    });
    if (!readPreferences().chosenLanguage && isAppContext()) {
      gate.hidden = true;
      try {
        const { Vault: Vault2 } = await Promise.resolve().then(() => (init_core(), core_exports));
        const vault2 = new Vault2({ namespace: "interface-v1" });
        const saved = await vault2.get("ui", null);
        migrateVaultPreferences(saved?.settings);
      } catch {
      }
      applyClientPreferences();
    }
    if (!readPreferences().chosenLanguage) await chooseInitialLanguage();
    renderGate();
    function openIfInstalled() {
      if (!isAppContext()) return false;
      if (starting) return true;
      starting = true;
      gate.hidden = true;
      shell.hidden = false;
      shell.inert = true;
      document.documentElement.dataset.launchContext = "app";
      Promise.resolve().then(() => (init_ui(), ui_exports)).then(async (module) => {
        await module.appReady;
        shell.inert = false;
      }).catch(() => {
        starting = false;
        loadFailed = true;
        gate.hidden = false;
        shell.hidden = true;
        shell.inert = true;
        document.getElementById("install-instructions").hidden = true;
        document.getElementById("install-note").hidden = true;
        renderGate();
      });
      return true;
    }
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      if (nativeDownload) return;
      pendingInstall = event;
      if (!starting) installButton.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      if (nativeDownload) return;
      pendingInstall = null;
      installButton.hidden = true;
      setStatus("\u062A\u0645\u062A \u0627\u0644\u0625\u0636\u0627\u0641\u0629. \u0627\u0641\u062A\u062D \xAB\u0627\u0628\u0648\u0646\u0627\u0635\u0631 TV\xBB \u0645\u0646 \u0623\u064A\u0642\u0648\u0646\u062A\u0647 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629.", "Added. Open abbeedo TV from its Home Screen icon.");
    });
    installButton.addEventListener("click", async () => {
      if (!pendingInstall) return;
      const prompt = pendingInstall;
      pendingInstall = null;
      installButton.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === "accepted") setStatus("\u0628\u0639\u062F \u0627\u0643\u062A\u0645\u0627\u0644 \u0627\u0644\u0625\u0636\u0627\u0641\u0629\u060C \u0627\u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \u0645\u0646 \u0623\u064A\u0642\u0648\u0646\u062A\u0647 \u0639\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629.", "Once added, open the app from its Home Screen icon.");
      } catch {
        setStatus("\u0627\u0641\u062A\u062D \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0648\u0627\u062E\u062A\u0631 \xAB\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629\xBB \u0623\u0648 \xAB\u062A\u062B\u0628\u064A\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642\xBB.", "Open the browser menu and choose Add to Home Screen or Install app.");
      } finally {
        installButton.disabled = false;
        installButton.hidden = !pendingInstall;
      }
    });
    document.getElementById("copy-install-link").addEventListener("click", async () => {
      const address = new URL("/app", location.href).href;
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(address);
          copied = true;
        }
      } catch {
      }
      if (!copied) {
        const input = document.createElement("textarea");
        input.value = address;
        input.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.append(input);
        input.select();
        try {
          copied = document.execCommand("copy");
        } catch {
        }
        input.remove();
      }
      setStatus(...copied ? ["\u062A\u0645 \u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637. \u0627\u0641\u062A\u062D\u0647 \u0641\u064A Safari \u062B\u0645 \u0623\u0636\u0641\u0647 \u0625\u0644\u0649 \u0627\u0644\u0634\u0627\u0634\u0629 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629.", "Link copied. Open it in Safari, then add it to your Home Screen."] : ["\u062A\u0639\u0630\u0631 \u0646\u0633\u062E \u0627\u0644\u0631\u0627\u0628\u0637. \u0627\u0646\u0633\u062E\u0647 \u0645\u0646 \u0634\u0631\u064A\u0637 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0641\u062A\u062D\u0647 \u0641\u064A Safari.", "Could not copy. Copy it from the address bar and open it in Safari."]);
    });
    async function refreshWindowsDownloads() {
      const notice = document.getElementById("download-status"), retry = document.getElementById("retry-download-check");
      retry.hidden = true;
      downloadWords = ["\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062A\u0648\u0641\u0631 \u0646\u0633\u062E\u0629 \u0648\u064A\u0646\u062F\u0648\u0632\u2026", "Checking Windows download availability\u2026"];
      notice.textContent = text(...downloadWords);
      try {
        const response = await fetch(RELEASE_INDEX, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(1e4) });
        if (!response.ok) throw Error("Unavailable");
        const release = await response.json();
        let available = false;
        for (const [key2, id] of [["setup", "windows-download"], ["portable", "windows-portable"]]) {
          const ready = release.windows?.[key2]?.available === true;
          document.getElementById(id).setAttribute("aria-disabled", String(!ready));
          if (key2 === "setup") available = ready;
        }
        downloadWords = available ? ["\u0646\u0633\u062E\u0629 \u0648\u064A\u0646\u062F\u0648\u0632 \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u062A\u062D\u0645\u064A\u0644.", "Windows download is ready."] : ["\u0627\u0644\u062A\u062D\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0645\u0624\u0642\u062A\u064B\u0627. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u0642\u0644\u064A\u0644.", "Downloads are temporarily unavailable. Please try again shortly."];
        retry.hidden = available;
      } catch {
        downloadWords = ["\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0631\u0627\u0628\u0637 \u0627\u0644\u062A\u062D\u0645\u064A\u0644. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.", "Could not check downloads. Check your connection and retry."];
        retry.hidden = false;
      }
      notice.textContent = text(...downloadWords);
    }
    for (const id of ["windows-download", "windows-portable"]) document.getElementById(id).addEventListener("click", (event) => {
      if (event.currentTarget.getAttribute("aria-disabled") === "true") event.preventDefault();
    });
    document.getElementById("retry-download-check").addEventListener("click", refreshWindowsDownloads);
    if (!openIfInstalled()) {
      gate.hidden = false;
      document.documentElement.dataset.launchContext = "browser";
      if (platform === "windows") refreshWindowsDownloads();
      if (platform === "android-tv") requestAnimationFrame(() => document.getElementById("android-download").focus({ preventScroll: true }));
      const media = window.matchMedia?.("(display-mode: standalone)");
      if (media?.addEventListener) media.addEventListener("change", openIfInstalled);
      else media?.addListener?.(openIfInstalled);
      window.addEventListener("pageshow", openIfInstalled);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) openIfInstalled();
      });
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {
      });
    }
    document.documentElement.dataset.installGateReady = "true";
    visualEffects.trigger(gate.hidden ? shell : gate);
  })().catch(function(error) {
    console.error("TV startup failed");
    var e = document.getElementById("install-heading");
    if (e) e.textContent = "\u062A\u0639\u0630\u0631 \u0641\u062A\u062D \u0627\u0644\u062A\u0637\u0628\u064A\u0642 \xB7 Could not open the app";
  });
})();
