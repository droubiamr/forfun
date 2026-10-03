/* Homs Walk · حمص
   A tiny pixel stroll through Homs, synced to the city's real clock and sky.
   Everything is drawn in code: no images, no libraries, no build step. */
'use strict';
(() => {

/* ===================================================================
   Config & helpers
   =================================================================== */
const H = 180, GROUND = 140, FEET = 150, WORLD_W = 2904; // a multiple of every repeating street pattern, so the loop is seamless
const NEW_CLOCK_X = 1190;
const MID_P = WORLD_W / 4, FAR_A_P = WORLD_W / 8, FAR_B_P = WORLD_W / 6;
const MAX_W = 640;
let W = 320;
const LAT = 34.7324, LNG = 36.7137, TZ = 'Asia/Damascus';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=34.7324&longitude=36.7137' +
  '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,cloud_cover,is_day' +
  '&daily=sunrise,sunset&timezone=Asia%2FDamascus&forecast_days=1';

const $ = s => document.querySelector(s);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mulC = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const greyC = c => { const l = c[0] * .3 + c[1] * .59 + c[2] * .11; return [l, l, l]; };
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const pad = n => String(n).padStart(2, '0');
function seeded(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[(r() * arr.length) | 0];
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

/* Crisp pixel text: render with a real font, then threshold the alpha. */
const FONT_LAT = '"Silkscreen", monospace';
const FONT_AR = '"Noto Kufi Arabic", "Geeza Pro", "Segoe UI", "Arial", sans-serif';
function pixelText(str, size, color, ar = false) {
  const font = ar ? `700 ${size}px ${FONT_AR}` : `400 ${size}px ${FONT_LAT}`;
  const [, mx] = makeCanvas(1, 1);
  mx.font = font;
  const m = mx.measureText(str);
  const asc = Math.ceil(m.actualBoundingBoxAscent || size), desc = Math.ceil(m.actualBoundingBoxDescent || 2);
  const w = Math.ceil(m.width) + 2, h = asc + desc + 2;
  const [c, x] = makeCanvas(w, h);
  x.font = font;
  x.fillStyle = '#000';
  x.fillText(str, 1, asc + 1);
  const id = x.getImageData(0, 0, w, h), d = id.data, [r, g, b] = hexRGB(color);
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > (ar ? 90 : 110);
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = on ? 255 : 0;
  }
  x.putImageData(id, 0, 0);
  return c;
}

function spriteFrom(rows, pal) {
  const [c, x] = makeCanvas(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); }
  }));
  return c;
}
function outlined(src, col = '#17121c') {
  const [c, x] = makeCanvas(src.width + 2, src.height + 2);
  const [t, tx] = makeCanvas(src.width, src.height);
  tx.drawImage(src, 0, 0);
  tx.globalCompositeOperation = 'source-in';
  tx.fillStyle = col;
  tx.fillRect(0, 0, src.width, src.height);
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(t, dx, dy);
  x.drawImage(src, 1, 1);
  return c;
}
function flipped(src) {
  const [c, x] = makeCanvas(src.width, src.height);
  x.scale(-1, 1);
  x.drawImage(src, -src.width, 0);
  return c;
}

/* Stepped radial glows, cached per colour/radius. */
const glowCache = new Map();
function glowSprite(col, r) {
  const key = col + r;
  if (glowCache.has(key)) return glowCache.get(key);
  const s = r * 2, [c, x] = makeCanvas(s, s), id = x.createImageData(s, s), [cr, cg, cb] = hexRGB(col);
  for (let y = 0; y < s; y++) for (let i = 0; i < s; i++) {
    const d = Math.hypot(i + .5 - r, y + .5 - r) / r;
    if (d >= 1) continue;
    const a = Math.ceil((1 - d) * 5) / 5;
    const o = (y * s + i) * 4;
    id.data[o] = cr; id.data[o + 1] = cg; id.data[o + 2] = cb; id.data[o + 3] = a * a * 150;
  }
  x.putImageData(id, 0, 0);
  glowCache.set(key, c);
  return c;
}

/* ===================================================================
   Astronomy (compact SunCalc-style maths)
   =================================================================== */
const RAD = Math.PI / 180, E_OBL = RAD * 23.4397;
const toDays = ms => ms / 864e5 - 0.5 + 2440588 - 2451545;
const decl = (l, b) => Math.asin(Math.sin(b) * Math.cos(E_OBL) + Math.cos(b) * Math.sin(E_OBL) * Math.sin(l));
const rAsc = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E_OBL) - Math.tan(b) * Math.sin(E_OBL), Math.cos(l));
function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: decl(L, 0), ra: rAsc(L, 0) };
}
function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { dec: decl(l, b), ra: rAsc(l, b), dist: 385001 - 20905 * Math.cos(M) };
}
function horizontal(d, c) {
  const lw = RAD * -LNG, phi = RAD * LAT;
  const H = RAD * (280.16 + 360.9856235 * d) - lw - c.ra;
  return {
    alt: Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H)),
    az: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(c.dec) * Math.cos(phi)),
  };
}
function astro(ms) {
  const d = toDays(ms), s = sunCoords(d), m = moonCoords(d);
  const sun = horizontal(d, s), moon = horizontal(d, m);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const phase = 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI;
  return { sunAlt: sun.alt / RAD, sunAz: sun.az, moonAlt: moon.alt / RAD, moonAz: moon.az, phase };
}

/* ===================================================================
   Homs clock
   =================================================================== */
const fmtParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const fmtDate = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' });
let fmtHijri, fmtHijriNum;
try {
  fmtHijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  fmtHijriNum = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: TZ, month: 'numeric' });
} catch { /* very old browsers: no Hijri line */ }
function homsParts(ms) {
  const o = {};
  for (const p of fmtParts.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}

/* ===================================================================
   Weather
   =================================================================== */
const WX_TEXT = {
  clear: ['Clear', 'صافٍ'], mostly: ['Mostly clear', 'صحو'], partly: ['Partly cloudy', 'غائم جزئياً'],
  overcast: ['Overcast', 'غائم'], fog: ['Fog', 'ضباب'], drizzle: ['Drizzle', 'رذاذ'], rain: ['Rain', 'مطر'],
  heavy: ['Heavy rain', 'مطر غزير'], showers: ['Showers', 'زخّات'], snow: ['Snow', 'ثلج'],
  storm: ['Thunderstorm', 'عاصفة رعدية'], dust: ['Hot & hazy', 'حرّ وغبار'],
};
function wxState(key, extra = {}) {
  const s = { key, cloud: 0.05, rain: 0, snow: 0, fog: 0, storm: 0, dust: 0, wind: 10, temp: null, feels: null };
  switch (key) {
    case 'mostly': s.cloud = 0.25; break;
    case 'partly': s.cloud = 0.5; break;
    case 'overcast': s.cloud = 0.92; break;
    case 'fog': s.cloud = 0.6; s.fog = 0.85; break;
    case 'drizzle': s.cloud = 0.85; s.rain = 0.3; break;
    case 'rain': s.cloud = 0.9; s.rain = 0.65; break;
    case 'heavy': s.cloud = 1; s.rain = 1; break;
    case 'showers': s.cloud = 0.75; s.rain = 0.7; break;
    case 'snow': s.cloud = 0.9; s.snow = 0.8; break;
    case 'storm': s.cloud = 1; s.rain = 0.95; s.storm = 1; s.wind = 30; break;
    case 'dust': s.cloud = 0.1; s.dust = 0.7; s.wind = 20; break;
  }
  return Object.assign(s, extra);
}
function wxFromCode(code) {
  if (code === 0) return 'clear';
  if (code === 1) return 'mostly';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 65 || code === 67) return 'heavy';
  if (code >= 61 && code <= 67) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 95) return 'storm';
  return 'clear';
}
const live = { wx: null, sunrise: null, sunset: null, ok: false };
async function fetchWeather() {
  try {
    const r = await fetch(WEATHER_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), c = j.current;
    let key = wxFromCode(c.weather_code);
    if ((key === 'clear' || key === 'mostly') && c.temperature_2m >= 35) key = 'dust';
    const s = wxState(key, { wind: c.wind_speed_10m, temp: c.temperature_2m, feels: c.apparent_temperature });
    if (typeof c.cloud_cover === 'number' && !s.rain && !s.snow) s.cloud = Math.max(s.cloud * 0.6, c.cloud_cover / 100);
    live.wx = s;
    live.sunrise = j.daily?.sunrise?.[0]?.slice(11, 16) || null;
    live.sunset = j.daily?.sunset?.[0]?.slice(11, 16) || null;
    live.ok = true;
  } catch {
    live.ok = false;
    if (!live.wx) live.wx = wxState('clear');
  }
  hudDirty = true;
}

/* ===================================================================
   Sprites
   =================================================================== */
const SPR = {};
function buildSprites() {
  // The walker: slick dark hair, full beard, black suit, white shirt, green tie.
  const pal = {
    k: '#17121c', h: '#231a17', H: '#43352e', s: '#d6a47e', S: '#b5825f', e: '#17121c',
    b: '#1c1512', B: '#3a2c25', w: '#eef0ea', g: '#2f7a3e', G: '#1f5a2a', j: '#23262d', J: '#383d47',
  };
  const torso = [
    '......kkkkk.....',
    '....kkhhhhhkk...',
    '...khhHHHhhhhk..',
    '..khhhhhHHhhhhk.',
    '..khhhhhhhhhhhk.',
    '.khhhhhhhssssssk',
    '.khhhhssbbsbbssk',
    '.khhsSsssessesk.',
    '.khhsSssssssssSk',
    '.khhhbbbssbbbbsk',
    '.kkhbbbbbbbbbbbk',
    '..kbbbbbbBbbbbbk',
    '...kbbbbbbBbbbk.',
    '....kbbbbbbbbk..',
    '....kjjwgwjjk...',
    '...kjjjwgwjjjk..',
    '..kjjJjjgGjjjjk.',
    '..kjjJjjgGjjjjk.',
    '..kjjJjjjgjjjjk.',
    '..kjjJjjjjjjjjk.',
    '..kjjJjjjjjjjjk.',
    '..ksjJjjjjjjjsk.',
    '..kkjjjjjjjjjkk.',
    '...kjjjjjjjjk...',
  ];
  SPR.torso = spriteFrom(torso, pal);
  // People, cars, critters
  const r = seeded(7);
  SPR.people = Array.from({ length: 14 }, () => makePerson(r));
  SPR.baker = makePerson(seeded(99), { top: '#f2efe6', hair: '#f2efe6', skin: '#d6a47e', hijab: false, cap: true });
  SPR.cars = [
    makeCar('taxi', '#f2c230'), makeCar('taxi', '#f2c230'), makeCar('taxi', '#f2c230'),
    makeCar('sedan', '#d8dce0'), makeCar('sedan', '#7a2f2f'), makeCar('sedan', '#2f4a6a'),
    makeCar('sedan', '#3c3c42'), makeCar('van', '#eeeae0'), makeCar('van', '#eeeae0'), makeCar('pickup', '#4f6f8a'),
  ];
  SPR.cat = ['#e09a4a', '#3a3438', '#d8d0c4', '#8a8a90'].map(c => {
    const p = { o: c, d: mulHex(c, 0.75), e: '#2a7a3a', p: '#e6a0a0' };
    const a = spriteFrom(['o.o.....', 'ooo.....', 'eoe.....', 'ooo...d.', '.oooo.d.', '.oooood.', '.o.o.o..'], p);
    const b = spriteFrom(['o.o.....', 'ooo.....', 'eoe.....', 'ooo.....', '.oooo.dd', '.oooood.', '.o.o.o..'], p);
    return [outlined(a), outlined(b)];
  });
  const pg = { g: '#8a8f9a', G: '#5f6470', n: '#4f7f78', w: '#c9ccd2', o: '#d07a5a' };
  SPR.pigeon = [
    spriteFrom(['...nG', 'gggn.', '.ggg.', '..o..'], pg),
    spriteFrom(['.....', 'gggnG', '.gggn', '..o..'], pg),
    spriteFrom(['.w.w.', '.www.', 'ggggn', '.....'], pg),
    spriteFrom(['.....', '.ggggn', 'ww.ww', '.....'], pg),
  ];
}
function mulHex(h, k) { const c = mulC(hexRGB(h), k); return '#' + c.map(v => pad((Math.min(255, v) | 0).toString(16))).join(''); }

function makePerson(r, force = {}) {
  const skin = force.skin || pick(r, ['#e7b994', '#c99470', '#a7714f', '#f2cfae', '#d6a47e']);
  const hijab = force.hijab ?? r() < 0.45;
  const hair = force.hair || pick(r, ['#1d1512', '#33221a', '#4d3322', '#7b7b80', '#1d1512']);
  const scarf = pick(r, ['#e9d8c4', '#2c2c34', '#8a5a6a', '#6f8aa5', '#c78a8a', '#4d6b58', '#d9b36a']);
  const top = force.top || pick(r, ['#4a6a8a', '#8a3a3a', '#3e5c46', '#d6d0c4', '#2c2c34', '#b08850', '#6a4c7a', '#5a6470']);
  const bot = pick(r, ['#2b3040', '#3a3a3a', '#5a4a3a', '#1f2a3a', '#4a4f5a']);
  const long = hijab && r() < 0.6;
  const kid = !force.top && r() < 0.15;
  const frames = [0, 1, 2, 3].map(f => {
    const [c, x] = makeCanvas(10, 22);
    const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    const off = [-1, 0, 1, 0][f];
    const legTop = long ? 18 : 15;
    R(3 + off, legTop, 2, 21 - legTop, mulHex(bot, 0.8));
    R(5 - off, legTop, 2, 21 - legTop, bot);
    R(3 + off, 21, 3, 1, '#1a1a1e'); R(5 - off, 21, 3, 1, '#1a1a1e');
    R(1, 9, 8, long ? 10 : 7, long ? scarf === '#e9d8c4' ? '#3a3a44' : mulHex(scarf, 0.7) : top);
    R(1, 10, 1, 5, mulHex(long ? scarf : top, 0.7));
    R(7 + (f % 2), 12, 1, 3, skin);
    if (hijab) {
      R(1, 0, 8, 10, scarf);
      R(4, 2, 4, 5, skin);
      R(6, 4, 1, 1, '#17121c');
    } else {
      R(2, 1, 7, 8, skin);
      R(1, 0, 7, 3, hair); R(1, 3, 2, 4, hair);
      R(6, 4, 1, 1, '#17121c');
      if (force.cap) R(1, -1, 8, 3, '#ffffff');
    }
    return outlined(c);
  });
  return { r: frames, l: frames.map(flipped), kid };
}

function makeCar(type, col) {
  const len = type === 'van' ? 40 : type === 'pickup' ? 34 : 30, h = type === 'van' ? 16 : 13;
  const [c, x] = makeCanvas(len, h);
  const R = (a, b, w, hh, cc) => { x.fillStyle = cc; x.fillRect(a, b, w, hh); };
  const dark = mulHex(col, 0.72), light = mulHex(col, 1.12);
  const glass = '#5f7790', glassL = '#9fb6c8';
  if (type === 'van') {
    R(1, 2, len - 3, h - 6, col); R(0, 3, 1, h - 7, col); R(len - 2, 4, 2, h - 8, col);
    R(1, 1, len - 6, 1, dark);
    for (let i = 4; i < len - 10; i += 7) R(i, 4, 5, 4, glass);
    R(len - 8, 4, 5, 5, glass); R(len - 7, 4, 2, 1, glassL);
    R(1, h - 6, len - 2, 1, dark); R(2, 9, len - 6, 1, '#3a7a9a');
  } else if (type === 'pickup') {
    R(0, 6, len, h - 9, col); R(len - 14, 1, 11, 5, col); R(len - 12, 2, 7, 4, glass);
    R(1, 4, 16, 2, dark); R(3, 2, 4, 2, '#8a6a3a'); R(8, 3, 6, 1, '#4a8a3a');
    R(0, h - 4, len, 1, dark);
  } else {
    R(0, 6, len, h - 9, col); R(7, 1, 15, 5, col); R(5, 3, 2, 3, col); R(22, 3, 3, 3, col);
    R(8, 2, 6, 4, glass); R(15, 2, 6, 4, glass); R(9, 2, 2, 1, glassL);
    R(0, h - 4, len, 1, dark); R(0, 8, len, 1, light);
    if (type === 'taxi') { R(12, 0, 6, 1, '#1d1d22'); R(13, 0, 4, 1, '#f6f0d0'); R(0, 9, len, 1, '#1d1d22'); for (let i = 1; i < len; i += 3) R(i, 9, 1, 1, '#f6f0d0'); }
  }
  // wheels
  for (const wx of [5, len - 8]) { R(wx, h - 4, 5, 4, '#16161a'); R(wx + 1, h - 3, 3, 2, '#77777f'); }
  R(len - 1, 7, 1, 2, '#fff2c0'); R(0, 7, 1, 2, '#c02a2a');
  const o = outlined(c);
  return { r: o, l: flipped(o), len: len + 2, h: h + 2 };
}

/* ===================================================================
   World building
   =================================================================== */
const backLights = [];   // rect emissives on the back layer {x,y,w,h,c,th,kind}
const glows = [];        // additive glows {x,y,r,c,th,flick,layer}
const shops = [];        // shutter rects {x,y,w,h,open}
let MANAKISH = 0;        // index of the manakish oven shop (the baker stands there)
const clocks = [];       // {x,y,r,layer}
const steam = [];        // emitters {x,y}
const talk = [];         // {x, id}
const midLights = [];
const puddles = [];
let back, fore, mid, farA, farB, farSnow;
let g;
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const PX = (x, y, c) => R(x, y, 1, 1, c);
const WARM = ['#ffd58a', '#ffcf7a', '#ffe0a8', '#ffc46a', '#f6e6c0'];

const ZONES = [
  { x: 0, en: 'The Old Clock', ar: 'الساعة القديمة' },
  { x: 470, en: 'Al-Dablan Street', ar: 'شارع الدبلان' },
  { x: 1020, en: 'New Clock Square', ar: 'ساحة الساعة الجديدة' },
  { x: 1360, en: 'The Covered Souq', ar: 'السوق المسقوف' },
  { x: 1905, en: 'Old Homs', ar: 'حمص القديمة' },
  { x: 2370, en: 'Khalid ibn al-Walid Mosque', ar: 'جامع خالد بن الوليد' },
];
const SOUQ = [1360, 1900];

