'use strict';
// Compass para Android: enciende tu PC y controla tus servidores de Compass Launcher desde cualquier sitio.
// La interfaz es web (WebView); lo que necesita el teléfono (escáner QR, Wake-on-LAN, guardar datos) lo da «Android».
const REPO = 'luckicla/compass-launcher';
const APK_URL = `https://github.com/${REPO}/releases/latest/download/Compass-Movil.apk`;
const N = window.Android || {   // para probar en el navegador del PC
  get: k => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), del: k => localStorage.removeItem(k),
  scan: () => { const c = prompt('Código de emparejamiento'); if (c) setTimeout(() => window.onScan(c), 10); }, wake: () => 'ok', open: u => window.open(u),
  version: () => '0.0.0', device: () => 'Navegador', net: () => 'wifi', toast: m => toast(m), copy: t => navigator.clipboard && navigator.clipboard.writeText(t), vibrate: () => {},
};

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>', menu: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>', play: '<path d="M7 4.5v15L19.5 12z" fill="currentColor" stroke="none"/>', stop: '<rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>', qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/>',
  pc: '<rect x="2.5" y="4" width="19" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>', server: '<rect x="3" y="4" width="18" height="7"/><rect x="3" y="13" width="18" height="7"/><path d="M6.5 7.5h3M6.5 16.5h3"/>',
  user: '<rect x="8" y="3" width="8" height="8"/><path d="M4 21v-2.5A4.5 4.5 0 0 1 8.5 14h7a4.5 4.5 0 0 1 4.5 4.5V21"/>', copy: '<rect x="8" y="8" width="13" height="13"/><path d="M16 8V3H3v13h5"/>',
  send: '<path d="M3 11l18-8-8 18-2-8z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>', plus: '<path d="M12 5v14M5 12h14"/>', alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', check: '<path d="M4 12l5 5L20 6"/>', download: '<path d="M12 3v12M6 10l6 6 6-6M4 21h16"/>', wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16.5a5 5 0 0 1 6 0"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8M8 21v-7h8v7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
// los mismos iconos que Compass en el PC (icons.js); los de aquí solo si faltara alguno
const PCI = { back: 'chevleft', menu: 'dots' };
const I = (n, s = 22) => { const pc = typeof ICONS !== 'undefined' && ICONS[PCI[n] || n]; return el('span', { style: 'display:contents', html: `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="${pc ? 'square' : 'round'}" stroke-linejoin="${pc ? 'miter' : 'round'}">${pc || ICON[n] || ''}</svg>` }); };
// el logo viene de icons.js (el mismo que en el PC)
const logo = () => el('span', { class: 'logo', html: LOGO });
function toast(msg, type = 'info', ms = 3500) {
  const t = el('div', { class: 'toast ' + type }, msg); $('#toasts').append(t);
  while ($('#toasts').childElementCount > 3) $('#toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}
const sw = (on, fn) => el('span', { class: 'sw' }, el('input', { type: 'checkbox', checked: !!on, onchange: e => fn(e.target.checked, e.target) }));   // el mismo interruptor que en el PC
async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.innerHTML; btn.innerHTML = ''; btn.append(el('span', { class: 'spin' })); }
  try { return await fn(); } catch (e) { toast(String(e.message || e), 'error', 5000); } finally { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset.t; } }
}
function sheet(title, opts, extra) {   // menú que sube desde abajo
  return new Promise(res => {
    const s = $('#sheet'), done = v => { s.hidden = true; s.replaceChildren(); window.onBackSheet = null; res(v); };
    window.onBackSheet = () => done(null);
    s.replaceChildren(el('div', { onclick: e => e.stopPropagation() }, el('div', { class: 'grab' }), title ? el('h2', {}, title) : null, extra || null,
      ...(opts || []).map(o => el('button', { class: 'opt' + (o.dng ? ' dng' : ''), onclick: () => done(o.v) }, o.icon ? I(o.icon, 20) : null, o.t))));
    s.onclick = () => done(null); s.hidden = false;
  });
}
const confirmBox = (title, text, okT = 'Sí', dng) => sheet(title, [{ t: okT, v: true, dng, icon: dng ? 'alert' : 'check' }, { t: 'Cancelar', v: false, icon: 'x' }], el('p', { class: 'mut', style: 'margin-bottom:6px' }, text));
function ask(title, label, value = '', type = 'text') {
  return new Promise(res => {
    const inp = el('input', { class: 'in', value, type, placeholder: label });
    const s = $('#sheet'), done = v => { s.hidden = true; s.replaceChildren(); window.onBackSheet = null; res(v); };
    window.onBackSheet = () => done(null);
    s.replaceChildren(el('div', { onclick: e => e.stopPropagation() }, el('div', { class: 'grab' }), el('h2', {}, title), el('div', { class: 'stack', style: 'margin-top:10px' }, inp,
      el('div', { class: 'grid2' }, el('button', { class: 'btn', onclick: () => done(null) }, 'Cancelar'), el('button', { class: 'btn pri', onclick: () => done(inp.value.trim()) }, 'Aceptar')))));
    s.onclick = () => done(null); s.hidden = false; setTimeout(() => inp.focus(), 150);
  });
}

