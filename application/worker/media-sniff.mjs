// Inspect only an already-buffered prefix. This identifies a container, never
// promises that a browser can decode its video/audio tracks.
export function watchSniffMediaType(bytes, fallback = 'application/octet-stream') {
  if (!(bytes instanceof Uint8Array)) return fallback;
  const ascii = (at, count) => String.fromCharCode(...bytes.subarray(at, at + count));
  if (bytes.length >= 3 && ascii(0, 3) === 'FLV') return 'video/x-flv';
  if (bytes.length >= 377 && bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47) return 'video/mp2t';
  // M2TS has a four-byte timestamp before each 188-byte transport packet.
  if (bytes.length >= 389 && bytes[4] === 0x47 && bytes[196] === 0x47 && bytes[388] === 0x47) return 'video/mp2t';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const header = ascii(0, Math.min(bytes.length, 1024));
    return header.includes('webm') ? 'video/webm' : 'video/x-matroska';
  }
  for (let at = 0, boxes = 0; at + 8 <= bytes.length && boxes < 8; boxes++) {
    const size = bytes[at] * 0x1000000 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
    const type = ascii(at + 4, 4);
    if (size >= 8 && type === 'ftyp') return ascii(at + 8, 4) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
    if (size >= 8 && (type === 'styp' || type === 'moof' || type === 'moov')) return 'video/mp4';
    if (size < 8 || size > bytes.length - at || !['free', 'skip', 'wide'].includes(type)) break;
    at += size;
  }
  return fallback;
}
