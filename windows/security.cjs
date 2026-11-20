'use strict';

const EXTERNAL_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'www.youtube.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com']);
const SITE_PERMISSIONS = new Set(['media', 'fullscreen', 'notifications', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'speaker-selection']);

function publicHTTPSURL(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed : null;
  } catch { return null; }
}

function createPolicy(appURL) {
  const address = publicHTTPSURL(appURL);
  if (!address) throw new Error('The configured application must use an HTTPS URL without embedded credentials.');
  return Object.freeze({
    appURL: address.href,
    origin: address.origin,
    trusted(value) { return publicHTTPSURL(value)?.origin === address.origin; },
    redirect(value) {
      const parsed=publicHTTPSURL(value);
      return Boolean(parsed&&(parsed.origin===address.origin||['abbeedo.com','www.abbeedo.com'].includes(address.hostname)&&['https://abbeedo.com','https://www.abbeedo.com'].includes(parsed.origin)));
    },
    external(value) {
      const parsed = publicHTTPSURL(value);
      return Boolean(parsed && (parsed.origin === address.origin || EXTERNAL_HOSTS.has(parsed.hostname)));
    },
    permission(value, permission) { return publicHTTPSURL(value)?.origin === address.origin && SITE_PERMISSIONS.has(permission); },
  });
}

function windowPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    navigateOnDragDrop: false,
    devTools: false,
    spellcheck: false,
  };
}

function isUserActivation(type) {
  return ['keyDown', 'keyUp', 'mouseDown', 'mouseUp'].includes(type);
}

function canSetLanguage(event, contents, policy) {
  return Boolean(contents && !contents.isDestroyed() && event?.sender === contents &&
    event.senderFrame === contents.mainFrame && policy.trusted(event.senderFrame?.url));
}

module.exports = {createPolicy, windowPreferences, isUserActivation, canSetLanguage};