function archInside(px, py, ax, ay, aw, ah) {
  if (px < ax || px >= ax + aw || py < ay || py >= ay + ah) return false;
  const r = aw / 2;
  if (py - ay < r) { const dx = px + .5 - (ax + r), dy = (ay + r) - (py + .5); return dx * dx + dy * dy <= r * r; }
  return true;
}
function arch(x, y, w, h, c) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) if (archInside(px, py, x, y, w, h)) PX(px, py, c);
}
function ring(x, y, w, h, t, a, b, seg = 7) {
  // Ablaq voussoirs: alternating dark/light stones around an arch.
  const r = (w + 2 * t) / 2, cx = x + w / 2, cy = y + w / 2;
  for (let py = y - t; py < y + h; py++) for (let px = x - t; px < x + w + t; px++) {
    if (!archInside(px, py, x - t, y - t, w + 2 * t, h + t) || archInside(px, py, x, y, w, h)) continue;
    let k;
    if (py < cy) k = Math.floor((Math.atan2(cy - py - .5, px + .5 - cx) / Math.PI) * seg) % 2;
    else k = Math.floor((py - cy) / 3) % 2;
    PX(px, py, k ? a : b);
  }
  return r;
}
function stone(x, y, w, h, o) {
  const { base, mortar, course = 4, brick = 8, ablaq = null, band = 3, vary = null, r = Math.random } = o;
  R(x, y, w, h, base);
  for (let row = 0, yy = y; yy < y + h; row++, yy += course) {
    const ch = Math.min(course, y + h - yy);
    const isBand = ablaq && row % band === band - 1;
    if (isBand) R(x, yy, w, ch, ablaq);
    const off = row % 2 ? brick >> 1 : 0;
    if (vary && !isBand) for (let xx = x - off; xx < x + w; xx += brick) {
      if (r() < .35) { const x0 = Math.max(x, xx + 1); R(x0, yy, Math.min(xx + brick, x + w) - x0, ch - 1, pick(r, vary)); }
    }
    R(x, yy + ch - 1, w, 1, mortar);
    if (!isBand) for (let xx = x + off; xx < x + w; xx += brick) if (xx > x) R(xx, yy, 1, ch - 1, mortar);
  }
}
function rectWin(x, y, w, h, frame, glass, light = true, r = Math.random) {
  R(x - 1, y - 1, w + 2, h + 2, frame);
  R(x, y, w, h, glass);
  R(x, y + (h >> 1), w, 1, frame);
  if (w > 5) R(x + (w >> 1), y, 1, h, frame);
  R(x, y, 1, 1, mulHex(glass, 1.4));
  if (light) backLights.push({ x, y, w, h, c: pick(r, WARM), th: r() });
}
function awning(x, y, w, c1, c2) {
  for (let row = 0; row < 6; row++) for (let i = 0; i < w; i++) {
    PX(x + i, y + row, ((i >> 2) % 2) ? c1 : c2);
  }
  for (let i = 0; i < w; i += 4) { R(x + i, y + 6, 3, 1, ((i >> 2) % 2) ? c1 : c2); R(x + i + 1, y + 7, 1, 1, ((i >> 2) % 2) ? c1 : c2); }
  R(x, y, w, 1, mulHex(c1, 0.7));
}
function sign(x, y, w, h, bg, fg, ar, en, border) {
  R(x, y, w, h, border || mulHex(bg, 0.6));
  R(x + 1, y + 1, w - 2, h - 2, bg);
  let t1 = pixelText(ar, 10, fg, true);
  let t2 = en ? pixelText(en, 8, fg) : null;
  if (t2 && t1.width + t2.width + 4 > w - 4) t2 = null;
  if (t1.width > w - 2) t1 = pixelText(ar, 9, fg, true);
  const tw = t1.width + (t2 ? t2.width + 4 : 0);
  let tx = Math.round(x + (w - tw) / 2);
  if (t2) { g.drawImage(t2, tx, Math.round(y + (h - t2.height) / 2)); tx += t2.width + 4; }
  g.drawImage(t1, tx, Math.round(y + (h - t1.height) / 2) + 1);
}
function shop(x, w, opts) {
  const { bg, fg, ar, en, awn, wall = '#d9cbb0', open = [8, 24] } = opts;
  R(x, 94, w, 46, wall);
  sign(x + 2, 96, w - 4, 13, bg, fg, ar, en);
  const ox = x + 5, ow = w - 10, oy = 114, oh = 26;
  R(ox - 1, oy - 1, ow + 2, oh + 1, '#4a4a50');
  R(ox, oy, ow, oh, opts.inside || '#3a2c24');
  opts.interior?.(ox, oy, ow, oh);
  if (awn) awning(x + 1, 109, w - 2, awn[0], awn[1]);
  // rolled-up shutter box
  R(ox - 1, 110 + (awn ? 0 : 0), ow + 2, 4, '#8f949a'); R(ox - 1, 113, ow + 2, 1, '#6f747a');
  shops.push({ x: ox, y: oy, w: ow, h: oh, open });
  glows.push({ x: ox + ow / 2, y: oy + oh / 2, r: 22, c: '#ffb860', th: 0.25, layer: 0, shop: shops.length - 1 });
}
function building(x, w, top, o, r) {
  const { col, floor = 15, ww = 7, wh = 8, gap = 15, bottom = 94, roof = true } = o;
  const dark = mulHex(col, 0.85), lite = mulHex(col, 1.06);
  R(x, top, w, bottom - top, col);
  R(x, top, 1, bottom - top, lite); R(x + w - 1, top, 1, bottom - top, dark);
  R(x - 1, top - 2, w + 2, 2, dark); R(x - 1, top, w + 2, 1, mulHex(col, 0.7));
  // subtle stone/plaster texture
  for (let i = 0; i < w * (bottom - top) / 40; i++) PX(x + r() * w, top + r() * (bottom - top), r() < .5 ? dark : mulHex(col, 0.93));
  const cols = Math.max(1, Math.floor((w - 6) / gap));
  const start = x + Math.round((w - (cols - 1) * gap - ww) / 2);
  for (let fy = top + 5; fy + wh < bottom - 3; fy += floor) {
    R(x, fy - 3, w, 1, mulHex(col, 0.9));
    for (let i = 0; i < cols; i++) {
      const wx = start + i * gap;
      rectWin(wx, fy, ww, wh, o.frame || '#f0ead8', '#2c3340', true, r);
      if (o.shutters && r() < .45) { R(wx, fy, ww, wh, '#7b8790'); for (let k = 1; k < wh; k += 2) R(wx, fy + k, ww, 1, '#6a747c'); backLights.pop(); }
      if (r() < (o.balcony ?? .35)) {
        R(wx - 3, fy + wh + 1, ww + 6, 1, '#2a2a30'); R(wx - 3, fy + wh - 3, ww + 6, 1, '#2a2a30');
        for (let k = wx - 3; k < wx + ww + 3; k += 2) R(k, fy + wh - 3, 1, 4, '#2a2a30');
        if (r() < .3) { R(wx - 2, fy + wh - 5, 3, 2, '#3a7a3a'); PX(wx - 1, fy + wh - 6, '#d84a6a'); }
      }
      if (r() < .25) { R(wx + ww + 2, fy + 2, 6, 5, '#e0e0e0'); R(wx + ww + 3, fy + 3, 4, 3, '#b8b8bc'); }
      if (r() < .12) { // laundry
        R(wx - 2, fy - 2, ww + 10, 1, '#555');
        for (let k = 0; k < 4; k++) R(wx + k * 3, fy - 1, 2, 3 + (k % 2), pick(r, ['#e05a5a', '#5a8ae0', '#f0f0f0', '#e0c050', '#6ac08a']));
      }
    }
  }
  if (roof) rooftop(x, w, top - 2, r);
}
function rooftop(x, w, y, r) {
  for (let i = x + 3; i < x + w - 8; i += 9 + (r() * 14 | 0)) {
    const t = r();
    if (t < .35) { R(i, y - 6, 6, 6, t < .2 ? '#2a2a30' : '#e6e6ea'); R(i, y - 7, 6, 1, '#555'); R(i + 1, y - 1, 1, 1, '#555'); }
    else if (t < .6) { R(i + 2, y - 5, 1, 5, '#777'); R(i, y - 7, 4, 3, '#dcdcdc'); PX(i + 4, y - 6, '#999'); }
    else if (t < .75) { R(i + 1, y - 12, 1, 12, '#555'); R(i - 2, y - 10, 7, 1, '#555'); R(i - 1, y - 7, 5, 1, '#555'); }
  }
}
function palm(x, base, h, r) {
  let px = x;
  for (let y = base; y > base - h; y--) {
    px = x + Math.sin((base - y) / h * 1.6) * 3;
    R(px - 1, y, 3, 1, ((base - y) >> 1) % 2 ? '#7a5a3a' : '#5e4228');
  }
  const cx = Math.round(px), cy = base - h;
  const leaves = [-2.9, -2.5, -2.0, -1.4, -1.1, -0.6, -0.2, 0.25, -1.75, -3.1];
  for (const a of leaves) {
    const L = 16 + r() * 7;
    for (let t = 0; t < 1; t += 0.04) {
      const lx = cx + Math.cos(a) * L * t, ly = cy + Math.sin(a) * L * t + t * t * L * 0.7;
      R(lx, ly, 2, 1, t > .7 ? '#3e7a34' : '#2f6a2e');
      if (t > .15 && ((t * 25) | 0) % 2) { PX(lx, ly + 1, '#244f24'); PX(lx + (Math.cos(a) > 0 ? 1 : 0), ly - 1, '#5a9a44'); }
    }
  }
  R(cx - 2, cy, 5, 3, '#c88a3a'); PX(cx - 1, cy + 3, '#a86a2a');
}
function tree(x, base, h, wdt, r, cols = ['#2f5f2c', '#3e7a36', '#4f8f40', '#24492a']) {
  R(x - 1, base - h * 0.45, 3, h * 0.45, '#5a4430');
  const cx = x, cy = base - h * 0.65;
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = r() * wdt * 0.42;
    const bx = cx + Math.cos(a) * d, by = cy + Math.sin(a) * d * (h / wdt) * 0.55;
    const rr = 3 + r() * 5;
    for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++)
      if (xx * xx + yy * yy <= rr * rr) PX(bx + xx, by + yy, yy < -rr * .3 ? cols[2] : yy > rr * .4 ? cols[3] : cols[1]);
  }
}
function cypress(x, base, h) {
  for (let y = 0; y < h; y++) {
    const t = y / h, hw = Math.max(1, Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95) * 6);
    R(x - hw, base - h + y, hw * 2, 1, '#22452a');
    R(x - hw, base - h + y, Math.max(1, hw * .7), 1, '#2f5a34');
  }
}
function hedge(x, y, w, h) {
  R(x, y + 2, w, h - 2, '#2f5a2c'); R(x + 1, y, w - 2, h, '#2f5a2c'); R(x + 1, y + 1, w - 2, 2, '#4a8040');
  for (let i = x + 2; i < x + w - 2; i += 3) PX(i, y + 3 + (i % 2), '#264a26');
}
function topiary(x, base) {
  R(x, base - 22, 1, 22, '#4a3a28');
  for (const [cy, rr] of [[base - 5, 6], [base - 14, 5], [base - 21, 3]]) {
    for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr - 1; xx <= rr + 1; xx++)
      if (xx * xx * 0.8 + yy * yy <= rr * rr) PX(x + xx, cy + yy, yy < 0 ? '#3c6a34' : '#2a4e28');
  }
}
function lampOrnate(x, base) {
  R(x - 2, base - 6, 5, 6, '#1f2024'); R(x - 1, base - 9, 3, 3, '#2a2b30');
  R(x, base - 46, 1, 40, '#26272c'); PX(x + 1, base - 40, '#3a3b42'); PX(x + 1, base - 28, '#3a3b42');
  R(x - 3, base - 47, 7, 1, '#26272c'); PX(x - 3, base - 48, '#26272c'); PX(x + 3, base - 48, '#26272c');
  R(x - 2, base - 54, 5, 6, '#26272c'); R(x - 1, base - 53, 3, 4, '#f0d890'); R(x - 2, base - 55, 5, 1, '#26272c'); PX(x, base - 56, '#26272c');
  glows.push({ x: x + .5, y: base - 51, r: 18, c: '#ffcf70', th: 0.35, layer: 1, lamp: true });
  glows.push({ x: x + .5, y: base - 2, r: 14, c: '#ffcf70', th: 0.35, layer: 1, pool: true });
}
function lampModern(x, base) {
  R(x, base - 64, 2, 64, '#9aa0a8'); R(x - 2, base - 3, 6, 3, '#6a7078');
  R(x + 2, base - 64, 9, 1, '#9aa0a8'); R(x + 8, base - 63, 5, 2, '#e8eef4');
  glows.push({ x: x + 10, y: base - 61, r: 22, c: '#dfe8ff', th: 0.35, layer: 1, lamp: true });
  glows.push({ x: x + 10, y: base - 2, r: 16, c: '#dfe8ff', th: 0.35, layer: 1, pool: true });
}

