/** Shared scalable icons, ported from Android SettingsIcon.java and Artwork.java. */
const n = value => String(Math.round(value * 10000) / 10000);
const path = (d, attrs = '') => `<path d="${d}"${attrs}/>`;
const line = (x, y, a, b) => path(`M${n(x)} ${n(y)}L${n(a)} ${n(b)}`);
const box = (l, t, r, b, radius = 0, attrs = '') => `<rect x="${l}" y="${t}" width="${r - l}" height="${b - t}" rx="${radius}"${attrs}/>`;
const circle = (x, y, r, attrs = '') => `<circle cx="${x}" cy="${y}" r="${r}"${attrs}/>`;
const chevron = (x, y, a, b, u, v) => path(`M${n(x)} ${n(y)}L${n(a)} ${n(b)}L${n(u)} ${n(v)}`);
const triangle = (x, y, a, b, u, v, attrs = '') => path(`M${x} ${y}L${a} ${b}L${u} ${v}Z`, attrs);
const fill = ' fill="currentColor" stroke="none"';

function arcGeometry(l, t, r, b, start, sweep) {
  const rx = (r - l) / 2, ry = (b - t) / 2, cx = (r + l) / 2, cy = (b + t) / 2;
  const a = start * Math.PI / 180, end = (start + sweep) * Math.PI / 180;
  return {rx, ry, cx, cy, end, x: cx + rx * Math.cos(end), y: cy + ry * Math.sin(end),
    d: `M${n(cx + rx * Math.cos(a))} ${n(cy + ry * Math.sin(a))}A${n(rx)} ${n(ry)} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${sweep >= 0 ? 1 : 0} ${n(cx + rx * Math.cos(end))} ${n(cy + ry * Math.sin(end))}`};
}
const arc = (...args) => path(arcGeometry(...args).d);
function wedge(...args) {
  const a = arcGeometry(...args);
  return path(`${a.d}L${a.cx} ${a.cy}Z`, fill);
}
function arrow(x, y, a, b) {
  const length = Math.hypot(a - x, b - y);
  if (!length) return '';
  const dx = (a - x) / length, dy = (b - y) / length;
  return line(x, y, a, b) + chevron(a - dx * 6 - dy * 5, b - dy * 6 + dx * 5, a, b, a - dx * 6 + dy * 5, b - dy * 6 - dx * 5);
}
function circularArrow(...args) {
  const a = arcGeometry(...args), sign = args[5] >= 0 ? 1 : -1;
  const dx = -a.rx * Math.sin(a.end), dy = a.ry * Math.cos(a.end), length = Math.hypot(dx, dy);
  const tx = dx / length * sign, ty = dy / length * sign;
  // Share the arc endpoint and its tangent: the update arrow stays connected.
  return path(a.d) + chevron(a.x - tx * 6 - ty * 5, a.y - ty * 6 + tx * 5, a.x, a.y, a.x - tx * 6 + ty * 5, a.y - ty * 6 - tx * 5);
}
function corners(l, t, r, b) {
  const arm = Math.min(r - l, b - t) * .25;
  return chevron(l, t + arm, l, t, l + arm, t) + chevron(r - arm, t, r, t, r, t + arm)
    + chevron(l, b - arm, l, b, l + arm, b) + chevron(r - arm, b, r, b, r, b - arm);
}
const finder = (x, y) => box(x, y, x + 14, y + 14, 1) + box(x + 5, y + 5, x + 9, y + 9);
const monitor = () => box(4, 5, 44, 35, 4) + line(24, 35, 24, 42) + line(15, 43, 33, 43);
const eye = () => path('M3 24Q24 2 45 24Q24 46 3 24Z') + circle(24, 24, 7);
const cloud = () => path('M13 33C0 33 0 17 12 17C13 3 34 3 36 17C48 17 48 33 36 33');
const heart = (active = false) => path('M24 41C18 36 5 27 5 16C5 5 19 3 24 13C29 3 43 5 43 16C43 27 30 36 24 41Z', active ? fill : '');
function star(active = false) {
  return path(Array.from({length: 10}, (_, i) => {
    const angle = (-90 + i * 36) * Math.PI / 180, radius = i % 2 ? 9 : 20;
    return `${i ? 'L' : 'M'}${n(24 + radius * Math.cos(angle))} ${n(24 + radius * Math.sin(angle))}`;
  }).join('') + 'Z', active ? fill : '');
}
function people(multiple = false) {
  return circle(21, 13, 7) + arc(7, 23, 35, 48, 180, 180)
    + (multiple ? arc(26, 6, 42, 21, -70, 210) + arc(32, 26, 46, 43, -90, 90) : '');
}
const wave = y => path(`M5 ${y}C13 ${y - 7} 19 ${y + 7} 27 ${y}C33 ${y - 5} 37 ${y - 5} 43 ${y}`);

