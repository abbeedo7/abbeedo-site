// Runtime presentation only: an installed launch is detected from the browser,
// never from a URL flag or a value saved by an earlier visit.
export function isAppContext(scope = globalThis) {
  try {
    if (scope.webkit?.messageHandlers?.abunasser) return true;
    if (scope.abunasserDesktop?.isDesktop === true && scope.abunasserDesktop.platform === 'win32') return true;
    const platform = detectPlatform(scope);
    if (['android', 'android-tv', 'windows'].includes(platform)) return false;
    if (scope.navigator?.standalone === true) return true;
    return scope.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    return false;
  }
}

export function installationPlatform(scope = globalThis) {
  try {
    return detectPlatform(scope);
  } catch {
    return 'other';
  }
}

function detectPlatform(scope) {
  const navigator = scope.navigator || {};
  const userAgent = String(navigator.userAgent || '');
  const isIPadDesktop = (navigator.platform === 'MacIntel' || /Macintosh/i.test(userAgent)) && Number(navigator.maxTouchPoints) > 1;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktop;
  if (isIOS) {
    const anotherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|FBAN|FBAV|Instagram|Snapchat|TikTok|Line\/|NAVER/i.test(userAgent);
    return /Safari\//i.test(userAgent) && !anotherBrowser ? 'ios-safari' : 'ios-other';
  }
  if (/\b(?:Tizen|webOS|Web0S|NetCast)\b/i.test(userAgent)) return 'other';
  if (/\b(?:Android[\s_-]*TV|Google[\s_-]*TV|AFT[A-Z0-9]*|BRAVIA|SHIELD|SMART[\s_-]*TV|Chromecast|Nexus[\s_-]*Player|Mi[\s_-]*TV)\b/i.test(userAgent)) return 'android-tv';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows\s+NT/i.test(userAgent) || /^Win(?:32|64|CE)$/i.test(String(navigator.platform || '')) || navigator.userAgentData?.platform === 'Windows') return 'windows';
  return 'other';
}