function buildWorld() {
  const r = seeded(2026);
  const [bc, bx] = makeCanvas(WORLD_W, H); back = bc;
  const [fc, fx] = makeCanvas(WORLD_W, H); fore = fc;
  g = bx;

  /* ---- ground ---- */
  // sidewalk
  R(0, GROUND, WORLD_W, 13, '#bfb4a2');
  for (let x = 0; x < WORLD_W; x += 8) R(x, GROUND, 1, 13, '#a99e8c');
  R(0, GROUND + 6, WORLD_W, 1, '#aca191');
  R(0, GROUND, WORLD_W, 1, '#8e8476');
  // curb: black & white stripes, a Syrian street classic
  R(0, 153, WORLD_W, 3, '#8d877c');
  for (let x = 0; x < WORLD_W; x += 12) if (x < SOUQ[0] - 20 || x > SOUQ[1] + 20) { R(x, 153, 6, 3, '#e8e4da'); R(x + 6, 153, 6, 3, '#26262a'); }
  // road
  R(0, 156, WORLD_W, 24, '#3a3a40');
  for (let i = 0; i < WORLD_W * 3; i++) PX(r() * WORLD_W, 156 + r() * 24, r() < .5 ? '#434349' : '#323238');
  for (let x = 0; x < WORLD_W; x += 22) R(x, 167, 10, 1, '#d8d4c4');
  R(0, 156, WORLD_W, 1, '#2a2a30');
  // crosswalk at the old clock
  for (let y = 157; y < 180; y += 3) R(262, y, 30, 2, '#e6e2d6');

  /* ---- Zone A: The Old Clock / Shukri al-Quwatli St ---- */
  building(4, 116, 46, { col: '#e3d8c2', gap: 18, balcony: .45 }, r);
  shop(8, 52, { bg: '#2f6a46', fg: '#f4f0e0', ar: 'صيدلية', en: '', awn: null, wall: '#e3d8c2', inside: '#dfe8e4',
    interior: (x, y, w) => { for (let i = 0; i < 4; i++) R(x + 2, y + 3 + i * 6, w - 4, 1, '#9ab0aa'); for (let i = 0; i < 18; i++) R(x + 2 + r() * (w - 6), y + 1 + ((r() * 4) | 0) * 6, 2, 2, pick(r, ['#e05a5a', '#5a8ae0', '#f0f0f0', '#60b080'])); } });
  glows.push({ x: 14, y: 100, r: 10, c: '#40ff90', th: 0.1, layer: 0 }); // pharmacy cross
  R(12, 98, 5, 1, '#40e080'); R(14, 96, 1, 5, '#40e080');
  shop(62, 54, { bg: '#f2ece0', fg: '#2a4a8a', ar: 'مكتبة', en: 'BOOKS', awn: ['#2a4a8a', '#e8e4da'], wall: '#e3d8c2',
    interior: (x, y, w) => { for (let s = 0; s < 3; s++) { R(x + 1, y + 6 + s * 7, w - 2, 1, '#6a4a2a'); for (let i = x + 2; i < x + w - 2; i += 2) R(i, y + 2 + s * 7, 1, 4, pick(r, ['#c04a3a', '#3a6ac0', '#e0c050', '#3a9a6a', '#f0e8d8'])); } } });
  building(124, 78, 64, { col: '#d4c19c', gap: 16, shutters: true }, r);
  R(124, 94, 78, 46, '#cdb994'); rectWin(134, 112, 14, 16, '#8a6a4a', '#33302c', true, r); rectWin(170, 112, 14, 16, '#8a6a4a', '#33302c', true, r);
  R(152, 106, 10, 34, '#6a4a2e'); R(153, 107, 8, 33, '#7d5836'); PX(159, 124, '#e0c070');
  // the big pale curved building (like the one down Shukri al-Quwatli)
  {
    const x = 210, w = 124, top = 38;
    R(x + 4, top, w - 4, 102, '#ece8de'); arch(x, top, 10, 102, '#e2ddd0');
    R(x, top - 3, w, 3, '#cfc8b8');
    for (let fy = top + 6; fy < 94; fy += 11) for (let wx = x + 6; wx < x + w - 6; wx += 7) rectWin(wx, fy, 4, 6, '#d8d2c4', '#3c4654', true, r);
    R(x + 30, top - 10, 64, 8, '#f6f2ea'); R(x + 30, top - 10, 64, 1, '#cfc8b8');
    const t = pixelText('الأتاسي', 10, '#9a3a2a', true); g.drawImage(t, x + 62 - t.width / 2 | 0, top - 12);
    shop(x + 8, 52, { bg: '#8a2a2a', fg: '#f6ecd8', ar: 'ألبسة', en: '', awn: ['#8a2a2a', '#f0e6d4'], wall: '#ece8de',
      interior: (x, y, w) => { for (let i = x + 3; i < x + w - 3; i += 6) { R(i, y + 3, 4, 10, pick(r, ['#c05a7a', '#5a7ac0', '#e0c050', '#f0f0f0', '#3a9a6a'])); R(i + 1, y + 2, 2, 1, '#888'); } } });
    shop(x + 64, 56, { bg: '#e8e0cc', fg: '#3a2a1a', ar: 'ساعات', en: 'WATCH', awn: ['#3a2a1a', '#e8e0cc'], wall: '#ece8de',
      interior: (x, y, w) => { R(x + 2, y + 14, w - 4, 1, '#bba'); for (let i = x + 4; i < x + w - 4; i += 7) { R(i, y + 8, 5, 5, '#d8c890'); PX(i + 2, y + 10, '#333'); } } });
  }
  building(340, 128, 56, { col: '#dccdb0', gap: 17 }, r);
  shop(344, 60, { bg: '#2a5a8a', fg: '#ffffff', ar: 'عصير', en: 'JUICE', awn: ['#e07a2a', '#f6ecd8'], wall: '#dccdb0',
    interior: (x, y, w) => { for (let i = 0; i < 16; i++) { const fx = x + 2 + r() * (w - 6), fy = y + 2 + r() * 8; R(fx, fy, 3, 3, pick(r, ['#f08a2a', '#f0c030', '#e04a4a', '#7ac04a'])); } R(x + 2, y + 16, w - 4, 10, '#c8ccd0'); R(x + 4, y + 12, 6, 6, '#f0a030'); R(x + 14, y + 12, 6, 6, '#e05050'); } });
  shop(406, 60, { bg: '#4a3a2a', fg: '#f2d890', ar: 'فلافل', en: 'FALAFEL', awn: ['#2f7a3e', '#f6ecd8'], wall: '#dccdb0',
    interior: (x, y, w) => { R(x + 2, y + 14, w - 4, 12, '#b8bcc0'); R(x + w - 18, y + 8, 12, 8, '#3a3a3a'); R(x + w - 17, y + 9, 10, 2, '#c08a3a'); for (let i = 0; i < 9; i++) PX(x + 4 + r() * 20, y + 12 + r() * 2, '#7a4a20'); } });
  steam.push({ x: 445, y: 120 });
  palm(205, GROUND, 66, r);
  palm(338, GROUND, 58, r);
  talk.push({ x: 286, id: 'oldclock' }, { x: 436, id: 'falafel' });

  /* ---- Zone B: Al-Dablan Street ---- */
  building(470, 116, 58, { col: '#e8dcc4', gap: 16 }, r);
  MANAKISH = shops.length;
  shop(474, 108, { bg: '#2f6a3a', fg: '#f6ecd8', ar: 'مناقيش', en: 'MANAKISH', awn: ['#2f6a3a', '#f0e6d4'], wall: '#e8dcc4', open: [6, 23],
    interior: (x, y, w) => {
      arch(x + w - 34, y + 4, 28, 22, '#9a4a32'); arch(x + w - 32, y + 6, 24, 20, '#b85a3a');
      arch(x + w - 27, y + 13, 14, 13, '#2a1610'); R(x + w - 25, y + 21, 10, 5, '#ff8a2a'); R(x + w - 23, y + 19, 6, 3, '#ffc860');
      R(x + 2, y + 16, w - 40, 10, '#b8bcc4'); R(x + 2, y + 16, w - 40, 1, '#e8eef4');
      for (let i = 0; i < 6; i++) { const mx = x + 6 + i * 11; R(mx, y + 13, 9, 3, '#c8904a'); R(mx + 1, y + 13, 7, 2, '#5a6a2a'); PX(mx + 3, y + 13, '#7a8a3a'); }
    } });
  glows.push({ x: 474 + 108 - 24, y: 136, r: 16, c: '#ff8a2a', th: 0, layer: 0, flick: 1 });
  steam.push({ x: 474 + 108 - 24, y: 118 });
  building(586, 116, 46, { col: '#ddd2bc', gap: 15, balcony: .5 }, r);
  // Hummus shop, modelled on the real ones: plaster front, rolled-up shutter, blue barrels with trays of chickpeas
  {
    const x = 586, w = 116;
    R(x, 94, w, 46, '#d6c8ae');
    for (let i = 0; i < 60; i++) PX(x + r() * w, 94 + r() * 46, pick(r, ['#c8b89c', '#e0d4bc']));
    R(x + 18, 98, 70, 6, '#8f949a'); for (let k = 98; k < 104; k += 2) R(x + 18, k, 70, 1, '#7a7f86');
    R(x + 18, 104, 70, 36, '#e8e6e0'); R(x + 20, 106, 40, 22, '#2a2a30');
    R(x + 21, 107, 38, 12, '#f0ece4'); sign(x + 22, 107, 36, 11, '#c0302a', '#fff4e0', 'حمص', '');
    const t = pixelText('HUMMUS', 8, '#c0302a'); g.drawImage(t, x + 40 - (t.width >> 1), 99);
    R(x + 21, 120, 38, 7, '#3a2c24'); for (let i = 0; i < 10; i++) PX(x + 23 + r() * 34, 122 + r() * 4, '#e8c890');
    R(x + 22, 121, 12, 5, '#f2ead8'); R(x + 36, 121, 10, 5, '#d8a050');
    R(x + 64, 106, 22, 34, '#2c2c34'); R(x + 66, 108, 18, 32, '#3a3a44');
    shops.push({ x: x + 64, y: 106, w: 22, h: 34, open: [6, 16] });
    glows.push({ x: x + 75, y: 122, r: 20, c: '#ffd890', th: 0.25, layer: 0, shop: shops.length - 1 });
    // wall fan
    R(x + 6, 112, 1, 20, '#3a8a5a'); R(x + 3, 108, 7, 7, '#3a8a5a'); R(x + 4, 109, 5, 5, '#7ac09a'); PX(x + 6, 111, '#3a8a5a'); R(x + 3, 132, 7, 1, '#3a8a5a');
    // barrels + trays
    for (const bxp of [x + 16, x + 44, x + 92]) {
      R(bxp, 124, 14, 16, '#2a6ac8'); R(bxp + 1, 124, 3, 16, '#4a8ae8'); R(bxp, 129, 14, 1, '#1f55a8'); R(bxp, 135, 14, 1, '#1f55a8');
      R(bxp - 4, 122, 22, 2, '#9aa0a8'); R(bxp - 3, 119, 20, 3, '#d8b468'); R(bxp - 1, 117, 16, 2, '#e2c27a');
      for (let i = 0; i < 10; i++) PX(bxp - 2 + r() * 18, 118 + r() * 3, '#b8904a');
    }
    steam.push({ x: x + 74, y: 108 });
    talk.push({ x: x + 50, id: 'hummus', stop: 4.5 });
  }
  building(702, 116, 62, { col: '#e2d4b8', gap: 16 }, r);
  shop(706, 108, { bg: '#f4e2ea', fg: '#a02a5a', ar: 'حلويات', en: 'SWEETS', awn: ['#c84a7a', '#fff0f4'], wall: '#e2d4b8', inside: '#f2e6d8',
    interior: (x, y, w) => {
      R(x + 2, y + 12, w - 4, 14, '#c8d8e0'); R(x + 2, y + 12, w - 4, 1, '#f0f8ff');
      for (let i = 0; i < 4; i++) {
        const tx = x + 5 + i * 25; R(tx, y + 16, 21, 3, '#c0a060');
        if (i % 2 === 0) for (let k = 0; k < 6; k++) { R(tx + 1 + k * 3, y + 14, 2, 2, '#f8f4e8'); PX(tx + 1 + k * 3, y + 14, '#7ab04a'); }
        else for (let k = 0; k < 7; k++) { PX(tx + 1 + k * 3, y + 14, '#d89a3a'); PX(tx + 2 + k * 3, y + 15, '#b87a2a'); PX(tx + 2 + k * 3, y + 14, '#5a9a3a'); }
      }
      for (let i = x + 3; i < x + w - 3; i += 9) { R(i, y + 2, 6, 6, pick(r, ['#e8c060', '#d06090', '#f0e0c0'])); }
    } });
  talk.push({ x: 760, id: 'sweets' });
  building(818, 116, 50, { col: '#d8c8aa', gap: 15 }, r);
  shop(822, 108, { bg: '#3a2418', fg: '#f2d890', ar: 'قهوة', en: 'COFFEE', awn: ['#7a3a22', '#f0e0c4'], wall: '#d8c8aa', inside: '#5a3a26', open: [7, 24],
    interior: (x, y, w) => {
      for (let s = 0; s < 2; s++) { R(x + 2, y + 9 + s * 8, w - 4, 1, '#8a5a36'); for (let i = x + 4; i < x + w - 4; i += 6) { R(i, y + 4 + s * 8, 4, 5, '#c8d0d4'); R(i, y + 6 + s * 8, 4, 2, '#5a3a20'); } }
      R(x + w - 26, y + 18, 20, 8, '#3a2418');
      // dallah (coffee pot)
      const dx = x + 8, dy = y + 19; R(dx, dy, 5, 6, '#d8b048'); R(dx + 1, dy - 2, 3, 2, '#d8b048'); R(dx + 5, dy + 1, 3, 1, '#d8b048'); PX(dx + 7, dy, '#d8b048'); R(dx + 1, dy + 1, 1, 4, '#f0d070');
    } });
  // stools and a tiny table outside the coffee shop
  R(898, 132, 8, 1, '#7a4a2a'); R(899, 133, 1, 7, '#7a4a2a'); R(904, 133, 1, 7, '#7a4a2a');
  R(888, 135, 5, 1, '#3a6a9a'); R(889, 136, 1, 4, '#3a6a9a'); R(892, 136, 1, 4, '#3a6a9a');
  R(900, 129, 3, 3, '#f0f0f0'); PX(901, 129, '#5a3a20');
  steam.push({ x: 901, y: 127 });
  talk.push({ x: 872, id: 'coffee' }, { x: 528, id: 'manakish' });
  building(934, 86, 82, { col: '#e6dcc8', gap: 17, balcony: .6 }, r);
  R(934, 94, 86, 46, '#e0d4bc'); R(948, 104, 18, 36, '#4a6a5a'); R(949, 105, 16, 35, '#5a7a6a'); R(956, 105, 1, 35, '#4a6a5a');
  rectWin(978, 108, 14, 14, '#f0ead8', '#2c3340', true, r);
  tree(1006, GROUND, 60, 34, r);

  /* ---- Zone C: New Clock Square ---- */
  {
    R(1020, 128, 340, 12, '#c9bfae'); for (let x = 1020; x < 1360; x += 10) R(x, 128, 1, 12, '#b5ab9a'); R(1020, 128, 340, 1, '#a99f8e');
    for (const px of [1040, 1100, 1282, 1338]) palm(px, 130, 62 + r() * 12, r);
    for (const tx of [1062, 1130, 1250, 1318]) topiary(tx, 132);
    hedge(1024, 126, 60, 6); hedge(1296, 126, 60, 6);
    for (let i = 0; i < 30; i++) PX(1140 + r() * 100, 124 + r() * 6, pick(r, ['#e86a9a', '#f0a0c0', '#3a6a34']));
    const cx = NEW_CLOCK_X;
    // steps and plinth
    R(cx - 34, 132, 68, 8, '#d8d2c4'); for (let y = 133; y < 140; y += 2) R(cx - 34, y, 68, 1, '#bdb6a6');
    R(cx - 24, 124, 48, 8, '#e4ded0'); R(cx - 24, 124, 48, 1, '#f4f0e6');
    // base block with arched lattice door
    stone(cx - 17, 96, 34, 28, { base: '#e8e2d4', mortar: '#d4ccbc', course: 5, brick: 10 });
    R(cx - 17, 96, 34, 2, '#c8c0b0');
    arch(cx - 8, 104, 16, 20, '#3c3a3e'); arch(cx - 6, 106, 12, 18, '#5a4a38');
    for (let y = 106; y < 124; y++) for (let x = cx - 6; x < cx + 6; x++) if (archInside(x, y, cx - 6, 106, 12, 18) && ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0)) PX(x, y, '#2a241e');
    backLights.push({ x: cx - 5, y: 112, w: 10, h: 11, c: '#ffd890', th: 0.1 });
    // shaft
    stone(cx - 12, 52, 24, 44, { base: '#ece6d8', mortar: '#d8d0c0', course: 5, brick: 12 });
    R(cx - 12, 52, 2, 44, '#3c3a3e'); R(cx + 10, 52, 2, 44, '#3c3a3e');
    R(cx - 3, 58, 6, 34, '#3c3a3e');
    for (let y = 59; y < 91; y++) for (let x = cx - 2; x < cx + 2; x++) if ((x + y) % 3 === 0 || (x - y + 300) % 3 === 0) PX(x, y, '#b8a888');
    backLights.push({ x: cx - 2, y: 59, w: 4, h: 32, c: '#ffe0a0', th: 0.1 });
    R(cx - 14, 92, 28, 4, '#e4ddd0'); R(cx - 14, 95, 28, 1, '#c4bcac');
    // clock head
    R(cx - 15, 48, 30, 4, '#e8e2d4'); R(cx - 15, 51, 30, 1, '#c4bcac');
    R(cx - 14, 22, 28, 26, '#e8e2d4');
    arch(cx - 12, 22, 24, 25, '#3c3a3e');
    R(cx - 16, 18, 32, 4, '#ece6d8'); R(cx - 16, 21, 32, 1, '#c4bcac');
    arch(cx - 8, 9, 16, 9, '#d8d2c4'); arch(cx - 6, 10, 12, 8, '#cfc8b8');
    R(cx, 0, 1, 10, '#6a6a70');
    clocks.push({ x: cx, y: 33, r: 9, layer: 0, lit: true });
    glows.push({ x: cx, y: 124, r: 22, c: '#f0f4ff', th: 0.3, layer: 0 });
    glows.push({ x: cx, y: 33, r: 18, c: '#fff0d0', th: 0.3, layer: 0 });
    talk.push({ x: cx, id: 'newclock' }, { x: cx - 34, id: 'photo', stop: 5.2 });
  }

  /* ---- Zone D: The Covered Souq ---- */
  {
    const [x0, x1] = SOUQ, bay = 36;
    // upper walls: grey stone with arched latticed windows
    stone(x0, 30, x1 - x0, 64, { base: '#8f8d8e', mortar: '#7a787a', course: 5, brick: 11, vary: ['#9a9899', '#858384', '#a3a1a0'], r });
    for (let x = x0 + 4; x < x1 - 20; x += bay) {
      ring(x + 10, 52, 14, 24, 2, '#6a686a', '#b8b4ae', 5);
      R(x + 10, 52 + 7, 14, 17, '#2a5a64');
      arch(x + 10, 52, 14, 24, '#3a7a86');
      for (let y = 52; y < 76; y++) for (let xx = x + 10; xx < x + 24; xx++) if (archInside(xx, y, x + 10, 52, 14, 24) && ((xx + y) % 3 === 0)) PX(xx, y, '#1e3a40');
      R(x + 9, 76, 16, 1, '#6a686a');
      backLights.push({ x: x + 12, y: 62, w: 10, h: 13, c: '#ffd890', th: 0.5 });
    }
    // shops along the bottom
    for (let x = x0 + 2, i = 0; x < x1 - bay; x += bay, i++) {
      R(x, 94, bay - 2, 46, '#55504a');
      R(x - 2, 90, 4, 50, '#9a9692'); R(x - 2, 90, 1, 50, '#aaa6a2');
      const names = [['الصاغة', ''], ['عطارة', ''], ['ألبسة', ''], ['أقمشة', ''], ['حلويات', ''], ['أحذية', ''], ['بهارات', ''], ['ألعاب', ''], ['عطور', ''], ['نحاس', ''], ['كتب', ''], ['ساعات', ''], ['حقائب', ''], ['شرقيات', '']];
      sign(x + 1, 94, bay - 4, 11, '#5a3a28', '#f2dcae', names[i % names.length][0], '', '#3a2418');
      const ox = x + 3, oy = 108, ow = bay - 8, oh = 32;
      arch(ox - 1, oy - 2, ow + 2, oh + 2, '#3a3430');
      arch(ox, oy, ow, oh, '#2e2620');
      const kind = i % 5;
      if (kind === 0) for (let k = 0; k < 8; k++) R(ox + 2 + r() * (ow - 5), oy + 8 + r() * 14, 3, 3, pick(r, ['#f0c040', '#e8e0c0', '#c89a30']));
      else if (kind === 1) for (let k = 0; k < 4; k++) { const sx = ox + 2 + k * 7; R(sx, oy + 24, 6, 8, '#c8b088'); R(sx + 1, oy + 22, 4, 3, pick(r, ['#c84a2a', '#e8a030', '#7a5a2a', '#a0b040', '#e0d050'])); }
      else if (kind === 2) for (let k = ox + 2; k < ox + ow - 3; k += 5) { R(k, oy + 6, 4, 12, pick(r, ['#c05a7a', '#5a7ac0', '#e0c050', '#f0f0f0', '#3a9a6a', '#8a3a3a'])); }
      else if (kind === 3) for (let k = 0; k < 5; k++) R(ox + 2, oy + 10 + k * 4, ow - 4, 3, pick(r, ['#8a2a3a', '#2a5a8a', '#c8a040', '#3a7a5a', '#e0d8c8']));
      else for (let k = 0; k < 6; k++) { R(ox + 3 + (k % 3) * 8, oy + 12 + ((k / 3) | 0) * 9, 5, 5, '#c88a3a'); PX(ox + 4 + (k % 3) * 8, oy + 12 + ((k / 3) | 0) * 9, '#f0c070'); }
      backLights.push({ x: ox + 1, y: oy + 4, w: ow - 2, h: oh - 4, c: '#ffcf8a', th: 0.0, souq: true });
      if (i % 3 === 1) { R(ox + ow + 1, 126, 8, 14, pick(r, ['#c8b088', '#8a6a4a'])); R(ox + ow + 1, 124, 8, 2, pick(r, ['#c84a2a', '#e8a030', '#a0b040'])); }
    }
    // vaulted roof: red arches + turquoise lattice; sky peeks through
    R(x0, 4, x1 - x0, 26, '#3c8f98');
    for (let y = 6; y < 28; y++) for (let x = x0; x < x1; x++) {
      if ((x % 4 === 1 || x % 4 === 2) && (y % 4 === 1 || y % 4 === 2)) g.clearRect(x, y, 1, 1);
      else if ((x + y) % 7 === 0) PX(x, y, '#5ab0b8');
    }
    R(x0, 4, x1 - x0, 2, '#8a3a2e'); R(x0, 28, x1 - x0, 3, '#8a3a2e'); R(x0, 30, x1 - x0, 1, '#5a2a22');
    for (let x = x0 + bay / 2; x < x1; x += bay) { R(x - 2, 4, 4, 27, '#a3483a'); R(x - 2, 4, 1, 27, '#c05a48'); R(x - 2, 31, 4, 3, '#7a7676'); }
    // bunting, swaying gently in the prerender
    const bunt = ['#e04a4a', '#f0c030', '#3a9a6a', '#4a8ae0', '#e070a0', '#f08a2a', '#7ad0d0'];
    for (const by of [40, 50]) for (let x = x0; x < x1; x += 1) {
      const sag = Math.sin(((x - x0) % bay) / bay * Math.PI) * 4;
      PX(x, by + sag, '#5a5050');
      if ((x - x0) % 6 === 1) { const c = bunt[((x - x0) / 6 + by) % bunt.length | 0]; R(x, by + sag + 1, 3, 2, c); PX(x + 1, by + sag + 3, c); }
    }
    // hanging lanterns
    for (let x = x0 + bay; x < x1 - 10; x += bay) {
      R(x, 31, 1, 26, '#2a2a2a');
      R(x - 3, 57, 7, 1, '#2a2a2a'); R(x - 2, 58, 5, 7, '#2a2a2a'); R(x - 1, 59, 3, 5, '#ffe4a0'); R(x - 1, 65, 3, 1, '#2a2a2a');
      glows.push({ x: x + .5, y: 61, r: 16, c: '#ffcf80', th: -1, layer: 0, souq: true });
    }
    // gates
    for (const gx of [x0 - 8, x1 - 8]) {
      stone(gx, 0, 16, 140, { base: '#a8a29a', mortar: '#8a847c', course: 6, brick: 8 });
      R(gx, 0, 16, 2, '#6a6460');
    }
    const t = pixelText('سوق حمص', 10, '#2a2420', true); R(x0 + 14, 34, t.width + 6, 13, '#e8d8b8'); g.drawImage(t, x0 + 17, 34);
    talk.push({ x: 1630, id: 'souq' });
    // cobbles instead of road inside the souq
    R(x0 - 8, 153, x1 - x0 + 16, 27, '#6a6460');
    for (let y = 154; y < 180; y += 4) for (let x = x0 - 8 + ((y >> 2) % 2) * 3; x < x1 + 8; x += 6) { R(x, y, 5, 3, '#77716a'); PX(x, y, '#857f78'); }
  }

  /* ---- Zone E: Old Homs (basalt, cream arches, striped windows) ---- */
  {
    const x0 = 1905, x1 = 2368;
    // the old arcade wall with big cream arches (left part)
    stone(x0, 44, 190, 96, { base: '#4a4a50', mortar: '#3a3a40', course: 4, brick: 7, vary: ['#55555c', '#404046', '#5c5a5c', '#4e4c50'], r });
    for (let i = 0; i < 4; i++) {
      const ax = x0 + 4 + i * 46;
      ring(ax + 4, 58, 34, 82, 5, '#e8dcc4', '#dccfb4', 1);
      R(ax + 1, 64, 5, 76, '#8a8a8e'); R(ax + 2, 64, 2, 76, '#a6a6aa'); R(ax, 62, 7, 3, '#e8dcc4'); R(ax, 137, 7, 3, '#bdb3a0');
    }
    R(x0 + 188, 64, 5, 76, '#8a8a8e'); R(x0 + 189, 64, 2, 76, '#a6a6aa'); R(x0 + 187, 62, 7, 3, '#e8dcc4');
    R(x0, 40, 192, 4, '#cfc3aa'); R(x0, 43, 192, 1, '#9a907e');
    // carved wooden door with fan window
    ring(x0 + 16, 92, 20, 48, 3, '#3a3a40', '#5a5a60', 4);
    arch(x0 + 16, 92, 20, 12, '#2c3036'); for (let a = 0; a < 5; a++) R(x0 + 18 + a * 4, 95, 1, 7, '#6a4428');
    R(x0 + 16, 104, 20, 36, '#6a3e22'); R(x0 + 26, 104, 1, 36, '#4a2a16');
    for (let y = 108; y < 138; y += 5) { R(x0 + 18, y, 6, 3, '#7c4c2a'); R(x0 + 28, y, 6, 3, '#7c4c2a'); }
    PX(x0 + 24, 122, '#d8b048'); PX(x0 + 28, 122, '#d8b048');
    // fan-lit arched window and a smaller door
    ring(x0 + 64, 86, 18, 20, 2, '#3a3a40', '#5a5a60', 4);
    arch(x0 + 64, 86, 18, 20, '#2c3036'); for (let a = 0; a < 4; a++) R(x0 + 67 + a * 4, 88, 1, 18, '#6a4428');
    backLights.push({ x: x0 + 65, y: 96, w: 16, h: 9, c: '#ffd890', th: 0.4 });
    ring(x0 + 114, 104, 14, 36, 2, '#3a3a40', '#5a5a60', 4); arch(x0 + 114, 104, 14, 36, '#3a2418'); R(x0 + 114, 112, 14, 28, '#5a3420');
    R(x0 + 115, 113, 12, 26, '#6a3e22'); for (let y = 115; y < 138; y += 4) R(x0 + 117, y, 8, 2, '#7c4c2a');
    // bell tower behind (tan stone, domed top)
    stone(x0 + 120, 4, 22, 36, { base: '#b8925a', mortar: '#9a7848', course: 3, brick: 5 });
    R(x0 + 118, 2, 26, 3, '#e6dcc4'); arch(x0 + 122, -6, 18, 9, '#e6dcc4');
    for (const k of [0, 1, 2]) { arch(x0 + 123 + k * 6, 8, 4, 10, '#2a2420'); }
    R(x0 + 120, 20, 22, 2, '#e6dcc4');
    // the newer house with striped (ablaq) arched windows
    const hx = x0 + 196, hw = 170;
    stone(hx, 52, hw, 88, { base: '#5a5c64', mortar: '#4a4c54', course: 4, brick: 9, vary: ['#62646c', '#53555c', '#6a6c72'], r });
    R(hx - 1, 48, hw + 2, 4, '#e8dcc4'); R(hx - 1, 51, hw + 2, 1, '#b0a690');
    for (let i = 0; i < 5; i++) {
      const wx = hx + 10 + i * 32;
      ring(wx, 62, 14, 22, 3, '#3c3e44', '#ece4d2', 4);
      arch(wx, 62, 14, 22, '#6a3e22'); R(wx + 2, 69, 10, 13, '#2c3036'); R(wx + 6, 69, 1, 13, '#6a3e22'); R(wx + 2, 75, 10, 1, '#6a3e22');
      R(wx - 4, 85, 22, 2, '#cfc4ae');
      backLights.push({ x: wx + 2, y: 69, w: 10, h: 13, c: pick(r, WARM), th: r() });
      if (i === 2) {
        R(wx - 2, 104, 18, 36, '#e8dcc4'); arch(wx, 106, 14, 34, '#6a3e22'); R(wx + 2, 114, 10, 26, '#3a2418'); R(wx + 7, 114, 1, 26, '#6a3e22');
        for (let a = 0; a < 3; a++) R(wx + 3 + a * 4, 108, 1, 6, '#e8dcc4');
      } else {
        ring(wx, 102, 14, 24, 3, '#3c3e44', '#ece4d2', 4);
        arch(wx, 102, 14, 24, '#2c3036');
        for (let k = wx + 2; k < wx + 14; k += 3) R(k, 104, 1, 22, '#3a3a40');
        R(wx - 4, 127, 22, 2, '#cfc4ae');
        backLights.push({ x: wx + 1, y: 110, w: 12, h: 15, c: pick(r, WARM), th: r() });
      }
      // wall lanterns
      if (i < 4) { const lx = wx + 23; R(lx - 1, 92, 4, 1, '#1d1d20'); R(lx - 2, 93, 5, 6, '#1d1d20'); R(lx - 1, 94, 3, 4, '#ffe0a0'); glows.push({ x: lx + .5, y: 96, r: 14, c: '#ffd080', th: 0.3, layer: 0 }); }
    }
    // jasmine over the wall top, potted plants in old tins, a white plastic chair, a bicycle
    for (let i = 0; i < 70; i++) { const jx = hx + 120 + r() * 50, jy = 44 + r() * 14; PX(jx, jy, r() < .3 ? '#ffffff' : pick(r, ['#2f5a2c', '#3e7a36'])); }
    for (let i = 0; i < 40; i++) { const jx = hx + 2 + r() * 20, jy = 48 + r() * 24; PX(jx, jy, r() < .35 ? '#e04a9a' : pick(r, ['#2f5a2c', '#3e7a36'])); }
    for (const px of [hx + 30, hx + 36, hx + 140]) { R(px, 134, 5, 6, '#b8bcc0'); R(px, 135, 5, 1, '#d84a3a'); R(px - 1, 129, 7, 5, '#3e7a36'); PX(px + 2, 128, '#e04a6a'); }
    R(x0 + 50, 128, 1, 12, '#f2f2ee'); R(x0 + 56, 128, 1, 12, '#f2f2ee'); R(x0 + 50, 132, 7, 2, '#f2f2ee'); R(x0 + 50, 122, 7, 6, '#f2f2ee'); R(x0 + 51, 123, 5, 4, '#e0e0dc');
    for (const wx of [x0 + 86, x0 + 100]) { for (let a = 0; a < 16; a++) { const an = a / 16 * Math.PI * 2; PX(wx + Math.cos(an) * 5, 134 + Math.sin(an) * 5, '#2a2a2e'); } }
    R(x0 + 88, 129, 12, 1, '#2a2a2e'); R(x0 + 92, 126, 1, 8, '#2a2a2e'); R(x0 + 89, 126, 6, 1, '#2a2a2e'); R(x0 + 98, 127, 1, 6, '#2a2a2e'); R(x0 + 97, 126, 3, 1, '#2a2a2e'); R(x0 + 86, 131, 6, 3, '#6a4a2a');
    // lemon tree peeking out
    tree(x1 - 18, 54, 34, 30, r, ['#2f5f2c', '#3e7a36', '#4f8f40', '#24492a']);
    for (let i = 0; i < 12; i++) PX(x1 - 30 + r() * 24, 24 + r() * 18, '#f0d040');
    talk.push({ x: 2000, id: 'oldhoms' });
  }

  /* ---- Zone F: Khalid ibn al-Walid Mosque ---- */
  {
    const x0 = 2470, w = 236, top = 86, base = 134;
    // lawn and garden
    R(2372, 128, WORLD_W - 2372, 12, '#5a8a3e'); for (let i = 0; i < 400; i++) PX(2372 + r() * (WORLD_W - 2372), 128 + r() * 12, pick(r, ['#4a7a34', '#6a9a4a', '#3e6a2e']));
    for (const cx of [2390, 2416, 2740, 2770, 2880]) cypress(cx, 132, 46 + r() * 16);
    palm(2448, 132, 70, r); palm(2812, 132, 64, r);
    // minarets (the far one first)
    const minaret = (mx, tip, shade) => {
      const c = shade ? '#d6c8a2' : '#e8dcb8', c2 = shade ? '#bfb08a' : '#d2c49e';
      R(mx - 5, tip + 52, 11, base - tip - 52, c); R(mx + 4, tip + 52, 2, base - tip - 52, c2);
      for (let y = tip + 56; y < base; y += 4) R(mx - 5, y, 11, 1, c2);
      R(mx - 7, tip + 44, 15, 3, c); R(mx - 6, tip + 47, 13, 2, c2); for (let k = mx - 6; k < mx + 7; k += 2) PX(k, tip + 49, c2);
      R(mx - 7, tip + 42, 15, 2, '#5a5a60'); for (let k = mx - 7; k < mx + 8; k += 2) PX(k, tip + 41, '#5a5a60');
      R(mx - 4, tip + 22, 9, 20, c); R(mx + 3, tip + 22, 2, 20, c2); R(mx - 2, tip + 26, 2, 6, '#3a3a40'); R(mx + 1, tip + 26, 2, 6, '#3a3a40');
      R(mx - 5, tip + 20, 11, 2, c); R(mx - 5, tip + 19, 11, 1, '#5a5a60');
      for (let y = 0; y < 18; y++) { const hw = Math.max(0, Math.round((y / 18) * 4.5)); R(mx - hw, tip + 2 + y, hw * 2 + 1, 1, y % 3 ? '#b8bec8' : '#9aa0aa'); }
      R(mx, tip - 3, 1, 5, '#c8a040'); PX(mx - 1, tip - 4, '#c8a040'); PX(mx + 1, tip - 5, '#c8a040');
      glows.push({ x: mx + .5, y: tip + 43, r: 10, c: '#60ff90', th: 0.3, layer: 0 });
      glows.push({ x: mx + .5, y: tip + 20, r: 8, c: '#60ff90', th: 0.3, layer: 0 });
    };
    minaret(x0 + 26, 14, true);
    // body
    stone(x0, top, w, base - top, { base: '#686468', mortar: '#7e7a7a', course: 3, brick: 9, vary: ['#706c70', '#5e5a5e', '#747074'], ablaq: '#a8a4a0', band: 4, r });
    for (let px = x0; px <= x0 + w - 6; px += 47) { R(px, top, 6, base - top, '#e0d4b4'); R(px + 5, top, 1, base - top, '#c4b898'); for (let y = top + 3; y < base; y += 6) R(px, y, 6, 1, '#cfc3a3'); }
    R(x0 - 2, top - 5, w + 4, 5, '#e8dcbc'); R(x0 - 2, top - 1, w + 4, 1, '#bcb092'); for (let k = x0; k < x0 + w; k += 3) PX(k, top - 3, '#c4b898');
    for (let b = 0; b < 5; b++) {
      const bx = x0 + 6 + b * 47;
      for (const row of [94, 112]) for (const k of [0, 1]) {
        const wx = bx + 9 + k * 17, wy = row;
        R(wx - 1, wy - 1, 9, 14, '#f4efe4'); R(wx, wy, 7, 12, '#2e3440'); R(wx + 3, wy, 1, 12, '#f4efe4'); R(wx, wy + 5, 7, 1, '#f4efe4');
        backLights.push({ x: wx, y: wy, w: 7, h: 12, c: '#fff0c8', th: 0.15 });
      }
    }
    // entrance
    R(x0 + 104, 104, 28, 30, '#e8dcbc'); arch(x0 + 108, 106, 20, 28, '#2a2a30'); arch(x0 + 110, 108, 16, 26, '#6a4a2e'); R(x0 + 117, 112, 1, 22, '#4a3018');
    backLights.push({ x: x0 + 111, y: 116, w: 14, h: 17, c: '#ffe8b0', th: 0.1 });
    R(x0 + 100, 134, 36, 2, '#d8d0c0'); R(x0 + 96, 136, 44, 2, '#cac2b2');
    // side domes on drums
    const dome = (cx, dy, rr, drumW, drumH) => {
      stone(cx - drumW / 2, dy, drumW, drumH, { base: '#6a666a', mortar: '#7e7a7a', course: 3, brick: 7, ablaq: '#a8a4a0', band: 3, r });
      R(cx - drumW / 2 - 1, dy - 2, drumW + 2, 2, '#e0d4b4');
      for (let k = cx - drumW / 2 + 4; k < cx + drumW / 2 - 4; k += 7) { R(k, dy + 3, 3, drumH - 5, '#2e3440'); backLights.push({ x: k, y: dy + 3, w: 3, h: drumH - 5, c: '#fff0c8', th: 0.2 }); }
      for (let yy = 0; yy <= rr; yy++) {
        const hw = Math.round(Math.sqrt(rr * rr - (rr - yy) * (rr - yy)) * 1.02);
        for (let xx = -hw; xx <= hw; xx++) {
          const t = (xx + hw) / (2 * hw + 1);
          PX(cx + xx, dy - 2 - rr + yy, t < .22 ? '#eef2f6' : t < .55 ? '#ccd2da' : t < .82 ? '#aab2bc' : '#8e96a2');
        }
      }
      R(cx, dy - 2 - rr - 5, 1, 5, '#c8a040'); R(cx - 1, dy - 2 - rr - 3, 3, 2, '#c8a040'); PX(cx + 1, dy - 2 - rr - 7, '#c8a040'); PX(cx - 1, dy - 2 - rr - 7, '#c8a040'); PX(cx, dy - 2 - rr - 8, '#c8a040');
    };
    dome(x0 + 40, 70, 15, 34, 12);
    dome(x0 + 196, 70, 15, 34, 12);
    stone(x0 + 74, 66, 88, 16, { base: '#686468', mortar: '#7e7a7a', course: 3, brick: 9, ablaq: '#a8a4a0', band: 3, r });
    R(x0 + 72, 64, 92, 3, '#e0d4b4');
    dome(x0 + 118, 54, 30, 64, 10);
    minaret(x0 + 6, 2, false);
    glows.push({ x: x0 + 118, y: 40, r: 26, c: '#c8d4ff', th: 0.3, layer: 0 });
    talk.push({ x: x0 + 118, id: 'mosque' });
    // little iron fence
    for (let x = 2372; x < WORLD_W; x += 4) R(x, 133, 1, 7, '#2a2a2e');
    R(2372, 133, WORLD_W - 2372, 1, '#2a2a2e');
  }

  /* ---- foreground layer: things in front of the walker ---- */
  g = fx;
  // the Old Clock: cast-iron post with a double face
  {
    const cx = 286, base = 154;
    hedge(cx - 18, base - 7, 36, 7);
    R(cx - 4, base - 18, 9, 12, '#1f2024'); R(cx - 3, base - 17, 1, 10, '#3a3b42'); R(cx - 5, base - 19, 11, 2, '#2a2b30');
    R(cx - 1, base - 62, 3, 44, '#26272c'); R(cx, base - 60, 1, 40, '#3a3b42');
    for (const y of [base - 30, base - 44, base - 56]) R(cx - 2, y, 5, 2, '#2a2b30');
    for (const s of [-1, 1]) { PX(cx + s * 3, base - 64, '#26272c'); PX(cx + s * 4, base - 65, '#26272c'); PX(cx + s * 4, base - 66, '#26272c'); PX(cx + s * 3, base - 67, '#26272c'); PX(cx + s * 2, base - 66, '#26272c'); }
    R(cx - 15, base - 84, 30, 17, '#1f2024');
    for (let a = 0; a < 2; a++) { const fx2 = cx - 7 + a * 14; for (let yy = -8; yy <= 8; yy++) for (let xx = -8; xx <= 8; xx++) if (xx * xx + yy * yy <= 64) PX(fx2 + xx, base - 76 + yy, '#1f2024'); }
    R(cx - 1, base - 90, 3, 4, '#1f2024'); PX(cx, base - 92, '#1f2024');
    clocks.push({ x: cx - 7, y: base - 76, r: 6, layer: 1 });
    clocks.push({ x: cx + 7, y: base - 76, r: 6, layer: 1 });
    // the green "dear citizen" crosswalk sign
    const sx = 312;
    const t1 = pixelText('أخي المواطن', 9, '#ffffff', true), t2 = pixelText('ممر المشاة', 9, '#ffffff', true);
    const sw = Math.max(t1.width, t2.width) + 6, sh = t1.height + t2.height;
    R(sx + 3, base - 50, 1, 50, '#8a8f96'); R(sx + sw - 4, base - 50, 1, 50, '#8a8f96');
    R(sx, base - 52 - sh, sw, sh + 2, '#f0f0f0'); R(sx + 1, base - 51 - sh, sw - 2, sh, '#1f5a3a');
    g.drawImage(t1, sx + (sw - t1.width >> 1), base - 52 - sh); g.drawImage(t2, sx + (sw - t2.width >> 1), base - 52 - t2.height);
  }
  for (const lx of [40, 160, 420, 560, 680, 800, 930, 1960, 2080, 2200, 2320, 2440, 2600, 2760, 2890]) lampOrnate(lx, 154);
  for (const lx of [1050, 1124, 1240, 1330]) lampModern(lx, 154);
  topiary(1110, 154); topiary(1270, 154);
  hedge(2380, 147, 40, 7); hedge(2850, 147, 50, 7);
  // souq: front pillars, stalls at the bottom edge
  {
    const [x0, x1] = SOUQ;
    for (const gx of [x0 - 12, x1 - 10]) { stone(gx, 0, 22, 180, { base: '#9c968e', mortar: '#7e7870', course: 6, brick: 11 }); R(gx + 21, 0, 1, 180, '#6a645c'); }
    for (let x = x0 + 60; x < x1 - 20; x += 108) { R(x, 0, 6, 180, '#7a3a2e'); R(x, 0, 2, 180, '#9a4a3a'); R(x - 2, 150, 10, 30, '#8a847c'); }
    const crates = ['#c84a2a', '#e8a030', '#7a5a2a', '#a0b040', '#e0d050', '#f08a2a', '#e04a4a'];
    for (let x = x0 + 18; x < x1 - 24; x += 42 + (r() * 30 | 0)) {
      R(x, 166, 26, 14, '#8a6a42'); R(x, 166, 26, 1, '#a88a5a'); R(x + 12, 166, 1, 14, '#6a4a2a');
      for (let k = 0; k < 2; k++) { const c = pick(r, crates); for (let yy = 0; yy < 5; yy++) R(x + 1 + k * 13 + yy, 161 + yy, 11 - yy * 2, 1, c); R(x + 2 + k * 13, 165, 10, 1, mulHex(c, .8)); }
    }
  }

  /* ---- spots for critters & puddles ---- */
  for (let x = 30; x < WORLD_W; x += 70 + r() * 90) if (x < SOUQ[0] - 20 || x > SOUQ[1] + 20) puddles.push({ x: x | 0, w: 14 + (r() * 14 | 0) });
}

