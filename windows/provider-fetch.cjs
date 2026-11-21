'use strict';

const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const {isIP} = require('node:net');

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const REQUEST_HEADERS = new Set(['accept', 'accept-language', 'authorization', 'cookie', 'if-modified-since', 'if-none-match', 'range', 'referer', 'user-agent', 'x-user-agent']);
const IPV4_DENIED = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
  [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
  [0xcb007100, 24], [0xe0000000, 3],
];

function transportError(name = 'Error') {
  const error = new Error(name === 'TimeoutError' ? 'Provider connection timed out.' : name === 'AbortError' ? 'Provider request cancelled.' : 'Provider connection unavailable.');
  error.name = name;
  return error;
}

function ipv6Number(address) {
  // IPv4-mapped and scoped addresses are intentionally outside the permitted
  // global-unicast range. Expand only canonical hexadecimal IPv6 here.
  if (address.includes('.') || address.includes('%')) return null;
  const halves = address.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const first = halves[0] ? halves[0].split(':') : [];
  const last = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - first.length - last.length;
  if (halves.length === 1 && missing !== 0 || halves.length === 2 && missing < 1) return null;
  const words = halves.length === 2 ? [...first, ...Array(missing).fill('0'), ...last] : first;
  if (words.length !== 8 || words.some(word => !/^[a-f0-9]{1,4}$/.test(word))) return null;
  return words.reduce((number, word) => (number << 16n) | BigInt(parseInt(word, 16)), 0n);
}

function publicAddress(value) {
  const address = typeof value === 'string' ? value.replace(/^\[|\]$/g, '') : '';
  const family = isIP(address);
  if (family === 4) {
    const number = address.split('.').reduce((result, octet) => (result * 256 + Number(octet)) >>> 0, 0);
    return !IPV4_DENIED.some(([network, bits]) => (number >>> (32 - bits)) === (network >>> (32 - bits)));
  }
  if (family !== 6) return false;
  const number = ipv6Number(address);
  if (number === null || number >> 125n !== 1n) return false; // 2000::/3 only.
  return number >> 105n !== 0x20010000000000000000000000000000n >> 105n && // IETF protocol assignments, 2001::/23.
    number >> 96n !== 0x20010db8n && // Documentation.
    number >> 112n !== 0x2002n && // 6to4 embeds an unverified IPv4 target.
    number >> 108n !== 0x3fff0n; // Documentation, 3fff::/20.
}

function providerURL(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\\\x00-\x20\x7f]/.test(value)) throw transportError();
  let url;
  try { url = new URL(value); } catch { throw transportError(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw transportError();
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(hostname)) {
    if (!publicAddress(hostname)) throw transportError();
  } else if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname) || /(?:^|\.)(?:localhost|local|internal|invalid|test|home|lan|onion)$/i.test(hostname)) {
    throw transportError();
  }
  return url;
}

function providerHeaders(value) {
  let headers;
  try { headers = new Headers(value); } catch { throw transportError(); }
  let bytes = 0;
  for (const [name, contents] of headers) {
    bytes += name.length + contents.length;
    if (!REQUEST_HEADERS.has(name) || contents.length > 8192 || /[\x00-\x1f\x7f]/.test(contents) || bytes > 16384) throw transportError();
    if (name === 'range' && (contents.length > 100 || !/^bytes=\d*-\d*$/.test(contents) || contents === 'bytes=-')) throw transportError();
  }
  return headers;
}

function defaultRequest(protocol, options, callback) {
  return (protocol === 'https:' ? https : http).request(options, callback);
}

