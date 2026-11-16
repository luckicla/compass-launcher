'use strict';
// ---------- Control desde el móvil ----------
// Un pequeño servidor web (puerto 25580) que solo atiende a móviles emparejados con el QR de Ajustes.
// Cada petición va firmada (HMAC-SHA256 con la clave del emparejamiento, la hora y un número que no se repite):
// la clave nunca viaja por la red y una petición copiada no sirve dos veces.
// Los cambios llegan al momento a los dos lados: el móvil escucha /events (Server-Sent Events) y el PC
// recibe «remoteChanged» cuando el cambio lo hace el móvil.
const http = require('http'), crypto = require('crypto'), os = require('os');

const REMOTE_PORT = 25580;
// lo que el móvil puede hacer: todo lo del servidor, nada de tus perfiles, tu cuenta ni ventanas del PC
const ALLOWED = new Set(['state', 'sysInfo', 'serverSet', 'serverProps', 'setServerProps', 'hostStart', 'hostStop', 'hostKill', 'hostRestart', 'hostCmd', 'hostLog',
  'backupList', 'backupCreate', 'backupRestore', 'backupDelete', 'modCount', 'scan', 'toggleMod', 'deleteMod', 'checkCompat', 'fixMods', 'storeSearch', 'storeInstall',
  'worldsList', 'worldUse', 'worldNew', 'dimSet', 'tasksSet', 'taskRunNow', 'set247', 'get247', 'pluginsList', 'pluginToggle', 'pluginDelete', 'pluginsFix',
  'serverIconGet', 'permsGet', 'permsAct', 'hybridVersions', 'seedRandom', 'updState']);
const READONLY = new Set(['state', 'sysInfo', 'serverProps', 'hostLog', 'backupList', 'modCount', 'scan', 'checkCompat', 'storeSearch', 'worldsList', 'get247', 'pluginsList',
  'serverIconGet', 'permsGet', 'hybridVersions', 'seedRandom', 'updState', 'remoteInfo']);