function buildMid() {
  const r = seeded(77);
  const [tile, x] = makeCanvas(MID_P, H); g = x;
  const base = 128;
  // the citadel mound with the transmission towers ("Homs tower")
  const tx = 560;
  for (let i = -110; i <= 110; i++) {
    const t = i / 110, hgt = Math.round(48 * Math.pow(Math.cos(t * Math.PI / 2), 0.55) + (r() * 2 | 0));
    R(tx + i, base - hgt, 1, hgt, i < -60 ? '#a8946a' : '#9a8860');
    for (let k = 0; k < hgt; k += 3) if (r() < .3) PX(tx + i, base - hgt + k, pick(r, ['#b8a478', '#8a7a52', '#7a8a52']));
    R(tx + i, base - hgt, 1, 3, '#6a8a4a');
  }
  for (let i = 0; i < 9; i++) { const ox = tx - 80 + r() * 160 | 0; const hh = 6 + r() * 6 | 0; R(ox, base - 48 - hh + 4, 5, hh, '#3e6a3a'); R(ox + 1, base - 50 - hh + 4, 3, 2, '#4e7a44'); }
  R(tx - 100, base - 14, 30, 2, '#c8bca0'); R(tx + 60, base - 22, 40, 2, '#c8bca0');
  const lattice = (lx, ly, hh, red) => {
    for (let y = 0; y < hh; y++) {
      const hw = Math.max(1, Math.round((y / hh) * 6));
      const col = red && ((y / 7) | 0) % 2 ? '#d84a3a' : red ? '#f0ece4' : '#9aa0a8';
      PX(lx - hw, ly + y, col); PX(lx + hw, ly + y, col);
      if (y % 4 === 0) R(lx - hw, ly + y, hw * 2 + 1, 1, col);
      if (y % 4 === 2) PX(lx, ly + y, col);
    }
    R(lx, ly - 8, 1, 8, red ? '#d84a3a' : '#9aa0a8');
    midLights.push({ x: lx + .5, y: ly - 8, blink: true });
  };
  lattice(tx + 4, base - 48 - 82, 82, true);
  lattice(tx - 26, base - 48 - 62, 62, false);
  // apartment blocks
  let x0 = 0;
  while (x0 < MID_P - 14) {
    const w = Math.min(22 + (r() * 36 | 0), MID_P - x0), h = 26 + (r() * 46 | 0);
    if (Math.abs(x0 + w / 2 - tx) < 120 && r() < .7) { x0 += w - 6; continue; }
    const col = pick(r, ['#d8ccb0', '#cfc2a4', '#e2d8c2', '#c4b898', '#d2c8b4', '#bfb196']);
    R(x0, base - h, w, h + 52, col); R(x0 + w - 2, base - h, 2, h + 52, mulHex(col, .86)); R(x0, base - h - 1, w, 1, mulHex(col, .78));
    for (let fy = base - h + 4; fy < base + 40; fy += 7) for (let wx = x0 + 3; wx < x0 + w - 4; wx += 5) {
      R(wx, fy, 2, 3, '#4a505c');
      midLights.push({ x: wx, y: fy, w: 2, h: 3, th: r() });
    }
    for (let i = x0 + 2; i < x0 + w - 4; i += 6 + (r() * 8 | 0)) {
      const t = r();
      if (t < .35) R(i, base - h - 4, 3, 4, t < .2 ? '#2a2a30' : '#e8e8ea');
      else if (t < .55) { R(i, base - h - 3, 3, 2, '#d8d8d8'); PX(i + 1, base - h - 1, '#888'); }
      else if (t < .65) R(i, base - h - 9, 1, 9, '#666');
    }
    x0 += w + (r() < .3 ? (r() * 6 | 0) : -2);
  }
  // repeat the tile so the skyline loops with the street
  const [c, cx2] = makeCanvas(MID_P + MAX_W, H);
  cx2.drawImage(tile, 0, 0); cx2.drawImage(tile, MID_P, 0);
  mid = c;
}