// Preserve Artwork.java's 240 × 150 proportions inside the shared SVG frame.
function homeArt(kind) {
  let drawing;
  if (kind === 'live') {
    drawing = box(60, 36, 180, 112, 14) + triangle(108, 57, 108, 91, 139, 74, fill)
      + arc(36, 40, 74, 108, 115, 130) + arc(166, 40, 204, 108, -65, 130)
      + '<path d="M98 124H142" stroke="#e9f3ff"/>';
  } else if (kind === 'movie') {
    drawing = `<g transform="rotate(-9 120 75)">${box(59, 30, 181, 121, 10)}${line(59, 51, 181, 51)}${Array.from({length: 5}, (_, i) => line(68 + i * 23, 30, 82 + i * 23, 50)).join('')}${triangle(108, 68, 108, 103, 139, 85, ' stroke="#fff"')}</g>`;
  } else {
    drawing = `<g opacity=".35294">${box(48, 26, 167, 104, 12)}</g><g opacity=".58824">${box(61, 35, 180, 113, 12)}</g>`
      + box(74, 44, 193, 122, 12, fill) + triangle(120, 62, 120, 103, 151, 82, ' fill="#0b111a" stroke="none"');
  }
  return `<g transform="translate(-6 5) scale(.25)">${drawing}</g>`;
}

