'use strict';
/* Compass Launcher · interfaz 4.4 */

// ---------- errores internos: se guardan en el registro y se avisa con un mensaje corto (sin cajas rojas) ----------
const seenErr = new Set();
function reportError(e, where = '') {
  const msg = String(e && (e.stack || e.message) || e);
  try { window.api && window.api.call('logError', (where ? where + ': ' : '') + msg).catch(() => {}); } catch {}
  console.error(e);
  const key = String(e && e.message || e).slice(0, 120);
  if (!document.getElementById('toasts')) return;
  // fallos del proceso principal (sin conexión, archivo no encontrado…): se enseña su mensaje tal cual
  if (/^Error invoking remote method/.test(String(e && e.message))) { toast(clean(e), 'error', 7000); return; }
  if (seenErr.has(key)) return; seenErr.add(key);
  toast('Algo ha fallado, pero puedes seguir usando el launcher. Los detalles quedan en Ajustes, Registro.', 'warn', 6000);
}
window.addEventListener('error', e => reportError(e.error || e.message, 'línea ' + e.lineno));
window.addEventListener('unhandledrejection', e => reportError(e.reason, 'promesa'));

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const A = window.api || { call: async () => { throw new Error('window.api no existe: el preload no se cargó'); }, on: () => {}, pathOf: () => '' };
const ic = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">${ICONS[n] || ''}</svg>`;
const paintIcons = (r = document) => $$('[data-i]', r).forEach(e => { if (e.dataset.done !== '1') { e.insertAdjacentHTML('afterbegin', ic(e.dataset.i, +e.dataset.s || 18)); e.dataset.done = '1'; } });
function el(t, a = {}, ...k) {
  const e = document.createElement(t);
  for (const [x, y] of Object.entries(a)) {
    if (x === 'class') e.className = y; else if (x === 'html') e.innerHTML = y; else if (x === 'style' && typeof y === 'object') Object.assign(e.style, y);
    else if (x.startsWith('on') && typeof y === 'function') e.addEventListener(x.slice(2), y); else if (y !== false && y != null) e.setAttribute(x, y === true ? '' : y);
  }
  for (const c of k.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const I = (n, s) => el('span', { html: ic(n, s), style: 'display:contents' });
const clean = e => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
const sizeOf = b => b >= 2 ** 30 ? (b / 2 ** 30).toFixed(1) + ' GB' : b >= 2 ** 20 ? (b / 2 ** 20).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';
const dateOf = t => t ? new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const dur = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`; };
const gb = r => parseInt(r) || 4;
const target = (kind, id) => ({ kind, id });
const store = { get: k => { try { return JSON.parse(localStorage.getItem('cl.' + k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('cl.' + k, JSON.stringify(v)); } catch {} } };

function toast(msg, type = 'info', ms = 5000) {
  const t = el('div', { class: 'toast ' + type, role: 'status' }, I(type === 'ok' ? 'check' : type === 'info' ? 'info' : 'alert', 18), el('div', {}, msg));
  const box = $('#toasts'); box.append(t);
  while (box.childElementCount > 4) box.firstChild.remove();   // como mucho 4 avisos a la vez
  t.onclick = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}
function modal(title, body, buttons, wide) {
  return new Promise(res => {
    const done = v => { m.remove(); document.removeEventListener('keydown', esc); res(v); };
    const esc = e => { if (e.key === 'Escape') done(null); };
    const m = el('div', { id: 'modal', onmousedown: e => { if (e.target === m) done(null); } },
      el('div', { class: 'box' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, el('h2', {}, title), body,
        el('div', { class: 'acts' }, ...buttons.map(b => el('button', { class: 'btn ' + (b.cls || ''), onclick: () => done(typeof b.v === 'function' ? b.v() : b.v) }, b.t)))));
    document.body.append(m); document.addEventListener('keydown', esc);
    const i = $('input:not([type=checkbox]),select,textarea', m); if (i) i.focus();
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { const p = $$('.acts .btn', m).pop(); if (p) p.click(); } });
  });
}
const confirmBox = (title, text, ok = 'Confirmar') => modal(title, el('p', { style: 'color:var(--mut)' }, text), [{ t: 'Cancelar', v: false }, { t: ok, v: true, cls: 'dng' }]);
async function ask(title, label, value = '', ok = 'Guardar') {
  const i = el('input', { class: 'in', value, spellcheck: 'false' });
  const r = await modal(title, el('div', {}, el('label', { class: 'f' }, label), i), [{ t: 'Cancelar', v: null }, { t: ok, v: () => i.value, cls: 'pri' }]);
  return r == null ? null : String(r).trim();
}
async function act(b, fn) {
  if (b && (b.disabled || b.classList.contains('busy'))) return;
  if (b) { b.classList.add('busy'); b.disabled = true; }
  try { return await fn(); } catch (e) { toast(clean(e), 'error', 7000); A.call('logError', clean(e)).catch(() => {}); }
  finally { if (b) { b.classList.remove('busy'); b.disabled = false; } }
}
const B = (icon, text, fn, cls = '') => el('button', { class: 'btn ' + cls, onclick: e => act(e.currentTarget, fn) }, icon ? I(icon, cls.includes('sm') ? 14 : 16) : null, text);
const sw = (on, fn) => el('span', { class: 'sw' }, el('input', { type: 'checkbox', checked: !!on, onchange: e => fn(e.target.checked) }));
function avatar(box, name, uuid) {
  box.replaceChildren();
  if (uuid || name) { const i = el('img', { src: `https://mc-heads.net/avatar/${uuid || name}/48?t=${Math.floor((typeof SKIN_T === 'number' ? SKIN_T : 0) / 1000)}`, alt: '' }); i.onerror = () => { box.textContent = (name || '?')[0].toUpperCase(); }; box.append(i); }
  else box.textContent = '?';
}
const head = name => { const d = el('span', { class: 'head' }); avatar(d, name); return d; };

// ---------- estado ----------
let ST = { profiles: [], servers: [], active: null, ram: '4G', game: 'idle', host: { id: null, state: 'off', players: [] }, hasKey: false }, SYS = { totalGb: 16, versions: [] }, ME = null;
const P = id => ST.profiles.find(p => p.id === id), SV = id => ST.servers.find(s => s.id === id);
let CODE = '';
let MODE = store.get('mode') === 'host' ? 'host' : 'play', PAGE = 'home', selP = null, selS = store.get('selS'), TAB = 'resumen', PREV = 'home';
const reload = async () => { Object.assign(ST, await A.call('state')); if (!P(selP)) selP = ST.active; if (!SV(selS)) selS = ST.servers[0] && ST.servers[0].id; };
const vcmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; };
// servidores: solo versiones con Fabric/Paper
const srvMcSelect = (cur, dis) => { const s = el('select', { class: 'in', disabled: !!dis }); [...new Set([cur, ...SYS.versions])].filter(Boolean).sort(vcmp).forEach(v => s.append(el('option', { value: v }, 'Minecraft ' + v))); s.value = cur; return s; };
// selector de versión: todas las de Mojang. Las snapshots, betas y alphas solo si las activas en Ajustes › Al jugar
const mcSelect = (cur, dis) => {
  const s = el('select', { class: 'in', disabled: !!dis });
  const all = SYS.all && SYS.all.length ? SYS.all : SYS.versions.map(id => ({ id, type: 'release', fabric: true }));
  const show = v => v.type === 'release' || SYS.snapshots || v.id === cur;
  const lbl = v => 'Minecraft ' + v.id + (v.fabric ? '' : ' (sin mods)');
  const groups = [['release', 'Versiones'], ['snapshot', 'Snapshots (de prueba)'], ['old_beta', 'Beta antiguas'], ['old_alpha', 'Alpha antiguas']];
  for (const [type, name] of groups) {
    const vs = all.filter(v => v.type === type && show(v)); if (!vs.length) continue;
    s.append(el('optgroup', { label: name }, ...vs.map(v => el('option', { value: v.id }, lbl(v)))));
  }
  if (cur && !all.some(v => v.id === cur)) s.prepend(el('option', { value: cur }, 'Minecraft ' + cur));
  s.value = cur; return s;
};
const ramMax = () => Math.max(2, Math.min(32, SYS.totalGb - 2));
function ramField(cur, onSave, label = 'Memoria RAM') {
  const r = el('input', { type: 'range', min: 1, max: ramMax(), step: 1 }), v = el('span', {});
  r.value = Math.min(gb(cur), ramMax()); v.textContent = ' ' + r.value + ' GB';
  r.oninput = () => v.textContent = ' ' + r.value + ' GB'; r.onchange = () => onSave(r.value + 'G');
  return el('div', {}, el('label', { class: 'f' }, label, v), r, el('div', { class: 'hint' }, `Tu PC tiene ${SYS.totalGb} GB. Con 4 a 6 GB va bien para casi cualquier pack de mods.`));
}
const HS = { off: ['Apagado', ''], starting: ['Arrancando', 'warn'], ready: ['En línea', 'on'], stopping: ['Apagándose', 'warn'], restarting: ['Reiniciando', 'warn'] };
const hostOf = id => ST.host.id === id ? ST.host : { id: null, state: 'off', players: [] };

// ---------- zonas y navegación ----------
const hostOn = () => ST.showHost !== false;
function applyHostZone() {   // quien solo juega no ve nada de servidores: ni la pestaña ni los avisos
  const on = hostOn();
  $('.modes').hidden = !on; document.body.classList.toggle('playonly', !on);
  if (!on && MODE === 'host') setMode('play');
}
function setMode(m, opts = {}) {
  if (m === 'host' && !hostOn()) m = 'play';
  if (setOpen()) closeSettings();
  if (document.body.classList.contains('ready') && m !== MODE) {   // transición pixelada con el color de la zona a la que vas
    const c = getComputedStyle(document.documentElement).getPropertyValue(m === 'host' ? '--teal' : '--amber').trim() || '#ffb547';
    modeTransition(c, () => setModeNow(m, opts), m); return;
  }
  setModeNow(m, opts);
}
function setModeNow(m, opts = {}) {
  MODE = m; BG.mode(m); store.set('mode', m);
  $('#app').dataset.mode = m; document.body.dataset.mode = m;
  $$('.modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#railPlay').hidden = m !== 'play'; $('#railHost').hidden = m !== 'host';
  paintRailFoot(); paintPill();
  // al volver a Jugar desde Servidores (o desde Ajustes) se abre la última página de Jugar; si no hay, Inicio
  if (m === 'play') go(opts.page || (PLAY_PAGES[PAGE] && PAGE !== 'settings' ? PAGE : PREV) || 'home');
  else openHost();
}
const PLAY_PAGES = { home: () => renderHome(), profiles: () => renderProfiles(), mods: () => renderModsPage() };
// las animaciones de entrada se ven al cambiar de página o de sección; al actualizar datos o pulsar botones, no
function entering() { const R = document.documentElement; R.classList.add('enter'); clearTimeout(entering.t); entering.t = setTimeout(() => R.classList.remove('enter'), 1300); }
function go(p) {
  if (p === 'settings') { openSettings(); return; }
  entering();
  if (!PLAY_PAGES[p]) p = 'home';   // nunca dejar la pantalla vacía por una página desconocida
  if (p !== 'settings') PREV = p;
  PAGE = p; $('#h-server').hidden = true;
  $$('.page').forEach(s => s.classList.toggle('on', s.id === 'p-' + p));
  $$('#railPlay .nav').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  $('#view').scrollTop = 0;
  try { const r = PLAY_PAGES[p](); if (r && r.catch) r.catch(e => reportError(e)); }
  catch (e) { reportError(e); if (p !== 'home') go('home'); }
}
function openHost() {
  entering();
  PAGE = 'host'; $$('.page').forEach(s => s.classList.remove('on')); $('#h-server').hidden = false; $('#view').scrollTop = 0;
  renderRailServers(); renderHost();
}
$$('.modes button').forEach(b => b.onclick = () => { if (MODE !== b.dataset.mode) setMode(b.dataset.mode); else if (setOpen()) closeSettings(); });
$$('#railPlay .nav').forEach(b => b.onclick = () => go(b.dataset.p));
$('#gear').onclick = () => setOpen() ? closeSettings() : openSettings();
// botones de la ventana (minimizar, maximizar / restaurar, cerrar)
{
  const wc = $('#winctl'), paintWin = w => { if (!w) return; wc.classList.toggle('max', !!(w.max || w.full)); $('[data-w=max]', wc).title = w.max || w.full ? 'Restaurar' : 'Maximizar'; document.body.classList.toggle('blurred', w.focus === false); };
  wc.querySelectorAll('button').forEach(b => b.onclick = async () => paintWin(await A.call('win', b.dataset.w)));
  A.on('winState', paintWin); A.call('win', 'state').then(paintWin).catch(() => {});
}
$('#setClose').onclick = () => closeSettings();
$('#setOverlay').addEventListener('mousedown', e => { if (e.target.id === 'setOverlay') closeSettings(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && setOpen() && !$('#modal')) closeSettings(); });
$('#railJoin').onclick = () => joinDialog();
$('#railNewProf').onclick = () => newProfileDialog();
$('#railProfSec')._ctx = () => [{ i: 'plus', t: 'Nuevo perfil', f: newProfileDialog }, { i: 'profiles', t: 'Ver todos los perfiles', f: () => { setMode('play'); go('profiles'); } }];
$('#railFriendSec')._ctx = () => [{ i: 'door', t: 'Unirme a un servidor', f: joinDialog }];   // (ctx() aún no existe aquí)
$('#railNew').onclick = () => newServerDialog();
document.addEventListener('keydown', e => {
  if (!e.ctrlKey) return;
  if (e.key === '1') { e.preventDefault(); setMode('play'); }
  if (e.key === '2' && hostOn()) { e.preventDefault(); setMode('host'); }
  if (e.key === ',') { e.preventDefault(); $('#gear').click(); }
});
['dragover', 'drop'].forEach(n => document.addEventListener(n, e => e.preventDefault()));
function paintRailFoot() {
  const f = $('#railFoot');
  f.replaceChildren(MODE === 'play'
    ? el('button', { class: 'btn pri', onclick: () => joinDialog() }, I('door', 16), el('span', {}, 'Unirme a un servidor'))
    : el('button', { class: 'btn pri', onclick: () => newServerDialog() }, I('plus', 16), el('span', {}, 'Nuevo servidor')));
}
function paintPill() {
  const h = ST.host, s = h.id && SV(h.id), p = $('#hostPill');
  p.hidden = !s || !hostOn() || (MODE === 'host' && selS === h.id && PAGE === 'host');
  if (!s) return;
  const M = HS[h.state] || HS.off;
  p.replaceChildren(el('span', { class: 'light ' + M[1] }), el('span', {}, s.name), el('small', {}, h.state === 'ready' ? plural(h.players.length, 'jugador', 'jugadores') : M[0]));
  p.onclick = () => { selS = h.id; store.set('selS', selS); TAB = 'resumen'; setMode('host'); };
}

// ---------- cuenta ----------
function paintAcct() {
  const a = $('#acct'); a.replaceChildren();
  if (ME) { const av = el('span', { class: 'av' }); avatar(av, ME.name, ME.uuid); a.append(el('button', { class: 'acct', title: 'Tu skin y tu capa', onclick: () => skinDialog() }, av, ME.name)); }
  else a.append(el('button', { class: 'btn sm', onclick: e => doLogin(e.currentTarget) }, I('user', 14), 'Iniciar sesión'));
}
// ---------- tu skin y tu capa ----------
const loadImg = src => new Promise((res, rej) => { if (!src) return rej(new Error('sin imagen')); const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagen rota')); i.src = src; });
// dibuja al personaje de frente o de espaldas (16×32 «píxeles» de skin), con la capa por detrás
function drawSkin(cv, img, slim, back, cape, k = 8) {
  cv.width = 16 * k; cv.height = 32 * k; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
  if (!img) return;
  const legacy = img.height === 32, w = slim ? 3 : 4, sx = img.width / 64;
  const part = (x, y, pw, ph, dx, dy, mirror) => {
    g.save();
    if (mirror) { g.translate((dx + pw) * k, dy * k); g.scale(-1, 1); g.drawImage(img, x * sx, y * sx, pw * sx, ph * sx, 0, 0, pw * k, ph * k); }
    else g.drawImage(img, x * sx, y * sx, pw * sx, ph * sx, dx * k, dy * k, pw * k, ph * k);
    g.restore();
  };
  if (!back) {
    part(8, 8, 8, 8, 4, 0); part(20, 20, 8, 12, 4, 8);
    part(44, 20, w, 12, 4 - w, 8); legacy ? part(44, 20, w, 12, 12, 8, true) : part(36, 52, w, 12, 12, 8);
    part(4, 20, 4, 12, 4, 20); legacy ? part(4, 20, 4, 12, 8, 20, true) : part(20, 52, 4, 12, 8, 20);
    part(40, 8, 8, 8, 4, 0);
    if (!legacy) { part(20, 36, 8, 12, 4, 8); part(44, 36, w, 12, 4 - w, 8); part(52, 52, w, 12, 12, 8); part(4, 36, 4, 12, 4, 20); part(4, 52, 4, 12, 8, 20); }
  } else {
    const rb = slim ? 51 : 52, lb = slim ? 43 : 44, lbo = slim ? 59 : 60;
    part(24, 8, 8, 8, 4, 0); part(32, 20, 8, 12, 4, 8);
    legacy ? part(rb, 20, w, 12, 4 - w, 8, true) : part(lb, 52, w, 12, 4 - w, 8); part(rb, 20, w, 12, 12, 8);
    legacy ? part(12, 20, 4, 12, 4, 20, true) : part(28, 52, 4, 12, 4, 20); part(12, 20, 4, 12, 8, 20);
    part(56, 8, 8, 8, 4, 0);
    if (!legacy) { part(32, 36, 8, 12, 4, 8); part(lbo, 52, w, 12, 4 - w, 8); part(rb, 36, w, 12, 12, 8); part(12, 52, 4, 12, 4, 20); part(12, 36, 4, 12, 8, 20); }
    if (cape) { const cs = cape.width / 64; g.drawImage(cape, 1 * cs, 1 * cs, 10 * cs, 16 * cs, 3 * k, 8 * k, 10 * k, 16 * k); }
  }
}
function capeThumb(img, k = 5) { const c = el('canvas', { width: 10 * k, height: 16 * k }), g = c.getContext('2d'); g.imageSmoothingEnabled = false; if (img) { const cs = img.width / 64; g.drawImage(img, cs, cs, 10 * cs, 16 * cs, 0, 0, 10 * k, 16 * k); } return c; }
var SKIN_T = Date.now();
async function skinDialog() {
  if (!ME) { toast('Inicia sesión para ver y cambiar tu skin', 'warn'); return; }
  const front = el('canvas', { class: 'skincv' }), backc = el('canvas', { class: 'skincv' });
  const stage = el('div', { class: 'skinstage' }, el('div', {}, front, el('small', {}, 'De frente')), el('div', {}, backc, el('small', {}, 'De espaldas')));
  const side = el('div', { class: 'skinside' }, el('div', { class: 'empty', style: 'padding:30px' }, el('span', { class: 'spin' }), 'Cargando tu skin…'));
  const body = el('div', { class: 'skinwrap' }, stage, side);
  let D = null, pending = null, busy = false;
  const run = async (fn, ok) => {
    if (busy) return; busy = true; side.classList.add('busy');
    try { await fn(); if (ok) toast(ok, 'ok', 3500); SKIN_T = Date.now(); paintAcct(); await load(); }
    catch (e) { toast(clean(e), 'error', 7000); } finally { busy = false; side.classList.remove('busy'); }
  };
  async function paintChar(data, variant, capeData) {
    let img = null, cape = null; try { img = await loadImg(data); } catch {} try { cape = capeData ? await loadImg(capeData) : null; } catch {}
    drawSkin(front, img, variant === 'slim', false); drawSkin(backc, img, variant === 'slim', true, cape);
  }
  async function paint() {
    const cur = D.skin || {}, capeOn = D.capes.find(c => c.on);
    const show = pending || { data: cur.data, variant: cur.variant || 'classic' };
    await paintChar(show.data, show.variant, capeOn && capeOn.data);
    const modelSeg = el('div', { class: 'seg' }, ...[['classic', 'Brazos normales'], ['slim', 'Brazos finos']].map(([v, t]) => el('button', { class: show.variant === v ? 'on' : '',
      onclick: () => { if (pending) { pending.variant = v; paint(); } else if (cur.url && cur.variant !== v) run(() => A.call('skinVariant', { url: cur.url, data: cur.data, variant: v }), 'Modelo cambiado'); } }, t)));
    const libGrid = el('div', { class: 'skinlib' }, ...D.lib.map(x => {
      const c = el('canvas'); loadImg(x.data).then(i => drawSkin(c, i, x.variant === 'slim', false, null, 3)).catch(() => {});
      return ctx(el('button', { class: 'sk' + (cur.data && x.data === cur.data ? ' on' : ''), title: x.name + ' · clic para ponértela', onclick: () => run(() => A.call('skinSet', { data: x.data, variant: x.variant, name: x.name }), 'Skin puesta: ' + x.name) }, c),
        () => [{ t: x.name, title: true }, { i: 'check', t: 'Ponérmela', f: () => run(() => A.call('skinSet', { data: x.data, variant: x.variant, name: x.name }), 'Skin puesta') },
          { i: 'trash', t: 'Quitar de mis skins', dng: true, f: async () => { D.lib = await A.call('skinForget', x.file); paint(); } }]);
    }));
    const capeGrid = el('div', { class: 'capes' },
      el('button', { class: 'cape' + (!capeOn ? ' on' : ''), title: 'Sin capa', onclick: () => capeOn && run(() => A.call('capeSet', null), 'Capa quitada') }, el('span', { html: ic('x', 22) }), el('small', {}, 'Sin capa')),
      ...D.capes.map(c => { const b = el('button', { class: 'cape' + (c.on ? ' on' : ''), title: c.name, onclick: () => !c.on && run(() => A.call('capeSet', c.id), 'Capa puesta: ' + c.name) }, el('small', {}, c.name));
        loadImg(c.data).then(i => b.prepend(capeThumb(i))).catch(() => b.prepend(el('span', { html: ic('shield', 22) }))); return b; }));
    side.replaceChildren(...[
      el('h3', {}, D.name),
      pending ? el('div', { class: 'banner info', style: 'margin-bottom:12px' }, I('info', 18), el('div', { class: 't' }, el('b', {}, 'Vista previa: ' + (pending.name || 'skin nueva')), el('small', { style: 'display:block' }, 'Elige el modelo y pulsa «Ponérmela».')),
        el('button', { class: 'btn sm ghost', onclick: () => { pending = null; paint(); } }, 'Cancelar'), el('button', { class: 'btn sm pri', onclick: () => { const p = pending; pending = null; run(() => A.call('skinSet', p), 'Skin cambiada'); } }, 'Ponérmela')) : null,
      el('label', { class: 'f' }, 'Modelo'), modelSeg,
      el('div', { class: 'row', style: 'margin-top:12px' },
        B('upload', 'Subir una skin…', async () => { const r = await A.call('skinPick'); if (!r) return; pending = { data: r.data, name: r.name, variant: (D.skin && D.skin.variant) || 'classic' }; paint(); }, 'sm pri'),
        B('external', 'Buscar skins', () => A.call('openUrl', 'https://www.minecraftskins.com/'), 'sm'),
        B('refresh', 'Skin de serie', () => run(() => A.call('skinReset'), 'Skin de serie puesta'), 'sm ghost')),
      el('label', { class: 'f' }, 'Mis skins', el('small', { style: 'margin-left:8px;color:var(--dim)' }, 'Las que subes se guardan aquí: un clic y te la pones')),
      D.lib.length ? libGrid : el('p', { class: 'hint' }, 'Aún ninguna.'),
      el('label', { class: 'f' }, 'Capa'), D.capes.length ? capeGrid : el('p', { class: 'hint' }, 'Tu cuenta no tiene capas (las dan en eventos de Minecraft, Minecon o con algunas compras).'),
      el('p', { class: 'hint', style: 'margin-top:12px' }, 'Los cambios son de tu cuenta de Minecraft: se ven en todos los servidores y launchers. Pueden tardar un minuto en verse dentro del juego.')].filter(Boolean));
  }
  async function load() { D = await A.call('skinGet'); await paint(); }
  const dropTo = e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f || !/\.png$/i.test(f.name)) return; const r = new FileReader(); r.onload = () => { pending = { data: r.result, name: f.name.replace(/\.png$/i, ''), variant: (D && D.skin && D.skin.variant) || 'classic' }; if (D) paint(); }; r.readAsDataURL(f); };
  body.addEventListener('drop', dropTo);
  load().catch(e => side.replaceChildren(el('div', { class: 'empty', style: 'padding:30px' }, el('b', {}, 'No he podido leer tu skin'), clean(e))));
  await modal('Tu skin y tu capa', body, [{ t: 'Cerrar', v: true }], true);
}
const doLogin = b => act(b, async () => { ME = await A.call('login'); paintAcct(); if (PAGE === 'home') renderHome(); refreshSettings(); toast('Hola, ' + ME.name, 'ok'); });

// ---------- líneas de consola (solo la del servidor; lo del juego se guarda en el registro) ----------
function lineCls(x) { return /ERROR|Exception|FATAL|\bfail/i.test(x) ? 'e' : /WARN/.test(x) ? 'w' : /^\[Compass\]|^> /.test(x) ? 'c' : / joined the game/.test(x) ? 'j' : ''; }
function addLine(L, x) {
  const end = L.scrollTop + L.clientHeight >= L.scrollHeight - 40;
  L.append(el('div', { class: lineCls(x) }, x));
  while (L.childElementCount > 1500) L.firstChild.remove();
  if (end || L.dataset.follow === '1') L.scrollTop = 1e9;
}

// ---------- progreso global ----------
let PROG = { label: '', pct: 0 };
const progOn = p => !!p.label && p.pct > 0 && (p.pct < 100 || p.label === 'Iniciando Minecraft');
function paintProg(g, p = PROG) {
  const on = progOn(p); g.classList.toggle('on', on);
  if (on) { $('.gl', g).textContent = p.label; $('.gp', g).textContent = p.pct + '%'; $('i', g).style.width = p.pct + '%'; }
}
A.on('progress', p => { PROG = p; $$('.gprog').forEach(g => paintProg(g)); });
const progBox = () => el('div', { class: 'gprog' }, el('div', { class: 'row' }, el('span', { class: 'gl' }), el('span', { class: 'gp' })), el('div', { class: 'track' }, el('i')));