function buildFar() {
  const r = seeded(31);
  // periodic heightmaps: blend f(x) into f(x - P) so the right edge meets the left edge
  const periodic = (f, P) => x => { const t = x / P; return f(x) * (1 - t) + f(x - P) * t; };
  const fA = periodic(x => 96 - 16 * Math.sin(x * 0.011 + 1) - 9 * Math.sin(x * 0.031) - 4 * Math.sin(x * 0.09 + 2), FAR_A_P);
  const fB = periodic(x => 118 - 6 * Math.sin(x * 0.02 + 3) - 3 * Math.sin(x * 0.07), FAR_B_P);
  const mk = (P, draw) => {
    const [tile, tx] = makeCanvas(P, H); tx.fillStyle = '#fff'; draw(tx);
    const [c, x] = makeCanvas(P + MAX_W, H);
    x.drawImage(tile, 0, 0); x.drawImage(tile, P, 0);
    return c;
  };
  const jit = Array.from({ length: FAR_A_P }, () => r() * 1.5);
  farA = mk(FAR_A_P, ax => { for (let x = 0; x < FAR_A_P; x++) ax.fillRect(x, (fA(x) - jit[x]) | 0, 1, H); });
  farSnow = mk(FAR_A_P, sx => { for (let x = 0; x < FAR_A_P; x++) { const h = fA(x) - jit[x]; if (h < 86) sx.fillRect(x, h | 0, 1, Math.round((86 - h) * 0.7) + 1); } });
  farB = mk(FAR_B_P, bx => {
    for (let x = 0; x < FAR_B_P; x++) bx.fillRect(x, fB(x) | 0, 1, H);
    // Krak des Chevaliers on its hill, far to the west
    const kx = FAR_B_P - 150;
    for (let i = -40; i <= 40; i++) bx.fillRect(kx + i, Math.round(104 + (i * i) / 120), 1, H);
    bx.fillRect(kx - 14, 92, 28, 14);
    for (const t of [-14, -4, 8, 13]) bx.fillRect(kx + t, 88 - (t === -4 ? 3 : 0), 4, 10);
    for (let i = -14; i < 16; i += 2) bx.fillRect(kx + i, 91, 1, 1);
  });
}

/* ===================================================================
   Sky
   =================================================================== */
const SKY_KEYS = [
  // sun altitude, top, mid, horizon, multiply tint
  [-18, '#070b1f', '#0f1636', '#1c2449', '#3a4076'],
  [-10, '#0c1335', '#1b2358', '#36356c', '#4e5290'],
  [-5, '#1b2262', '#4a3b80', '#b4627a', '#8270a6'],
  [-1, '#2c3782', '#8b5694', '#f29068', '#d89a8c'],
  [3, '#3b63b2', '#c890a2', '#ffc387', '#f6c9a6'],
  [9, '#4a88d2', '#89bde7', '#f3dfb6', '#fbead6'],
  [22, '#3e87df', '#7ab9ef', '#cfe5f3', '#ffffff'],
  [91, '#3e87df', '#7ab9ef', '#cfe5f3', '#ffffff'],
].map(k => [k[0], ...k.slice(1).map(hexRGB)]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
let skyCan, skyCtx, farAC, farBC, cloudCans = [], skySig = '', pal = null;
const clouds = [];
function skyPalette(alt, wx) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && alt > SKY_KEYS[i + 1][0]) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], t = clamp((alt - a[0]) / (b[0] - a[0]), 0, 1);
  let [top, midc, hor, tint] = [1, 2, 3, 4].map(k => mixC(a[k], b[k], t));
  const desat = clamp((wx.cloud - 0.45) * 1.4, 0, 0.85) + wx.fog * 0.5 + wx.snow * 0.2;
  const dark = 1 - 0.28 * wx.rain - 0.12 * wx.storm;
  const f = c => mulC(mixC(c, mulC(greyC(c), 1.04), clamp(desat, 0, .9)), dark);
  top = f(top); midc = f(midc); hor = f(hor); tint = mulC(mixC(tint, greyC(tint), desat * 0.6), 1 - 0.18 * wx.rain - 0.08 * clamp(wx.cloud - .5, 0, 1));
  if (wx.dust) { const d = [222, 182, 128]; hor = mixC(hor, d, wx.dust * .55); midc = mixC(midc, d, wx.dust * .35); top = mixC(top, mulC(d, .9), wx.dust * .2); tint = mixC(tint, [255, 226, 186], wx.dust * .6); }
  return { top, mid: midc, hor, tint };
}
function skyColorAt(p, t) { return t < .55 ? mixC(p.top, p.mid, t / .55) : mixC(p.mid, p.hor, (t - .55) / .45); }
function refreshSky(p) {
  const sig = [p.top, p.mid, p.hor, p.tint].map(c => c.map(v => v >> 2).join()).join('|') + W;
  if (sig === skySig) return;
  skySig = sig;
  if (!skyCan || skyCan.width !== W) [skyCan, skyCtx] = makeCanvas(W, H);
  const id = skyCtx.createImageData(W, H), d = id.data, BANDS = 16;
  const rows = [];
  for (let k = 0; k <= BANDS; k++) rows.push(skyColorAt(p, k / BANDS));
  for (let y = 0; y < H; y++) {
    const tt = clamp(y / 135, 0, 1) * BANDS, bi = Math.floor(tt), fr = tt - bi;
    for (let x = 0; x < W; x++) {
      const c = rows[Math.min(BANDS, bi + (fr > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
      const o = (y * W + x) * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  skyCtx.putImageData(id, 0, 0);
  // far layers tinted towards the horizon (aerial perspective)
  const tintMask = (src, col, can) => {
    if (!can || can.width !== src.width) can = makeCanvas(src.width, src.height)[0];
    const x = can.getContext('2d'); x.clearRect(0, 0, can.width, can.height);
    x.globalCompositeOperation = 'source-over'; x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = rgba(col); x.fillRect(0, 0, can.width, can.height);
    x.globalCompositeOperation = 'source-over';
    return can;
  };
  farAC = tintMask(farA, mixC(p.hor, p.mid, .45), farAC);
  if (S.winter) {
    const snowC = tintMask(farSnow, mixC([250, 250, 255], p.hor, .35));
    const fx = farAC.getContext('2d');
    fx.globalCompositeOperation = 'source-atop'; fx.drawImage(snowC, 0, 0); fx.globalCompositeOperation = 'source-over';
  }
  farBC = tintMask(farB, mulC(mixC(p.hor, p.top, .5), .8), farBC);
  const lc = mixC(mixC([255, 255, 255], p.hor, .35), p.tint, .5), sc = mixC(mulC(lc, .8), p.mid, .35);
  cloudCans = clouds.map(cl => {
    const [c, x] = makeCanvas(cl.w, cl.h), id2 = x.createImageData(cl.w, cl.h);
    cl.grid.forEach((v, i) => { if (!v) return; const cc = v === 2 ? sc : lc; id2.data.set([cc[0], cc[1], cc[2], 255], i * 4); });
    x.putImageData(id2, 0, 0);
    return c;
  });
}
function makeClouds() {
  const r = seeded(5);
  for (let n = 0; n < 18; n++) {
    const w = 26 + (r() * 46 | 0), h = 10 + (r() * 9 | 0), grid = new Uint8Array(w * h);
    const blobs = 3 + (r() * 4 | 0);
    for (let b = 0; b < blobs; b++) {
      const bx = 6 + r() * (w - 12), rr = 3 + r() * (h * .5), by = h - rr - 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - bx) ** 2 * .7 + (y - by) ** 2 <= rr * rr) grid[y * w + x] = 1;
    }
    for (let x = 0; x < w; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < h; y++) if (grid[y * w + x]) { if (top < 0) top = y; bot = y; }
      if (top >= 0) for (let y = top; y <= bot; y++) if (grid[y * w + x] && y > top + (bot - top) * .55) grid[y * w + x] = 2;
    }
    clouds.push({ w, h, grid, x: r() * 900, y: 6 + r() * 64, sp: .4 + r() * .8 });
  }
}

/* ===================================================================
   State
   =================================================================== */
const S = {
  ms: Date.now(), parts: null, a: null, wx: wxState('clear'), night: 0, winter: false, hijriMonth: 0,
  previewMins: null, previewWx: null, t: 0,
};
const pl = { x: 120, dir: 1, phase: 0, speed: 0, idle: 0, auto: true, manualT: 0, wait: 0, lap: 0, photoT: -1, snapped: false };
const cam = { x: 60 };
const keys = { l: false, r: false, run: false };
let touchDir = 0;
let npcs = [], cars = [], drops = [], flakes = [], birds = [], pigeons = [], cats = [], puffs = [];
let camFlash = 0, flash = 0, nextBolt = 4, bolt = null, hudDirty = true, lastSec = -1;
const stars = (() => { const r = seeded(9); return Array.from({ length: 90 }, () => ({ x: r(), y: r() * 110, b: r(), tw: r() * 6 })); })();

function tzOffsetMs(ms) { const p = homsParts(ms); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
function updateTime() {
  const now = Date.now();
  let ms = now;
  if (S.previewMins !== null) {
    const p = homsParts(now);
    ms = Date.UTC(p.y, p.mo - 1, p.d) + S.previewMins * 60e3 - tzOffsetMs(now);
  }
  S.ms = ms;
  S.parts = homsParts(ms);
  S.a = astro(ms);
  S.winter = [12, 1, 2, 3].includes(S.parts.mo);
  if (fmtHijriNum) S.hijriMonth = +fmtHijriNum.format(ms).replace(/\D/g, '');
  const base = S.previewWx ? wxState(S.previewWx) : (live.wx || wxState('clear'));
  S.wx = base;
  S.night = smooth(3, -9, S.a.sunAlt);
  S.lightsOn = Math.max(S.night, base.rain * .35 + base.storm * .25 + base.fog * .2);
}
const occupancy = h => (h >= 1 && h < 5) ? 0.3 : (h >= 23 || h < 1) ? 0.65 : 1;
function shopOpen(s) {
  const { h, wd } = S.parts, [o, c] = s.open;
  if (wd === 'Fri' && h < 13 && o > 6) return false;
  return c === 24 ? h >= o : (h >= o && h < c);
}

/* ===================================================================
   Update
   =================================================================== */
function update(dt) {
  S.t += dt;
  const wx = S.wx;
  // walker
  let dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0) || touchDir;
  if (dir) pl.manualT = 3; else pl.manualT = Math.max(0, pl.manualT - dt);
  const pw = wrapX(pl.x);
  if (!dir && pl.auto && !pl.manualT) {
    // the walk plays itself: keep strolling right, stop for hummus and for a photo at the clock
    if (pl.wait > 0) pl.wait -= dt;
    else {
      dir = 1;
      for (const t of talk) if (t.stop && t.lap !== pl.lap && pw > t.x - 1 && pw < t.x + 3) {
        t.lap = pl.lap; pl.wait = t.stop; dir = 0;
        if (t.id === 'photo') { pl.photoT = 0; pl.snapped = false; pl.dir = -1; }
      }
    }
  }
  if (pl.photoT >= 0) {
    pl.photoT += dt;
    if (!pl.snapped && pl.photoT > 1.5) { pl.snapped = true; S.capture = true; sound.shutter(); }
    if (pl.photoT > 4.6 || dir) pl.photoT = -1;
  }
  camFlash = Math.max(0, camFlash - dt * 2.2);
  const target = dir * (keys.run ? 60 : 26);
  pl.speed = lerp(pl.speed, target, clamp(dt * 10, 0, 1));
  if (Math.abs(pl.speed) < 0.5 && !dir) pl.speed = 0;
  if (dir) pl.dir = dir;
  pl.x += pl.speed * dt;
  pl.phase += Math.abs(pl.speed) * dt * 0.28;
  pl.idle = pl.speed === 0 ? pl.idle + dt : 0;
  // camera follows; the street is a loop, so everything shifts by one lap when the camera wraps
  const look = pl.dir * 28;
  const tx = pl.x - W / 2 + look;
  cam.x = REDUCED ? tx : lerp(cam.x, tx, clamp(dt * 3, 0, 1));
  if (cam.x >= WORLD_W || cam.x < 0) {
    const k = cam.x >= WORLD_W ? -WORLD_W : WORLD_W;
    cam.x += k; pl.x += k;
    for (const o of npcs) o.x += k;
    for (const o of cars) o.x += k;
    if (k < 0) pl.lap++;
  }

  const h = S.parts.h;
  const busy = (h >= 7 && h < 23 ? 1 : h >= 23 || h < 1 ? .5 : .15) * (S.parts.wd === 'Fri' && h < 12 ? .45 : 1);
  // pedestrians
  const want = Math.round((W / 320) * 5 * busy * (1 - wx.rain * .4) + (inSouq(cam.x + W / 2) ? 5 * busy : 0));
  npcs = npcs.filter(n => n.x > cam.x - 80 && n.x < cam.x + W + 80);
  if (npcs.length < want && Math.random() < dt * 2) {
    const fromLeft = Math.random() < .5, p = pick(Math.random, SPR.people);
    npcs.push({ x: fromLeft ? cam.x - 20 : cam.x + W + 20, dir: fromLeft ? 1 : -1, sp: (p.kid ? 22 : 13) + Math.random() * 9, p, ph: Math.random() * 4, y: 145 + (Math.random() * 3 | 0), umb: pick(Math.random, ['#c0303a', '#2a4a8a', '#2a2a30', '#3a8a5a', '#d8a030']) });
  }
  for (const n of npcs) { n.x += n.dir * n.sp * dt; n.ph += n.sp * dt * .25; }
  // traffic (cars never drive through the souq: they slip behind its gate pillars)
  const carWant = Math.round((W / 320) * 3 * busy * (1 - wx.snow * .5));
  const souqZone = x => { const m = wrapX(x); return m > SOUQ[0] - 4 && m < SOUQ[1] - 30; };
  cars = cars.filter(c => c.x > cam.x - 120 && c.x < cam.x + W + 120 && !souqZone(c.x));
  if (cars.length < carWant && Math.random() < dt * 1.2) {
    const lane = Math.random() < .5 ? 0 : 1, dirc = lane ? 1 : -1;
    const x = dirc > 0 ? cam.x - 50 : cam.x + W + 10, m = wrapX(x);
    const sp = SPR.cars[(Math.random() * SPR.cars.length) | 0];
    if (!(m > SOUQ[0] - 60 && m < SOUQ[1] + 10) && !cars.some(c => c.lane === lane && Math.abs(c.x - x) < 60)) cars.push({ x, lane, dir: dirc, sp: (34 + Math.random() * 28) * (1 - wx.rain * .25), s: sp });
  }
  for (const c of cars) {
    const ahead = cars.find(o => o !== c && o.lane === c.lane && (o.x - c.x) * c.dir > 0 && Math.abs(o.x - c.x) < c.s.len + 10);
    c.x += c.dir * (ahead ? Math.min(c.sp, ahead.sp) : c.sp) * dt;
  }
  // pigeons: peck until you come close, then scatter
  if (!pigeons.length) for (const gx of [1236, 1290, 2560, 2620, 380, 1990, 760]) for (let i = 0; i < 3 + (gx % 3); i++) pigeons.push({ hx: gx + i * 7, x: gx + i * 7, y: 145 + (i % 2) * 3, vx: 0, vy: 0, fly: false, gone: 0, f: Math.random() * 10 });
  for (const p of pigeons) {
    const d = wrapDist(p.x, pl.x);
    if (!p.fly && Math.abs(d) < 26 && Math.abs(pl.speed) > 5) { p.fly = true; p.vx = (d < 0 ? -1 : 1) * (30 + Math.random() * 20); p.vy = -40 - Math.random() * 20; }
    if (p.fly) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 8 * dt; p.f += dt * 14;
      if (p.y < -10) { p.gone += dt; if (p.gone > 12 && Math.abs(wrapDist(pl.x, p.hx)) > 200) Object.assign(p, { fly: false, x: p.hx, y: 146, gone: 0 }); }
    } else p.f += dt * (1 + Math.random());
  }
  // cats
  if (!cats.length) cats = [{ x: 960, y: 140, c: 0 }, { x: 2040, y: 140, c: 1 }, { x: 2306, y: 140, c: 2 }, { x: 1520, y: 140, c: 3 }, { x: 458, y: 140, c: 2 }].map(o => ({ ...o, t: Math.random() * 5 }));
  for (const c of cats) c.t += dt;
  // steam puffs (world coordinates)
  if (!REDUCED) for (const s of steam) { const sx = wsx(s.x); if (sx > -10 && sx < W + 10 && Math.random() < dt * 2.5) puffs.push({ x: s.x + Math.random() * 4 - 2, y: s.y, life: 0 }); }
  for (const p of puffs) { p.life += dt; p.y -= 8 * dt; p.x += Math.sin(p.life * 3) * 4 * dt + wx.wind * .05 * dt; }
  puffs = puffs.filter(p => p.life < 2.2);
  // birds at golden hour
  const golden = S.a.sunAlt > -2 && S.a.sunAlt < 12;
  if (golden && birds.length < 6 && Math.random() < dt * .5) birds.push({ x: -10, y: 20 + Math.random() * 40, sp: 14 + Math.random() * 10, f: Math.random() * 6 });
  for (const b of birds) { b.x += b.sp * dt; b.f += dt * 8; b.y += Math.sin(b.f * .3) * dt * 3; }
  birds = birds.filter(b => b.x < W + 10);
  for (const cl of clouds) cl.x += (2 + wx.wind * .25) * cl.sp * dt;
  // precipitation
  const rainN = Math.round(wx.rain * (REDUCED ? 60 : 260) * W / 320);
  while (drops.length < rainN) drops.push({ x: Math.random() * (W + 60) - 30, y: Math.random() * H, v: 160 + Math.random() * 80 });
  drops.length = Math.min(drops.length, rainN);
  const slant = clamp(wx.wind / 40, 0, 1) * .45;
  const fall = REDUCED ? .35 : 1;
  for (const d of drops) { d.y += d.v * dt * fall; d.x += d.v * slant * dt * fall; if (d.y > H) { d.y = -8; d.x = Math.random() * (W + 60) - 30; } }
  const snowN = Math.round(wx.snow * 180 * W / 320);
  while (flakes.length < snowN) flakes.push({ x: Math.random() * W, y: Math.random() * H, v: 10 + Math.random() * 14, p: Math.random() * 6, s: Math.random() < .2 ? 2 : 1 });
  flakes.length = Math.min(flakes.length, snowN);
  for (const f of flakes) { f.y += f.v * dt; f.p += dt; f.x += (Math.sin(f.p) * 6 + wx.wind * .3) * dt; if (f.y > H) { f.y = -2; f.x = Math.random() * W; } if (f.x > W) f.x = 0; }
  // lightning
  if (wx.storm) {
    nextBolt -= dt;
    if (nextBolt < 0) {
      nextBolt = 5 + Math.random() * 10; flash = 1;
      let bx = 40 + Math.random() * (W - 80), by = 0; bolt = [];
      while (by < 100) { const nx = bx + (Math.random() * 10 - 5), ny = by + 4 + Math.random() * 6; bolt.push([bx, by, nx, ny]); bx = nx; by = ny; }
      sound.thunder();
    }
  }
  flash = Math.max(0, flash - dt * 2.5);
  // speech bubbles
  updateBubble();
}
const wrapX = x => ((x % WORLD_W) + WORLD_W) % WORLD_W;
const wrapDist = (a, b) => { const d = wrapX(a - b); return d > WORLD_W / 2 ? d - WORLD_W : d; };
const inSouq = x => { const m = wrapX(x); return m > SOUQ[0] && m < SOUQ[1]; };
/* screen x of something fixed in the world, taking the loop into account */
function wsx(x, m = 80) { let s = Math.round(x) - Math.round(cam.x); if (s < -m) s += WORLD_W; else if (s > W + m) s -= WORLD_W; return Math.round(s); }

/* ===================================================================
   Render
   =================================================================== */
const canvas = $('#c');
const screenCtx = canvas.getContext('2d');
// the street is drawn into a 180px-tall scene, then placed on a canvas that fills the whole screen
const [scene, ctx] = makeCanvas(320, H);
let VH = H, OFF = 0;
let buf, bctx, mask, mctx;
function resize() {
  const vw = innerWidth, vh = innerHeight;
  // fill the screen edge to edge: tall screens get more sky above the street, very wide ones lose a little at the top
  let s = vh / H;
  W = Math.round(vw / s);
  if (W < 150) { W = 150; s = vw / W; } else if (W > MAX_W) { W = MAX_W; s = vw / W; }
  VH = Math.max(1, Math.round(vh / s)); OFF = VH - H;
  canvas.width = W; canvas.height = VH;
  scene.width = W; scene.height = H;
  ctx.imageSmoothingEnabled = false; screenCtx.imageSmoothingEnabled = false;
  [buf, bctx] = makeCanvas(W, H); [mask, mctx] = makeCanvas(W, H);
  Object.assign(canvas.style, { width: vw + 'px', height: vh + 'px', left: '0px', top: '0px' });
  canvas._s = vh / VH; canvas._l = 0; canvas._t = OFF * (vh / VH);
  skySig = '';
  layoutHud();
}
function blitWorld(dst, img, cx) {
  const a = Math.min(W, WORLD_W - cx);
  dst.drawImage(img, cx, 0, a, H, 0, 0, a, H);
  if (a < W) dst.drawImage(img, 0, 0, W - a, H, a, 0, W - a, H);
}
function tintBuf(tint, haze, hazeA) {
  mctx.clearRect(0, 0, W, H); mctx.drawImage(buf, 0, 0);
  bctx.globalCompositeOperation = 'multiply'; bctx.fillStyle = rgba(tint); bctx.fillRect(0, 0, W, H);
  bctx.globalCompositeOperation = 'destination-in'; bctx.drawImage(mask, 0, 0);
  if (hazeA > 0) { bctx.globalCompositeOperation = 'source-atop'; bctx.fillStyle = rgba(haze, hazeA); bctx.fillRect(0, 0, W, H); }
  bctx.globalCompositeOperation = 'source-over';
}
function drawGlow(c, x, y, r, a, target = ctx) {
  if (a <= 0.01) return;
  target.globalAlpha = Math.min(1, a);
  target.drawImage(glowSprite(c, r), Math.round(x - r), Math.round(y - r));
  target.globalAlpha = 1;
}
function drawMoonDisc(c2, mx, my, phase, alpha, top) {
  const k = Math.cos(phase * Math.PI * 2), waxing = phase < .5;
  c2.globalAlpha = alpha;
  for (let yy = -5; yy <= 5; yy++) {
    const hw = Math.sqrt(25 - yy * yy) + .3;
    for (let xx = -Math.floor(hw); xx <= Math.floor(hw); xx++) {
      const u = xx / hw, lit = waxing ? u > k : -u > k;
      c2.fillStyle = lit ? '#f4f0dc' : rgba(mixC(top, [255, 255, 255], .08));
      c2.fillRect(Math.round(mx + xx), Math.round(my + yy), 1, 1);
    }
  }
  c2.globalAlpha = 1;
}
/* multiply-tint a transparent layer in place, keeping its alpha, plus optional haze */
function tintLayer(c, x, tint, haze = null, hazeA = 0) {
  const [m, mx2] = makeCanvas(c.width, c.height);
  mx2.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = rgba(tint); x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
  if (hazeA > 0) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgba(haze, hazeA); x.fillRect(0, 0, c.width, c.height); }
  x.globalCompositeOperation = 'source-over';
}
function drawClock(c2, x, y, r, face, hand) {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) { c2.fillStyle = face; c2.fillRect(x + xx, y + yy, 1, 1); }
  c2.fillStyle = hand;
  for (let k = 0; k < 12; k += 3) { const a = k / 12 * Math.PI * 2; c2.fillRect(Math.round(x + Math.sin(a) * (r - 1)), Math.round(y - Math.cos(a) * (r - 1)), 1, 1); }
  const { h, mi, s } = S.parts;
  const line = (ang, len) => { for (let t = 0; t <= len; t += .5) c2.fillRect(Math.round(x + Math.sin(ang) * t), Math.round(y - Math.cos(ang) * t), 1, 1); };
  line(((h % 12) + mi / 60) / 12 * Math.PI * 2, r * .5);
  line((mi + s / 60) / 60 * Math.PI * 2, r * .82);
}
let plCan, plCtx, plFlip, plFlipCtx;
function drawPlayer(c2, x, y, alpha = 1) {
  if (!plCan) { [plCan, plCtx] = makeCanvas(18, 32); [plFlip, plFlipCtx] = makeCanvas(18, 32); plFlipCtx.scale(-1, 1); }
  const pc = plCan, px = plCtx;
  px.clearRect(0, 0, 18, 32);
  const moving = Math.abs(pl.speed) > 1;
  const ph = pl.phase;
  const bob = moving ? (Math.sin(ph * 2) > 0 ? 1 : 0) : (Math.sin(S.t * 2.2) > .6 ? 1 : 0);
  px.drawImage(SPR.torso, 1, bob);
  const legs = [[5, Math.PI, '#141519'], [9, 0, '#1d1f25']];
  for (const [lx, off, col] of legs) {
    const sw = moving ? Math.sin(ph + off) : 0;
    const dx = Math.round(sw * 2.4), lift = moving && Math.cos(ph + off) > .35 ? 1 : 0;
    px.fillStyle = '#17121c'; px.fillRect(lx + dx, 23, 5, 8 - lift);
    px.fillStyle = col; px.fillRect(lx + 1 + dx, 23, 3, 6 - lift);
    px.fillStyle = '#0b0b0d'; px.fillRect(lx + 1 + dx, 29 - lift, 5, 1);
  }
  px.drawImage(SPR.torso, 0, 21, 16, 3, 1, 21 + bob, 16, 3);
  if (pl.photoT > 0.3 && pl.photoT < 4.4) {
    // arm up, phone held in front of the face
    px.fillStyle = '#17121c'; px.fillRect(12, 13 + bob, 4, 6); px.fillRect(15, 7 + bob, 3, 9);
    px.fillStyle = '#23262d'; px.fillRect(13, 14 + bob, 2, 4);
    px.fillStyle = '#d6a47e'; px.fillRect(15, 14 + bob, 2, 2);
    px.fillStyle = '#17121c'; px.fillRect(15, 6 + bob, 3, 9);
    px.fillStyle = '#8a909c'; px.fillRect(16, 7 + bob, 1, 7);
    px.fillStyle = '#ffffff'; px.fillRect(17, 8 + bob, 1, 1);
  }
  let img = pc;
  if (pl.dir < 0) { plFlipCtx.clearRect(-18, 0, 18, 32); plFlipCtx.drawImage(pc, -18, 0); img = plFlip; }
  c2.globalAlpha = alpha;
  c2.drawImage(img, Math.round(x - 9), Math.round(y - 31));
  c2.globalAlpha = 1;
  return img;
}