function createProviderFetch({lookup = dns.lookup.bind(dns), request = defaultRequest, timeoutMs = 15000, maxRedirects = 5} = {}) {
  if (typeof lookup !== 'function' || typeof request !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) throw transportError();

  async function requestOnce(url, headers, method, parentSignal) {
    if (parentSignal?.aborted) throw transportError('AbortError');
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    let outgoing, incoming, rejectPending, completed = false, timer;
    let activeError = null;
    const abort = (name = 'AbortError') => {
      if (completed) return;
      activeError = transportError(name);
      outgoing?.destroy(activeError);
      incoming?.destroy(activeError);
      rejectPending?.(activeError);
    };
    const onAbort = () => abort();
    const cleanup = () => {
      completed = true;
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onAbort);
      outgoing?.setTimeout?.(0);
    };
    parentSignal?.addEventListener('abort', onAbort, {once: true});
    timer = setTimeout(() => abort('TimeoutError'), timeoutMs);
    try {
      const addresses = await new Promise((resolve, reject) => {
        rejectPending = reject;
        const resolution = isIP(hostname) ? [{address: hostname, family: isIP(hostname)}] : lookup(hostname, {all: true, verbatim: true});
        Promise.resolve(resolution).then(resolve, () => reject(transportError()));
      });
      rejectPending = null;
      if (activeError) throw activeError;
      if (!Array.isArray(addresses) || !addresses.length || addresses.length > 64 || addresses.some(item => !item || !publicAddress(item.address) || isIP(item.address) !== item.family)) throw transportError();
      const pinned = addresses[0];
      return await new Promise((resolve, reject) => {
        rejectPending = reject;
        const rejectSafe = error => { if (!completed) reject(activeError || transportError(error?.name === 'TimeoutError' ? 'TimeoutError' : 'Error')); };
        const options = {
          protocol: url.protocol,
          hostname,
          port: url.port || undefined,
          path: url.pathname + url.search,
          method,
          headers: Object.fromEntries(headers),
          // Do not pool sockets across independently validated DNS answers.
          agent: false,
          maxHeaderSize: 16384,
          family: pinned.family,
          lookup(_host, settings, callback) {
            const result = {address: pinned.address, family: pinned.family};
            if (typeof settings === 'function') settings(null, result.address, result.family);
            else if (settings?.all) callback(null, [result]);
            else callback(null, result.address, result.family);
          },
          ...(url.protocol === 'https:' && !isIP(hostname) ? {servername: hostname} : {}),
        };
        try {
          outgoing = request(url.protocol, options, response => {
            incoming = response;
            clearTimeout(timer);
            rejectPending = null;
            incoming.on('error', () => {});
            if (activeError) { incoming.destroy(activeError); return; }
            // Keep long playback alive while bytes arrive; an idle connection
            // remains bounded and the caller can cancel at any time.
            outgoing.setTimeout?.(timeoutMs, () => abort('TimeoutError'));
            const status = Number(incoming.statusCode);
            if (!Number.isInteger(status) || status < 200 || status > 599) { abort(); cleanup(); reject(transportError()); return; }
            const responseHeaders = new Headers();
            try {
              for (const [name, value] of Object.entries(incoming.headers || {})) {
                if (value != null) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
              }
              if (method === 'HEAD' || [204, 205, 304].includes(status)) {
                incoming.resume();
                incoming.once('end', cleanup);
                incoming.once('close', cleanup);
                resolve(new Response(null, {status, headers: responseHeaders}));
                return;
              }
              const iterator = incoming[Symbol.asyncIterator]();
              const stream = new ReadableStream({
                async pull(controller) {
                  try {
                    const next = await iterator.next();
                    if (next.done) { cleanup(); controller.close(); }
                    else controller.enqueue(new Uint8Array(next.value));
                  } catch { cleanup(); controller.error(activeError || transportError()); }
                },
                cancel() { cleanup(); incoming.destroy(); outgoing.destroy(); },
              });
              resolve(new Response(stream, {status, headers: responseHeaders}));
            } catch { abort(); cleanup(); reject(transportError()); }
          });
          outgoing.on('error', rejectSafe);
          outgoing.end();
          if (activeError) outgoing.destroy(activeError);
        } catch { rejectSafe(); }
      });
    } catch (error) {
      cleanup();
      outgoing?.destroy();
      incoming?.destroy();
      throw activeError || transportError(error?.name === 'AbortError' ? 'AbortError' : error?.name === 'TimeoutError' ? 'TimeoutError' : 'Error');
    }
  }

  return async function providerFetch(input, init = {}) {
    const inherited = input instanceof Request ? input : null;
    let url = providerURL(inherited ? inherited.url : input instanceof URL ? input.href : input);
    const method = String(init.method || inherited?.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method) || init.body != null || inherited?.body) throw transportError();
    const redirect = init.redirect || inherited?.redirect || 'follow';
    if (!['follow', 'manual', 'error'].includes(redirect)) throw transportError();
    const headers = providerHeaders(init.headers || inherited?.headers);
    const signal = init.signal || inherited?.signal;
    for (let count = 0; ; count++) {
      const response = await requestOnce(url, headers, method, signal);
      if (!REDIRECTS.has(response.status) || redirect === 'manual') return response;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (redirect === 'error' || !location || location.length > 8192 || count >= maxRedirects) throw transportError();
      let next;
      try { next = providerURL(new URL(location, url).href); } catch { throw transportError(); }
      if (next.origin !== url.origin) { headers.delete('authorization'); headers.delete('cookie'); headers.delete('referer'); }
      url = next;
    }
  };
}

module.exports = {createProviderFetch, publicAddress};