// =====================================================================
// JUGAR · Inicio
// =====================================================================
function landscape() {   // atardecer a bloques, generado (siempre igual) con colinas escalonadas
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const hill = (base, amp, w, color, op = 1) => {
    let x = 0, pts = `0,400 `; let y = base;
    while (x <= 1240) { y = Math.round((base + (rnd() - .5) * amp * 2) / 10) * 10; pts += `${x},${y} ${x + w},${y} `; x += w; }
    return `<polygon points="${pts}1240,400" fill="${color}" opacity="${op}"/>`;
  };
  let stars = ''; for (let i = 0; i < 34; i++) { const s = rnd() > .8 ? 4 : 2; stars += `<rect x="${Math.round(rnd() * 1200)}" y="${Math.round(rnd() * 150)}" width="${s}" height="${s}" fill="#fff" opacity="${(.25 + rnd() * .5).toFixed(2)}"/>`; }
  return `<svg class="land" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#22163a"/><stop offset=".42" stop-color="#5c2a56"/><stop offset=".7" stop-color="#c25a5c"/><stop offset=".9" stop-color="#ffab5c"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1226" stop-opacity=".85"/><stop offset=".55" stop-color="#1b1226" stop-opacity="0"/></linearGradient></defs>
  <rect width="1200" height="400" fill="url(#sky)"/>${stars}
  <g class="sun"><rect x="826" y="166" width="120" height="120" fill="#ffcf7a" opacity=".25"/><rect x="846" y="186" width="80" height="80" fill="#ffe7ad"/><rect x="858" y="198" width="56" height="56" fill="#fff4d6"/></g>
  ${hill(250, 30, 60, '#9a4466', .9)}${hill(285, 26, 40, '#6a2f58')}${hill(320, 22, 30, '#43234a')}${hill(352, 14, 20, '#2a1b35')}
  <rect width="1200" height="400" fill="url(#fade)"/></svg>`;
}
function profilePicker(anchor) {
  const old = $('.picker'); if (old) { old.remove(); return; }
  const r = anchor.getBoundingClientRect(), v = $('#view').getBoundingClientRect();
  const pk = el('div', { class: 'picker', style: `left:${r.left - v.left}px;top:${r.bottom - v.top + $('#view').scrollTop + 6}px` },
    ...ST.profiles.map(p => el('button', { onclick: async () => { pk.remove(); await A.call('setActive', p.id); await reload(); renderHome(); renderFriends(); } },
      p.icon ? el('span', { class: 'ico40' }, el('img', { src: p.icon, alt: '', style: 'width:100%;height:100%;border-radius:3px;image-rendering:pixelated' })) : el('span', { class: 'ico40', html: ic(p.own ? 'server' : p.kind === 'friend' ? 'users' : 'cube', 18) }),
      el('span', { class: 't' }, el('b', {}, p.name, p.id === ST.active ? el('span', { class: 'tag acc', style: 'margin-left:8px' }, 'Activo') : null), el('small', {}, `Minecraft ${p.mc}${p.own ? ', tu servidor' : p.kind === 'friend' ? ', servidor de amigo' : ''}${p.desc && p.kind !== 'friend' ? ' · ' + p.desc.slice(0, 40) : ''}`)))),
    el('div', { class: 'sep', style: 'margin:6px 0' }),
    el('button', { onclick: () => { pk.remove(); newProfileDialog(); } }, I('plus', 16), 'Nuevo perfil'),
    el('button', { onclick: () => { pk.remove(); joinDialog(); } }, I('door', 16), 'Unirme a un servidor'));
  $('#view').append(pk);
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pk.contains(e.target)) { pk.remove(); document.removeEventListener('mousedown', off); } }), 0);
}
async function renderHome() {
  const p = P(ST.active), R = $('#p-home');
  if (!p) { R.replaceChildren(el('div', { class: 'empty', style: 'margin-top:60px' }, el('div', { html: ic('cube', 44) }), el('b', {}, 'No hay ningún perfil'), 'Crea uno para empezar a jugar.',
    el('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, el('button', { class: 'btn pri', onclick: newProfileDialog }, I('plus', 16), 'Nuevo perfil')))); return; }
  const busy = ST.game === 'preparing', running = ST.game === 'running', friend = p.kind === 'friend';
  const goBtn = el('button', { class: 'go', id: 'launch', disabled: busy || running, onclick: e => act(e.currentTarget, () => launchFlow()).then(() => reload().then(renderHome)) },
    busy ? el('span', { class: 'spin' }) : I(running ? 'check' : 'play', 26), busy ? 'Preparando' : running ? 'En partida' : 'Jugar');
  const modsChip = el('button', { class: 'chip', onclick: () => { selP = p.id; go('profiles'); } }, I('cube', 14), '… mods');
  A.call('modCount', target('profile', p.id)).then(n => { modsChip.lastChild.textContent = plural(n, 'mod', 'mods'); });
  const lead = running ? 'Minecraft está abierto. Esto se actualiza solo cuando lo cierres.'
    : busy ? 'Preparando Java, la versión y los mods. La primera vez tarda un poco más.'
    : friend && p.autoJoin !== false ? (p.compass === false ? `Al pulsar Jugar entras directo a ${p.name}, sin pasar por el menú de Minecraft.` : `Al pulsar Jugar se sincronizan los mods de ${p.name} y entras directo a su servidor.`)
    : 'Pulsa Jugar: Java, la versión y Fabric se preparan solos.';
  const scene = el('div', { class: 'scene', html: landscape() },
    el('div', { class: 'who' }, I(friend ? 'users' : 'user', 14), ME ? `${ME.name}, vas a jugar con` : 'Vas a jugar con'),
    el('button', { class: 'pname', title: 'Cambiar de perfil', onclick: e => profilePicker(e.currentTarget) }, el('span', {}, p.name), I('chevdown', 30)),
    el('div', { class: 'facts' },
      el('button', { class: 'chip', onclick: () => { selP = p.id; go('profiles'); } }, I('layers', 14), 'Minecraft ' + p.mc),
      el('button', { class: 'chip', onclick: () => { selP = p.id; go('profiles'); } }, I('bolt', 14), gb(p.ram) + ' GB de RAM'), modsChip,
      friend ? el('span', { class: 'chip' }, I(p.own ? 'server' : 'link', 14), p.own ? 'Tu servidor' : 'Servidor de amigo') : null),
    el('p', { class: 'lead' }, lead),
    el('div', { class: 'launch' }, goBtn, progBox()));

  // servidores de amigos: tarjetas con su estado en directo; para unirse basta la IP o el código
  const friends = ST.profiles.filter(x => x.kind === 'friend' && !x.own);
  // el texto se conserva aunque la pantalla se repinte (cambios del servidor, del juego…)
  const hadFocus = document.activeElement && document.activeElement.id === 'joinCode';
  const code = el('input', { class: 'in', id: 'joinCode', placeholder: 'IP del servidor (mc.ejemplo.com, 83.45.12.9:25565) o código CMP-…', spellcheck: 'false', value: CODE, oninput: e => { CODE = e.target.value; },
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); joinB.click(); } } });
  const joinB = B('door', 'Unirme', async () => { if (!code.value.trim()) { code.focus(); return; } await doJoin(code.value); CODE = ''; }, 'pri');
  const fr = el('div', { class: 'panel friends' },
    el('h3', {}, 'Servidores de amigos', el('span', { class: 'sp' }), friends.length ? el('small', { class: 'fsnote' }, 'El estado se actualiza solo') : null),
    el('div', { class: 'joinbox' }, el('div', { class: 'search' }, I('link', 16), code),
      el('button', { class: 'btn ico', title: 'Pegar', onclick: async () => { code.value = CODE = (await A.call('paste')).trim(); code.focus(); } }, I('copy', 16)),
      joinB),
    el('p', { class: 'hint', style: 'margin:8px 0 0' }, 'Con la IP o el código se descarga todo solo: la versión, Fabric y los mods del servidor. Se crea un perfil aparte para él y tus perfiles no se tocan.'),
    friends.length ? el('div', { class: 'fgrid' }, ...friends.map((f, i) => friendCard(f, i, busy || running)))
      : el('div', { class: 'empty', style: 'padding:30px 10px 10px' }, el('div', { html: ic('users', 40) }), el('b', {}, 'Aún no te has unido a ningún servidor'), 'Pide a tu amigo la IP de su servidor o su código de Compass y pégalo arriba.'));
  R.replaceChildren(scene, fr);
  paintStatus();
  const g = $('.gprog', R); if (g) paintProg(g);
  if (hadFocus) { code.focus(); code.setSelectionRange(code.value.length, code.value.length); }
}
// ---------- servidores de amigos: tarjeta y estado en directo ----------
let FS = {}, fsTimer = null, fsBusy = false;
function friendCard(f, i, locked) {
  const st = FS[f.id];
  const fav = el('span', { class: 'fav', 'data-fsfav': f.id }); paintFav(fav, st, f);
  const menu = el('button', { class: 'btn ghost sm ico', title: 'Más opciones', onclick: e => friendMenu(f, e.currentTarget) }, I('dots', 16));
  return ctx(el('div', { class: 'fcard' + (f.id === ST.active ? ' cur' : ''), style: `--i:${i}`, 'data-fscard': f.id },
    el('div', { class: 'top' }, fav, el('div', { class: 't' }, el('b', { title: f.name }, f.name), el('small', { title: (f.desc ? f.desc + '\n' : '') + (f.server || '') }, f.desc || (f.compass === false ? 'Servidor de Minecraft' : 'Servidor de Compass'))), menu),
    el('div', { class: 'fstate', 'data-fs': f.id }, fsText(st)),
    el('div', { class: 'row nw', style: 'margin-top:12px' },
      el('span', { class: 'tag' }, 'Minecraft ' + f.mc), f.compass === false ? el('span', { class: 'tag', title: 'Servidor normal: sin mods de Compass' }, 'sin mods') : el('span', { class: 'tag acc' }, 'Compass'),
      el('div', { class: 'sp' }),
      el('button', { class: 'btn sm pri', disabled: locked, 'data-fsgo': f.id, onclick: e => act(e.currentTarget, async () => { await A.call('setActive', f.id); await reload(); renderFriends(); await launchFlow({ join: true }); }) }, I('play', 12), 'Entrar'))), () => friendCtx(f, locked));
}
function fsText(st) {
  if (!st) return [el('span', { class: 'light' }), el('span', {}, 'Comprobando…')];
  if (!st.online) return [el('span', { class: 'light' }), el('span', {}, 'Apagado'), el('small', {}, st.error && st.error !== 'El servidor no responde' ? st.error : '')];
  return [el('span', { class: 'light on' }), el('span', {}, 'Activo'), el('small', {}, `${st.players}/${st.max} jugadores · ${st.ms} ms`)];
}
function paintFav(box, st, f) { const src = (st && st.favicon) || (f && f.icon); box.replaceChildren(src ? el('img', { src, alt: '' }) : el('span', { html: ic('server', 20) })); }
function paintStatus() {
  $$('[data-fs]').forEach(e => e.replaceChildren(...fsText(FS[e.dataset.fs])));
  $$('[data-fsfav]').forEach(e => paintFav(e, FS[e.dataset.fsfav], P(e.dataset.fsfav)));
  $$('[data-fscard]').forEach(e => e.classList.toggle('online', !!(FS[e.dataset.fscard] && FS[e.dataset.fscard].online)));
  $$('[data-fslight]').forEach(e => { const st = FS[e.dataset.fslight]; e.className = 'light' + (st && st.online ? ' on' : ''); });
  $$('[data-fsmini]').forEach(e => { const st = FS[e.dataset.fsmini], p = P(e.dataset.fsmini); if (p) e.textContent = st && st.online ? `Activo, ${st.players}/${st.max}` : st ? 'Apagado' : 'Minecraft ' + p.mc; });
}
async function pollFriends(now) {
  clearTimeout(fsTimer);
  const any = ST.profiles.some(p => p.kind === 'friend' && !p.own && p.server);
  if (any && MODE === 'play' && !document.hidden && !fsBusy) {
    fsBusy = true;
    try { const prev = FS; FS = await A.call('friendStatus'); paintStatus();
      for (const [id, st] of Object.entries(FS)) if (st.online && prev[id] && !prev[id].online) { const p = P(id); if (p) toast(`${p.name} está activo. Ya puedes entrar.`, 'ok', 5000); }
    } catch {} finally { fsBusy = false; }
  }
  fsTimer = setTimeout(pollFriends, any ? 15000 : 30000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollFriends(); });
function friendMenu(f, anchor) {
  const old = $('.picker'); if (old) { old.remove(); return; }
  const r = anchor.getBoundingClientRect(), v = $('#view').getBoundingClientRect();
  const close = () => pk.remove();
  const it = (icon, t, fn, cls = '') => el('button', { class: cls, onclick: async () => { close(); try { await fn(); } catch (e) { toast(clean(e), 'error', 7000); } } }, I(icon, 16), t);
  const pk = el('div', { class: 'picker', style: `left:${Math.max(8, r.right - v.left - 260)}px;top:${r.bottom - v.top + $('#view').scrollTop + 6}px;min-width:260px` },
    it('chest', 'Copia del mapa para jugar solo', () => friendWorld(f)),
    it('refresh', 'Sincronizar mods', async () => { const r = await A.call('resync', f.id); toast(`Sincronizado: ${plural(r.mods, 'mod', 'mods')}${r.note ? '. ' + r.note : ''}`, r.failed.length ? 'warn' : 'ok', r.note ? 10000 : 4000); await reload(); renderHome(); renderFriends(); }),
    it('copy', 'Copiar la dirección', async () => { await A.call('copy', f.server || f.invite); toast('Dirección copiada', 'ok', 2000); }),
    it('gear', 'Ver perfil', () => { selP = f.id; go('profiles'); }),
    el('div', { class: 'sep', style: 'margin:6px 0' }),
    it('trash', 'Quitar este servidor', async () => {
      const c = await modal('¿Quitar ' + f.name + '?', el('p', { style: 'color:var(--mut)' }, 'Se quita de la lista. Puedes conservar sus archivos (mundos, capturas) o borrarlo todo.'), [{ t: 'Cancelar', v: null }, { t: 'Solo quitar', v: 'keep' }, { t: 'Borrar todo', v: 'all', cls: 'dng' }]);
      if (c) { await A.call('profileDel', f.id, c === 'all'); await reload(); renderFriends(); renderHome(); }
    }, 'dngi'));
  $('#view').append(pk);
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pk.contains(e.target)) { pk.remove(); document.removeEventListener('mousedown', off); } }), 0);
}
async function friendWorld(f) {
  if (f.compass === false) { toast('Ese servidor no es de Compass: no se puede pedir su mapa. Pídele a tu amigo el código de Compass.', 'warn', 7000); return; }
  if (!(await modal('Copia del mapa', el('p', { style: 'color:var(--mut)' }, `Se descarga el mapa actual de ${f.name} y se guarda como un mundo tuyo en ese perfil, para jugarlo en individual. El servidor de tu amigo no se toca.`), [{ t: 'Cancelar', v: false }, { t: 'Descargar copia', v: true, cls: 'pri' }]))) return;
  if (PAGE !== 'home') go('home');
  toast('Descargando el mapa… puede tardar si es grande', 'info', 4000);
  const n = await A.call('friendWorld', f.id);
  toast(`Mapa guardado como «${n}». Ábrelo en Un jugador.`, 'ok', 8000);
}

function issuesBody(issues, extra) { return el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:10px' }, extra), el('ul', { style: 'margin-left:18px;display:grid;gap:6px;font-size:13px' }, ...issues.map(i => el('li', {}, i.text)))); }
const compatBox = (issues, goText) => modal('Hay mods que no encajan', issuesBody(issues, 'Si sigues así, lo más probable es que Fabric no arranque. Puedo intentar arreglarlo cambiando versiones de mods.'),
  [{ t: 'Cancelar', v: null }, { t: goText, v: 'force', cls: 'dng' }, { t: 'Arreglarlo solo', v: 'fix', cls: 'pri' }]);
let LAST_LAUNCH = null;
async function launchFlow(opts = {}) {
  const pid = opts.pid || ST.active; LAST_LAUNCH = { ...opts, pid };
  let r = await A.call('launch', pid, opts);
  while (r && r.blocked) {
    const c = await compatBox(r.issues, 'Jugar igualmente');
    if (c === 'fix') { const f = await A.call('fixMods', target('profile', pid)); toast(f.fixed.length ? 'Arreglado: ' + f.fixed.join(', ') : 'No he podido arreglarlo solo', f.fixed.length ? 'ok' : 'warn', 7000); r = await A.call('launch', pid, opts); }
    else if (c === 'force') r = await A.call('launch', pid, { ...opts, force: true }); else break;
  }
}
// Minecraft no arrancó por los mods (Fabric «mod resolution»): se explica qué pasaba, qué se ha arreglado y se ofrece volver a jugar
A.on('gameFail', async d => {
  const p = P(d.pid), nice = id => ({ 'fabric-language-kotlin': 'Fabric Language Kotlin', 'fabric-api': 'Fabric API', yet_another_config_lib_v3: 'YACL', 'cloth-config': 'Cloth Config' })[id] || id;
  const body = el('div', {},
    el('p', { style: 'color:var(--mut);margin-bottom:10px' }, `Fabric no ha podido cargar los mods de ${p ? p.name : 'este perfil'}. Esto es lo que decía:`),
    d.lines.length ? el('ul', { style: 'margin-left:18px;display:grid;gap:6px;font-size:12.5px' }, ...d.lines.map(l => el('li', {}, l))) : null,
    d.fixed.length ? el('div', { class: 'banner info', style: 'margin-top:12px' }, I('check', 18), el('div', { class: 't' }, 'Ya lo he arreglado: ' + d.fixed.map(nice).join(', ') + '. Vuelve a jugar.')) : null,
    d.failed.length ? el('div', { class: 'banner', style: 'margin-top:12px' }, I('alert', 18), el('div', { class: 't' }, 'No he podido conseguir: ' + d.failed.map(nice).join(', ') + (p && p.kind === 'friend' ? '. Si es un mod del servidor, el anfitrión tiene que actualizarlo.' : '. Mira sus mods en Perfiles.'))) : null);
  const again = await modal('Minecraft no ha arrancado', body, [{ t: 'Cerrar', v: false }, { t: 'Volver a jugar', v: true, cls: 'pri' }]);
  if (again && LAST_LAUNCH && ST.game === 'idle') { try { await launchFlow(LAST_LAUNCH); } catch (e) { toast(clean(e), 'error', 7000); } }
});
A.on('game', s => {
  const was = ST.game; ST.game = s.state;
  // al cerrar Minecraft se vuelve solo a Inicio (la ventana la restaura el proceso principal)
  if (s.state === 'idle' && was === 'running' && MODE === 'play' && PAGE !== 'home') { go('home'); return; }
  if (MODE === 'play' && PAGE === 'home') renderHome();
  if (MODE === 'host' && PAGE === 'host' && TAB === 'resumen') renderHost();
});

// ---------- unirse a un amigo ----------
async function doJoin(code) {
  if (MODE !== 'play' || PAGE !== 'home') setMode('play', { page: 'home' });   // para que se vea la barra de progreso
  toast('Buscando el servidor y preparando todo…', 'info', 3500);
  const r = await A.call('join', code); await reload(); selP = r.id;
  if (r.compass) toast(`Listo: Minecraft ${r.mc} con ${plural(r.mods, 'mod', 'mods')}. Pulsa Entrar.${r.note ? ' ' + r.note : ''}`, r.failed && r.failed.length ? 'warn' : 'ok', r.note ? 11000 : 7000);
  else toast(`Listo: servidor de Minecraft ${r.mc}${r.guessed ? ' (no he podido leer su versión: si no entra, cámbiala en Perfiles)' : ''}. No usa Compass, así que va sin mods.`, r.guessed ? 'warn' : 'ok', 9000);
  renderFriends(); renderHome(); pollFriends();
}
async function joinDialog() {
  const inp = el('input', { class: 'in', placeholder: 'mc.ejemplo.com, 83.45.12.9 o CMP-…', spellcheck: 'false' });
  const body = el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:14px' }, 'Escribe la IP del servidor o pega el código de Compass. Se descargan solos la versión, Fabric y los mods, y se crea un perfil aparte. Tus perfiles no se tocan.'),
    el('div', { class: 'row nw' }, inp, el('button', { class: 'btn', onclick: async () => { inp.value = (await A.call('paste')).trim(); } }, I('copy', 16), 'Pegar')),
    el('div', { class: 'hint' }, 'Si tu amigo usa Compass, el código está en el panel de su servidor. Si es un servidor normal, basta con la IP.'));
  const ok = await modal('Unirme a un servidor', body, [{ t: 'Cancelar', v: false }, { t: 'Unirme', v: true, cls: 'pri' }]);
  if (ok && inp.value.trim()) { try { await doJoin(inp.value); } catch (e) { toast(clean(e), 'error', 7000); } }
}
const profGlyph = (p, extra) => p.icon ? el('span', { class: 'glyph custom' }, el('img', { src: p.icon, alt: '' }), extra || null)
  : el('span', { class: 'glyph', html: ic(p.own ? 'server' : p.kind === 'friend' ? 'users' : p.pack ? 'chest' : 'cube', 15) }, extra || null);
function renderRailProfiles() {
  const L = ST.profiles.filter(p => p.kind !== 'friend' || p.own);
  $('#railProfiles').replaceChildren(...L.map(p => ctx(el('button', { class: 'mini' + (p.id === ST.active ? ' on' : ''), title: p.desc || 'Usar este perfil',
    onclick: async () => { await A.call('setActive', p.id); await reload(); renderFriends(); go('home'); } },
    profGlyph(p), el('span', { class: 't' }, el('b', {}, p.name), el('small', {}, p.own ? 'Tu servidor · Minecraft ' + p.mc : (p.desc ? p.desc : 'Minecraft ' + p.mc)))), () => profileCtx(p))));
}
function renderFriends() {
  renderRailProfiles();
  const L = ST.profiles.filter(p => p.kind === 'friend' && !p.own);
  $('#railFriends').replaceChildren(...(L.length ? L.map(p => ctx(el('button', { class: 'mini' + (p.id === ST.active ? ' on' : ''), title: 'Usar este servidor', onclick: async () => { await A.call('setActive', p.id); await reload(); renderFriends(); go('home'); } },
    p.icon ? el('span', { class: 'glyph custom' }, el('img', { src: p.icon, alt: '' }), el('span', { class: 'light', 'data-fslight': p.id })) : el('span', { class: 'glyph', html: ic('users', 15) }, el('span', { class: 'light', 'data-fslight': p.id })), el('span', { class: 't' }, el('b', {}, p.name), el('small', { 'data-fsmini': p.id }, 'Minecraft ' + p.mc))), () => friendCtx(p, ST.game !== 'idle')))
    : [el('p', { class: 'hint', style: 'margin:0 12px' }, 'Aún ninguno. Pulsa + y escribe la IP o el código de un amigo.')]));
  paintStatus();
}

// =====================================================================
// JUGAR · Perfiles
// =====================================================================
// imagen de un perfil: se elige, se recorta al centro y se deja en 64×64
function imagePick(cur, onChange) {
  let val = cur || null;
  const box = el('button', { class: 'profimg', title: 'Elegir imagen', type: 'button' });
  const paint = () => box.replaceChildren(val ? el('img', { src: val, alt: '' }) : el('span', { html: ic('image', 26) }));
  box.onclick = async () => { try { const d = await A.call('pickImage'); if (!d) return; val = await to64(d); paint(); onChange(val); } catch (e) { toast(clean(e), 'error'); } };
  const clear = el('button', { class: 'btn ghost sm', type: 'button', onclick: () => { val = null; paint(); onChange(null); } }, I('trash', 14), 'Quitar');
  paint();
  return el('div', { class: 'row nw', style: 'gap:12px' }, box, el('div', {}, el('small', { class: 'hint', style: 'display:block;margin:0 0 6px' }, 'PNG o JPG. Se recorta al centro.'), clear));
}
async function newProfileDialog() {
  const n = el('input', { class: 'in', placeholder: 'Por ejemplo: Supervivencia con shaders', maxlength: 40 }), m = mcSelect((P(ST.active) || {}).mc || SYS.versions[0]);
  const d = el('textarea', { class: 'in', rows: 2, maxlength: 300, placeholder: 'Para qué es este perfil (opcional)' });
  let icon = null;
  const body = el('div', {}, el('label', { class: 'f' }, 'Imagen'), imagePick(null, v => { icon = v; }), el('label', { class: 'f' }, 'Nombre'), n, el('label', { class: 'f' }, 'Descripción'), d,
    el('label', { class: 'f' }, 'Versión'), m, el('div', { class: 'hint' }, 'Cada perfil tiene sus propios mods, mundos y opciones.'));
  if (await modal('Nuevo perfil', body, [{ t: 'Cancelar', v: false }, { t: 'Crear perfil', v: true, cls: 'pri' }])) {
    try { const p = await A.call('profileAdd', { name: n.value, mc: m.value, ram: ST.ram, desc: d.value.trim(), icon }); await reload(); selP = p.id; renderFriends(); setMode('play'); go('profiles'); } catch (e) { toast(clean(e), 'error'); }
  }
}
async function editProfileDialog(p) {
  const n = el('input', { class: 'in', value: p.name, maxlength: 40 }), d = el('textarea', { class: 'in', rows: 3, maxlength: 300, placeholder: 'Para qué es este perfil (opcional)' });
  d.value = p.desc || ''; let icon = p.icon || null;
  const body = el('div', {}, el('label', { class: 'f' }, 'Imagen'), imagePick(icon, v => { icon = v; }), el('label', { class: 'f' }, 'Nombre'), n, el('label', { class: 'f' }, 'Descripción'), d,
    p.kind === 'friend' ? el('div', { class: 'hint' }, 'Al sincronizar se vuelven a poner el nombre, la imagen y la descripción del servidor.') : null);
  if (await modal('Editar perfil', body, [{ t: 'Cancelar', v: false }, { t: 'Guardar', v: true, cls: 'pri' }])) {
    await A.call('profileSet', p.id, { name: n.value, desc: d.value.trim(), icon }); await reload(); renderFriends(); if (PAGE === 'profiles') renderProfiles(); if (PAGE === 'home') renderHome();
  }
}
// perfil de jugador → servidor (misma versión y mods; opcionalmente uno de sus mundos)
async function profileToServerDialog(p) {
  const worlds = await A.call('profileWorlds', p.id).catch(() => []);
  const sel = el('select', { class: 'in' }, el('option', { value: '' }, 'Mundo nuevo'), ...worlds.map(w => el('option', { value: w.folder }, w.name)));
  const body = el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:10px' }, `Se crea un servidor «${p.name}» con Minecraft ${p.mc} y los mods de este perfil. Los mods solo de cliente (minimapas, zoom…) no se cargan en el servidor, pero tus amigos los reciben igual. El perfil no cambia.`),
    el('label', { class: 'f' }, 'Mundo del servidor'), sel, worlds.length ? el('div', { class: 'hint' }, 'Se copia: tu mundo de un jugador se queda como está.') : null);
  if (!(await modal('Convertir en servidor', body, [{ t: 'Cancelar', v: false }, { t: 'Crear servidor', v: true, cls: 'pri' }]))) return;
  const r = await A.call('profileToServer', p.id, { world: sel.value || null });
  await reload(); ST.showHost = true; applyHostZone(); paintPill(); selS = r.id; store.set('selS', selS); TAB = 'resumen'; setMode('host');
  toast(`Servidor creado con ${plural(r.mods, 'mod', 'mods')}. Pulsa Iniciar cuando quieras.`, 'ok', 6000);
}
function renderProfiles() {
  const R = $('#p-profiles'), p = P(selP) || P(ST.active);
  if (p) selP = p.id;
  const list = el('div', { class: 'panel', style: 'padding:8px' }, ...ST.profiles.map(x => ctx(el('button', { class: 'mini' + (x.id === selP ? ' on' : ''), style: 'padding:9px 10px', onclick: () => { selP = x.id; renderProfiles(); } },
    profGlyph(x), el('span', { class: 't' }, el('b', {}, x.name), el('small', {}, `Minecraft ${x.mc}${x.own ? ', tu servidor' : x.pack ? ', modpack' : ''}${x.id === ST.active ? ', activo' : ''}`))), () => profileCtx(x))),
    el('div', { class: 'row', style: 'padding:8px 4px 4px' }, el('button', { class: 'btn sm pri', onclick: newProfileDialog }, I('plus', 14), 'Nuevo'), el('button', { class: 'btn sm', onclick: joinDialog }, I('door', 14), 'De un servidor')));
  const detail = el('div', { class: 'stack' });
  if (p) {
    const save = async patch => { await A.call('profileSet', p.id, patch); await reload(); renderFriends(); };
    const name = el('input', { class: 'in', value: p.name, maxlength: 40, onchange: async e => { await save({ name: e.target.value }); renderProfiles(); } });
    const locked = p.kind === 'friend' && p.compass !== false, mc = mcSelect(p.mc, locked); mc.onchange = async e => { await save({ mc: e.target.value }); toast('Versión cambiada: revisa que tus mods sean de esa versión', 'warn', 6000); renderProfiles(); };
    const open = (what, txt, i = 'folder') => el('button', { class: 'btn sm', onclick: () => A.call('profileOpen', p.id, what) }, I(i, 14), txt);
    detail.append(
      el('div', { class: 'panel' },
        el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:14px' }, el('h3', { style: 'font-size:26px' }, p.name),
          p.id === ST.active ? el('span', { class: 'tag acc' }, 'Perfil activo') : el('button', { class: 'btn sm pri', onclick: async () => { await A.call('setActive', p.id); await reload(); renderProfiles(); renderFriends(); toast('Ahora juegas con ' + p.name, 'ok', 2500); } }, 'Usar este perfil')),
        el('div', { class: 'f2' }, el('div', {}, el('label', { class: 'f' }, 'Nombre'), name), el('div', {}, el('label', { class: 'f' }, 'Versión'), mc, locked ? el('div', { class: 'hint' }, 'La decide el servidor de tu amigo.') : p.kind === 'friend' ? el('div', { class: 'hint' }, 'Se ajusta sola a la del servidor al jugar, si se puede leer.') : null)),
        p.kind !== 'friend' ? el('div', { class: 'f2', style: 'margin-top:4px' },
          el('div', {}, el('label', { class: 'f' }, 'Imagen'), imagePick(p.icon, async v => { await save({ icon: v }); })),
          el('div', {}, el('label', { class: 'f' }, 'Descripción'), (() => { const t = el('textarea', { class: 'in', rows: 3, maxlength: 300, placeholder: 'Para qué es este perfil (opcional)', onchange: e => save({ desc: e.target.value.trim() }) }); t.value = p.desc || ''; return t; })())) : null,
        ramField(p.ram, r => save({ ram: r })),
        p.kind !== 'friend' ? el('div', { class: 'row', style: 'margin-top:10px' }, B('server', 'Convertir en servidor', () => profileToServerDialog(p), 'sm')) : null,
        p.kind === 'friend' ? el('div', {}, el('div', { class: 'sep' }),
          el('div', { class: 'row nw', style: 'margin-bottom:8px' }, I('link', 16), el('b', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis' }, p.server || 'Sin dirección'), el('span', { class: 'fstate', 'data-fs': p.id }, fsText(FS[p.id]))),
          el('div', { class: 'toggle' }, sw(p.autoJoin !== false, v => save({ autoJoin: v })), el('div', { class: 't' }, el('b', {}, 'Entrar directo al servidor de ' + p.name), el('small', {}, 'Al pulsar Jugar te mete en el servidor sin pasar por el menú de Minecraft.')),
            B('refresh', 'Sincronizar mods', async () => { const r = await A.call('resync', p.id); toast(`Sincronizado: ${plural(r.mods, 'mod', 'mods')}${r.note ? '. ' + r.note : ''}`, r.failed.length ? 'warn' : 'ok', r.note ? 10000 : 4000); await reload(); renderProfiles(); renderFriends(); }, 'sm')),
          p.own ? null : el('div', { class: 'row', style: 'margin-top:6px' }, B('chest', 'Copia del mapa para jugar solo', () => friendWorld(p), 'sm'))) : null,
        el('div', { class: 'sep' }),
        el('div', { class: 'row' }, open('game', 'Carpeta del juego'), open('saves', 'Mundos'), open('screenshots', 'Capturas', 'image'), open('resourcepacks', 'Texturas', 'layers'), el('button', { class: 'btn sm', onclick: () => A.call('kindOpen', target('profile', p.id), 'shader') }, I('sun', 14), 'Shaders'), open('logs', 'Registros', 'filetext'),
          el('div', { class: 'sp' }),
          el('button', { class: 'btn sm dng', disabled: ST.profiles.length < 2, onclick: async () => {
            const c = await modal('¿Quitar este perfil?', el('p', { style: 'color:var(--mut)' }, `«${p.name}»: puedes quitarlo de la lista y conservar sus archivos, o borrarlo todo (mods, mundos y capturas).`), [{ t: 'Cancelar', v: null }, { t: 'Solo quitar', v: 'keep' }, { t: 'Borrar todo', v: 'all', cls: 'dng' }]);
            if (c) { try { await A.call('profileDel', p.id, c === 'all'); await reload(); selP = ST.active; renderProfiles(); renderFriends(); } catch (e) { toast(clean(e), 'error'); } } } }, I('trash', 14), 'Quitar'))),
      profModsPanel(p));
  }
  R.replaceChildren(el('div', { class: 'pagehead' }, el('div', {}, el('h1', {}, 'Perfiles'), el('p', {}, 'Cada perfil es una instalación aparte: sus mods, sus mundos, sus opciones. Cambiar de perfil nunca toca los otros.'))),
    el('div', { style: 'display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;align-items:start' }, list, detail));
}

// mods de un perfil: los instalados y, al lado, la tienda filtrada a la versión de ese perfil
let PMODSUB = 'inst';
function profModsPanel(p) {
  const box = el('div', { class: 'panel' });
  const paint = () => {
    const managed = p.kind === 'friend' && p.compass !== false;
    const sub = el('div', { class: 'seg' }, ...[['inst', 'Instalados', 'cube'], ['store', 'Buscar mods para ' + p.mc, 'bag']].map(([k, t, i]) => el('button', { class: PMODSUB === k ? 'on' : '', onclick: () => { PMODSUB = k; paint(); } }, I(i, 14), t)));
    box.replaceChildren(...[el('div', { class: 'row', style: 'margin-bottom:12px;align-items:center' }, el('h3', { style: 'margin:0' }, 'Mods de este perfil'), el('div', { class: 'sp' }), sub),
      managed ? el('p', { class: 'hint', style: 'margin:-4px 0 10px' }, 'Los mods del servidor de tu amigo se sincronizan solos; los que añadas aquí son solo tuyos (minimapas, shaders…).') : null,
      PMODSUB === 'inst' ? makeMods(target('profile', p.id), { onStore: () => { PMODSUB = 'store'; paint(); } }).node
        : makeStore(() => target('profile', p.id), { onInstalled: () => {} }).node].filter(Boolean));
  };
  paint(); return box;
}
// al instalar desde la Tienda general: ¿en qué perfil?
async function pickProfileFor(what, cur) {
  const L = ST.profiles;
  if (L.length < 2) return cur;
  let pick = cur && cur.id;
  const items = L.map(p => el('button', { class: 'pprow' + (p.id === pick ? ' on' : ''), onclick: e => { pick = p.id; $$('.pprow', box).forEach(b => b.classList.toggle('on', b === e.currentTarget)); } },
    profGlyph(p), el('span', { class: 't' }, el('b', {}, p.name), el('small', {}, 'Minecraft ' + p.mc + (p.id === ST.active ? ' · activo' : '') + (p.kind === 'friend' ? ' · servidor' : ''))), el('span', { class: 'ck' }, I('check', 16))));
  const box = el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:12px' }, `Elige dónde instalar ${what}. Se pone la versión que corresponde a la de Minecraft de cada perfil.`), el('div', { class: 'pplist' }, ...items));
  const ok = await modal('¿En qué perfil?', box, [{ t: 'Cancelar', v: false }, { t: 'Instalar aquí', v: true, cls: 'pri' }]);
  return ok && pick ? target('profile', pick) : null;
}

// =====================================================================
// Mods instalados (perfiles y servidores)
// =====================================================================
function makeMods(t, opts = {}) {
  let MODS = [], UPD = {}, ISS = []; const isSrv = t.kind === 'server';
  const node = el('div', { class: 'modsbox' }), list = el('div', { class: 'list' }), iss = el('div', { hidden: true, style: 'margin-bottom:12px' }), info = el('p', { class: 'hint', style: 'margin:0 0 12px' });
  const q = el('input', { class: 'in', placeholder: 'Filtrar mods instalados', spellcheck: 'false', oninput: () => render() });
  const updAll = el('button', { class: 'btn pri sm', hidden: true, onclick: e => act(e.currentTarget, async () => { for (const u of Object.values(UPD)) await A.call('updateMod', t, u); UPD = {}; await load(); toast('Mods actualizados', 'ok'); }) });
  const done = (n, a, b) => { if (n) { toast(plural(n, a, b), 'ok'); return load(); } };
  async function srcPick() {
    const o = [...ST.profiles.filter(p => !(t.kind === 'profile' && p.id === t.id)).map(p => ['profile', p.id, 'Perfil: ' + p.name]), ...(hostOn() ? ST.servers : []).filter(s => !(isSrv && s.id === t.id)).map(s => ['server', s.id, 'Servidor: ' + s.name])];
    if (!o.length) { toast('No hay otro perfil o servidor del que copiar', 'warn'); return; }
    const sel = el('select', { class: 'in' }, ...o.map(x => el('option', { value: x[0] + ':' + x[1] }, x[2])));
    if (await modal('Copiar mods de otro sitio', el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:12px' }, 'Se copian los mods activos. Los que no sirven aquí (de solo cliente en un servidor, o al revés) se saltan.'), sel), [{ t: 'Cancelar', v: false }, { t: 'Copiar mods', v: true, cls: 'pri' }])) {
      const [k, id] = sel.value.split(':'); await done(await A.call('copyMods', t, target(k, id)), 'mod copiado', 'mods copiados');
    }
  }
  node.append(info, iss,
    el('div', { class: 'tools' }, el('div', { class: 'search' }, I('search', 16), q),
      B('refresh', 'Buscar actualizaciones', async () => { const r = await A.call('checkUpdates', t); UPD = {}; r.forEach(u => UPD[u.file] = u); render(); toast(r.length ? plural(r.length, 'actualización disponible', 'actualizaciones disponibles') : 'Todo está al día', 'ok', 3500); }, 'sm'), updAll,
      B('shield', 'Comprobar', async () => { await load(); toast(ISS.length ? plural(ISS.length, 'problema encontrado', 'problemas encontrados') : 'Todo encaja: no hay conflictos', ISS.length ? 'warn' : 'ok', 3500); }, 'sm')),
    el('div', { class: 'tools' },
      opts.onStore ? el('button', { class: 'btn sm pri', onclick: opts.onStore }, I('bag', 14), 'Añadir de la tienda') : null,
      B('zap', isSrv ? 'Pack de servidor' : 'Pack de rendimiento', async () => { const r = await A.call('pack', t); await load(); toast(`Pack: ${plural(r.installed, 'mod instalado', 'mods instalados')}${r.fixed.length ? '. Ajustado: ' + r.fixed.join(', ') : ''}`, r.remaining.length ? 'warn' : 'ok', 7000); }, 'sm'),
      el('button', { class: 'btn sm', onclick: e => act(e.currentTarget, srcPick) }, I('copy', 14), 'Copiar de…'),
      B('plus', 'Añadir .jar', async () => done(await A.call('addJar', t), 'archivo añadido', 'archivos añadidos'), 'sm'),
      B('folder', 'Importar carpeta', async () => done(await A.call('importMods', t), 'mod importado', 'mods importados'), 'sm'),
      isSrv ? null : B('external', 'OptiFine', () => A.call('openOptifine'), 'sm ghost'),
      el('div', { class: 'sp' }),
      B('folder', 'Abrir carpeta', () => isSrv ? A.call('serverOpen', t.id, 'mods') : A.call('profileOpen', t.id, 'mods'), 'sm ghost')),
    list);
  node.ondragover = e => { e.preventDefault(); node.classList.add('drop'); };
  node.ondragleave = e => { if (!node.contains(e.relatedTarget)) node.classList.remove('drop'); };
  node.ondrop = async e => {
    e.preventDefault(); node.classList.remove('drop');
    const ps = [...e.dataTransfer.files].map(f => A.pathOf(f)).filter(p => /\.jar$/i.test(p));
    if (ps.length) try { await done(await A.call('addJars', t, ps), 'mod añadido', 'mods añadidos'); } catch (x) { toast(clean(x), 'error'); }
  };
  const E = (tt, s, i = 'cube') => el('div', { class: 'empty' }, el('div', { html: ic(i, 40) }), el('b', {}, tt), s);
  const icon = m => { const d = el('div', { class: 'ico40' }); if (m.icon) { const i = el('img', { src: m.icon, loading: 'lazy', alt: '' }); i.onerror = () => { i.remove(); d.innerHTML = ic('cube', 20); }; d.append(i); } else d.innerHTML = ic('cube', 20); return d; };
  async function load() {
    if (!MODS.length) list.replaceChildren(el('div', { class: 'skel' }), el('div', { class: 'skel' }), el('div', { class: 'skel' }));
    try { [MODS, ISS] = await Promise.all([A.call('scan', t), A.call('checkCompat', t)]); render(); if (opts.onCount) opts.onCount(MODS.filter(m => m.enabled).length); }
    catch (e) { list.replaceChildren(E('No se pudieron leer los mods', clean(e), 'alert')); }
  }
  function render() {
    const f = q.value.trim().toLowerCase(), off = MODS.filter(m => !m.enabled).length, n = Object.keys(UPD).length;
    info.textContent = MODS.length ? `${plural(MODS.length, 'mod', 'mods')}${off ? ', ' + plural(off, 'desactivado', 'desactivados') : ''}. Los desactivados ni se cargan ni se comparten. Puedes arrastrar archivos .jar aquí.` : 'Arrastra aquí archivos .jar o usa los botones.';
    updAll.hidden = !n; updAll.textContent = 'Actualizar todo (' + n + ')';
    iss.hidden = !ISS.length;
    iss.replaceChildren(...(ISS.length ? [el('div', { class: 'banner' }, I('alert', 18), el('div', { class: 't' }, el('b', {}, plural(ISS.length, 'problema de compatibilidad', 'problemas de compatibilidad')), el('ul', {}, ...ISS.map(i => el('li', {}, i.text)))),
      el('button', { class: 'btn sm pri', onclick: e => act(e.currentTarget, async () => { const r = await A.call('fixMods', t); await load(); toast(r.fixed.length ? 'Arreglado: ' + r.fixed.join(', ') : 'No he podido arreglarlo solo', r.fixed.length ? 'ok' : 'warn', 7000); }) }, 'Arreglarlo solo'))] : []));
    const shown = MODS.filter(m => !f || (m.title + m.file).toLowerCase().includes(f));
    if (!shown.length) { list.replaceChildren(MODS.length ? E('Nada coincide', 'Prueba con otro nombre.', 'search') : E('Aún no hay mods', isSrv ? 'Añade los de la tienda o pon el pack de servidor.' : 'Añade los de la tienda o pon el pack de rendimiento.')); return; }
    list.replaceChildren(...shown.map(m => {
      const u = UPD[m.file], wrongEnv = isSrv ? m.env === 'client' : m.env === 'server';
      return ctx(el('div', { class: 'li' + (m.enabled ? '' : ' off') }, icon(m),
        el('div', { class: 't' }, el('b', {}, el('span', {}, m.title), m.ver ? el('span', { class: 'tag' }, m.ver) : null,
          m.env === 'client' ? el('span', { class: 'tag' + (wrongEnv ? ' warn' : '') }, 'solo cliente') : m.env === 'server' ? el('span', { class: 'tag' + (wrongEnv ? ' warn' : '') }, 'solo servidor') : null,
          u ? el('span', { class: 'tag acc' }, 'nueva: ' + u.to + (u.type && u.type !== 'release' ? ' (' + u.type + ')' : '')) : null),
          el('small', {}, wrongEnv ? (isSrv ? 'Solo de cliente: se desactiva en el servidor, pero tus amigos se lo descargan igual.' : 'Es un mod de servidor: el juego no lo usa.') : m.desc || m.file)),
        u ? el('button', { class: 'btn sm pri', onclick: e => act(e.currentTarget, async () => { await A.call('updateMod', t, u); delete UPD[m.file]; await load(); toast(m.title + ' actualizado', 'ok', 3000); }) }, 'Actualizar') : null,
        el('label', { class: 'sw', title: m.enabled ? 'Desactivar' : 'Activar' }, el('input', { type: 'checkbox', checked: m.enabled, onchange: async e => { e.target.disabled = true; try { await A.call('toggleMod', t, m.file); delete UPD[m.file]; } catch (x) { toast(clean(x), 'error'); } await load(); } })),
        el('button', { class: 'btn ghost ico', title: 'Eliminar', html: ic('trash', 16), onclick: async () => { if (await confirmBox('¿Eliminar este mod?', m.title + ' se borra de la carpeta de mods.', 'Eliminar')) { await A.call('deleteMod', t, m.file); await load(); } } })), () => [
        { t: m.title, title: true },
        { i: m.enabled ? 'x' : 'check', t: m.enabled ? 'Desactivar' : 'Activar', f: async () => { await A.call('toggleMod', t, m.file); await load(); } },
        u ? { i: 'download', t: 'Actualizar a ' + u.to, f: async () => { await A.call('updateMod', t, u); delete UPD[m.file]; await load(); } } : null,
        m.projectId ? { i: 'external', t: 'Ver en Modrinth', f: () => window.open('https://modrinth.com/mod/' + m.projectId) } : null,
        { i: 'copy', t: 'Copiar nombre del archivo', f: () => copyTxt(m.file) },
        { i: 'folder', t: 'Abrir carpeta de mods', f: () => isSrv ? A.call('serverOpen', t.id, 'mods') : A.call('profileOpen', t.id, 'mods') }, '-',
        { i: 'trash', t: 'Eliminar', dng: true, f: async () => { if (await confirmBox('¿Eliminar este mod?', m.title + ' se borra de la carpeta de mods.', 'Eliminar')) { await A.call('deleteMod', t, m.file); await load(); } } }]);
    }));
  }
  load(); return { node, load };
}

// =====================================================================
// Tienda de mods (Modrinth / CurseForge)
// =====================================================================
function makeStore(getT, opts = {}) {
  const S = { q: '', src: 'modrinth', sort: 'relevance', offset: 0, total: 0, busy: false, gen: 0 };
  const grid = el('div', { class: 'storegrid' }), more = el('button', { class: 'btn', hidden: true, onclick: e => act(e.currentTarget, () => load(false)) }, 'Cargar más');
  const keyBox = el('div', { class: 'panel', hidden: true, style: 'margin-bottom:14px' });
  const q = el('input', { class: 'in', placeholder: 'Buscar mods: sodium, create, jei…', spellcheck: 'false' });
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { S.q = q.value.trim(); load(true); }, 350); };
  const sort = el('select', { class: 'in', style: 'width:170px', onchange: e => { S.sort = e.target.value; load(true); } },
    el('option', { value: 'relevance' }, 'Más relevantes'), el('option', { value: 'downloads' }, 'Más descargados'), el('option', { value: 'updated' }, 'Actualizados'), el('option', { value: 'newest' }, 'Más nuevos'));
  const src = el('div', { class: 'seg' }, ...[['modrinth', 'Modrinth'], ['curseforge', 'CurseForge']].map(([v, t]) => el('button', { class: v === S.src ? 'on' : '', onclick: e => { S.src = v; $$('button', src).forEach(b => b.classList.toggle('on', b === e.currentTarget)); load(true); } }, t)));
  const empty = (t, s, i = 'search') => el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic(i, 40) }), el('b', {}, t), s);
  const mIcon = m => { const d = el('div', { class: 'ico40' }); if (m.icon) { const i = el('img', { src: m.icon, loading: 'lazy', alt: '' }); i.onerror = () => { i.remove(); d.innerHTML = ic('cube', 20); }; d.append(i); } else d.innerHTML = ic('cube', 20); return d; };
  function card(m) {
    const b = el('button', { class: 'btn sm' + (m.installed ? '' : ' pri'), disabled: !!m.installed }, m.installed ? I('check', 14) : I('download', 14), m.installed ? 'Instalado' : 'Instalar');
    b.onclick = () => act(b, async () => {
      const t = opts.ask ? await pickProfileFor(m.title, getT()) : getT();
      if (!t) return;
      let r = await A.call('storeInstall', { t, id: m.id, source: S.src });
      if (r && r.blocked) {   // las dependencias ya se han intentado resolver; lo que queda no encaja
        const ok = await modal('No encaja del todo', el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:10px' }, `He instalado lo que necesitaba ${m.title}${r.got && r.got.length ? ' (' + r.got.join(', ') + ')' : ''}, pero aún queda esto:`),
          el('ul', { style: 'margin-left:18px;display:grid;gap:6px;font-size:13px' }, ...r.issues.slice(0, 6).map(i => el('li', {}, i.text)))), [{ t: 'No instalarlo', v: false }, { t: 'Instalar igualmente', v: true, cls: 'pri' }]);
        if (!ok) return;
        r = await A.call('storeInstall', { t, id: m.id, source: S.src, force: true });
      }
      b.className = 'btn sm'; b.replaceChildren(I('check', 14), 'Instalado'); setTimeout(() => b.disabled = true);
      if (r.issues && r.issues.length) toast(m.title + ' instalado, pero hay mods que no encajan. Revisa la lista de instalados.', 'warn', 8000); else toast(m.title + ' instalado', 'ok', 3000);
      if (opts.onInstalled) opts.onInstalled();
    });
    return ctx(el('div', { class: 'li' }, mIcon(m), el('div', { class: 't' }, el('b', {}, el('span', {}, m.title)), el('small', {}, m.desc || ''), el('small', { style: 'color:var(--dim)' }, (m.author ? m.author + ', ' : '') + Number(m.downloads || 0).toLocaleString('es') + ' descargas')), b),
      () => [{ t: m.title, title: true }, { i: 'download', t: m.installed ? 'Ya instalado' : 'Instalar', dis: m.installed, f: () => b.click() }, S.src === 'modrinth' ? { i: 'external', t: 'Ver en Modrinth', f: () => window.open('https://modrinth.com/mod/' + m.id) } : null, { i: 'copy', t: 'Copiar nombre', f: () => copyTxt(m.title) }]);
  }
  async function load(reset) {
    if (S.busy && !reset) return; const gen = ++S.gen; S.busy = true;
    if (S.src === 'curseforge' && !ST.hasKey) {
      const k = el('input', { class: 'in', type: 'password', placeholder: 'Tu clave de API' });
      keyBox.hidden = false; keyBox.replaceChildren(el('h3', {}, 'Conecta CurseForge'), el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'CurseForge pide una clave gratuita. Créala en console.curseforge.com y pégala aquí: solo se guarda en tu PC.'),
        el('div', { class: 'row nw' }, k, B('key', 'Guardar clave', async () => { await A.call('setKey', k.value); ST.hasKey = !!k.value.trim(); toast('Clave guardada', 'ok'); load(true); }, 'pri')));
      grid.replaceChildren(); more.hidden = true; S.busy = false; return;
    }
    keyBox.hidden = true; if (reset) { S.offset = 0; grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skel', style: 'height:74px' }))); }
    try {
      const r = await A.call('storeSearch', { t: getT(), q: S.q, source: S.src, sort: S.sort, offset: S.offset }); if (gen !== S.gen) return;
      if (reset) grid.replaceChildren(); r.items.forEach(m => grid.append(card(m))); S.offset += r.items.length; S.total = r.total;
      if (reset && !r.items.length) grid.append(empty('Sin resultados', 'Solo salen mods de Fabric para esta versión. Prueba con otro nombre.'));
      more.hidden = !r.items.length || S.offset >= S.total;
    } catch (e) { if (gen === S.gen) { grid.replaceChildren(empty('No se pudo cargar la tienda', clean(e), 'alert')); more.hidden = true; } }
    finally { if (gen === S.gen) S.busy = false; }
  }
  const node = el('div', {}, el('div', { class: 'tools' }, ...(opts.head || []), src, el('div', { class: 'search' }, I('search', 16), q), sort), keyBox, grid, el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, more));
  load(true);
  return { node, reload: () => load(true) };
}
let storeT = null, STORE_TAB = 'mod';
function renderModsPage() { renderStore(); }