module.exports = function createRemote(ctx) {   // ctx: { H, cfg, save, log, send, version, J, onCall }
  const { cfg, save, log } = ctx;
  const clients = new Set(), seen = new Map(), fails = new Map();
  let srv = null, nat = null, pub = { ip: null, t: 0 };

  const R = () => { const c = cfg(); if (!c.remote) c.remote = {}; return c.remote; };
  const key = () => { const r = R(); if (!r.key) { r.key = crypto.randomBytes(32).toString('hex'); save(); } return r.key; };
  const lanInfo = () => {   // la tarjeta de red de verdad (la del cable si hay): IP, máscara y MAC para despertar el PC
    const all = Object.entries(os.networkInterfaces()).flatMap(([name, l]) => (l || []).map(i => ({ ...i, name })))
      .filter(i => i.family === 'IPv4' && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00' && !/^169\.254\./.test(i.address));
    const virt = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Tailscale|ZeroTier|Hamachi|tun|tap|docker|vpn/i;
    const real = all.filter(i => !virt.test(i.name));
    const pick = real.find(i => /ethernet|eth|lan|cable|realtek|intel/i.test(i.name)) || real[0] || all[0];
    if (!pick) return null;
    const ip = pick.address.split('.').map(Number), mk = String(pick.netmask || '255.255.255.0').split('.').map(Number);
    return { ip: pick.address, mac: pick.mac.toUpperCase(), bcast: ip.map((b, i) => (b | (~mk[i] & 255))).join('.'), name: pick.name, wired: !/wi-?fi|wlan|wireless|inal/i.test(pick.name) };
  };
  async function publicIp(force) {
    if (!force && pub.ip && Date.now() - pub.t < 30 * 60e3) return pub.ip;
    try { pub = { ip: (await ctx.J('https://api.ipify.org?format=json')).ip, t: Date.now() }; } catch (e) { log('Móvil: sin IP pública (' + e.message + ')'); }
    return pub.ip;
  }
  const info = async () => {
    const l = lanInfo(), r = R(), ip = await publicIp();
    return { on: !!r.on, port: REMOTE_PORT, name: r.name || os.hostname(), lan: l && l.ip, mac: l && l.mac, bcast: l && l.bcast, wired: l ? l.wired : null, pub: ip, upnp: r.upnp || null, version: ctx.version, look: cfg().look || {}, devices: (r.devices || []).map(d => ({ id: d.id, name: d.name, t: d.t, last: d.last || 0 })), prepared: r.prepared || null };
  };
  // lo que va dentro del QR de emparejamiento
  async function pairing() {
    const i = await info();
    return 'COMPASS1:' + Buffer.from(JSON.stringify({ n: i.name, lan: i.lan && `${i.lan}:${REMOTE_PORT}`, pub: i.pub && `${i.pub}:${REMOTE_PORT}`, mac: i.mac, bc: i.bcast, k: key() })).toString('base64url');
  }

  // ----- firma de las peticiones -----
  const hmac = (msg) => crypto.createHmac('sha256', Buffer.from(key(), 'hex')).update(msg).digest('hex');
  function verify(req, u, body) {
    const t = +u.searchParams.get('t'), n = String(u.searchParams.get('n') || ''), s = String(u.searchParams.get('s') || '');
    if (!t || !/^[\w-]{8,40}$/.test(n) || !/^[0-9a-f]{64}$/.test(s)) return false;
    if (Math.abs(Date.now() - t) > 5 * 60e3) return false;   // hora del móvil muy distinta: se rechaza
    if (seen.has(n)) return false;
    const exp = hmac(`${t}\n${n}\n${req.method}\n${u.pathname}\n${body || ''}`);
    if (!crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(s))) return false;
    seen.set(n, Date.now()); if (seen.size > 5000) { const lim = Date.now() - 6 * 60e3; for (const [k, v] of seen) if (v < lim) seen.delete(k); }
    return true;
  }
  const ipOf = req => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  function blocked(ip) { const f = fails.get(ip); return f && f.n >= 20 && Date.now() - f.t < 10 * 60e3; }
  function failed(ip) { const f = fails.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 10 * 60e3) f.n = 0; f.n++; f.t = Date.now(); fails.set(ip, f); }

  function out(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  async function handle(req, res) {
    const u = new URL(req.url, 'http://x'), ip = ipOf(req);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    if (u.pathname === '/hello') return out(res, 200, { app: 'compass', v: 1, name: R().name || os.hostname(), version: ctx.version });
    if (blocked(ip)) return out(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    let body = '';
    if (req.method === 'POST') { for await (const c of req) { body += c; if (body.length > 2e6) return out(res, 413, { error: 'Demasiado grande' }); } }
    if (!verify(req, u, body)) { failed(ip); return out(res, 401, { error: 'Este móvil no está emparejado (o la hora del móvil no es correcta). Vuelve a escanear el QR en Compass.' }); }
    const dev = String(u.searchParams.get('d') || '').slice(0, 40); touch(dev, req);

    if (u.pathname === '/events') {   // tiempo real: estado del servidor, consola y cambios
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write('retry: 3000\n\n');
      const c = { res, dev }; clients.add(c);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(c); ctx.send('remoteClients', clients.size); });
      ctx.send('remoteClients', clients.size);
      try { emit(c, 'host', await ctx.H.state().then(s => s.host)); } catch {}
      return;
    }
    if (u.pathname === '/info') return out(res, 200, await info());
    if (u.pathname === '/call' && req.method === 'POST') {
      let j; try { j = JSON.parse(body); } catch { return out(res, 400, { error: 'Petición mal formada' }); }
      const fn = String(j.fn || ''), args = Array.isArray(j.args) ? j.args : [];
      if (fn === 'pcPower') { try { await pcPower(args[0]); return out(res, 200, { ok: true, r: null }); } catch (e) { return out(res, 500, { error: e.message }); } }
      if (!ALLOWED.has(fn)) return out(res, 403, { error: 'Eso no se puede hacer desde el móvil' });
      if (args.some(a => a && typeof a === 'object' && a.kind && a.kind !== 'server')) return out(res, 403, { error: 'Desde el móvil solo se tocan los servidores' });
      try {
        const r = await ctx.H[fn](...args);
        if (!READONLY.has(fn)) { ctx.send('remoteChanged', { fn, args }); broadcast('changed', { fn, from: 'movil' }); }
        return out(res, 200, { ok: true, r: r === undefined ? null : r });
      } catch (e) { return out(res, 500, { error: String(e && e.message || e) }); }
    }
    out(res, 404, { error: 'No existe' });
  }
  function touch(dev, req) {
    if (!dev) return;
    const r = R(); r.devices = r.devices || [];
    let d = r.devices.find(x => x.id === dev);
    const name = String(new URL(req.url, 'http://x').searchParams.get('dn') || '').slice(0, 40);
    if (!d) { d = { id: dev, name: name || 'Móvil', t: Date.now() }; r.devices.push(d); ctx.send('remoteDevices', null); }
    if (name && d.name !== name) d.name = name;
    if (Date.now() - (d.last || 0) > 60e3) { d.last = Date.now(); save(); }
  }
  async function pcPower(what) {
    const { spawn } = require('child_process');
    const run = (cmd, a) => spawn(cmd, a, { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    if (what === 'shutdown') { ctx.toast('El móvil ha pedido apagar el PC: se apaga en 60 segundos (puedes cancelarlo desde el móvil o con «shutdown /a»).', 'warn'); run('shutdown', ['/s', '/t', '60', '/c', 'Compass Launcher: apagado pedido desde el móvil']); }
    else if (what === 'restart') { ctx.toast('El móvil ha pedido reiniciar el PC: se reinicia en 60 segundos.', 'warn'); run('shutdown', ['/r', '/t', '60', '/c', 'Compass Launcher: reinicio pedido desde el móvil']); }
    else if (what === 'cancel') run('shutdown', ['/a']);
    else throw new Error('Acción no válida');
  }

  const emit = (c, ev, data) => { try { c.res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };
  function broadcast(ev, data) { if (clients.size) for (const c of clients) emit(c, ev, data); }

  async function start() {
    if (srv) return;
    key();
    srv = http.createServer((q, s) => handle(q, s).catch(e => { try { out(s, 500, { error: e.message }); } catch {} }));
    srv.on('error', e => { log('Móvil: ' + e.message); ctx.toast(`No puedo usar el puerto ${REMOTE_PORT} para el móvil: ${e.code === 'EADDRINUSE' ? 'otro programa lo está usando' : e.message}`, 'warn'); try { srv.close(); } catch {} srv = null; });
    await new Promise(res => srv.listen(REMOTE_PORT, '0.0.0.0', res));
    log(`Móvil: control remoto escuchando en el puerto ${REMOTE_PORT}`);
    router().catch(() => {});
    publicIp(true).catch(() => {});
  }
  async function router() {   // abre solo el puerto en el router (UPnP), y el UDP 9 para despertar el PC desde fuera
    const r = R();
    try {
      const { default: NatAPI } = await import('@silentbot1/nat-api');
      nat = new NatAPI({ enablePMP: true, enableUPNP: true, upnpPermanentFallback: true, ttl: 7200 });
      await nat.map({ publicPort: REMOTE_PORT, privatePort: REMOTE_PORT, protocol: 'TCP', description: 'Compass Launcher (móvil)' });
      let wol = false; try { await nat.map({ publicPort: 9, privatePort: 9, protocol: 'UDP', description: 'Compass Launcher (encender PC)' }); wol = true; } catch {}
      r.upnp = { ok: true, wol, t: Date.now() };
    } catch (e) { r.upnp = { ok: false, error: String(e.message || e).slice(0, 160), t: Date.now() }; log('Móvil: el router no abre el puerto solo: ' + e.message); }
    save(); ctx.send('remoteDevices', null);
  }
  async function stop() {
    for (const c of clients) try { c.res.end(); } catch {}
    clients.clear();
    if (srv) { try { srv.close(); } catch {} srv = null; }
    if (nat) { try { await nat.unmap(REMOTE_PORT); } catch {} try { await nat.destroy(); } catch {} nat = null; }
  }
  return { start, stop, broadcast, info, pairing, key, lanInfo, publicIp, READONLY, ALLOWED, clients: () => clients.size, REMOTE_PORT,
    newKey: () => { const r = R(); r.key = crypto.randomBytes(32).toString('hex'); r.devices = []; save(); for (const c of clients) try { c.res.end(); } catch {} clients.clear(); } };
};
module.exports.REMOTE_PORT = REMOTE_PORT;