const paths = {
  accounts: people(true),
  profiles: people() + box(29, 27, 44, 42, 3) + line(33, 32, 40, 32) + line(33, 37, 39, 37),
  account: box(5, 9, 43, 39, 4) + circle(16, 20, 4) + arc(8, 25, 24, 36, 190, 160) + line(29, 18, 37, 18) + line(29, 25, 37, 25) + line(29, 32, 34, 32),
  qr: finder(5, 5) + finder(29, 5) + finder(5, 29) + box(30, 30, 35, 35) + line(41, 29, 41, 36) + line(29, 41, 36, 41) + line(40, 41, 43, 41),
  remote: box(13, 3, 35, 45, 7) + circle(24, 19, 7) + circle(24, 19, 1.2) + line(24, 9, 24, 12) + line(24, 26, 24, 29) + line(14, 19, 17, 19) + line(31, 19, 34, 19) + line(19, 36, 21, 36) + line(27, 36, 29, 36),
  language: circle(24, 24, 19) + '<ellipse cx="24" cy="24" rx="8" ry="19"/>' + line(5, 24, 43, 24) + arc(6, 7, 42, 25, 15, 150) + arc(6, 23, 42, 41, 195, 150),
  palette: path('M24 4C1 4-2 33 15 41C26 47 31 39 26 34C22 29 31 27 37 29C49 31 47 7 24 4Z') + [[15, 13], [30, 12], [10, 25], [37, 21]].map(([x, y]) => circle(x, y, 2)).join(''),
  theme: circle(24, 24, 17) + wedge(7, 7, 41, 41, 90, 180) + line(24, 7, 24, 41),
  motion: wave(11) + wave(23) + wave(35) + arrow(35, 8, 43, 8),
  reduced: circle(24, 24, 18) + line(18, 15, 18, 33) + line(30, 15, 30, 33),
  text: line(5, 12, 29, 12) + line(17, 12, 17, 39) + line(10, 39, 24, 39) + line(36, 11, 36, 39) + chevron(32, 15, 36, 11, 40, 15) + chevron(32, 35, 36, 39, 40, 35),
  contrast: circle(24, 24, 15) + wedge(9, 9, 39, 39, -90, 180) + Array.from({length: 8}, (_, i) => {const a = i * Math.PI / 4; return line(24 + 20 * Math.cos(a), 24 + 20 * Math.sin(a), 24 + 22 * Math.cos(a), 24 + 22 * Math.sin(a));}).join(''),
  layout: box(4, 9, 44, 39, 4) + line(16, 9, 16, 39) + line(32, 9, 32, 39),
  start: monitor() + triangle(20, 13, 20, 29, 32, 21),
  screensaver: monitor() + circle(24, 21, 9) + line(24, 15, 24, 21) + line(24, 21, 29, 24),
  timer: circle(24, 27, 16) + line(19, 4, 29, 4) + line(24, 4, 24, 11) + line(35, 11, 39, 7) + line(24, 16, 24, 27) + line(24, 27, 31, 31),
  decoder: box(11, 11, 37, 37, 3) + box(17, 17, 31, 31, 2) + [16, 24, 32].map(v => line(v, 4, v, 11) + line(v, 37, v, 44) + line(4, v, 11, v) + line(37, v, 44, v)).join(''),
  aspect: corners(5, 10, 43, 38) + arrow(13, 24, 35, 24) + arrow(35, 24, 13, 24),
  buffer: box(5, 10, 43, 38, 4) + [11, 19, 27, 35].map(v => box(v, 18, v + 4, 31, 0, fill)).join(''),
  seek: chevron(6, 14, 18, 24, 6, 34) + chevron(23, 14, 35, 24, 23, 34) + line(42, 12, 42, 36),
  next: triangle(11, 9, 11, 39, 33, 24) + line(39, 9, 39, 39),
  data: arrow(14, 6, 14, 34) + line(7, 41, 41, 41) + line(25, 35, 25, 27) + line(32, 35, 32, 20) + line(39, 35, 39, 12),
  categories: [7, 27].flatMap(y => [7, 27].map(x => box(x, y, x + 14, y + 14, 3))).join(''),
  refresh: circularArrow(7, 7, 41, 41, 45, 285),
  guide: box(5, 8, 43, 40, 4) + line(5, 18, 43, 18) + line(17, 18, 17, 40) + line(28, 18, 28, 40) + line(5, 29, 43, 29) + line(14, 4, 14, 11) + line(34, 4, 34, 11),
  pin: box(10, 20, 38, 43, 4) + arc(15, 4, 33, 35, 180, 180) + line(15, 19, 15, 14) + line(33, 19, 33, 14) + [17, 24, 31].map(v => circle(v, 31, 1)).join(''),
  parental: circle(17, 11, 6) + arc(5, 19, 29, 43, 180, 180) + circle(34, 24, 4) + arc(26, 30, 43, 47, 180, 180),
  hidden: eye() + line(5, 5, 43, 43),
  privacy: path('M24 4L41 11L38 28Q35 39 24 45Q13 39 10 28L7 11Z') + line(24, 14, 24, 27) + circle(24, 33, 1),
  history: circularArrow(8, 7, 42, 41, -100, 300) + line(25, 14, 25, 25) + line(25, 25, 33, 29),
  backup: cloud() + arrow(24, 39, 24, 21),
  restore: cloud() + arrow(24, 21, 24, 40),
  delete: box(12, 12, 36, 43, 3) + line(8, 11, 40, 11) + line(18, 5, 30, 5) + line(20, 20, 20, 35) + line(28, 20, 28, 35),
  support: arc(7, 5, 41, 39, 180, 180) + box(5, 22, 13, 35, 3) + box(35, 22, 43, 35, 3) + line(39, 35, 39, 39) + line(39, 39, 27, 42) + line(23, 42, 28, 42),
  network: arc(3, 7, 45, 49, 220, 100) + arc(10, 17, 38, 45, 220, 100) + arc(18, 29, 30, 41, 220, 100) + circle(24, 40, 2, fill),
  tools: path('M32 4C17 2 14 14 20 22L5 37L11 43L27 27C41 31 48 17 42 10L33 18L27 12L35 4'),
  setup: box(7, 5, 41, 43, 4) + [14, 24, 34].map(y => chevron(12, y, 15, y + 3, 19, y - 3) + line(25, y, 35, y)).join(''),
  demo: box(5, 8, 43, 40, 5) + triangle(19, 15, 19, 33, 32, 24),
  update: circularArrow(6, 7, 42, 43, 40, 280) + arrow(24, 36, 24, 15),
  notifications: path('M8 35L12 29L12 19C12 4 36 4 36 19L36 29L40 35Z') + arc(18, 34, 30, 46, 0, 180),
  filter: [16, 32, 22].map((v, i) => line(5, 10 + i * 14, v - 5, 10 + i * 14) + line(v + 5, 10 + i * 14, 43, 10 + i * 14) + circle(v, 10 + i * 14, 4)).join(''),
  voice: box(17, 4, 31, 31, 7) + arc(11, 13, 37, 39, 0, 180) + line(11, 20, 11, 26) + line(37, 20, 37, 26) + line(24, 39, 24, 44) + line(16, 44, 32, 44),
  favorite: heart(), favorite_active: heart(true), watchlist: star(), watchlist_active: star(true),
  sort: arrow(14, 7, 14, 40) + arrow(34, 40, 34, 7),
  close: line(12, 12, 36, 36) + line(36, 12, 12, 36),
  previous_channel: arrow(24, 40, 24, 8), next_channel: arrow(24, 8, 24, 40),
  logout: box(7, 5, 27, 43, 3) + line(25, 24, 44, 24) + chevron(36, 16, 44, 24, 36, 32),
  help: circle(24, 24, 19) + path('M17 16C17 6 34 8 32 18C31 23 24 23 24 29') + circle(24, 36, 1),
  live: homeArt('live'), movie: homeArt('movie'), series: homeArt('series'),
  // Web-only controls retain the same round-ended, 48-unit stroke system.
  settings: path('M19 6L17.8 10A16 16 0 0 0 14.8 11.8L10.8 10.8L6.8 17.6L9.6 20.6A16 16 0 0 0 9.6 24.2L6.8 27.2L10.8 34L14.8 33A16 16 0 0 0 17.8 34.8L19 38.8H27L28.2 34.8A16 16 0 0 0 31.2 33L35.2 34L39.2 27.2L36.4 24.2A16 16 0 0 0 36.4 20.6L39.2 17.6L35.2 10.8L31.2 11.8A16 16 0 0 0 28.2 10L27 6Z') + circle(23, 22, 6),
  back: chevron(18, 12, 30, 24, 18, 36), search: circle(21, 21, 13) + line(32, 32, 42, 42),
  download: arrow(24, 5, 24, 30) + path('M7 33V42H41V33'), upload: arrow(24, 31, 24, 6) + path('M7 33V42H41V33'),
  eye: eye(), play: triangle(16, 6, 16, 42, 42, 24),
  number: path('M18 4L10 44M38 4L30 44M4 18H44M2 32H42'),
  rewind: chevron(22, 10, 4, 24, 22, 38) + chevron(44, 10, 26, 24, 44, 38),
  forward: chevron(4, 10, 22, 24, 4, 38) + chevron(26, 10, 44, 24, 26, 38),
  subtitles: box(4, 8, 44, 40, 4) + path('M10 20H18M24 20H38M10 30H26M32 30H38'),
  pip: box(4, 6, 44, 42, 4) + box(24, 24, 40, 38, 2), fullscreen: corners(6, 6, 42, 42),
  camera: path('M4 14H14L18 8H30L34 14H44V42H4Z') + circle(24, 28, 8),
  copy: box(16, 16, 43, 43, 2) + path('M8 32H4V4H32V8'),
  chat: path('M6 6H42V34H18L6 44Z') + line(14, 16, 34, 16) + line(14, 26, 28, 26),
  info: circle(24, 24, 19) + line(24, 22, 24, 36) + circle(24, 13, 1, fill), check: chevron(6, 24, 18, 36, 42, 12)
};

const aliases = Object.freeze({heart: 'favorite', star: 'watchlist', bookmark: 'watchlist', calendar: 'guide', friends: 'accounts', up: 'previous_channel', down: 'next_channel'});
export const ICON_NAMES = Object.freeze([...Object.keys(paths), ...Object.keys(aliases)].sort());
export function icon(name) {
  const key = Object.hasOwn(aliases, name) ? aliases[name] : Object.hasOwn(paths, name) ? name : 'info';
  const home = key === 'live' || key === 'movie' || key === 'series';
  return `<svg class="app-icon${home ? ' app-icon--artwork' : ''}" data-app-icon="${key}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[key]}</svg>`;
}
export function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (!el.querySelector(':scope > svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
  });
}