function render() {
  const wx = S.wx, a = S.a, n = S.night;
  const p = skyPalette(a.sunAlt, wx);
  pal = p;
  refreshSky(p);
  const cx = Math.round(cam.x);
  ctx.drawImage(skyCan, 0, 0);

  // stars
  const starA = smooth(-4, -12, a.sunAlt) * (1 - wx.cloud * .9) * (1 - wx.fog);
  if (starA > 0.02) for (const s of stars) {
    const tw = REDUCED ? 1 : .6 + .4 * Math.sin(S.t * 2 + s.tw * 7);
    ctx.fillStyle = `rgba(255,250,235,${starA * s.b * tw})`;
    ctx.fillRect(Math.round(s.x * W), Math.round(s.y), 1, 1);
  }
  // sun & moon, placed by real azimuth (looking south: east on the left)
  const toScreen = (alt, az) => [W / 2 + (az / (Math.PI * .6)) * W * .5, 128 - (alt / 70) * 118];
  const veil = 1 - clamp(wx.cloud - .5, 0, 1) * 1.6 - wx.fog * .6;
  if (a.sunAlt > -3) {
    const [sx, sy] = toScreen(a.sunAlt, a.sunAz);
    const low = smooth(14, 0, a.sunAlt);
    const sc = mixC([255, 248, 220], [255, 150, 90], low);
    drawGlow('#ffe6b0', sx, sy, 34, .55 * Math.max(.2, veil));
    if (veil > 0) {
      ctx.globalAlpha = clamp(veil, 0, 1); ctx.fillStyle = rgba(sc);
      for (let yy = -6; yy <= 6; yy++) { const hw = Math.round(Math.sqrt(36 - yy * yy) + .3); ctx.fillRect(Math.round(sx - hw), Math.round(sy + yy), hw * 2 + 1, 1); }
      ctx.globalAlpha = 1;
    }
  }
  if (a.moonAlt > -3) {
    const [mx, my] = toScreen(a.moonAlt, a.moonAz);
    const ma = clamp(veil, 0, 1) * (0.35 + n * 0.65);
    if (n > .2) drawGlow('#cfd8ff', mx, my, 20, .35 * ma);
    drawMoonDisc(ctx, mx, my, a.phase, ma, p.top);
  }
  // clouds
  const nClouds = Math.round(clamp(wx.cloud, 0, 1) * clouds.length);
  for (let i = 0; i < nClouds; i++) {
    const cl = clouds[i], span = W + 200;
    const x = ((cl.x - cx * .04) % span + span) % span - 100;
    ctx.drawImage(cloudCans[i], Math.round(x), Math.round(cl.y));
  }
  if (wx.cloud > .75) {
    const deckA = (wx.cloud - .75) * 4;
    ctx.fillStyle = rgba(mixC(p.mid, p.top, .3), clamp(deckA * .8, 0, .8));
    for (let x = 0; x < W; x += 2) ctx.fillRect(x, 0, 2, 18 + Math.round(6 * Math.sin((x + cx * .04) * .05) + 4 * Math.sin((x + cx * .04) * .13)));
  }
  // lightning bolt
  if (bolt && flash > .6) { ctx.fillStyle = '#f4f6ff'; for (const [x1, y1, x2, y2] of bolt) { const st = Math.max(1, Math.abs(y2 - y1)); for (let t = 0; t <= st; t++) ctx.fillRect(Math.round(lerp(x1, x2, t / st)), Math.round(lerp(y1, y2, t / st)), 1, 1); } }
  // birds
  ctx.fillStyle = rgba(mulC(p.top, .5));
  for (const b of birds) { const up = Math.sin(b.f) > 0; ctx.fillRect(Math.round(b.x) - 2, Math.round(b.y) - (up ? 1 : 0), 2, 1); ctx.fillRect(Math.round(b.x) + 1, Math.round(b.y) - (up ? 1 : 0), 2, 1); ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1); }

  // far hills (each layer tiles with a period that divides the street, so the loop is seamless)
  ctx.drawImage(farAC, Math.round(cx / 8), 0, W, H, 0, 0, W, H);
  ctx.drawImage(farBC, Math.round(cx / 6), 0, W, H, 0, 0, W, H);
  if (wx.fog > 0) { ctx.fillStyle = rgba(p.hor, wx.fog * .5); ctx.fillRect(0, 60, W, H); }

  // mid city
  const mx = Math.round(cx / 4);
  bctx.clearRect(0, 0, W, H);
  bctx.drawImage(mid, mx, 0, W, H, 0, 0, W, H);
  tintBuf(p.tint, p.hor, .3 - n * .12 + wx.fog * .4 + wx.dust * .2);
  ctx.drawImage(buf, 0, 0);
  const occ = occupancy(S.parts.h);
  for (const l of midLights) {
    let sx = l.x - mx;
    if (sx < -2) sx += MID_P;
    if (sx < -2 || sx > W + 2) continue;
    if (l.blink) { if (S.lightsOn > .3 && (S.t % 1.6) < .8) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(Math.round(sx), l.y, 1, 1); drawGlow('#ff4030', sx, l.y, 5, .8); } continue; }
    const v = S.lightsOn * occ - l.th;
    if (v > 0) { ctx.globalAlpha = Math.min(1, v * 5) * .85 * (1 - wx.fog * .6); ctx.fillStyle = l.th < .3 ? '#ffd890' : '#f6e2b0'; ctx.fillRect(Math.round(sx), l.y, l.w, l.h); }
  }
  ctx.globalAlpha = 1;
  if (wx.fog > 0) { ctx.fillStyle = rgba(p.hor, wx.fog * .35); ctx.fillRect(0, 0, W, H); }

  // main: back layer
  bctx.clearRect(0, 0, W, H);
  blitWorld(bctx, back, cx);
  for (const s of shops) {
    const sx = wsx(s.x);
    if (sx + s.w < 0 || sx > W) continue;
    s.isOpen = shopOpen(s);
    if (!s.isOpen) { bctx.fillStyle = '#8a9096'; bctx.fillRect(sx, s.y, s.w, s.h); bctx.fillStyle = '#737a80'; for (let y = s.y + 1; y < s.y + s.h; y += 2) bctx.fillRect(sx, y, s.w, 1); bctx.fillStyle = '#4a4f54'; bctx.fillRect(sx + (s.w >> 1) - 1, s.y + s.h - 3, 3, 2); }
  }
  for (const c of clocks) if (c.layer === 0) drawClock(bctx, wsx(c.x), c.y, c.r, '#f6f2e6', '#26262a');
  // baker behind the manakish counter
  if (shops[MANAKISH].isOpen !== false) bctx.drawImage(SPR.baker[Math.sin(S.t * 1.5) > 0 ? 'r' : 'l'][0], wsx(530), 115);
  tintBuf(p.tint, p.hor, wx.fog * .25 + wx.dust * .08);
  ctx.drawImage(buf, 0, 0);

  // back emissives: windows, shops, the souq's lantern light
  const lo = S.lightsOn;
  for (const l of backLights) {
    if (!l.w) continue;
    const sx = wsx(l.x);
    if (sx + l.w < 0 || sx > W) continue;
    const v = l.souq ? .25 + lo * .5 : (lo * occ - l.th) * 5;
    if (v <= 0) continue;
    ctx.globalAlpha = Math.min(1, v) * .85;
    ctx.fillStyle = l.c;
    ctx.fillRect(sx, l.y, l.w, l.h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  for (const gl of glows) {
    if (gl.layer !== 0) continue;
    const sx = wsx(gl.x);
    if (sx + gl.r < 0 || sx - gl.r > W) continue;
    if (gl.shop !== undefined && shops[gl.shop].isOpen === false) continue;
    let v = gl.souq ? .45 + lo * .5 : (lo - gl.th) * 2;
    if (gl.flick) v = (.55 + .45 * lo) * (REDUCED ? 1 : .8 + .2 * Math.sin(S.t * 13) * Math.sin(S.t * 7.3));
    drawGlow(gl.c, sx, gl.y, gl.r, v * (gl.shop !== undefined ? .4 : .9));
  }
  ctx.globalCompositeOperation = 'source-over';
  // lit clock faces after dark
  if (lo > .3) for (const c of clocks) { const sx = wsx(c.x); if (c.lit && sx > -20 && sx < W + 20) { ctx.globalAlpha = Math.min(1, (lo - .3) * 3); drawClock(ctx, sx, c.y, c.r, '#fff4d8', '#2a2420'); ctx.globalAlpha = 1; } }
  // puddles reflect the sky
  if (wx.rain > .15 || wx.snow > .1) {
    for (const pd of puddles) {
      const sx = wsx(pd.x);
      if (sx < -30 || sx > W) continue;
      const py = 151;
      ctx.fillStyle = rgba(mixC(p.hor, p.mid, .4), .75);
      ctx.fillRect(sx + 2, py, pd.w - 4, 1); ctx.fillRect(sx, py + 1, pd.w, 1); ctx.fillRect(sx + 2, py + 2, pd.w - 4, 1);
      if (!REDUCED && wx.rain) { const rp = (S.t * 1.5 + pd.x) % 1; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(Math.round(sx + pd.w / 2 - rp * 4), py + 1, 1, 1); ctx.fillRect(Math.round(sx + pd.w / 2 + rp * 4), py + 1, 1, 1); }
    }
  }

  // main: dynamic sprites + foreground
  bctx.clearRect(0, 0, W, H);
  for (const c of cats) {
    const sx = wsx(c.x);
    if (sx < -20 || sx > W + 20) continue;
    bctx.drawImage(SPR.cat[c.c][(c.t % 4) < .4 ? 1 : 0], sx, c.y - 8);
  }
  for (const pg of pigeons) {
    const sx = wsx(pg.x);
    if (sx < -10 || sx > W + 10 || pg.y < -8) continue;
    const fr = pg.fly ? 2 + (Math.floor(pg.f) % 2) : (Math.sin(pg.f) > .7 ? 1 : 0);
    const spr = SPR.pigeon[fr];
    bctx.drawImage(pg.fly && pg.vx < 0 ? (spr.flip ||= flipped(spr)) : spr, sx, Math.round(pg.y));
  }
  bctx.save(); bctx.translate(-cx, 0);
  const actors = npcs.map(nn => ({ y: nn.y, draw: () => {
    const fr = nn.p[nn.dir > 0 ? 'r' : 'l'][Math.floor(nn.ph) % 4];
    const sc = nn.p.kid ? 0.8 : 1;
    if (nn.p.kid) bctx.drawImage(fr, Math.round(nn.x - 5), nn.y - 20, 10, 20); else bctx.drawImage(fr, Math.round(nn.x - 6), nn.y - 24);
    if (wx.rain > .2 && !inSouq(nn.x)) {
      const ux = Math.round(nn.x + nn.dir), uy = nn.y - 30 * sc;
      bctx.fillStyle = '#2a2a2e'; bctx.fillRect(ux, uy, 1, 8);
      bctx.fillStyle = nn.umb;
      for (let k = 0; k < 4; k++) bctx.fillRect(ux - 7 + k, uy - 3 + k, 15 - k * 2, 1);
      bctx.fillRect(ux - 8, uy + 1, 17, 1);
    }
  } }));
  actors.push({ y: FEET, draw: () => drawPlayer(bctx, pl.x, FEET) });
  actors.sort((a2, b2) => a2.y - b2.y).forEach(o => o.draw());
  for (const c of cars) {
    const y = c.lane ? 178 : 166;
    bctx.drawImage(c.dir > 0 ? c.s.r : c.s.l, Math.round(c.x), y - c.s.h);
  }
  bctx.restore();
  blitWorld(bctx, fore, cx);
  for (const c of clocks) if (c.layer === 1) drawClock(bctx, wsx(c.x), c.y, c.r, '#f4f0e4', '#1a1a1e');
  // steam
  for (const pf of puffs) { bctx.fillStyle = `rgba(255,255,255,${.5 * (1 - pf.life / 2.2)})`; bctx.fillRect(wsx(pf.x), Math.round(pf.y), pf.life > 1 ? 2 : 1, pf.life > 1 ? 2 : 1); }
  tintBuf(p.tint, p.hor, wx.fog * .2 + wx.dust * .06);
  ctx.drawImage(buf, 0, 0);

  // foreground emissives: lamps, headlights
  ctx.globalCompositeOperation = 'lighter';
  for (const gl of glows) {
    if (gl.layer !== 1) continue;
    const sx = wsx(gl.x);
    if (sx + gl.r < 0 || sx - gl.r > W) continue;
    const v = (lo - gl.th) * 2;
    if (v <= 0) continue;
    if (gl.pool) { ctx.globalAlpha = Math.min(1, v) * .35; ctx.drawImage(glowSprite(gl.c, gl.r), sx - gl.r, Math.round(gl.y - gl.r / 3), gl.r * 2, Math.round(gl.r * .66)); ctx.globalAlpha = 1; }
    else { drawGlow(gl.c, sx, gl.y, gl.r, v * .8); ctx.fillStyle = '#fff2c0'; ctx.fillRect(sx - 1, Math.round(gl.y) - 2, 2, 3); }
  }
  if (lo > .2) for (const c of cars) {
    const y = (c.lane ? 178 : 166) - 7, front = c.dir > 0 ? c.x + c.s.len - 1 : c.x;
    const back2 = c.dir > 0 ? c.x : c.x + c.s.len - 1;
    drawGlow('#fff2c0', front - cx + c.dir * 3, y, 10, lo);
    drawGlow('#ff3020', back2 - cx, y, 5, lo * .8);
    if (wx.rain > .2) { ctx.globalAlpha = lo * .3; ctx.drawImage(glowSprite('#fff2c0', 12), Math.round(front - cx + c.dir * 8 - 12), y + 8, 24, 4); ctx.globalAlpha = 1; }
  }
  ctx.globalCompositeOperation = 'source-over';

  // weather overlays
  if (drops.length) {
    ctx.fillStyle = rgba(mixC(p.hor, [200, 215, 235], .5), .55);
    const sl = clamp(wx.wind / 40, 0, 1) * .45;
    for (const d of drops) { const x = Math.round(d.x), y = Math.round(d.y); if (y > 28 && inSouq(x + cx) && wrapX(x + cx) > SOUQ[0] + 8) continue; ctx.fillRect(x, y, 1, 3); ctx.fillRect(Math.round(x - sl * 3), y - 3, 1, 3); if (y > 150 && y < 178 && (d.v | 0) % 5 === 0) { ctx.fillRect(x - 1, 178 - (d.v % 20), 3, 1); } }
  }
  if (flakes.length) { ctx.fillStyle = 'rgba(255,255,255,.9)'; for (const f of flakes) if (!(f.y > 28 && inSouq(f.x + cx))) ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s); }
  if (wx.snow > .3) { ctx.fillStyle = 'rgba(245,248,255,.6)'; ctx.fillRect(0, GROUND, W, 2); }
  if (wx.dust) { ctx.fillStyle = `rgba(214,170,110,${wx.dust * .16})`; ctx.fillRect(0, 0, W, H); }
  if (flash > 0) { ctx.fillStyle = `rgba(235,240,255,${(REDUCED ? .15 : .55) * flash})`; ctx.fillRect(0, 0, W, H); }
  // the photo at the clock: grab the frame, then the flash
  if (S.capture) {
    S.capture = false; camFlash = 1;
    showPolaroid(renderSelfie().toDataURL('image/png'));
  }
  if (pl.photoT > 0.4 && pl.photoT < 4.4 && !camFlash) {
    // phone screen glow on his face while he frames the shot
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#7ab8ff', Math.round(pl.x - cx) - 5, FEET - 21, 8, .35 + S.night * .3);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (camFlash > 0) {
    // the phone's flash lights up just his face
    const fx = Math.round(pl.x - cx) - 8, fy = FEET - 21;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ffffff', fx, fy, 20, camFlash * (REDUCED ? .6 : 1.2));
    drawGlow('#ffffff', fx + 5, fy - 1, 10, camFlash * 1.4);
    if (camFlash > .7) { ctx.fillStyle = '#ffffff'; ctx.fillRect(fx - 1, fy - 2, 3, 3); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // present: extend the sky upwards on tall screens, then the street
  if (OFF > 0) {
    const BANDS = 10;
    for (let i = 0; i < BANDS; i++) {
      screenCtx.fillStyle = rgba(mixC(mulC(p.top, .78), p.top, i / (BANDS - 1)));
      screenCtx.fillRect(0, Math.floor(i * OFF / BANDS), W, Math.ceil(OFF / BANDS) + 1);
    }
    const nC = Math.round(clamp(wx.cloud, 0, 1) * 6);
    for (let i = 0; i < nC; i++) {
      const cl = clouds[(i + 7) % clouds.length], span = W + 200, can = cloudCans[(i + 7) % clouds.length];
      if (can) screenCtx.drawImage(can, Math.round((((cl.x * .7 - cx * .03) % span) + span) % span - 100), Math.round(OFF * (.1 + .75 * ((i * .37) % 1))));
    }
    if (starA > 0.02) for (const st of stars) {
      screenCtx.fillStyle = `rgba(255,250,235,${starA * st.b * (REDUCED ? 1 : .6 + .4 * Math.sin(S.t * 2 + st.tw * 7))})`;
      screenCtx.fillRect(Math.round(st.x * W), Math.round(st.y / 110 * OFF), 1, 1);
    }
  }
  screenCtx.drawImage(scene, 0, OFF);
  document.body.style.backgroundColor = rgba(p.top);
}

/* ===================================================================
   The selfie: his own photo, rendered front-on for the moment he takes it
   =================================================================== */
const SELFIE_W = 96, SELFIE_H = 112;
let selfieHead = null;
function selfieHeadSprite() {
  if (selfieHead) return selfieHead;
  const hp = { k: '#17121c', h: '#231a17', H: '#4a3a32', s: '#d6a47e', S: '#b5825f', e: '#17121c', w: '#f4f2ea', b: '#1c1512', B: '#3a2c25', m: '#9a5040' };
  const n = (c, k) => c.repeat(k);
  const rows = [
    '..........kkkkkkkkkk..........',
    '.......kkkhhhhhhhhhhkkk.......',
    '.....kkhhhhHHHHhhhhhhhhkk.....',
    '....khhhhHHHHHHhhhhhhhhhhk....',
    '...khhhhhhhHHHHHHhhhhhhhhhk...',
    '...khhhhhhhhhhHHHHhhhhhhhhk...',
    '..khhhhhhhhhhhhhhhhhhhhhhhhk..',
    '..khhhhhhhhhhhhhhhhhhhhhhhhk..',
    '..khhh' + n('s', 18) + 'hhhk..',
    '..khh' + n('s', 20) + 'hhk..',
    '..kh' + n('s', 22) + 'hk..',
    '..kh' + n('s', 22) + 'hk..',
    '..khsshhhhhsssssssshhhhhsshk..',
    '.ksSssssew' + n('s', 10) + 'ewssssSsk.',
    '.ksSssssee' + 'sssssSssss' + 'eessssSsk.',
    '.ksSb' + n('s', 9) + 'sS' + n('s', 9) + 'bSsk.',
    '.ksSbb' + n('s', 7) + 'SssS' + n('s', 7) + 'bbSsk.',
    '.ksSbbbbsssbbbbbbbbsssbbbbSsk.',
    '..k' + n('b', 7) + 'sbbbBBbbbs' + n('b', 7) + 'k..',
    '..k' + n('b', 8) + 'bmwwwwmb' + n('b', 8) + 'k..',
    '..k' + n('b', 10) + 'mmmm' + n('b', 10) + 'k..',
    '..kbbbbbbBbbbbbbbbbbbBbbbbbk..',
    '...kbbbbBbbbbbbbbbbbbBbbbbk...',
    '....kbbbbbbbbbBBbbbbbbbbbk....',
    '.....k' + n('b', 18) + 'k.....',
    '......k' + n('b', 16) + 'k......',
    '.......k' + n('b', 14) + 'k.......',
    '........kk' + n('b', 10) + 'kk........',
    '..........kkkkkkkkkk..........',
  ];
  selfieHead = spriteFrom(rows, hp);
  return selfieHead;
}
function drawSelfieBody(x, cx, top) {
  const J = '#23262d', JL = '#383d47', K = '#17121c', SH = '#f4f2ea', T1 = '#2f7a3e', T2 = '#1f5a2a';
  for (let y = top; y < SELFIE_H; y++) {
    const hw = Math.round(clamp(9 + (y - top) * 2.6, 0, 31));
    x.fillStyle = K; x.fillRect(cx - hw - 1, y, hw * 2 + 3, 1);
    x.fillStyle = J; x.fillRect(cx - hw, y, hw * 2 + 1, 1);
    if (y > top + 2) {
      const v = Math.round(Math.max(4, 8 - (y - top - 2) * .15));
      x.fillStyle = JL; x.fillRect(cx - v - 2, y, v * 2 + 5, 1);
      x.fillStyle = SH; x.fillRect(cx - v, y, v * 2 + 1, 1);
    }
  }
  // tie
  x.fillStyle = T2; x.fillRect(cx - 2, top + 6, 5, 4);
  x.fillStyle = T1; x.fillRect(cx - 1, top + 6, 3, 3);
  for (let y = top + 10; y < SELFIE_H; y++) {
    const w2 = y < top + 15 ? 3 : 5;
    x.fillStyle = T1; x.fillRect(cx - (w2 >> 1), y, w2, 1);
    x.fillStyle = T2; x.fillRect(cx - (w2 >> 1) + w2 - 1, y, 1, 1);
  }
  // his arm reaching out to hold the phone, out of frame at the bottom left:
  // nearer the camera, so a touch brighter, with a lit edge and a few fabric folds
  for (let y = top + 6; y < SELFIE_H; y++) {
    const t = (y - top - 6) / (SELFIE_H - top - 6);
    const xl = Math.round(lerp(cx - 31, -16, t)), xr = Math.round(lerp(cx - 20, 24, t));
    x.fillStyle = K; x.fillRect(xl - 1, y, xr - xl + 3, 1);
    x.fillStyle = '#2b2f37'; x.fillRect(xl, y, xr - xl + 1, 1);
    x.fillStyle = '#4a505c'; x.fillRect(xr - 2, y, 2, 1);
    x.fillStyle = '#3a3f4a'; x.fillRect(xl + 1, y, 2, 1);
    if ((y - top) % 11 === 4) { x.fillStyle = '#1b1d23'; for (let k = 0; k < 6; k++) x.fillRect(Math.round(lerp(xl, xr, .3)) + k, y + (k >> 1), 1, 1); }
  }
}
function renderSelfie() {
  const p = pal, wx = S.wx, n = S.night, lo = S.lightsOn, occ = occupancy(S.parts.h);
  const [c, x] = makeCanvas(SELFIE_W, SELFIE_H);
  // the sky behind him, looking a little upwards
  const id = x.createImageData(SELFIE_W, SELFIE_H), d = id.data, BANDS = 12, rows = [];
  for (let k = 0; k <= BANDS; k++) rows.push(skyColorAt(p, .12 + .88 * k / BANDS));
  for (let y = 0; y < SELFIE_H; y++) {
    const tt = y / SELFIE_H * BANDS, bi = Math.floor(tt), fr = tt - bi;
    for (let i = 0; i < SELFIE_W; i++) {
      const col = rows[Math.min(BANDS, bi + (fr > BAYER[(y & 3) * 4 + (i & 3)] ? 1 : 0))], o = (y * SELFIE_W + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  x.putImageData(id, 0, 0);
  const veil = clamp(1 - clamp(wx.cloud - .5, 0, 1) * 1.6 - wx.fog * .6, 0, 1);
  const starA = smooth(-4, -12, S.a.sunAlt) * (1 - wx.cloud * .9) * (1 - wx.fog);
  if (starA > .02) { const r = seeded(12); for (let i = 0; i < 28; i++) { x.fillStyle = `rgba(255,250,235,${starA * (.35 + r() * .65)})`; x.fillRect(r() * SELFIE_W | 0, r() * 64 | 0, 1, 1); } }
  x.globalCompositeOperation = 'lighter';
  if (S.a.moonAlt > 0 && n > .3) drawGlow('#cfd8ff', 14, 12, 14, .3 * veil, x);
  if (S.a.sunAlt > -2 && S.a.sunAlt < 14) drawGlow('#ffcf90', -4, 22, 44, .55 * veil, x);
  x.globalCompositeOperation = 'source-over';
  if (S.a.moonAlt > 0 && n > .3 && veil > 0) drawMoonDisc(x, 14, 12, S.a.phase, veil, p.top);
  const nc = Math.round(clamp(wx.cloud, 0, 1) * 4);
  [[-14, 3], [50, 10], [10, 22], [64, 0]].slice(0, nc).forEach(([px, py], i) => cloudCans[i] && x.drawImage(cloudCans[i], px, py));
  if (wx.cloud > .75) { x.fillStyle = rgba(mixC(p.mid, p.top, .3), clamp((wx.cloud - .75) * 3.2, 0, .8)); for (let i = 0; i < SELFIE_W; i += 2) x.fillRect(i, 0, 2, 14 + Math.round(5 * Math.sin(i * .09) + 3 * Math.sin(i * .23))); }
  // the city behind: a slice of the same skyline, hazy with distance
  const MS = 120, MY = 20;
  const [l, lx] = makeCanvas(SELFIE_W, SELFIE_H);
  lx.drawImage(mid, MS, MY, SELFIE_W, SELFIE_H, 0, 0, SELFIE_W, SELFIE_H);
  tintLayer(l, lx, p.tint, p.hor, .3 - n * .12 + wx.fog * .4 + wx.dust * .2);
  x.drawImage(l, 0, 0);
  for (const m of midLights) {
    if (m.blink || m.x < MS || m.x >= MS + SELFIE_W) continue;
    const v = lo * occ - m.th;
    if (v > 0) { x.globalAlpha = Math.min(1, v * 5) * .85; x.fillStyle = m.th < .3 ? '#ffd890' : '#f6e2b0'; x.fillRect(m.x - MS, m.y - MY, m.w, m.h); }
  }
  x.globalAlpha = 1;
  // palms and the New Clock, straight from the street art, showing the real time
  const TX = 72, TY = -6, SRC = NEW_CLOCK_X - 36, OX = TX - 36;
  const [t, tx] = makeCanvas(SELFIE_W, SELFIE_H);
  const keepG = g; g = tx;
  palm(-1, 120, 76, seeded(4)); palm(99, 120, 62, seeded(8));
  g = keepG;
  tx.drawImage(back, SRC, 0, 72, 126, OX, TY, 72, 126);
  drawClock(tx, TX, 33 + TY, 9, '#f6f2e6', '#26262a');
  tintLayer(t, tx, p.tint, p.hor, wx.fog * .25 + wx.dust * .08);
  x.drawImage(t, 0, 0);
  for (const bl of backLights) {
    if (!bl.w || bl.x < SRC || bl.x > SRC + 72 || bl.y > 126) continue;
    const v = (lo * occ - bl.th) * 5;
    if (v > 0) { x.globalAlpha = Math.min(1, v) * .85; x.fillStyle = bl.c; x.fillRect(bl.x - SRC + OX, bl.y + TY, bl.w, bl.h); }
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'lighter';
  for (const gl of glows) if (gl.layer === 0 && gl.x > SRC && gl.x < SRC + 72) drawGlow(gl.c, gl.x - SRC + OX, gl.y + TY, gl.r, (lo - gl.th) * 1.8, x);
  x.globalCompositeOperation = 'source-over';
  if (lo > .3) { x.globalAlpha = Math.min(1, (lo - .3) * 3); drawClock(x, TX, 33 + TY, 9, '#fff4d8', '#2a2420'); x.globalAlpha = 1; }
  if (wx.fog > 0) { x.fillStyle = rgba(p.hor, wx.fog * .35); x.fillRect(0, 0, SELFIE_W, SELFIE_H); }
  // him, lit by the phone's flash (it matters more the darker it is)
  const [hc, hx] = makeCanvas(SELFIE_W, SELFIE_H);
  drawSelfieBody(hx, 36, 62);
  hx.drawImage(selfieHeadSprite(), 21, 40);
  tintLayer(hc, hx, mixC(p.tint, [255, 255, 255], .45 + .45 * n));
  x.drawImage(hc, 0, 0);
  x.globalCompositeOperation = 'lighter';
  drawGlow('#ffffff', 36, 54, 16, .1 + .22 * n, x);
  x.globalCompositeOperation = 'source-over';
  // weather on the lens
  const r = seeded(S.parts.mi + 7);
  if (wx.rain > .1) {
    x.fillStyle = rgba(mixC(p.hor, [210, 220, 240], .5), .6);
    for (let i = 0; i < 40 * wx.rain; i++) x.fillRect(r() * SELFIE_W | 0, r() * SELFIE_H | 0, 1, 3);
    for (let i = 0; i < 4; i++) { const dx = r() * SELFIE_W | 0, dy = r() * SELFIE_H | 0; x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(dx, dy, 2, 2); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(dx, dy, 1, 1); }
  }
  if (wx.snow > .1) { x.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 40 * wx.snow; i++) { const s2 = r() < .3 ? 2 : 1; x.fillRect(r() * SELFIE_W | 0, r() * SELFIE_H | 0, s2, s2); } }
  if (wx.dust) { x.fillStyle = `rgba(214,170,110,${wx.dust * .14})`; x.fillRect(0, 0, SELFIE_W, SELFIE_H); }
  // film-camera time stamp, in Homs time
  const label = `${pad(S.parts.h)}:${pad(S.parts.mi)}`, stamp = pixelText(label, 8, '#ff9a3c');
  const sx = SELFIE_W - stamp.width - 3, sy = SELFIE_H - stamp.height - 2;
  x.globalAlpha = .55; x.drawImage(pixelText(label, 8, '#4a1a00'), sx + 1, sy + 1); x.globalAlpha = 1;
  x.drawImage(stamp, sx, sy);
  return c;
}

/* ===================================================================
   HUD
   =================================================================== */
const hud = $('#hud'), zoneEl = $('#zone'), bubble = $('#bubble'), controls = $('#controls'), preview = $('#preview');
let curZone = -1;
function layoutHud() {
  const c = controls.getBoundingClientRect();
  hud.style.top = (c.bottom + 8) + 'px';
  const h = hud.getBoundingClientRect();
  preview.style.top = (h.bottom + 8) + 'px';
}
function updateHud() {
  const p = S.parts;
  if (p.s !== lastSec || hudDirty) {
    lastSec = p.s;
    $('#time').innerHTML = `${pad(p.h)}:${pad(p.mi)}<span class="sec">:${pad(p.s)}</span>`;
    $('#date').textContent = fmtDate.format(S.ms);
    $('#hijri').textContent = fmtHijri ? fmtHijri.format(S.ms) : '';
    const wx = S.wx;
    const key = wx.key === 'clear' && S.night > .5 ? 'clear' : wx.key;
    const [en, ar] = WX_TEXT[key] || WX_TEXT.clear;
    const temp = S.previewWx || !live.ok || wx.temp == null ? '—' : Math.round(wx.temp) + '°C';
    $('#temp').textContent = temp;
    $('#cond .en').textContent = S.night > .5 && key === 'clear' ? 'Clear night' : en;
    $('#cond .ar').textContent = ar;
    $('#rise').textContent = '☀ ' + (live.sunrise || '—');
    $('#set').textContent = '☾ ' + (live.sunset || '—');
    const m = $('#mode');
    m.textContent = S.previewMins !== null || S.previewWx ? 'PREVIEW' : live.ok ? 'LIVE' : 'LIVE · no weather';
    m.classList.toggle('preview', S.previewMins !== null || !!S.previewWx);
    drawWxIcon(key, S.night > .5);
    if (S.previewMins === null) { $('#tSlider').value = p.h * 60 + p.mi; }
    $('#tLabel').textContent = `${pad(p.h)}:${pad(p.mi)}`;
    if (hudDirty) layoutHud();
    hudDirty = false;
  }
  let z = 0;
  const pw = wrapX(pl.x);
  for (let i = 0; i < ZONES.length; i++) if (pw >= ZONES[i].x) z = i;
  if (z !== curZone) {
    curZone = z;
    zoneEl.querySelector('.en').textContent = ZONES[z].en;
    zoneEl.querySelector('.ar').textContent = ZONES[z].ar;
  }
}
function drawWxIcon(key, night) {
  const c = $('#wxicon').getContext('2d');
  c.clearRect(0, 0, 12, 12);
  const P = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const sun = () => { P(4, 4, 4, 4, '#ffd04a'); P(5, 3, 2, 6, '#ffd04a'); P(3, 5, 6, 2, '#ffd04a'); for (const [x, y] of [[1, 1], [10, 1], [1, 10], [10, 10], [5, 0], [5, 11], [0, 5], [11, 5]]) P(x, y, 1, 1, '#ffb030'); };
  const moon = () => { P(3, 2, 5, 8, '#f4ecc8'); P(2, 3, 7, 6, '#f4ecc8'); P(5, 2, 4, 6, 'rgba(0,0,0,0)'); c.clearRect(6, 1, 5, 7); };
  const cloud = (y = 5, col = '#e8ecf2') => { P(2, y + 1, 9, 3, col); P(3, y, 4, 4, col); P(6, y - 1, 3, 4, col); P(1, y + 2, 1, 2, col); };
  if (key === 'clear' || key === 'dust') night ? moon() : sun();
  if (key === 'dust') { P(0, 9, 12, 1, '#d8a868'); P(1, 11, 9, 1, '#d8a868'); }
  if (key === 'mostly' || key === 'partly') { night ? moon() : sun(); cloud(6); }
  if (key === 'overcast') { cloud(3, '#b8c0cc'); cloud(6); }
  if (key === 'fog') for (let y = 2; y < 12; y += 3) P(y % 2, y, 11, 1, '#c8ccd4');
  if (['drizzle', 'rain', 'heavy', 'showers'].includes(key)) { cloud(2); for (const x of [2, 5, 8]) P(x, 8, 1, 2, '#6aa8ff'), P(x - 1, 10, 1, 2, '#6aa8ff'); }
  if (key === 'storm') { cloud(2, '#9aa2b0'); P(6, 7, 2, 2, '#ffe04a'); P(5, 9, 2, 1, '#ffe04a'); P(4, 10, 2, 2, '#ffe04a'); }
  if (key === 'snow') { cloud(2); for (const [x, y] of [[2, 8], [6, 9], [9, 8], [4, 11], [8, 11]]) P(x, y, 1, 1, '#ffffff'); }
}

const LINES = {
  manakish: ['منقوشة زعتر لو سمحت!', "One za'atar manousheh, please!"],
  hummus: ['صحن حمص… بحمص!', 'A plate of hummus… in Homs!'],
  photo: ['صورة للذكرى!', 'One for the album!'],
  sweets: ['كيلو حلاوة جبن!', 'A kilo of halawet el-jibn!'],
  coffee: ['قهوة سادة، الله يخليك', 'Black coffee, no sugar.'],
  falafel: ['سندويشة فلافل!', 'One falafel sandwich!'],
  souq: ['بقديش هاد؟', 'How much is this?'],
  mosque: ['ما أحلاها', 'Isn’t it beautiful?'],
  oldhoms: ['يا الله على هالحجر الأسود', 'That black basalt, though.'],
  cat: ['مياو', 'Meow.'],
};
let bubbleKey = '';
function updateBubble() {
  let line = null;
  if (pl.idle > 1.8) {
    const cat = cats.find(c => Math.abs(wrapDist(c.x + 4, pl.x)) < 16);
    const spot = talk.reduce((best, t) => { const d = Math.abs(wrapDist(t.x, pl.x)); return d < 34 && (!best || d < best.d) ? { ...t, d } : best; }, null);
    const { h, mi } = S.parts;
    if (spot && (spot.id === 'hummus' || spot.id === 'photo')) line = LINES[spot.id];
    else if (cat) line = LINES.cat;
    else if (spot && (spot.id === 'oldclock' || spot.id === 'newclock')) line = [`الساعة ${pad(h)}:${pad(mi)}`, `It's ${pad(h)}:${pad(mi)} in Homs.`];
    else if (spot && spot.id === 'manakish' && shops[MANAKISH].isOpen === false) line = ['مسكّر… بكرا الصبح', 'Closed… tomorrow morning.'];
    else if (spot) line = LINES[spot.id];
    else if (pl.idle > 3) line = h >= 4 && h < 12 ? ['صباح الخير', 'Good morning!'] : h >= 12 && h < 17 ? ['مرحبا', 'Marhaba!'] : ['مسا الخير', 'Good evening!'];
    if (S.wx.rain > .5 && !inSouq(pl.x) && !spot && !cat) line = ['شتوية!', 'Proper winter rain!'];
    if (S.hijriMonth === 9 && !spot && !cat && S.night > .5) line = ['رمضان كريم', 'Ramadan Kareem!'];
  }
  const key = line ? line[0] : '';
  if (key !== bubbleKey) {
    bubbleKey = key;
    bubble.hidden = !line;
    if (line) { bubble.querySelector('.ar').textContent = line[0]; bubble.querySelector('.en').textContent = line[1]; }
  }
  if (line) {
    const s = canvas._s;
    bubble.style.left = (canvas._l + (pl.x - cam.x) * s) + 'px';
    bubble.style.top = (canvas._t + (FEET - 36) * s) + 'px';
  }
}

/* ===================================================================
   Sound: an original lo-fi loop with a Homsi accent, in maqam Bayati
   (oud ostinato, ney melody, qanun, a soft maqsum darbuka, tape crackle).
   Put a file called music.mp3 next to index.html to play that instead.
   =================================================================== */
const sound = (() => {
  let ac = null, master, bus, echo, rainGain, timer, nextT = 0, step = 0, noiseBuf, fileAudio = null, useFile = false;
  const BPM = 80, E = 60 / BPM / 2, SWING = 0.1;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const EH = 63.5; // E half-flat: the quarter tone that makes Bayati sound like home
  // Dm · Dm · C · C · Bb · Bb · Gm · Dm
  const CH = [[50, 57, 62, 65], [50, 57, 62, 65], [48, 55, 60, 67], [48, 55, 60, 67], [46, 53, 58, 62], [46, 53, 58, 62], [43, 50, 55, 58], [50, 57, 62, 65]];
  const MEL = [
    [[69, 2], [67, 1], [65, 1], [EH, 1], [65, 1], [67, 2]],
    [[69, 3], [70, 1], [69, 2], [67, 1], [69, 1]],
    [[67, 2], [65, 1], [67, 1], [69, 2], [67, 1], [65, 1]],
    [[EH, 3], [65, 1], [62, 4]],
    [[74, 2], [72, 1], [70, 1], [69, 2], [70, 1], [72, 1]],
    [[74, 3], [72, 1], [70, 1], [69, 1], [67, 2]],
    [[65, 1], [67, 1], [69, 1], [70, 1], [69, 2], [67, 1], [65, 1]],
    [[EH, 2], [62, 6]],
  ];
  const events = new Array(64).fill(null);
  MEL.forEach((bar, i) => { let pos = i * 8; for (const [m, len] of bar) { events[pos] = [m, len]; pos += len; } });
  const OUD = [0, null, 1, 0, null, 0, 1, 2]; // root, fifth, octave on the eighths
  function amp(t, attack, peak, decay, dest = bus) {
    const gn = ac.createGain();
    gn.gain.setValueAtTime(.0001, t);
    gn.gain.exponentialRampToValueAtTime(peak, t + attack);
    gn.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
    gn.connect(dest);
    return gn;
  }
  // plucked oud: bright attack that darkens fast, a hair of pitch settle
  function oud(m, t, vol) {
    const f = mtof(m), lp = ac.createBiquadFilter(), out = amp(t, .004, vol, .85);
    lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(480, t + .28);
    lp.connect(out);
    for (const [type, mul] of [['sawtooth', .8], ['triangle', .6]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f * 1.01, t); o.frequency.exponentialRampToValueAtTime(f, t + .03);
      og.gain.value = mul; o.connect(og).connect(lp); o.start(t); o.stop(t + 1);
    }
  }
  // qanun: a brighter, shorter pluck
  function qanun(m, t, vol) {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
    o.connect(amp(t, .003, vol, .5)); o.start(t); o.stop(t + .7);
  }
  // ney: breathy flute with a vibrato that blooms on long notes
  function ney(m, t, dur, vol) {
    const f = mtof(m), end = t + dur + .45;
    const env = ac.createGain();
    env.gain.setValueAtTime(.0001, t);
    env.gain.exponentialRampToValueAtTime(vol, t + .09);
    env.gain.setValueAtTime(vol, t + Math.max(.1, dur - .1));
    env.gain.exponentialRampToValueAtTime(.0001, t + dur + .3);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    env.connect(lp); lp.connect(bus);
    const send = ac.createGain(); send.gain.value = .35; lp.connect(send).connect(echo);
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const g2 = ac.createGain(); g2.gain.value = .07;
    const lfo = ac.createOscillator(), depth = ac.createGain();
    lfo.frequency.value = 5.3;
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * .009, t + Math.min(.6, dur * .7));
    lfo.connect(depth); depth.connect(o.frequency);
    const br = ac.createBufferSource(); br.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2.5;
    const bg = ac.createGain(); bg.gain.value = .22;
    o.connect(env); o2.connect(g2).connect(env); br.connect(bp).connect(bg).connect(env);
    for (const n of [o, o2, lfo]) { n.start(t); n.stop(end); }
    br.start(t, Math.random()); br.stop(end);
  }
  function pad(ch, t, dur) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(.032, t + .8); gn.gain.setTargetAtTime(.0001, t + dur - .3, .45);
    lp.connect(gn).connect(bus);
    for (const m of ch) for (const d of [-6, 6]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
      const og = ac.createGain(); og.gain.value = .09; o.connect(og).connect(lp); o.start(t); o.stop(t + dur + 1.6);
    }
  }
  function bass(m, t, dur) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
    o.connect(amp(t, .02, .2, dur)); o.start(t); o.stop(t + dur + .2);
  }
  function doum(t, vol) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + .14);
    o.connect(amp(t, .004, vol, .28)); o.start(t); o.stop(t + .4);
  }
  function hit(t, vol, type, freq, decay) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 2 : .7;
    src.connect(f).connect(amp(t, .002, vol, decay)); src.start(t, Math.random() * 1.5); src.stop(t + decay + .05);
  }
  function play(s, t) {
    const i = s % 64, bar = i >> 3, pos = i & 7, pass = (s >> 6) % 4;
    if (pos % 2) t += E * SWING;
    const ch = CH[bar];
    if (pos === 0 && bar % 2 === 0) pad(ch, t, E * 16);
    // oud ostinato
    const o = OUD[pos];
    if (o !== null) oud([ch[0], ch[1], ch[2]][o], t, pos === 0 ? .075 : .055);
    // bass with the doum
    if (pos === 0 || pos === 4) bass(ch[0] - 12, t, E * 3);
    // the tune: ney on the 2nd and 3rd time round, qanun takes it up an octave on the 4th
    const ev = events[i];
    if (ev && (pass === 1 || pass === 2)) ney(ev[0], t, ev[1] * E * 1.05, .034);
    if (ev && pass === 3) { qanun(ev[0] + 12, t, .05); if (ev[1] >= 3) for (let k = 1; k < ev[1] * 2; k++) qanun(ev[0] + 12, t + k * E / 2, .028); }
    // soft maqsum: doum tek . tek doum . tek .
    if (pos === 0 || pos === 4) doum(t, .26);
    if (pos === 1 || pos === 3 || pos === 6) hit(t, .05, 'bandpass', 3200, .06);
    if (pos === 7 && bar % 2) hit(t, .03, 'bandpass', 2300, .05);
    if (pass > 0) hit(t + E / 2, .012, 'highpass', 8000, .03); // riq shimmer
    if (Math.random() < .45) hit(t + Math.random() * E, .012, 'highpass', 3000, .01); // vinyl crackle
  }
  function tick() {
    while (nextT < ac.currentTime + .2) { play(step, nextT); nextT += E; step++; }
    rainGain.gain.setTargetAtTime(S.wx.rain * .08, ac.currentTime, .5);
  }
  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0;
    const warm = ac.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5000;
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = .01; glue.release.value = .25;
    master.connect(warm).connect(glue).connect(ac.destination);
    bus = ac.createGain(); bus.gain.value = 3.2; bus.connect(master);
    echo = ac.createDelay(1); echo.delayTime.value = E * 3;
    const fb = ac.createGain(); fb.gain.value = .3;
    const elp = ac.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2000;
    echo.connect(elp).connect(fb).connect(echo); elp.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const rs = ac.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    rainGain = ac.createGain(); rainGain.gain.value = 0;
    rs.connect(lp).connect(rainGain).connect(master); rs.start();
  }
  function sfxReady() {
    try { if (!ac) init(); if (ac.state !== 'running') ac.resume(); } catch { return false; }
    if (!timer) master.gain.setTargetAtTime(.85, ac.currentTime, .05);
    return ac.state === 'running';
  }
  return {
    on: true,
    get running() { return useFile ? !!fileAudio && !fileAudio.paused : !!ac && ac.state === 'running' && !!timer; },
    // use music.mp3 if one sits next to the page
    async probe() {
      try { const r = await fetch('music.mp3', { method: 'HEAD', cache: 'no-store' }); useFile = r.ok; } catch { useFile = false; }
    },
    start() {
      if (useFile) {
        if (!fileAudio) { fileAudio = new Audio('music.mp3'); fileAudio.loop = true; fileAudio.volume = .7; }
        fileAudio.play().catch(() => {});
        return;
      }
      if (!ac) init();
      if (ac.state !== 'running') ac.resume();
      if (!timer) { nextT = ac.currentTime + .08; timer = setInterval(tick, 30); }
      master.gain.setTargetAtTime(.85, ac.currentTime, .6);
    },
    stop() {
      if (fileAudio) fileAudio.pause();
      if (!ac) return;
      master.gain.setTargetAtTime(0, ac.currentTime, .15);
      clearInterval(timer); timer = null;
    },
    toggle() { this.on = !this.on; this.on ? this.start() : this.stop(); },
    shutter() {
      if (!this.on || !sfxReady()) return;
      const t = ac.currentTime;
      hit(t, .25, 'highpass', 2500, .03); hit(t + .07, .2, 'highpass', 1800, .04);
    },
    thunder() {
      if (!this.on || !ac || ac.state !== 'running') return;
      const t = ac.currentTime + .3 + Math.random() * .8;
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const gn = ac.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.6, t + .1); gn.gain.exponentialRampToValueAtTime(.001, t + 2.5);
      src.connect(f).connect(gn).connect(master); src.start(t); src.stop(t + 2.6);
    },
  };
})();
// Browsers only allow sound after the visitor interacts, so the music starts on the very first touch, click or key.
function autoStartSound() {
  if (!sound.on) return;
  try { sound.start(); } catch { /* no audio */ }
  const hint = $('#soundHint');
  const check = () => { hint.hidden = sound.running || !sound.on; };
  setTimeout(check, 400);
  setTimeout(() => { hint.hidden = true; }, 7000);
  const go = () => { if (sound.on) sound.start(); setTimeout(check, 200); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, go, { once: true, capture: true });
}
function syncSound() { const b = $('#btnSound'); b.textContent = sound.on ? '♪ On' : '♪ Off'; b.setAttribute('aria-pressed', String(sound.on)); }