// =====================================================================
// AJUSTES generales
// =====================================================================
let STAB = 'apariencia';
function renderSettings() {
  const R = $('#p-settings');
  const SECS = [['apariencia', 'Apariencia', 'palette'], ['cuenta', 'Cuenta', 'user'], ['jugar', 'Al jugar', 'play'], ['servidores', 'Servidores', 'server'], ['mods', 'Mods y mapas', 'bag'], ['datos', 'Carpetas y registro', 'folder'], ['movil', 'App del móvil', 'phone'], ['actualizar', 'Actualizaciones', 'download'], ['acerca', 'Acerca de', 'info']];
  if (!SECS.some(x => x[0] === STAB)) STAB = 'apariencia';
  const ink = el('span', { class: 'ink' });
  const nav = el('nav', { class: 'setnav' }, ink, ...SECS.map(([k, t, i]) => el('button', { class: k === STAB ? 'on' : '', 'data-k': k, onclick: () => show(k) }, I(i, 16), el('span', {}, t))));
  const body = el('div', { class: 'setbody' });
  const moveInk = () => { const b = $(`button[data-k="${STAB}"]`, nav); if (b) { ink.style.transform = `translateY(${b.offsetTop}px)`; ink.style.height = b.offsetHeight + 'px'; } };
  function show(k, still) {
    if (!still) entering();
    const same = k === STAB;
    const order = SECS.map(x => x[0]), dir = order.indexOf(k) >= order.indexOf(STAB) ? 1 : -1;
    STAB = k; $$('button', nav).forEach(b => b.classList.toggle('on', b.dataset.k === k)); moveInk();
    const sec = el('div', { class: 'setsec', style: `--dir:${dir}` }, ...SECTION[k]());
    $$('.panel', sec).forEach((p, i) => p.style.setProperty('--i', i));
    const top = still && same ? body.scrollTop : 0;
    body.replaceChildren(sec);
    if (top) body.scrollTop = top;   // al actualizar no te manda arriba del todo
  }
  const SECTION = {
    apariencia: () => lookSection(() => show('apariencia', true)),
    cuenta: () => {
      const av = el('span', { class: 'av', style: 'width:56px;height:56px;font-size:22px' }); avatar(av, ME && ME.name, ME && ME.uuid);
      return [el('div', { class: 'panel' }, el('h3', {}, 'Cuenta de Microsoft'),
        el('div', { class: 'row nw' }, av, el('div', { style: 'flex:1' }, el('b', { style: 'font-size:17px' }, ME ? ME.name : 'Sin sesión'), el('small', { style: 'display:block' }, ME ? 'Sesión guardada en este PC' : 'Inicia sesión para jugar')),
          ME ? el('button', { class: 'btn sm', onclick: () => { closeSettings(); skinDialog(); } }, I('user', 14), 'Skin y capa') : null,
          ME ? el('button', { class: 'btn dng sm', onclick: async () => { await A.call('logout'); ME = null; paintAcct(); show('cuenta', true); toast('Sesión cerrada'); } }, 'Cerrar sesión')
            : el('button', { class: 'btn pri sm', onclick: e => doLogin(e.currentTarget) }, 'Iniciar sesión')))];
    },
    jugar: () => [
      el('div', { class: 'panel' }, el('h3', {}, 'Memoria'),
        ramField(ST.ram, async r => { await A.call('setRam', r); ST.ram = r; toast('RAM por defecto guardada', 'ok', 1800); }, 'RAM para perfiles nuevos'),
        el('p', { class: 'hint' }, 'Cada perfil puede tener la suya: se cambia en Perfiles.')),
      el('div', { class: 'panel' }, el('h3', {}, 'Ventana'),
        el('div', { class: 'toggle' }, sw(ST.minOnPlay !== false, async v => { await A.call('setPref', 'minOnPlay', v); ST.minOnPlay = v; }),
          el('div', { class: 't' }, el('b', {}, 'Minimizar el launcher mientras juegas'), el('small', {}, 'Al cerrar Minecraft vuelve a aparecer solo, en Inicio.')))),
      el('div', { class: 'panel' }, el('h3', {}, 'Java'),
        el('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Compass descarga solo el Java que pide cada versión la primera vez que juegas. Si prefieres tenerlos todos ya (8, 17, 21 y 25), descárgalos ahora.'),
        el('div', { class: 'row' }, el('button', { class: 'btn sm', onclick: e => act(e.currentTarget, async () => { toast('Descargando Java… puedes seguir usando Compass', 'info', 4000); await A.call('javaAll'); }) }, I('download', 14), 'Descargar todas las versiones de Java'))),
      el('div', { class: 'panel' }, el('h3', {}, 'Versiones de Minecraft'),
        el('div', { class: 'toggle' }, sw(!!SYS.snapshots, async v => { await A.call('setPref', 'showSnapshots', v); SYS.snapshots = v; toast(v ? 'Ya puedes elegir snapshots y versiones antiguas al crear o editar un perfil' : 'Solo se muestran las versiones normales', 'ok', 3500); }),
          el('div', { class: 't' }, el('b', {}, 'Mostrar snapshots y versiones antiguas'), el('small', {}, 'Snapshots (versiones de prueba de Mojang), betas y alphas. Pueden fallar y muchas no admiten mods. Las versiones normales salen siempre, todas.')))),
      el('div', { class: 'panel' }, el('h3', {}, 'Dentro del juego'),
        ...[['shareOptions', 'Mismos ajustes en todos los perfiles y versiones', 'Controles, sonido, FOV, gráficos, sensibilidad… Lo que cambies en uno se guarda para todos, como en Lunar. Los packs de texturas siguen siendo de cada perfil.'],
          ['zoomKey', 'Zoom con la C', 'Se instala solo un mod de zoom (Zoomify u Ok Zoomer) en tus perfiles. Mantén pulsada la C para acercar.'],
          ['freeLook', 'Vista libre con el Alt', 'Mantén pulsado el Alt izquierdo para mirar alrededor sin girar a tu personaje, como en Lunar. Se instala solo un mod de vista libre.'],
          ['menuLogo', 'Logo de Compass en el menú de Minecraft', 'Cambia el logo de Minecraft por el de Compass Launcher, también cuando juegas solo.'],
          ['menuServer', 'Menú de servidor: «Conectar al servidor»', 'En los perfiles de servidores de amigos, el botón Multijugador pasa a ser «Conectar al servidor» y solo lleva a ese servidor.']]
          .map(([k, t, d]) => el('div', { class: 'toggle' }, sw(ST.prefs ? ST.prefs[k] !== false : true, async v => { await A.call('setPref', k, v); if (ST.prefs) ST.prefs[k] = v; toast(v ? 'Activado. Se aplica la próxima vez que pulses Jugar.' : 'Desactivado. Se quita la próxima vez que pulses Jugar.', 'ok', 2600); }),
            el('div', { class: 't' }, el('b', {}, t), el('small', {}, d)))))],
    servidores: () => [
      el('div', { class: 'panel hostpick' }, el('h3', {}, '¿Quieres montar tus propios servidores?'),
        el('p', { style: 'color:var(--mut);margin-bottom:14px' }, 'Si solo vas a jugar (tú solo o en servidores de amigos), déjalo apagado y el launcher queda más simple. Al encenderlo aparece arriba la zona Servidores, con todo lo necesario para montar uno.'),
        el('div', { class: 'radio two' }, ...[[false, 'play', 'Solo quiero jugar', 'Sin nada de servidores a la vista.'], [true, 'server', 'También monto servidores', 'Aparece la zona Servidores arriba.']].map(([v, i, t, d]) =>
          el('button', { class: hostOn() === v ? 'on' : '', onclick: async e => {
            if (!v && ST.host.id && ST.host.state !== 'off') { toast('Apaga antes tu servidor', 'warn'); return; }
            await A.call('setPref', 'showHost', v); ST.showHost = v; applyHostZone(); paintPill();
            $$('button', e.currentTarget.parentElement).forEach(x => x.classList.toggle('on', x === e.currentTarget));
            toast(v ? 'Listo: la zona Servidores está arriba, junto a Jugar' : 'Zona de servidores oculta. Tus servidores siguen guardados.', 'ok', 4000);
            if (v) { const m = $('.modes'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); }
          } }, I(i, 20), el('div', {}, el('b', {}, t), el('span', {}, d))))),
        ST.servers.length && !hostOn() ? el('p', { class: 'hint' }, `Tienes ${plural(ST.servers.length, 'servidor guardado', 'servidores guardados')}: no se borra${ST.servers.length > 1 ? 'n' : ''}.`) : null)],
    mods: () => {
      const key = el('input', { class: 'in', type: 'password', placeholder: ST.hasKey ? 'Guardada. Pega otra para cambiarla' : 'Opcional' });
      return [el('div', { class: 'panel' }, el('h3', {}, 'CurseForge'),
        el('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Hace falta para buscar mods y mapas de CurseForge. Es gratis en console.curseforge.com. Modrinth funciona sin clave.'),
        el('div', { class: 'row nw' }, key, B('save', 'Guardar', async () => { await A.call('setKey', key.value); ST.hasKey = !!key.value.trim(); key.value = ''; key.placeholder = ST.hasKey ? 'Guardada. Pega otra para cambiarla' : 'Opcional'; toast('Clave guardada', 'ok', 2500); })))];
    },
    datos: () => [
      el('div', { class: 'panel' }, el('h3', {}, 'Carpetas'),
        el('div', { class: 'row' }, ...[['data', 'Datos del launcher'], ['root', 'Versiones de Minecraft'], ['java', 'Java']].map(([w, t]) => el('button', { class: 'btn sm', onclick: () => A.call('openApp', w) }, I('folder', 14), t))),
        el('p', { class: 'hint' }, 'Dentro de «Datos» están profiles/ (perfiles), servers/ (servidores) y maps/ (tu biblioteca de mapas).')),
      el('div', { class: 'panel' }, el('h3', {}, 'Registro'),
        el('p', { class: 'hint', style: 'margin:0 0 10px' }, 'Todo lo que pasa al preparar y abrir Minecraft se guarda aquí, en vez de llenar la pantalla. Si algo falla, ábrelo o mándaselo a quien te ayude.'),
        el('div', { class: 'row' }, B('filetext', 'Abrir registro', () => A.call('openLog'), 'sm pri')))],
    actualizar: () => updSection(),
    movil: () => mobSection(),
    acerca: () => [
      el('div', { class: 'panel about' }, el('span', { class: 'aboutmark', html: LOGO }),
        el('div', {}, el('b', { style: 'font:600 26px var(--disp);font-stretch:80%;display:block' }, 'Compass Launcher ' + (SYS.app || '')),
          el('small', { style: 'display:block;margin-top:4px' }, 'Atajos: Ctrl+1 Jugar' + (hostOn() ? ', Ctrl+2 Servidores' : '') + ', Ctrl+, Ajustes, F12 herramientas de desarrollo.'))),
      el('div', { class: 'panel aboutme' }, el('h3', {}, 'Quién hace esto'),
        el('p', { html: '¡Buenas! Soy <b>luckicla</b> y hago Compass Launcher yo solo, en mis ratos libres, por puro gusto y porque me lo paso bien programando.' }),
        el('p', {}, 'Empezó porque quería jugar con mis amigos en nuestro propio servidor con mods sin pelearme con carpetas, versiones ni puertos. Me pareció que molaba y quiero que otra gente pueda usarlo gratis.'),
        el('p', {}, 'No tiene anuncios ni recoge datos de nadie. Si algo falla o se te ocurre alguna idea, dímelo en GitHub y le echo un ojo.'),
        el('div', { class: 'row', style: 'margin-top:10px' }, el('button', { class: 'btn sm', onclick: () => A.call('openUrl', 'https://luckicla.github.io/compass-launcher/') }, I('globe', 14), 'Web de Compass'),
          el('button', { class: 'btn sm ghost', onclick: () => A.call('openUrl', 'https://github.com/luckicla/compass-launcher') }, I('external', 14), 'GitHub')),
        el('small', { style: 'display:block;margin-top:10px;color:var(--dim)' }, 'Parte del proyecto lo he hecho con ayuda de IA (Claude Opus 5.5).'),
        el('small', { style: 'display:block;margin-top:4px;color:var(--dim)' }, '© 2026 luckicla. Todos los derechos reservados.'))],
  };
  R.replaceChildren(el('div', { class: 'setwrap' }, nav, body));
  renderSettings.show = show;
  show(STAB, renderSettings.still);
  // la marca de la sección elegida se coloca directamente (sin deslizarse desde arriba)
  ink.style.transition = 'none'; moveInk(); requestAnimationFrame(() => { moveInk(); requestAnimationFrame(() => { ink.style.transition = ''; }); });
  const sc = renderSettings.keepScroll; if (sc != null) requestAnimationFrame(() => { body.scrollTop = sc; });
}
// vuelve a dibujar la sección abierta de Ajustes sin animaciones y sin moverte del sitio (para datos que cambian)
function refreshSettings() {
  if (!setOpen()) return;
  // solo se vuelve a dibujar el contenido de la sección: el menú de la izquierda no se toca
  if (renderSettings.show && $('#p-settings .setnav')) { renderSettings.show(STAB, true); return; }
  const b = $('#p-settings .setbody'); renderSettings.still = true; renderSettings.keepScroll = b ? b.scrollTop : null;
  try { renderSettings(); } finally { renderSettings.still = false; renderSettings.keepScroll = null; }
}

// =====================================================================
// SERVIDORES
// =====================================================================
function renderRailServers() {
  const h = ST.host;
  $('#railServers').replaceChildren(...(ST.servers.length ? ST.servers.map(s => {
    const st = hostOf(s.id), M = HS[st.state] || HS.off;
    return ctx(el('button', { class: 'mini' + (s.id === selS && PAGE === 'host' ? ' on' : ''), onclick: () => { if (selS !== s.id) TAB = 'resumen'; selS = s.id; store.set('selS', selS); if (MODE !== 'host') setMode('host'); else openHost(); } },
      srvGlyph(s, st.state !== 'off' ? el('span', { class: 'light ' + M[1] }) : null),
      el('span', { class: 't' }, el('b', {}, s.name), el('small', {}, st.state === 'ready' ? `En línea, ${plural(st.players.length, 'jugador', 'jugadores')}` : st.state !== 'off' ? M[0] : 'Minecraft ' + s.mc + (s.type === 'paper' ? ' · Paper' : s.type === 'hybrid' ? ' · Mods + plugins' : '')))), () => serverCtx(s));
  }) : [el('p', { class: 'hint', style: 'margin:0 12px' }, 'Aún no tienes servidores.')]));
}
// tipos de servidor: con mods (Fabric), con plugins (Paper) o los dos a la vez (Arclight)
const SRV_TYPES = [['fabric', 'cube', 'Con mods (Fabric)', 'Tus amigos reciben los mods solos al unirse.'], ['paper', 'zap', 'Con plugins (Paper)', 'Plugins de servidor: nadie tiene que instalar nada.'],
  ['hybrid', 'layers', 'Mods + plugins', 'Mods de Fabric y plugins de Bukkit/Paper a la vez (Arclight). Solo algunas versiones.']];