// ---------- datos guardados ----------
const store = { get: (k, d) => { try { const v = N.get(k); return v == null || v === '' ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => N.set(k, JSON.stringify(v)) };
let PC = store.get('pc', null);
const DEV = store.get('dev', null) || (() => { const d = 'm' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set('dev', d); return d; })();
function parsePairing(code) {
  const m = /COMPASS1:([A-Za-z0-9_-]+)/.exec(String(code || '').trim());
  if (!m) throw new Error('Ese código no es de Compass. En el PC: Ajustes › App del móvil › paso 3.');
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/'), bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
  if (!j.k || !(j.lan || j.pub)) throw new Error('Código incompleto: vuelve a escanearlo');
  return { name: j.n || 'Mi PC', lan: j.lan || null, pub: j.pub || null, mac: j.mac || null, bc: j.bc || null, k: j.k };
}

// ---------- conexión con el PC ----------
let BASE = null, ES = null, ONLINE = false, ST = { servers: [], host: { state: 'off', players: [] } }, LOG = [], INFO = null;
const sign = (method, path, body = '') => {
  const t = Date.now(), n = 'n' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
  const s = SHA.hmac(PC.k, `${t}\n${n}\n${method}\n${path}\n${body}`);
  return `${BASE}${path}?t=${t}&n=${n}&s=${s}&d=${encodeURIComponent(DEV)}&dn=${encodeURIComponent(N.device())}`;
};
const tfetch = (u, o = {}, ms = 4000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(u, { ...o, signal: c.signal }).finally(() => clearTimeout(t)); };
async function call(fn, ...args) {
  if (!BASE) throw new Error('Sin conexión con tu PC');
  const body = JSON.stringify({ fn, args });
  let r;
  try { r = await tfetch(sign('POST', '/call', body), { method: 'POST', body, headers: { 'Content-Type': 'text/plain' } }, fn === 'backupCreate' || fn === 'storeInstall' ? 120000 : 30000); }
  catch { connLost(); throw new Error('Se ha perdido la conexión con el PC'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j.r;
}
async function findPC() {   // prueba la dirección de casa y la de fuera a la vez; gana la primera que responde
  const cands = [...new Set([PC.lan, PC.pub].filter(Boolean))].map(a => 'http://' + a);
  if (!cands.length) return null;
  return new Promise(res => {
    let left = cands.length, won = false;
    for (const b of cands) tfetch(b + '/hello', {}, 3000).then(r => r.json()).then(j => { if (!won && j && j.app === 'compass') { won = true; res(b); } })
      .catch(() => {}).finally(() => { if (--left === 0 && !won) res(null); });
  });
}
let connecting = null;
async function connect() {
  if (!PC) return false;
  if (connecting) return connecting;
  connecting = (async () => {
    const b = await findPC();
    if (!b) { setOnline(false); return false; }
    BASE = b;
    try {
      INFO = await (await tfetch(sign('GET', '/info'))).json();
      if (INFO.error) throw new Error(INFO.error);
      // el PC dice sus direcciones actuales (por si han cambiado) y su MAC para poder despertarlo
      PC = { ...PC, name: INFO.name || PC.name, lan: INFO.lan ? `${INFO.lan}:${INFO.port}` : PC.lan, pub: INFO.pub ? `${INFO.pub}:${INFO.port}` : PC.pub, mac: INFO.mac || PC.mac, bc: INFO.bcast || PC.bc }; store.set('pc', PC);
      if (INFO.look) { store.set('look', INFO.look); applyLook(INFO.look); }
      Object.assign(ST, await call('state'));
      try { I18N.protect([PC.name, ...(ST.servers || []).map(s => s.name)]); } catch {}
      try { LOG = (await call('hostLog')) || []; } catch {}
      setOnline(true); openEvents();
      return true;
    } catch (e) { toast(String(e.message || e), 'error', 6000); setOnline(false); return false; }
  })().finally(() => { connecting = null; });
  return connecting;
}
function setOnline(v) { const was = ONLINE; ONLINE = v; if (!v && ES) { try { ES.close(); } catch {} ES = null; } if (was !== v) render(); else paintTop(); }
function connLost() { if (ONLINE) { setOnline(false); setTimeout(connect, 1500); } }
let esFails = 0;
function openEvents() {   // tiempo real: el PC avisa de todo lo que cambia
  if (ES) try { ES.close(); } catch {}
  ES = new EventSource(sign('GET', '/events'));
  ES.addEventListener('host', e => { esFails = 0; ST.host = JSON.parse(e.data); onHost(); });
  ES.addEventListener('srvlog', e => { const t = JSON.parse(e.data); pushLog(t); });
  ES.addEventListener('changed', () => { clearTimeout(chT); chT = setTimeout(onChanged, 300); });
  ES.addEventListener('upd', () => {});
  ES.addEventListener('look', e => { const l = JSON.parse(e.data); store.set('look', l); applyLook(l); });   // cambias el tema en el PC y cambia aquí al momento
  ES.onerror = () => {   // la firma no se puede reutilizar: se abre otra conexión nueva
    try { ES.close(); } catch {} ES = null;
    if (++esFails > 3) { esFails = 0; connLost(); return; }
    setTimeout(() => { if (ONLINE) openEvents(); }, 2000);
  };
}
let chT = null;
async function onChanged() { try { Object.assign(ST, await call('state')); I18N.protect((ST.servers || []).map(s => s.name)); } catch { return; } if (VIEW.name === 'server' && VIEW.reload) VIEW.reload(); else render(); }
function onHost() { if (VIEW.name === 'home') render(); else if (VIEW.name === 'server') { paintSrvHead(); if (TAB === 'resumen') renderTab(); } }
const ANSI = /\x1b\[[0-9;]*m/g;
function pushLog(t) {
  const lines = String(t).replace(ANSI, '').split(/\r?\n/).filter(Boolean);
  LOG.push(...lines); if (LOG.length > 800) LOG = LOG.slice(-600);
  const c = $('.console'); if (c) { const atEnd = c.scrollHeight - c.scrollTop - c.clientHeight < 60; lines.forEach(l => c.append(logLine(l))); while (c.childElementCount > 800) c.firstChild.remove(); if (atEnd) c.scrollTop = c.scrollHeight; }
}
const logLine = l => el('div', { class: /WARN/.test(l) ? 'w' : /ERROR|Exception/.test(l) ? 'e' : /^>/.test(l) ? 'me' : '' }, l);

// ---------- Wake-on-LAN ----------
function wakePC() {
  if (!PC || !PC.mac) { toast('Aún no sé la MAC de tu PC: conéctate una vez con el PC encendido.', 'warn', 5000); return false; }
  const host = a => a && a.split(':')[0];
  const targets = [...new Set(['255.255.255.255:9', PC.bc && PC.bc + ':9', PC.bc && PC.bc + ':7', host(PC.lan) && host(PC.lan) + ':9', host(PC.pub) && host(PC.pub) + ':9', host(PC.pub) && host(PC.pub) + ':7'].filter(Boolean))];
  N.wake(PC.mac, JSON.stringify(targets)); APP.vibrate && N.vibrate && N.vibrate(40);
  return true;
}

// ---------- pantallas ----------
let VIEW = { name: 'home' }, SEL = null, TAB = 'resumen';
const SV = id => (ST.servers || []).find(s => s.id === id);
const hostOf = id => ST.host && ST.host.id === id ? ST.host : { state: 'off', players: [] };
const HS = { off: ['Apagado', ''], starting: ['Arrancando…', 'warn'], ready: ['En línea', 'on'], stopping: ['Apagándose…', 'warn'], restarting: ['Reiniciando…', 'warn'] };
const typeName = t => t === 'paper' ? 'Plugins (Paper)' : t === 'hybrid' ? 'Mods + plugins' : t === 'vanilla' ? 'Vanilla' : 'Mods (Fabric)';
const SRV_ICONS = {};
function srvIcon(s, box) {
  if (SRV_ICONS[s.id] !== undefined) { box.replaceChildren(SRV_ICONS[s.id] ? el('img', { src: SRV_ICONS[s.id], alt: '' }) : I('server', 26)); return; }
  box.replaceChildren(I('server', 26));
  if (s.icon) call('serverIconGet', s.id).then(u => { SRV_ICONS[s.id] = u || null; if (u) box.replaceChildren(el('img', { src: u, alt: '' })); }).catch(() => {}); else SRV_ICONS[s.id] = null;
}

// pantallas principales (barra de abajo): Servidores · Mi PC · Ajustes. Un servidor se abre encima, con «atrás».
let TABV = 'home';
function render() {
  window.scrollTo(0, 0);
  if (!PC) return renderWelcome();
  if (VIEW.name === 'server' && ONLINE && SV(SEL)) return renderServer();
  VIEW = { name: TABV };
  if (TABV === 'pc') renderPC(); else if (TABV === 'settings') renderSettings(); else renderHome();
  $('#app').append(bottomNav());
}
function bottomNav() {
  const it = (k, icon, t) => el('button', { class: k === TABV ? 'on' : '', onclick: () => { if (TABV !== k) { TABV = k; render(); } } }, I(icon, 22), el('span', {}, t), k === 'settings' && UPD_NEW ? el('i', { class: 'pip' }) : null);
  return el('nav', { class: 'bnav' }, it('home', 'server', 'Servidores'), it('pc', 'pc', 'Mi PC'), it('settings', 'gear', 'Ajustes'));
}
function topBar(title, sub, left, right) {
  return el('div', { class: 'top' }, left || logo(), el('div', { class: 'ttl' }, el('h1', {}, title), sub ? el('small', { id: 'topSub' }, sub) : null), right || null);
}
function paintTop() {
  const s = $('#topSub'); if (!s || (VIEW.name !== 'home' && VIEW.name !== 'pc')) return;
  s.replaceChildren(el('span', { class: 'dot ' + (ONLINE ? 'on' : connecting ? 'warn' : 'off') }), ONLINE ? (BASE && PC.lan && BASE.includes(PC.lan.split(':')[0]) ? 'Conectado en casa' : 'Conectado desde fuera') : connecting ? 'Buscando tu PC…' : 'PC apagado o sin conexión');
}

function renderWelcome() {
  $('#app').replaceChildren(el('div', { class: 'hero' },
    logo(), el('h1', {}, 'Compass', el('span', {}, ' móvil')),
    el('p', {}, 'Enciende tu PC y tus servidores de Minecraft desde donde estés.'),
    el('div', { class: 'steps' },
      el('div', { class: 'step' }, el('b', { class: 'n' }, '1'), el('div', {}, 'En tu PC abre ', el('strong', {}, 'Compass Launcher › Ajustes › App del móvil'), '.')),
      el('div', { class: 'step' }, el('b', { class: 'n' }, '2'), el('div', {}, 'Activa ', el('strong', {}, '«Controlar Compass desde el móvil»'), '. Aparecerá un código QR.')),
      el('div', { class: 'step' }, el('b', { class: 'n' }, '3'), el('div', {}, 'Pulsa el botón de abajo y apunta la cámara al código. ¡Listo!'))),
    el('button', { class: 'btn pri big', onclick: () => N.scan() }, I('qr'), 'Emparejar con mi PC'),
    el('button', { class: 'btn ghost', onclick: async () => { const c = await ask('Escribir el código', 'COMPASS1:…'); if (c) window.onScan(c); } }, 'Escribir el código a mano'),
    el('p', { class: 'small' }, 'Versión ' + N.version())));
}
window.onScan = async code => {
  try {
    const p = parsePairing(code); PC = p; store.set('pc', PC); BASE = null; ONLINE = false;
    toast('Emparejado con ' + p.name, 'ok'); VIEW = { name: 'home' }; render();
    if (!(await connect())) toast('Emparejado. Ahora no encuentro el PC: si estás fuera de casa, revisa el paso D de la guía del PC.', 'warn', 7000);
  } catch (e) { toast(String(e.message || e), 'error', 6000); }
};

let WAKE = null;   // { t0 } mientras se espera a que el PC arranque
function renderHome() {
  const servers = ST.servers || [];
  const main = el('div', { class: 'main' });
  if (UPD_NEW) { main.append(updBanner()); setTimeout(paintUpd); }
  if (!ONLINE) {
    main.append(wakeCard(), el('div', { class: 'banner info' }, I('info', 20), el('div', { class: 'small' }, 'Si no se enciende: en el PC, Ajustes › App del móvil › paso 4 (preparar Windows, BIOS y router).')));
  } else {
    const run = ST.host && ST.host.id ? SV(ST.host.id) : null;
    main.append(el('div', { class: 'row', style: 'justify-content:space-between' }, el('h2', { style: 'font-size:18px' }, 'Tus servidores'), el('span', { class: 'small' }, servers.length + ' en total')));
    if (!servers.length) main.append(el('div', { class: 'card empty' }, 'Aún no tienes servidores. Créalos en Compass, en tu PC.'));
    for (const s of servers) {
      const h = hostOf(s.id), M = HS[h.state] || HS.off, ico = el('span', { class: 'ico' }); srvIcon(s, ico);
      const canStart = !ST.host.id || ST.host.state === 'off';
      main.append(el('div', { class: 'srv', onclick: () => { SEL = s.id; TAB = 'resumen'; VIEW = { name: 'server' }; render(); } }, ico,
        el('div', { class: 't' }, el('b', {}, s.name), el('small', {}, el('span', { class: 'badge ' + M[1] }, M[0]), h.state === 'ready' ? `${h.players.length} jugando` : 'Minecraft ' + s.mc)),
        h.state === 'off' ? el('button', { class: 'btn sm pri', disabled: !canStart, onclick: e => { e.stopPropagation(); startServer(s.id, e.currentTarget); } }, I('play', 16), 'Encender')
          : el('button', { class: 'btn sm dng', disabled: h.state === 'stopping', onclick: e => { e.stopPropagation(); busy(e.currentTarget, () => call('hostStop')); } }, I('stop', 16), 'Apagar')));
    }
    if (run && ST.host.state !== 'off') main.append(el('p', { class: 'small', style: 'text-align:center' }, 'Solo puede haber un servidor encendido a la vez.'));
  }
  $('#app').replaceChildren(topBar(PC.name, ' '), main);
  paintTop();
}
function wakeCard() {
  const waking = !!WAKE, pct = waking ? Math.min(100, (Date.now() - WAKE.t0) / 1800) : 0;
  return el('div', { class: 'card wake' + (waking ? ' go' : '') }, el('span', { class: 'pc' }, I('pc', 84)),
    el('h2', {}, waking ? 'Encendiendo tu PC…' : connecting ? 'Buscando tu PC…' : 'Tu PC está apagado'),
    el('p', { class: 'mut' }, waking ? 'Windows y Compass están arrancando. Suele tardar entre 1 y 2 minutos: no cierres la app.' : 'O no está conectado a internet. Puedes despertarlo desde aquí.'),
    waking ? el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` })) : null,
    el('button', { class: 'btn pri big', disabled: waking, onclick: () => startWake() }, I('power'), 'Encender PC'),
    el('button', { class: 'btn ghost', onclick: e => busy(e.currentTarget, async () => { if (!(await connect())) toast('Sigo sin encontrar tu PC', 'warn'); }) }, 'Volver a buscar'));
}
// ----- Mi PC: encender, apagar y cómo está conectado -----
function renderPC() {
  const main = el('div', { class: 'main' });
  if (!ONLINE) main.append(wakeCard(), el('div', { class: 'banner info' }, I('info', 20), el('div', { class: 'small' }, 'Si no se enciende: en el PC, Ajustes › App del móvil › paso 4 (preparar Windows, BIOS y router).')));
  else main.append(el('div', { class: 'card' }, el('h3', {}, 'Encendido'),
    el('div', { class: 'big-state' }, el('span', { class: 'ico pcico' }, I('pc', 34)), el('div', {}, el('h2', {}, 'Tu PC está encendido'), el('div', { class: 'mut' }, 'Compass ' + ((INFO && INFO.version) || '') + ' · ' + (BASE && PC.lan && BASE.includes(PC.lan.split(':')[0]) ? 'en casa' : 'desde fuera')))),
    el('div', { class: 'grid2', style: 'margin-top:14px' },
      el('button', { class: 'btn dng', onclick: () => pcPower('shutdown') }, I('power', 18), 'Apagar PC'),
      el('button', { class: 'btn', onclick: () => pcPower('restart') }, I('restart', 18), 'Reiniciar PC')),
    el('button', { class: 'btn ghost full', style: 'margin-top:8px', onclick: async () => { try { await call('pcPower', 'cancel'); toast('Apagado cancelado', 'ok'); } catch (e) { toast(e.message, 'error'); } } }, I('x', 18), 'Cancelar un apagado')));
  main.append(el('div', { class: 'card' }, el('h3', {}, 'Conexión'),
    el('div', { class: 'kv' }, el('span', {}, 'Nombre'), el('b', {}, PC.name)),
    el('div', { class: 'kv' }, el('span', {}, 'En casa'), el('b', {}, PC.lan || '—')),
    el('div', { class: 'kv' }, el('span', {}, 'Desde fuera'), el('b', {}, PC.pub || '—')),
    el('div', { class: 'kv' }, el('span', {}, 'MAC (para encenderlo)'), el('b', {}, PC.mac || '—'))),
    el('div', { class: 'card stack' }, el('h3', {}, 'Emparejamiento'),
      el('button', { class: 'btn full', onclick: () => { if (wakePC()) toast('Aviso de encendido enviado', 'ok'); } }, I('power', 18), 'Enviar aviso de encendido'),
      el('button', { class: 'btn full', onclick: () => N.scan() }, I('qr', 18), 'Volver a emparejar'),
      el('button', { class: 'btn dng full', onclick: async () => { if (await confirmBox('¿Olvidar este PC?', 'Tendrás que volver a escanear el código para controlarlo.', 'Olvidar', true)) { N.del('pc'); PC = null; BASE = null; setOnline(false); render(); } } }, I('trash', 18), 'Olvidar este PC')));
  $('#app').replaceChildren(topBar('Mi PC', ' '), main);
  paintTop();
}
async function startWake() {
  if (!wakePC()) return;
  WAKE = { t0: Date.now() }; render(); toast('Aviso de encendido enviado', 'ok');
  const tick = async () => {
    if (!WAKE) return;
    if (ONLINE) { WAKE = null; toast('¡Tu PC ya está encendido!', 'ok'); APP.vibrate && N.vibrate && N.vibrate(80); render(); return; }
    const el2 = Date.now() - WAKE.t0;
    if (el2 > 240000) { WAKE = null; render(); toast('El PC no ha respondido. Revisa en el PC la guía del paso 4.', 'warn', 7000); return; }
    if (el2 % 20000 < 4000) wakePC();   // se repite el aviso cada ~20 s por si se perdió
    const b = $('.wake .bar i'); if (b) b.style.width = Math.min(100, el2 / 1800) + '%';
    await connect(); setTimeout(tick, 4000);
  };
  setTimeout(tick, 3000);
}
async function startServer(id, btn) {
  await busy(btn, async () => {
    let r = await call('hostStart', id);
    if (r && r.blocked) {
      const ok = await confirmBox('Hay mods que no encajan', (r.issues || []).slice(0, 4).map(x => x.text || x.title || '').join(' · ') || 'Compass ha encontrado problemas con los mods.', 'Arrancar igualmente', true);
      if (ok) r = await call('hostStart', id, { force: true });
    }
  });
}
async function pcPower(what) {
  const ok = await confirmBox(what === 'shutdown' ? '¿Apagar el PC?' : '¿Reiniciar el PC?', 'Se ' + (what === 'shutdown' ? 'apaga' : 'reinicia') + ' en 60 segundos. Si hay un servidor encendido, apágalo antes para no perder nada.', what === 'shutdown' ? 'Apagar' : 'Reiniciar', true);
  if (!ok) return;
  try { await call('pcPower', what); toast('Hecho. Puedes cancelarlo en el menú de ajustes durante 60 s.', 'ok', 5000); } catch (e) { toast(e.message, 'error'); }
}

// ----- pantalla de un servidor -----
const TABS = [['resumen', 'Resumen'], ['consola', 'Consola'], ['gente', 'Gente'], ['ajustes', 'Ajustes'], ['mods', 'Mods'], ['copias', 'Copias'], ['auto', '24/7']];
function renderServer() {
  const s = SV(SEL);
  const tabs = el('div', { class: 'tabs' }, ...TABS.map(([k, t]) => el('button', { class: k === TAB ? 'on' : '', onclick: e => { TAB = k; $$('.tabs button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); renderTab(); } }, k === 'mods' && s.type === 'paper' ? 'Plugins' : t)));
  $('#app').replaceChildren(topBar(s.name, ' ', el('button', { class: 'ib', onclick: goBack }, I('back'))), tabs, el('div', { class: 'main', id: 'tab' }));
  paintSrvHead(); renderTab();
}
function paintSrvHead() {
  const s = SV(SEL), sub = $('#topSub'); if (!s || !sub) return;
  const h = hostOf(s.id), M = HS[h.state] || HS.off;
  sub.replaceChildren(el('span', { class: 'dot ' + (M[1] || 'off') }), M[0] + (h.state === 'ready' ? ` · ${h.players.length} jugando` : '') + ' · ' + typeName(s.type));
}
function goBack() { VIEW = { name: TABV }; render(); }
window.onBack = () => {   // botón «atrás» de Android
  if (window.onBackSheet) { window.onBackSheet(); return true; }
  if (VIEW.name === 'server' && PC) { goBack(); return true; }
  if (TABV !== 'home' && PC) { TABV = 'home'; render(); return true; }
  return false;
};
async function renderTab() {
  const box = $('#tab'); if (!box) return;
  const s = SV(SEL); if (!s) return goBack();
  const fn = { resumen: tabResumen, consola: tabConsola, gente: tabGente, ajustes: tabAjustes, mods: tabMods, copias: tabCopias, auto: tabAuto }[TAB];
  VIEW.reload = () => renderTab();
  const my = Symbol(); renderTab.cur = my;
  try {
    const kids = await fn(s);
    if (renderTab.cur !== my || TAB === undefined) return;
    box.replaceChildren(...[].concat(kids).filter(Boolean));
    if (TAB === 'consola') { const c = $('.console'); if (c) c.scrollTop = c.scrollHeight; }
  } catch (e) { box.replaceChildren(el('div', { class: 'card empty' }, String(e.message || e))); }
}

function tabResumen(s) {
  const h = hostOf(s.id), M = HS[h.state] || HS.off, ico = el('span', { class: 'ico' }); srvIcon(s, ico);
  const other = ST.host.id && ST.host.id !== s.id && ST.host.state !== 'off' ? SV(ST.host.id) : null;
  const acts = h.state === 'off'
    ? [el('button', { class: 'btn pri big', disabled: !!other, onclick: e => startServer(s.id, e.currentTarget) }, I('play'), 'Encender')]
    : [el('div', { class: 'grid2' },
      el('button', { class: 'btn dng', disabled: h.state === 'stopping', onclick: e => busy(e.currentTarget, () => call('hostStop')) }, I('stop', 18), 'Apagar'),
      el('button', { class: 'btn', disabled: h.state !== 'ready', onclick: e => busy(e.currentTarget, () => call('hostRestart')) }, I('restart', 18), 'Reiniciar')),
      h.state === 'stopping' ? el('button', { class: 'btn sm ghost', onclick: e => busy(e.currentTarget, () => call('hostKill')) }, 'Forzar el apagado') : null];
  return [
    el('div', { class: 'card stack' },
      el('div', { class: 'big-state' }, ico, el('div', {}, el('h2', {}, M[0]), el('div', { class: 'mut' }, 'Minecraft ' + s.mc + ' · ' + typeName(s.type)))),
      other ? el('div', { class: 'banner' }, I('alert', 20), el('div', {}, `Ahora está encendido «${other.name}». Apágalo antes para encender este.`)) : null,
      h.note && h.state !== 'off' ? el('p', { class: 'small' }, h.note) : null, ...acts),
    h.state !== 'off' && (h.share || h.ip) ? el('div', { class: 'card' }, el('h3', {}, 'Cómo entran tus amigos'),
      h.ip ? el('div', { class: 'kv' }, el('span', {}, 'Dirección'), el('b', {}, h.ip)) : null,
      h.share ? el('div', { class: 'kv' }, el('span', {}, 'Código'), el('b', {}, h.share.slice(0, 22) + '…')) : null,
      el('div', { class: 'row', style: 'margin-top:8px' }, h.ip ? el('button', { class: 'btn sm', onclick: () => { N.copy(h.ip); toast('Dirección copiada', 'ok'); } }, I('copy', 16), 'Copiar dirección') : null,
        h.share ? el('button', { class: 'btn sm', onclick: () => { N.copy(h.share); toast('Código copiado', 'ok'); } }, I('copy', 16), 'Copiar código') : null)) : null,
    el('div', { class: 'card' }, el('h3', {}, 'Conectados ahora'),
      h.state === 'ready' && h.players.length ? el('div', { class: 'list' }, ...h.players.map(p => playerRow(s, p, true))) : el('div', { class: 'empty' }, h.state === 'ready' ? 'Nadie conectado' : 'El servidor está apagado')),
  ];
}
const head = n => el('img', { class: 'av', src: `https://mc-heads.net/avatar/${encodeURIComponent(n)}/64`, alt: '', onerror: e => e.target.style.visibility = 'hidden' });
function playerRow(s, name, online) {
  return el('div', { class: 'li', onclick: () => playerMenu(s, name, online) }, head(name), el('div', { class: 't' }, el('b', {}, name), el('small', {}, online ? 'Conectado' : '')), I('menu', 20));
}
async function playerMenu(s, name, online) {
  const opts = [online && { t: 'Expulsar', v: 'kick', icon: 'x' }, online && { t: 'Modo creativo', v: 'gm:creative', icon: 'user' }, online && { t: 'Modo supervivencia', v: 'gm:survival', icon: 'user' }, online && { t: 'Modo espectador', v: 'gm:spectator', icon: 'user' },
    { t: 'Dar OP (administrador)', v: 'op', icon: 'check' }, { t: 'Quitar OP', v: 'deop', icon: 'x' }, { t: 'Permitir solo TP', v: 'tpAdd', icon: 'check' }, { t: 'Banear', v: 'ban', icon: 'alert', dng: true }].filter(Boolean);
  const a = await sheet(name, opts); if (!a) return;
  try {
    if (a.startsWith('gm:')) await call('permsAct', s.id, 'gamemode', { name, mode: a.slice(3) });
    else if (a === 'ban') { if (!(await confirmBox('¿Banear a ' + name + '?', 'No podrá volver a entrar hasta que lo desbanees.', 'Banear', true))) return; await call('permsAct', s.id, 'ban', { name }); }
    else await call('permsAct', s.id, a, { name });
    toast('Hecho', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

function tabConsola(s) {
  const h = hostOf(s.id);
  const inp = el('input', { class: 'in', placeholder: h.state === 'ready' ? 'Escribe un comando (sin /)' : 'El servidor está apagado', disabled: h.state !== 'ready', enterkeyhint: 'send' });
  const sendCmd = async () => { const c = inp.value.trim().replace(/^\//, ''); if (!c) return; inp.value = ''; try { await call('hostCmd', c); pushLog('> ' + c); } catch (e) { toast(e.message, 'error'); } };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') sendCmd(); });
  return [el('div', { class: 'console' }, ...(LOG.length ? LOG.slice(-500).map(logLine) : [el('div', { class: 'me' }, 'Aquí sale lo que dice el servidor.')])),
    el('div', { class: 'cmd' }, inp, el('button', { class: 'btn pri', onclick: sendCmd, disabled: h.state !== 'ready' }, I('send', 18))),
    el('div', { class: 'row' }, ...['say Hola a todos', 'time set day', 'weather clear', 'save-all'].map(c => el('button', { class: 'btn sm', disabled: h.state !== 'ready', onclick: async () => { try { await call('hostCmd', c); pushLog('> ' + c); } catch (e) { toast(e.message, 'error'); } } }, c)))];
}

async function tabGente(s) {
  const p = await call('permsGet', s.id), names = l => (l || []).map(x => x.name).filter(Boolean);
  const addBtn = (action, label) => el('button', { class: 'btn sm', onclick: async () => { const n = await ask(label, 'Nombre de Minecraft'); if (!n) return; try { await call('permsAct', s.id, action, { name: n }); toast('Hecho', 'ok'); renderTab(); } catch (e) { toast(e.message, 'error'); } } }, I('plus', 16), 'Añadir');
  const section = (title, list, action, removeAct, removeT) => el('div', { class: 'card' }, el('div', { class: 'row' }, el('h3', { style: 'margin:0' }, title), el('span', { class: 'sp' }), action ? addBtn(action, title) : null),
    list.length ? el('div', { class: 'list' }, ...list.map(n => el('div', { class: 'li' }, head(n), el('div', { class: 't' }, el('b', {}, n)),
      el('button', { class: 'btn sm ghost', onclick: async () => { try { await call('permsAct', s.id, removeAct, { name: n }); toast(removeT, 'ok'); renderTab(); } catch (e) { toast(e.message, 'error'); } } }, I('x', 16))))) : el('div', { class: 'empty' }, 'Nadie'));
  return [
    el('div', { class: 'card' }, el('h3', {}, 'Conectados ahora'), p.online && p.online.length ? el('div', { class: 'list' }, ...p.online.map(n => playerRow(s, n, true))) : el('div', { class: 'empty' }, p.running ? 'Nadie conectado' : 'El servidor está apagado')),
    el('div', { class: 'card' }, el('div', { class: 'tg' }, el('div', { class: 't' }, el('b', {}, 'Lista blanca'), el('small', {}, 'Solo entran los que estén en la lista')),
      sw(p.whitelistOn, async v => { try { await call('permsAct', s.id, 'whitelist', { on: v }); toast(v ? 'Lista blanca activada' : 'Lista blanca desactivada', 'ok'); } catch (e) { toast(e.message, 'error'); } }))),
    section('Lista blanca', names(p.whitelist), 'wlAdd', 'wlRemove', 'Quitado de la lista'),
    section('Administradores (OP)', names(p.ops), 'op', 'deop', 'OP quitado'),
    section('Solo TP', names(p.tp), 'tpAdd', 'tpRemove', 'Permiso quitado'),
    section('Baneados', names(p.bans), 'ban', 'pardon', 'Desbaneado'),
  ];
}

const PROPS = [
  ['motd', 'Mensaje del servidor', 'text'], ['max-players', 'Jugadores máximos', 'number'],
  ['gamemode', 'Modo de juego', 'select', [['survival', 'Supervivencia'], ['creative', 'Creativo'], ['adventure', 'Aventura'], ['spectator', 'Espectador']]],
  ['difficulty', 'Dificultad', 'select', [['peaceful', 'Pacífica'], ['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']]],
  ['pvp', 'PvP (pelear entre jugadores)', 'bool'], ['online-mode', 'Solo cuentas originales de Minecraft', 'bool'], ['allow-flight', 'Permitir volar (mods de vuelo)', 'bool'],
  ['hardcore', 'Hardcore', 'bool'], ['spawn-monsters', 'Monstruos', 'bool'], ['enable-command-block', 'Bloques de comandos', 'bool'], ['force-gamemode', 'Forzar el modo de juego al entrar', 'bool'], ['hide-online-players', 'Ocultar quién está conectado', 'bool'],
  ['view-distance', 'Distancia de visión (chunks)', 'number'], ['simulation-distance', 'Distancia de simulación (chunks)', 'number'], ['spawn-protection', 'Protección del spawn (bloques)', 'number'],
];
async function tabAjustes(s) {
  const p = await call('serverProps', s.id), patch = {}, sp = {};
  const field = ([k, label, type, opts]) => {
    if (type === 'bool') return el('div', { class: 'tg' }, el('div', { class: 't' }, el('b', {}, label)), sw(p[k] === 'true', v => { patch[k] = v ? 'true' : 'false'; }));
    const inp = type === 'select' ? el('select', { class: 'in', onchange: e => patch[k] = e.target.value }, ...opts.map(([v, t]) => el('option', { value: v, selected: p[k] === v }, t)))
      : el('input', { class: 'in', type: type === 'number' ? 'number' : 'text', inputmode: type === 'number' ? 'numeric' : null, value: p[k] || '', onchange: e => patch[k] = e.target.value });
    return el('div', { class: 'field' }, el('label', {}, label), inp);
  };
  const save = async btn => busy(btn, async () => {
    if (Object.keys(sp).length) await call('serverSet', s.id, sp);
    if (Object.keys(patch).length) await call('setServerProps', s.id, patch);
    toast(hostOf(s.id).state === 'off' ? 'Guardado' : 'Guardado. Se aplica al reiniciar el servidor.', 'ok', 4000);
    for (const k in patch) delete patch[k]; for (const k in sp) delete sp[k];
  });
  return [
    el('div', { class: 'card' }, el('h3', {}, 'Compass'),
      el('div', { class: 'field' }, el('label', {}, 'Nombre'), el('input', { class: 'in', value: s.name, maxlength: 60, onchange: e => sp.name = e.target.value })),
      el('div', { class: 'field' }, el('label', {}, 'Descripción'), el('textarea', { class: 'in', maxlength: 300, onchange: e => sp.desc = e.target.value }, s.desc || '')),
      el('div', { class: 'field' }, el('label', {}, 'Memoria RAM'), el('select', { class: 'in', onchange: e => sp.ram = e.target.value }, ...['2G', '3G', '4G', '6G', '8G', '10G', '12G', '16G'].map(r => el('option', { value: r, selected: (s.ram || '4G') === r }, r.replace('G', ' GB'))))),
      el('div', { class: 'tg' }, el('div', { class: 't' }, el('b', {}, 'Reiniciar solo si se cae')), sw(!!s.autoRestart, v => sp.autoRestart = v))),
    el('div', { class: 'card' }, el('h3', {}, 'Minecraft'), ...PROPS.map(field)),
    el('button', { class: 'btn pri big', onclick: e => save(e.currentTarget) }, I('save'), 'Guardar cambios'),
  ];
}

async function tabMods(s) {
  const t = { kind: 'server', id: s.id }, out = [];
  if (s.type === 'paper' || s.type === 'hybrid') {
    const pl = await call('pluginsList', s.id);
    out.push(el('div', { class: 'card' }, el('h3', {}, 'Plugins (' + pl.length + ')'), pl.length ? el('div', { class: 'list' }, ...pl.map(p => modRow(p.name, p.version, p.icon, p.enabled,
      () => call('pluginToggle', s.id, p.file), () => call('pluginDelete', s.id, p.file)))) : el('div', { class: 'empty' }, 'No hay plugins')));
  }
  if (s.type === 'vanilla') out.push(el('div', { class: 'empty' }, 'Servidor vanilla: sin mods ni plugins'));
  if (s.type !== 'paper' && s.type !== 'vanilla') {
    const mods = await call('scan', t);
    out.push(el('div', { class: 'card' }, el('h3', {}, 'Mods (' + mods.length + ')'), mods.length ? el('div', { class: 'list' }, ...mods.map(m => modRow(m.title, (m.ver || '') + (m.env === 'client' ? ' · solo cliente' : ''), m.icon, m.enabled,
      () => call('toggleMod', t, m.file), () => call('deleteMod', t, m.file)))) : el('div', { class: 'empty' }, 'No hay mods')));
  }
  out.push(el('p', { class: 'small', style: 'text-align:center' }, 'Los cambios se aplican al reiniciar el servidor. Para añadir mods nuevos usa la Tienda de Compass en el PC.'));
  return out;
}
function modRow(name, sub, icon, on, toggle, del) {
  return el('div', { class: 'li' }, el('span', { class: 'mi' }, icon ? el('img', { src: icon, alt: '', loading: 'lazy' }) : null), el('div', { class: 't' }, el('b', {}, name), el('small', {}, sub || '')),
    sw(on, async (v, inp) => { try { await toggle(); toast(v ? 'Activado' : 'Desactivado', 'ok', 1800); } catch (e) { inp.checked = !v; toast(e.message, 'error'); } }),
    el('button', { class: 'ib', onclick: async () => { if (await confirmBox('¿Borrar ' + name + '?', 'Se borra del servidor.', 'Borrar', true)) { try { await del(); toast('Borrado', 'ok'); renderTab(); } catch (e) { toast(e.message, 'error'); } } } }, I('trash', 20)));
}

async function tabCopias(s) {
  const l = await call('backupList', s.id), off = hostOf(s.id).state === 'off';
  const size = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(0) + ' MB', when = t => new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
  return [
    el('button', { class: 'btn pri big', onclick: e => busy(e.currentTarget, async () => { const n = await call('backupCreate', s.id); toast('Copia creada: ' + n, 'ok'); renderTab(); }) }, I('save'), 'Hacer una copia ahora'),
    el('div', { class: 'card' }, el('h3', {}, 'Copias del mundo'), l.length ? el('div', { class: 'list' }, ...l.map(b => el('div', { class: 'li' }, el('div', { class: 't' }, el('b', {}, when(b.time)), el('small', {}, size(b.size))),
      el('button', { class: 'btn sm', disabled: !off, onclick: async () => { if (await confirmBox('¿Volver a esta copia?', 'El mundo actual se guarda aparte por si acaso.', 'Restaurar', true)) { try { await call('backupRestore', s.id, b.file); toast('Copia restaurada', 'ok'); } catch (e) { toast(e.message, 'error'); } } } }, 'Restaurar'),
      el('button', { class: 'ib', onclick: async () => { if (await confirmBox('¿Borrar esta copia?', when(b.time), 'Borrar', true)) { try { await call('backupDelete', s.id, b.file); renderTab(); } catch (e) { toast(e.message, 'error'); } } } }, I('trash', 20))))) : el('div', { class: 'empty' }, 'Todavía no hay copias')),
    !off ? el('p', { class: 'small', style: 'text-align:center' }, 'Para restaurar una copia, apaga antes el servidor.') : null,
  ];
}

async function tabAuto(s) {
  const a = await call('get247', s.id);
  const tg = (k, title, sub) => el('div', { class: 'tg' }, el('div', { class: 't' }, el('b', {}, title), el('small', {}, sub)), sw(a[k], async v => { try { await call('set247', s.id, { [k === 'autostart' ? 'autostart' : k]: v }); toast('Guardado', 'ok', 1500); } catch (e) { toast(e.message, 'error'); } }));
  return [el('div', { class: 'card' }, el('h3', {}, 'Modo 24/7'),
    tg('keep247', 'No dejar que el PC se duerma', 'Mientras el servidor está encendido'),
    tg('autostart', 'Encender este servidor al abrir Compass', 'Ideal con «Encender PC»: el servidor arranca solo'),
    tg('atLogin', 'Abrir Compass al encender el PC', 'Necesario para poder controlarlo desde el móvil')),
  el('div', { class: 'banner info' }, I('info', 20), el('div', { class: 'small' }, 'Truco: activa «Encender este servidor al abrir Compass» y con un solo botón («Encender PC») tendrás el PC y el servidor listos.'))];
}

// ----- ajustes de la app (solo del móvil) -----
const APP = Object.assign({ theme: 'pc', scheme: 'pc', anim: true, vibrate: true, autoUpd: true }, store.get('app', {}));
const saveApp = () => store.set('app', APP);
function renderSettings() {
  const th = typeof THEMES !== 'undefined' ? THEMES : {};
  const themeSel = el('select', { class: 'in', onchange: e => { APP.theme = e.target.value; saveApp(); applyLook(store.get('look', {})); } },
    el('option', { value: 'pc' }, 'El mismo que en mi PC'), ...Object.entries(th).map(([k, t]) => el('option', { value: k }, t.name)));
  themeSel.value = APP.theme;
  const seg = (cur, opts, fn) => el('div', { class: 'seg' }, ...opts.map(([v, t]) => el('button', { class: v === cur ? 'on' : '', onclick: e => { $$('button', e.currentTarget.parentNode).forEach(b => b.classList.toggle('on', b === e.currentTarget)); fn(v); } }, t)));
  const tg = (title, sub, on, fn) => el('div', { class: 'tg' }, el('div', { class: 't' }, el('b', {}, title), sub ? el('small', {}, sub) : null), sw(on, fn));
  const main = el('div', { class: 'main' },
    UPD_NEW ? updBanner() : null,
    el('div', { class: 'card' }, el('h3', {}, 'Aspecto'),
      el('div', { class: 'field' }, el('label', {}, 'Tema'), themeSel),
      el('div', { class: 'field' }, el('label', {}, 'Claro u oscuro'), seg(APP.scheme, [['pc', 'Como el PC'], ['system', 'Sistema'], ['dark', 'Oscuro'], ['light', 'Claro']], v => { APP.scheme = v; saveApp(); applyLook(store.get('look', {})); })),
      tg('Fondo animado', 'Estrellas, nubes y demás. Apágalo para ahorrar batería.', APP.anim, v => { APP.anim = v; saveApp(); applyLook(store.get('look', {})); })),
    el('div', { class: 'card' }, el('h3', {}, 'Idioma'),
      (() => { const x = el('select', { class: 'in', onchange: e => { if (I18N.set(e.target.value)) location.reload(); } }, ...Object.entries(I18N.NAMES).map(([k, t]) => el('option', { value: k, 'data-noi18n': k === 'auto' ? null : '' }, t))); x.value = I18N.pref; return el('div', { class: 'field' }, x); })()),
    el('div', { class: 'card' }, el('h3', {}, 'App'),
      tg('Vibrar', 'Al encender el PC y cuando termina de arrancar.', APP.vibrate, v => { APP.vibrate = v; saveApp(); }),
      tg('Buscar actualizaciones solas', 'Al abrir la app y cada 6 horas.', APP.autoUpd, v => { APP.autoUpd = v; saveApp(); })),
    el('div', { class: 'card stack' }, el('h3', {}, 'Actualizaciones'),
      el('div', { class: 'kv' }, el('span', {}, 'Versión de la app'), el('b', {}, N.version())),
      UPD_NEW ? null : el('button', { class: 'btn full', onclick: e => busy(e.currentTarget, async () => { await checkUpdate(); toast(UPD_NEW ? 'Hay una versión nueva: ' + UPD_NEW : 'Tienes la última versión', UPD_NEW ? 'info' : 'ok'); render(); }) }, I('download', 18), 'Buscar actualizaciones'),
      el('button', { class: 'btn ghost full', onclick: () => N.open(`https://github.com/${REPO}/releases`) }, 'Ver todas las versiones')),
    el('div', { class: 'card stack about' }, el('h3', {}, 'Acerca de'),
      el('div', { class: 'row', style: 'gap:12px;flex-wrap:nowrap' }, logo(), el('div', {}, el('b', { class: 'disp' }, 'Compass'), el('div', { class: 'small' }, 'Versión ' + N.version()))),
      el('p', { class: 'mut', html: '¡Buenas! Soy <b>luckicla</b> y hago Compass Launcher yo solo, en mis ratos libres, por puro gusto y porque me lo paso bien programando.' }),
      el('p', { class: 'mut' }, 'Empezó porque quería jugar con mis amigos en nuestro propio servidor con mods sin pelearme con carpetas, versiones ni puertos. Me pareció que molaba y quiero que otra gente pueda usarlo gratis.'),
      el('p', { class: 'mut' }, 'No tiene anuncios ni recoge datos de nadie. Si algo falla o se te ocurre alguna idea, dímelo en GitHub y le echo un ojo.'),
      el('button', { class: 'btn full', onclick: () => N.open('https://luckicla.github.io/compass-launcher/') }, 'Web de Compass'),
      el('p', { class: 'small' }, 'Parte del proyecto lo he hecho con ayuda de IA (Claude Opus 5.5).'),
      el('p', { class: 'small' }, '© 2026 luckicla. Todos los derechos reservados.')));
  $('#app').replaceChildren(topBar('Ajustes', null), main);
}

// ---------- actualizaciones de la app ----------
let UPD_NEW = null, UPD_PCT = null;
// actualizar la app: se descarga dentro de la app y se abre el instalador de Android (la misma firma: se instala encima)
function updateApp() {
  if (!N.update) { N.open(APK_URL); return; }
  if (UPD_PCT != null) return;
  UPD_PCT = 0; paintUpd(); toast('Descargando la versión ' + (UPD_NEW || 'nueva') + '…', 'info');
  N.update(APK_URL);
}
window.onUpdProgress = p => { UPD_PCT = Math.max(0, p); paintUpd(); };
window.onUpdState = s => {
  if (s === 'permiso') toast('Activa «Permitir de esta fuente» y vuelve a la app: la instalación sigue sola.', 'warn', 8000);
  else if (s === 'instalando') { UPD_PCT = null; paintUpd(); toast('Toca «Actualizar» en la ventana de Android', 'ok', 6000); }
  else if (String(s).startsWith('error:')) { UPD_PCT = null; paintUpd(); toast('No se pudo descargar: ' + s.slice(6), 'error', 6000); }
};
function paintUpd() {
  $$('.updbtn').forEach(b => { b.disabled = UPD_PCT != null; b.textContent = UPD_PCT != null ? `Descargando… ${UPD_PCT} %` : 'Actualizar'; });
  $$('.updbar i').forEach(i => { i.style.width = (UPD_PCT || 0) + '%'; i.parentElement.hidden = UPD_PCT == null; });
}
const updBanner = () => el('div', { class: 'banner info', style: 'flex-wrap:wrap' }, I('download', 20),
  el('div', { style: 'flex:1;min-width:150px' }, el('b', {}, 'Nueva versión ' + UPD_NEW), el('div', { class: 'small' }, 'Se descarga e instala sin salir de la app.')),
  el('button', { class: 'btn sm teal updbtn', onclick: updateApp }, 'Actualizar'),
  el('div', { class: 'bar updbar', hidden: true, style: 'flex-basis:100%' }, el('i', { style: 'width:0%' })));
const newer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(n => parseInt(n) || 0), y = String(b).replace(/^v/, '').split('.').map(n => parseInt(n) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
async function latestRelease() {   // desde Java (sin problemas de CORS en el WebView); si no, con fetch
  if (N.latest) return new Promise(res => { const t = setTimeout(() => res(null), 10000); window.onLatest = j => { clearTimeout(t); try { res(JSON.parse(j)); } catch { res(null); } }; N.latest(`https://api.github.com/repos/${REPO}/releases/latest`); });
  return (await tfetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }, 8000)).json();
}
async function checkUpdate() {
  try {
    const r = await latestRelease(); if (!r) return;
    const v = String(r.tag_name || '').replace(/^v/, '');
    if (v && newer(v, N.version()) && (r.assets || []).some(a => a.name === 'Compass-Movil.apk')) UPD_NEW = v;
  } catch {}
}

// ---------- aspecto: el mismo tema, colores y fondo animado que Compass en tu PC ----------
function applyLook(look) {
  const L = { ...(look || {}) };
  if (APP.theme !== 'pc') { L.theme = APP.theme; L.bg = 'tema'; L.accent = 'tema'; L.accent2 = 'tema'; L.font = 'tema'; L.corners = 'tema'; }
  if (APP.scheme !== 'pc') L.scheme = APP.scheme;
  if (!APP.anim) L.anim = false;
  try { applyTheme(L); } catch (e) { console.error(e); }
}
if (typeof BG !== 'undefined') document.body.prepend(BG.el);
applyLook(store.get('look', {}));

// ---------- arranque ----------
try { I18N.start(); } catch (e) { console.error(e); }   // español, inglés o catalán (el del móvil, o el que elijas en Ajustes)
render();
if (PC) connect().then(() => render());
if (APP.autoUpd) checkUpdate().then(() => { if (UPD_NEW && VIEW.name === 'home') render(); });
setInterval(() => APP.autoUpd && checkUpdate().then(() => { if (UPD_NEW && VIEW.name === 'home' && !$('.updbtn')) render(); }), 6 * 3600e3);   // y cada 6 horas
setInterval(() => { if (PC && !ONLINE && !connecting && !WAKE && document.visibilityState === 'visible') connect(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && PC) { if (!ONLINE) connect(); else if (!ES) openEvents(); } });
window.onResume = () => { if (PC && !ONLINE) connect(); };