/* the photo at the New Clock: a little polaroid that slides in */
let polaroidTimer;
function showPolaroid(src) {
  const el = $('#polaroid');
  const img = el.querySelector('img');
  img.src = src;
  const { h, mi } = S.parts;
  img.alt = `His selfie in front of the New Clock in Homs at ${pad(h)}:${pad(mi)}`;
  el.querySelector('.cap').textContent = `New Clock · ${fmtDay.format(S.ms)}`;
  el.hidden = false;
  el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(polaroidTimer);
  polaroidTimer = setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 700); }, 6500);
}

/* ===================================================================
   Input & controls
   =================================================================== */
function syncStroll() { const b = $('#btnStroll'); b.textContent = pl.auto ? '❚❚ Pause' : '▶ Walk'; b.setAttribute('aria-pressed', String(!pl.auto)); }
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.key === 'Shift') keys.run = true;
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyS') { e.preventDefault(); $('#btnStroll').click(); }
  if (e.code === 'KeyI') $('#btnInfo').click();
  if (e.code === 'KeyP') { if (hud.hidden) $('#btnInfo').click(); $('#btnPreview').click(); }
  if (e.code === 'KeyM') $('#btnSound').click();
  if (e.key === '?' || e.key === '/') $('#btnHelp').click();
  if (e.key === 'Escape') $('#help').hidden = true;
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; if (e.key === 'Shift') keys.run = false; });
addEventListener('blur', () => { keys.l = keys.r = keys.run = false; touchDir = 0; });
canvas.addEventListener('pointerdown', e => { touchDir = e.clientX < innerWidth / 2 ? -1 : 1; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (touchDir) touchDir = e.clientX < innerWidth / 2 ? -1 : 1; });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { touchDir = 0; });