const srvTypeName = t => t === 'paper' ? 'Paper (plugins)' : t === 'hybrid' ? 'Mods + plugins' : 'Fabric (mods)';
const srvTypeIcon = t => t === 'paper' ? 'zap' : t === 'hybrid' ? 'layers' : 'cube';
// al elegir «Mods + plugins» la lista de versiones se limita a las que tiene Arclight
async function fitVersions(sel, typ, keep) {
  const cur = sel.value;
  let list = SYS.versions;
  if (typ === 'hybrid') { try { list = await A.call('hybridVersions'); } catch { list = []; } }
  const vs = [...new Set([...(keep ? [keep] : []), ...list])].filter(Boolean).sort(vcmp);
  sel.replaceChildren(...vs.map(v => el('option', { value: v }, 'Minecraft ' + v + (typ === 'hybrid' && !list.includes(v) ? ' (sin mods + plugins)' : ''))));
  sel.value = vs.includes(cur) && (typ !== 'hybrid' || list.includes(cur)) ? cur : (typ === 'hybrid' ? (list.slice().sort(vcmp)[0] || cur) : cur);
}
function typePicker(cur, onPick, big) {
  const w = el('div', { class: 'radio three' }, ...SRV_TYPES.map(([v, i, t, d]) => el('button', { class: v === cur ? 'on' : '', onclick: e => { $$('button', w).forEach(b => b.classList.toggle('on', b === e.currentTarget)); onPick(v); } }, I(i, big ? 20 : 18), el('div', {}, el('b', {}, t), el('span', {}, d)))));
  return w;
}
async function newServerDialog() {
  const n = el('input', { class: 'in', placeholder: 'Por ejemplo: Supervivencia con los compas', maxlength: 40 }), m = srvMcSelect((P(ST.active) || {}).mc || SYS.versions[0]);
  let gm = 'survival', df = 'normal', acc = 'premium', typ = 'fabric';
  const pick = (opts, cur, set) => { const w = el('div', { class: 'seg' }); opts.forEach(([v, t]) => w.append(el('button', { class: v === cur ? 'on' : '', onclick: e => { set(v); $$('button', w).forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, t))); return w; };
  const typePick = typePicker(typ, v => { typ = v; fitVersions(m, v); }, true);
  const body = el('div', {}, el('label', { class: 'f' }, 'Nombre'), n, el('label', { class: 'f' }, 'Tipo de servidor'), typePick, el('label', { class: 'f' }, 'Versión'), m,
    el('label', { class: 'f' }, 'Modo de juego'), pick([['survival', 'Supervivencia'], ['creative', 'Creativo'], ['adventure', 'Aventura']], gm, v => gm = v),
    el('label', { class: 'f' }, 'Dificultad'), pick([['peaceful', 'Pacífico'], ['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']], df, v => df = v),
    el('label', { class: 'f' }, 'Cuentas'), pick([['premium', 'Premium'], ['offline', 'Modo offline']], acc, v => acc = v),
    el('div', { class: 'hint' }, 'Modo offline pone online-mode=false: entra gente sin Minecraft original, con cualquier nombre.'),
    el('div', { class: 'hint' }, 'Luego le pones mods o plugins, un mapa descargado o uno nuevo con tu semilla (con vista previa).'));
  if (await modal('Nuevo servidor', body, [{ t: 'Cancelar', v: false }, { t: 'Crear servidor', v: true, cls: 'pri' }])) {
    try {
      const s = await A.call('serverAdd', { name: n.value, mc: m.value, ram: ST.ram, type: typ });
      await A.call('setServerProps', s.id, { gamemode: gm, difficulty: df, 'online-mode': acc === 'offline' ? 'false' : 'true' });
      await reload(); selS = s.id; store.set('selS', selS); TAB = 'resumen'; if (MODE !== 'host') setMode('host'); else openHost();
      toast('Servidor creado. Pulsa Iniciar cuando quieras.', 'ok');
    } catch (e) { toast(clean(e), 'error'); }
  }
}
const TABHELP = { resumen: 'Estado, quién está dentro y acciones rápidas.', consola: 'Todo lo que dice el servidor. Escribe comandos sin la barra.', mapa: 'Mira el mundo, elige el spawn, crea mundos nuevos con vista previa.',
  mods: 'Mods de Fabric del servidor. Tus amigos los reciben solos.', plugins: 'Plugins de Paper. Sus dependencias se instalan solas.', gente: 'Quién puede entrar y qué puede hacer: OP, solo TP, lista blanca y baneos.',
  auto: 'Modo 24/7, Nether y End, y tareas que se repiten solas.', archivos: 'Los archivos del servidor, con editor.', copias: 'Copias de seguridad del mundo.', ajustes: 'Nombre, icono, mensaje, versión, tipo y reglas de la partida.' };
const tabsFor = s => [['resumen', 'Resumen', 'layout'], ['consola', 'Consola', 'console'], ['mapa', 'Mapa', 'map'], ...(s.type === 'paper' ? [['plugins', 'Plugins', 'zap']] : s.type === 'hybrid' ? [['mods', 'Mods', 'cube'], ['plugins', 'Plugins', 'zap']] : [['mods', 'Mods', 'cube']]), ['gente', 'Gente', 'users'], ['auto', 'Automático', 'clock'], ['archivos', 'Archivos', 'folder'], ['copias', 'Copias', 'chest'], ['ajustes', 'Ajustes', 'gear']];
let SL = [];   // consola del servidor en marcha
function renderHost() {
  const R = $('#h-server'), s = SV(selS);
  paintPill();
  if (!s) {
    R.replaceChildren(el('div', { class: 'welcome' },
      el('div', {}, el('h1', {}, 'Tu propio servidor, en dos clics'),
        el('p', {}, 'Elige versión, mete mods y un mapa (o genera uno con tu semilla), marca dónde aparece la gente y pásales el código. Compass abre los puertos o crea un túnel solo.'),
        el('div', { class: 'row', style: 'margin-top:22px' }, el('button', { class: 'btn big pri', onclick: newServerDialog }, I('plus', 18), 'Crear mi primer servidor'))),
      el('div', { class: 'bigmark', html: LOGO })));
    return;
  }
  if (!tabsFor(s).some(x => x[0] === TAB)) TAB = 'resumen';
  const tabs = el('nav', { class: 'tabs', role: 'tablist' }, ...tabsFor(s).map(([k, t, i]) => el('button', { class: TAB === k ? 'on' : '', role: 'tab', 'data-t': k, onclick: () => { TAB = k; renderHost(); } }, I(i, 16), t, k === 'gente' ? el('span', { class: 'count', 'data-pcount': '1', hidden: true }) : null)));
  const body = el('div', { class: 'tabbody' });
  R.replaceChildren(el('div', { class: 'srvhead' }, el('div', { class: 'srvtop', id: 'srvtop' }), el('div', { id: 'share' }), tabs, el('p', { class: 'tabhelp' }, TABHELP[TAB] || '')), body);
  paintSrvHead();
  ({ resumen: tabResumen, consola: tabConsola, mapa: tabMapa, mods: tabMods, plugins: tabPlugins, gente: tabGente, auto: tabAuto, archivos: tabArchivos, copias: tabCopias, ajustes: tabAjustes })[TAB](s, body);
}
async function startFlow(s) {
  let r = await A.call('hostStart', s.id);
  while (r && r.blocked) {
    const c = await compatBox(r.issues, 'Iniciar igualmente');
    if (c === 'fix') { const f = await A.call('fixMods', target('server', s.id)); toast(f.fixed.length ? 'Arreglado: ' + f.fixed.join(', ') : 'No he podido arreglarlo solo', f.fixed.length ? 'ok' : 'warn', 7000); r = await A.call('hostStart', s.id); }
    else if (c === 'force') r = await A.call('hostStart', s.id, { force: true }); else break;
  }
}
function paintSrvHead() {
  const top = $('#srvtop'), s = SV(selS); if (!top || !s) return;
  const h = hostOf(s.id), st = h.state, M = HS[st] || HS.off, other = ST.host.id && ST.host.id !== s.id && SV(ST.host.id);
  const modeTxt = { lan: 'Red local', online: 'Online automático', tunnel: 'Túnel', manual: 'Puerto abierto a mano' }[s.mode || 'online'];
  top.replaceChildren(
    srvIconEl(s, 'srvicon'),
    el('div', { class: 'srvname' }, el('h1', { title: s.name }, s.name),
      el('div', { class: 'row' }, el('span', { class: 'state' }, el('span', { class: 'light ' + M[1] }), M[0]),
        st === 'ready' && h.startedAt ? el('span', { class: 'chip' }, I('clock', 14), el('span', { 'data-uptime': h.startedAt }, dur(Date.now() - h.startedAt))) : null,
        el('span', { class: 'chip' }, I('layers', 14), 'Minecraft ' + s.mc), el('span', { class: 'chip' }, I(srvTypeIcon(s.type), 14), srvTypeName(s.type)), el('span', { class: 'chip' }, I('bolt', 14), gb(s.ram) + ' GB'), el('span', { class: 'chip' }, I(s.mode === 'lan' ? 'wifi' : s.mode === 'tunnel' ? 'tunnel' : 'globe', 14), modeTxt),
        s.offline ? el('span', { class: 'chip', title: 'online-mode=false' }, I('key', 14), 'Modo offline') : null)),
    el('div', { class: 'row' },
      st === 'off' ? el('button', { class: 'btn big pri', disabled: !!other, title: other ? 'Ya está encendido ' + other.name : '', onclick: e => act(e.currentTarget, () => startFlow(s)) }, I('power', 18), 'Iniciar') : null,
      st === 'ready' || st === 'starting' ? B('restart', 'Reiniciar', () => A.call('hostRestart')) : null,
      st !== 'off' ? el('button', { class: 'btn dng', disabled: st === 'stopping', onclick: e => act(e.currentTarget, () => A.call('hostStop')) }, I('stop', 14), 'Apagar') : null,
      st === 'stopping' || st === 'restarting' ? el('button', { class: 'btn ghost sm', onclick: async () => { if (await confirmBox('¿Forzar el cierre?', 'Se corta en seco, sin guardar. Úsalo solo si no responde.', 'Forzar cierre')) A.call('hostKill'); } }, 'Forzar cierre') : null));
  const sh = $('#share');
  sh.replaceChildren(...(h.share ? [el('div', { class: 'sharebar' }, I('link', 16), el('b', {}, 'Código para tus amigos'), el('code', { title: h.share }, h.share),
    h.ip ? el('small', { style: 'white-space:nowrap' }, h.ip) : null,
    el('button', { class: 'btn sm pri', onclick: async () => { await A.call('copy', h.share); toast('Código copiado. Pásaselo a tus amigos.', 'ok', 2500); } }, I('copy', 14), 'Copiar'))] : []));
  const pc = $('[data-pcount]'); if (pc) { pc.hidden = !h.players.length; pc.textContent = h.players.length; }
  if (other && st === 'off') sh.append(el('div', { class: 'banner info', style: 'margin-top:14px;max-width:1240px' }, I('info', 18), el('div', { class: 't' }, `Ahora mismo está encendido «${other.name}». Solo puede haber un servidor en marcha a la vez.`)));
}
setInterval(() => $$('[data-uptime]').forEach(e => e.textContent = dur(Date.now() - +e.dataset.uptime)), 1000);

// ---------- Resumen ----------
function tabResumen(s, body) {
  const h = hostOf(s.id), st = h.state, ready = st === 'ready';
  const players = el('div', { class: 'list' });
  const paintPlayers = () => {
    const hh = hostOf(s.id);
    players.replaceChildren(...(hh.players.length ? hh.players.map(n => ctx(el('div', { class: 'li' }, head(n), el('div', { class: 't' }, el('b', {}, n)),
      el('button', { class: 'btn sm', onclick: () => A.call('permsAct', s.id, 'op', { name: n }).then(() => toast(n + ' ahora es OP', 'ok', 2500)).catch(e => toast(clean(e), 'error')) }, I('crown', 14), 'OP'),
      el('button', { class: 'btn sm', onclick: () => A.call('permsAct', s.id, 'kick', { name: n }).catch(e => toast(clean(e), 'error')) }, 'Echar'),
      el('button', { class: 'btn sm dng', onclick: async () => { if (await confirmBox('¿Banear a ' + n + '?', 'No podrá entrar hasta que le quites el baneo (en Gente o con clic derecho).', 'Banear')) A.call('permsAct', s.id, 'ban', { name: n }).then(() => toast(n + ' baneado', 'ok')).catch(e => toast(clean(e), 'error')); } }, I('ban', 14), 'Banear'),
      el('button', { class: 'btn sm ghost', title: 'Más opciones', onclick: e => openCtx(e, playerCtx(s, n)) }, I('dots', 14))), () => playerCtx(s, n)))
      : [el('p', { class: 'hint', style: 'margin:0' }, hh.state === 'ready' ? 'Nadie conectado todavía. Pasa el código de arriba.' : 'Cuando lo enciendas, aquí verás quién está dentro.')]));
  };
  paintPlayers(); body._paint = paintPlayers;

  const thumb = el('div', { class: 'thumb', style: 'aspect-ratio:16/10;background:#0f0c15;border-radius:4px;overflow:hidden;position:relative;display:grid;place-items:center;color:var(--dim);cursor:pointer', onclick: () => { TAB = 'mapa'; renderHost(); } }, 'Cargando mapa…');
  A.call('mapInfo', { kind: 'server', id: s.id }).then(async info => {
    if (!info.regions.length) { thumb.replaceChildren(el('div', { style: 'text-align:center;padding:20px' }, el('div', { html: ic('map', 32), style: 'display:grid;place-items:center;margin-bottom:8px' }), info.exists ? 'Sin terreno generado aún' : 'El mundo se crea al encenderlo por primera vez')); return; }
    const sp = info.spawn || { x: info.regions[0].x * 512 + 256, z: info.regions[0].z * 512 + 256 }, rx = Math.floor(sp.x / 512), rz = Math.floor(sp.z / 512);
    const t = await A.call('mapTile', { kind: 'server', id: s.id }, info.regions.some(r => r.x === rx && r.z === rz) ? rx : info.regions[0].x, info.regions.some(r => r.x === rx && r.z === rz) ? rz : info.regions[0].z);
    if (t) { const img = el('img', { src: t.url, alt: 'Mapa', style: `position:absolute;width:250%;left:${50 - ((sp.x - rx * 512) / 512) * 250}%;top:${50 - ((sp.z - rz * 512) / 512) * 250 * 1.6}%;image-rendering:pixelated` }); thumb.replaceChildren(img, el('span', { class: 'mk', style: 'left:50%;top:50%' }, el('span', { class: 'flag' }, I('flag', 12), 'Spawn'), el('span', { class: 'pole' }), el('span', { class: 'foot' }))); }
  }).catch(() => { thumb.textContent = 'No se pudo leer el mundo'; });

  const qc = (icon, txt, cmd, note) => el('button', { class: 'btn sm', disabled: !ready, onclick: () => { A.call('hostCmd', cmd); toast(note, 'ok', 1800); } }, I(icon, 14), txt);
  body.replaceChildren(el('div', { class: 'cols' },
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, 'Cómo entran tus amigos'),
        h.share ? el('p', {}, 'Pásales el código de arriba o, si les es más fácil, tu IP. Al pegarlo en Compass (Jugar, Unirme) se descargan tus mods (también los solo de cliente), el nombre, el icono y la descripción del servidor, y entran directos.')
          : el('p', { style: 'color:var(--mut)' }, st === 'off' ? 'Enciende el servidor y aquí aparecerá un código para compartir.' : 'Preparando la conexión…'),
        h.note ? el('div', { class: 'banner info', style: 'margin-top:12px' }, I('info', 18), el('div', { class: 't' }, h.note)) : null,
        h.share ? el('p', { class: 'hint', style: 'margin-top:10px' }, '¿Alguno usa otro launcher? Que abra en el navegador tu dirección con http:// delante (' + (h.ip ? 'http://' + h.ip + (/:\d+$/.test(h.ip) ? '' : ':25565') : 'por ejemplo http://TU-IP:25565') + '): ahí se baja los mods en un .zip con instrucciones. Si no tiene Minecraft original, el servidor tiene que estar en «Modo offline» (Ajustes del servidor, Cuentas).') : null,
        el('div', { class: 'row', style: 'margin-top:14px' }, ready ? el('button', { class: 'btn pri', disabled: ST.game !== 'idle', title: 'Con los mismos mods y versión que el servidor', onclick: e => act(e.currentTarget, async () => { const pid = await A.call('ownProfile', s.id); await reload(); await launchFlow({ pid, join: true }); }) }, I('play', 14), 'Entrar yo') : null,
          el('button', { class: 'btn sm ghost', onclick: () => { TAB = 'ajustes'; renderHost(); } }, I('gear', 14), 'Cambiar tipo de conexión'))),
      el('div', { class: 'panel' }, el('h3', {}, 'Conectados ahora'), players),
      dimPanel(s),
      el('div', { class: 'panel' }, el('h3', {}, 'Acciones rápidas'),
        el('div', { class: 'row' }, qc('save', 'Guardar mundo', 'save-all', 'Mundo guardado'), qc('sun', 'Hacer de día', 'time set day', 'Ya es de día'), qc('cloud', 'Quitar la lluvia', 'weather clear', 'Cielo despejado'),
          qc('heart', 'Conservar inventario', 'gamerule keepInventory true', 'Al morir no se pierde el inventario'), qc('clock', 'Parar el ciclo día/noche', 'gamerule doDaylightCycle false', 'El tiempo se queda quieto'), qc('cloud', 'Sin cambios de tiempo', 'gamerule doWeatherCycle false', 'El tiempo ya no cambia solo')),
        el('p', { class: 'hint' }, ready ? 'Se ejecutan al momento en el servidor.' : 'Disponibles con el servidor encendido.'))),
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, 'Mapa', el('span', { class: 'sp' }), el('button', { class: 'btn sm', onclick: () => { TAB = 'mapa'; renderHost(); } }, I('map', 14), 'Abrir mapa')), thumb),
      el('div', { class: 'panel' }, el('h3', {}, 'Copia del mapa'),
        el('p', { class: 'hint', style: 'margin:-4px 0 12px' }, 'Saca una copia del mundo actual para jugarlo en individual o guardarlo. El servidor no se toca' + (ready ? ': se guarda un momento antes de copiar.' : '.')),
        el('div', { class: 'row' },
          B('cube', 'Jugarlo en un perfil', async () => {
            const sel = el('select', { class: 'in' }, ...ST.profiles.map(p => el('option', { value: p.id }, p.name + ' (Minecraft ' + p.mc + ')'))); sel.value = ST.active;
            const pid = await modal('Copiar el mapa a un perfil', el('div', {}, el('p', { style: 'color:var(--mut);margin-bottom:12px' }, 'Aparecerá en Un jugador dentro de ese perfil. Mejor uno con la misma versión (' + s.mc + ').'), sel), [{ t: 'Cancelar', v: null }, { t: 'Copiar', v: () => sel.value, cls: 'pri' }]);
            if (!pid) return; const n = await A.call('worldToProfile', s.id, pid); toast(`Copiado como «${n}» en ${P(pid).name}`, 'ok', 6000);
          }, 'sm pri'),
          B('chest', 'Guardar en la biblioteca', async () => { const W = await A.call('worldsList', s.id), cur = W.worlds.find(w => w.current); if (!cur || cur.fresh) throw new Error('Todavía no hay mundo: enciende el servidor una vez'); if (ready) { await A.call('hostCmd', 'save-all flush'); await new Promise(r => setTimeout(r, 2500)); } await A.call('worldToLibrary', s.id, cur.folder); toast('Copiado a tu biblioteca de mapas', 'ok'); }, 'sm'),
          B('download', 'Copia de seguridad', async () => { const n = await A.call('backupCreate', s.id); toast('Copia creada: ' + n, 'ok'); }, 'sm ghost')),
        el('p', { class: 'hint' }, s.shareWorld !== false ? 'Tus amigos también pueden bajarse una copia desde su launcher. Se desactiva en Ajustes.' : 'Tus amigos no pueden bajarse el mapa (está desactivado en Ajustes).')),
      el('div', { class: 'panel' }, el('h3', {}, 'Abrir carpetas'),
        el('div', { class: 'row' }, ...[['server', 'Servidor', 'folder'], ['world', 'Mundo', 'map'], ['mods', 'Mods', 'cube'], ['logs', 'Registros', 'filetext'], ['crash', 'Informes de fallos', 'alert'], ['props', 'server.properties', 'file']]
          .map(([w, t, i]) => el('button', { class: 'btn sm', onclick: () => A.call('serverOpen', s.id, w) }, I(i, 14), t)))))));
}

// ---------- Consola ----------
function tabConsola(s, body) {
  const live = ST.host.id === s.id;
  const L = ctx(el('div', { class: 'console', id: 'slog', 'data-follow': '1' }), e => consoleCtx(e, L, s));
  const fill = ls => { L.replaceChildren(); ls.forEach(x => addLine(L, x)); L.scrollTop = 1e9; };
  if (live) { if (SL.length) fill(SL); else A.call('hostLog').then(ls => { SL = [...ls]; fill(SL); }); }
  else L.append(el('div', { class: 'c' }, '[Compass] El servidor está apagado. Al iniciarlo verás aquí todo lo que pasa.'));
  const hist = store.get('hist') || []; let hi = hist.length;
  const inp = el('input', { class: 'in', placeholder: live ? 'Escribe un comando sin la barra: op TuNombre, time set day, say hola…' : 'Enciende el servidor para mandar comandos', spellcheck: 'false', disabled: !live,
    onkeydown: e => { if (e.key === 'ArrowUp' && hi > 0) { inp.value = hist[--hi]; e.preventDefault(); } if (e.key === 'ArrowDown') { inp.value = hist[++hi] || ''; if (hi > hist.length) hi = hist.length; e.preventDefault(); } } });
  const send = c => { c = c.trim().replace(/^\//, ''); if (!c) return; A.call('hostCmd', c); srvLine('> ' + c); if (hist[hist.length - 1] !== c) { hist.push(c); if (hist.length > 60) hist.shift(); store.set('hist', hist); } hi = hist.length; };
  const form = el('form', { class: 'cmdline', onsubmit: e => { e.preventDefault(); send(inp.value); inp.value = ''; } }, el('span', { class: 'pfx' }, '/'), inp, el('button', { class: 'btn pri', disabled: !live }, I('send', 14), 'Enviar'));
  const filt = el('div', { class: 'seg' }, ...[['', 'Todo'], ['f-w', 'Avisos'], ['f-e', 'Errores']].map(([c, t], i) => el('button', { class: i ? '' : 'on', onclick: e => { L.classList.remove('f-w', 'f-e'); if (c) L.classList.add(c); $$('button', filt).forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, t)));
  const quick = el('div', { class: 'quick' }, ...['list', 'save-all', 'time set day', 'weather clear', 'difficulty normal', 'gamerule keepInventory true', 'whitelist list', 'tps'].map(c => el('button', { class: 'chip', disabled: !live, onclick: () => send(c) }, c)));
  body.replaceChildren(el('div', { class: 'tools' }, filt, el('label', { class: 'row nw', style: 'gap:8px;font-size:13px' }, sw(true, v => L.dataset.follow = v ? '1' : '0'), 'Seguir al final'), el('div', { class: 'sp' }),
    el('button', { class: 'btn sm ghost', onclick: () => A.call('serverOpen', s.id, 'logs') }, I('folder', 14), 'Registros antiguos'), el('button', { class: 'btn sm ghost', onclick: () => { SL = []; L.replaceChildren(); } }, 'Limpiar')),
    L, form, quick);
  if (live) inp.focus();
}
function srvLine(x) { SL.push(x); if (SL.length > 1500) SL.shift(); const L = $('#slog'); if (L) addLine(L, x); }

// ---------- Mapa ----------
let MAPSUB = 'mundo';
function makeMap(ref, opts = {}) {
  const root = el('div', { class: 'mapview' + (opts.pickable ? ' pick' : '') }), coords = el('div', { class: 'coords' }, 'X 0, Z 0');
  const stage = el('div', { style: 'position:absolute;inset:0' }), marks = el('div', { style: 'position:absolute;inset:0;pointer-events:none' });
  let info = null, scale = 1, cx = 0, cz = 0, W = 0, Hh = 0, pick = null, pop = null;
  const tiles = new Map(), queue = []; let running = 0;
  const pump = () => { while (running < 2 && queue.length) { const t = queue.shift(); running++; A.call('mapTile', ref, t.x, t.z).then(r => { if (r) { t.img.src = r.url; t.img.hidden = false; t.ph.remove(); } else t.ph.textContent = 'Vacío'; }).catch(() => { t.ph.textContent = 'Error'; }).finally(() => { running--; pump(); }); } };
  const zoomBtn = (i, f, title) => el('button', { title, onclick: e => { e.stopPropagation(); if (f === 'fit') center(); else zoomAt(W / 2, Hh / 2, f); } }, I(i, 16));
  const ctl = el('div', { class: 'mapctl' }, zoomBtn('plus', 2, 'Acercar'), zoomBtn('minus', .5, 'Alejar'), zoomBtn('target', 'fit', 'Centrar en el spawn'));
  root.append(stage, marks, ctl, coords);
  const w2s = (x, z) => [(x - cx) * scale + W / 2, (z - cz) * scale + Hh / 2];
  const s2w = (sx, sy) => [cx + (sx - W / 2) / scale, cz + (sy - Hh / 2) / scale];
  function marker(x, z, label, cls) { const [sx, sy] = w2s(x + .5, z + .5); return el('div', { class: 'mk ' + (cls || ''), style: `left:${sx}px;top:${sy}px` }, el('span', { class: 'flag' }, I('flag', 12), label), el('span', { class: 'pole' }), el('span', { class: 'foot' })); }
  function draw() {
    W = root.clientWidth; Hh = root.clientHeight; if (!info || !W) return;
    for (const r of info.regions) {
      const k = r.x + ',' + r.z, [sx, sy] = w2s(r.x * 512, r.z * 512), sz = 512 * scale, vis = sx < W && sy < Hh && sx + sz > 0 && sy + sz > 0;
      let t = tiles.get(k);
      if (!t && vis) { t = { x: r.x, z: r.z, img: el('img', { alt: '', hidden: true, draggable: 'false' }), ph: el('div', { class: 'ld' }, 'Dibujando…') }; tiles.set(k, t); stage.append(t.ph, t.img); queue.push(t); pump(); }
      if (t) for (const e of [t.img, t.ph]) { e.style.left = sx + 'px'; e.style.top = sy + 'px'; e.style.width = sz + 'px'; e.style.height = sz + 'px'; e.style.display = vis ? '' : 'none'; }
    }
    const ms = [];
    if (info.spawn) ms.push(marker(info.spawn.x, info.spawn.z, 'Spawn'));
    if (info.pending) ms.push(marker(info.pending.x, info.pending.z, 'Nuevo spawn', 'pend'));
    if (pick) ms.push(marker(pick.x, pick.z, `${pick.x}, ${pick.z}`, 'pick'));
    marks.replaceChildren(...ms);
    if (pop && pick) { const [sx, sy] = w2s(pick.x + .5, pick.z + .5); pop.style.left = Math.min(W - 262, Math.max(8, sx + 14)) + 'px'; pop.style.top = Math.min(Hh - 160, Math.max(8, sy - 20)) + 'px'; }
  }
  function zoomAt(mx, my, f) { const [wx, wz] = s2w(mx, my); scale = Math.max(1 / 16, Math.min(8, scale * f)); cx = wx - (mx - W / 2) / scale; cz = wz - (my - Hh / 2) / scale; draw(); }
  function center() {
    if (!info || !info.regions.length) return;
    const sp = info.pending || info.spawn;
    if (sp) { cx = sp.x; cz = sp.z; } else { const xs = info.regions.map(r => r.x), zs = info.regions.map(r => r.z); cx = (Math.min(...xs) + Math.max(...xs) + 1) * 256; cz = (Math.min(...zs) + Math.max(...zs) + 1) * 256; }
    scale = Math.max(1 / 4, Math.min(2, (root.clientWidth || 800) / 640)); draw();
  }
  function closePop() { if (pop) pop.remove(); pop = null; pick = null; draw(); }
  async function choose(sx, sy) {
    const [wx, wz] = s2w(sx, sy), x = Math.floor(wx), z = Math.floor(wz);
    pick = { x, z, y: null }; if (pop) pop.remove();
    const yEl = el('span', {}, '…');
    const setB = el('button', { class: 'btn pri sm', disabled: true, onclick: e => act(e.currentTarget, async () => { await opts.onPick(pick); closePop(); }) }, I('flag', 14), 'Poner el spawn aquí');
    pop = el('div', { class: 'mappop', onpointerdown: e => e.stopPropagation(), onwheel: e => e.stopPropagation() },
      el('b', {}, 'Punto elegido'), el('dl', { class: 'kv', style: 'margin:8px 0 12px' }, el('dt', {}, 'X'), el('dd', {}, String(x)), el('dt', {}, 'Altura'), el('dd', {}, yEl), el('dt', {}, 'Z'), el('dd', {}, String(z))),
      el('div', { class: 'row' }, setB, el('button', { class: 'btn ghost sm', onclick: closePop }, 'Cancelar')));
    root.append(pop); draw();
    try { const y = await A.call('mapHeight', ref, x, z); pick.y = y || 80; yEl.textContent = y ? String(y) : 'sin terreno (se usará 80)'; } catch { pick.y = 80; yEl.textContent = '80'; }
    setB.disabled = false;
  }
  let drag = null;
  root.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('.mapctl')) return; drag = { x: e.clientX, y: e.clientY, cx, cz, moved: false }; root.setPointerCapture(e.pointerId); });
  root.addEventListener('pointermove', e => {
    const r = root.getBoundingClientRect(), [wx, wz] = s2w(e.clientX - r.left, e.clientY - r.top); coords.textContent = `X ${Math.floor(wx)}, Z ${Math.floor(wz)}`;
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; root.classList.add('drag'); }
    if (drag.moved) { cx = drag.cx - dx / scale; cz = drag.cz - dy / scale; draw(); }
  });
  root.addEventListener('pointerup', e => { if (!drag) return; const d = drag; drag = null; root.classList.remove('drag'); if (!d.moved && opts.pickable && info && info.regions.length) { const r = root.getBoundingClientRect(); choose(e.clientX - r.left, e.clientY - r.top); } });
  root.addEventListener('wheel', e => { e.preventDefault(); const r = root.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
  new ResizeObserver(() => draw()).observe(root);
  async function load(keepView) {
    tiles.clear(); stage.replaceChildren(); queue.length = 0;
    $$('.mapmsg', root).forEach(x => x.remove());
    try { info = await A.call('mapInfo', ref); } catch (e) { root.append(el('div', { class: 'mapmsg' }, el('div', {}, el('b', {}, 'No se pudo leer el mundo'), clean(e)))); return; }
    if (opts.onInfo) opts.onInfo(info);
    if (!info.regions.length) {
      root.append(el('div', { class: 'mapmsg' }, el('div', {}, el('div', { html: ic('map', 44), style: 'display:grid;place-items:center;margin-bottom:12px;color:var(--dim)' }),
        el('b', {}, info.exists ? 'Aún no hay terreno que enseñar' : 'Este mundo todavía no existe'),
        opts.emptyText || 'Enciende el servidor una vez: Minecraft genera el terreno y aquí lo verás desde arriba.')));
      ctl.hidden = true; return;
    }
    ctl.hidden = false; if (!keepView) center(); else draw();
  }
  load();
  return { node: root, reload: () => load(true), setPending: p => { if (info) { info.pending = p; draw(); } }, setSpawn: p => { if (info) { info.spawn = p; info.pending = null; draw(); } } };
}
function tabMapa(s, body) {
  const sub = el('div', { class: 'seg' }, ...[['mundo', 'Mundo del servidor', 'map'], ['biblio', 'Mi biblioteca', 'chest'], ['buscar', 'Buscar mapas', 'search']].map(([k, t, i]) => el('button', { class: MAPSUB === k ? 'on' : '', onclick: () => { MAPSUB = k; tabMapa(s, body); } }, I(i, 14), t)));
  const box = el('div', { style: 'margin-top:16px' });
  body.replaceChildren(sub, box);
  if (MAPSUB === 'mundo') mapMundo(s, box); else if (MAPSUB === 'biblio') mapBiblio(s, box); else mapBuscar(s, box);
}
async function mapMundo(s, box) {
  const running = ST.host.id === s.id && ST.host.state !== 'off', ready = ST.host.id === s.id && ST.host.state === 'ready';
  const side = el('div', { class: 'stack' }), infoBox = el('div', {});
  const view = makeMap({ kind: 'server', id: s.id }, {
    pickable: true,
    onPick: async p => { const r = await A.call('mapSetSpawn', s.id, p); if (r.now) { view.setSpawn({ x: p.x, y: p.y, z: p.z }); toast(`Spawn colocado en ${p.x}, ${p.y}, ${p.z}`, 'ok'); } else { view.setPending({ x: p.x, y: p.y, z: p.z }); toast('Spawn marcado: se aplica al encender el servidor', 'ok', 5000); } paintInfo(); },
    onInfo: i => { cur = i; paintInfo(); },
  });
  let cur = null;
  function paintInfo() {
    if (!cur) return;
    infoBox.replaceChildren(el('dl', { class: 'kv' },
      el('dt', {}, 'Mundo'), el('dd', {}, cur.name), cur.version ? [el('dt', {}, 'Creado en'), el('dd', {}, 'Minecraft ' + cur.version)] : null,
      el('dt', {}, 'Spawn'), el('dd', {}, cur.spawn ? `${cur.spawn.x}, ${cur.spawn.y}, ${cur.spawn.z}` : 'Sin definir'),
      cur.pending ? [el('dt', {}, 'Nuevo spawn'), el('dd', {}, el('span', { class: 'tag warn' }, `${cur.pending.x}, ${cur.pending.y}, ${cur.pending.z}`))] : null,
      cur.seed ? [el('dt', {}, 'Semilla'), el('dd', { style: 'font-family:var(--mono);font-size:12px;word-break:break-all' }, cur.seed)] : null),
      cur.pending ? el('div', { class: 'row', style: 'margin-top:10px' }, el('small', { style: 'flex:1' }, 'Se aplica al encender.'), el('button', { class: 'btn sm ghost', onclick: async () => { await A.call('mapClearPending', s.id); cur.pending = null; view.setPending(null); paintInfo(); } }, 'Descartar')) : null);
  }
  box.replaceChildren(el('div', { class: 'mapwrap' }, el('div', {}, view.node,
    el('div', { class: 'row', style: 'margin-top:10px' }, el('small', { style: 'flex:1' }, 'Arrastra para moverte, rueda para el zoom y haz clic donde quieras que aparezca la gente.'),
      B('refresh', 'Actualizar', async () => { if (ready) { await A.call('hostCmd', 'save-all flush'); await new Promise(r => setTimeout(r, 2500)); } view.reload(); }, 'sm'))), side));
  side.append(el('div', { class: 'panel' }, el('h3', {}, 'Este mundo'), infoBox));
  const wl = el('div', {});
  side.append(el('div', { class: 'panel' }, el('h3', {}, 'Mundos del servidor'), wl,
    el('div', { class: 'row', style: 'margin-top:12px' },
      el('button', { class: 'btn sm pri', disabled: running, title: running ? 'Apaga el servidor primero' : '', onclick: () => newWorldDialog(s) }, I('seed', 14), 'Mundo nuevo'),
      el('button', { class: 'btn sm', onclick: () => { MAPSUB = 'biblio'; tabMapa(s, box.parentElement); } }, I('chest', 14), 'Poner uno de la biblioteca')),
    running ? el('p', { class: 'hint' }, 'Para cambiar de mundo, apaga antes el servidor.') : null));
  try {
    const W = await A.call('worldsList', s.id);
    wl.replaceChildren(...W.worlds.map(w => el('div', { class: 'worldrow' + (w.current ? ' cur' : '') }, el('span', { html: ic(w.fresh ? 'seed' : 'map', 18), style: 'color:var(--acc)' }),
      el('div', { class: 't' }, el('b', {}, w.name), el('small', {}, w.fresh ? 'Se genera al encender' : [w.version ? 'Minecraft ' + w.version : null, w.folder !== w.name ? 'carpeta ' + w.folder : null].filter(Boolean).join(', ') || w.folder)),
      w.current ? el('span', { class: 'tag acc' }, 'En uso') : el('button', { class: 'btn sm', disabled: running, onclick: e => act(e.currentTarget, async () => { await A.call('worldUse', s.id, w.folder); toast('Mundo cambiado a ' + w.name, 'ok'); mapMundo(s, box); }) }, 'Usar'),
      w.fresh ? null : el('button', { class: 'btn ghost sm ico', title: 'Guardar una copia en la biblioteca', onclick: e => act(e.currentTarget, async () => { await A.call('worldToLibrary', s.id, w.folder); toast('Copiado a tu biblioteca de mapas', 'ok'); }) }, I('chest', 14)),
      w.current || w.fresh ? null : el('button', { class: 'btn ghost sm ico', title: 'Mandar a la papelera', onclick: async () => { if (await confirmBox('¿Borrar este mundo?', `«${w.name}» va a la papelera de Windows.`, 'Borrar')) { try { await A.call('worldDelete', s.id, w.folder); mapMundo(s, box); } catch (e) { toast(clean(e), 'error'); } } } }, I('trash', 14)))));
  } catch (e) { wl.textContent = clean(e); }
}
async function newWorldDialog(s) { return worldWizard(s); }
function mapThumb(ref, holder) {
  A.call('mapInfo', ref).then(async info => {
    if (!info.regions.length) { holder.replaceChildren(el('span', {}, 'Sin vista previa')); return; }
    const sp = info.spawn, has = sp && info.regions.find(r => r.x === Math.floor(sp.x / 512) && r.z === Math.floor(sp.z / 512)), r = has || info.regions[0];
    const t = await A.call('mapTile', ref, r.x, r.z); if (t) holder.replaceChildren(el('img', { src: t.url, alt: '' }));
  }).catch(() => holder.replaceChildren(el('span', {}, 'Sin vista previa')));
}
function previewOverlay(m, s) {
  const running = ST.host.id === s.id && ST.host.state !== 'off';
  const close = () => ov.remove();
  const view = makeMap({ kind: 'library', id: m.id }, { emptyText: 'Este mapa no trae terreno guardado o es de una versión muy antigua (antes de la 1.17). Puedes usarlo igual: el servidor lo convierte.' });
  const ov = el('div', { class: 'overlay', onmousedown: e => { if (e.target === ov) close(); } },
    el('div', { class: 'frame' }, el('div', { class: 'row', style: 'margin-bottom:12px' }, el('h2', { style: 'font-size:26px;flex:1' }, m.title), m.version ? el('span', { class: 'tag' }, 'Minecraft ' + m.version) : null,
      el('button', { class: 'btn pri', disabled: running, title: running ? 'Apaga el servidor primero' : '', onclick: e => act(e.currentTarget, async () => { await A.call('libToServer', m.id, s.id); close(); toast(`«${m.title}» es ahora el mundo de ${s.name}`, 'ok', 6000); MAPSUB = 'mundo'; renderHost(); }) }, I('check', 16), 'Usar en ' + s.name),
      el('button', { class: 'btn ghost ico', title: 'Cerrar', onclick: close }, I('x', 18))), view.node,
      el('p', { class: 'hint' }, 'Así se ve desde arriba. Cuando lo pongas en el servidor, podrás marcar el spawn haciendo clic en el mapa.')));
  document.body.append(ov);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
}
async function mapBiblio(s, box) {
  const grid = el('div', { class: 'mapgrid' });
  box.replaceChildren(el('div', { class: 'tools' }, el('p', { style: 'color:var(--mut);flex:1;min-width:260px' }, 'Tus mapas guardados. Puedes verlos desde arriba antes de ponerlos en un servidor.'),
    B('download', 'Importar .zip', async () => { const n = await A.call('libImportZip'); if (n) { toast('Mapa añadido a la biblioteca', 'ok'); mapBiblio(s, box); } }, 'sm'),
    B('folder', 'Importar carpeta', async () => { const n = await A.call('libImportFolder'); if (n) { toast('Mapa añadido a la biblioteca', 'ok'); mapBiblio(s, box); } }, 'sm'),
    el('button', { class: 'btn sm pri', onclick: () => { MAPSUB = 'buscar'; tabMapa(s, box.parentElement); } }, I('search', 14), 'Buscar mapas')), grid);
  const L = await A.call('libList').catch(e => { toast(clean(e), 'error'); return []; });
  if (!L.length) { grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('chest', 44) }), el('b', {}, 'Tu biblioteca está vacía'), 'Descarga mapas de aventura, parkour o supervivencia desde «Buscar mapas», o importa un .zip que tengas.')); return; }
  for (const m of L) {
    const th = el('div', { class: 'thumb' }, el('span', { class: 'spin' }));
    grid.append(el('div', { class: 'mapcard' }, th, el('div', { class: 'body' }, el('b', {}, m.title), el('small', {}, [m.version ? 'Minecraft ' + m.version : null, m.source === 'curseforge' ? 'de CurseForge' : m.source !== 'local' ? m.source : null, m.author].filter(Boolean).join(', ') || 'Importado')),
      el('div', { class: 'acts' }, el('button', { class: 'btn sm pri', onclick: () => previewOverlay(m, s) }, I('eye', 14), 'Ver y usar'),
        el('button', { class: 'btn sm ghost ico', title: 'Renombrar', onclick: async () => { const t = await ask('Renombrar mapa', 'Nombre', m.title); if (t) { await A.call('libRename', m.id, t); mapBiblio(s, box); } } }, I('edit', 14)),
        el('button', { class: 'btn sm ghost ico', title: 'Borrar', onclick: async () => { if (await confirmBox('¿Borrar este mapa?', `«${m.title}» va a la papelera. Los servidores que ya lo usan no se tocan.`, 'Borrar')) { await A.call('libDelete', m.id); mapBiblio(s, box); } } }, I('trash', 14)))));
  }
  // vistas previas de una en una para no saturar
  for (const [i, m] of L.entries()) { await new Promise(r => { mapThumb({ kind: 'library', id: m.id }, $$('.thumb', grid)[i]); setTimeout(r, 120); }); }
}
function mapBuscar(s, box) {
  const S = { q: '', offset: 0, total: 0, gen: 0, ver: true };
  const grid = el('div', { class: 'mapgrid' }), more = el('button', { class: 'btn', hidden: true, onclick: e => act(e.currentTarget, () => load(false)) }, 'Cargar más');
  const q = el('input', { class: 'in', placeholder: 'Parkour, aventura, ciudad, skyblock…', spellcheck: 'false' });
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { S.q = q.value.trim(); load(true); }, 400); };
  const verSw = el('label', { class: 'row nw', style: 'gap:8px;font-size:13px;white-space:nowrap' }, sw(true, v => { S.ver = v; load(true); }), 'Solo de Minecraft ' + s.mc);
  async function load(reset) {
    if (!ST.hasKey) {
      const k = el('input', { class: 'in', type: 'password', placeholder: 'Tu clave de API de CurseForge' });
      grid.replaceChildren(el('div', { class: 'panel', style: 'grid-column:1/-1' }, el('h3', {}, 'Los mapas vienen de CurseForge'),
        el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Necesitas una clave gratuita (console.curseforge.com). Se guarda solo en tu PC y sirve también para los mods.'),
        el('div', { class: 'row nw' }, k, B('key', 'Guardar clave', async () => { await A.call('setKey', k.value); ST.hasKey = !!k.value.trim(); load(true); }, 'pri')))); return;
    }
    const gen = ++S.gen; if (reset) { S.offset = 0; grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skel', style: 'height:250px' }))); }
    try {
      const r = await A.call('mapSearch', { q: S.q, offset: S.offset, mc: S.ver ? s.mc : null }); if (gen !== S.gen) return;
      if (reset) grid.replaceChildren();
      for (const m of r.items) {
        const th = el('div', { class: 'thumb' }); const src = m.shot || m.icon; if (src) th.append(el('img', { class: 'photo', src, alt: '', loading: 'lazy' })); else th.innerHTML = ic('map', 32);
        grid.append(el('div', { class: 'mapcard' }, th, el('div', { class: 'body' }, el('b', {}, m.title), el('small', {}, m.desc || ''), el('small', { style: 'color:var(--dim)' }, [m.author, Number(m.downloads || 0).toLocaleString('es') + ' descargas', m.versions.join(', ')].filter(Boolean).join(' | '))),
          el('div', { class: 'acts' }, B('download', 'A mi biblioteca', async () => { await A.call('mapDownload', m.id); toast(`«${m.title}» descargado. Míralo en Mi biblioteca.`, 'ok', 6000); }, 'sm pri'),
            m.url ? el('button', { class: 'btn sm ghost', onclick: () => window.open(m.url) }, I('external', 14), 'Ver en la web') : null)));
      }
      S.offset += r.items.length; S.total = r.total; more.hidden = !r.items.length || S.offset >= S.total;
      if (reset && !r.items.length) grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('search', 40) }), el('b', {}, 'Sin resultados'), S.ver ? 'Prueba a quitar el filtro de versión.' : 'Prueba con otras palabras.'));
    } catch (e) { if (gen === S.gen) grid.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('alert', 40) }), el('b', {}, 'No se pudo buscar'), clean(e))); }
  }
  box.replaceChildren(el('div', { class: 'tools' }, el('div', { class: 'search' }, I('search', 16), q), verSw), grid, el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, more));
  load(true);
}

