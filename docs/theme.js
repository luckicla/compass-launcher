'use strict';
// Compass Launcher 4.2 · temas, fondos animados a píxeles y transición entre zonas.
// Todo se dibuja aquí (nada se descarga): cada fondo es un pequeño lienzo de baja resolución
// escalado con image-rendering:pixelated, así queda «cuadriculadito» a cualquier tamaño.

// ---------- temas: cada uno con su versión oscura y clara ----------
// a = acento de Jugar, b = acento de Servidores. fg = color del texto en r g b (para líneas y velos).
const T = (ink, ink2, s1, s2, s3, s4, tx, mut, dim, fg, a, a2, aInk, b, b2, bInk) => ({ ink, ink2, s1, s2, s3, s4, tx, mut, dim, fg, a, a2, aInk, b, b2, bInk });
const THEMES = {
  compass: { name: 'Compass', desc: 'Noche violeta, ámbar de antorcha', bg: 'noche', font: 'titles', radius: 0,
    dark: T('#15111d', '#1b1625', '#221b2e', '#2b2339', '#372d48', '#433857', '#f1eadf', '#ab9fb9', '#776c88', '241 234 223', '#ffb547', '#ffd28a', '#2b1700', '#5fd4c4', '#a3eee3', '#04241f'),
    light: T('#f4efe6', '#ebe4d8', '#fffaf2', '#f1e9dc', '#e3d8c8', '#d4c7b4', '#2a2133', '#6b5f78', '#998da6', '42 33 51', '#d9821a', '#f0a13c', '#fff6e8', '#1f9e8f', '#3cc2b1', '#f2fffd') },
  galaxia: { name: 'Galaxia', desc: 'Nebulosas, estrellas y planetas', bg: 'galaxia', font: 'titles', radius: 0,
    dark: T('#070816', '#0b0d22', '#121533', '#1a1e45', '#252a5a', '#31376f', '#eef0ff', '#a3a8d6', '#6a70a3', '238 240 255', '#b98cff', '#d8bfff', '#1b0b33', '#54e0ff', '#a8f0ff', '#022430'),
    light: T('#eef0fb', '#e3e6f7', '#ffffff', '#eceffc', '#dde1f6', '#c9cfee', '#1b1f45', '#5a5f8f', '#8f94bd', '27 31 69', '#7a4ee0', '#9a74ff', '#ffffff', '#0b96c2', '#2fb9e3', '#ffffff') },
  mc2026: { name: 'Minecraft 2026', desc: 'Limpio y moderno, verde hierba', bg: 'paisaje', font: 'titles', radius: 0,
    dark: T('#121212', '#181818', '#1f1f1f', '#262626', '#313131', '#3d3d3d', '#ffffff', '#b4b4b4', '#7a7a7a', '255 255 255', '#3c8527', '#52a535', '#ffffff', '#3fa9f5', '#7cc7ff', '#03223a'),
    light: T('#f2f2f2', '#e8e8e8', '#ffffff', '#f0f0f0', '#e2e2e2', '#d0d0d0', '#1a1a1a', '#555555', '#8a8a8a', '26 26 26', '#2f6f1f', '#3c8527', '#ffffff', '#1777c4', '#2a8fe0', '#ffffff') },
  mc2009: { name: 'Minecraft 2009', desc: 'Tierra, piedra y botones grises', bg: 'tierra', font: 'all', radius: 0, bevel: true, shadowText: true,
    dark: T('#1c1c1c', '#252525', '#303030', '#3b3b3b', '#4a4a4a', '#5a5a5a', '#ffffff', '#c6c6c6', '#8b8b8b', '255 255 255', '#7fb238', '#a5d65a', '#132a00', '#5aa9e6', '#9ccdf3', '#062033'),
    light: T('#c6c6c6', '#b8b8b8', '#dcdcdc', '#cfcfcf', '#bdbdbd', '#a8a8a8', '#1f1f1f', '#3e3e3e', '#666666', '31 31 31', '#4f8a1f', '#6aa72e', '#ffffff', '#2b6fb8', '#3f88d6', '#ffffff') },
  solarpunk: { name: 'Solarpunk', desc: 'Sol, terrazas verdes y hojas al viento', bg: 'solar', font: 'titles', radius: 0,
    dark: T('#0f1a14', '#13211a', '#1a2b22', '#22382c', '#2d4838', '#3a5a46', '#f3f0dc', '#b7c2a6', '#7f8f74', '243 240 220', '#f2c14e', '#ffd97e', '#2a1f00', '#7fd17a', '#b5ecac', '#0b2a0a'),
    light: T('#f6f1dc', '#ede6c9', '#fffcef', '#f3edd2', '#e3dcb8', '#d2c99e', '#24361f', '#5f6f4f', '#93a07f', '36 54 31', '#c99410', '#e0ad2a', '#fffbe8', '#3f9a3a', '#5cb856', '#f4fff2') },
  cyberpunk: { name: 'Cyberpunk', desc: 'Neón, rejilla synthwave y escáner', bg: 'synthwave', font: 'titles', radius: 0, scan: true, glow: true,
    dark: T('#07060b', '#0d0b14', '#13101d', '#1b1729', '#26203a', '#332a4d', '#f0f6ff', '#9aa6c4', '#5f6886', '240 246 255', '#ff2bd6', '#ff7ae6', '#1a0016', '#00f0ff', '#7af8ff', '#001a1d'),
    light: T('#f2f0f7', '#e7e3f0', '#ffffff', '#efebf7', '#dfd8ee', '#cbc1e2', '#160f26', '#5b5276', '#8f86aa', '22 15 38', '#d1009f', '#ef2bbf', '#ffffff', '#0095a8', '#00b7cc', '#ffffff') },
  aero: { name: 'Frutiger Aero', desc: 'Cielo, burbujas y cristal brillante', bg: 'burbujas', font: 'normal', radius: 12, gloss: true,
    dark: T('#06223a', '#0a2c4a', '#0f3a5f', '#154872', '#1d5a8a', '#2a6ea3', '#f0fbff', '#a9d4ec', '#6fa3c4', '240 251 255', '#6ee26e', '#a6f5a6', '#073a07', '#39c6ff', '#93e3ff', '#002538'),
    light: T('#dff3ff', '#cfeaff', '#ffffff', '#eef8ff', '#d7eefc', '#bfe1f7', '#0b3354', '#3f6f93', '#7aa3c2', '11 51 84', '#2fae2f', '#4cc94c', '#ffffff', '#0a8fd6', '#2aaeee', '#ffffff') },
  teppanyaki: { name: 'Teppanyaki', desc: 'Sol rojo, olas seigaiha y sakura', bg: 'sakura', font: 'titles', radius: 0,
    dark: T('#140c0b', '#1b100e', '#241513', '#2e1b18', '#3b2420', '#4a2e29', '#f7ecdc', '#c9b29a', '#8f7766', '247 236 220', '#e2412c', '#ff6e57', '#fff3ea', '#d9a441', '#f0c56a', '#2a1a00'),
    light: T('#f7efe2', '#efe3d0', '#fffaf1', '#f4ead9', '#e8d8c0', '#d9c3a3', '#2b1a17', '#6e5548', '#a08a7c', '43 26 23', '#c4301c', '#dc4a35', '#ffffff', '#a87a1e', '#c4952f', '#ffffff') },
};
const ACCENTS = {   // color de acento a elegir (sobrescribe el del tema)
  ambar: ['Ámbar', '#ffb547', '#ffd28a', '#2b1700'], esmeralda: ['Esmeralda', '#3ddc84', '#8ef0b7', '#002b14'], diamante: ['Diamante', '#4fd8eb', '#a5eef8', '#022a30'],
  redstone: ['Redstone', '#ff4d4d', '#ff9090', '#2b0000'], amatista: ['Amatista', '#b07cff', '#d4b8ff', '#1d0b33'], oro: ['Oro', '#ffd83d', '#ffe98a', '#2b2400'],
  cobre: ['Cobre', '#e07a4f', '#f2a988', '#2b1004'], nieve: ['Nieve', '#e8eef5', '#ffffff', '#1a2230'], lapis: ['Lapislázuli', '#3b6cff', '#89a6ff', '#ffffff'], rosa: ['Rosa', '#ff6fb5', '#ffaad2', '#2b0016'],
};
const BGS = { tema: 'El del tema', noche: 'Noche estrellada', galaxia: 'Galaxia', nebulosa: 'Nebulosa', bloques: 'Bloques flotando', atardecer: 'Atardecer', aurora: 'Aurora boreal',
  synthwave: 'Synthwave', burbujas: 'Burbujas', sakura: 'Sakura', solar: 'Solarpunk', tierra: 'Tierra 2009', paisaje: 'Paisaje de bloques', lluvia: 'Lluvia de código', liso: 'Liso' };