$('#btnInfo').onclick = e => {
  hud.hidden = !hud.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!hud.hidden));
  e.currentTarget.setAttribute('aria-pressed', String(!hud.hidden));
  if (hud.hidden) { preview.hidden = true; $('#btnPreview').setAttribute('aria-pressed', 'false'); }
  hudDirty = true; layoutHud();
};
$('#btnStroll').onclick = () => { pl.auto = !pl.auto; pl.manualT = 0; syncStroll(); };
$('#btnSound').onclick = () => { sound.toggle(); syncSound(); $('#soundHint').hidden = true; };
$('#btnHelp').onclick = () => { $('#help').hidden = !$('#help').hidden; };
$('#btnHelpClose').onclick = () => { $('#help').hidden = true; };
$('#btnCopyPrompt').onclick = async e => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText(await (await fetch('PROMPT.md')).text()); b.textContent = 'Copied ✓'; }
  catch { location.href = 'PROMPT.md'; }
};
$('#btnPreview').onclick = e => {
  preview.hidden = !preview.hidden;
  e.currentTarget.setAttribute('aria-pressed', String(!preview.hidden));
  layoutHud();
};
$('#tSlider').oninput = e => { S.previewMins = +e.target.value; hudDirty = true; };
$('#wSelect').onchange = e => { S.previewWx = e.target.value === 'live' ? null : e.target.value; skySig = ''; hudDirty = true; };
$('#btnLive').onclick = () => { S.previewMins = null; S.previewWx = null; $('#wSelect').value = 'live'; hudDirty = true; };
preview.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.previewMins = +b.dataset.t; hudDirty = true; });
addEventListener('resize', resize);

/* ===================================================================
   Boot
   =================================================================== */
async function boot() {
  try {
    await Promise.race([
      Promise.all(['700 10px "Noto Kufi Arabic"', '8px "Silkscreen"', '500 14px "Pixelify Sans"'].map(f => document.fonts.load(f, 'حمص Homs'))),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch { /* fall back to system fonts */ }
  // URL hooks for sharing a moment: ?t=18:30&w=rain&x=1600
  const q = new URLSearchParams(location.search);
  if (q.get('t')) { const [hh, mm] = q.get('t').split(':').map(Number); S.previewMins = hh * 60 + (mm || 0); }
  if (q.get('w') && WX_TEXT[q.get('w')] || q.get('w') === 'partly') S.previewWx = q.get('w');
  if (q.get('x')) pl.x = wrapX(+q.get('x'));
  buildSprites();
  buildWorld();
  buildMid();
  buildFar();
  makeClouds();
  resize();
  updateTime();
  cam.x = wrapX(pl.x - W / 2 + 28); pl.x = cam.x + W / 2 - 28;
  $('#loading').remove();
  syncStroll(); syncSound();
  await Promise.race([sound.probe(), new Promise(r => setTimeout(r, 1200))]);
  autoStartSound();
  fetchWeather();
  setInterval(fetchWeather, 12 * 60e3);
  let last = performance.now(), acc = 0;
  const frame = now => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    acc += dt;
    if (acc > .25) { updateTime(); acc = 0; }
    update(dt);
    render();
    updateHud();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
boot();
})();