// ---------- Mods del servidor ----------
let MODSUB = 'inst';
function tabMods(s, body) {
  const sub = el('div', { class: 'seg' }, ...[['inst', 'Instalados', 'cube'], ['store', 'Añadir de la tienda', 'bag']].map(([k, t, i]) => el('button', { class: MODSUB === k ? 'on' : '', onclick: () => { MODSUB = k; tabMods(s, body); } }, I(i, 14), t)));
  const running = ST.host.id === s.id && ST.host.state !== 'off';
  body.replaceChildren(el('div', { class: 'tools' }, sub, el('div', { class: 'sp' }), running ? el('small', {}, 'Los cambios de mods se aplican al reiniciar.') : null),
    el('div', { class: 'panel' }, MODSUB === 'inst' ? makeMods(target('server', s.id), { onStore: () => { MODSUB = 'store'; tabMods(s, body); } }).node : makeStore(() => target('server', s.id)).node),
    el('p', { class: 'hint' }, 'Tus amigos reciben solos los mods del servidor al unirse; los de solo servidor no se les mandan.'));
}

// ---------- Gente y permisos ----------
const OPL = { 1: 'Nivel 1: construir en el spawn protegido', 2: 'Nivel 2: trucos (/gamemode, /tp, /give)', 3: 'Nivel 3: moderar (/kick, /ban, /op)', 4: 'Nivel 4: control total (/stop)' };
async function tabGente(s, body) {
  let D;
  try { D = await A.call('permsGet', s.id); } catch (e) { body.replaceChildren(el('div', { class: 'banner bad' }, I('alert', 18), el('div', { class: 't' }, clean(e)))); return; }
  const live = D.running, run = (action, a, okMsg) => A.call('permsAct', s.id, action, a).then(() => { if (okMsg) toast(okMsg, 'ok', 2500); setTimeout(() => tabGente(s, body), live ? 900 : 0); }).catch(e => toast(clean(e), 'error', 6000));
  const name = el('input', { class: 'in', placeholder: 'Nombre de Minecraft', list: 'knownp', spellcheck: 'false' });
  const known = el('datalist', { id: 'knownp' }, ...[...new Set([...D.online, ...D.known])].map(n => el('option', { value: n })));
  const need = () => { const n = name.value.trim(); if (!n) { name.focus(); return null; } return n; };
  const add = el('div', { class: 'panel' }, el('h3', {}, 'Añadir a alguien'), known,
    el('div', { class: 'row nw' }, name,
      el('button', { class: 'btn', onclick: () => { const n = need(); if (n) run('op', { name: n }, n + ' ahora es OP'); } }, I('crown', 14), 'Hacer OP'),
      el('button', { class: 'btn', title: 'Solo podrá teletransportarse: nada de modo de juego ni otros comandos', onclick: () => { const n = need(); if (n) run('tpAdd', { name: n }, n + ' ya puede usar !tp'); } }, I('tp', 14), 'Dar solo TP'),
      el('button', { class: 'btn', onclick: () => { const n = need(); if (n) run('wlAdd', { name: n }, n + ' está en la lista blanca'); } }, I('shield', 14), 'A la lista blanca'),
      el('button', { class: 'btn dng', onclick: async () => { const n = need(); if (n && await confirmBox('¿Banear a ' + n + '?', 'No podrá entrar hasta que le quites el baneo.', 'Banear')) run('ban', { name: n }, n + ' baneado'); } }, I('ban', 14), 'Banear')),
    el('p', { class: 'hint' }, live ? 'El servidor está encendido: los cambios se aplican al momento con comandos.' : 'Con el servidor apagado se editan sus archivos directamente' + (D.onlineMode ? ' (busco la cuenta en Mojang para sacar su UUID).' : '.')));

  const online = el('div', { class: 'panel' }, el('h3', {}, 'Conectados ahora', el('span', { class: 'tag' + (D.online.length ? ' ok' : '') }, String(D.online.length))),
    D.online.length ? el('div', { class: 'list' }, ...D.online.map(n => { const gm = el('select', { class: 'in lvl', title: 'Modo de juego' }, el('option', { value: '' }, 'Modo de juego…'), ...[['survival', 'Supervivencia'], ['creative', 'Creativo'], ['adventure', 'Aventura'], ['spectator', 'Espectador']].map(([v, t]) => el('option', { value: v }, t)));
      gm.onchange = () => { if (gm.value) run('gamemode', { name: n, mode: gm.value }, n + ' en modo ' + gm.selectedOptions[0].textContent.toLowerCase()); };
      return ctx(el('div', { class: 'li' }, head(n), el('div', { class: 't' }, el('b', {}, el('span', {}, n), D.ops.some(o => o.name === n) ? el('span', { class: 'tag acc' }, 'OP') : null, D.tp.some(t => t.name.toLowerCase() === n.toLowerCase()) ? el('span', { class: 'tag' }, 'TP') : null)), gm,
        D.tp.some(t => t.name.toLowerCase() === n.toLowerCase())
          ? el('button', { class: 'btn sm ghost', title: 'Quitar el permiso de TP', onclick: () => run('tpRemove', { name: n }, n + ' ya no puede usar !tp') }, I('tp', 14), 'Quitar TP')
          : el('button', { class: 'btn sm', title: 'Solo podrá teletransportarse', onclick: () => run('tpAdd', { name: n }, n + ' ya puede usar !tp') }, I('tp', 14), 'Dar TP'),
        el('button', { class: 'btn sm', title: 'Llevar al spawn', onclick: () => run('tpSpawn', { name: n }, n + ' llevado al spawn') }, I('flag', 14), 'Al spawn'),
        el('button', { class: 'btn sm', onclick: () => run('kick', { name: n }, n + ' echado') }, 'Echar'),
        el('button', { class: 'btn sm dng', onclick: async () => { if (await confirmBox('¿Banear a ' + n + '?', 'No podrá entrar hasta que le quites el baneo.', 'Banear')) run('ban', { name: n }, n + ' baneado'); } }, 'Banear')), () => playerCtx(s, n, D, () => tabGente(s, body))); }))
      : el('p', { class: 'hint', style: 'margin:0' }, live ? 'No hay nadie dentro ahora mismo.' : 'Enciende el servidor para ver y gestionar a quien esté jugando.'));

  const ops = el('div', { class: 'panel' }, el('h3', {}, 'Operadores', el('span', { class: 'tag' }, String(D.ops.length))),
    el('p', { class: 'hint', style: 'margin:-6px 0 8px' }, 'Pueden usar comandos según su nivel. El nivel exacto se cambia con el servidor apagado.'),
    D.ops.length ? el('div', { class: 'list' }, ...D.ops.map(o => { const l = el('select', { class: 'in lvl', disabled: live }, ...[1, 2, 3, 4].map(n => el('option', { value: n }, OPL[n]))); l.value = o.level || 4; l.onchange = () => run('setLevel', { name: o.name, level: +l.value }, 'Nivel de ' + o.name + ' cambiado');
      return el('div', { class: 'li' }, head(o.name), el('div', { class: 't' }, el('b', {}, el('span', {}, o.name), el('span', { class: 'tag acc' }, I('crown', 11), ' ' + (o.level || 4)))), l,
        el('button', { class: 'btn sm ghost', onclick: () => run('deop', { name: o.name }, o.name + ' ya no es OP') }, 'Quitar OP')); }))
      : el('p', { class: 'hint', style: 'margin:0' }, 'Nadie es OP todavía. Hazte OP a ti para poder usar comandos dentro del juego.'));

  const tp = el('div', { class: 'panel' }, el('h3', {}, I('tp', 16), ' Permiso de TP', el('span', { class: 'tag' + (D.tp.length ? ' acc' : '') }, String(D.tp.length))),
    el('p', { class: 'hint', style: 'margin:-6px 0 8px' }, 'Solo pueden teletransportarse, sin ser OP: nada de modo de juego, /give ni otros comandos. En el chat del juego escriben:'),
    el('div', { class: 'cmdhelp' }, el('code', {}, '!tp Nombre'), el('span', {}, 'ir hasta otro jugador'), el('code', {}, '!tp x y z'), el('span', {}, 'ir a unas coordenadas')),
    D.tp.length ? el('div', { class: 'list' }, ...D.tp.map(t => el('div', { class: 'li' }, head(t.name), el('div', { class: 't' }, el('b', {}, el('span', {}, t.name)), el('small', {}, D.online.some(o => o.toLowerCase() === t.name.toLowerCase()) ? 'Conectado' : 'Desconectado')),
      el('button', { class: 'btn sm ghost', onclick: () => run('tpRemove', { name: t.name }, t.name + ' ya no puede usar !tp') }, 'Quitar TP'))))
      : el('p', { class: 'hint', style: 'margin:0' }, 'Nadie todavía. Escribe un nombre arriba y pulsa «Dar solo TP».'));

  const wl = el('div', { class: 'panel' }, el('h3', {}, 'Lista blanca', el('span', { class: 'sp' }), el('label', { class: 'row nw', style: 'gap:8px;font:600 13px var(--body)' }, D.whitelistOn ? 'Activada' : 'Desactivada', sw(D.whitelistOn, v => run('whitelist', { on: v }, v ? 'Lista blanca activada: solo entran los de la lista' : 'Lista blanca desactivada')))),
    el('p', { class: 'hint', style: 'margin:-6px 0 8px' }, D.whitelistOn ? 'Solo pueden entrar los que estén aquí.' : 'Apagada: puede entrar cualquiera que tenga el código.'),
    D.whitelist.length ? el('div', { class: 'list' }, ...D.whitelist.map(w => el('div', { class: 'li' }, head(w.name), el('div', { class: 't' }, el('b', {}, el('span', {}, w.name))),
      el('button', { class: 'btn sm ghost', onclick: () => run('wlRemove', { name: w.name }, w.name + ' quitado de la lista') }, 'Quitar'))))
      : el('p', { class: 'hint', style: 'margin:0' }, 'Vacía.'));

  const ip = el('input', { class: 'in', placeholder: 'IP, por ejemplo 83.45.12.9', spellcheck: 'false', style: 'max-width:240px' });
  const bans = el('div', { class: 'panel' }, el('h3', {}, 'Baneados', el('span', { class: 'tag' + (D.bans.length + D.ipbans.length ? ' bad' : '') }, String(D.bans.length + D.ipbans.length))),
    D.bans.length || D.ipbans.length ? el('div', { class: 'list' },
      ...D.bans.map(b => ctx(el('div', { class: 'li' }, head(b.name), el('div', { class: 't' }, el('b', {}, el('span', {}, b.name)), el('small', {}, (b.reason || '') + (b.created ? ' (' + b.created.slice(0, 10) + ')' : ''))),
        el('button', { class: 'btn sm', onclick: () => run('pardon', { name: b.name }, b.name + ' puede volver a entrar') }, 'Quitar baneo')), () => [{ t: b.name, title: true }, { i: 'check', t: 'Quitar baneo', f: () => run('pardon', { name: b.name }, b.name + ' puede volver a entrar') }, { i: 'copy', t: 'Copiar nombre', f: () => copyTxt(b.name) }])),
      ...D.ipbans.map(b => el('div', { class: 'li' }, el('span', { class: 'head', html: ic('globe', 16) }), el('div', { class: 't' }, el('b', {}, el('span', {}, b.ip)), el('small', {}, b.reason || '')),
        el('button', { class: 'btn sm', onclick: () => run('pardonIp', { ip: b.ip }, b.ip + ' desbaneada') }, 'Quitar baneo'))))
      : el('p', { class: 'hint', style: 'margin:0' }, 'Nadie baneado. Así da gusto.'),
    el('div', { class: 'row nw', style: 'margin-top:12px' }, ip, el('button', { class: 'btn sm dng', onclick: () => { if (ip.value.trim()) run('banIp', { ip: ip.value.trim() }, 'IP baneada'); } }, I('ban', 14), 'Banear IP')));

  body.replaceChildren(el('div', { class: 'stack' }, add, online, el('div', { class: 'cols' }, el('div', { class: 'stack' }, tp, ops), el('div', { class: 'stack' }, wl, bans))));
  body._paint = () => { if (TAB === 'gente') tabGente(s, body); };
}

// ---------- Archivos ----------
let FSREL = '', FSEDIT = null;
async function tabArchivos(s, body, rel = FSREL) {
  let R;
  try { R = await A.call('fsList', s.id, rel); } catch (e) { if (rel) return tabArchivos(s, body, ''); body.replaceChildren(el('div', { class: 'banner bad' }, I('alert', 18), el('div', { class: 't' }, clean(e)))); return; }
  FSREL = R.rel;
  const parts = R.rel ? R.rel.split('/') : [];
  const crumbs = el('div', { class: 'crumbs' }, el('button', { onclick: () => tabArchivos(s, body, '') }, s.name), ...parts.map((p, i) => [I('chevright', 14), el('button', { onclick: () => tabArchivos(s, body, parts.slice(0, i + 1).join('/')) }, p)]));
  const join = n => (R.rel ? R.rel + '/' : '') + n;
  const wrap = el('div', { class: 'files' + (FSEDIT ? ' editing' : '') });
  const listBox = el('div', { class: 'panel dropzone', style: 'padding:10px' });
  const rows = R.items.map(it => el('div', { class: 'frow' + (it.dir ? ' dir' : '') + (FSEDIT && FSEDIT.rel === join(it.name) ? ' sel' : ''), ondblclick: () => it.dir ? tabArchivos(s, body, join(it.name)) : it.text ? openEditor(join(it.name)) : A.call('fsReveal', s.id, join(it.name)),
    onclick: () => { if (it.dir) tabArchivos(s, body, join(it.name)); else if (it.text) openEditor(join(it.name)); } },
    I(it.dir ? 'folder' : it.text ? 'filetext' : /\.jar$/i.test(it.name) ? 'cube' : /\.(png|jpe?g)$/i.test(it.name) ? 'image' : /\.zip$/i.test(it.name) ? 'chest' : 'file', 18),
    el('span', { class: 'nm', title: it.name }, it.name), el('span', { class: 'sz' }, it.dir ? '' : sizeOf(it.size)), el('span', { class: 'dt' }, dateOf(it.mtime)),
    el('span', { class: 'acts', onclick: e => e.stopPropagation() },
      it.text ? el('button', { class: 'btn ghost sm ico', title: 'Editar', onclick: () => openEditor(join(it.name)) }, I('edit', 14)) : null,
      el('button', { class: 'btn ghost sm ico', title: 'Mostrar en el explorador', onclick: () => A.call('fsReveal', s.id, join(it.name)) }, I('external', 14)),
      el('button', { class: 'btn ghost sm ico', title: 'Renombrar', onclick: async () => { const n = await ask('Renombrar', 'Nuevo nombre', it.name); if (n && n !== it.name) { try { await A.call('fsRename', s.id, join(it.name), n); tabArchivos(s, body); } catch (e) { toast(clean(e), 'error'); } } } }, I('rename', 14)),
      el('button', { class: 'btn ghost sm ico', title: 'A la papelera', onclick: async () => { if (await confirmBox('¿Mandar a la papelera?', it.name + (it.dir ? ' y todo lo que tiene dentro' : '') + ' irá a la papelera de Windows.', 'Borrar')) { try { await A.call('fsDelete', s.id, join(it.name)); if (FSEDIT && FSEDIT.rel === join(it.name)) FSEDIT = null; tabArchivos(s, body); } catch (e) { toast(clean(e), 'error'); } } } }, I('trash', 14)))));
  listBox.append(...[
    el('div', { class: 'frow fhead' }, el('span'), el('span', {}, 'Nombre'), el('span', { class: 'sz' }, 'Tamaño'), el('span', { class: 'dt' }, 'Modificado'), el('span')),
    R.rel ? el('div', { class: 'frow dir', onclick: () => tabArchivos(s, body, parts.slice(0, -1).join('/')) }, I('chevleft', 18), el('span', { class: 'nm' }, 'Volver'), el('span'), el('span'), el('span')) : null,
    ...(rows.length ? rows : [el('div', { class: 'empty' }, el('div', { html: ic('folder', 36) }), el('b', {}, 'Carpeta vacía'), 'Arrastra archivos aquí para subirlos.')])].filter(Boolean));
  listBox.ondragover = e => { e.preventDefault(); listBox.classList.add('drop'); };
  listBox.ondragleave = e => { if (!listBox.contains(e.relatedTarget)) listBox.classList.remove('drop'); };
  listBox.ondrop = async e => { e.preventDefault(); listBox.classList.remove('drop'); const ps = [...e.dataTransfer.files].map(f => A.pathOf(f)).filter(Boolean); if (ps.length) { try { const n = await A.call('fsAddPaths', s.id, R.rel, ps); toast(plural(n, 'elemento subido', 'elementos subidos'), 'ok'); tabArchivos(s, body); } catch (x) { toast(clean(x), 'error'); } } };
  wrap.append(listBox);
  async function openEditor(rel2) {
    if (FSEDIT && FSEDIT.dirty && !(await confirmBox('Hay cambios sin guardar', 'Si abres otro archivo se pierden.', 'Descartar cambios'))) return;
    try { const text = await A.call('fsRead', s.id, rel2); FSEDIT = { rel: rel2, text, dirty: false }; tabArchivos(s, body); } catch (e) { toast(clean(e), 'error'); }
  }
  if (FSEDIT) {
    const running = ST.host.id === s.id && ST.host.state !== 'off';
    const ta = el('textarea', { class: 'in', spellcheck: 'false' }); ta.value = FSEDIT.text;
    const state = el('small', {}, 'Sin cambios');
    const saveB = el('button', { class: 'btn pri sm', onclick: e => act(e.currentTarget, async () => { await A.call('fsWrite', s.id, FSEDIT.rel, ta.value); FSEDIT.text = ta.value; FSEDIT.dirty = false; state.textContent = 'Guardado'; toast('Guardado' + (running ? '. Reinicia el servidor para aplicarlo.' : ''), 'ok', 3000); }) }, I('save', 14), 'Guardar');
    ta.oninput = () => { FSEDIT.dirty = ta.value !== FSEDIT.text; state.textContent = FSEDIT.dirty ? 'Cambios sin guardar' : 'Sin cambios'; };
    ta.onkeydown = e => { if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveB.click(); } if (e.key === 'Tab') { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText('  ', p, ta.selectionEnd, 'end'); ta.oninput(); } };
    wrap.append(el('div', { class: 'panel editor', style: 'padding:14px' }, el('div', { class: 'row nw', style: 'margin-bottom:10px' }, I('filetext', 18), el('b', { style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, FSEDIT.rel), state, saveB,
      el('button', { class: 'btn ghost sm ico', title: 'Cerrar', onclick: async () => { if (FSEDIT.dirty && !(await confirmBox('Hay cambios sin guardar', 'Si cierras se pierden.', 'Descartar cambios'))) return; FSEDIT = null; tabArchivos(s, body); } }, I('x', 16))),
      running && /server\.properties$|ops\.json$|whitelist\.json$/.test(FSEDIT.rel) ? el('div', { class: 'banner', style: 'margin-bottom:10px' }, I('alert', 18), el('div', { class: 't' }, 'Con el servidor encendido, este archivo puede sobrescribirse. Mejor edítalo apagado.')) : null, ta));
  }
  body.replaceChildren(el('div', { class: 'tools' }, crumbs, el('div', { class: 'sp' }),
    B('upload', 'Subir archivos', async () => { const n = await A.call('fsUpload', s.id, R.rel); if (n) { toast(plural(n, 'archivo subido', 'archivos subidos'), 'ok'); tabArchivos(s, body); } }, 'sm'),
    el('button', { class: 'btn sm', onclick: async () => { const n = await ask('Nueva carpeta', 'Nombre', '', 'Crear'); if (n) { try { await A.call('fsMkdir', s.id, R.rel, n); tabArchivos(s, body); } catch (e) { toast(clean(e), 'error'); } } } }, I('folderplus', 14), 'Carpeta'),
    el('button', { class: 'btn sm', onclick: async () => { const n = await ask('Nuevo archivo', 'Nombre (con extensión)', 'nuevo.txt', 'Crear'); if (n) { try { await A.call('fsNewFile', s.id, R.rel, n); openEditor(join(n)); } catch (e) { toast(clean(e), 'error'); } } } }, I('fileplus', 14), 'Archivo'),
    el('button', { class: 'btn sm ghost', onclick: () => A.call('fsReveal', s.id, R.rel || '.') }, I('external', 14), 'Abrir en Windows'),
    el('button', { class: 'btn sm ghost ico', title: 'Actualizar', onclick: () => tabArchivos(s, body) }, I('refresh', 14))), wrap);
}