const FONTS = { tema: 'La del tema', titles: 'Pixel en los títulos', all: 'Pixel en todo', normal: 'Normal (sin pixel)' };
const LOOK0 = { theme: 'compass', scheme: 'system', accent: 'tema', accent2: 'tema', bg: 'tema', glass: 35, blur: 10, bgDim: 0, pixel: 4, grid: true, anim: true, font: 'tema', zoom: 100, mica: false, corners: 'tema', textShadow: 'tema', trans: 'pixeles', transSpeed: 'normal' };

const mq = window.matchMedia('(prefers-color-scheme: light)');
let LOOK = { ...LOOK0 };
const schemeNow = () => LOOK.scheme === 'system' ? (mq.matches ? 'light' : 'dark') : LOOK.scheme;
const themeOf = () => THEMES[LOOK.theme] || THEMES.compass;
function applyTheme(look) {
  LOOK = { ...LOOK0, ...(look || {}) };
  const th = themeOf(), sc = schemeNow(), P = th[sc], R = document.documentElement, st = R.style;
  const set = (k, v) => st.setProperty(k, v);
  set('--ink', P.ink); set('--ink2', P.ink2); set('--s1', P.s1); set('--s2', P.s2); set('--s3', P.s3); set('--s4', P.s4);
  set('--tx', P.tx); set('--mut', P.mut); set('--dim', P.dim); set('--fgrgb', P.fg);
  let a = [P.a, P.a2, P.aInk], b = [P.b, P.b2, P.bInk];
  if (ACCENTS[LOOK.accent]) a = ACCENTS[LOOK.accent].slice(1);
  if (ACCENTS[LOOK.accent2]) b = ACCENTS[LOOK.accent2].slice(1);
  set('--amber', a[0]); set('--amber2', a[1]); set('--amberInk', a[2]); set('--teal', b[0]); set('--teal2', b[1]); set('--tealInk', b[2]);
  const glassA = Math.max(8, 100 - (+LOOK.glass || 0));
  set('--ga', glassA + '%'); set('--gb', (+LOOK.blur || 0) + 'px'); set('--bgdim', (+LOOK.bgDim || 0) / 100);
  const font = LOOK.font === 'tema' ? th.font : LOOK.font;
  const corners = LOOK.corners === 'tema' ? (th.radius ? 'round' : 'pixel') : LOOK.corners;
  const ts = LOOK.textShadow === 'tema' ? !!th.shadowText : LOOK.textShadow === 'si';
  R.dataset.theme = LOOK.theme; R.dataset.scheme = sc; R.dataset.font = font; R.dataset.corners = corners;
  R.classList.toggle('grid', !!LOOK.grid); R.classList.toggle('noanim', !LOOK.anim); R.classList.toggle('mica', !!LOOK.mica);
  R.classList.toggle('scan', !!th.scan); R.classList.toggle('glow', !!th.glow); R.classList.toggle('gloss', !!th.gloss); R.classList.toggle('bevel', !!th.bevel); R.classList.toggle('tshadow', ts);
  set('--rad', corners === 'round' ? (th.radius || 10) + 'px' : '0px');
  BG.set(LOOK.bg === 'tema' ? th.bg : LOOK.bg, +LOOK.pixel || 4, !!LOOK.anim);
}
mq.addEventListener('change', () => { if (LOOK.scheme === 'system') applyTheme(LOOK); });