// ---------- Copias ----------
async function tabCopias(s, body) {
  const running = ST.host.id === s.id && ST.host.state !== 'off', list = el('div', { class: 'list', style: 'margin-top:12px' });
  const draw = async () => {
    const bs = await A.call('backupList', s.id);
    list.replaceChildren(...(bs.length ? bs.map(b => el('div', { class: 'li' }, el('span', { class: 'ico40', html: ic('chest', 20) }),
      el('div', { class: 't' }, el('b', {}, el('span', {}, b.file)), el('small', {}, new Date(b.time).toLocaleString('es') + ', ' + sizeOf(b.size))),
      el('button', { class: 'btn sm', disabled: running, title: running ? 'Apaga el servidor para restaurar' : '', onclick: async e => { if (await confirmBox('¿Restaurar esta copia?', 'El mundo actual se guarda aparte (carpeta «antes-de-restaurar») y se pone el de la copia.', 'Restaurar')) act(e.currentTarget, async () => { await A.call('backupRestore', s.id, b.file); toast('Copia restaurada', 'ok'); }); } }, I('restart', 14), 'Restaurar'),
      el('button', { class: 'btn ghost ico sm', title: 'Borrar', onclick: async () => { if (await confirmBox('¿Borrar la copia?', b.file, 'Borrar')) { await A.call('backupDelete', s.id, b.file); draw(); } } }, I('trash', 14))))
      : [el('div', { class: 'empty' }, el('div', { html: ic('chest', 40) }), el('b', {}, 'Sin copias todavía'), 'Haz una antes de tocar mods, cambiar de versión o probar un mapa nuevo.')]));
  };
  body.replaceChildren(el('div', { class: 'panel' }, el('h3', {}, 'Copias del mundo'),
    el('p', { class: 'hint', style: 'margin:-4px 0 14px' }, 'Se guardan en .zip dentro del servidor. Puedes hacerlas con él encendido: el guardado se pausa un momento.'),
    el('div', { class: 'row' }, B('chest', 'Hacer copia ahora', async () => { const n = await A.call('backupCreate', s.id); toast('Copia creada: ' + n, 'ok'); draw(); }, 'pri'),
      el('button', { class: 'btn', onclick: () => A.call('serverOpen', s.id, 'backups') }, I('folder', 16), 'Abrir carpeta')), list));
  draw();
}

// ---------- Ajustes del servidor ----------
async function tabAjustes(s, body) {
  const pr = await A.call('serverProps', s.id), running = ST.host.id === s.id && ST.host.state !== 'off';
  const PV = {}; const bind = (k, type = 'text', extra = {}) => { const i = el('input', { class: 'in', type, value: pr[k], ...extra }); PV[k] = () => i.value; return i; };
  const sel = (k, opts) => { const i = el('select', { class: 'in' }, ...opts.map(([v, t]) => el('option', { value: v }, t))); i.value = pr[k]; PV[k] = () => i.value; return i; };
  const bool = (k, title, hint, invert) => { const c = el('input', { type: 'checkbox', checked: pr[k] === 'true' }); PV[k] = () => String(c.checked); return el('div', { class: 'toggle' }, el('span', { class: 'sw' }, c), el('div', { class: 't' }, el('b', {}, title), hint ? el('small', {}, hint) : null)); };
  const name = el('input', { class: 'in', value: s.name, maxlength: 40 }), mc = srvMcSelect(s.mc);
  let mode = s.mode || 'online', ram = s.ram, typ = s.type || 'fabric', color = s.color || '';
  const pres = presentationPanel(s, pr, PV, bind, bool, c => color = c);
  const typePick = typePicker(typ, v => { typ = v; fitVersions(mc, v, s.mc); });
  if (typ === 'hybrid') fitVersions(mc, typ, s.mc);
  const modes = el('div', { class: 'radio' }, ...[['online', 'globe', 'Online automático', 'Abre los puertos del router solo y, si no puede, usa un túnel. Lo recomendado.'], ['manual', 'globe', 'Puerto abierto a mano', 'Ya abriste el 25565 (TCP) en tu router. Tus amigos entran con tu IP y reciben los mods por ahí.'], ['tunnel', 'tunnel', 'Solo túnel', 'Sin tocar el router. Para fibras con CGNAT o redes de residencia.'], ['lan', 'wifi', 'Red local o VPN', 'Misma casa o una VPN tipo Radmin o Hamachi.']]
    .map(([m, i, t, d]) => el('button', { class: m === mode ? 'on' : '', onclick: e => { mode = m; $$('button', modes).forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, I(i, 18), el('div', {}, el('b', {}, t), el('span', {}, d)))));
  const auto = el('input', { type: 'checkbox', checked: !!s.autoRestart }), shareW = el('input', { type: 'checkbox', checked: s.shareWorld !== false });
  let online = pr['online-mode'] !== 'false'; PV['online-mode'] = () => String(online);
  const offWarn = el('div', { class: 'banner', style: 'margin-top:10px' }, I('alert', 18), el('div', { class: 't' }, 'En modo offline cualquiera puede entrar con el nombre de otro (incluido el tuyo de OP). Activa la lista blanca o úsalo solo con gente de confianza.'));
  offWarn.hidden = online;
  const accPick = el('div', {}, el('div', { class: 'radio' }, ...[[true, 'shield', 'Premium (online-mode=true)', 'Solo cuentas originales de Minecraft. Lo más seguro.'], [false, 'key', 'Modo offline (online-mode=false)', 'Entra cualquiera, también sin Minecraft original, con el nombre que quiera.']]
    .map(([v, i, t, d]) => el('button', { class: v === online ? 'on' : '', onclick: e => { online = v; offWarn.hidden = v; $$('button', e.currentTarget.parentElement).forEach(x => x.classList.toggle('on', x === e.currentTarget)); } }, I(i, 18), el('div', {}, el('b', {}, t), el('span', {}, d))))), offWarn);
  body.replaceChildren(el('div', { class: 'cols' },
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, 'General'),
        el('div', { class: 'f2' }, el('div', {}, el('label', { class: 'f' }, 'Nombre'), name), el('div', {}, el('label', { class: 'f' }, 'Versión'), mc)),
        el('div', { class: 'hint' }, 'Si el mundo ya existe, cambiar de versión puede romperlo: haz una copia antes.'),
        el('label', { class: 'f' }, 'Tipo de servidor'), typePick, el('div', { class: 'hint' }, 'El mundo se conserva al cambiar de tipo. Los mods no funcionan en Paper ni los plugins en Fabric; en «Mods + plugins» funcionan los dos.'),
        ramField(s.ram, r => { ram = r; }, 'Memoria del servidor'),
        el('div', { class: 'toggle', style: 'margin-top:12px' }, el('span', { class: 'sw' }, auto), el('div', { class: 't' }, el('b', {}, 'Reiniciar solo si se cae'), el('small', {}, 'Hasta 3 veces seguidas, y solo si ya había arrancado bien.'))),
        el('div', { class: 'toggle' }, el('span', { class: 'sw' }, shareW), el('div', { class: 't' }, el('b', {}, 'Dejar que tus amigos se bajen una copia del mapa'), el('small', {}, 'Desde su launcher, para jugarlo en individual. Tu mundo no cambia.')))),
      el('div', { class: 'panel' }, el('h3', {}, 'Cómo se conectan tus amigos'), modes),
      pres),
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, 'Partida'),
        el('div', { class: 'f2' }, el('div', {}, el('label', { class: 'f' }, 'Modo de juego'), sel('gamemode', [['survival', 'Supervivencia'], ['creative', 'Creativo'], ['adventure', 'Aventura'], ['spectator', 'Espectador']])),
          el('div', {}, el('label', { class: 'f' }, 'Dificultad'), sel('difficulty', [['peaceful', 'Pacífico'], ['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]))),
        el('div', { style: 'margin-top:12px' }, bool('pvp', 'Pelear entre jugadores (PvP)'), bool('hardcore', 'Hardcore', 'Al morir te quedas de espectador.'), bool('force-gamemode', 'Forzar el modo de juego al entrar'),
          bool('spawn-monsters', 'Aparecen monstruos'), bool('allow-flight', 'Permitir volar', 'Evita que el servidor eche a gente con mods de vuelo o jetpacks.'), bool('enable-command-block', 'Bloques de comandos'))),
      el('div', { class: 'panel' }, el('h3', {}, 'Mundo'),
        el('div', { class: 'f2' }, el('div', {}, el('label', { class: 'f' }, 'Distancia de visión'), bind('view-distance', 'number', { min: 3, max: 32 })), el('div', {}, el('label', { class: 'f' }, 'Distancia de simulación'), bind('simulation-distance', 'number', { min: 3, max: 32 })),
          el('div', {}, el('label', { class: 'f' }, 'Radio protegido del spawn'), bind('spawn-protection', 'number', { min: 0, max: 100 })), el('div', {}, el('label', { class: 'f' }, 'Semilla ', el('span', {}, '(solo mundos nuevos)')), bind('level-seed')))),
      el('div', { class: 'panel' }, el('h3', {}, 'Acceso'),
        el('label', { class: 'f' }, 'Cuentas que pueden entrar'), accPick,
        el('div', { class: 'sep', style: 'margin:14px 0 4px' }),
        bool('white-list', 'Lista blanca', 'Solo entran los que añadas en Gente.'), bool('enforce-whitelist', 'Echar al activar la lista blanca', 'Quien no esté en la lista sale al momento.'),
        el('label', { class: 'f' }, 'Nivel con el que se da OP'), sel('op-permission-level', [1, 2, 3, 4].map(n => [String(n), OPL[n]]))))),
    el('div', { class: 'savebar' },
      el('button', { class: 'btn big pri', onclick: e => act(e.currentTarget, async () => {
        await A.call('serverSet', s.id, { name: name.value, mc: mc.value, ram, mode, autoRestart: auto.checked, shareWorld: shareW.checked, type: typ, color, welcome: pres._welcome(), desc: pres._desc() });
        await A.call('setServerProps', s.id, Object.fromEntries(Object.entries(PV).map(([k, f]) => [k, f()])));
        await reload(); renderRailServers(); paintSrvHead(); toast(running ? 'Guardado. Reinicia el servidor para aplicarlo.' : 'Cambios guardados', 'ok');
      }) }, I('save', 18), 'Guardar cambios'),
      running ? el('small', {}, 'Se aplican al reiniciar.') : null, el('div', { class: 'sp' }),
      el('button', { class: 'btn dng sm', onclick: async () => {
        if (running) { toast('Apaga el servidor antes de quitarlo', 'warn'); return; }
        const c = await modal('¿Quitar este servidor?', el('p', { style: 'color:var(--mut)' }, `«${s.name}»: puedes quitarlo de la lista y conservar sus archivos, o borrarlo todo, mundo incluido.`), [{ t: 'Cancelar', v: null }, { t: 'Solo quitar', v: 'keep' }, { t: 'Borrar todo', v: 'all', cls: 'dng' }]);
        if (c) { try { await A.call('serverDel', s.id, c === 'all'); await reload(); selS = ST.servers[0] && ST.servers[0].id; store.set('selS', selS); TAB = 'resumen'; openHost(); } catch (e) { toast(clean(e), 'error'); } } } }, I('trash', 14), 'Quitar servidor')));
}

// ---------- eventos del proceso principal ----------
let lastHostState = 'off';
A.on('host', h => {
  const changed = h.state !== lastHostState || (h.share && !ST.host.share); lastHostState = h.state;
  if (ST.host.id !== h.id && h.id) SL = [];
  ST.host = h; renderRailServers(); paintPill();
  if (MODE === 'host' && PAGE === 'host') {
    paintSrvHead();
    const b = $('.tabbody');
    if (changed && ['resumen', 'consola', 'gente'].includes(TAB)) renderHost();
    else if (b && b._paint) b._paint();
  }
  if (MODE === 'play' && PAGE === 'home') renderHome();
});
A.on('srvlog', t => String(t).split(/\r?\n/).filter(Boolean).forEach(srvLine));
A.on('toast', t => toast(t.msg, t.type === 'warn' ? 'warn' : t.type, 7000));

// ---------- arranque ----------
async function boot() {
  document.body.prepend(BG.el); applyTheme(store.get('look') || {});
  $('#mark').innerHTML = LOGO; paintIcons();
  try {
    const [, sys] = await Promise.all([reload(), A.call('sysInfo').catch(() => SYS)]); SYS = sys || SYS; lastHostState = ST.host.state;
  } catch (e) {   // si el proceso principal falla al arrancar, se enseña un aviso con reintento en vez de una pantalla vacía
    reportError(e, 'arranque');
    $('#p-home').replaceChildren(el('div', { class: 'empty', style: 'margin-top:60px' }, el('div', { html: ic('alert', 44) }), el('b', {}, 'No se pudo cargar el launcher'), clean(e),
      el('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, el('button', { class: 'btn pri', onclick: () => boot() }, I('refresh', 16), 'Reintentar'))));
    return;
  }
  applyTheme(ST.look || {}); store.set('look', LOOK);
  paintAcct(); renderFriends(); renderRailServers(); applyHostZone(); setModeNow(MODE); pollFriends();
  if (!ST.onboarded) onboarding();
  document.body.classList.add('ready');
  A.call('autologin').then(p => { if (p) { ME = p; paintAcct(); if (MODE === 'play' && PAGE === 'home') renderHome(); } }).catch(() => {});
}
// cuando la ventana vuelve a primer plano (después de jugar, desde la bandeja…) se refresca el estado
let lastFocus = 0;
window.addEventListener('focus', () => {
  if (Date.now() - lastFocus < 3000 || !document.body.classList.contains('ready')) return; lastFocus = Date.now();
  reload().then(() => { renderFriends(); renderRailServers(); paintPill(); if (MODE === 'play' && PAGE === 'home') renderHome(); }).catch(() => {});
});
// =====================================================================
// 4.2 · MENÚS DE CLIC DERECHO
// =====================================================================
// ctx(nodo, fn): fn devuelve la lista de opciones al hacer clic derecho sobre ese nodo.
// Cada opción: { i: icono, t: texto, f: acción, dng?: rojo, dis?: desactivada, k?: atajo } · '-' = separador · { t, title: true } = título.
const ctx = (node, fn) => { node._ctx = fn; return node; };
const copyTxt = async t => { await A.call('copy', String(t)); toast('Copiado', 'ok', 1500); };
function openCtx(e, items) {
  e.preventDefault(); e.stopPropagation();
  $$('.ctx').forEach(x => x.remove());
  items = (items || []).filter(Boolean);
  if (!items.length) return;
  const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', close); };
  const off = ev => { if (!m.contains(ev.target)) close(); };
  const key = ev => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    const bs = $$('button:not(:disabled)', m), i = bs.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (bs[i + 1] || bs[0]).focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); }
  };
  const m = el('div', { class: 'ctx', role: 'menu' }, ...items.map(it => it === '-' ? el('hr') : it.title ? el('div', { class: 'ttl' }, it.t)
    : el('button', { class: it.dng ? 'dngi' : '', disabled: !!it.dis, role: 'menuitem', onclick: async () => { close(); try { await it.f(); } catch (x) { toast(clean(x), 'error', 6000); } } }, I(it.i || 'chevright', 15), el('span', {}, it.t), it.k ? el('kbd', {}, it.k) : null)));
  document.body.append(m);
  const r = m.getBoundingClientRect(), x = Math.min(e.clientX, innerWidth - r.width - 6), y = Math.min(e.clientY, innerHeight - r.height - 6);
  m.style.left = Math.max(6, x) + 'px'; m.style.top = Math.max(6, y) + 'px';
  setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', key, true); window.addEventListener('blur', close); });
}
document.addEventListener('contextmenu', e => {
  const t = e.target;
  // campos de texto: cortar, copiar, pegar
  if (t.closest('input:not([type=checkbox]):not([type=range]),textarea')) {
    const f = t.closest('input,textarea'), sel = f.value.slice(f.selectionStart, f.selectionEnd);
    return openCtx(e, [
      { i: 'x', t: 'Cortar', k: 'Ctrl+X', dis: !sel || f.readOnly, f: async () => { await A.call('copy', sel); f.setRangeText(''); f.dispatchEvent(new Event('input', { bubbles: true })); } },
      { i: 'copy', t: 'Copiar', k: 'Ctrl+C', dis: !sel, f: () => A.call('copy', sel) },
      { i: 'download', t: 'Pegar', k: 'Ctrl+V', dis: f.readOnly, f: () => { f.focus(); document.execCommand('paste'); } },
      '-', { i: 'check', t: 'Seleccionar todo', k: 'Ctrl+A', f: () => { f.focus(); f.select(); } }]);
  }
  for (let n = t; n && n !== document; n = n.parentNode) if (n._ctx) { const r = n._ctx(e); if (r && r.length) return openCtx(e, r); }
  const txt = String(getSelection() || '').trim();
  openCtx(e, [
    txt ? { i: 'copy', t: 'Copiar «' + (txt.length > 22 ? txt.slice(0, 22) + '…' : txt) + '»', f: () => copyTxt(txt) } : null, txt ? '-' : null,
    { i: 'home', t: 'Inicio', k: 'Ctrl+1', f: () => { setMode('play'); go('home'); } },
    { i: 'bag', t: 'Tienda', f: () => { setMode('play'); go('mods'); } },
    hostOn() ? { i: 'server', t: 'Servidores', k: 'Ctrl+2', f: () => setMode('host') } : null,
    { i: 'plus', t: 'Nuevo perfil', f: () => newProfileDialog() },
    { i: 'door', t: 'Unirme a un servidor', f: () => joinDialog() }, '-',
    { i: 'palette', t: 'Cambiar el aspecto', f: () => openSettings('apariencia') },
    { i: 'gear', t: 'Ajustes', k: 'Ctrl+,', f: () => openSettings() },
    { i: 'refresh', t: 'Recargar la vista', f: async () => { await reload(); if (MODE === 'host') openHost(); else go(PAGE === 'host' ? 'home' : PAGE); } }]);
});
function playerCtx(s, n, D, refresh) {
  const live = hostOf(s.id).state === 'ready', act2 = (a, x, msg) => A.call('permsAct', s.id, a, { name: n, ...x }).then(() => { if (msg) toast(msg, 'ok', 2500); if (refresh) setTimeout(refresh, 700); });
  const hasTp = D && D.tp ? D.tp.some(t => t.name.toLowerCase() === n.toLowerCase()) : null, isOp = D && D.ops ? D.ops.some(o => o.name.toLowerCase() === n.toLowerCase()) : null;
  const gm = (m, t) => ({ i: 'layers', t: 'Modo ' + t, dis: !live, f: () => act2('gamemode', { mode: m }, n + ' en modo ' + t.toLowerCase()) });
  return [{ t: n, title: true },
    hasTp ? { i: 'tp', t: 'Quitar permiso de TP', f: () => act2('tpRemove', {}, n + ' ya no puede usar !tp') } : { i: 'tp', t: 'Dar solo permiso de TP', f: () => act2('tpAdd', {}, n + ' ya puede usar !tp') },
    isOp ? { i: 'crown', t: 'Quitar OP', f: () => act2('deop', {}, n + ' ya no es OP') } : { i: 'crown', t: 'Hacer OP', f: () => act2('op', {}, n + ' ahora es OP') },
    '-', gm('survival', 'Supervivencia'), gm('creative', 'Creativo'), gm('spectator', 'Espectador'),
    { i: 'flag', t: 'Llevar al spawn', dis: !live, f: () => act2('tpSpawn', {}, n + ' llevado al spawn') },
    '-', { i: 'shield', t: 'Añadir a la lista blanca', f: () => act2('wlAdd', {}, n + ' está en la lista blanca') },
    { i: 'copy', t: 'Copiar nombre', f: () => copyTxt(n) },
    '-', { i: 'door', t: 'Echar', dis: !live, f: () => act2('kick', {}, n + ' echado') },
    { i: 'ban', t: 'Banear', dng: true, f: async () => { if (await confirmBox('¿Banear a ' + n + '?', 'No podrá entrar hasta que le quites el baneo.', 'Banear')) await act2('ban', {}, n + ' baneado'); } },
    { i: 'check', t: 'Quitar baneo', f: () => act2('pardon', {}, n + ' puede volver a entrar') }];
}
function serverCtx(s) {
  const h = hostOf(s.id), st = h.state, other = ST.host.id && ST.host.id !== s.id;
  const openTab = t => { selS = s.id; store.set('selS', selS); TAB = t; if (MODE !== 'host') setMode('host'); else openHost(); };
  return [{ t: s.name, title: true },
    st === 'off' ? { i: 'power', t: 'Iniciar', dis: !!other, f: () => startFlow(s) } : { i: 'stop', t: 'Apagar', f: () => A.call('hostStop') },
    st === 'ready' ? { i: 'restart', t: 'Reiniciar', f: () => A.call('hostRestart') } : null,
    h.share ? { i: 'copy', t: 'Copiar código para amigos', f: () => copyTxt(h.share) } : null, '-',
    { i: 'console', t: 'Consola', f: () => openTab('consola') }, { i: 'users', t: 'Gente y permisos', f: () => openTab('gente') },
    { i: 'clock', t: 'Automático y 24/7', f: () => openTab('auto') }, { i: 'gear', t: 'Ajustes del servidor', f: () => openTab('ajustes') }, '-',
    { i: 'folder', t: 'Abrir carpeta', f: () => A.call('serverOpen', s.id, 'server') },
    { i: 'download', t: 'Copia de seguridad ahora', f: async () => toast('Copia creada: ' + await A.call('backupCreate', s.id), 'ok') }];
}
function profileCtx(p) {
  return [{ t: p.name, title: true },
    p.id === ST.active ? null : { i: 'check', t: 'Usar este perfil', f: async () => { await A.call('setActive', p.id); await reload(); renderProfiles(); renderFriends(); toast('Ahora juegas con ' + p.name, 'ok', 2500); } },
    { i: 'play', t: 'Jugar con este perfil', f: async () => { await A.call('setActive', p.id); await reload(); setMode('play'); go('home'); launchFlow(); } },
    { i: 'edit', t: 'Editar imagen, nombre y descripción', f: () => editProfileDialog(p) },
    p.kind !== 'friend' ? { i: 'server', t: 'Convertir en servidor', f: () => profileToServerDialog(p) } : null,
    { i: 'plus', t: 'Nuevo perfil', f: newProfileDialog }, '-',
    { i: 'folder', t: 'Carpeta del juego', f: () => A.call('profileOpen', p.id, 'game') }, { i: 'cube', t: 'Carpeta de mods', f: () => A.call('profileOpen', p.id, 'mods') },
    { i: 'map', t: 'Mundos', f: () => A.call('profileOpen', p.id, 'saves') }, { i: 'sun', t: 'Shaders', f: () => A.call('kindOpen', target('profile', p.id), 'shader') }, '-',
    { i: 'bag', t: 'Abrir la tienda para este perfil', f: () => { storeT = target('profile', p.id); setMode('play'); go('mods'); } },
    ST.profiles.length > 1 ? '-' : null,
    ST.profiles.length > 1 ? { i: 'trash', t: 'Quitar este perfil', dng: true, f: async () => {
      const c = await modal('¿Quitar ' + p.name + '?', el('p', { style: 'color:var(--mut)' }, 'Puedes quitarlo de la lista y conservar sus archivos, o borrarlo todo (mods, mundos y capturas).'), [{ t: 'Cancelar', v: null }, { t: 'Solo quitar', v: 'keep' }, { t: 'Borrar todo', v: 'all', cls: 'dng' }]);
      if (c) { await A.call('profileDel', p.id, c === 'all'); await reload(); selP = ST.active; renderFriends(); if (PAGE === 'profiles') renderProfiles(); if (PAGE === 'home') renderHome(); } } } : null];
}
function friendCtx(f, locked) {
  return [{ t: f.name, title: true },
    { i: 'play', t: 'Entrar', dis: locked, f: async () => { await A.call('setActive', f.id); await reload(); renderFriends(); await launchFlow({ join: true }); } },
    { i: 'chest', t: 'Copia del mapa para jugar solo', f: () => friendWorld(f) },
    f.compass !== false ? { i: 'refresh', t: 'Sincronizar mods', f: async () => { const r = await A.call('resync', f.id); toast(`Sincronizado: ${plural(r.mods, 'mod', 'mods')}`, 'ok'); } } : null,
    { i: 'copy', t: 'Copiar la dirección', f: () => copyTxt(f.server || f.invite) },
    { i: 'gear', t: 'Ver perfil', f: () => { selP = f.id; go('profiles'); } }, '-',
    { i: 'trash', t: 'Quitar este servidor', dng: true, f: async () => {
      const c = await modal('¿Quitar ' + f.name + '?', el('p', { style: 'color:var(--mut)' }, 'Se quita de la lista. Puedes conservar sus archivos (mundos, capturas) o borrarlo todo.'), [{ t: 'Cancelar', v: null }, { t: 'Solo quitar', v: 'keep' }, { t: 'Borrar todo', v: 'all', cls: 'dng' }]);
      if (c) { await A.call('profileDel', f.id, c === 'all'); await reload(); renderFriends(); renderHome(); } } }];
}
function consoleCtx(e, L, s) {
  const line = e.target.closest('.console > div'), sel = String(getSelection() || '').trim();
  const name = line && (/<(\w{3,16})>/.exec(line.textContent) || /:\s(\w{3,16}) (?:joined|left) the game/.exec(line.textContent) || [])[1];
  return [sel ? { i: 'copy', t: 'Copiar selección', f: () => copyTxt(sel) } : null,
    line ? { i: 'copy', t: 'Copiar esta línea', f: () => copyTxt(line.textContent) } : null,
    { i: 'filetext', t: 'Copiar toda la consola', f: () => copyTxt([...L.children].map(x => x.textContent).join('\n')) },
    name ? '-' : null, ...(name ? playerCtx(s, name).slice(0, 4) : []), '-',
    { i: 'folder', t: 'Registros antiguos', f: () => A.call('serverOpen', s.id, 'logs') },
    { i: 'trash', t: 'Limpiar la pantalla', f: () => { SL = []; L.replaceChildren(); } }];
}

// =====================================================================
// 4.2 · AJUSTES FLOTANTES Y APARIENCIA
// =====================================================================
const setOpen = () => !$('#setOverlay').hidden;
function openSettings(sec) {
  if (sec) STAB = sec;
  $$('.ctx,.picker').forEach(x => x.remove());
  $('#setOverlay').hidden = false; $('#gear').classList.add('on'); paintIcons($('#setOverlay'));
  renderSettings();
}
function closeSettings() { $('#setOverlay').hidden = true; $('#gear').classList.remove('on'); }
let lookTimer = null;
function saveLook(patch, rerender) {
  applyTheme({ ...LOOK, ...patch }); store.set('look', LOOK);
  clearTimeout(lookTimer); lookTimer = setTimeout(() => A.call('setPref', 'look', LOOK).catch(() => {}), 250);
  if (rerender) rerender();
}
function themeCard(k, th, on, onPick) {
  const P = th[schemeNow()] || th.dark;
  return el('button', { class: 'tcard' + (on ? ' on' : ''), onclick: onPick, title: th.desc },
    el('div', { class: 'sw8' }, ...[P.ink, P.ink2, P.s1, P.s3, P.a, P.a2, P.b, P.tx].map(c => el('i', { style: 'background:' + c }))),
    el('div', { class: 'nm', style: `background:${P.s1};color:${P.tx}` }, el('b', {}, th.name), el('small', { style: 'color:' + P.mut }, th.desc)));
}
function lookSection(refresh) {
  const L = LOOK, seg = (opts, cur, fn) => { const w = el('div', { class: 'seg' }); opts.forEach(([v, t]) => w.append(el('button', { class: v === cur ? 'on' : '', onclick: () => fn(v) }, t))); return w; };
  const range = (k, label, min, max, unit = '', step = 1) => { const o = el('output', {}, L[k] + unit); return el('div', { class: 'rangeRow' }, el('b', {}, label), el('input', { type: 'range', min, max, step, value: L[k], oninput: e => { o.textContent = e.target.value + unit; saveLook({ [k]: +e.target.value }); } }), o); };
  const tog = (k, title, hint) => el('div', { class: 'toggle' }, sw(L[k], v => saveLook({ [k]: v })), el('div', { class: 't' }, el('b', {}, title), hint ? el('small', {}, hint) : null));
  const dots = (k) => el('div', { class: 'dots' }, el('button', { class: 'dot theme' + (L[k] === 'tema' ? ' on' : ''), title: 'El del tema', onclick: () => saveLook({ [k]: 'tema' }, refresh) }),
    ...Object.entries(ACCENTS).map(([v, [n, c]]) => el('button', { class: 'dot' + (L[k] === v ? ' on' : ''), title: n, style: 'background:' + c, onclick: () => saveLook({ [k]: v }, refresh) })));
  return [
    el('div', { class: 'panel' }, el('h3', {}, I('palette', 18), ' Tema'),
      el('div', { class: 'themes' }, ...Object.entries(THEMES).map(([k, th]) => themeCard(k, th, L.theme === k, () => saveLook({ theme: k }, refresh)))),
      el('label', { class: 'f' }, 'Claro u oscuro'), seg([['system', 'Como el sistema'], ['dark', 'Oscuro'], ['light', 'Claro']], L.scheme, v => saveLook({ scheme: v }, refresh)),
      el('p', { class: 'hint' }, 'Con «Como el sistema» cambia solo cuando Windows pasa a modo claro u oscuro.')),
    el('div', { class: 'panel' }, el('h3', {}, 'Colores'),
      el('label', { class: 'f' }, 'Color de Jugar'), dots('accent'),
      el('label', { class: 'f' }, 'Color de Servidores'), dots('accent2')),
    el('div', { class: 'panel' }, el('h3', {}, 'Fondo'),
      el('div', { class: 'bgpick' }, ...Object.entries(BGS).map(([k, t]) => el('button', { class: L.bg === k ? 'on' : '', onclick: () => saveLook({ bg: k }, refresh) }, t))),
      el('div', { style: 'margin-top:10px' }, range('pixel', 'Tamaño del píxel', 2, 8, ' px'), range('bgDim', 'Oscurecer el fondo', 0, 80, ' %'), tog('anim', 'Animaciones', 'Fondos en movimiento, transiciones y efectos. Apágalo si tu PC va justo.'))),
    el('div', { class: 'panel' }, el('h3', {}, 'Transición entre Jugar y Servidores'),
      el('div', { class: 'bgpick' }, ...Object.entries(TRANS).map(([k, t]) => el('button', { class: (L.trans || 'pixeles') === k ? 'on' : '', onclick: () => { saveLook({ trans: k }, refresh); if (k !== 'ninguna') setTimeout(() => modeTransition(getComputedStyle(document.documentElement).getPropertyValue(MODE === 'host' ? '--teal' : '--amber').trim() || '#ffb547', () => {}, MODE, true), 60); } }, t))),
      el('label', { class: 'f' }, 'Velocidad'), seg([['rapida', 'Rápida'], ['normal', 'Normal'], ['lenta', 'Lenta']], L.transSpeed || 'normal', v => saveLook({ transSpeed: v }, refresh)),
      el('div', { class: 'row', style: 'margin-top:10px' }, el('button', { class: 'btn sm', onclick: () => modeTransition(getComputedStyle(document.documentElement).getPropertyValue(MODE === 'host' ? '--teal' : '--amber').trim() || '#ffb547', () => {}, MODE, true) }, I('play', 14), 'Probar')),
      el('p', { class: 'hint' }, 'Al pulsar una se ve cómo queda. Con «Animaciones» apagado no hay transición.')),
    el('div', { class: 'panel' }, el('h3', {}, 'Transparencias'),
      range('glass', 'Transparencia', 0, 90, ' %'), range('blur', 'Desenfoque', 0, 24, ' px'),
      ST.glassOk ? tog('mica', 'Cristal de Windows 11', 'Deja ver tu escritorio a través de la ventana (efecto acrílico).') : el('p', { class: 'hint' }, 'El efecto cristal de Windows necesita Windows 11.')),
    el('div', { class: 'panel' }, el('h3', {}, 'Letra y forma'),
      el('label', { class: 'f' }, 'Tipografía'), seg(Object.entries(FONTS), L.font, v => saveLook({ font: v }, refresh)),
      el('div', { style: 'margin:12px 0 0;padding:12px;font:24px var(--pix);background:var(--glass3)' }, 'Compass Pixel: ¡Hola, Ñandú! ¿Qué tal? 0123'),
      el('label', { class: 'f' }, 'Esquinas'), seg([['tema', 'Las del tema'], ['pixel', 'Pixeladas'], ['round', 'Redondas']], L.corners, v => saveLook({ corners: v }, refresh)),
      el('label', { class: 'f' }, 'Sombra en los títulos'), seg([['tema', 'La del tema'], ['si', 'Sí'], ['no', 'No']], L.textShadow, v => saveLook({ textShadow: v }, refresh)),
      el('label', { class: 'f' }, 'Tamaño de la interfaz'), seg([[80, '80 %'], [90, '90 %'], [100, '100 %'], [110, '110 %'], [125, '125 %']], L.zoom, v => saveLook({ zoom: v }, refresh)),
      tog('grid', 'Cuadrícula de fondo', 'Una rejilla pixel muy suave detrás del contenido.')),
    el('div', { class: 'row' }, el('button', { class: 'btn sm ghost', onclick: () => saveLook({ ...LOOK0 }, refresh) }, I('refresh', 14), 'Volver al aspecto de serie'))];
}

// =====================================================================
// 4.2 · BIENVENIDA (primer arranque)
// =====================================================================
function onboarding() {
  let step = 0, host = hostOn();
  const box = el('div', { class: 'sheet panel' }), wrap = el('div', { id: 'onb' }, box);
  const steps = () => el('div', { class: 'steps' }, ...[0, 1, 2].map(i => el('i', { class: i <= step ? 'on' : '' })));
  const finish = async () => {
    await A.call('setPref', 'showHost', host); ST.showHost = host; await A.call('setPref', 'onboarded', true); ST.onboarded = true;
    applyHostZone(); paintPill(); wrap.remove(); toast(host ? 'Listo. Arriba tienes Jugar y Servidores.' : 'Listo. Si algún día quieres montar servidores, actívalo en Ajustes.', 'ok', 6000);
  };
  const paint = () => {
    if (step === 0) box.replaceChildren(steps(), el('h1', {}, '¡Bienvenido a Compass!'),
      el('p', { class: 'lead' }, 'Una pregunta rápida para dejarlo a tu gusto. ¿Vas a crear tus propios servidores, o solo a jugar?'),
      el('div', { class: 'choice' }, ...[[false, 'play', 'Solo voy a jugar', 'Tú solo o en servidores de amigos. El launcher queda más simple.'], [true, 'server', 'También crearé servidores', 'Aparece la zona Servidores: mods, plugins, mapas, 24/7…']]
        .map(([v, i, t, d]) => el('button', { class: host === v ? 'on' : '', onclick: () => { host = v; paint(); } }, I(i, 30), el('b', {}, t), el('span', {}, d)))),
      el('div', { class: 'acts' }, el('small', {}, 'Puedes cambiarlo cuando quieras en Ajustes.'), el('button', { class: 'btn pri big', onclick: () => { step = 1; paint(); } }, 'Siguiente', I('chevright', 18))));
    if (step === 1) box.replaceChildren(steps(), el('h1', {}, 'Elige tu estilo'),
      el('p', { class: 'lead' }, 'Toca un tema y lo verás al momento. Luego puedes cambiar colores, fondo y transparencias en Ajustes.'),
      el('div', { class: 'themes' }, ...Object.entries(THEMES).map(([k, th]) => themeCard(k, th, LOOK.theme === k, () => { saveLook({ theme: k }); paint(); }))),
      el('label', { class: 'f' }, 'Claro u oscuro'),
      el('div', { class: 'seg' }, ...[['system', 'Como el sistema'], ['dark', 'Oscuro'], ['light', 'Claro']].map(([v, t]) => el('button', { class: LOOK.scheme === v ? 'on' : '', onclick: () => { saveLook({ scheme: v }); paint(); } }, t))),
      el('div', { class: 'acts' }, el('button', { class: 'btn ghost', onclick: () => { step = 0; paint(); } }, I('chevleft', 16), 'Atrás'), el('button', { class: 'btn pri big', onclick: () => { step = 2; paint(); } }, 'Siguiente', I('chevright', 18))));
    if (step === 2) box.replaceChildren(steps(), el('h1', {}, '¡Todo listo!'),
      el('p', { class: 'lead' }, 'Algunos trucos:'),
      el('ul', { style: 'margin:0 0 0 18px;display:grid;gap:8px;color:var(--mut)' },
        el('li', {}, 'Haz clic derecho en casi cualquier cosa para ver sus opciones.'),
        el('li', {}, 'En la Tienda tienes mods, shaders, resource packs, modpacks y mapas.'),
        el('li', {}, 'Los mods descargan solos lo que necesitan.'),
        host ? el('li', {}, 'En cada servidor, la pestaña Automático tiene el modo 24/7 y tareas que se repiten solas.') : null),
      el('div', { class: 'acts' }, el('button', { class: 'btn ghost', onclick: () => { step = 1; paint(); } }, I('chevleft', 16), 'Atrás'), el('button', { class: 'btn pri big', onclick: finish }, I('check', 18), 'Empezar')));
  };
  paint(); document.body.append(wrap);
}

// =====================================================================
// 4.2 · TIENDA (mods, shaders, resource packs, modpacks, mapas)
// =====================================================================
const STORE_TABS = [['mod', 'Mods', 'cube', 'Mods de Fabric. Lo que necesiten se instala solo y nunca se duplica nada.'], ['shader', 'Shaders', 'sun', 'Luces y sombras bonitas. Se instala Iris solo si hace falta.'],
  ['resourcepack', 'Resource packs', 'layers', 'Texturas y sonidos. Actívalos dentro del juego en Opciones, Paquetes de recursos.'], ['modpack', 'Modpacks', 'chest', 'Packs completos: se crea un perfil nuevo con todo dentro.'], ['map', 'Mapas', 'map', 'Mundos para jugar en individual (de CurseForge).']];
function renderStore() {
  const R = $('#p-mods');
  const L = ST.profiles.map(p => ({ k: 'profile:' + p.id, t: target('profile', p.id), n: p.name, mc: p.mc }));
  if (!storeT || !L.some(x => x.k === storeT.kind + ':' + storeT.id)) storeT = target('profile', ST.active);
  const cur = () => L.find(x => x.k === storeT.kind + ':' + storeT.id) || L[0];
  const tab = STORE_TABS.find(x => x[0] === STORE_TAB) || STORE_TABS[0];
  const sel = el('select', { class: 'in', style: 'width:240px', title: 'Dónde se instala' }, ...L.map(x => el('option', { value: x.k }, 'Perfil: ' + x.n + ' (' + x.mc + ')')));
  sel.value = storeT.kind + ':' + storeT.id;
  const sub = el('p', {}, tab[3] + (STORE_TAB === 'modpack' ? '' : ` Para Minecraft ${cur().mc}.`));
  const tabs = el('div', { class: 'storetabs' }, ...STORE_TABS.map(([k, t, i]) => el('button', { class: k === STORE_TAB ? 'on' : '', onclick: () => { STORE_TAB = k; renderStore(); } }, I(i, 16), t)));
  let content;
  if (STORE_TAB === 'mod') { const st = makeStore(() => storeT, { head: [sel], ask: true }); sel.onchange = e => { const [k, id] = e.target.value.split(':'); storeT = target(k, id); renderStore(); }; content = st.node; }
  else if (STORE_TAB === 'map') { content = mapStore(sel); }
  else { const st = kindStore(STORE_TAB, () => storeT, { head: STORE_TAB === 'modpack' ? [] : [sel] }); sel.onchange = e => { const [k, id] = e.target.value.split(':'); storeT = target(k, id); renderStore(); }; content = st.node; }
  R.replaceChildren(el('div', { class: 'pagehead' }, el('div', {}, el('h1', {}, 'Tienda'), sub)), tabs, content);
}
function kindStore(kind, getT, opts = {}) {
  const S = { q: '', sort: 'relevance', offset: 0, total: 0, gen: 0 };
  const grid = el('div', { class: 'sgrid' }), more = el('button', { class: 'btn', hidden: true, onclick: e => act(e.currentTarget, () => load(false)) }, 'Cargar más');
  const ph = { shader: 'Buscar shaders: complementary, bsl, photon…', resourcepack: 'Buscar packs: faithful, fresh animations…', modpack: 'Buscar modpacks: fabulously optimized, create…', plugin: 'Buscar plugins: essentials, luckperms, worldedit…' }[kind];
  const q = el('input', { class: 'in', placeholder: ph, spellcheck: 'false' });
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { S.q = q.value.trim(); load(true); }, 350); };
  const sort = el('select', { class: 'in', style: 'width:170px', onchange: e => { S.sort = e.target.value; load(true); } }, el('option', { value: 'relevance' }, 'Más relevantes'), el('option', { value: 'downloads' }, 'Más descargados'), el('option', { value: 'updated' }, 'Actualizados'), el('option', { value: 'newest' }, 'Más nuevos'));
  const inst = el('div', { class: 'panel', hidden: true, style: 'margin-bottom:14px' });
  const verb = kind === 'modpack' ? 'Instalar como perfil' : kind === 'resourcepack' && getT().kind === 'server' ? 'Usar en el servidor' : 'Instalar';
  const page = { shader: 'shader', resourcepack: 'resourcepack', modpack: 'modpack', plugin: 'plugin' }[kind];
  function card(m) {
    const b = el('button', { class: 'btn sm' + (m.installed ? '' : ' pri'), disabled: !!m.installed }, I(m.installed ? 'check' : 'download', 14), m.installed ? 'Instalado' : verb);
    b.onclick = () => act(b, async () => {
      const r = await A.call('kindInstall', { t: getT(), kind, id: m.id });
      b.className = 'btn sm'; b.replaceChildren(I('check', 14), 'Instalado'); setTimeout(() => b.disabled = true);
      if (kind === 'modpack') { await reload(); renderFriends(); toast(`«${m.title}» instalado como perfil nuevo y activado. ¡A jugar!`, 'ok', 7000); }
      else if (r && r.serverPack) toast(`«${m.title}» puesto como pack del servidor: lo reciben todos al entrar`, 'ok', 6000);
      else toast(m.title + ' instalado' + (r && r.extra ? '. ' + r.extra : ''), 'ok', 5000);
      paintInst();
    });
    const gal = el('div', { class: 'gal', style: m.gallery ? `background-image:url("${String(m.gallery).replace(/"/g, '')}")` : '' }, m.gallery ? null : I(STORE_TABS.find(x => x[0] === kind)?.[2] || 'cube', 30));
    const ico = el('div', { class: 'ico40' }); if (m.icon) { const i = el('img', { src: m.icon, alt: '', loading: 'lazy' }); i.onerror = () => { i.remove(); ico.innerHTML = ic('cube', 18); }; ico.append(i); } else ico.innerHTML = ic('cube', 18);
    gal.append(ico);
    return ctx(el('div', { class: 'scard' }, gal, el('div', { class: 'bd' }, el('b', {}, m.title), el('small', {}, m.desc || '')),
      el('div', { class: 'ft' }, el('small', {}, (m.author ? m.author + ' · ' : '') + Number(m.downloads || 0).toLocaleString('es') + ' descargas'), b)),
      () => [{ t: m.title, title: true }, { i: 'download', t: m.installed ? 'Ya instalado' : verb, dis: m.installed, f: () => b.click() }, { i: 'external', t: 'Ver en Modrinth', f: () => window.open(`https://modrinth.com/${page}/${m.id}`) }, { i: 'copy', t: 'Copiar nombre', f: () => copyTxt(m.title) }]);
  }
  async function paintInst() {
    if (!['shader', 'resourcepack'].includes(kind) || getT().kind !== 'profile') return;
    const L = await A.call('kindList', getT(), kind).catch(() => []);
    inst.hidden = !L.length;
    inst.replaceChildren(el('h3', {}, 'Instalados en este perfil', el('span', { class: 'tag' }, String(L.length)), el('span', { class: 'sp' }), el('button', { class: 'btn sm ghost', onclick: () => A.call('kindOpen', getT(), kind) }, I('folder', 14), 'Abrir carpeta')),
      el('div', { class: 'list' }, ...L.map(x => ctx(el('div', { class: 'li' }, el('div', { class: 'ico40' }, x.icon ? el('img', { src: x.icon, alt: '' }) : el('span', { html: ic('layers', 18) })), el('div', { class: 't' }, el('b', {}, el('span', {}, x.title)), el('small', {}, x.file)),
        el('button', { class: 'btn ghost ico', title: 'Eliminar', html: ic('trash', 16), onclick: async () => { if (await confirmBox('¿Eliminar ' + x.title + '?', 'Se borra del perfil.', 'Eliminar')) { await A.call('kindDelete', getT(), kind, x.file); paintInst(); load(true); } } })),
        () => [{ t: x.title, title: true }, { i: 'folder', t: 'Abrir carpeta', f: () => A.call('kindOpen', getT(), kind) }, { i: 'trash', t: 'Eliminar', dng: true, f: async () => { await A.call('kindDelete', getT(), kind, x.file); paintInst(); load(true); } }]))),
      el('p', { class: 'hint' }, kind === 'shader' ? 'Elige el shader dentro del juego: Opciones, Vídeo, Shaders.' : 'Actívalos dentro del juego: Opciones, Paquetes de recursos.'));
  }
  async function load(reset) {
    const gen = ++S.gen; if (reset) { S.offset = 0; grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skel', style: 'height:230px' }))); }
    try {
      const r = await A.call('kindSearch', { t: getT(), kind, q: S.q, sort: S.sort, offset: S.offset }); if (gen !== S.gen) return;
      if (reset) grid.replaceChildren(); r.items.forEach(m => grid.append(card(m))); S.offset += r.items.length; S.total = r.total;
      if (reset && !r.items.length) grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('search', 40) }), el('b', {}, 'Sin resultados'), 'Prueba con otro nombre.'));
      more.hidden = !r.items.length || S.offset >= S.total;
    } catch (e) { if (gen === S.gen) { grid.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('alert', 40) }), el('b', {}, 'No se pudo cargar la tienda'), clean(e))); more.hidden = true; } }
  }
  const node = el('div', {}, inst, el('div', { class: 'tools' }, ...(opts.head || []), el('div', { class: 'search' }, I('search', 16), q), sort), grid, el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, more));
  load(true); paintInst();
  return { node, reload: () => load(true) };
}
function mapStore(sel) {
  const box = el('div', {});
  const S = { q: '', offset: 0, total: 0, gen: 0, ver: true };
  const grid = el('div', { class: 'mapgrid' }), more = el('button', { class: 'btn', hidden: true, onclick: e => act(e.currentTarget, () => load(false)) }, 'Cargar más');
  const q = el('input', { class: 'in', placeholder: 'Parkour, aventura, ciudad, skyblock…', spellcheck: 'false' });
  let tmr; q.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { S.q = q.value.trim(); load(true); }, 400); };
  sel.onchange = e => { const [k, id] = e.target.value.split(':'); storeT = target(k, id); load(true); };
  const verSw = el('label', { class: 'row nw', style: 'gap:8px;font-size:13px;white-space:nowrap' }, sw(true, v => { S.ver = v; load(true); }), 'Solo de mi versión');
  async function load(reset) {
    if (!ST.hasKey) {
      const k = el('input', { class: 'in', type: 'password', placeholder: 'Tu clave de API de CurseForge' });
      grid.replaceChildren(el('div', { class: 'panel', style: 'grid-column:1/-1' }, el('h3', {}, 'Los mapas vienen de CurseForge'),
        el('p', { class: 'hint', style: 'margin:0 0 12px' }, 'Necesitas una clave gratuita (console.curseforge.com). Se guarda solo en tu PC.'),
        el('div', { class: 'row nw' }, k, B('key', 'Guardar clave', async () => { await A.call('setKey', k.value); ST.hasKey = !!k.value.trim(); load(true); }, 'pri')))); return;
    }
    const mc = (P(storeT.id) || {}).mc, gen = ++S.gen; if (reset) { S.offset = 0; grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skel', style: 'height:250px' }))); }
    try {
      const r = await A.call('mapSearch', { q: S.q, offset: S.offset, mc: S.ver ? mc : null }); if (gen !== S.gen) return;
      if (reset) grid.replaceChildren();
      for (const m of r.items) {
        const th = el('div', { class: 'thumb' }); const src = m.shot || m.icon; if (src) th.append(el('img', { class: 'photo', src, alt: '', loading: 'lazy' })); else th.innerHTML = ic('map', 32);
        const toProf = B('play', 'Jugarlo', async () => { const n = await A.call('mapToProfile', m.id, storeT.id); toast(`«${m.title}» listo en ${P(storeT.id).name}: entra en Un jugador`, 'ok', 7000); return n; }, 'sm pri');
        grid.append(ctx(el('div', { class: 'mapcard' }, th, el('div', { class: 'body' }, el('b', {}, m.title), el('small', {}, m.desc || ''), el('small', { style: 'color:var(--dim)' }, [m.author, Number(m.downloads || 0).toLocaleString('es') + ' descargas', m.versions.join(', ')].filter(Boolean).join(' | '))),
          el('div', { class: 'acts' }, toProf, B('download', 'A mi biblioteca', async () => { await A.call('mapDownload', m.id); toast(`«${m.title}» guardado en tu biblioteca de mapas`, 'ok', 5000); }, 'sm'),
            m.url ? el('button', { class: 'btn sm ghost', onclick: () => window.open(m.url) }, I('external', 14), 'Web') : null)),
          () => [{ t: m.title, title: true }, { i: 'play', t: 'Jugarlo en el perfil elegido', f: () => toProf.click() }, m.url ? { i: 'external', t: 'Ver en la web', f: () => window.open(m.url) } : null]));
      }
      S.offset += r.items.length; S.total = r.total; more.hidden = !r.items.length || S.offset >= S.total;
      if (reset && !r.items.length) grid.append(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('search', 40) }), el('b', {}, 'Sin resultados'), S.ver ? 'Prueba a quitar el filtro de versión.' : 'Prueba con otras palabras.'));
    } catch (e) { if (gen === S.gen) grid.replaceChildren(el('div', { class: 'empty', style: 'grid-column:1/-1' }, el('div', { html: ic('alert', 40) }), el('b', {}, 'No se pudo buscar'), clean(e))); }
  }
  box.append(el('div', { class: 'tools' }, sel, el('div', { class: 'search' }, I('search', 16), q), verSw), grid, el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, more));
  load(true); return box;
}

// =====================================================================
// 4.2 · PLUGINS (servidores Paper)
// =====================================================================
let PLUGSUB = 'inst';
function tabPlugins(s, body) {
  const sub = el('div', { class: 'seg' }, ...[['inst', 'Instalados', 'zap'], ['store', 'Añadir de la tienda', 'bag']].map(([k, t, i]) => el('button', { class: PLUGSUB === k ? 'on' : '', onclick: () => { PLUGSUB = k; tabPlugins(s, body); } }, I(i, 14), t)));
  const running = ST.host.id === s.id && ST.host.state !== 'off';
  const head = el('div', { class: 'tools' }, sub, el('div', { class: 'sp' }), running ? el('small', {}, 'Los plugins nuevos se cargan al reiniciar.') : null);
  if (PLUGSUB === 'store') { body.replaceChildren(head, el('div', { class: 'panel' }, kindStore('plugin', () => target('server', s.id)).node)); return; }
  const list = el('div', { class: 'list' }), warn = el('div', { hidden: true, style: 'margin-bottom:12px' });
  const node = el('div', { class: 'panel modsbox' }, warn,
    el('div', { class: 'tools' }, el('button', { class: 'btn sm pri', onclick: () => { PLUGSUB = 'store'; tabPlugins(s, body); } }, I('bag', 14), 'Añadir de la tienda'),
      B('plus', 'Añadir .jar', async () => { const n = await A.call('pluginAdd', s.id); if (n) { toast(plural(n, 'plugin añadido', 'plugins añadidos'), 'ok'); load(); } }, 'sm'),
      B('refresh', 'Instalar lo que falte', async () => { const g = await A.call('pluginsFix', s.id); toast(g.length ? 'Instalado: ' + g.join(', ') : 'No falta nada (o no lo he encontrado)', g.length ? 'ok' : 'info'); load(); }, 'sm'),
      el('div', { class: 'sp' }), B('folder', 'Abrir carpeta', () => A.call('pluginsOpen', s.id), 'sm ghost')), list,
    el('p', { class: 'hint' }, 'Arrastra aquí archivos .jar de plugins. Lo que pidan en su «depend» se busca e instala solo.'));
  node.ondragover = e => { e.preventDefault(); node.classList.add('drop'); };
  node.ondragleave = e => { if (!node.contains(e.relatedTarget)) node.classList.remove('drop'); };
  node.ondrop = async e => { e.preventDefault(); node.classList.remove('drop'); const ps = [...e.dataTransfer.files].map(f => A.pathOf(f)).filter(p => /\.jar$/i.test(p)); if (ps.length) { const n = await A.call('pluginAdd', s.id, ps); toast(plural(n, 'plugin añadido', 'plugins añadidos'), 'ok'); load(); } };
  async function load() {
    list.replaceChildren(el('div', { class: 'skel' }), el('div', { class: 'skel' }));
    let L; try { L = await A.call('pluginsList', s.id); } catch (e) { list.replaceChildren(el('div', { class: 'empty' }, el('b', {}, 'No se pudieron leer los plugins'), clean(e))); return; }
    const miss = [...new Set(L.flatMap(p => p.missing))];
    warn.hidden = !miss.length;
    warn.replaceChildren(el('div', { class: 'banner' }, I('alert', 18), el('div', { class: 't' }, el('b', {}, 'Faltan dependencias: '), miss.join(', ')), B('download', 'Instalarlas', async () => { const g = await A.call('pluginsFix', s.id); toast(g.length ? 'Instalado: ' + g.join(', ') : 'No las he encontrado en Modrinth', g.length ? 'ok' : 'warn'); load(); }, 'sm pri')));
    if (!L.length) { list.replaceChildren(el('div', { class: 'empty' }, el('div', { html: ic('zap', 40) }), el('b', {}, 'Aún no hay plugins'), 'Añádelos de la tienda o arrastra archivos .jar.')); return; }
    list.replaceChildren(...L.map(p => ctx(el('div', { class: 'li' + (p.enabled ? '' : ' off') }, el('div', { class: 'ico40' }, p.icon ? el('img', { src: p.icon, alt: '' }) : el('span', { html: ic('zap', 18) })),
      el('div', { class: 't' }, el('b', {}, el('span', {}, p.name), p.version ? el('span', { class: 'tag' }, p.version) : null, p.missing.length ? el('span', { class: 'tag warn' }, 'falta ' + p.missing.join(', ')) : null), el('small', {}, p.desc || p.file)),
      el('label', { class: 'sw', title: p.enabled ? 'Desactivar' : 'Activar' }, el('input', { type: 'checkbox', checked: p.enabled, onchange: async () => { await A.call('pluginToggle', s.id, p.file); load(); } })),
      el('button', { class: 'btn ghost ico', title: 'Eliminar', html: ic('trash', 16), onclick: async () => { if (await confirmBox('¿Eliminar ' + p.name + '?', 'Se borra el .jar (su configuración queda en la carpeta del plugin).', 'Eliminar')) { await A.call('pluginDelete', s.id, p.file); load(); } } })),
      () => [{ t: p.name, title: true }, { i: p.enabled ? 'x' : 'check', t: p.enabled ? 'Desactivar' : 'Activar', f: async () => { await A.call('pluginToggle', s.id, p.file); load(); } },
        { i: 'folder', t: 'Abrir carpeta de plugins', f: () => A.call('pluginsOpen', s.id) }, { i: 'copy', t: 'Copiar nombre', f: () => copyTxt(p.name) }, '-',
        { i: 'trash', t: 'Eliminar', dng: true, f: async () => { await A.call('pluginDelete', s.id, p.file); load(); } }])));
  }
  body.replaceChildren(head, node); load();
}

// =====================================================================
// 4.2 · AUTOMÁTICO: 24/7, Nether/End y tareas programadas
// =====================================================================
function dimPanel(s) {
  const btn = (which, title, color) => {
    const locked = which === 'nether' ? !!s.blockNether : !!s.blockEnd;
    return el('button', { class: 'dimbtn' + (locked ? ' locked' : ''), onclick: e => act(e.currentTarget, async () => {
      await A.call('dimSet', s.id, which, !locked); await reload(); const ns = SV(s.id); Object.assign(s, ns);
      toast(`${title} ${!locked ? 'cerrado: quien esté dentro vuelve al spawn' : 'abierto'}`, 'ok', 3500); e.currentTarget.replaceWith(btn(which, title, color));
    }) }, el('span', { class: 'sq', style: `background:${color}`, html: ic(locked ? 'ban' : 'check', 20) }), el('div', {}, el('b', {}, title + (locked ? ': cerrado' : ': abierto')), el('small', {}, locked ? 'Pulsa para abrirlo' : 'Pulsa para cerrarlo al momento')));
  };
  return el('div', { class: 'panel' }, el('h3', {}, 'Nether y End'), el('div', { class: 'dimrow' }, btn('nether', 'Nether', '#7a1f1f'), btn('end', 'End', '#2b2650')),
    el('p', { class: 'hint' }, 'Se aplica al instante: si alguien entra, vuelve al spawn con un aviso. Al reiniciar, el Nether queda desactivado de verdad.'));
}
const TASKK = { save: ['Guardar el mundo', 'save', ''], message: ['Mensaje a todos', 'send', 'Texto del mensaje'], command: ['Comando', 'console', 'Comando sin la barra, por ejemplo: weather clear'], backup: ['Copia de seguridad', 'chest', ''], restart: ['Reiniciar el servidor', 'restart', ''] };
async function tabAuto(s, body) {
  const w = await A.call('get247', s.id).catch(() => ({}));
  const t247 = (k, title, hint) => el('div', { class: 'toggle' }, sw(w[k], async v => { Object.assign(w, await A.call('set247', s.id, { [k]: v })); toast(v ? 'Activado' : 'Desactivado', 'ok', 1500); }), el('div', { class: 't' }, el('b', {}, title), el('small', {}, hint)));
  let tasks = (s.tasks || []).map(x => ({ ...x }));
  const list = el('div', {});
  const saveTasks = async () => { tasks = await A.call('tasksSet', s.id, tasks); await reload(); Object.assign(s, SV(s.id)); };
  const paint = () => list.replaceChildren(...(tasks.length ? tasks.map((t, i) => {
    const kind = el('select', { class: 'in' }, ...Object.entries(TASKK).map(([k, [n]]) => el('option', { value: k }, n))); kind.value = t.kind;
    const when = el('select', { class: 'in' }, el('option', { value: 'every' }, 'Cada…'), el('option', { value: 'at' }, 'Cada día a las…')); when.value = t.at ? 'at' : 'every';
    const every = el('select', { class: 'in' }, ...[[5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [180, '3 horas'], [360, '6 horas'], [720, '12 horas'], [1440, '24 horas']].map(([v, n]) => el('option', { value: v }, n)));
    every.value = String(t.every || 30); if (!every.value) every.value = '30';
    const at = el('input', { class: 'in', type: 'time', value: t.at || '04:00' });
    const txt = el('input', { class: 'in', placeholder: TASKK[t.kind][2], value: t.text || '', hidden: !TASKK[t.kind][2] });
    const on = el('input', { type: 'checkbox', checked: t.on !== false });
    const upd = () => { t.kind = kind.value; t.at = when.value === 'at' ? at.value : null; t.every = when.value === 'every' ? +every.value : null; t.text = txt.value; t.on = on.checked; txt.hidden = !TASKK[t.kind][2]; txt.placeholder = TASKK[t.kind][2]; every.hidden = when.value !== 'every'; at.hidden = when.value !== 'at'; };
    [kind, when, every, at, txt, on].forEach(x => x.onchange = () => { upd(); saveTasks().catch(e => toast(clean(e), 'error')); });
    txt.oninput = () => { t.text = txt.value; }; txt.onblur = () => saveTasks().catch(() => {});
    every.hidden = !!t.at; at.hidden = !t.at;
    return ctx(el('div', { class: 'task' }, el('span', { class: 'sw', title: 'Activada' }, on), kind, el('div', { class: 'row nw' }, txt.hidden ? el('small', { style: 'flex:1' }, TASKK[t.kind][0]) : txt), el('div', { class: 'row nw' }, when, every, at),
      el('button', { class: 'btn sm ghost', title: 'Probar ahora', onclick: e => act(e.currentTarget, async () => { await A.call('taskRunNow', s.id, t.id); toast('Hecho', 'ok', 1500); }) }, I('play', 14)),
      el('button', { class: 'btn ghost ico', title: 'Quitar', html: ic('trash', 16), onclick: async () => { tasks.splice(i, 1); await saveTasks(); paint(); } })),
      () => [{ t: TASKK[t.kind][0], title: true }, { i: 'play', t: 'Ejecutar ahora', f: () => A.call('taskRunNow', s.id, t.id) }, { i: on.checked ? 'x' : 'check', t: on.checked ? 'Pausar' : 'Activar', f: async () => { t.on = !on.checked; await saveTasks(); paint(); } }, '-', { i: 'trash', t: 'Quitar', dng: true, f: async () => { tasks.splice(i, 1); await saveTasks(); paint(); } }]);
  }) : [el('p', { class: 'hint', style: 'margin:0' }, 'Sin tareas todavía. Añade una o usa una de las rápidas.')]));
  paint();
  const add = (tk) => async () => { tasks.push({ id: Math.random().toString(36).slice(2, 10), on: true, ...tk }); await saveTasks(); paint(); };
  body.replaceChildren(el('div', { class: 'cols' },
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, I('power', 18), ' Servidor 24/7'),
        el('p', { class: 'hint', style: 'margin:-4px 0 8px' }, 'Para que esté siempre encendido el PC tiene que seguir encendido. Esto lo pone fácil:'),
        t247('keep247', 'No dejar que el PC se duerma', 'Mientras el servidor esté encendido, Windows no suspende el PC (la pantalla sí puede apagarse).'),
        t247('autostart', 'Arrancar este servidor al abrir Compass', 'En cuanto se abre el launcher, el servidor se enciende solo.'),
        t247('atLogin', 'Abrir Compass al encender el PC', 'Se abre en segundo plano (icono junto al reloj). Junto con lo anterior, el servidor vuelve solo tras un reinicio de Windows.'),
        el('p', { class: 'hint' }, 'Consejo: activa también «Reiniciar solo si se cae» en Ajustes del servidor.')),
      dimPanel(s)),
    el('div', { class: 'stack' },
      el('div', { class: 'panel' }, el('h3', {}, I('clock', 18), ' Tareas programadas', el('span', { class: 'sp' }), el('button', { class: 'btn sm pri', onclick: add({ kind: 'message', every: 30, text: '¡Recordad guardar vuestras cosas en cofres!' }) }, I('plus', 14), 'Añadir')),
        el('p', { class: 'hint', style: 'margin:-4px 0 8px' }, 'Se ejecutan solas mientras el servidor está encendido.'),
        list,
        el('div', { class: 'sep' }), el('small', {}, 'Rápidas:'),
        el('div', { class: 'row', style: 'margin-top:8px' },
          el('button', { class: 'btn sm', onclick: add({ kind: 'save', every: 10 }) }, I('save', 14), 'Guardar cada 10 min'),
          el('button', { class: 'btn sm', onclick: add({ kind: 'backup', every: 360 }) }, I('chest', 14), 'Copia cada 6 h'),
          el('button', { class: 'btn sm', onclick: add({ kind: 'restart', at: '05:00' }) }, I('restart', 14), 'Reiniciar a las 5:00'),
          el('button', { class: 'btn sm', onclick: add({ kind: 'message', every: 60, text: 'Únete a nuestro Discord' }) }, I('send', 14), 'Mensaje cada hora'),
          el('button', { class: 'btn sm', onclick: add({ kind: 'command', every: 60, text: 'weather clear' }) }, I('cloud', 14), 'Quitar lluvia cada hora'))))));
}