// ---------- fondos ----------
const BG = (() => {
  const cv = document.createElement('canvas'); cv.id = 'bg'; cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d', { alpha: true });
  let kind = 'noche', px = 4, anim = true, W = 0, H = 0, raf = 0, last = 0, t0 = performance.now(), S = null, mode = 'play';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rnd = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (c1, c2, k) => { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`; };
  const rgba = (c, al) => `rgba(${hex(c).join(',')},${al})`;
  const pal = () => ({ ink: css('--ink') || '#15111d', ink2: css('--ink2') || '#1b1625', s2: css('--s2') || '#2b2339', s3: css('--s3') || '#372d48', a: mode === 'host' ? css('--teal') : css('--amber'), b: mode === 'host' ? css('--amber') : css('--teal'), tx: css('--tx') || '#fff', light: document.documentElement.dataset.scheme === 'light' });
  const bands = (top, bot, n, y0 = 0, y1 = H) => { for (let i = 0; i < n; i++) { ctx.fillStyle = mix(top, bot, i / (n - 1)); const a = Math.floor(y0 + (y1 - y0) * i / n), b = Math.ceil(y0 + (y1 - y0) * (i + 1) / n); ctx.fillRect(0, a, W, b - a); } };
  const ridge = (r, base, amp, step, color) => { ctx.fillStyle = color; let h = base; for (let x = 0; x < W; x += step) { h += (r() - .5) * amp; h = Math.max(base - amp * 2, Math.min(base + amp, h)); ctx.fillRect(x, H - Math.round(h), step, Math.round(h)); } };
  const circle = (cx, cy, rad, color) => { ctx.fillStyle = color; for (let y = -rad; y <= rad; y++) { const w = Math.round(Math.sqrt(rad * rad - y * y)); ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1); } };
  function setup() {
    const r = rnd(1234 + kind.length * 77);
    S = { r, stars: Array.from({ length: Math.round(W * H / 90) }, () => ({ x: r() * W | 0, y: r() * H | 0, p: r() * 6.28, s: r() < .03 ? 2 : 1, c: r() })),
      blocks: Array.from({ length: Math.round(W / 9) }, () => ({ x: r() * W, y: r() * H, s: 2 + (r() * 5 | 0), v: .6 + r() * 1.8, c: r() })),
      parts: Array.from({ length: Math.round(W / 4) }, () => ({ x: r() * W, y: r() * H, v: .3 + r(), w: r() * 6.28, c: r() })), shoot: null };
    // capas estáticas precalculadas (nebulosas, terreno) en un lienzo aparte
    S.static = document.createElement('canvas'); S.static.width = W; S.static.height = H;
    const g = S.static.getContext('2d'), P = pal(), rr = rnd(99);
    if (kind === 'galaxia' || kind === 'nebulosa') {
      const blobs = kind === 'nebulosa' ? 7 : 4;
      for (let k = 0; k < blobs; k++) {
        const cx = rr() * W, cy = rr() * H, rad = (kind === 'nebulosa' ? .25 : .18) * Math.max(W, H) * (.6 + rr()), col = k % 2 ? P.b : P.a;
        for (let i = 0; i < rad * rad * .9; i++) {
          const ang = rr() * 6.28, d = Math.pow(rr(), .7) * rad, x = cx + Math.cos(ang) * d * 1.4, y = cy + Math.sin(ang) * d * .8;
          g.fillStyle = rgba(col, (1 - d / rad) * (P.light ? .18 : .22)); g.fillRect(x | 0, y | 0, 1, 1);
        }
      }
      if (kind === 'galaxia') {   // espiral y planeta con anillo
        const cx = W * .7, cy = H * .35;
        for (let i = 0; i < 2600; i++) { const arm = i % 2, tt = rr() * 4.2, d = tt * Math.min(W, H) * .06, ang = tt * 1.9 + arm * Math.PI + (rr() - .5) * .5;
          g.fillStyle = rgba(rr() < .5 ? P.a : P.tx, (1 - tt / 4.2) * .5); g.fillRect((cx + Math.cos(ang) * d * 1.6) | 0, (cy + Math.sin(ang) * d * .7) | 0, 1, 1); }
        const pxc = W * .2, pyc = H * .72, pr = Math.max(6, Math.min(W, H) * .07);
        g.fillStyle = rgba(P.b, .35); for (let x = -pr * 2; x <= pr * 2; x++) g.fillRect((pxc + x) | 0, (pyc + x * .18) | 0, 1, 1);
        for (let y = -pr; y <= pr; y++) { const w = Math.round(Math.sqrt(pr * pr - y * y)); for (let x = -w; x < w; x++) { const sh = (x + y) / (pr * 2); g.fillStyle = mix(P.b, P.ink, Math.max(0, Math.min(.85, .25 + sh))); g.fillRect((pxc + x) | 0, (pyc + y) | 0, 1, 1); } }
        g.fillStyle = rgba(P.tx, .55); for (let x = -pr * 2; x <= pr * 2; x++) if (Math.abs(x) > pr * .9 || (pyc + x * .18) > pyc) g.fillRect((pxc + x) | 0, (pyc + x * .18 + 1) | 0, 1, 1);
      }
    }
    if (kind === 'tierra') {   // tierra procedural (no es la textura de Mojang: ruido propio en marrones)
      const cols = P.light ? ['#9b7653', '#8a6745', '#b08a62', '#7a5a3c', '#a07d58'] : ['#3a2a1d', '#33251a', '#45321f', '#2c2016', '#3f2e1f'];
      const T = 16, tile = []; for (let i = 0; i < T * T; i++) tile.push(cols[(rr() * cols.length) | 0]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { g.fillStyle = tile[(y % T) * T + (x % T)]; g.fillRect(x, y, 1, 1); }
    }
    if (kind === 'paisaje' || kind === 'solar') {
      const ground = kind === 'solar' ? ['#5aa64a', '#3f8a3a', '#2f6e2c'] : ['#5d9b3c', '#866043', '#6b4c35'];
      let h = H * .3;
      for (let x = 0; x < W; x += 3) {
        h += (rr() - .5) * 6; h = Math.max(H * .15, Math.min(H * .42, h)); const top = H - Math.round(h);
        if (kind === 'solar') { const terr = Math.round(top / 6) * 6; g.fillStyle = ground[0]; g.fillRect(x, terr, 3, H - terr); g.fillStyle = ground[1]; for (let y = terr + 6; y < H; y += 6) g.fillRect(x, y, 3, 1); }
        else { g.fillStyle = ground[0]; g.fillRect(x, top, 3, 2); g.fillStyle = ground[1]; g.fillRect(x, top + 2, 3, H - top - 2); g.fillStyle = ground[2]; if (rr() < .3) g.fillRect(x, top + 4 + (rr() * 20 | 0), 1, 1); }
        if (rr() < .05) {   // árbol
          const th2 = 6 + (rr() * 4 | 0); g.fillStyle = '#6b4c35'; g.fillRect(x + 1, top - th2, 1, th2);
          g.fillStyle = kind === 'solar' ? '#7fd17a' : '#3f7d2a'; g.fillRect(x - 2, top - th2 - 4, 7, 5);
        }
      }
    }
    if (kind === 'sakura') {   // olas seigaiha abajo
      const y0 = H * .78, r0 = 8;
      for (let row = 0; row * r0 * .5 < H - y0 + r0; row++) for (let i = -1; i * r0 * 2 < W + r0 * 2; i++) {
        const cx = i * r0 * 2 + (row % 2) * r0, cy = y0 + row * r0 * .5;
        for (let k = r0; k > 0; k -= 2) circle(cx, cy, k, k % 4 === 0 ? (P.light ? '#e8d8c0' : '#2a1714') : (P.light ? '#c4301c' : '#4a2e29'));
      }
    }
  }
  function frame(now) {
    raf = 0;
    if (!W) return;
    const t = (now - t0) / 1000, P = pal(), r = S.r;
    ctx.clearRect(0, 0, W, H);
    switch (kind) {
      case 'liso': ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, H); break;
      case 'noche': case 'aurora': {
        bands(P.light ? mix(P.ink, '#ffffff', .4) : mix(P.ink, '#000', .3), mix(P.ink2, P.a, P.light ? .25 : .18), 7);
        for (const s of S.stars) if (s.y < H * .75) { const b = .35 + .65 * Math.abs(Math.sin(t * (.6 + s.c) + s.p)); ctx.fillStyle = rgba(P.light ? P.s3 : P.tx, b * (P.light ? .6 : .9)); ctx.fillRect(s.x, s.y, s.s, s.s); }
        if (kind === 'aurora') for (let k = 0; k < 3; k++) for (let x = 0; x < W; x++) {
          const y = H * (.18 + k * .08) + Math.sin(x * .03 + t * .5 + k) * H * .05 + Math.sin(x * .011 - t * .3) * H * .04, hgt = H * .12 * (.6 + .4 * Math.sin(x * .02 + t + k));
          for (let j = 0; j < hgt; j += 2) { ctx.fillStyle = rgba(k % 2 ? P.b : P.a, .14 * (1 - j / hgt)); ctx.fillRect(x, Math.round(y + j), 1, 2); }
        }
        circle(W * .82, H * .2, Math.max(4, Math.min(W, H) * .05), P.light ? rgba('#ffffff', .9) : '#f1eadf');
        const rr = rnd(7); ridge(rr, H * .28, 6, 4, mix(P.ink2, P.a, .1)); ridge(rr, H * .18, 4, 3, P.light ? mix(P.ink, '#000', .08) : mix(P.ink, '#000', .35));
        if (kind === 'aurora') { ctx.fillStyle = P.light ? mix(P.ink, '#000', .25) : '#05040a'; for (let x = 3; x < W; x += 7 + (Math.sin(x) * 3 | 0)) { const th = 8 + (x * 13 % 9); for (let j = 0; j < th; j++) ctx.fillRect(x - Math.floor(j / 3), H - th + j, 1 + 2 * Math.floor(j / 3), 1); } }
        break;
      }
      case 'galaxia': case 'nebulosa': {
        ctx.fillStyle = P.light ? mix(P.ink, '#c9cfee', .3) : mix(P.ink, '#000', .45); ctx.fillRect(0, 0, W, H);
        ctx.drawImage(S.static, 0, 0);
        for (const s of S.stars) { const b = .3 + .7 * Math.abs(Math.sin(t * (.4 + s.c * .8) + s.p)); ctx.fillStyle = rgba(s.c > .85 ? P.a : s.c > .7 ? P.b : (P.light ? P.s3 : '#ffffff'), b); const dx = (s.x - t * (s.s * 1.2)) % W; ctx.fillRect((dx + W) % W | 0, s.y, s.s, s.s); }
        if (!S.shoot && r() < .004) S.shoot = { x: r() * W, y: r() * H * .5, l: 0 };
        if (S.shoot) { const s = S.shoot; s.l += 2; for (let i = 0; i < 10; i++) { ctx.fillStyle = rgba(P.tx, (1 - i / 10) * (1 - s.l / 90)); ctx.fillRect((s.x + s.l - i * 2) | 0, (s.y + (s.l - i * 2) * .45) | 0, 2, 1); } if (s.l > 90) S.shoot = null; }
        break;
      }
      case 'bloques': {
        bands(P.light ? P.ink : mix(P.ink, '#000', .3), P.ink2, 6);
        for (const b of S.blocks) { b.y -= b.v * .25; if (b.y < -b.s) { b.y = H + b.s; b.x = r() * W; }
          const col = b.c > .66 ? P.a : b.c > .33 ? P.b : P.s3, al = P.light ? .35 : .28;
          ctx.fillStyle = rgba(col, al); ctx.fillRect(b.x | 0, b.y | 0, b.s, b.s); ctx.fillStyle = rgba('#ffffff', al * .6); ctx.fillRect(b.x | 0, b.y | 0, b.s, 1); ctx.fillStyle = rgba('#000000', al * .6); ctx.fillRect(b.x | 0, (b.y | 0) + b.s - 1, b.s, 1); }
        break;
      }
      case 'atardecer': {
        bands(P.light ? '#ffd7a8' : '#2a1a38', P.light ? '#ff9e6b' : '#ff8a4a', 9, 0, H * .75);
        const sy = H * .58 + Math.sin(t * .2) * 2; circle(W * .5, sy, Math.max(8, Math.min(W, H) * .14), '#ffd28a');
        ctx.fillStyle = P.light ? '#ff9e6b' : '#e26a3c'; for (let i = 0; i < 5; i++) ctx.fillRect(0, (sy + 4 + i * 5) | 0, W, 1 + (i >> 1));
        const rr = rnd(3); ridge(rr, H * .3, 5, 4, P.light ? '#b0587a' : '#5a2d5e'); ridge(rr, H * .2, 4, 3, P.light ? '#7a3a5e' : '#2d1636');
        break;
      }
      case 'synthwave': {
        bands(P.light ? '#f3e8ff' : '#07060b', P.light ? '#ffd1f3' : '#2b0b3a', 8, 0, H * .62);
        const cx = W * .5, cy = H * .48, rad = Math.max(10, Math.min(W, H) * .2);
        for (let y = -rad; y <= 0; y++) { const w = Math.round(Math.sqrt(rad * rad - y * y)); const k = (y + rad) / rad; if ((y + rad) % 6 > 3 && k > .4) continue; ctx.fillStyle = mix('#ffe14d', P.a, k); ctx.fillRect(cx - w, cy + y, w * 2, 1); }
        ctx.fillStyle = P.light ? '#3a1d4f' : '#0a0712';   // ciudad
        const rr = rnd(5); for (let x = 0; x < W;) { const w = 3 + (rr() * 6 | 0), h = 4 + (rr() * H * .12 | 0); ctx.fillRect(x, H * .62 - h, w, h); x += w + (rr() * 2 | 0); }
        ctx.fillStyle = P.light ? '#fff0fb' : '#0b0614'; ctx.fillRect(0, H * .62, W, H);
        const hz = H * .62; ctx.fillStyle = rgba(P.b, .8); ctx.fillRect(0, hz | 0, W, 1);
        const off = (t * 12) % 12;
        for (let i = 0; i < 14; i++) { const z = (i * 12 + off) / 12, y = hz + Math.pow(z, 2.1) * 1.2; if (y > H) break; ctx.fillStyle = rgba(P.a, Math.min(.9, .2 + z * .08)); ctx.fillRect(0, y | 0, W, 1); }
        for (let i = -20; i <= 20; i++) { const x0 = cx + i * 4; for (let y = hz; y < H; y += 1) { const k = (y - hz) / (H - hz); ctx.fillStyle = rgba(P.b, .25 + k * .5); ctx.fillRect((cx + (x0 - cx) * (1 + k * 9)) | 0, y | 0, 1, 1); } }
        break;
      }
      case 'burbujas': {
        bands(P.light ? '#bfe7ff' : '#0a3a66', P.light ? '#f2fbff' : '#2a8fd6', 8, 0, H);
        circle(W * .15, H * .15, Math.min(W, H) * .1, rgba('#ffffff', P.light ? .55 : .18));
        for (const b of S.blocks) { b.y -= b.v * .35; b.x += Math.sin(t + b.c * 9) * .15; if (b.y < -8) { b.y = H + 8; b.x = r() * W; }
          const rad = 1 + b.s; circle(b.x, b.y, rad, rgba('#ffffff', .12)); ctx.fillStyle = rgba('#ffffff', .7); ctx.fillRect((b.x - rad * .5) | 0, (b.y - rad * .5) | 0, Math.max(1, rad >> 1), 1); }
        ctx.fillStyle = P.light ? '#7ed957' : '#2f8a2f';
        for (let x = 0; x < W; x++) { const y = H * .82 + Math.sin(x * .02 + 1) * H * .04 + Math.sin(x * .05) * 2; ctx.fillRect(x, y | 0, 1, H); }
        ctx.fillStyle = rgba('#ffffff', .35); for (let x = 0; x < W; x++) { const y = H * .82 + Math.sin(x * .02 + 1) * H * .04 + Math.sin(x * .05) * 2; ctx.fillRect(x, y | 0, 1, 1); }
        break;
      }
      case 'sakura': {
        bands(P.light ? '#fff6ea' : '#1b100e', P.light ? '#f7dcc8' : '#3b1d18', 7, 0, H * .8);
        circle(W * .7, H * .38, Math.max(10, Math.min(W, H) * .18), P.light ? '#e2412c' : '#c4301c');
        ctx.drawImage(S.static, 0, 0);
        for (const p of S.parts) { p.y += p.v * .35; p.x += Math.sin(t * 1.3 + p.w) * .35 - .15; if (p.y > H) { p.y = -2; p.x = r() * W; }
          ctx.fillStyle = p.c > .5 ? '#ffb7c9' : '#ff8fb0'; ctx.fillRect(p.x | 0, p.y | 0, 2, 1); ctx.fillRect((p.x | 0) + (Math.sin(t * 3 + p.w) > 0 ? 1 : 0), (p.y | 0) + 1, 1, 1); }
        break;
      }
      case 'solar': {
        bands(P.light ? '#fff4c9' : '#12261c', P.light ? '#cdeccb' : '#3f6b3a', 8, 0, H * .8);
        const sx = W * .78, sy = H * .22; circle(sx, sy, Math.max(6, Math.min(W, H) * .07), '#ffd97e');
        for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28 + t * .1, d = Math.min(W, H) * .1; ctx.fillStyle = rgba('#ffd97e', .5); ctx.fillRect((sx + Math.cos(a) * d) | 0, (sy + Math.sin(a) * d) | 0, 2, 2); }
        ctx.drawImage(S.static, 0, 0);
        for (const p of S.parts) { p.x += p.v * .4; p.y += Math.sin(t + p.w) * .2; if (p.x > W) { p.x = -2; p.y = r() * H * .8; } ctx.fillStyle = p.c > .5 ? '#7fd17a' : '#f2c14e'; ctx.fillRect(p.x | 0, p.y | 0, p.c > .8 ? 2 : 1, 1); }
        break;
      }
      case 'tierra': ctx.drawImage(S.static, 0, 0); ctx.fillStyle = P.light ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H); break;
      case 'paisaje': {
        bands(P.light ? '#8ecbff' : '#0e1a2b', P.light ? '#d8efff' : '#2a4a6e', 7, 0, H);
        for (let k = 0; k < 6; k++) { const cx = ((k * 97 + t * (3 + k)) % (W + 60)) - 30, cy = 10 + k * 13 % (H * .35); ctx.fillStyle = rgba('#ffffff', P.light ? .85 : .18); ctx.fillRect(cx | 0, cy | 0, 22, 5); ctx.fillRect((cx + 5) | 0, (cy - 3) | 0, 12, 3); }
        ctx.drawImage(S.static, 0, 0);
        break;
      }
      case 'lluvia': {
        ctx.fillStyle = P.light ? P.ink : '#030806'; ctx.fillRect(0, 0, W, H);
        for (const p of S.parts) { p.y += p.v * 1.4; if (p.y > H + 20) { p.y = -r() * 40; p.x = (r() * W / 3 | 0) * 3; }
          for (let j = 0; j < 12; j++) { ctx.fillStyle = rgba(j === 0 ? '#ffffff' : P.a, (1 - j / 12) * .6); ctx.fillRect(p.x | 0, (p.y - j * 3) | 0, 2, 2); } }
        break;
      }
    }
    if (anim && kind !== 'liso' && kind !== 'tierra') raf = requestAnimationFrame(tick);
  }
  function tick(now) { raf = 0; if (now - last < 70) { raf = requestAnimationFrame(tick); return; } last = now; frame(now); }
  function size() {
    const w = Math.ceil(innerWidth / px), h = Math.ceil(innerHeight / px);
    if (w === W && h === H && S) return; W = cv.width = w; H = cv.height = h; setup();
  }
  addEventListener('resize', () => { const k = W; size(); if (k !== W) frame(performance.now()); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && anim && !raf) raf = requestAnimationFrame(tick); });
  return {
    el: cv,
    set(k, p, a) { kind = k in BGS ? k : 'noche'; px = Math.max(2, Math.min(8, p || 4)); anim = a; W = 0; S = null; if (raf) cancelAnimationFrame(raf); raf = 0; requestAnimationFrame(() => { size(); frame(performance.now()); }); },
    mode(m) { if (mode === m) return; mode = m; S && setup(); frame(performance.now()); },
  };
})();

// ---------- transiciones entre Jugar y Servidores (se eligen en Ajustes > Apariencia) ----------
const TRANS = { pixeles: 'Píxeles', bloques: 'Bloques que caen', barrido: 'Barrido de rombos', cortina: 'Cortina', circulo: 'Círculo', portal: 'Portal en espiral', disolver: 'Fundido suave', deslizar: 'Deslizar', ninguna: 'Sin transición' };
const TSPEED = { rapida: 0.6, normal: 1, lenta: 1.6 };
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function shade(hex, f) {   // aclara (f>0) u oscurece (f<0) un color
  const h = String(hex).replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  if (!Number.isFinite(n)) return hex;
  const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// cada efecto pinta cuánto está tapado (t de 0 a 1). phase 0 = tapando, phase 1 = destapando
const FX = {
  pixeles(g, W, H, t, ph, S) {
    const N = 24, cs = Math.ceil(W / N), rows = Math.ceil(H / cs);
    if (!S.o) { S.o = []; for (let y = 0; y < rows; y++) for (let x = 0; x < N; x++) S.o.push({ x, y, k: (x + y) / (N + rows) + Math.random() * .18 }); }
    g.fillStyle = S.c;
    for (const c of S.o) { const on = ph === 0 ? c.k < t * 1.2 : c.k >= (1 - t) * 1.2; if (on) g.fillRect(c.x * cs, c.y * cs, cs + 1, cs + 1); }
  },
  bloques(g, W, H, t, ph, S) {   // columnas de bloques que caen y se apilan; luego se caen por abajo
    const N = 14, cs = Math.ceil(W / N), R = Math.ceil(H / cs) + 1;
    if (!S.d) S.d = Array.from({ length: N }, () => Math.random() * .35);
    const block = (x, y) => { g.fillStyle = S.c; g.fillRect(x, y, cs, cs); g.fillStyle = S.lt; g.fillRect(x, y, cs, 3); g.fillRect(x, y, 3, cs); g.fillStyle = S.dk; g.fillRect(x, y + cs - 3, cs, 3); g.fillRect(x + cs - 3, y, 3, cs); };
    for (let c = 0; c < N; c++) {
      const x = c * cs;
      if (ph === 0) {
        const l = clamp01((t - S.d[c]) / .65), f = l * R, k = Math.floor(f), fr = f - k;
        for (let i = 0; i < k; i++) block(x, H - (i + 1) * cs);
        if (k < R && l > 0) { const top = H - (k + 1) * cs; block(x, -cs + (top + cs) * (fr * fr)); }
      } else {
        const l = clamp01(((1 - t) - S.d[c]) / .65), off = l * l * (H + cs);
        for (let i = 0; i < R; i++) block(x, H - (i + 1) * cs + off);
      }
    }
  },
  barrido(g, W, H, t, ph, S) {   // rombos que crecen en diagonal y se van por el otro lado
    const N = 20, cs = Math.ceil(W / N), rows = Math.ceil(H / cs);
    g.fillStyle = S.c;
    for (let y = 0; y < rows; y++) for (let x = 0; x < N; x++) {
      const k = (x + y) / (N + rows), p = ph === 0 ? t : 1 - t;
      const sz = ph === 0 ? clamp01((p * 1.5 - k) * 3.5) : 1 - clamp01((p * 1.5 - k) * 3.5);
      if (sz <= 0) continue;
      const cx = x * cs + cs / 2, cy = y * cs + cs / 2, r = sz * cs * .75;
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath(); g.fill();
    }
  },
  cortina(g, W, H, t, ph, S) {   // dos cortinas con borde a escalones que se juntan en el centro
    const e = easeIO(t), half = W / 2 * e, st = 18;
    for (const side of [0, 1]) {
      g.fillStyle = S.c;
      for (let y = 0; y < H; y += st) {
        const jag = ((y / st) % 2) * st * .6, w = Math.max(0, half + jag - st * .3);
        side === 0 ? g.fillRect(0, y, w, st + 1) : g.fillRect(W - w, y, w, st + 1);
      }
      g.fillStyle = S.dk; const ex = side === 0 ? half - 6 : W - half;
      if (e > 0 && e < 1) g.fillRect(ex, 0, 6, H);
    }
  },
  circulo(g, W, H, t, ph, S) {   // un círculo pixelado que sale del botón de la zona y lo tapa todo
    const e = easeIO(t), ox = S.ox, oy = S.oy, R = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)) * 1.05, r = R * e, px = 10;
    g.fillStyle = S.c;
    if (ph === 0) { for (let y = 0; y < H; y += px) { const dy = y + px / 2 - oy; if (Math.abs(dy) > r) continue; const dx = Math.sqrt(r * r - dy * dy); const a = Math.floor((ox - dx) / px) * px, b = Math.ceil((ox + dx) / px) * px; g.fillRect(a, y, b - a, px); } }
    else { const cx = W / 2, cy = H / 2, R2 = Math.hypot(cx, cy) * 1.05, h = R2 * (1 - e); for (let y = 0; y < H; y += px) { const dy = y + px / 2 - cy; if (Math.abs(dy) > h) { g.fillRect(0, y, W, px); continue; } const dx = Math.sqrt(h * h - dy * dy); const a = Math.floor((cx - dx) / px) * px, b = Math.ceil((cx + dx) / px) * px; g.fillRect(0, y, a, px); g.fillRect(b, y, W - b, px); } }
  },
  portal(g, W, H, t, ph, S) {   // espiral de bloques con algo de brillo, como entrar en un portal
    const cs = 22, cols = Math.ceil(W / cs), rows = Math.ceil(H / cs), cx = W / 2, cy = H / 2, rmax = Math.hypot(cx, cy);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const dx = x * cs + cs / 2 - cx, dy = y * cs + cs / 2 - cy, a = (Math.atan2(dy, dx) / (2 * Math.PI) + 1) % 1, r = Math.hypot(dx, dy) / rmax;
      const k = ((a + r * 1.6) % 1) * .55 + r * .45, on = ph === 0 ? k < t * 1.1 : k >= (1 - t) * 1.1;
      if (!on) continue;
      const band = Math.floor(((a + r * 1.6) % 1) * 9) % 3;   // franjas en espiral, como un remolino
      g.fillStyle = band === 0 ? S.lt : band === 1 ? S.c : S.dk;
      g.fillRect(x * cs, y * cs, cs + 1, cs + 1);
    }
  },
};
function transInfo(color) { return { c: color, lt: shade(color, .28), dk: shade(color, -.3) }; }
function canvasTrans(kind, color, mid, to, sp) {
  const cv = document.createElement('canvas'), W = innerWidth, H = innerHeight;
  cv.className = 'wipe'; cv.width = W; cv.height = H; document.body.append(cv);
  const g = cv.getContext('2d'), S = transInfo(color), btn = document.querySelector(`.modes button[data-mode="${to}"]`), br = btn ? btn.getBoundingClientRect() : null;
  S.ox = br ? br.left + br.width / 2 : W / 2; S.oy = br ? br.top + br.height / 2 : 0;
  const D = (kind === 'bloques' ? 420 : kind === 'cortina' || kind === 'circulo' ? 340 : 300) * sp, hold = 70 * sp;
  let start = performance.now(), phase = 0, held = false;
  const fx = FX[kind] || FX.pixeles;
  const step = now => {
    const p = clamp01((now - start) / D);
    g.clearRect(0, 0, W, H);
    try { fx(g, W, H, phase === 0 ? p : 1 - p, phase, S); } catch (e) { console.error(e); }
    if (p < 1) return requestAnimationFrame(step);
    if (phase === 0 && !held) { held = true; try { mid(); } catch (e) { console.error(e); } start = now; return requestAnimationFrame(step2); }
    cv.remove();
  };
  const step2 = now => {   // un instante tapado del todo mientras se pinta la otra zona
    g.clearRect(0, 0, W, H); g.fillStyle = S.c; g.fillRect(0, 0, W, H);
    if (now - start < hold) return requestAnimationFrame(step2);
    phase = 1; start = now; requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function cssTrans(kind, mid, to, sp) {   // fundido o deslizamiento del contenido (sin capa de color)
  const R = document.documentElement, ms = Math.round((kind === 'deslizar' ? 230 : 260) * sp);
  R.style.setProperty('--tms', ms + 'ms'); R.dataset.tdir = to === 'host' ? 'l' : 'r';
  R.classList.add('t-' + kind, 't-out');
  setTimeout(() => {
    try { mid(); } catch (e) { console.error(e); }
    R.classList.remove('t-out'); R.classList.add('t-in');
    requestAnimationFrame(() => requestAnimationFrame(() => R.classList.remove('t-in')));
    setTimeout(() => R.classList.remove('t-' + kind), ms + 60);
  }, ms);
}
function modeTransition(color, mid, to, force) {
  const kind = (LOOK && LOOK.trans) || 'pixeles', sp = TSPEED[LOOK && LOOK.transSpeed] || 1;
  if ((!force && document.documentElement.classList.contains('noanim')) || kind === 'ninguna' || document.querySelector('canvas.wipe')) { mid(); return; }
  if (kind === 'disolver' || kind === 'deslizar') return cssTrans(kind, mid, to, sp);
  canvasTrans(kind, color, mid, to, sp);
}
function pixelWipe(color, mid) { modeTransition(color, mid, 'host'); }   // compatibilidad