// =====================================================================
// 4.2 · MUNDO NUEVO CON VISTA PREVIA Y SEMILLA
// =====================================================================
async function worldWizard(s) {
  const running = ST.host.id === s.id && ST.host.state !== 'off';
  const n = el('input', { class: 'in', placeholder: 'mundo-nuevo', maxlength: 40 }), seed = el('input', { class: 'in', placeholder: 'Vacío = al azar', spellcheck: 'false' });
  let type = 'minecraft:normal', prev = null;
  const types = el('div', { class: 'radio' }, ...[['minecraft:normal', 'Normal', 'El de siempre.'], ['minecraft:large_biomes', 'Biomas grandes', 'Biomas 4 veces más grandes.'], ['minecraft:amplified', 'Amplificado', 'Montañas enormes.'], ['minecraft:flat', 'Plano', 'Para construir.']]
    .map(([v, t, d]) => el('button', { class: v === type ? 'on' : '', onclick: e => { type = v; $$('button', types).forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, I('layers', 18), el('div', {}, el('b', {}, t), el('span', {}, d)))));
  const view = el('div', { class: 'prevmap' }, el('div', { class: 'mapmsg' }, el('div', {}, el('b', {}, 'Vista previa'), running ? 'Apaga el servidor para poder generar una vista previa.' : 'Escribe una semilla (o déjala al azar) y pulsa «Ver cómo queda». Se genera la zona del spawn en un minuto o dos.')));
  const info = el('p', { class: 'hint' });
  const dice = el('button', { class: 'btn', title: 'Semilla al azar', onclick: async () => { seed.value = await A.call('seedRandom'); } }, I('refresh', 16));
  const go2 = el('button', { class: 'btn pri', disabled: running, onclick: e => act(e.currentTarget, async () => {
    if (prev) { A.call('previewDrop', s.id, prev.folder); prev = null; }
    view.replaceChildren(el('div', { class: 'mapmsg' }, el('div', {}, el('span', { class: 'spin', style: 'width:28px;height:28px;margin-bottom:10px' }), el('b', {}, 'Generando el mundo…'), 'Arranca un servidor de prueba sin red y lo apaga al terminar.')));
    try { prev = await A.call('seedPreview', s.id, seed.value, type); }
    catch (x) { view.replaceChildren(el('div', { class: 'mapmsg' }, el('div', {}, el('b', {}, 'No se pudo generar'), clean(x)))); return; }
    if (!seed.value.trim()) seed.value = prev.seed;
    const m = makeMap({ kind: 'server', id: s.id, world: prev.folder }); view.replaceChildren(m.node);
    info.textContent = `Semilla ${prev.seed}` + (prev.spawn ? `. Spawn en X ${prev.spawn.x}, Z ${prev.spawn.z}.` : '.') + ' Arrastra para moverte. Si te gusta, pulsa «Usar este mundo».';
  }) }, I('eye', 16), 'Ver cómo queda');
  const body = el('div', {}, el('div', { class: 'f2' }, el('div', {}, el('label', { class: 'f' }, 'Nombre'), n), el('div', {}, el('label', { class: 'f' }, 'Semilla'), el('div', { class: 'seedbox' }, seed, dice, go2))),
    el('label', { class: 'f' }, 'Tipo de mundo'), types, el('label', { class: 'f' }, 'Así será el spawn'), view, info,
    el('div', { class: 'hint' }, 'El mundo actual no se borra: queda en la lista y puedes volver a él.'));
  const r = await modal('Mundo nuevo', body, [{ t: 'Cancelar', v: null }, { t: 'Crear sin vista previa', v: 'plain' }, { t: 'Usar este mundo', v: 'prev', cls: 'pri' }], true);
  try {
    if (r === 'prev' && prev) { const f = await A.call('previewKeep', s.id, prev.folder, n.value || 'mundo-nuevo'); toast(`Listo: «${f}» es el mundo del servidor, con el mismo spawn que has visto`, 'ok', 6000); renderHost(); return; }
    if (prev) A.call('previewDrop', s.id, prev.folder);
    if (r === 'plain' || (r === 'prev' && !prev)) { await A.call('worldNew', s.id, { name: n.value || 'mundo-nuevo', seed: seed.value, type }); toast('Listo: el mundo se genera al encender el servidor', 'ok', 6000); renderHost(); }
  } catch (e) { toast(clean(e), 'error'); }
}

// =====================================================================
// 4.2 · PERSONALIZAR EL SERVIDOR: icono, mensaje con colores, bienvenida, color
// =====================================================================
const ICONS_SV = new Map();
async function srvIcon(s) { if (!s.icon) return null; if (!ICONS_SV.has(s.id)) ICONS_SV.set(s.id, A.call('serverIconGet', s.id).catch(() => null)); return ICONS_SV.get(s.id); }
function srvGlyph(s, extra) {
  const g = el('span', { class: 'glyph', style: s.color ? `background:${s.color};color:#fff` : '', html: ic(s.type === 'paper' ? 'zap' : s.type === 'hybrid' ? 'layers' : 'server', 15) }, extra);
  srvIcon(s).then(u => { if (u) { g.classList.add('custom'); g.innerHTML = ''; g.append(el('img', { src: u, alt: '' })); if (extra) g.append(extra); } });
  return g;
}
function srvIconEl(s) {
  const d = el('div', { class: 'ico40', style: `width:64px;height:64px;image-rendering:pixelated;${s.color ? 'background:' + s.color + ';color:#fff' : ''}`, html: ic(s.type === 'paper' ? 'zap' : s.type === 'hybrid' ? 'layers' : 'server', 28) });
  srvIcon(s).then(u => { if (u) { d.innerHTML = ''; d.append(el('img', { src: u, alt: '', style: 'image-rendering:pixelated' })); } });
  return d;
}
function to64(dataUrl) {   // recorta al centro y escala a 64×64 (lo que pide Minecraft para server-icon.png)
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), m = Math.min(img.width, img.height);
      g.imageSmoothingEnabled = img.width > 128; g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 64, 64); res(c.toDataURL('image/png'));
    }; img.onerror = () => rej(new Error('No se pudo leer la imagen')); img.src = dataUrl;
  });
}
function motdHTML(t) {   // códigos § de Minecraft → spans de colores (escapando el texto)
  const esc = x => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let out = '', cls = [];
  for (const part of String(t || '').replace(/\\n/g, '\n').split(/(§[0-9a-fk-or])/i)) {
    const m = /^§([0-9a-fk-or])$/i.exec(part);
    if (m) { const k = m[1].toLowerCase(); if (k === 'r') cls = []; else if (/[0-9a-f]/.test(k)) cls = ['mc' + k]; else cls.push('mc' + k); continue; }
    if (part) out += `<span class="${cls.join(' ')}">${esc(part)}</span>`;
  }
  return out;
}
function presentationPanel(s, pr, PV, bind, bool, setColor) {
  const motd = bind('motd', 'text', { maxlength: 90, spellcheck: 'false' });
  const prevMotd = el('div', { class: 'motd' }), prevIcon = el('span', { class: 'ph' }), prevName = el('b', {}, s.name);
  const big = el('div', { class: 'big64', html: ic('image', 26) });
  const paintIcon = u => { big.replaceChildren(); if (u) { big.append(el('img', { src: u, alt: '' })); prevIcon.style.background = `url("${u}") center/cover`; } else { big.innerHTML = ic('image', 26); prevIcon.style.background = ''; } };
  srvIcon({ ...s, icon: true }).then(u => { ICONS_SV.delete(s.id); paintIcon(u); });
  const paintMotd = () => { prevMotd.innerHTML = motdHTML(motd.value); };
  motd.oninput = paintMotd; paintMotd();
  const codes = [['0', '#000'], ['1', '#00a'], ['2', '#0a0'], ['3', '#0aa'], ['4', '#a00'], ['5', '#a0a'], ['6', '#fa0'], ['7', '#aaa'], ['8', '#555'], ['9', '#55f'], ['a', '#5f5'], ['b', '#5ff'], ['c', '#f55'], ['d', '#f5f'], ['e', '#ff5'], ['f', '#fff']];
  const ins = code => { const a = motd.selectionStart ?? motd.value.length; motd.setRangeText('§' + code, a, a, 'end'); motd.focus(); paintMotd(); };
  const bar = el('div', { class: 'colorbar' }, ...codes.map(([c, col]) => el('button', { title: '§' + c, style: 'background:' + col, onclick: () => ins(c) })),
    el('button', { title: 'Negrita', onclick: () => ins('l') }, 'B'), el('button', { title: 'Cursiva', onclick: () => ins('o') }, 'I'), el('button', { title: 'Subrayado', onclick: () => ins('n') }, 'U'), el('button', { title: 'Quitar formato', onclick: () => ins('r') }, 'R'),
    el('button', { title: 'Segunda línea', style: 'width:auto;padding:0 6px', onclick: () => { const a = motd.selectionStart ?? motd.value.length; motd.setRangeText('\\n', a, a, 'end'); paintMotd(); } }, '↵'));
  const wel = el('input', { class: 'in', value: s.welcome || '', maxlength: 200, placeholder: '¡Bienvenido, {jugador}! Lee las normas con /rules' });
  const desc = el('textarea', { class: 'in', rows: 2, maxlength: 300, placeholder: 'Para tus amigos: de qué va el servidor, normas…' }, s.desc || '');
  const cols = ['', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#d35480', '#5d6d7e'];
  let color = s.color || '';
  const dots = el('div', { class: 'dots' }, ...cols.map(c => el('button', { class: 'dot' + (c === color ? ' on' : ''), title: c ? c : 'Sin color', style: c ? 'background:' + c : 'background:var(--s3)', onclick: e => { color = c; setColor(c); $$('.dot', dots).forEach(d => d.classList.toggle('on', d === e.currentTarget)); } }, c ? '' : '×')));
  const rp = bind('resource-pack', 'text', { placeholder: 'https://… .zip (vacío = sin pack)', spellcheck: 'false' });
  const node = el('div', { class: 'panel' }, el('h3', {}, 'Presentación'),
    el('div', { class: 'iconpick' }, big, el('div', { style: 'flex:1' }, el('b', {}, 'Icono del servidor'), el('small', { style: 'display:block;margin:2px 0 8px' }, 'Lo ven tus amigos en la lista de servidores de Minecraft y en sus tarjetas de Compass. Se recorta a 64×64.'),
      el('div', { class: 'row' }, B('image', 'Elegir imagen', async () => { const d = await A.call('pickImage'); if (!d) return; const u = await to64(d); await A.call('serverIconSet', s.id, u); ICONS_SV.delete(s.id); await reload(); paintIcon(u); renderRailServers(); paintSrvHead(); toast('Icono guardado' + (ST.host.id === s.id ? '. Se ve al reiniciar el servidor.' : ''), 'ok'); }, 'sm pri'),
        B('trash', 'Quitar', async () => { await A.call('serverIconSet', s.id, null); ICONS_SV.delete(s.id); await reload(); paintIcon(null); renderRailServers(); }, 'sm ghost')))),
    el('label', { class: 'f' }, 'Mensaje en la lista de servidores ', el('span', {}, '(admite colores)')), motd, bar,
    el('label', { class: 'f' }, 'Así lo verán'), el('div', { class: 'srvpreview' }, prevIcon, el('div', { style: 'min-width:0' }, prevName, prevMotd)),
    el('label', { class: 'f' }, 'Jugadores a la vez'), bind('max-players', 'number', { min: 1, max: 500 }),
    el('label', { class: 'f' }, 'Mensaje de bienvenida ', el('span', {}, '(se le manda a cada uno al entrar)')), wel,
    el('label', { class: 'f' }, 'Descripción para tus amigos'), desc,
    el('label', { class: 'f' }, 'Color del servidor en Compass'), dots,
    el('div', { class: 'sep' }),
    el('label', { class: 'f' }, 'Pack de recursos del servidor ', el('span', {}, '(se descarga al entrar)')), rp,
    el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn sm', onclick: () => {
      const box = el('div', { style: 'max-height:60vh;overflow:auto' }, kindStore('resourcepack', () => target('server', s.id)).node);
      modal('Elegir pack de recursos para el servidor', box, [{ t: 'Cerrar', v: null }], true).then(() => renderHost());
    } }, I('bag', 14), 'Buscar en la tienda')),
    bool('require-resource-pack', 'Obligatorio', 'Quien lo rechace no puede entrar.'),
    bool('hide-online-players', 'Ocultar quién está conectado', 'En la lista de servidores no se ven los nombres.'));
  node._welcome = () => wel.value; node._desc = () => desc.value;
  return node;
}

boot();


// =====================================================================
// ACTUALIZACIONES: zona en Ajustes y aviso con los colores del tema
// =====================================================================
let UPD = { state: 'idle', current: '', version: null, notes: '', pct: 0, auto: true };
const UPD_TXT = {
  dev: ['Versión de pruebas', 'Las actualizaciones solo funcionan en la app instalada (.exe).'],
  idle: ['Aún no he mirado', 'Pulsa «Buscar actualizaciones».'],
  checking: ['Buscando…', 'Mirando si hay una versión nueva en GitHub.'],
  latest: ['Estás al día', 'Tienes la última versión de Compass.'],
  available: ['Hay una versión nueva', ''],
  downloading: ['Descargando la actualización', ''],
  downloaded: ['Lista para instalar', 'Se instala al cerrar Compass, o ahora mismo con el botón.'],
  error: ['No he podido mirarlo', ''],
};
function updSection() {
  const u = UPD, t = UPD_TXT[u.state] || UPD_TXT.idle;
  const sub = u.state === 'available' ? `Compass ${u.version} está disponible.${u.portable ? ' Como usas la versión portable, se descarga el .exe nuevo y lo usas en lugar del viejo.' : u.auto ? '' : ' Pulsa Descargar.'}`
    : u.state === 'downloading' ? `Compass ${u.version || ''} · ${u.pct || 0} %` : u.state === 'error' ? u.error : t[1];
  const busy = u.state === 'checking' || u.state === 'downloading';
  const main = u.state === 'downloaded' ? el('button', { class: 'btn pri', onclick: e => act(e.currentTarget, async () => { toast('Reiniciando para actualizar…', 'info', 4000); await A.call('updInstall'); }) }, I('restart', 15), 'Reiniciar y actualizar')
    : u.state === 'available' ? el('button', { class: 'btn pri', onclick: e => act(e.currentTarget, () => A.call('updDownload')) }, I('download', 15), u.portable ? 'Descargar el .exe nuevo' : 'Descargar')
    : el('button', { class: 'btn pri', disabled: busy || u.state === 'dev', onclick: e => act(e.currentTarget, async () => { UPD = await A.call('updCheck'); paintUpd(true); }) }, I('refresh', 15), 'Buscar actualizaciones');
  return [
    el('div', { class: 'panel updhero' + (u.state === 'available' || u.state === 'downloaded' ? ' new' : '') },
      el('span', { class: 'updmark', html: typeof LOGO !== 'undefined' ? LOGO : '' }),
      el('div', { class: 'updinfo' },
        el('small', {}, 'Tienes la versión'),
        el('b', { class: 'updver' }, 'Compass Launcher ' + (u.current || SYS.app || '')),
        el('div', { class: 'updst ' + u.state }, el('span', { class: 'dot' }), el('b', { id: 'updTitle' }, t[0]), el('span', { id: 'updSub' }, sub)),
        u.state === 'downloading' ? el('div', { class: 'updbar' }, el('i', { id: 'updBar', style: `width:${u.pct || 0}%` })) : null,
        el('div', { class: 'row', style: 'margin-top:14px' }, main,
          el('button', { class: 'btn ghost', onclick: () => A.call('updPage') }, I('external', 15), 'Ver todas las versiones')))),
    u.notes && (u.state === 'available' || u.state === 'downloading' || u.state === 'downloaded') ? el('div', { class: 'panel' }, el('h3', {}, 'Novedades de la ' + u.version), el('div', { class: 'updnotes' }, u.notes)) : null,
    el('div', { class: 'panel' }, el('h3', {}, 'Cómo se actualiza'),
      u.portable ? el('p', { class: 'hint' }, 'Usas la versión portable: Compass te avisa cuando hay una nueva y te abre la descarga. Tus perfiles y servidores se conservan.')
        : el('div', { class: 'toggle' }, sw(u.auto !== false, async v => { await A.call('updAuto', v); UPD.auto = v; toast(v ? 'Las actualizaciones se descargarán solas' : 'Te preguntaré antes de descargar', 'ok', 2200); }),
          el('div', { class: 't' }, el('b', {}, 'Descargar las actualizaciones solas'), el('small', {}, 'Se bajan en segundo plano y se instalan al cerrar Compass. Tus perfiles, servidores y sesión no se tocan.'))),
      el('p', { class: 'hint', style: 'margin-top:10px' }, 'Compass mira si hay versión nueva al abrirse y cada 4 horas. Cuando la haya, te sale un aviso.')),
  ].filter(Boolean);
}
let lastUpdState = null;
function paintUpd(full) {
  const u = UPD;
  if (setOpen() && STAB === 'actualizar') {
    if (!full && lastUpdState === u.state && u.state === 'downloading') {   // solo cambia el porcentaje: se toca la barra sin redibujar
      const b = $('#updBar'), sb = $('#updSub'); if (b) b.style.width = (u.pct || 0) + '%'; if (sb) sb.textContent = `Compass ${u.version || ''} · ${u.pct || 0} %`;
    } else refreshSettings();
  }
  lastUpdState = u.state;
  if (u.state === 'available' || u.state === 'downloaded') updCard(u);
}
// el aviso: tarjeta con los colores del tema (acento, cristal y esquinas del tema elegido)
function updCard(u) {
  const key = u.state + '@' + u.version;
  if (store.get('updSeen') === key || $('.toast.upd[data-k="' + key + '"]')) return;
  $$('.toast.upd').forEach(x => x.remove());
  const close = () => { store.set('updSeen', key); t.classList.add('out'); setTimeout(() => t.remove(), 250); };
  const ready = u.state === 'downloaded';
  const t = el('div', { class: 'toast upd', role: 'status', 'data-k': key },
    el('span', { class: 'updglow' }),
    el('span', { class: 'updic' }, I(ready ? 'sparkle' : 'download', 20)),
    el('div', { class: 'updtx' },
      el('b', {}, ready ? `Compass ${u.version} está listo` : `¡Nueva versión ${u.version}!`),
      el('small', {}, ready ? 'Se instala al cerrar Compass. Tus perfiles y servidores se quedan igual.' : u.portable ? 'Descarga el .exe nuevo y úsalo en lugar del viejo.' : u.auto ? 'Se está descargando sola…' : 'Hay una actualización disponible.'),
      el('div', { class: 'row', style: 'margin-top:10px;gap:8px' },
        ready ? el('button', { class: 'btn pri sm', onclick: e => { e.stopPropagation(); A.call('updInstall').catch(er => toast(clean(er), 'error')); } }, I('restart', 14), 'Reiniciar ahora')
          : el('button', { class: 'btn pri sm', onclick: e => { e.stopPropagation(); close(); openSettings('actualizar'); } }, I('info', 14), 'Ver novedades'),
        el('button', { class: 'btn ghost sm', onclick: e => { e.stopPropagation(); close(); } }, 'Luego'))));
  $('#toasts').append(t);
}
A.on('upd', u => { const changed = !UPD || UPD.state !== u.state; UPD = u; paintUpd(changed); });
A.on('openUpdates', () => openSettings('actualizar'));
A.call('updState').then(u => { if (u) { UPD = u; paintUpd(true); } }).catch(() => {});


// =====================================================================
// APP DEL MÓVIL: descarga con QR, emparejar y encender el PC desde el móvil
// =====================================================================
let MOB = null;
function mobSection() {
  const wrap = el('div', { class: 'mobwrap' }, el('div', { class: 'panel' }, el('p', { class: 'hint' }, 'Cargando…')));
  A.call('remoteInfo').then(i => { MOB = i; paintMob(wrap); }).catch(e => wrap.replaceChildren(el('div', { class: 'panel' }, el('p', {}, clean(e)))));
  return [wrap];
}
const ago = t => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
function mobStep(n, title, sub, ...body) {
  return el('div', { class: 'panel mobstep' }, el('div', { class: 'mobnum' }, String(n)), el('div', { class: 'mobbody' }, el('h3', {}, title), sub ? el('p', { class: 'mobsub' }, sub) : null, ...body));
}
function paintMob(wrap) {
  const i = MOB, on = !!i.on;
  const qrBox = (svg, cap) => el('div', { class: 'mobqr' }, el('div', { class: 'qrimg', html: svg }), cap ? el('small', {}, cap) : null);
  const apkQr = el('div', { class: 'mobqr' }, el('div', { class: 'qrimg' }, el('small', {}, '…')), el('small', {}, 'Escanéalo con la cámara del móvil'));
  A.call('apkQr').then(svg => { $('.qrimg', apkQr).innerHTML = svg; }).catch(() => {});
  const pairBox = el('div', { class: 'mobqr big' }, el('div', { class: 'qrimg' }, el('small', {}, on ? '…' : '')), el('small', {}, 'Escanéalo desde la app Compass'));
  if (on) A.call('remotePairing').then(p => { $('.qrimg', pairBox).innerHTML = p.svg; pairBox.dataset.code = p.code; }).catch(() => {});
  const prep = i.prepared, upnp = i.upnp;
  const chip = (ok, txt) => el('span', { class: 'mobchip ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') }, I(ok === true ? 'check' : ok === false ? 'alert' : 'info', 13), txt);

  wrap.replaceChildren(
    // portada
    el('div', { class: 'panel mobhero' },
      el('div', { class: 'mobphone' }, el('div', { class: 'scr' }, el('span', { class: 'lg', html: LOGO }), el('b', {}, 'Compass'), el('i', {}), el('i', {}), el('i', { class: 'on' }))),
      el('div', { class: 'mobherotx' },
        el('small', { class: 'mobkick' }, 'Nuevo'),
        el('h2', {}, 'Tus servidores, en el bolsillo'),
        el('p', {}, 'Con la app Compass para Android enciendes el PC y tus servidores desde donde estés, ves la consola y quién juega, y cambias cualquier ajuste. Lo que hagas en el móvil se ve al momento aquí, y al revés.'),
        el('div', { class: 'row', style: 'gap:8px;margin-top:8px' }, chip(null, 'Android 7 o más nuevo'), chip(null, 'Gratis, sin cuentas')))),
    // 1. descargar
    mobStep(1, 'Descarga la app en tu móvil', 'Apunta con la cámara del móvil a este código y toca el enlace que aparece. Se descarga «Compass-Movil.apk».',
      el('div', { class: 'mobsplit' }, apkQr,
        el('ol', { class: 'mobhow' },
          el('li', {}, 'Abre la ', el('b', {}, 'cámara'), ' del móvil y apunta al código.'),
          el('li', {}, 'Toca el enlace: se descarga el archivo ', el('b', {}, 'Compass-Movil.apk'), '.'),
          el('li', {}, 'Ábrelo. Si Android dice que no permite instalar apps de este origen, toca ', el('b', {}, 'Ajustes'), ' y activa ', el('b', {}, '«Permitir de esta fuente»'), '.'),
          el('li', {}, 'Toca ', el('b', {}, 'Instalar'), '. Si sale Play Protect, toca ', el('b', {}, '«Instalar de todas formas»'), ' (es normal en apps que no vienen de Play Store).'),
          el('div', { class: 'row', style: 'margin-top:6px' }, el('button', { class: 'btn sm ghost', onclick: () => A.call('remoteOpen', 'apk') }, I('external', 14), 'Abrir el enlace aquí'))))),
    // 2. activar
    mobStep(2, 'Activa el control desde el móvil', 'Compass abrirá una puerta segura (puerto ' + i.port + ') solo para tus móviles emparejados.',
      el('div', { class: 'toggle' }, sw(on, async v => { try { MOB = await A.call('remoteSet', { on: v }); paintMob(wrap); toast(v ? 'Control desde el móvil activado' : 'Control desde el móvil desactivado', 'ok', 2500); } catch (e) { toast(clean(e), 'error'); } }),
        el('div', { class: 't' }, el('b', {}, 'Controlar Compass desde el móvil'), el('small', {}, 'Compass se abrirá solo al encender el PC (escondido junto al reloj) para que el móvil siempre lo encuentre.'))),
      on ? el('div', { class: 'row', style: 'margin-top:12px;gap:10px;align-items:center' }, el('small', { style: 'color:var(--mut)' }, 'Nombre de este PC en la app:'),
        el('input', { class: 'in', value: i.name || '', maxlength: 40, style: 'max-width:240px', onchange: async e => { MOB = await A.call('remoteSet', { name: e.target.value }); toast('Nombre guardado', 'ok', 1500); } })) : null),
    // 3. emparejar
    mobStep(3, 'Empareja el móvil', on ? 'Abre la app Compass, toca «Emparejar con mi PC» y apunta a este código. Solo hace falta una vez.' : 'Primero activa el paso 2.',
      on ? el('div', { class: 'mobsplit' }, pairBox,
        el('div', { class: 'mobdevs' },
          el('b', {}, 'Móviles emparejados'),
          (i.devices || []).length ? el('div', { class: 'list' }, ...(i.devices || []).map(d => el('div', { class: 'mobdev' }, I('phone', 16), el('div', { class: 't' }, el('b', {}, d.name), el('small', {}, 'Usado ' + ago(d.last))),
            el('button', { class: 'btn ghost sm', title: 'Quitar', onclick: async () => { MOB = await A.call('remoteForget', d.id); paintMob(wrap); } }, I('x', 14)))))
            : el('p', { class: 'hint' }, 'Todavía ninguno. Cuando escanees el código, aparecerá aquí.'),
          el('p', { class: 'hint', style: 'margin-top:10px' }, 'El código lleva una clave secreta: no lo enseñes a nadie. Si crees que alguien lo ha visto, cámbiala:'),
          el('div', { class: 'row' }, el('button', { class: 'btn sm dng', onclick: async () => { if (await modal('Cambiar la clave', el('p', {}, 'Todos los móviles emparejados dejarán de funcionar hasta que vuelvas a escanear el código nuevo.'), [{ t: 'Cancelar', v: false }, { t: 'Cambiar clave', v: true, cls: 'dng' }])) { MOB = await A.call('remoteNewKey'); paintMob(wrap); toast('Clave cambiada. Vuelve a emparejar tus móviles.', 'ok'); } } }, I('key', 14), 'Cambiar la clave')))) : null),
    // 4. encender el PC
    mobStep(4, 'Encender el PC desde el móvil', 'Opcional. Para que el botón «Encender PC» de la app despierte este ordenador aunque esté apagado.',
      el('div', { class: 'mobchecks' },
        chip(i.wired === true ? true : i.wired === false ? false : null, i.wired === false ? 'Va por WiFi (Wake-on-LAN casi nunca funciona por WiFi)' : 'Conectado por cable'),
        chip(prep ? (prep.adapters.some(a => a.ok) && prep.fastStartupOff) : null, prep ? (prep.adapters.some(a => a.ok) ? 'Tarjeta de red preparada' : 'La tarjeta no acepta Wake-on-LAN') : 'Falta preparar Windows'),
        chip(upnp ? !!upnp.ok : null, upnp ? (upnp.ok ? 'Router: puerto abierto solo' : 'Router: no abre puertos solo') : 'Router: sin comprobar'),
        i.mac ? chip(null, 'MAC ' + i.mac) : null),
      el('div', { class: 'mobsub2' },
        el('div', { class: 'mobpart' },
          el('b', {}, 'A. Preparar Windows'), el('small', {}, 'Un clic: activa «despertar con paquete mágico» en la tarjeta de red, quita el «inicio rápido» de Windows (si no, apagado no se despierta) y abre el cortafuegos para la app. Windows te pedirá permiso de administrador.'),
          el('div', { class: 'row', style: 'margin-top:8px' }, el('button', { class: 'btn pri sm', onclick: e => act(e.currentTarget, async () => { const r = await A.call('remotePrepare'); MOB = await A.call('remoteInfo'); paintMob(wrap); toast(r.adapters.some(a => a.ok) ? 'Listo: Windows ya está preparado' : 'Hecho, pero tu tarjeta de red no confirma Wake-on-LAN: mira la BIOS (paso B)', r.adapters.some(a => a.ok) ? 'ok' : 'warn', 7000); }) }, I('bolt', 14), prep ? 'Volver a preparar' : 'Preparar este PC'))),
        el('div', { class: 'mobpart' },
          el('b', {}, 'B. Activarlo en la BIOS (solo una vez)'), el('small', {}, 'Reinicia el PC y entra en la BIOS (suele ser la tecla Supr o F2 al encender). Busca y activa la opción, que según la placa se llama:'),
          el('div', { class: 'mobtags' }, ...['Wake on LAN', 'Power On By PCI-E', 'Resume by LAN', 'PME Event Wake Up'].map(t => el('span', { class: 'tag' }, t))),
          el('small', { style: 'margin-top:6px;display:block' }, 'Y si existe, desactiva «ErP» o «Deep Sleep». Guarda con F10.')),
        el('div', { class: 'mobpart' },
          el('b', {}, 'C. Que Windows entre solo'), el('small', {}, 'Al encender, Windows tiene que entrar en tu usuario sin pedir contraseña para que Compass se abra. En «Opciones de inicio de sesión» quita «Permitir solo Windows Hello»; luego, en la ventana de usuarios, desmarca «Los usuarios deben escribir su nombre y contraseña».'),
          el('div', { class: 'row', style: 'margin-top:8px;gap:8px' }, el('button', { class: 'btn sm', onclick: () => A.call('remoteOpen', 'signin') }, I('external', 14), '1. Opciones de inicio de sesión'), el('button', { class: 'btn sm', onclick: () => A.call('remoteOpen', 'netplwiz') }, I('users', 14), '2. Ventana de usuarios'))),
        el('div', { class: 'mobpart' },
          el('b', {}, 'D. Desde fuera de casa'), el('small', {}, upnp && upnp.ok ? 'Tu router ha dejado abrir el puerto de la app solo: el control funciona desde cualquier sitio. Para despertar el PC desde fuera, la app manda el aviso a tu router; si tu router no lo pasa al PC apagado, abre en el router el puerto UDP 9 hacia este PC (' + (i.lan || 'IP del PC') + ').'
            : 'Tu router no deja abrir puertos solo. Entra en tu router (normalmente 192.168.1.1) y abre el puerto TCP ' + i.port + ' hacia este PC (' + (i.lan || 'IP del PC') + ') y el UDP 9 para despertarlo. En casa (misma WiFi) funciona sin hacer nada.'),
          el('small', { style: 'margin-top:6px;display:block' }, 'Alternativa sin BIOS ni router: un enchufe inteligente + en la BIOS «Restore on AC Power Loss: Power On». Al encender el enchufe desde su app, el PC arranca solo.')))),
    // datos
    el('div', { class: 'panel mobfoot' },
      el('small', {}, 'En casa: ', el('b', {}, i.lan ? `${i.lan}:${i.port}` : '—'), ' · Desde fuera: ', el('b', {}, i.pub ? `${i.pub}:${i.port}` : '—'), ' · Versión ' + (i.version || '')),
      el('small', {}, on ? `${i.clients ? i.clients + ' móvil(es) conectado(s) ahora' : 'Ningún móvil conectado ahora'}` : 'Control desde el móvil desactivado')),
  );
  paintIcons(wrap);
}
// cambios hechos desde el móvil: se recarga lo que estés viendo (sin pisarte si estás escribiendo)
let remotePending = false;
async function remoteRefresh() {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#view').contains(a)) { if (!remotePending) { remotePending = true; a.addEventListener('blur', () => { remotePending = false; remoteRefresh(); }, { once: true }); } return; }
  try {
    await reload();
    renderRailServers(); renderFriends();
    if (MODE === 'host' && PAGE === 'host') renderHost(); else if (MODE === 'play' && PAGE === 'home') renderHome();
  } catch (e) { reportError(e); }
}
let rmTimer = null;
A.on('remoteChanged', () => { clearTimeout(rmTimer); rmTimer = setTimeout(remoteRefresh, 250); });
A.on('remoteClients', n => { if (MOB) MOB.clients = n; const f = $('.mobfoot small:last-child'); if (f && MOB && MOB.on) f.textContent = n ? n + ' móvil(es) conectado(s) ahora' : 'Ningún móvil conectado ahora'; });
A.on('remoteDevices', () => { if (setOpen() && STAB === 'movil') A.call('remoteInfo').then(i => { MOB = i; const w = $('.mobwrap'); if (w) paintMob(w); }).catch(() => {}); });

// al redibujar el panel del servidor (por un botón o un cambio desde el móvil) no se pierde la posición
{
  const inner = renderHost;
  renderHost = function () {
    const v = $('#view'), key = selS + '|' + TAB, top = v && renderHost.key === key ? v.scrollTop : 0;
    inner(); renderHost.key = key;
    if (top && v) { v.scrollTop = top; requestAnimationFrame(() => { v.scrollTop = top; }); }
  };
}
