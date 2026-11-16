'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), http = require('http'), net = require('net'), dns = require('dns');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const AdmZip = require('adm-zip');
const { Client } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const compat = require('./modcompat');
const WM = require('./worldmap');

const UA = 'CompassLauncher/' + require('./package.json').version + ' (amigos)';
if (process.platform === 'win32') app.setAppUserModelId('es.compas.launcher');   // barra de tareas y avisos de Windows: Compass Launcher, no Electron
const SYNC_PORT = 8765, GAME_PORT = 25565;
let minimizedForGame = false;
let win, tray = null, quitting = false, mcAuth = null, loginP = null, syncSrv = null, playitProc = null, nat = null;
let gameState = 'idle';
let run = null;          // servidor en marcha (solo puede haber uno): { id, proc, state, players, share, ip, note, ... }
let srvLines = [];       // últimas líneas de la consola del servidor

// ---------- utilidades ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
const enc = encodeURIComponent;
const uid = () => crypto.randomBytes(4).toString('hex');
const gbOf = r => parseInt(r) || 4;
const stamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const U = () => app.getPath('userData');
const ROOT = () => path.join(U(), 'instance');          // Minecraft compartido: versiones, librerías y recursos
const CFGF = () => path.join(U(), 'config.json');
const DEFAULTS = { ram: '4G', profiles: [], servers: [], active: null, fabric: {}, v: 0 };

// ---------- configuración (un solo objeto en memoria, guardado atómico) ----------
let CFG = null;
function cfg() {
  if (!CFG) { try { CFG = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CFGF(), 'utf8')) }; } catch { CFG = { ...DEFAULTS, profiles: [], servers: [], fabric: {} }; } }
  return CFG;
}
function save() {
  fs.mkdirSync(U(), { recursive: true });
  const tmp = CFGF() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg(), null, 2));
  fs.renameSync(tmp, CFGF());
}
const prof = id => cfg().profiles.find(p => p.id === id);
const srv = id => cfg().servers.find(s => s.id === id);
const pdir = p => path.join(U(), p.dir);
const sdir = s => path.join(U(), s.dir);
function tgt(t) {   // {kind, id} → carpeta de mods, versión y entorno
  if (t && t.kind === 'server') {
    const s = srv(t.id); if (!s) throw new Error('Servidor no encontrado');
    return { kind: 'server', id: s.id, name: s.name, mc: s.mc, dir: sdir(s), mods: path.join(sdir(s), 'mods'), plugins: path.join(sdir(s), 'plugins'), env: 'server', type: s.type || 'fabric' };
  }
  const p = prof(t && t.id); if (!p) throw new Error('Perfil no encontrado');
  return { kind: 'profile', id: p.id, name: p.name, mc: p.mc, dir: pdir(p), mods: path.join(pdir(p), 'mods'), env: 'client' };
}
const okIcon = d => typeof d === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(d) && d.length < 400 * 1024;
const ctxOf = t => ({ mc: t.mc, loader: (cfg().fabric[t.mc] || {}).loader, env: t.env });

function migrate() {   // pasa la configuración antigua (una sola instancia) al modelo de perfiles + servidores
  const c = cfg();
  if (c.v >= 3) return;
  const mc = c.mc || null, ram = c.ram || '4G';
  if (!c.profiles.length) {
    c.profiles.push({ id: 'main', name: 'Principal', kind: 'local', mc, ram, dir: 'instance' });
    c.active = 'main';
    if (c.invite && c.server) {
      const id = uid();
      c.profiles.push({ id, name: 'Servidor de amigo', kind: 'friend', mc, ram, dir: 'profiles/' + id, invite: c.invite, server: c.server, autoJoin: c.autoJoin !== false, managed: [] });
      c.active = id;
    }
  }
  if (!c.servers.length && fs.existsSync(path.join(U(), 'server')))
    c.servers.push({ id: 'main', name: 'Mi servidor', mc, ram, dir: 'server', mode: 'online', autoRestart: false });
  for (const k of ['mc', 'server', 'invite', 'versionId', 'autoJoin']) delete c[k];
  c.v = 3; save();
}

let remote = null;   // control desde el móvil (remote.js): lo que pasa en el servidor también le llega al móvil al momento
const REMOTE_CH = new Set(['host', 'srvlog', 'upd']);
const send = (ch, d) => { if (win && !win.isDestroyed()) win.webContents.send(ch, d); if (remote && REMOTE_CH.has(ch)) remote.broadcast(ch, d); };
// registro en archivo (antes iba a una consola dentro del launcher): Ajustes, Registro, lo abre
const LOGF = () => path.join(U(), 'launcher.log');
let logStream = null, logBytes = 0;
function log(m) {
  try {
    if (!logStream) {
      fs.mkdirSync(U(), { recursive: true });
      try { if (fs.statSync(LOGF()).size > 2 * 2 ** 20) fs.renameSync(LOGF(), path.join(U(), 'launcher.old.log')); } catch {}
      logStream = fs.createWriteStream(LOGF(), { flags: 'a' });
      logStream.on('error', () => {});
      logStream.write(`\n===== Compass Launcher ${app.getVersion()} · ${new Date().toLocaleString('es')} =====\n`);
    }
    if (logBytes > 8 * 2 ** 20) return;   // tope por sesión para que no crezca sin fin
    const t = new Date().toTimeString().slice(0, 8), line = String(m).split(/\r?\n/).filter(Boolean).map(x => `[${t}] ${x}`).join('\n') + '\n';
    logBytes += line.length; logStream.write(line);
  } catch {}
}
const toast = (msg, type = 'info') => { log(`[aviso ${type}] ${msg}`); send('toast', { msg, type }); };
let lastProg = 0;
const prog = (label, pct) => {
  const now = Date.now();
  if (pct <= 0 || pct >= 100 || now - lastProg > 80) { lastProg = now; send('progress', { label, pct: Math.max(0, Math.min(100, Math.round(pct))) }); }
};
const setGame = (state, extra = {}) => { gameState = state; send('game', { state, ...extra }); };
const hostView = () => run
  ? { id: run.id, state: run.state, players: run.players, share: run.share, ip: run.ip, note: run.note, startedAt: run.startedAt || null }
  : { id: null, state: 'off', players: [], share: null, ip: null, note: '', startedAt: null };
const pushHost = () => send('host', hostView());
const hset = patch => { if (run) { Object.assign(run, patch); pushHost(); } };
function srvOut(t) {
  send('srvlog', t);
  for (const l of String(t).split(/\r?\n/)) if (l) srvLines.push(l);
  if (srvLines.length > 900) srvLines = srvLines.slice(-700);
}

// ---------- red: timeouts, mensajes claros, descargas con progreso ----------
async function get(u, o = {}) {
  const { timeout = 20000, signal, ...rest } = o;
  const sig = timeout ? (signal ? AbortSignal.any([AbortSignal.timeout(timeout), signal]) : AbortSignal.timeout(timeout)) : signal;
  try {
    return await fetch(u, { ...rest, signal: sig, headers: { 'User-Agent': UA, ...(rest.headers || {}) } });
  } catch (e) {
    let host = u; try { host = new URL(u).hostname; } catch {}
    throw new Error(e.name === 'TimeoutError' ? `Tiempo de espera agotado con ${host}` : signal && signal.aborted ? `La descarga se quedó parada (${host})` : `Sin conexión con ${host}`);
  }
}
const J = async (u, o) => { const r = await get(u, o); if (!r.ok) throw new Error(`Error ${r.status} en ${u}`); return r.json(); };
// Si una descarga se queda parada (sin recibir nada en 40 s) se corta y se reintenta, en vez de esperar
// minutos y minutos: así pasaba a veces con Java, que parecía que «no descargaba».
async function dl(u, f, label, tries = 3) {
  for (let a = 1; ; a++) {
    const ac = new AbortController(); let idle = null;
    const kick = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(), 40000); };
    try {
      kick();
      const r = await get(u, { timeout: 0, signal: ac.signal });
      if (!r.ok) throw new Error(`Error ${r.status} en ${u}`);
      const total = +r.headers.get('content-length') || 0;
      let got = 0;
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const rs = Readable.fromWeb(r.body);
      rs.on('data', c => { kick(); got += c.length; if (label && total) prog(label, got / total * 100); });
      await pipeline(rs, fs.createWriteStream(f + '.part'));
      if (total && fs.statSync(f + '.part').size !== total) throw new Error('Descarga cortada: ' + path.basename(f));
      fs.renameSync(f + '.part', f);
      return;
    } catch (e) {
      try { fs.unlinkSync(f + '.part'); } catch {}
      if (ac.signal.aborted) e = new Error('La descarga se quedó parada: ' + path.basename(f));
      if (a >= tries) throw e;
      await sleep(900 * a);
    } finally { clearTimeout(idle); }
  }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const hcache = new Map();
async function sha1(f) {
  const st = fs.statSync(f), k = f + '|' + st.size + '|' + st.mtimeMs;
  if (hcache.has(k)) return hcache.get(k);
  const h = await new Promise((res, rej) => {
    const x = crypto.createHash('sha1');
    fs.createReadStream(f).on('data', d => x.update(d)).on('end', () => res(x.digest('hex'))).on('error', rej);
  });
  hcache.set(k, h); return h;
}
const runCmd = (cmd, args) => new Promise((res, rej) => {
  let err = ''; const p = spawn(cmd, args, { windowsHide: true });
  p.stderr.on('data', d => err += d); p.on('error', rej);
  p.on('exit', c => c === 0 ? res() : rej(new Error(err.trim() || `${cmd} falló (${c})`)));
});

// ---------- mods: lectura local, caché de Modrinth y compatibilidad ----------
const MCF = () => path.join(U(), 'modcache.json');
let modCache = null;
const mcache = () => modCache || (modCache = (() => { try { return JSON.parse(fs.readFileSync(MCF(), 'utf8')); } catch { return {}; } })());
const saveMcache = () => { try { fs.writeFileSync(MCF(), JSON.stringify(modCache)); } catch {} };
const isMod = f => /\.jar(\.disabled)?$/.test(f);
const metaCache = new Map();
function metaOf(file, sha) {
  if (metaCache.has(sha)) return metaCache.get(sha);
  let m = null; try { m = compat.readMeta(file); } catch {}
  metaCache.set(sha, m); return m;
}
async function listLocal(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (const file of fs.readdirSync(dir).filter(isMod)) {
    const p = path.join(dir, file);
    out.push({ file, enabled: file.endsWith('.jar'), sha1: await sha1(p), size: fs.statSync(p).size });
  }
  return out;
}
async function scanMods(dir) {
  const items = await listLocal(dir), C = mcache();
  const miss = items.filter(i => !C[i.sha1] || (!C[i.sha1].full && !C[i.sha1].none));
  if (miss.length) {
    try {
      const vers = await J('https://api.modrinth.com/v2/version_files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: [...new Set(miss.map(i => i.sha1))], algorithm: 'sha1' }),
      });
      const ids = [...new Set(Object.values(vers).map(v => v.project_id))], projs = {};
      if (ids.length) (await J('https://api.modrinth.com/v2/projects?ids=' + enc(JSON.stringify(ids)))).forEach(p => projs[p.id] = p);
      for (const i of miss) {
        const v = vers[i.sha1]; if (!v) { C[i.sha1] = { ...C[i.sha1], none: 1 }; continue; }
        const p = projs[v.project_id], f = v.files.find(x => x.hashes.sha1 === i.sha1) || v.files[0];
        C[i.sha1] = { ...C[i.sha1], full: 1, projectId: v.project_id, title: p && p.title, icon: p && p.icon_url, desc: p && p.description, url: f && f.url, ver: v.version_number };
      }
      saveMcache();
    } catch (e) { log('Modrinth no respondió: ' + e.message); }
  }
  return items.map(i => {
    const c = C[i.sha1] || {}, m = metaOf(path.join(dir, i.file), i.sha1);
    return { ...i, title: c.title || (m && m.name) || i.file.replace(/\.jar(\.disabled)?$/, ''), icon: c.icon, desc: c.desc, url: c.url,
             projectId: c.projectId, ver: c.ver || (m && m.version), env: m ? m.env : '*', mid: m && m.id };
  });
}
async function issuesOf(t) {   // problemas de compatibilidad de un perfil o servidor (solo mods activados)
  const items = (await listLocal(t.mods)).filter(i => i.enabled);
  return compat.check(items.map(i => ({ file: i.file, meta: metaOf(path.join(t.mods, i.file), i.sha1) })), ctxOf(t));
}
async function installedIds(dir) {
  const C = mcache();
  return new Set((await listLocal(dir)).map(i => C[i.sha1] && C[i.sha1].projectId).filter(Boolean));
}

// ---------- Modrinth: instalar, resolver dependencias y arreglar conflictos ----------
const MR = 'https://api.modrinth.com/v2';
const projectVersions = (id, mc) => J(`${MR}/project/${enc(id)}/version?loaders=${enc('["fabric"]')}&game_versions=${enc(JSON.stringify([mc]))}`);
const pickVer = vs => vs.find(v => v.version_type === 'release') || vs[0];   // mejor una versión estable que una beta
const primary = v => v.files.find(f => f.primary) || v.files[0];

async function mrInstall(idOrSlug, t, done = new Set(), versionId = null) {   // devuelve true si instaló algo
  let v;
  if (versionId) v = await J(`${MR}/version/${versionId}`);
  else { v = pickVer(await projectVersions(idOrSlug, t.mc)); if (!v) throw new Error(`No hay versión de «${idOrSlug}» para Minecraft ${t.mc}`); }
  if (done.has(v.project_id)) return false;
  done.add(v.project_id);
  const f = primary(v);
  if ((await installedIds(t.mods)).has(v.project_id)) return false;   // ya está: no duplicar jamás
  log('Instalando ' + f.filename);
  const dest = path.join(t.mods, f.filename);
  await dl(f.url, dest, 'Instalando ' + f.filename);
  mcache()[f.hashes.sha1] = { projectId: v.project_id, ver: v.version_number, url: f.url };
  for (const d of v.dependencies || [])
    if (d.dependency_type === 'required' && d.project_id) {
      try { await mrInstall(d.project_id, t, done, d.version_id || null); } catch (e) { log('Dependencia omitida: ' + e.message); }
    }
  return true;
}
// ---------- dependencias: leer lo que pide cada mod (fabric.mod.json) y bajarlo solo ----------
// El id de un mod no siempre coincide con su nombre en Modrinth, así que se prueban varios
// candidatos y se comprueba DENTRO del .jar descargado que de verdad es el mod que se pide.
const DEP_ALIAS = { fabric: 'fabric-api', 'cloth-config2': 'cloth-config', cloth_config: 'cloth-config', architectury: 'architectury-api',
  yet_another_config_lib_v3: 'yacl', yet_another_config_lib: 'yacl', owo: 'owo-lib', geckolib3: 'geckolib', forgeconfigapiport: 'forge-config-api-port',
  puzzleslib: 'puzzles-lib', resourcefullib: 'resourceful-lib', 'cardinal-components': 'cardinal-components-api', placeholder_api: 'placeholder-api',
  'collective': 'collective', 'kotlinforforge': 'kotlin-for-forge', fzzy_config: 'fzzy-config', sodium: 'sodium', iris: 'iris', lithium: 'lithium' };
const depCandidates = dep => {
  const l = [DEP_ALIAS[dep], /^fabric(-|_)/.test(dep) && !/kotlin|language/.test(dep) ? 'fabric-api' : null, dep, dep.replace(/_/g, '-')];
  return [...new Set(l.filter(Boolean))];
};
const metaHas = (m, dep) => !!m && (m.id === dep || m.provides.includes(dep) || m.nested.some(n => metaHas(n, dep)));
async function installDep(dep, t) {   // true si ha instalado algo que da «dep»
  const tmp = path.join(U(), 'tmp'), tried = new Set(), have = await installedIds(t.mods);
  fs.mkdirSync(tmp, { recursive: true });
  const tryProj = async id => {
    if (!id || tried.has(id)) return false; tried.add(id);
    let v; try { v = pickVer(await projectVersions(id, t.mc)); } catch { return false; }
    if (!v || have.has(v.project_id)) return false;
    const f = primary(v), tf = path.join(tmp, f.filename);
    try {
      await dl(f.url, tf, 'Descargando ' + f.filename);
      if (!metaHas(compat.readMeta(tf), dep)) return false;
      fs.copyFileSync(tf, path.join(t.mods, f.filename));
      mcache()[f.hashes.sha1] = { projectId: v.project_id, ver: v.version_number, url: f.url }; saveMcache();
      log(`Dependencia «${dep}» → ${f.filename}`);
      for (const d of v.dependencies || [])
        if (d.dependency_type === 'required' && d.project_id) { try { await mrInstall(d.project_id, t, new Set([v.project_id]), d.version_id || null); } catch {} }
      return true;
    } catch { return false; } finally { try { fs.unlinkSync(tf); } catch {} }
  };
  for (const c of depCandidates(dep)) if (await tryProj(c)) return true;
  try {   // último recurso: buscarlo por nombre en Modrinth
    const facets = JSON.stringify([['project_type:mod'], ['categories:fabric'], [`versions:${t.mc}`]]);
    const r = await J(`${MR}/search?query=${enc(dep.replace(/[-_]/g, ' '))}&facets=${enc(facets)}&limit=5`);
    for (const h of r.hits || []) if (await tryProj(h.project_id)) return true;
  } catch {}
  return false;
}
async function resolveDeps(t, quiet) {   // instala todo lo que falte, aunque una dependencia pida otra
  const got = [], failed = new Set();
  try { await scanMods(t.mods); } catch {}
  for (let round = 0; round < 6; round++) {
    const miss = [...new Set((await issuesOf(t)).filter(i => i.type === 'missing').map(i => i.dep))].filter(d => !failed.has(d));
    if (!miss.length) break;
    let any = false;
    for (const dep of miss) { if (await installDep(dep, t)) { got.push(dep); any = true; } else failed.add(dep); }
    if (!any) break;
  }
  prog('', 0);
  if (got.length && !quiet) toast('Instalado lo que necesitaban tus mods: ' + got.join(', '), 'ok');
  return got;
}

// Cambia un mod que se ha quedado viejo (p. ej. Fabric Language Kotlin) por la última versión para este Minecraft.
async function upgradeDep(dep, t, keep = []) {
  const items = (await listLocal(t.mods)).filter(i => i.enabled);
  const olds = items.filter(i => { const m = metaOf(path.join(t.mods, i.file), i.sha1); return m && (m.id === dep || m.provides.includes(dep)); });
  if (!olds.length) return installDep(dep, t);
  if (olds.some(o => keep.includes(o.file))) return false;   // es un mod del servidor: no se toca (lo tiene que cambiar el anfitrión)
  const bak = path.join(U(), 'tmp', 'viejo-' + uid()); fs.mkdirSync(bak, { recursive: true });
  for (const o of olds) fs.renameSync(path.join(t.mods, o.file), path.join(bak, o.file));
  let ok = false; try { ok = await installDep(dep, t); } catch {}
  for (const o of olds) { const f = path.join(bak, o.file); if (ok) { try { fs.unlinkSync(f); } catch {} } else fs.renameSync(f, path.join(t.mods, o.file)); }
  try { fs.rmSync(bak, { recursive: true, force: true }); } catch {}
  return ok;
}
// Lee lo que dice Fabric cuando no arranca por los mods y saca qué falta o qué hay que actualizar.
function fabricFail(text) {
  if (!/incompatible mod set|Incompatible mods found|some of your mods are incompatible|ModResolutionException|Mod resolution (failed|encountered)/i.test(text)) return null;
  const need = new Map(), lines = [];
  const add = (id, how) => { if (id && !compat.BUILTIN.has(id) && !need.has(id)) need.set(id, how); };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/^\s*(\[[^\]]*\]\s*)*(\w+:)?\s*/, '').trim(); let m;
    if ((m = /^-\s*Install ([\w.\-]+)/i.exec(l))) add(m[1], 'install');
    if ((m = /Replace mod '.*?' \(([\w.\-]+)\)/i.exec(l))) add(m[1], 'upgrade');
    if ((m = /of mod '.*?' \(([\w.\-]+)\), which is missing/i.exec(l)) || (m = /requires (?:any version|version .*?) of ([\w.\-]+), which is missing/i.exec(l))) add(m[1], 'install');
    if ((m = /of mod '.*?' \(([\w.\-]+)\), but only the wrong version is present/i.exec(l)) || (m = /requires (?:version .*?) of ([\w.\-]+), but only the wrong version/i.exec(l))) add(m[1], 'upgrade');
    if (/^-\s*(Mod|Install|Replace|Remove)/i.test(l) && lines.length < 8) lines.push(l.replace(/^-\s*/, ''));
  }
  return { need, lines };
}
async function repairFabric(p, t, info) {
  const fixed = [], failed = [];
  for (const [dep, how] of info.need) {
    let ok = false;
    // en tu propio servidor tú eres el anfitrión: la dependencia se actualiza en tu perfil y se recuerda,
    // para que al volver a copiar los mods del servidor no se vuelva a poner la vieja
    try { ok = how === 'upgrade' ? await upgradeDep(dep, t, p.own ? [] : (p.managed || [])) : await installDep(dep, t); } catch {}
    if (ok && p.own) { p.keepMine = [...new Set([...(p.keepMine || []), dep])]; p.managed = (p.managed || []).filter(f => fs.existsSync(path.join(t.mods, f))); }
    (ok ? fixed : failed).push(dep);
  }
  try { await resolveDeps(t, true); } catch {}
  // si lo que falla es el zoom o la vista libre que pone Compass, se quitan de este perfil y no se vuelven a poner
  if (failed.length || !info.need.size) {
    const txt = info.lines.join('\n').toLowerCase();
    for (const [k, X] of Object.entries(EXTRAS)) {
      const files = p[X.field] || [];
      if (!files.length) continue;
      const items = await listLocal(t.mods), ids = items.filter(i => files.includes(i.file)).map(i => (metaOf(path.join(t.mods, i.file), i.sha1) || {}).id).filter(Boolean);
      if (ids.some(id => txt.includes('(' + id.toLowerCase() + ')') || txt.includes(' ' + id.toLowerCase() + ','))) {
        for (const f of files) try { fs.unlinkSync(path.join(t.mods, f)); } catch {}
        delete p[X.field]; p.extraOff = [...new Set([...(p.extraOff || []), k])]; fixed.push('quitado ' + X.label.toLowerCase());
      }
    }
    save();
  }
  prog('', 0);
  return { fixed, failed };
}

async function tryReplace(t, file, before, fixed) {   // prueba otras versiones de un mod hasta que haya menos conflictos
  const items = await listLocal(t.mods), cur = items.find(i => i.file === file && i.enabled);
  const info = cur && mcache()[cur.sha1];
  if (!info || !info.projectId) return false;
  let vs; try { vs = await projectVersions(info.projectId, t.mc); } catch { return false; }
  const tmp = path.join(U(), 'tmp'); fs.mkdirSync(tmp, { recursive: true });
  for (const v of vs.filter(v => !v.files.some(f => f.hashes.sha1 === cur.sha1)).slice(0, 8)) {
    const f = primary(v), tf = path.join(tmp, f.filename);
    try {
      await dl(f.url, tf);
      const others = items.filter(i => i.enabled && i.file !== file).map(i => ({ file: i.file, meta: metaOf(path.join(t.mods, i.file), i.sha1) }));
      const after = compat.check([...others, { file: f.filename, meta: compat.readMeta(tf) }], ctxOf(t));
      if (after.length < before) {
        fs.copyFileSync(tf, path.join(t.mods, f.filename));
        if (f.filename !== file) fs.unlinkSync(path.join(t.mods, file));
        mcache()[f.hashes.sha1] = { projectId: info.projectId, title: info.title, icon: info.icon, desc: info.desc, url: f.url, ver: v.version_number, full: 1 };
        saveMcache();
        fixed.push(`${info.title || file}: ${info.ver || '?'} → ${v.version_number}`);
        return true;
      }
    } catch {} finally { try { fs.unlinkSync(tf); } catch {} }
  }
  return false;
}
async function autoFix(t) {
  const fixed = [];
  await scanMods(t.mods);
  for (let round = 0; round < 5; round++) {
    const issues = await issuesOf(t);
    if (!issues.length) break;
    let improved = false;
    if (issues.some(i => i.type === 'missing')) {
      const got = await resolveDeps(t, true);
      if (got.length) { got.forEach(d => fixed.push('Instalado ' + d)); continue; }
    }
    outer: for (const is of issues)
      for (const f of [is.other && is.other.file, is.mod && is.mod.file].filter(Boolean))
        if (await tryReplace(t, f, issues.length, fixed)) { improved = true; break outer; }
    if (!improved) break;
  }
  prog('', 0);
  return { fixed, remaining: await issuesOf(t) };
}

// ---------- Paper (servidores con plugins) ----------
async function paperJar(s, dir) {
  const v = s.mc;
  try {   // API nueva de PaperMC (Fill v3)
    const r = await J(`https://fill.papermc.io/v3/projects/paper/versions/${enc(v)}/builds`);
    const list = Array.isArray(r) ? r : (r.builds || []);
    const b = list.find(x => String(x.channel).toUpperCase() === 'STABLE') || list[0];
    const d = b && b.downloads && (b.downloads['server:default'] || Object.values(b.downloads)[0]);
    if (d && d.url) {
      const jar = path.join(dir, `paper-${v}-${b.id || b.build}.jar`);
      if (!fs.existsSync(jar)) await dl(d.url, jar, 'Descargando Paper ' + v);
      return jar;
    }
  } catch (e) { log('Paper (fill): ' + e.message); }
  let r;   // API antigua (v2)
  try { r = await J(`https://api.papermc.io/v2/projects/paper/versions/${enc(v)}/builds`); }
  catch { throw new Error(`Paper todavía no tiene Minecraft ${v}. Elige otra versión en Ajustes del servidor o usa Fabric.`); }
  const builds = r.builds || [], b = builds.filter(x => x.channel === 'default').pop() || builds.pop();
  if (!b) throw new Error(`Paper todavía no tiene Minecraft ${v}.`);
  const name = b.downloads.application.name, jar = path.join(dir, `paper-${v}-${b.build}.jar`);
  if (!fs.existsSync(jar)) await dl(`https://api.papermc.io/v2/projects/paper/versions/${enc(v)}/builds/${b.build}/downloads/${name}`, jar, 'Descargando Paper ' + v);
  return jar;
}
function pluginMeta(file) {   // lee plugin.yml / paper-plugin.yml sin librerías de YAML
  try {
    const z = new AdmZip(file), e = z.getEntry('plugin.yml') || z.getEntry('paper-plugin.yml'); if (!e) return null;
    const y = e.getData().toString('utf8').replace(/^﻿/, '');
    const line = k => new RegExp('^' + k + ':[ \\t]*(.*)$', 'm').exec(y);
    const get = k => { const m = line(k); return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : ''; };
    const list = k => {
      const m = line(k); if (!m) return [];
      const v = m[1].trim();
      if (v.startsWith('[')) return v.replace(/[\[\]'"]/g, '').split(',').map(x => x.trim()).filter(Boolean);
      if (v) return [v.replace(/['"]/g, '')];
      const out = [];
      for (const l of y.slice(m.index + m[0].length).split(/\r?\n/).slice(1)) { const mm = /^\s*-\s*(.+)$/.exec(l); if (mm) out.push(mm[1].trim().replace(/['"]/g, '')); else if (l.trim()) break; }
      return out;
    };
    let depend = list('depend');
    if (!depend.length && /paper-plugin\.yml$/.test(e.entryName)) {   // paper-plugin.yml: dependencies: server: Nombre: { required: true }
      const blk = /dependencies:\s*\n\s+server:\s*\n((?:\s{4,}.*\n?)*)/.exec(y);
      if (blk) { let cur = null; for (const l of blk[1].split('\n')) { const n = /^\s{4}(\S[^:]*):\s*$/.exec(l); if (n) cur = n[1]; else if (cur && /required:\s*true/.test(l)) depend.push(cur); } }
    }
    return { name: get('name'), version: get('version'), desc: get('description'), depend, soft: list('softdepend'), authors: get('author') || list('authors').join(', ') };
  } catch { return null; }
}
const pluginsDir = s => path.join(sdir(s), 'plugins');
async function pluginsList(s) {
  const d = pluginsDir(s); fs.mkdirSync(d, { recursive: true });
  const rec = storeRecs(sdir(s));
  const items = fs.readdirSync(d).filter(f => /\.jar(\.disabled)?$/i.test(f)).map(f => {
    const m = pluginMeta(path.join(d, f)) || {}, r = Object.values(rec).find(x => x.file === f) || {};
    return { file: f, enabled: !f.endsWith('.disabled'), name: m.name || r.title || f.replace(/\.jar(\.disabled)?$/i, ''), version: m.version || r.ver || '', desc: m.desc || r.desc || '', icon: r.icon || null, depend: m.depend || [], authors: m.authors || '' };
  });
  const have = new Set(items.filter(i => i.enabled).map(i => i.name.toLowerCase()));
  items.forEach(i => { i.missing = i.enabled ? i.depend.filter(x => !have.has(x.toLowerCase())) : []; });
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
const PLUGIN_LOADERS = ['paper', 'spigot', 'bukkit', 'purpur', 'folia'];
const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function installPlugin(s, pid, done = new Set()) {   // instala un plugin de Modrinth y sus dependencias obligatorias
  if (done.has(pid)) return false; done.add(pid);
  const vs = await J(`${MR}/project/${enc(pid)}/version?loaders=${enc(JSON.stringify(PLUGIN_LOADERS))}&game_versions=${enc(JSON.stringify([s.mc]))}`).catch(() => []);
  let v = pickVer(vs || []);
  if (!v) { const all = await J(`${MR}/project/${enc(pid)}/version?loaders=${enc(JSON.stringify(PLUGIN_LOADERS))}`).catch(() => []); v = pickVer(all || []); if (v) log(`Plugin ${pid}: no marca Minecraft ${s.mc}, uso la última (${v.version_number})`); }
  if (!v) throw new Error('Ese plugin no tiene versión para Paper');
  const f = primary(v), d = pluginsDir(s); fs.mkdirSync(d, { recursive: true });
  await dl(f.url, path.join(d, f.filename), 'Instalando ' + f.filename);
  let proj = {}; try { proj = await J(`${MR}/project/${enc(v.project_id)}`); } catch {}
  storeRec(sdir(s), v.project_id, { file: f.filename, kind: 'plugin', title: proj.title, icon: proj.icon_url, desc: proj.description, ver: v.version_number });
  for (const dep of v.dependencies || []) if (dep.dependency_type === 'required' && dep.project_id) { try { await installPlugin(s, dep.project_id, done); } catch (e) { log('Dependencia de plugin omitida: ' + e.message); } }
  return true;
}
async function resolvePluginDeps(s, quiet) {   // lee «depend:» de cada plugin y baja lo que falte
  const got = [], failed = new Set();
  for (let round = 0; round < 5; round++) {
    const miss = [...new Set((await pluginsList(s)).flatMap(p => p.missing))].filter(x => !failed.has(x.toLowerCase()));
    if (!miss.length) break;
    let any = false;
    for (const name of miss) {
      let ok = false;
      try {
        const facets = JSON.stringify([['project_type:plugin', 'project_type:mod'], PLUGIN_LOADERS.map(l => 'categories:' + l)]);
        const r = await J(`${MR}/search?query=${enc(name)}&facets=${enc(facets)}&limit=6`);
        const hits = (r.hits || []).sort((a, b) => (norm(b.title) === norm(name) || norm(b.slug) === norm(name)) - (norm(a.title) === norm(name) || norm(a.slug) === norm(name)));
        for (const h of hits.slice(0, 4)) {
          const before = new Set(fs.readdirSync(pluginsDir(s)));
          try { await installPlugin(s, h.project_id); } catch { continue; }
          if ((await pluginsList(s)).some(p => p.name.toLowerCase() === name.toLowerCase())) { ok = true; break; }
          for (const f of fs.readdirSync(pluginsDir(s))) if (!before.has(f)) { try { fs.unlinkSync(path.join(pluginsDir(s), f)); } catch {} }   // no era ese
        }
      } catch {}
      if (ok) { got.push(name); any = true; } else failed.add(name.toLowerCase());
    }
    if (!any) break;
  }
  prog('', 0);
  if (got.length && !quiet) toast('Instalados los plugins que hacían falta: ' + got.join(', '), 'ok');
  return got;
}

// ---------- tienda ampliada: shaders, resource packs, modpacks y plugins ----------
const storeRecF = dir => path.join(dir, 'compass-store.json');
const storeRecs = dir => { try { return JSON.parse(fs.readFileSync(storeRecF(dir), 'utf8')); } catch { return {}; } };
function storeRec(dir, pid, info) { const r = storeRecs(dir); r[pid] = { ...info, at: Date.now() }; try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(storeRecF(dir), JSON.stringify(r, null, 1)); } catch {} }
const KIND_DIR = { shader: 'shaderpacks', resourcepack: 'resourcepacks', plugin: 'plugins' };
const KIND_LOADERS = { shader: ['iris', 'optifine', 'canvas'], resourcepack: ['minecraft'], plugin: PLUGIN_LOADERS };
async function kindSearch(t, kind, q, sort, offset) {
  const facets = [];
  if (kind === 'plugin') facets.push(['project_type:plugin', 'project_type:mod'], PLUGIN_LOADERS.map(l => 'categories:' + l));
  else facets.push([`project_type:${kind}`]);
  if (kind === 'modpack') facets.push(['categories:fabric']);
  if (kind !== 'modpack') facets.push([`versions:${t.mc}`]);
  const idx = q ? (sort || 'relevance') : (sort && sort !== 'relevance' ? sort : 'downloads');
  const r = await J(`${MR}/search?query=${enc(q || '')}&facets=${enc(JSON.stringify(facets))}&limit=24&offset=${offset || 0}&index=${idx}`);
  const rec = storeRecs(t.dir), d = KIND_DIR[kind] && path.join(t.dir, KIND_DIR[kind]);
  const packs = kind === 'modpack' ? new Set(cfg().profiles.map(p => p.pack && p.pack.id).filter(Boolean)) : null;
  return { total: r.total_hits, items: r.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author,
    gallery: h.featured_gallery || (h.gallery && h.gallery[0]) || null, versions: (h.versions || []).slice(-3),
    installed: packs ? packs.has(h.project_id) : !!(rec[h.project_id] && d && fs.existsSync(path.join(d, rec[h.project_id].file))) })) };
}
async function kindInstall(t, kind, pid) {
  if (kind === 'modpack') { const p = await installModpack(pid); return { profile: p }; }
  if (kind === 'plugin') { const s = srv(t.id); if (!s) throw new Error('Los plugins van en un servidor'); await installPlugin(s, pid); await resolvePluginDeps(s); prog('', 0); return {}; }
  const L = KIND_LOADERS[kind];
  let vs = await J(`${MR}/project/${enc(pid)}/version?loaders=${enc(JSON.stringify(L))}&game_versions=${enc(JSON.stringify([t.mc]))}`).catch(() => []);
  if (!vs || !vs.length) vs = await J(`${MR}/project/${enc(pid)}/version?loaders=${enc(JSON.stringify(L))}`).catch(() => []);
  const v = pickVer(vs || []); if (!v) throw new Error('No hay ninguna versión descargable');
  const f = primary(v);
  let proj = {}; try { proj = await J(`${MR}/project/${enc(pid)}`); } catch {}
  if (kind === 'resourcepack' && t.kind === 'server') {   // en un servidor: se pone como pack del servidor, lo reciben todos al entrar
    const s = srv(t.id); setProps(s, { 'resource-pack': f.url, 'resource-pack-sha1': f.hashes.sha1 || '' });
    storeRec(t.dir, pid, { file: '', kind, title: proj.title, icon: proj.icon_url, url: f.url });
    return { serverPack: true };
  }
  const d = path.join(t.dir, KIND_DIR[kind]); fs.mkdirSync(d, { recursive: true });
  await dl(f.url, path.join(d, f.filename), 'Descargando ' + f.filename);
  storeRec(t.dir, pid, { file: f.filename, kind, title: proj.title, icon: proj.icon_url, ver: v.version_number });
  let extra = null;
  if (kind === 'shader' && t.kind === 'profile') {   // los shaders necesitan Iris (y Sodium)
    try { if (await mrInstall('iris', t)) extra = 'He instalado Iris para que funcionen los shaders.'; await resolveDeps(t, true); } catch (e) { log('Iris: ' + e.message); }
  }
  prog('', 0);
  return { extra };
}
async function installModpack(pid) {   // .mrpack de Modrinth → perfil nuevo con todo dentro
  const proj = await J(`${MR}/project/${enc(pid)}`);
  const v = pickVer(await J(`${MR}/project/${enc(pid)}/version?loaders=${enc('["fabric"]')}`));
  if (!v) throw new Error(`«${proj.title}» no tiene versión para Fabric`);
  const f = primary(v), tmp = path.join(U(), 'tmp'), zf = path.join(tmp, 'pack-' + uid() + '.mrpack');
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await dl(f.url, zf, 'Descargando ' + proj.title);
    const z = new AdmZip(zf), ie = z.getEntry('modrinth.index.json');
    if (!ie) throw new Error('Ese modpack no tiene el formato de Modrinth');
    const idx = JSON.parse(ie.getData().toString('utf8'));
    const deps = idx.dependencies || {}, mc = deps.minecraft;
    if (!deps['fabric-loader']) throw new Error('Solo se pueden instalar modpacks de Fabric');
    const id = uid(), p = { id, name: proj.title, kind: 'local', mc, ram: gbOf(cfg().ram) < 6 ? '6G' : cfg().ram, dir: 'profiles/' + id, icon: proj.icon_url || null, pack: { id: pid, version: v.version_number } };
    const root = pdir(p); fs.mkdirSync(path.join(root, 'mods'), { recursive: true });
    const safe = rel => { const out = path.resolve(root, rel); if (!out.startsWith(path.resolve(root) + path.sep)) throw new Error('Ruta rara en el modpack: ' + rel); return out; };
    const files = (idx.files || []).filter(x => !(x.env && x.env.client === 'unsupported'));
    let n = 0;
    await pool(files, 4, async x => {
      const out = safe(x.path); fs.mkdirSync(path.dirname(out), { recursive: true });
      await dl(x.downloads[0], out);
      if (x.hashes && x.hashes.sha1 && await sha1(out) !== x.hashes.sha1) throw new Error('Archivo dañado: ' + x.path);
      prog(`Instalando ${proj.title} (${++n}/${files.length})`, n / files.length * 100);
    });
    for (const e of z.getEntries()) {
      const m = /^(client-overrides|overrides)\/(.+)$/.exec(e.entryName);
      if (!m || e.isDirectory) continue;
      const out = safe(m[2]); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, e.getData());
    }
    cfg().profiles.push(p); cfg().active = p.id; save();
    log(`Modpack ${proj.title} ${v.version_number} instalado (${files.length} archivos)`);
    return p;
  } finally { prog('', 0); try { fs.unlinkSync(zf); } catch {} }
}

// ---------- CurseForge ----------
const CF = 'https://api.curseforge.com/v1';
async function cfGet(p) {
  const k = cfg().cfKey;
  if (!k) throw new Error('Falta tu clave de API de CurseForge (consíguela gratis en console.curseforge.com)');
  return J(CF + p, { headers: { 'x-api-key': k } });
}
async function cfPost(p, body) {
  const k = cfg().cfKey; if (!k) throw new Error('Falta tu clave de API de CurseForge');
  return J(CF + p, { method: 'POST', headers: { 'x-api-key': k, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
// Huella de CurseForge (murmur2, semilla 1, sin espacios ni saltos de línea): sirve para encontrar un .jar en su tienda
function cfFingerprint(buf) {
  const d = buf.filter(x => x !== 9 && x !== 10 && x !== 13 && x !== 32), M = 0x5bd1e995;
  let len = d.length, h = (1 ^ len) >>> 0, i = 0;
  while (len >= 4) {
    let k = d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24);
    k = Math.imul(k, M); k ^= k >>> 24; k = Math.imul(k, M);
    h = Math.imul(h, M) ^ k; i += 4; len -= 4;
  }
  if (len === 3) h ^= d[i + 2] << 16;
  if (len >= 2) h ^= d[i + 1] << 8;
  if (len >= 1) { h ^= d[i]; h = Math.imul(h, M); }
  h ^= h >>> 13; h = Math.imul(h, M); h ^= h >>> 15;
  return h >>> 0;
}
async function cfLookup(fps) {   // huellas → enlace de descarga (o null si el autor no deja descargar fuera)
  const out = new Map(); if (!fps.length) return out;
  const r = await cfPost('/fingerprints', { fingerprints: fps });
  for (const m of (r.data && r.data.exactMatches) || []) if (m.file) out.set(m.file.fileFingerprint >>> 0, m.file.downloadUrl || null);
  return out;
}
async function cfResolve(dir, items) {   // anfitrión: busca en CurseForge los mods que no están en Modrinth
  const C = mcache(); let ch = false;
  for (const i of items) { const c = C[i.sha1] || (C[i.sha1] = {}); if (c.fp == null) { try { c.fp = cfFingerprint(fs.readFileSync(path.join(dir, i.file))); ch = true; } catch {} } }
  if (cfg().cfKey) {
    const ask = items.map(i => C[i.sha1]).filter(c => c && c.fp != null && !c.cfChecked);
    if (ask.length) { const found = await cfLookup(ask.map(c => c.fp)); for (const c of ask) { c.cfChecked = 1; const u = found.get(c.fp); if (u) c.cfUrl = u; } ch = true; }
  }
  if (ch) saveMcache();
}
async function cfSearch(t, q, sort, offset) {
  const field = { downloads: 6, updated: 3, newest: 11, relevance: 2 }[sort] || 2;
  const r = await cfGet(`/mods/search?gameId=432&classId=6&gameVersion=${enc(t.mc)}&modLoaderType=4&pageSize=24&index=${offset || 0}&sortField=${field}&sortOrder=desc` + (q ? `&searchFilter=${enc(q)}` : ''));
  return { total: r.pagination ? r.pagination.totalCount : r.data.length, items: r.data.map(m => ({ id: String(m.id), title: m.name, desc: m.summary,
    icon: m.logo && m.logo.thumbnailUrl, downloads: m.downloadCount, author: m.authors && m.authors[0] && m.authors[0].name })) };
}
async function cfInstall(modId, t, done = new Set()) {
  if (done.has(String(modId))) return;
  done.add(String(modId));
  const r = await cfGet(`/mods/${modId}/files?gameVersion=${enc(t.mc)}&modLoaderType=4&pageSize=20`);
  const files = r.data.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate));
  const f = files.find(x => x.releaseType === 1) || files[0];
  if (!f) throw new Error('No hay archivo para Minecraft ' + t.mc);
  if (!f.downloadUrl) {
    const m = (await cfGet(`/mods/${modId}`)).data;
    toast(`"${m.name}" no permite descargas externas: se abre su página`, 'warn');
    if (m.links && m.links.websiteUrl) shell.openExternal(m.links.websiteUrl + '/files');
    return;
  }
  const dest = path.join(t.mods, path.basename(f.fileName));
  log('Instalando ' + f.fileName);
  await dl(f.downloadUrl, dest, 'Instalando ' + f.fileName);
  const h = (f.hashes || []).find(x => x.algo === 1);
  if (h && await sha1(dest) !== h.value) { fs.unlinkSync(dest); throw new Error('Hash incorrecto en ' + f.fileName); }
  for (const d of f.dependencies || [])
    if (d.relationType === 3) { try { await cfInstall(d.modId, t, done); } catch (e) { log('Dependencia omitida: ' + e.message); } }
}
async function mrSearch(t, q, sort, offset) {
  const facets = JSON.stringify([['project_type:mod'], [`versions:${t.mc}`], ['categories:fabric']]);
  const idx = q ? (sort || 'relevance') : (sort && sort !== 'relevance' ? sort : 'downloads');
  const r = await J(`${MR}/search?query=${enc(q || '')}&facets=${enc(facets)}&limit=24&offset=${offset || 0}&index=${idx}`);
  await scanMods(t.mods);
  const have = await installedIds(t.mods);
  return { total: r.total_hits, items: r.hits.map(h => ({ id: h.project_id, title: h.title, desc: h.description, icon: h.icon_url,
    downloads: h.downloads, author: h.author, installed: have.has(h.project_id) })) };
}

// ---------- Fabric, Java ----------
let gameVersions = null;
const verCmp = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};
async function fabricVersions() {
  if (gameVersions) return gameVersions;
  try {
    const l = await J('https://meta.fabricmc.net/v2/versions/game');
    gameVersions = l.filter(v => v.stable && /^\d+\.\d+(\.\d+)?$/.test(v.version))
      .map(v => v.version).filter(v => { const [a, b] = v.split('.').map(Number); return a >= 26 || (a === 1 && b >= 14); }).sort(verCmp);
    if (gameVersions.length) { cfg().knownVersions = gameVersions; save(); }   // para poder elegir versión sin conexión
  } catch {
    const k = cfg().knownVersions;
    return k && k.length ? k : ['26.1.2', '26.1', '1.21.11', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2'];
  }
  return gameVersions;
}
// Todas las versiones de Minecraft (las de Mojang): normales, snapshots, betas y alphas, y cuáles admiten mods (Fabric)
let allVers = null;
async function mcVersions() {
  if (allVers && Date.now() - allVers.t < 6 * 3600e3) return allVers.list;
  try {
    const [man, fab] = await Promise.all([J('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'), J('https://meta.fabricmc.net/v2/versions/game').catch(() => [])]);
    const fset = new Set((fab || []).map(v => v.version));
    const list = (man.versions || []).map(v => ({ id: v.id, type: v.type, fabric: fset.has(v.id) }));
    if (list.length) { allVers = { t: Date.now(), list }; cfg().knownAll = list; save(); }
    return list;
  } catch {
    if (cfg().knownAll && cfg().knownAll.length) return cfg().knownAll;
    return (await fabricVersions()).map(id => ({ id, type: 'release', fabric: true }));
  }
}
const mcType = mc => ((allVers && allVers.list) || cfg().knownAll || []).find(v => v.id === mc)?.type || 'release';
// versiones «modernas» (1.13 en adelante y las snapshots nuevas): para las muy antiguas no se tocan opciones ni el menú
const mcModern = mc => { const m = /^(\d+)\.(\d+)/.exec(String(mc)); if (m) return +m[1] > 1 || +m[2] >= 13; return /^\d{2}w\d{2}/.test(mc) || /-(pre|rc)/.test(mc); };
async function fabricLoader(mc) {
  const l = await J(`https://meta.fabricmc.net/v2/versions/loader/${mc}`);
  if (!l.length) throw new Error('Fabric no soporta la versión ' + mc);
  return l[0].loader.version;
}
async function ensureFabric(mc) {   // perfil de Fabric para el cliente (sin esto los mods no cargan)
  const c = cfg(), k = c.fabric[mc], vf = id => path.join(ROOT(), 'versions', id, id + '.json');
  try {
    const lv = await fabricLoader(mc), id = `fabric-loader-${lv}-${mc}`;
    if (!fs.existsSync(vf(id))) {
      const p = await J(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${lv}/profile/json`);
      fs.mkdirSync(path.join(ROOT(), 'versions', p.id), { recursive: true });
      fs.writeFileSync(vf(p.id), JSON.stringify(p));
    }
    c.fabric[mc] = { id, loader: lv }; save(); return id;
  } catch (e) { if (k && fs.existsSync(vf(k.id))) return k.id; throw e; }
}
function javaMajor(mc) {   // por si no hay internet: 26.x → Java 25 · 1.20.5+ → 21 · antes → 17
  const [ma, mi, pa] = mc.split('.').map(Number);
  if (ma >= 26) return 25;
  return (mi > 20 || (mi === 20 && (pa || 0) >= 5)) ? 21 : 17;
}
// Qué Java pide de verdad cada versión: lo dice el propio archivo de la versión de Mojang
// (javaVersion.majorVersion y el «componente» del runtime oficial, por ejemplo java-runtime-epsilon = Java 25).
const javaInfoCache = new Map();
async function javaInfo(mc) {
  if (javaInfoCache.has(mc)) return javaInfoCache.get(mc);
  let j = null;
  const vf = path.join(ROOT(), 'versions', mc, mc + '.json');
  try { j = JSON.parse(fs.readFileSync(vf, 'utf8')).javaVersion || null; } catch {}
  if (!j) {
    try {
      const man = await J('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 12000 });
      const v = (man.versions || []).find(x => x.id === mc);
      if (v) j = (await J(v.url, { timeout: 12000 })).javaVersion || null;
    } catch (e) { log(`Java para ${mc}: no he podido mirarlo en Mojang (${e.message})`); }
  }
  const info = { major: (j && +j.majorVersion) || javaMajor(mc), component: (j && j.component) || null };
  javaInfoCache.set(mc, info); return info;
}
// Descargar de una vez todas las versiones de Java que usa Minecraft (8, 17, 21 y 25): desde el instalador o Ajustes
const JAVA_ALL = [[25, 'java-runtime-epsilon'], [21, 'java-runtime-delta'], [17, 'java-runtime-gamma'], [8, 'jre-legacy']];
let javaAllBusy = null;
function javaAll() {
  if (javaAllBusy) return javaAllBusy;
  javaAllBusy = (async () => {
    const done = [], failed = [];
    for (const [major, comp] of JAVA_ALL) {
      try { if (!javaBusy.has(major)) javaBusy.set(major, installJava(major, comp).finally(() => javaBusy.delete(major))); await javaBusy.get(major); done.push(major); }
      catch (e) { failed.push(major); log(`Java ${major}: ${e.message}`); }
    }
    toast(failed.length ? `Java listo: ${done.join(', ') || 'ninguno'}. Sin conseguir: ${failed.join(', ')} (se intentará al jugar).` : 'Todas las versiones de Java están listas', failed.length ? 'warn' : 'ok');
    return { done, failed };
  })().finally(() => { javaAllBusy = null; });
  return javaAllBusy;
}
const javaMajorOf = mc => (javaInfoCache.get(mc) || {}).major || javaMajor(mc);
// Un JRE solo vale si está entero: java.exe + lib/jvm.cfg + lib/modules. Si una descarga o una
// extracción se cortó (antivirus, cerrar la app a medias…) se borra y se vuelve a instalar.
const jreOk = d => fs.existsSync(path.join(d, 'bin', 'java.exe')) && ['lib/modules', 'lib/rt.jar'].some(f => fs.existsSync(path.join(d, f)));   // Java 9+ (modules) o Java 8 (rt.jar)
const javaBusy = new Map();
async function ensureJava(mc) {
  const { major, component } = await javaInfo(mc);
  if (!javaBusy.has(major)) javaBusy.set(major, installJava(major, component).finally(() => javaBusy.delete(major)));
  return javaBusy.get(major);
}
const ARCH = () => process.arch === 'arm64' ? 'aarch64' : 'x64';
// Fuentes de Java, por orden. Si una falla (caída, bloqueada por tu red, sin esa versión todavía…) se prueba la siguiente.
// Cada una deja el Java descomprimido dentro de «to».
const JAVA_SRC = [
  ['Adoptium', async (major, to, zip) => {   // Eclipse Temurin: un .zip con su suma SHA-256
    let link = `https://api.adoptium.net/v3/binary/latest/${major}/ga/windows/${ARCH()}/jre/hotspot/normal/eclipse`, sum = null;
    try {
      const info = await J(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?os=windows&architecture=${ARCH()}&image_type=jre&vendor=eclipse`);
      const pk = Array.isArray(info) && info[0] && info[0].binary && info[0].binary.package;
      if (pk && pk.link) { link = pk.link; sum = String(pk.checksum || '').toLowerCase() || null; }
    } catch (e) { log(`Java ${major}: Adoptium sin suma de comprobación (${e.message})`); }
    await dl(link, zip, `Descargando Java ${major}`, 2);
    if (sum && await sha256(zip) !== sum) throw new Error('el archivo de Java llegó dañado (la descarga no coincide con la original)');
    prog(`Instalando Java ${major}`, 99); await unzipTo(zip, to);
  }],
  ['Mojang', async (major, to, zip, component) => {   // el mismo Java que usa el launcher oficial de Minecraft, archivo por archivo
    const plat = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
    const all = await J('https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json');
    const comps = all[plat] || {};
    let name = component && comps[component] && comps[component].length ? component : null;
    if (!name) name = Object.keys(comps).find(k => (comps[k] || []).some(x => x.version && String(x.version.name).split('.')[0] === String(major)));
    if (!name) throw new Error(`Mojang no tiene Java ${major} para este PC`);
    const man = await J(comps[name][0].manifest.url), out = path.join(to, name);
    const files = Object.entries(man.files || {}).filter(([, v]) => v.type === 'file' && v.downloads && v.downloads.raw);
    for (const [p, v] of Object.entries(man.files || {})) if (v.type === 'directory') fs.mkdirSync(path.join(out, p), { recursive: true });
    let done = 0;
    await pool(files, 8, async ([p, v]) => {
      const dest = path.join(out, p), r = v.downloads.raw;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      for (let a = 1; ; a++) {
        await dl(r.url, dest, null, 2);
        if (!r.sha1 || await sha1(dest) === r.sha1) break;
        try { fs.unlinkSync(dest); } catch {}
        if (a >= 3) throw new Error('un archivo de Java llegó dañado: ' + p);
      }
      prog(`Descargando Java ${major} (Mojang)`, ++done / files.length * 100);
    });
  }],
  ['Azul Zulu', async (major, to, zip) => {
    const l = await J(`https://api.azul.com/metadata/v1/zulu/packages/?java_version=${major}&os=windows&arch=${ARCH()}&archive_type=zip&java_package_type=jre&javafx_bundled=false&release_status=ga&availability_types=CA&latest=true&page_size=1`);
    const pk = Array.isArray(l) && l[0]; if (!pk || !pk.download_url) throw new Error(`Azul no tiene Java ${major} para este PC`);
    await dl(pk.download_url, zip, `Descargando Java ${major} (Zulu)`, 2);
    prog(`Instalando Java ${major}`, 99); await unzipTo(zip, to);
  }],
  ['Microsoft', async (major, to, zip) => {   // Microsoft Build of OpenJDK (es un JDK entero: más grande, pero vale igual)
    const u = `https://aka.ms/download-jdk/microsoft-jdk-${major}-windows-${ARCH()}.zip`;
    await dl(u, zip, `Descargando Java ${major} (Microsoft)`, 2);
    try { const r = await get(u + '.sha256sum.txt'); if (r.ok) { const sum = ((await r.text()).match(/[a-f0-9]{64}/i) || [])[0]; if (sum && await sha256(zip) !== sum.toLowerCase()) throw new Error('el archivo de Java llegó dañado'); } }
    catch (e) { if (/dañado/.test(e.message)) throw e; }
    prog(`Instalando Java ${major}`, 99); await unzipTo(zip, to);
  }],
];
// Último recurso: un Java que ya tengas en el PC (el del launcher oficial de Minecraft o uno instalado).
function systemJava(major, component) {
  const env = process.env, cands = [];
  const mcRt = [path.join(env.APPDATA || '', '.minecraft', 'runtime'), path.join(env.LOCALAPPDATA || '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime')];
  for (const rt of mcRt) for (const c of component ? [component] : []) for (const plat of ['windows-x64', 'windows-arm64']) cands.push(path.join(rt, c, plat, c));
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean).flatMap(p => ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto'].map(v => path.join(p, v)));
  for (const r of roots) { try { for (const d of fs.readdirSync(r)) if (new RegExp(`(^|\\D)${major}([.\\-+]|$)`).test(d.replace(/^(jdk|jre|zulu)-?/i, ''))) cands.push(path.join(r, d)); } catch {} }
  const ok = cands.find(d => jreOk(d));
  return ok ? path.join(ok, 'bin', 'java.exe') : null;
}
async function installJava(major, component) {
  const base = path.join(U(), 'java'), dir = path.join(base, String(major));
  const find = d => {
    if (!fs.existsSync(d)) return null;
    for (const x of fs.readdirSync(d)) { const h = path.join(d, x); if (jreOk(h)) return path.join(h, 'bin', 'java.exe'); }
    return null;
  };
  let j = find(dir); if (j) return j;
  if (fs.existsSync(dir)) { log(`Java ${major} está incompleto: lo reinstalo`); fs.rmSync(dir, { recursive: true, force: true }); }
  fs.mkdirSync(base, { recursive: true });
  const errs = [];
  log(`Descargando Java ${major} (solo la primera vez) ...`);
  for (const [src, fn] of JAVA_SRC) {
    const zip = path.join(base, `jre${major}.zip`), tmp = dir + '.tmp';
    try {
      fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
      await fn(major, tmp, zip, component);
      if (!find(tmp)) throw new Error('el paquete de Java salió incompleto');
      fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
      j = find(dir); if (j) { log(`Java ${major} instalado desde ${src}`); return j; }
      throw new Error('no se pudo dejar Java en su carpeta');
    } catch (e) {
      log(`Java ${major} (${src}): ${e.message}. Pruebo con otra fuente…`); errs.push(`${src}: ${e.message}`);
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    } finally { try { fs.unlinkSync(zip); } catch {} prog('', 0); }
  }
  const sys = systemJava(major, component);
  if (sys) { log(`Java ${major}: uso el que ya tienes en el PC (${sys})`); return sys; }
  const all = errs.join(' · ');
  let hint = ' Revisa tu conexión a internet (sin VPN ni proxy) y vuelve a intentarlo.';
  if (/dañado/.test(all)) hint = ' La descarga llega corrupta: prueba con otra red o más tarde.';
  else if (/incompleto|descomprimir|EPERM|EBUSY|EACCES/i.test(all)) hint = ' Puede que Windows Defender u otro programa esté bloqueando la carpeta de Compass.';
  throw new Error(`No se pudo instalar Java ${major} de ninguna fuente (${all}).${hint}`);
}
function sha256(f) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f).on('error', rej).on('data', c => h.update(c)).on('end', () => res(h.digest('hex')));
  });
}
// Descomprime con el tar de Windows (el de System32, no otro que haya en el PATH, como el de Git),
// si falla con PowerShell y, como último recurso, con adm-zip. Si todos fallan, dice por qué.
async function unzipTo(zip, to) {
  const errs = [], q = s => `'${String(s).replace(/'/g, "''")}'`;
  const sysTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  try { await runCmd(fs.existsSync(sysTar) ? sysTar : 'tar', ['-xf', zip, '-C', to]); return; } catch (e) { errs.push('tar: ' + e.message); }
  try {
    await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(to)} -Force`]);
    return;
  } catch (e) { errs.push('PowerShell: ' + e.message); }
  try { new AdmZip(zip).extractAllTo(to, true); return; } catch (e) { errs.push('adm-zip: ' + e.message); }
  throw new Error('no se pudo descomprimir (' + errs.join(' · ') + ')');
}

// ---------- servidor: propiedades, red, sincronización ----------
const propsFile = s => path.join(sdir(s), 'server.properties');
const PKEYS = ['motd', 'max-players', 'gamemode', 'difficulty', 'pvp', 'white-list', 'online-mode', 'view-distance', 'simulation-distance', 'spawn-protection', 'allow-flight', 'level-seed',
  'hardcore', 'enable-command-block', 'op-permission-level', 'level-type', 'force-gamemode', 'spawn-monsters', 'enforce-whitelist',
  'resource-pack', 'resource-pack-sha1', 'require-resource-pack', 'resource-pack-prompt', 'hide-online-players'];
function readProps(s) {
  const o = {};
  try { for (const l of fs.readFileSync(propsFile(s), 'utf8').split(/\r?\n/)) { const m = /^\s*([^#=\s][^=]*)=(.*)$/.exec(l); if (m) o[m[1].trim()] = m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))); } } catch {}
  return o;
}
function setProps(s, patch) {
  let t = ''; try { t = fs.readFileSync(propsFile(s), 'utf8'); } catch {}
  for (const [k, v0] of Object.entries(patch)) {
    // lo que no es ASCII (§ de los colores, tildes) va como \uXXXX: Minecraft lee este archivo en ISO-8859-1
    const v = String(v0).replace(/[\r\n]+/g, ' ').replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), re = new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '=.*$', 'm');
    t = re.test(t) ? t.replace(re, () => k + '=' + v) : t + (t && !t.endsWith('\n') ? '\n' : '') + k + '=' + v + '\n';
  }
  fs.mkdirSync(sdir(s), { recursive: true }); fs.writeFileSync(propsFile(s), t);
}
function serversDat(list) {
  const s = t => { const b = Buffer.from(t), h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]); };
  const n = Buffer.alloc(4); n.writeInt32BE(list.length);
  const parts = [Buffer.from([10]), s(''), Buffer.from([9]), s('servers'), Buffer.from([10]), n];
  for (const [name, ip, icon] of list) {
    parts.push(Buffer.from([8]), s('ip'), s(ip), Buffer.from([8]), s('name'), s(name));
    const b64 = /^data:image\/png;base64,(.+)$/.exec(icon || '');   // el icono del servidor también en la lista de Minecraft
    if (b64 && b64[1].length < 60000) parts.push(Buffer.from([8]), s('icon'), s(b64[1]));
    parts.push(Buffer.from([0]));
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}
const lanIP = () => Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;

// ---------- lo que reciben los amigos: nombre, icono, descripción y mods (incluidos los solo de cliente) ----------
async function buildManifest(s) {
  const cur = srv(s.id) || s, mdir = path.join(sdir(cur), 'mods'), paper = cur.type === 'paper', mods = [];
  if (!paper) {
    try { await scanMods(mdir); } catch {}
    const C = mcache(), all = await listLocal(mdir), items = [];
    for (const i of all) {
      const m = metaOf(path.join(mdir, i.file), i.sha1);
      if (m && m.env === 'server') continue;                // los de solo servidor no hacen falta en el cliente
      if (!i.enabled && !(m && m.env === 'client')) continue;   // desactivado a mano: no se manda; los solo de cliente sí
      items.push({ ...i, m, name: i.file.replace(/\.disabled$/, '') });
    }
    try { await cfResolve(mdir, items.filter(i => !(C[i.sha1] && C[i.sha1].url))); } catch (e) { log('CurseForge: ' + e.message); }
    for (const i of items) {
      const c = C[i.sha1] || {};
      mods.push({ file: i.name, sha1: i.sha1, size: i.size, url: c.url || c.cfUrl || null, fp: c.fp != null ? c.fp : null, projectId: c.projectId || null,
        mid: (i.m && i.m.id) || null, title: c.title || (i.m && i.m.name) || null, ver: c.ver || (i.m && i.m.version) || null, client: !!(i.m && i.m.env === 'client') });
    }
  }
  return { v: 2, name: cur.name, desc: cur.desc || '', color: cur.color || null, icon: fs.existsSync(path.join(sdir(cur), 'server-icon.png')), type: cur.type || 'fabric',
    mc: cur.mc, loader: paper ? 'vanilla' : 'fabric', mcPort: GAME_PORT, mods, world: cur.shareWorld !== false };
}
function syncHandler(s) {
  return async (req, res) => {
    try {
      const u = decodeURIComponent((req.url || '').split('?')[0]), mdir = path.join(sdir(s), 'mods');
      // amigos con OTRO launcher: abren en el navegador la misma dirección (http://IP:25565) y se bajan los mods en un .zip
      if (u === '/' || u === '/index.html') {
        const m = await buildManifest(s), esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
        const n = m.mods.length, host = esc(String(req.headers.host || '').replace(/:\d+$/, '')) || 'la IP';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(m.name)}</title>
<style>body{font:16px system-ui,sans-serif;background:#1b1226;color:#efe6da;max-width:640px;margin:40px auto;padding:0 20px}h1{color:#ffb547}a.b{display:inline-block;background:#ffb547;color:#2a1a10;padding:12px 18px;border-radius:6px;font-weight:700;text-decoration:none}code{background:#2c2040;padding:2px 6px;border-radius:4px}li{margin:6px 0}small{color:#a99}</style>
<h1>${esc(m.name)}</h1><p>${esc(m.desc)}</p>
<p>Minecraft <b>${esc(m.mc)}</b>${m.loader === 'fabric' ? ' con <b>Fabric</b>' : ''}.</p>
${n ? `<p><a class="b" href="/mods.zip">Descargar los ${n} mods (.zip)</a></p>
<ol><li>En tu launcher crea una instalación de Minecraft ${esc(m.mc)} con Fabric.</li><li>Descomprime el .zip dentro de su carpeta <code>mods</code>.</li><li>Entra en Multijugador y añade <code>${host}</code>.</li></ol>` : `<p>No hace falta instalar nada: entra en Multijugador y añade <code>${host}</code>.</p>`}
<p><small>Con Compass Launcher es más fácil: pegas la dirección en Unirme y se descarga todo solo.</small></p></html>`);
      }
      if (u === '/mods.zip') {
        const m = await buildManifest(s), z = new AdmZip();
        for (const mod of m.mods) { const f = [path.join(mdir, mod.file), path.join(mdir, mod.file + '.disabled')].find(x => fs.existsSync(x)); if (f) z.addLocalFile(f, '', mod.file); }
        const b = z.toBuffer();
        res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="mods-${String(m.name || 'servidor').replace(/[^\w-]+/g, '_')}.zip"`); res.setHeader('Content-Length', b.length);
        log('Alguien ha descargado los mods en .zip (otro launcher)');
        return res.end(b);
      }
      if (u === '/manifest.json') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(await buildManifest(s))); }
      if (u === '/icon.png') {   // el icono del servidor, para las tarjetas de los amigos
        const f = path.join(sdir(s), 'server-icon.png'); if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
        res.setHeader('Content-Type', 'image/png'); return res.end(fs.readFileSync(f));
      }
      if (u === '/world.zip') {   // copia del mapa para los amigos (se puede desactivar en Ajustes del servidor)
        const cur = srv(s.id) || s;
        if (cur.shareWorld === false) { res.statusCode = 403; return res.end(); }
        const f = await worldZip(cur);
        res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Length', fs.statSync(f).size);
        const rs = fs.createReadStream(f); rs.pipe(res); rs.on('close', () => { try { fs.unlinkSync(f); } catch {} });
        log('Un amigo ha descargado una copia del mapa de ' + cur.name);
        return;
      }
      const name = u.startsWith('/mods/') ? u.slice(6) : '';
      if (!name || name !== path.basename(name) || !/\.jar$/i.test(name)) { res.statusCode = 404; return res.end(); }
      let f = path.join(mdir, name);
      if (!fs.existsSync(f)) {   // un mod solo de cliente está desactivado en el servidor, pero se lo damos igual a los amigos
        const d = f + '.disabled', m = fs.existsSync(d) && metaOf(d, await sha1(d));
        if (!(m && m.env === 'client')) { res.statusCode = 404; return res.end(); }
        f = d;
      }
      res.setHeader('Content-Type', 'application/java-archive'); res.setHeader('Content-Length', fs.statSync(f).size);
      fs.createReadStream(f).pipe(res);
    } catch (e) { log('Sincronización: ' + e.message); try { res.statusCode = 500; res.end(); } catch {} }
  };
}
function startSync(s) {   // puerto de siempre (8765), para amigos con versiones anteriores de Compass
  if (syncSrv) syncSrv.close();
  syncSrv = http.createServer(syncHandler(s)).on('error', e => log('Sincronización: ' + e.message)).listen(SYNC_PORT, '0.0.0.0');
}

// ---------- puerta de Compass: el juego y los mods por la MISMA dirección ----------
// Compass escucha en el 25565. Si llega una petición web (los mods, el icono, el mapa) la atiende él;
// si llega Minecraft, la pasa al servidor real, que escucha solo dentro del PC en otro puerto.
// Así a tus amigos les basta con tu IP o el nombre del túnel: no hace falta ningún puerto extra.
let gate = null;   // { srv, web, webPort, inner, dir, names: Map nombre → IP real, sockets }
const freePort = () => new Promise((res, rej) => { const t = net.createServer(); t.once('error', rej); t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => res(p)); }); });
async function startGate(s) {
  if (gate) { gate.dir = sdir(s); gate.web.removeAllListeners('request'); gate.web.on('request', syncHandler(s)); return gate; }
  const g = { inner: await freePort(), dir: sdir(s), names: new Map(), sockets: new Set() };
  g.web = http.createServer(syncHandler(s));
  await new Promise((res, rej) => { g.web.once('error', rej); g.web.listen(0, '127.0.0.1', () => { g.web.removeListener('error', rej); res(); }); });
  g.webPort = g.web.address().port;
  g.srv = net.createServer(c => gateConn(g, c));
  try {
    await new Promise((res, rej) => { g.srv.once('error', rej); g.srv.listen(GAME_PORT, () => { g.srv.removeListener('error', rej); res(); }); });
  } catch (e) { try { g.web.close(); } catch {} throw e; }
  g.srv.on('error', e => log('Puerta: ' + e.message));
  gate = g; log(`Puerta de Compass en el ${GAME_PORT} → Minecraft en 127.0.0.1:${g.inner}`);
  return g;
}
function stopGate() {
  if (!gate) return;
  const g = gate; gate = null;
  try { g.srv.close(); } catch {} try { g.web.close(); } catch {}
  for (const c of g.sockets) try { c.destroy(); } catch {}
}
function parseHandshake(b) {   // undefined = aún no ha llegado entero · null = no es un handshake
  const a = readVarint(b, 0); if (!a) return undefined;
  const [len, o] = a; if (len < 3 || len > 1100) return null; if (b.length < o + len) return undefined;
  let p = o; const id = readVarint(b, p); if (!id || id[0] !== 0) return null; p = id[1];
  const pr = readVarint(b, p); if (!pr) return null; p = pr[1];
  const hl = readVarint(b, p); if (!hl) return null; p = hl[1] + hl[0] + 2;
  const nx = readVarint(b, p); if (!nx) return null;
  return { next: nx[0], end: o + len };
}
function loginName(b, off) {   // «Login Start»: el nombre del jugador, justo después del handshake
  const a = readVarint(b, off); if (!a) return null; const [len, o] = a; if (b.length < o + len) return null;
  const id = readVarint(b, o); if (!id || id[0] !== 0) return null;
  const sl = readVarint(b, id[1]); if (!sl || sl[0] > 16) return null;
  const n = b.slice(sl[1], sl[1] + sl[0]).toString('utf8'); return /^\w{2,16}$/.test(n) ? n : null;
}
function gateBans(g) {
  const f = path.join(g.dir, 'banned-ips.json'); let st; try { st = fs.statSync(f); } catch { return []; }
  if (g.banM !== st.mtimeMs) { g.banM = st.mtimeMs; g.bans = jread(f).map(x => String(x && x.ip)); }
  return g.bans || [];
}
function gateConn(g, c) {
  c.setNoDelay(true); g.sockets.add(c); c.on('close', () => g.sockets.delete(c)); c.on('error', () => {});
  const ip = String(c.remoteAddress || '').replace(/^::ffff:/, '');
  let buf = Buffer.alloc(0), decided = false;
  const tm = setTimeout(() => decide(true), 4000);
  const onData = d => { buf = Buffer.concat([buf, d]); decide(false); };
  c.on('data', onData);
  function decide(force) {
    if (decided) return;
    if (buf.length < 4 && !force) return;
    if (!buf.length) { decided = true; return c.destroy(); }
    const head = buf.slice(0, 4).toString('latin1');
    let hs = null;
    if (head !== 'GET ' && head !== 'HEAD' && buf[0] !== 0xFE) { hs = parseHandshake(buf); if (hs === undefined && !force && buf.length < 2048) return; }
    decided = true; clearTimeout(tm); c.removeListener('data', onData); c.pause();
    if (head === 'GET ' || head === 'HEAD') return gatePipe(c, buf, g.webPort);
    if (hs && hs.next === 2) {   // viene a jugar (no solo a mirar si está encendido)
      const bans = gateBans(g);
      if (bans.includes(ip)) { log(`Puerta: ${ip} está baneado`); return c.end(packet(0, mcStr(JSON.stringify({ text: 'Estás baneado de este servidor.' })))); }
      if (bans.some(x => x === '127.0.0.1' || x === '::1')) {   // alguien hizo «ban-ip Nombre»: eso banearía a todos, así que se deshace
        srvCmd('pardon-ip 127.0.0.1'); srvOut('[Compass] «ban-ip» con un nombre banearía a todos tus amigos a la vez: lo he deshecho. Usa la IP o el botón Banear IP de Gente.\n');
      }
      const sniff = d => { const n = loginName(Buffer.concat([buf, d]), hs.end); if (n) { g.names.set(n.toLowerCase(), ip); c.removeListener('data', sniff); } };
      const n = loginName(buf, hs.end); if (n) g.names.set(n.toLowerCase(), ip); else c.on('data', sniff);
    }
    gatePipe(c, buf, g.inner);
  }
}
function gatePipe(c, first, port) {
  const up = net.connect({ host: '127.0.0.1', port });
  up.setNoDelay(true);
  const kill = () => { c.destroy(); up.destroy(); };
  up.on('connect', () => { up.write(first); c.pipe(up); up.pipe(c); c.resume(); });
  up.on('error', kill); c.on('error', kill); up.on('close', () => c.destroy()); c.on('close', () => up.destroy());
}
function gateCmd(cmd) {   // con la puerta, Minecraft ve a todos como 127.0.0.1: «ban-ip Nombre» se traduce a la IP real
  if (!gate) return cmd;
  const m = /^\/?ban-ip\s+(\S+)(.*)$/i.exec(String(cmd).trim()); if (!m) return cmd;
  let ip = m[1];
  if (!net.isIP(ip)) {
    ip = gate.names.get(ip.toLowerCase());
    if (!ip) { srvOut(`[Compass] No sé la IP de ${m[1]}: tiene que haber entrado al servidor en esta sesión. Usa «ban ${m[1]}» o la IP.\n`); return null; }
  }
  if (ip === '127.0.0.1' || ip === '::1') { srvOut('[Compass] Esa IP es la de tu propio PC (o la del túnel): no se puede banear.\n'); return null; }
  for (const [n, x] of gate.names) if (x === ip) setTimeout(() => srvCmd(`kick ${n} Baneado`), 400);
  return `ban-ip ${ip}${m[2]}`;
}
// Windows: que el cortafuegos deje entrar a tus amigos (pide permiso de administrador una sola vez)
async function ensureFirewall() {
  if (process.platform !== 'win32') return;
  const exe = process.execPath, c = cfg(), name = 'Compass Launcher (servidor)';
  if (c.fwDone === exe) return;
  const has = await new Promise(res => {
    const p = spawn('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`], { windowsHide: true }); let out = '';
    p.stdout.on('data', d => out += d); p.on('error', () => res(false)); p.on('exit', code => res(code === 0 && out.includes(name)));
  });
  c.fwDone = exe; save();
  if (has) return;
  toast('Windows te va a pedir permiso para que tus amigos puedan entrar (solo esta vez). Pulsa Sí.', 'info');
  const cmdline = `/c netsh advfirewall firewall delete rule name=all dir=in program="${exe}" & netsh advfirewall firewall add rule name="${name}" dir=in action=allow program="${exe}" enable=yes profile=any`;
  const ps = `$p = Start-Process -FilePath cmd.exe -ArgumentList '${cmdline.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
  try { await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')]); log('Cortafuegos: Compass ya puede recibir conexiones'); }
  catch (e) { log('Cortafuegos: ' + e.message); toast('Sin permiso del cortafuegos: si tus amigos no pueden entrar, permite «Compass Launcher» en el Firewall de Windows.', 'warn'); }
}
async function tryRouter() {
  const { default: NatAPI } = await import('@silentbot1/nat-api');
  nat = new NatAPI({ enablePMP: true, enableUPNP: true, upnpPermanentFallback: true, ttl: 7200 });
  await nat.map({ publicPort: GAME_PORT, privatePort: GAME_PORT, protocol: 'TCP', description: 'Compass Launcher' });   // juego + mods (puerta de Compass)
  try { await nat.map({ publicPort: GAME_PORT, privatePort: GAME_PORT, protocol: 'UDP', description: 'Compass Launcher' }); } catch (e) { log('UPnP UDP: ' + e.message); }
  try { await nat.map({ publicPort: SYNC_PORT, privatePort: SYNC_PORT, protocol: 'TCP', description: 'Compass Launcher' }); } catch (e) { log('UPnP ' + SYNC_PORT + ': ' + e.message); }
  const routerIp = await nat.externalIp().catch(() => null);
  const publicIp = (await J('https://api.ipify.org?format=json')).ip;
  if (routerIp && routerIp !== publicIp) throw new Error(`tu operador comparte IP (router: ${routerIp}, internet: ${publicIp})`);
  return publicIp;
}
async function unmap() {
  if (!nat) return;
  for (const p of [GAME_PORT, SYNC_PORT]) { try { await nat.unmap(p); } catch {} }   // destroy() quita también lo que quede (UDP)
  try { await nat.destroy(); } catch {}
  nat = null;
}
async function papi(p, body, secret) {
  const r = await get('https://api.playit.gg' + p, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: 'Agent-Key ' + secret } : {}) }, body: JSON.stringify(body) });
  return r.json();
}
async function pok(p, body, secret) {
  const j = await papi(p, body, secret);
  if (j.status !== 'success') throw new Error(`${p}: ${j.status} ${JSON.stringify(j.data)}`);
  return j.data;
}
const addrOf = list => {
  const pick = t => (list || []).find(a => a.type === t);
  const a4 = pick('addr4'), i4 = pick('ip4'), au = pick('auto') || pick('domain');
  return a4 ? a4.value.address : i4 ? `${i4.value.address}:${i4.value.default_port}` : au ? au.value.address : null;
};
async function playitStart(r) {
  const c = cfg(); let secret = c.playitSecret;
  if (!secret) {
    const code = crypto.randomBytes(5).toString('hex');
    await pok('/claim/setup', { code, agent_type: 'self-managed', version: 'compass-launcher ' + app.getVersion() });
    shell.openExternal('https://playit.gg/claim/' + code);
    toast('Se ha abierto playit.gg: aprueba el agente (solo la primera vez)', 'info');
    const t0 = Date.now();
    while (!secret) {
      if (Date.now() - t0 > 600000) throw new Error('se acabó el tiempo esperando la aprobación en playit.gg');
      if (run !== r || r.stopping) throw new Error('cancelado');
      await sleep(2500);
      const j = await papi('/claim/exchange', { code });
      if (j.status === 'success') secret = j.data.secret_key;
      else if (j.status === 'error' || ['UserRejected', 'CodeExpired', 'CodeNotFound'].includes(j.data)) throw new Error('claim de playit: ' + JSON.stringify(j));
    }
    c.playitSecret = secret; save();
  }
  const { agent_id } = await pok('/agents/rundata', {}, secret);
  const want = { 'compas-game': ['minecraft-java', GAME_PORT], 'compas-sync': [null, SYNC_PORT] };
  let list = (await pok('/v1/tunnels/list', {}, secret)).tunnels;
  for (const [name, [type, port]] of Object.entries(want)) {
    if (list.some(t => t.name === name)) continue;
    await pok('/tunnels/create', { name, tunnel_type: type, port_type: 'tcp', port_count: 1,
      origin: { type: 'agent', data: { agent_id, local_ip: '127.0.0.1', local_port: port } },
      enabled: true, alloc: null, firewall_id: null, proxy_protocol: null }, secret);
  }
  let game, sync;
  for (let i = 0; i < 30 && !(game && sync); i++) {
    list = (await pok('/v1/tunnels/list', {}, secret)).tunnels;
    game = addrOf(list.find(t => t.name === 'compas-game')?.connect_addresses);
    sync = addrOf(list.find(t => t.name === 'compas-sync')?.connect_addresses);
    if (!(game && sync)) await sleep(2000);
  }
  if (!game || !sync) throw new Error('playit no asignó direcciones (¿límite de túneles del plan gratis?)');
  if (!playitProc) {
    const exe = path.join(U(), 'bin', 'playitd.exe');
    if (!fs.existsSync(exe)) await dl('https://github.com/playit-cloud/playit-agent/releases/latest/download/playitd-windows-x86_64.exe', exe, 'Descargando agente de túnel');
    playitProc = spawn(exe, ['--secret', secret], { windowsHide: true });
    playitProc.stderr.on('data', d => log('[playit] ' + d.toString().trim()));
    playitProc.on('error', e => { log('playit: ' + e.message); playitProc = null; });
    playitProc.on('exit', () => { playitProc = null; });
  }
  return { game, sync };
}
async function worldZip(s) {   // zip temporal del mundo actual (pausando el guardado si está encendido)
  const lvl = levelName(s);
  if (!fs.existsSync(path.join(sdir(s), lvl, 'level.dat'))) throw new Error('Todavía no hay mundo');
  const live = run && run.id === s.id && run.proc && run.state === 'ready';
  if (live) { srvCmd('save-off'); srvCmd('save-all flush'); await sleep(3500); }
  try {
    const f = path.join(os.tmpdir(), `compass-mapa-${uid()}.zip`);
    await runCmd('tar', ['-a', '-cf', f, '--exclude', 'session.lock', '-C', sdir(s), lvl]);
    return f;
  } finally { if (live) srvCmd('save-on'); }
}
function copyWorldTo(src, savesDir, title) {
  fs.mkdirSync(savesDir, { recursive: true });
  const name = freeName(savesDir, slug(title)), dest = path.join(savesDir, name);
  fs.cpSync(src, dest, { recursive: true, filter: p => !/session\.lock$/.test(p) });
  return name;
}
const invite = (s, g) => 'CMP-' + Buffer.from(JSON.stringify({ s, g })).toString('base64url');
async function cleanupNet() {
  await unmap();
  if (playitProc) { try { playitProc.kill(); } catch {} playitProc = null; }
  if (syncSrv) { try { syncSrv.close(); } catch {} syncSrv = null; }
  stopGate();
}
async function srvNet(s, r) {   // cómo conectan los amigos: LAN, router (UPnP) o túnel
  startSync(s);
  const mode = s.mode || 'online';
  const viaGate = !!gate, sameNote = viaGate ? ' Tus amigos pueden entrar solo con la dirección: los mods, el nombre y el icono llegan por ahí.' : '';
  if (mode === 'lan') { const ip = lanIP(); return { share: invite(`${ip}:${SYNC_PORT}`, `${ip}:${GAME_PORT}`), ip, note: 'Solo funciona en la misma red local o dentro de una VPN.' + sameNote }; }
  if (mode === 'manual') {   // el puerto 25565 ya está abierto a mano en el router: no se toca nada
    const ip = (await J('https://api.ipify.org?format=json')).ip;
    return { share: invite(`${ip}:${viaGate ? GAME_PORT : SYNC_PORT}`, `${ip}:${GAME_PORT}`), ip, note: `Puerto ${GAME_PORT} abierto a mano en tu router (TCP).` + sameNote };
  }
  if (mode === 'online') {
    try {
      const ip = await withTimeout(tryRouter(), 30000, 'el router no respondió');
      return { share: invite(`${ip}:${viaGate ? GAME_PORT : SYNC_PORT}`, `${ip}:${GAME_PORT}`), ip, note: 'Puerto abierto automáticamente en tu router (UPnP / NAT-PMP).' + sameNote };
    } catch (e) {
      log('Router: ' + e.message + '. Pasando al túnel automático ...'); await unmap();
      toast(`Tu router no deja abrir el puerto solo (UPnP apagado o ${/comparte IP/.test(e.message) ? 'IP compartida por tu operador' : 'sin respuesta'}): uso un túnel. Si lo abres tú a mano, elige «Puerto abierto a mano» en Ajustes del servidor.`, 'warn');
    }
  }
  const t = await playitStart(r);
  return { share: invite(viaGate ? t.game : t.sync, t.game), ip: t.game, note: 'Túnel playit activo: no hace falta abrir puertos.' + sameNote };
}

// ---------- permiso solo de TP (lo gestiona Compass, no Minecraft) ----------
// Minecraft no deja dar solo /tp: con OP nivel 2 vienen también /gamemode, /give…
// Así que quien tenga este permiso escribe en el chat «!tp Nombre» o «!tp x y z»
// y Compass lo ejecuta desde la consola del servidor. No da ningún otro comando.
// mensajes al chat con tildes y ñ bien puestas: tellraw con escapes \uXXXX (la consola no siempre va en UTF-8)
const jtxt = t => JSON.stringify(String(t)).replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const chat = (who, text, color = 'white') => srvCmd(`tellraw ${who} {"text":${jtxt(text)},"color":"${/^[a-z_]+$/.test(color) ? color : 'white'}"}`);
const tpFile = s => path.join(sdir(s), 'compass-tp.json');
const tpList = s => { try { return JSON.parse(fs.readFileSync(tpFile(s), 'utf8')).filter(x => x && x.name); } catch { return []; } };
const tpSave = (s, l) => { fs.mkdirSync(sdir(s), { recursive: true }); fs.writeFileSync(tpFile(s), JSON.stringify(l, null, 2)); };
const tpHas = (s, n) => tpList(s).some(x => x.name.toLowerCase() === String(n).toLowerCase());
const COORD = /^~?-?\d+(\.\d+)?$|^~$/;
function handleTpChat(s, text) {
  for (const line of String(text).split(/\r?\n/)) {
    // «[hh:mm:ss] [Server thread/INFO]: <Nombre> mensaje» (con o sin «(Minecraft)» y «[Not Secure]»).
    // El nombre es el PRIMER <…> de la línea: lo pone el servidor, el jugador no lo puede falsificar.
    const m = /^(?:\[[^\]]*\]\s*)+(?:\([^)]*\)\s*)?:?\s*(?:\[Not Secure\]\s*)?<(\w{3,16})>\s(.*)$/.exec(line);
    if (!m) continue;
    const who = m[1], msg = m[2].trim();
    if (!/^!tp(\s|$)/i.test(msg)) continue;
    const tell = t => chat(who, '[Compass] ' + t, 'aqua');
    if (!tpHas(s, who)) { tell('No tienes permiso de TP. Pídeselo al dueño del servidor.'); continue; }
    const a = msg.split(/\s+/).slice(1);
    if (a.length === 1 && NAME_RE.test(a[0])) {
      if (a[0].toLowerCase() === who.toLowerCase()) { tell('Ya estás contigo mismo :)'); continue; }
      const on = run && run.players && run.players.length ? run.players.find(x => x.toLowerCase() === a[0].toLowerCase()) : a[0];
      if (!on) { tell(a[0] + ' no está conectado.'); continue; }
      srvCmd(`tp ${who} ${on}`); srvOut(`[Compass] TP: ${who} → ${on}\n`); tell('Teletransportado a ' + on);
    } else if (a.length === 3 && a.every(x => COORD.test(x))) {
      srvCmd(`execute as ${who} at ${who} run tp ${who} ${a.join(' ')}`); srvOut(`[Compass] TP: ${who} → ${a.join(' ')}\n`); tell('Teletransportado a ' + a.join(' '));
    } else tell('Uso: !tp Nombre  o  !tp x y z');
  }
}

// ---------- personalización de la ventana: tamaño y cristal de Windows 11 ----------
const LOOK_KEYS = { theme: ['compass', 'galaxia', 'mc2026', 'mc2009', 'solarpunk', 'cyberpunk', 'aero', 'teppanyaki'], scheme: ['system', 'dark', 'light'],
  accent: ['tema', 'ambar', 'esmeralda', 'diamante', 'redstone', 'amatista', 'oro', 'cobre', 'nieve', 'lapis', 'rosa'],
  bg: ['tema', 'noche', 'galaxia', 'nebulosa', 'bloques', 'atardecer', 'aurora', 'synthwave', 'burbujas', 'sakura', 'solar', 'tierra', 'paisaje', 'lluvia', 'liso'],
  font: ['tema', 'titles', 'all', 'normal'], corners: ['tema', 'pixel', 'round'], textShadow: ['tema', 'si', 'no'],
  trans: ['pixeles', 'bloques', 'barrido', 'cortina', 'circulo', 'portal', 'disolver', 'deslizar', 'ninguna'], transSpeed: ['rapida', 'normal', 'lenta'] };
function cleanLook(v) {
  const n = (x, a, b, d) => { x = +x; return Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : d; };
  const pick = (k, d) => LOOK_KEYS[k].includes(v[k]) ? v[k] : d;
  return { theme: pick('theme', 'compass'), scheme: pick('scheme', 'system'), accent: pick('accent', 'tema'), accent2: LOOK_KEYS.accent.includes(v.accent2) ? v.accent2 : 'tema',
    bg: pick('bg', 'tema'), font: pick('font', 'tema'), corners: pick('corners', 'tema'), textShadow: pick('textShadow', 'tema'), trans: pick('trans', 'pixeles'), transSpeed: pick('transSpeed', 'normal'),
    glass: n(v.glass, 0, 90, 35), blur: n(v.blur, 0, 24, 10), bgDim: n(v.bgDim, 0, 80, 0), pixel: n(v.pixel, 2, 8, 4),
    grid: v.grid !== false, anim: v.anim !== false, zoom: [80, 90, 100, 110, 125].includes(+v.zoom) ? +v.zoom : 100, mica: !!v.mica };
}
function glassOk() {   // Mica/acrílico solo existe en Windows 11 22H2 (compilación 22621) o posterior
  if (process.platform !== 'win32') return false;
  const b = +String(os.release()).split('.')[2] || 0;
  return b >= 22621 && !!win && typeof win.setBackgroundMaterial === 'function';
}
function applyLook() {
  if (!win || win.isDestroyed()) return;
  const L = cleanLook(cfg().look || {});
  try { win.webContents.setZoomFactor(L.zoom / 100); } catch {}
  if (!glassOk()) return;
  try {
    if (L.mica) { win.setBackgroundMaterial('acrylic'); win.setBackgroundColor('#00000000'); }
    else { win.setBackgroundMaterial('none'); win.setBackgroundColor('#15111d'); }
  } catch (e) { log('Cristal: ' + e.message); }
}

// ---------- «Mods + plugins»: Arclight (Fabric + API de Bukkit/Paper en el mismo servidor) ----------
let arcCache = null;
async function arclightBuilds() {
  if (arcCache && Date.now() - arcCache.t < 6 * 3600e3) return arcCache.list;
  const list = [];
  for (let page = 1; page <= 2; page++) {
    const r = await J(`https://api.github.com/repos/IzzelAliz/Arclight/releases?per_page=50&page=${page}`, { headers: { Accept: 'application/vnd.github+json' } });
    for (const rel of r || []) for (const a of rel.assets || []) {
      const m = /^arclight-fabric-(\d+(?:\.\d+)+)-.+\.jar$/i.exec(a.name);
      if (m) list.push({ mc: m[1], name: a.name, url: a.browser_download_url, pre: !!rel.prerelease, date: rel.published_at || '' });
    }
    if (!r || r.length < 50) break;
  }
  list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  arcCache = { t: Date.now(), list };
  cfg().arcVersions = [...new Set(list.map(x => x.mc))]; save();
  return list;
}
async function hybridVersions() {
  try { return [...new Set((await arclightBuilds()).map(x => x.mc))].sort(verCmp); }
  catch { return (cfg().arcVersions || ['1.21.1', '1.20.4']).slice().sort(verCmp); }
}
async function hybridJar(s, dir) {
  const all = await arclightBuilds(), list = all.filter(x => x.mc === s.mc);
  if (!list.length) throw new Error(`«Mods + plugins» no existe para Minecraft ${s.mc}. Hay: ${[...new Set(all.map(x => x.mc))].sort(verCmp).join(', ')}. Cámbiala en Ajustes del servidor.`);
  const b = list.find(x => !x.pre) || list[0], jar = path.join(dir, b.name);
  if (!fs.existsSync(jar)) await dl(b.url, jar, 'Descargando Arclight ' + s.mc);
  return jar;
}

async function serverJar(s, dir, note = () => {}) {   // descarga (o reutiliza) el .jar de Paper, Fabric o Arclight
  let jar;
  if (s.type === 'hybrid') {
    note('Preparando mods + plugins (Arclight) ' + s.mc + ' …');
    fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true }); fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });
    try {
      jar = await hybridJar(s, dir);
      for (const f of fs.readdirSync(dir)) if (/^arclight-.*\.jar$/i.test(f) && path.join(dir, f) !== jar) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    } catch (e) {
      const old = fs.readdirSync(dir).find(f => /^arclight-fabric-.*\.jar$/i.test(f) && f.includes('-' + s.mc + '-'));
      if (!old) throw e;
      log('Sin red para Arclight, uso ' + old); jar = path.join(dir, old);
    }
    return jar;
  }
  if (s.type === 'paper') {
    note('Preparando Paper ' + s.mc + ' …');
    fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true });
    try {
      jar = await paperJar(s, dir);
      for (const f of fs.readdirSync(dir)) if (/^paper-.*\.jar$/.test(f) && path.join(dir, f) !== jar) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    } catch (e) {
      const old = fs.readdirSync(dir).find(f => /^paper-.*\.jar$/.test(f) && f.includes(s.mc));
      if (!old) throw e;
      log('Sin red para Paper, uso ' + old); jar = path.join(dir, old);
    }
  } else {
  note('Preparando Fabric ' + s.mc + ' …');
  try {
    const lv = await fabricLoader(s.mc);
    const iv = (await J('https://meta.fabricmc.net/v2/versions/installer')).find(i => i.stable).version;
    jar = path.join(dir, `fabric-${s.mc}-${lv}.jar`);
    if (!fs.existsSync(jar)) await dl(`https://meta.fabricmc.net/v2/versions/loader/${s.mc}/${lv}/${iv}/server/jar`, jar, 'Descargando servidor Fabric');
    for (const f of fs.readdirSync(dir)) if (/^fabric-.*\.jar$/.test(f) && path.join(dir, f) !== jar) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
  } catch (e) {
    const old = fs.readdirSync(dir).find(f => f.startsWith('fabric-' + s.mc) && f.endsWith('.jar'));
    if (!old) throw e;
    log('Sin red para Fabric, uso ' + old); jar = path.join(dir, old);
  }
  }
  return jar;
}

// ---------- 24/7, Nether/End cerrados al momento y tareas programadas ----------
const { powerSaveBlocker } = require('electron');
let awakeId = null, guardTimer = null, taskTimer = null, taskLast = {};
function keepAwake(on) {
  if (on && awakeId === null) { awakeId = powerSaveBlocker.start('prevent-app-suspension'); log('24/7: el PC no se dormirá mientras el servidor esté encendido'); }
  if (!on && awakeId !== null) { try { powerSaveBlocker.stop(awakeId); } catch {} awakeId = null; }
}
function dimGuard() {   // si Nether o End están cerrados, quien entre vuelve al spawn al instante
  if (!run || run.state !== 'ready') return;
  const s = srv(run.id); if (!s) return;
  const dims = [s.blockNether && ['the_nether', 'El Nether está cerrado'], s.blockEnd && ['the_end', 'El End está cerrado']].filter(Boolean);
  if (!dims.length) return;
  if (!run.spawn || Date.now() - (run.spawnAt || 0) > 60000) { run.spawn = (WM.levelInfo(path.join(sdir(s), levelName(s))) || {}).spawn || { x: 0, y: 100, z: 0 }; run.spawnAt = Date.now(); }
  const sp = run.spawn;
  for (const [d, msg] of dims) {
    srvCmd(`execute as @a at @s if dimension minecraft:${d} run tellraw @s {"text":${jtxt('[Compass] ' + msg)},"color":"red"}`);
    srvCmd(`execute as @a at @s if dimension minecraft:${d} in minecraft:overworld run tp @s ${sp.x} ${sp.y} ${sp.z}`);
  }
}
const pad = n => String(n).padStart(2, '0');
async function runTask(s, t) {
  const txt = String(t.text || '').replace(/[\r\n]+/g, ' ');
  switch (t.kind) {
    case 'save': srvCmd('save-all'); break;
    case 'message': if (txt) chat('@a', `[${s.name}] ${txt}`, t.color || 'gold'); break;
    case 'command': if (txt) srvCmd(txt.replace(/^\//, '')); break;
    case 'backup': try { await H.backupCreate(s.id); srvOut('[Compass] Copia de seguridad automática hecha\n'); } catch (e) { srvOut('[Compass] Copia automática fallida: ' + e.message + '\n'); } break;
    case 'restart':
      chat('@a', '[Compass] El servidor se reinicia en 1 minuto', 'yellow');
      setTimeout(() => chat('@a', '[Compass] Reiniciando en 10 segundos…', 'yellow'), 50000);
      setTimeout(() => { if (run && run.id === s.id) H.hostRestart(); }, 60000); break;
  }
  srvOut(`[Compass] Tarea automática: ${({ save: 'guardar', message: 'mensaje', command: 'comando', backup: 'copia', restart: 'reinicio' })[t.kind] || t.kind}\n`);
}
function taskTick() {
  if (!run || run.state !== 'ready') return;
  const s = srv(run.id); if (!s) return;
  const now = new Date(), hm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  for (const t of s.tasks || []) {
    if (!t.on) continue;
    const k = s.id + ':' + t.id;
    if (t.at) {   // a una hora fija, una vez al día
      const day = now.toDateString();
      if (t.at === hm && taskLast[k] !== day) { taskLast[k] = day; runTask(s, t); }
    } else {
      const every = Math.max(1, +t.every || 30) * 60000, last = taskLast[k] || run.startedAt || Date.now();
      if (!taskLast[k]) taskLast[k] = last;
      if (Date.now() - last >= every) { taskLast[k] = Date.now(); runTask(s, t); }
    }
  }
}
function autoLoops(on) {
  clearInterval(guardTimer); clearInterval(taskTimer); guardTimer = taskTimer = null;
  if (on) { guardTimer = setInterval(dimGuard, 2000); taskTimer = setInterval(taskTick, 15000); taskLast = {}; }
}
function applyDimProps(s) {   // para el próximo arranque: allow-nether y, en Paper, allow-end de bukkit.yml
  setProps(s, { 'allow-nether': s.blockNether ? 'false' : 'true' });
  if (s.type === 'paper' || s.type === 'hybrid') {
    const f = path.join(sdir(s), 'bukkit.yml');
    try {
      let y = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 'settings:\n  allow-end: true\n';
      y = /allow-end:/.test(y) ? y.replace(/allow-end:\s*\w+/, 'allow-end: ' + (s.blockEnd ? 'false' : 'true')) : y.replace(/settings:\s*\n/, m => m + '  allow-end: ' + (s.blockEnd ? 'false' : 'true') + '\n');
      fs.writeFileSync(f, y);
    } catch {}
  }
}

// ---------- vista previa de un mundo con su semilla, antes de usarlo ----------
let previewBusy = null;
async function seedPreview(s, seed, type) {
  if (run) throw new Error('Apaga el servidor para generar una vista previa');
  if (previewBusy) throw new Error('Ya se está generando una vista previa');
  const dir = sdir(s), folder = '.preview-' + uid(), props = readProps(s);
  for (const f of fs.readdirSync(dir)) if (f.startsWith('.preview-')) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  const javaExe = await ensureJava(s.mc), jar = await serverJar(s, dir, n => prog(n, 10));
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  const old = { 'level-seed': props['level-seed'] || '', 'level-type': props['level-type'] || 'minecraft:normal' };
  setProps(s, { 'level-seed': String(seed || '').trim(), 'level-type': type || 'minecraft:normal' });
  prog('Generando el mundo de prueba…', 20);
  try {
    await new Promise((res, rej) => {
      const p = spawn(javaExe, ['-Xmx2G', '-jar', jar, '--nogui', '--port', '25598', '--world', folder], { cwd: dir, windowsHide: true });
      previewBusy = p; let done = false, out = '';
      const tm = setTimeout(() => { try { p.kill(); } catch {} rej(new Error('La vista previa tardó demasiado')); }, 240000);
      const on = d => {
        const t = d.toString(); out = (out + t).slice(-4000);
        const m = /Preparing spawn area: (\d+)%/.exec(t); if (m) prog('Generando el mundo de prueba…', 20 + +m[1] * .7);
        if (!done && /Done \(.*\)! For help/.test(t)) { done = true; prog('Guardando…', 95); try { p.stdin.write('stop\n'); } catch {} }
      };
      p.stdout.on('data', on); p.stderr.on('data', on);
      p.on('error', e => { clearTimeout(tm); rej(e); });
      p.on('exit', () => { clearTimeout(tm); done ? res() : rej(new Error('El servidor de prueba se cerró: ' + (out.split('\n').filter(Boolean).slice(-2).join(' ') || 'sin detalles'))); });
    });
  } finally { previewBusy = null; setProps(s, old); prog('', 0); }
  const info = WM.levelInfo(path.join(dir, folder)) || {};
  return { folder, spawn: info.spawn || null, seed: info.seed != null ? String(info.seed) : String(seed || '') };
}

// ---------- servidor: arrancar, parar, reiniciar ----------
async function srvSpawn(s, r) {
  const alive = () => run === r && !r.stopping;
  const dir = sdir(s), mdir = path.join(dir, 'mods');
  fs.mkdirSync(mdir, { recursive: true });
  const javaExe = await ensureJava(s.mc); if (!alive()) return;
  const jar = await serverJar(s, dir, n => hset({ note: n }));
  if (!alive()) return;
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  // la puerta de Compass va en el 25565 y Minecraft dentro del PC; si el 25565 está ocupado, Minecraft va directo como antes
  let port = GAME_PORT, bind = '';
  try { const g = await startGate(s); port = g.inner; bind = '127.0.0.1'; }
  catch (e) { stopGate(); log('Puerta: ' + e.message); srvOut(`[Compass] El puerto ${GAME_PORT} está ocupado: tus amigos necesitarán el código CMP para recibir los mods.\n`); }
  if (!alive()) return;
  setProps(s, { 'server-port': port, 'server-ip': bind });
  if (s.type !== 'paper') for (const i of await listLocal(mdir)) if (i.enabled) {     // los mods solo de cliente no van en un servidor
    const m = metaOf(path.join(mdir, i.file), i.sha1);
    if (m && m.env === 'client') { fs.renameSync(path.join(mdir, i.file), path.join(mdir, i.file + '.disabled')); srvOut(`[Compass] ${i.file} es solo de cliente: desactivado en el servidor\n`); }
  }
  if (!alive()) return;
  const p = spawn(javaExe, ['-Xmx' + s.ram, '-jar', jar, 'nogui'], { cwd: dir, windowsHide: true });
  r.proc = p; r.wasReady = false; hset({ state: 'starting', note: '' });
  const onData = d => {
    const t = d.toString(); srvOut(t);
    if (/could not open .*jvm\.cfg|could not find java\.dll|Error: could not find libjava/i.test(t)) r.javaBroken = true;
    handleTpChat(s, t);
    if (/Done \(.*\)! For help/.test(t)) { r.wasReady = true; r.startedAt = Date.now(); hset({ state: 'ready' }); applyPendingSpawn(s); autoLoops(true); keepAwake(!!(srv(s.id) || s).keep247); }
    for (const m of t.matchAll(/:\s(\w{3,16}) joined the game/g)) {
      hset({ players: [...new Set([...r.players, m[1]])] });
      const w = (srv(s.id) || s).welcome; if (w) setTimeout(() => chat(m[1], w.replace(/\{jugador\}/gi, m[1]), 'gold'), 1500);
      if (tpHas(s, m[1])) setTimeout(() => chat(m[1], '[Compass] Tienes permiso de TP: escribe !tp Nombre o !tp x y z', 'aqua'), 2500);
    }
    for (const m of t.matchAll(/:\s(\w{3,16}) left the game/g)) hset({ players: r.players.filter(x => x !== m[1]) });
  };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('error', e => srvOut(e.code === 'ENOENT' ? 'No encuentro Java.\n' : e.message + '\n'));
  p.on('exit', async code => {
    if (run !== r || r.proc !== p) return;
    r.proc = null; r.players = [];
    try {
      if (r.javaBroken && !r.javaFixed && !r.stopping) {   // Java a medias: se borra, se reinstala y se arranca otra vez
        r.javaBroken = false; r.javaFixed = true;
        srvOut('[Compass] La instalación de Java estaba rota. La reinstalo y vuelvo a arrancar…\n');
        hset({ state: 'starting', note: 'Reinstalando Java…' });
        try { fs.rmSync(path.join(U(), 'java', String(javaMajorOf(s.mc))), { recursive: true, force: true }); } catch {}
        await srvSpawn(s, r); return;
      }
      if (r.restarting) { r.restarting = false; hset({ state: 'starting', note: 'Reiniciando…' }); srvOut('[Compass] Reiniciando servidor…\n'); await srvSpawn(s, r); return; }
      if (!r.stopping && code && r.wasReady && s.autoRestart && r.crashes < 3) {
        r.crashes++; toast(`El servidor se cayó (código ${code}). Reiniciando solo (${r.crashes}/3)…`, 'warn');
        hset({ state: 'starting', note: 'Reiniciando tras un fallo…' }); await srvSpawn(s, r); return;
      }
      if (!r.stopping && code) toast(`El servidor se cerró inesperadamente (código ${code}). Mira la consola.`, 'error');
    } catch (e) { toast('No se pudo reiniciar: ' + e.message, 'error'); }
    await srvEnded(r);
  });
}
async function srvEnded(r) {
  autoLoops(false); keepAwake(false);
  await cleanupNet();
  if (run === r) run = null;
  pushHost(); r.waiters.forEach(f => f()); r.waiters = [];
  if (tray) { tray.destroy(); tray = null; }
  if (win && !win.isDestroyed() && !win.isVisible() && !quitting) win.show();
}
async function srvStop(force) {
  const r = run; if (!r) return;
  r.stopping = true; r.restarting = false; hset({ state: 'stopping' });
  const p = r.proc;
  if (!p) { await srvEnded(r); return; }
  const ended = new Promise(res => r.waiters.push(res));
  try { if (force) p.kill(); else p.stdin.write('stop\n'); } catch {}
  await Promise.race([ended, sleep(force ? 4000 : 30000)]);
  if (run === r) { try { p.kill(); } catch {} await Promise.race([ended, sleep(6000)]); }
  if (run === r) await srvEnded(r);
}
const srvCmd = c => { if (run && run.proc && c) { c = gateCmd(String(c).replace(/[\r\n]+/g, ' ')); if (c) try { run.proc.stdin.write(c + '\n'); } catch {} } };

// ---------- amigos: estado del servidor (el mismo «ping» que usa la lista de servidores de Minecraft) ----------
const varint = n => { const b = []; n >>>= 0; do { let x = n & 127; n >>>= 7; if (n) x |= 128; b.push(x); } while (n); return Buffer.from(b); };
const mcStr = t => { const b = Buffer.from(t, 'utf8'); return Buffer.concat([varint(b.length), b]); };
const packet = (id, ...parts) => { const body = Buffer.concat([varint(id), ...parts]); return Buffer.concat([varint(body.length), body]); };
function readVarint(buf, off) { let n = 0, shift = 0, b; do { if (off >= buf.length) return null; b = buf[off++]; n |= (b & 127) << shift; shift += 7; } while (b & 128 && shift < 35); return [n >>> 0, off]; }
function parseAddr(a, defPort = GAME_PORT) {   // «host», «host:puerto», «[ipv6]:puerto»
  a = String(a || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  let m = a.match(/^\[([^\]]+)\](?::(\d+))?$/); if (m) return { host: m[1], port: +(m[2] || defPort), explicit: !!m[2] };
  m = a.match(/^([^:]+)(?::(\d+))?$/); if (!m) throw new Error('Esa dirección no es válida');
  return { host: m[1], port: +(m[2] || defPort), explicit: !!m[2] };
}
async function srvLookup(host) {   // dominios con registro SRV (_minecraft._tcp), como hace el propio juego
  if (net.isIP(host) || host === 'localhost') return null;
  try { const r = await withTimeout(dns.promises.resolveSrv('_minecraft._tcp.' + host), 2500, 'srv'); if (r && r[0]) return { host: r[0].name, port: r[0].port }; } catch {}
  return null;
}
async function slpPing(addr, timeout = 3500) {
  let { host, port, explicit } = parseAddr(addr);
  if (!explicit) { const r = await srvLookup(host); if (r) ({ host, port } = r); }
  return new Promise((res, rej) => {
    const t0 = Date.now(), sock = net.connect({ host, port });
    let buf = Buffer.alloc(0), done = false;
    const end = (e, v) => { if (done) return; done = true; clearTimeout(tm); sock.destroy(); e ? rej(e) : res(v); };
    const tm = setTimeout(() => end(new Error('El servidor no responde')), timeout);
    sock.on('connect', () => {
      const p = Buffer.alloc(2); p.writeUInt16BE(port);
      sock.write(packet(0, varint(767), mcStr(host), p, varint(1)));
      sock.write(packet(0));
    });
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      const a = readVarint(buf, 0); if (!a) return; const [len, o1] = a; if (buf.length < o1 + len) return;
      const b = readVarint(buf, o1); if (!b) return; const c = readVarint(buf, b[1]); if (!c) return;
      try {
        const j = JSON.parse(buf.slice(c[1], c[1] + c[0]).toString('utf8'));
        const txt = x => typeof x === 'string' ? x : x ? (x.text || '') + (x.extra || []).map(txt).join('') : '';
        end(null, { online: true, ms: Date.now() - t0, version: j.version && j.version.name || '', protocol: j.version && j.version.protocol,
          players: (j.players && j.players.online) || 0, max: (j.players && j.players.max) || 0, names: ((j.players && j.players.sample) || []).map(x => x.name).filter(Boolean).slice(0, 12),
          motd: txt(j.description).replace(/§./g, '').trim(), favicon: /^data:image\/png;base64,/.test(j.favicon || '') ? j.favicon : null });
      } catch (e) { end(new Error('Respuesta rara del servidor')); }
    });
    sock.on('error', e => end(new Error(/ENOTFOUND|EAI_AGAIN/.test(e.code) ? 'No existe esa dirección' : 'El servidor no responde')));
  });
}
async function versionFromPing(p) {   // «Paper 1.21.1» → 1.21.1 (la más alta que Fabric soporte)
  const known = await fabricVersions(), found = String(p.version || '').match(/\d+\.\d+(\.\d+)?/g) || [];
  const ok = found.filter(v => known.includes(v)).sort(verCmp);
  return ok[0] || null;
}

// ---------- amigos: sincronizar mods desde un código ----------
async function fetchManifest(code, silent) {
  let addr = (code || '').trim(), sync = null;
  if (!addr) throw new Error('Pega un código de invitación o una IP');
  if (addr.startsWith('CMP-')) {
    try { const c = JSON.parse(Buffer.from(addr.slice(4), 'base64url').toString()); sync = c.s; addr = c.g; }
    catch { throw new Error('El código de invitación no es válido'); }
  }
  const hp = h => h.includes(':') ? `[${h}]` : h, bases = [];
  let g = null; try { g = parseAddr(addr); } catch {}
  if (g) {
    // 1) la misma dirección con la que se juega (la puerta de Compass atiende el juego y los mods en el mismo puerto)
    let { host, port, explicit } = g;
    if (!explicit) { const r = await srvLookup(host); if (r) ({ host, port } = r); }
    bases.push(`http://${hp(host)}:${port}`);
    // 2) el puerto de sincronización de siempre, para anfitriones con versiones anteriores
    bases.push(`http://${hp(g.host)}:${SYNC_PORT}`);
  }
  if (sync) { try { const a = parseAddr(sync, SYNC_PORT); bases.push(`http://${hp(a.host)}:${a.port}`); } catch {} }
  const T = silent === 'quick' ? 3000 : silent ? 5000 : 8000;
  log('Buscando Compass en ' + [...new Set(bases)].join(', '));
  try {
    const { base, m } = await Promise.any([...new Set(bases)].map(b => J(b + '/manifest.json', { timeout: T }).then(m => {
      if (!m || !Array.isArray(m.mods)) throw new Error('no es Compass'); return { base: b, m };
    })));
    log('Anfitrión de Compass encontrado en ' + base);
    return { base, game: addr, m };
  } catch {
    const e = new Error('No se pudo contactar con el anfitrión. ¿Tiene el servidor encendido?'); e.noCompass = true; throw e;
  }
}
const looksLikeAddr = (p, n) => { let h = ''; try { h = parseAddr(p.server || '').host; } catch {} return !n || n === h || n === p.server || n === p.invite || n === 'Servidor de amigo' || /^[\d.:[\]]+$/.test(n) || /^CMP-/.test(n); };
async function applyHostInfo(p, m, base) {   // el nombre, la descripción y el icono del servidor (en vez de la IP)
  if (m.name && (looksLikeAddr(p, p.name) || p.name === p.hostName)) p.name = String(m.name).slice(0, 40);
  if (m.name) p.hostName = m.name;
  p.desc = String(m.desc || '').slice(0, 300); p.color = m.color || null;
  if (m.icon === false) delete p.icon;
  else {
    try {
      const r = await get(base + '/icon.png', { timeout: 5000 });
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); if (b.length < 400 * 1024 && b[0] === 0x89 && b[1] === 0x50) p.icon = 'data:image/png;base64,' + b.toString('base64'); }
    } catch {}
  }
}
async function similarMod(mod, mc, dir) {   // último recurso: el mismo mod en la tienda, en la versión que haya para este Minecraft
  if (!mod.mid && !mod.projectId) return null;
  const tmp = path.join(U(), 'tmp'), tried = new Set(); fs.mkdirSync(tmp, { recursive: true });
  const tryProj = async id => {
    if (!id || tried.has(id)) return null; tried.add(id);
    let v; try { v = pickVer(await projectVersions(id, mc)); } catch { return null; }
    if (!v) return null;
    const f = primary(v), tf = path.join(tmp, uid() + '-' + f.filename);
    try {
      await dl(f.url, tf);
      if (mod.mid && !metaHas(compat.readMeta(tf), mod.mid)) return null;   // comprobar que de verdad es ese mod
      fs.copyFileSync(tf, path.join(dir, f.filename)); return f.filename;
    } catch { return null; } finally { try { fs.unlinkSync(tf); } catch {} }
  };
  let r = await tryProj(mod.projectId); if (r) return r;
  for (const c of mod.mid ? depCandidates(mod.mid) : []) if ((r = await tryProj(c))) return r;
  const q = mod.title || String(mod.mid || '').replace(/[-_]/g, ' ');
  if (q) try {
    const facets = JSON.stringify([['project_type:mod'], ['categories:fabric'], [`versions:${mc}`]]);
    const s = await J(`${MR}/search?query=${enc(q)}&facets=${enc(facets)}&limit=5`);
    for (const h of s.hits || []) if ((r = await tryProj(h.project_id))) return r;
  } catch {}
  return null;
}
// Cada mod se busca primero en la tienda (Modrinth y CurseForge); si no está, se lo pasa el anfitrión
// directamente por internet; y si tampoco, se busca el mismo mod en la tienda para esta versión.
async function syncFriend(p, silent) {
  prog('Conectando con el anfitrión', 5);
  const { base, game, m } = await fetchManifest(p.invite || p.server, silent);
  await applyHostInfo(p, m, base);
  const dir = path.join(pdir(p), 'mods'); fs.mkdirSync(dir, { recursive: true });
  const want = new Map(m.mods.filter(x => x.file === path.basename(x.file) && /\.jar$/i.test(x.file)).map(x => [x.file, x]));
  const alt = p.alt = p.alt || {};
  for (const k of Object.keys(alt)) if (!want.has(k)) delete alt[k];
  const keep = new Set([...want.keys(), ...Object.values(alt)]);
  for (const f of p.managed || []) if (!keep.has(f)) for (const n of [f, f + '.disabled']) try { fs.unlinkSync(path.join(dir, n)); } catch {}
  const todo = [];
  for (const mod of want.values()) { const dest = path.join(dir, mod.file); if (!(fs.existsSync(dest) && await sha1(dest) === mod.sha1)) todo.push(mod); }
  // la tienda: Modrinth por el «hash» exacto del archivo y CurseForge por su huella
  let mr = {}, cf = new Map();
  if (todo.length) {
    prog('Buscando los mods en la tienda', 8);
    try {
      const vers = await J(`${MR}/version_files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes: todo.map(x => x.sha1), algorithm: 'sha1' }) });
      for (const [h, v] of Object.entries(vers || {})) { const f = (v.files || []).find(x => x.hashes && x.hashes.sha1 === h); if (f) mr[h] = f.url; }
    } catch (e) { log('Modrinth: ' + e.message); }
    const fps = todo.filter(x => x.fp != null && !x.url && !mr[x.sha1]).map(x => x.fp >>> 0);
    if (fps.length && cfg().cfKey) { try { cf = await cfLookup(fps); } catch (e) { log('CurseForge: ' + e.message); } }
  }
  const from = { tienda: 0, anfitrion: 0 }, similar = [], failed = [];
  let done = 0;
  await pool(todo, 4, async mod => {
    const dest = path.join(dir, mod.file), label = mod.title || mod.file.replace(/\.jar$/i, '');
    const tries = [...new Set([mod.url, mr[mod.sha1], mod.fp != null && cf.get(mod.fp >>> 0)].filter(Boolean))].map(u => ['tienda', u]);
    tries.push(['anfitrion', `${base}/mods/${enc(mod.file)}`]);
    let ok = false;
    for (const [src, u] of tries) {
      try { await dl(u, dest); if (await sha1(dest) === mod.sha1) { from[src]++; ok = true; break; } log(`${mod.file}: el archivo de ${src} no es idéntico`); }
      catch (e) { log(`${mod.file} (${src}): ${e.message}`); }
      try { fs.unlinkSync(dest); } catch {}
    }
    if (ok) { if (alt[mod.file]) { try { fs.unlinkSync(path.join(dir, alt[mod.file])); } catch {} delete alt[mod.file]; } }
    else if (alt[mod.file] && fs.existsSync(path.join(dir, alt[mod.file]))) similar.push(label);
    else { const a = await similarMod(mod, m.mc, dir); if (a) { alt[mod.file] = a; similar.push(label); } else failed.push(label); }
    prog('Descargando los mods del servidor', 10 + (++done / todo.length) * 85);
  });
  p.managed = [...new Set([...want.keys(), ...Object.values(alt)])]; try { await dropDupes(dir, p.managed); } catch {}
  p.mc = m.mc; p.server = game; p.compass = true; p.canWorld = !!m.world;
  await ensureFabric(p.mc);
  fs.writeFileSync(path.join(pdir(p), 'servers.dat'), serversDat([[p.name, game, p.icon]]));
  save(); prog('', 0);
  if (from.tienda || from.anfitrion) log(`Mods: ${from.tienda} de la tienda, ${from.anfitrion} del anfitrión, ${similar.length} parecidos, ${failed.length} sin conseguir`);
  return { mods: want.size, mc: m.mc, from, similar, failed };
}
// si tienes por tu cuenta un mod que el servidor ya trae (otra versión del mismo), manda el del servidor:
// se quita el tuyo para que Fabric no se queje de que está repetido
async function dropDupes(dir, managed) {
  const items = await listLocal(dir), keep = new Set(managed || []), ids = new Set(), gone = [];
  for (const i of items) if (keep.has(i.file)) { const m = metaOf(path.join(dir, i.file), i.sha1); if (m) ids.add(m.id); }
  for (const i of items) {
    if (keep.has(i.file) || !i.enabled) continue;
    const m = metaOf(path.join(dir, i.file), i.sha1);
    if (m && ids.has(m.id)) { try { fs.unlinkSync(path.join(dir, i.file)); gone.push(i.file); } catch {} }
  }
  if (gone.length) log('Quitados por repetidos (manda el del servidor): ' + gone.join(', '));
}
// «Entrar yo»: un perfil propio con la versión y los mods de TU servidor (igual que lo que reciben tus amigos),
// copiados directamente de la carpeta del servidor. Antes se usaba el perfil activo y, si sus mods no
// cuadraban con los del servidor (otra versión, un mod de Kotlin…), Fabric no arrancaba.
async function syncOwn(p) {
  const s = srv(p.own); if (!s) throw new Error('Ese servidor ya no existe');
  prog('Copiando los mods de tu servidor', 10);
  const dir = path.join(pdir(p), 'mods'), sm = path.join(sdir(s), 'mods'); fs.mkdirSync(dir, { recursive: true });
  // Se leen directamente de la carpeta del servidor (sin internet): los activados que no son solo de servidor
  // y también los solo de cliente, que el servidor desactiva al arrancar (.disabled) pero tú sí necesitas.
  const want = new Set(), keepMine = new Set(p.keepMine || []), mine = new Map();
  if (keepMine.size) for (const i of await listLocal(dir)) {   // dependencias que Compass actualizó solo en tu perfil (más nuevas que las del servidor)
    if (!i.enabled || (p.managed || []).includes(i.file)) continue;
    const m = metaOf(path.join(dir, i.file), i.sha1); if (m && keepMine.has(m.id)) mine.set(m.id, i.file);
  }
  if (s.type !== 'paper' && fs.existsSync(sm)) for (const i of await listLocal(sm)) {
    const src = path.join(sm, i.file), m = metaOf(src, i.sha1), name = i.file.replace(/\.disabled$/, '');
    if (m && m.env === 'server') continue;
    if (!i.enabled && !(m && m.env === 'client')) continue;
    if (m && mine.has(m.id)) continue;
    const dest = path.join(dir, name); want.add(name);
    try { fs.unlinkSync(dest + '.disabled'); } catch {}
    try { if (!(fs.existsSync(dest) && await sha1(dest) === i.sha1)) fs.copyFileSync(src, dest); }
    catch (e) { throw new Error(`no he podido copiar ${name} (${e.code || e.message})`); }
  }
  for (const f of p.managed || []) if (!want.has(f)) for (const n of [f, f + '.disabled']) try { fs.unlinkSync(path.join(dir, n)); } catch {}
  p.managed = [...want]; try { await dropDupes(dir, p.managed); } catch {}
  // la dirección: la puerta de Compass (25565) o, si no está, el puerto en el que escucha el servidor
  const port = gate ? GAME_PORT : (+readProps(s)['server-port'] || GAME_PORT);
  p.mc = s.mc; p.server = port === GAME_PORT ? '127.0.0.1' : '127.0.0.1:' + port; p.compass = true; p.name = s.name; p.desc = s.desc || ''; p.color = s.color || null;
  try { const b = fs.readFileSync(path.join(sdir(s), 'server-icon.png')); p.icon = 'data:image/png;base64,' + b.toString('base64'); } catch { delete p.icon; }
  await ensureFabric(p.mc);
  fs.writeFileSync(path.join(pdir(p), 'servers.dat'), serversDat([[p.name, p.server, p.icon]]));
  save(); prog('', 0);
  log(`Perfil de ${s.name}: ${want.size} mods copiados del servidor${mine.size ? ', y tuyos más nuevos: ' + [...mine.values()].join(', ') : ''}`);
  return { mods: want.size, mc: p.mc, from: { tienda: 0, anfitrion: want.size }, similar: [], failed: [] };
}
function ownProfile(sid) {   // el perfil de «Entrar yo» de un servidor tuyo (se crea la primera vez)
  const c = cfg(), s = srv(sid); if (!s) throw new Error('Servidor no encontrado');
  let p = c.profiles.find(x => x.own === sid);
  if (!p) { const id = uid(); p = { id, name: s.name, kind: 'friend', own: sid, mc: s.mc, ram: c.ram, dir: 'profiles/' + id, server: '127.0.0.1', autoJoin: true, managed: [], compass: true }; c.profiles.push(p); save(); }
  return p;
}
const syncNote = r => r.failed.length ? `No he podido conseguir: ${r.failed.join(', ')}. Pide a tu amigo que tenga el servidor encendido y vuelve a sincronizar.`
  : r.similar.length ? `De ${r.similar.join(', ')} he puesto la versión de la tienda (no la misma exacta que el servidor).` : '';

// ---------- sesión Microsoft ----------
function ensureLogin(interactive = true) {
  if (mcAuth) return Promise.resolve(mcAuth);
  if (loginP) return loginP;
  loginP = (async () => {
    const am = new Auth('select_account'), c = cfg();
    let x = null;
    if (c.msToken) { try { x = await am.refresh(c.msToken); } catch { log('La sesión guardada caducó.'); } }
    if (!x) { if (!interactive) throw new Error('sin sesión'); x = await am.launch('electron'); }
    mcAuth = await x.getMinecraft();
    c.msToken = x.save(); save();
    return mcAuth;
  })().finally(() => { loginP = null; });
  return loginP;
}
const me = a => ({ name: a.profile.name, uuid: a.profile.id || null });

// ---------- skin y capa (API oficial de Minecraft) ----------
const MCS = 'https://api.minecraftservices.com/minecraft/profile';
const SKINS = () => path.join(U(), 'skins');   // tus skins subidas desde Compass, para volver a ponerlas con un clic
async function mcApi(u, o = {}, retry = true) {
  const a = await ensureLogin(true), tok = a.mclc().access_token;
  const r = await get(u, { ...o, timeout: 20000, headers: { Authorization: 'Bearer ' + tok, ...(o.headers || {}) } });
  if (r.status === 401 && retry) { mcAuth = null; await ensureLogin(true); return mcApi(u, o, false); }   // el token dura 24 h: se renueva solo
  if (r.status === 429) throw new Error('Minecraft dice que esperes un momento antes de volver a cambiarla');
  if (!r.ok) { let m = ''; try { const j = await r.json(); m = j.errorMessage || j.error || ''; } catch {} throw new Error(`Minecraft no lo ha aceptado (${r.status})${m ? ': ' + m : ''}`); }
  const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return {}; }
}
async function texData(url) {   // las texturas pasan como data URL para poder dibujarlas en la interfaz
  if (!url) return null;
  try { const r = await get(url.replace(/^http:/, 'https:'), { timeout: 15000 }); if (!r.ok) return null; return 'data:image/png;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64'); } catch { return null; }
}
function skinLib() {
  const d = SKINS(); if (!fs.existsSync(d)) return [];
  const meta = jread(path.join(d, 'skins.json'), {});
  return fs.readdirSync(d).filter(f => /\.png$/i.test(f)).map(f => ({ file: f, variant: (meta[f] || {}).variant || 'classic', name: (meta[f] || {}).name || f.replace(/\.png$/i, ''), t: fs.statSync(path.join(d, f)).mtimeMs,
    data: 'data:image/png;base64,' + fs.readFileSync(path.join(d, f)).toString('base64') })).sort((a, b) => b.t - a.t).slice(0, 24);
}
function skinKeep(buf, variant, name) {   // guarda una copia en tu biblioteca (sin repetir)
  const d = SKINS(); fs.mkdirSync(d, { recursive: true });
  const h = require('crypto').createHash('sha1').update(buf).digest('hex').slice(0, 12), f = h + '.png';
  fs.writeFileSync(path.join(d, f), buf);
  const mf = path.join(d, 'skins.json'), meta = jread(mf, {}); meta[f] = { variant, name: String(name || (meta[f] || {}).name || 'Skin').slice(0, 40) }; fs.writeFileSync(mf, JSON.stringify(meta, null, 1));
  return f;
}
function skinCheck(buf) {
  if (!(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e)) throw new Error('La skin tiene que ser un PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (!(w === 64 && (h === 64 || h === 32))) throw new Error(`Una skin mide 64×64 (o 64×32) y esta mide ${w}×${h}`);
}
async function skinUpload(buf, variant, name) {
  skinCheck(buf);
  const fd = new FormData(); fd.append('variant', variant === 'slim' ? 'slim' : 'classic'); fd.append('file', new Blob([buf], { type: 'image/png' }), 'skin.png');
  await mcApi(MCS + '/skins', { method: 'POST', body: fd });
  skinKeep(buf, variant, name);
}

// ---------- ventana, bandeja, cierre ----------
function makeTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png')));
  tray.setToolTip(run ? 'Compass Launcher: servidor encendido' : 'Compass Launcher: esperando órdenes del móvil');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: () => win && win.show() },
    { label: 'Reiniciar servidor', click: () => H.hostRestart().catch(() => {}) },
    { label: 'Apagar servidor y salir', click: () => quitAll() },
    { type: 'separator' },
    { label: 'Salir de Compass', click: () => quitAll() },
  ]));
  tray.on('click', () => win && win.show());
}
async function quitAll() { quitting = true; try { await srvStop(); } catch {} await cleanupNet(); try { if (remote) await remote.stop(); } catch {} app.quit(); }

// ---------- como Lunar: ajustes compartidos, zoom con la C y menú de Compass ----------
const PREF = k => cfg()[k] !== false;   // shareOptions, zoomKey, freeLook, menuLogo, menuServer: activadas por defecto
// 1) Ajustes compartidos entre perfiles y versiones: controles, sonido, FOV, gráficos…
const SHARED = () => path.join(U(), 'ajustes-compartidos');
const OPT_FILES = ['options.txt', 'optionsof.txt', 'optionsshaders.txt'];
const OPT_LOCAL = new Set(['resourcePacks', 'incompatibleResourcePacks']);   // los packs de texturas siguen siendo de cada perfil
const readOpts = f => { const o = new Map(); try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) o.set(l.slice(0, i), l.slice(i + 1)); } } catch {} return o; };
const writeOpts = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, [...o].map(([k, v]) => k + ':' + v).join('\n') + '\n'); };
function optsIn(p) {   // antes de jugar: lo compartido pasa al perfil
  if (!PREF('shareOptions')) return;
  const sh = SHARED(); fs.mkdirSync(sh, { recursive: true });
  if (!fs.existsSync(path.join(sh, 'options.txt'))) {   // primera vez: se parte de los ajustes del perfil usado más recientemente
    const best = cfg().profiles.map(x => path.join(pdir(x), 'options.txt')).filter(f => fs.existsSync(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (best) for (const n of OPT_FILES) { const f = path.join(path.dirname(best), n); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(sh, n)); }
  }
  for (const n of OPT_FILES) {
    const src = path.join(sh, n), dst = path.join(pdir(p), n); if (!fs.existsSync(src)) continue;
    if (n !== 'options.txt') { fs.copyFileSync(src, dst); continue; }
    const mine = readOpts(dst), all = readOpts(src);
    for (const [k, v] of all) if (!OPT_LOCAL.has(k)) mine.set(k, v);
    writeOpts(dst, mine);
  }
}
function optsOut(p) {   // al cerrar el juego: lo que hayas cambiado vuelve a lo compartido (sin perder lo de otras versiones)
  if (!PREF('shareOptions')) return;
  try {
    const sh = SHARED(); fs.mkdirSync(sh, { recursive: true });
    for (const n of OPT_FILES) {
      const src = path.join(pdir(p), n), dst = path.join(sh, n); if (!fs.existsSync(src)) continue;
      if (n !== 'options.txt') { fs.copyFileSync(src, dst); continue; }
      const all = readOpts(dst), mine = readOpts(src), v0 = +all.get('version') || 0;
      for (const [k, v] of mine) if (!OPT_LOCAL.has(k)) all.set(k, v);
      if (v0 > (+mine.get('version') || 0)) all.set('version', String(v0));   // se queda la versión más nueva
      writeOpts(dst, all);
    }
    log('Ajustes guardados para todos los perfiles');
  } catch (e) { log('Ajustes compartidos: ' + e.message); }
}
// 2) Extras tipo Lunar que se instalan solos en tus perfiles: zoom con la C y vista libre con el Alt
//    (se eligen mods que ya traen esa tecla de serie; se prueba el siguiente si uno no existe para tu versión)
const EXTRAS = {
  zoom: { pref: 'zoomKey', field: 'zoomFiles', label: 'Zoom con la C', ids: ['zoomify', 'ok_zoomer', 'okzoomer', 'logical_zoom', 'wi_zoom'], slugs: ['zoomify', 'ok-zoomer'] },
  look: { pref: 'freeLook', field: 'lookFiles', label: 'Vista libre con el Alt', ids: ['swivel', 'shouldercheck', 'altcamera', 'freelook', 'freelookplusplus', 'simplelook', 'perspectivemod'], slugs: ['swivel', 'shouldercheck', 'altcamera', 'DSA6X7rF'] },
};
async function extraSetup(p, t, X) {
  const files = p[X.field] || [];
  if (!PREF(X.pref) || (p.extraOff || []).includes(X === EXTRAS.zoom ? 'zoom' : 'look')) {
    if (files.length) { for (const f of files) for (const n of [f, f + '.disabled']) try { fs.unlinkSync(path.join(t.mods, n)); } catch {} delete p[X.field]; save(); }
    return;
  }
  if (files.length && files.every(f => fs.existsSync(path.join(t.mods, f)))) return;
  for (const i of await listLocal(t.mods)) { const m = metaOf(path.join(t.mods, i.file), i.sha1); if (m && X.ids.includes(m.id)) return; }   // ya tiene uno
  const before = new Set(fs.readdirSync(t.mods));
  for (const slug of X.slugs) { try { if (await mrInstall(slug, t)) break; } catch (e) { log(`${X.label} (${slug}): ${e.message}`); } }
  try { await resolveDeps(t, true); } catch {}
  const added = fs.readdirSync(t.mods).filter(f => !before.has(f) && isMod(f));
  if (!added.length) { delete p[X.field]; return; }
  const bad = (await issuesOf(t)).filter(is => added.some(f => JSON.stringify(is).includes(f)));
  if (bad.length) {   // si choca con tus mods, se quita para no romper el juego
    for (const f of added) try { fs.unlinkSync(path.join(t.mods, f)); } catch {}
    log(`${X.label} quitado: ` + bad.map(b => b.text).join(' | ')); return;
  }
  p[X.field] = added; save(); log(`${X.label} instalado: ` + added.join(', '));
}
// 3) Menú de Compass: el logo de Compass Launcher en vez del de Minecraft y, en servidores, «Conectar al servidor»
const MENU_PACK = 'CompassMenu.zip';
function packFormat(mc) {
  const [a, b, c] = mc.split('.').map(Number);
  if (a !== 1) return 34;
  if (b === 17) return 7; if (b === 18) return 8;
  if (b === 19) return !c || c <= 2 ? 9 : c === 3 ? 12 : 13;
  if (b === 20 && (c || 0) <= 1) return 15;
  return 34;   // de 1.20.2 en adelante cuenta el rango «supported_formats» / «min_format»…«max_format»
}
function menuSetup(p) {
  const dir = path.join(pdir(p), 'resourcepacks'), zf = path.join(dir, MENU_PACK), opt = path.join(pdir(p), 'options.txt');
  const o = readOpts(opt), id = 'file/' + MENU_PACK;
  const list = k => { try { const v = JSON.parse(o.get(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  let packs = list('resourcePacks').filter(x => x !== id); const inc = list('incompatibleResourcePacks').filter(x => x !== id);
  const server = p.kind === 'friend' && PREF('menuServer'), on = PREF('menuLogo') || server;
  if (on) {
    const [a, b] = p.mc.split('.').map(Number), legacy = a === 1 && b < 20, z = new AdmZip(), fmt = packFormat(p.mc);
    z.addFile('pack.mcmeta', Buffer.from(JSON.stringify({ pack: { pack_format: fmt, supported_formats: { min_inclusive: 4, max_inclusive: 999 }, min_format: 4, max_format: 999, description: 'Menú de Compass Launcher' } })));
    try { z.addFile('pack.png', fs.readFileSync(path.join(__dirname, 'assets', 'icon.png'))); } catch {}
    if (PREF('menuLogo')) {
      z.addFile('assets/minecraft/textures/gui/title/minecraft.png', fs.readFileSync(path.join(__dirname, 'assets', 'menu', legacy ? 'minecraft-legacy.png' : 'minecraft.png')));
      z.addFile('assets/minecraft/textures/gui/title/edition.png', fs.readFileSync(path.join(__dirname, 'assets', 'menu', legacy ? 'edition-legacy.png' : 'edition.png')));   // «LAUNCHER» debajo del logo
    }
    if (server) {   // en un perfil de servidor, «Multijugador» pasa a ser «Conectar al servidor» (su lista solo tiene ese servidor)
      const txt = { 'menu.multiplayer': 'Conectar al servidor', 'selectServer.title': 'Conectar al servidor' };
      for (const lang of new Set(['en_us', 'es_es', 'es_mx', 'es_ar', 'ca_es', String(o.get('lang') || 'en_us').toLowerCase()]))
        if (/^[a-z]{2,3}_[a-z]{2,3}$/.test(lang)) z.addFile(`assets/minecraft/lang/${lang}.json`, Buffer.from(JSON.stringify(txt)));
    }
    fs.mkdirSync(dir, { recursive: true }); z.writeZip(zf);
    if (!packs.length) packs = ['vanilla'];
    packs.push(id);   // al final de la lista = encima de los demás
  } else { try { fs.unlinkSync(zf); } catch {} }
  o.set('resourcePacks', JSON.stringify(packs)); if (o.has('incompatibleResourcePacks') || inc.length) o.set('incompatibleResourcePacks', JSON.stringify(inc));
  writeOpts(opt, o);
}

// ---------- app del móvil: descarga y preparar el PC para encenderse solo ----------
const QR = require('./qr.js');
const APK_URL = 'https://github.com/luckicla/compass-launcher/releases/latest/download/Compass-Movil.apk';
// Pide permiso de administrador una vez y deja el PC listo para Wake-on-LAN:
// tarjeta de red con «despertar con paquete mágico» (también apagado), sin «inicio rápido» de Windows
// (con él activado el PC no se despierta estando apagado) y el cortafuegos abierto para el móvil.
async function prepareWake() {
  if (process.platform !== 'win32') throw new Error('Solo en Windows');
  const dir = path.join(os.tmpdir(), 'compass-wol-' + uid()); fs.mkdirSync(dir, { recursive: true });
  const ps1 = path.join(dir, 'preparar.ps1'), outf = path.join(dir, 'resultado.json');
  const script = `$ErrorActionPreference = 'SilentlyContinue'
$r = @{ adapters = @(); fastStartupOff = $false; firewall = $false }
$ads = Get-NetAdapter -Physical | Where-Object { $_.Status -ne 'Disabled' -and $_.MediaType -eq '802.3' }
foreach ($a in $ads) {
  Set-NetAdapterPowerManagement -Name $a.Name -WakeOnMagicPacket Enabled -NoRestart
  foreach ($k in @('*WakeOnMagicPacket','WakeOnMagicPacket','S5WakeOnLan','*ModernStandbyWoLMagicPacket','WolShutdownLinkSpeed')) {
    $p = Get-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $k
    if ($p) { if ($k -eq 'WolShutdownLinkSpeed') { Set-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $k -RegistryValue 2 -NoRestart } else { Set-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $k -RegistryValue 1 -NoRestart } }
  }
  powercfg /deviceenablewake "$($a.InterfaceDescription)" | Out-Null
  $pm = Get-NetAdapterPowerManagement -Name $a.Name
  $r.adapters += @{ name = $a.Name; desc = $a.InterfaceDescription; mac = $a.MacAddress; magic = "$($pm.WakeOnMagicPacket)" }
}
reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power" /v HiberbootEnabled /t REG_DWORD /d 0 /f | Out-Null
$r.fastStartupOff = ((Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power').HiberbootEnabled -eq 0)
Remove-NetFirewallRule -DisplayName 'Compass Launcher (movil)'
New-NetFirewallRule -DisplayName 'Compass Launcher (movil)' -Direction Inbound -Protocol TCP -LocalPort ${25580} -Action Allow -Profile Any | Out-Null
$r.firewall = $true
$r | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 '${outf.replace(/'/g, "''")}'
`;
  fs.writeFileSync(ps1, '﻿' + script, 'utf8');
  const q = x => `'${String(x).replace(/'/g, "''")}'`;
  try {
    await runCmd('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${q(ps1)}`]);
  } catch (e) { throw new Error(/cancel|1223/i.test(e.message) ? 'Has cancelado el permiso de administrador' : 'No se pudo preparar: ' + e.message); }
  let r; try { r = JSON.parse(fs.readFileSync(outf, 'utf8').replace(/^﻿/, '')); } catch { throw new Error('Has cancelado el permiso de administrador (o Windows no lo dejó)'); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  const ads = Array.isArray(r.adapters) ? r.adapters : r.adapters ? [r.adapters] : [];
  const res = { t: Date.now(), adapters: ads.map(a => ({ name: a.name, desc: a.desc, mac: a.mac, ok: /enabled/i.test(a.magic || '') })), fastStartupOff: !!r.fastStartupOff, firewall: !!r.firewall };
  const c = cfg(); c.remote = c.remote || {}; c.remote.prepared = res; save();
  log('Preparar encendido: ' + JSON.stringify(res));
  return res;
}

// ---------- actualizaciones automáticas (GitHub Releases) ----------
// Instalador: electron-updater descarga la versión nueva en segundo plano y se instala al cerrar (o al pulsar
// «Reiniciar y actualizar»). Portable: no se puede cambiar solo, así que se avisa y se abre la descarga.
const REPO = (() => { try { const p = require('./package.json').build.publish; const x = Array.isArray(p) ? p[0] : p; return { owner: x.owner, repo: x.repo }; } catch { return { owner: 'luckicla', repo: 'compass-launcher' }; } })();
const RELEASES = `https://github.com/${REPO.owner}/${REPO.repo}/releases`;
const upd = { state: 'idle', current: app.getVersion(), version: null, notes: '', pct: 0, error: '', checkedAt: 0, portable: !!process.env.PORTABLE_EXECUTABLE_FILE, dev: !app.isPackaged, url: RELEASES };
let au = null, updTimer = null, updNotified = null;
const pushUpd = () => send('upd', { ...upd, auto: cfg().autoUpdate !== false });
const semverGt = (a, b) => { const x = String(a).replace(/^v/, '').split(/[.-]/).map(n => parseInt(n) || 0), y = String(b).replace(/^v/, '').split(/[.-]/).map(n => parseInt(n) || 0); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const cleanNotes = n => (Array.isArray(n) ? n.map(x => x.note || '').join('\n') : String(n || '')).replace(/<[^>]+>/g, '').replace(/\r/g, '').trim().slice(0, 4000);
function updSet(patch) {
  Object.assign(upd, patch); pushUpd();
  // aviso del sistema solo si Compass está escondido o en segundo plano (si no, sale el aviso con el estilo del tema dentro de la app)
  if ((upd.state === 'available' || upd.state === 'downloaded') && updNotified !== upd.state + upd.version && win && !win.isDestroyed() && (!win.isVisible() || !win.isFocused())) {
    updNotified = upd.state + upd.version;
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) { const n = new Notification({ title: 'Compass Launcher ' + upd.version, body: upd.state === 'downloaded' ? 'La actualización está lista: se instala al cerrar Compass.' : 'Hay una versión nueva disponible.', icon: path.join(__dirname, 'assets', 'icon.png') }); n.on('click', () => { if (win) { win.show(); win.focus(); send('openUpdates'); } }); n.show(); }
    } catch {}
  }
}
function setupUpdates() {
  if (upd.dev) { upd.state = 'dev'; return; }
  if (!upd.portable) {
    try { au = require('electron-updater').autoUpdater; } catch (e) { log('Actualizaciones: ' + e.message); }
    if (au) {
      au.logger = { info: m => log('[actualizar] ' + m), warn: m => log('[actualizar] ' + m), error: m => log('[actualizar] ' + m), debug: () => {} };
      au.autoDownload = cfg().autoUpdate !== false; au.autoInstallOnAppQuit = true; au.allowPrerelease = false;
      au.on('checking-for-update', () => updSet({ state: 'checking', error: '' }));
      au.on('update-available', i => updSet({ state: au.autoDownload ? 'downloading' : 'available', version: i.version, notes: cleanNotes(i.releaseNotes), pct: 0 }));
      au.on('update-not-available', () => updSet({ state: 'latest', checkedAt: Date.now() }));
      au.on('download-progress', p => updSet({ state: 'downloading', pct: Math.round(p.percent || 0) }));
      au.on('update-downloaded', i => updSet({ state: 'downloaded', version: i.version, notes: cleanNotes(i.releaseNotes) || upd.notes, pct: 100 }));
      au.on('error', e => updSet({ state: 'error', error: friendlyUpdErr(e) }));
    }
  }
  setTimeout(() => updCheck().catch(() => {}), 8000);
  updTimer = setInterval(() => updCheck().catch(() => {}), 4 * 3600e3);   // y cada 4 horas
}
const friendlyUpdErr = e => { const m = String(e && e.message || e); return /net::|ENOTFOUND|ECONN|ETIMEDOUT|Sin conexión|Tiempo/i.test(m) ? 'Sin conexión con GitHub. Lo vuelvo a mirar más tarde.' : /404/.test(m) ? 'Aún no hay versiones publicadas.' : m.split('\n')[0].slice(0, 200); };
async function updCheck() {
  if (upd.dev) return upd;
  if (upd.state === 'downloading' || upd.state === 'downloaded') return upd;
  if (au) { try { await au.checkForUpdates(); } catch (e) { updSet({ state: 'error', error: friendlyUpdErr(e) }); } return upd; }
  // portable (o sin electron-updater): se mira la última versión en GitHub
  updSet({ state: 'checking', error: '' });
  try {
    const r = await J(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    const v = String(r.tag_name || '').replace(/^v/, ''), exe = (r.assets || []).find(a => /Portable.*\.exe$/i.test(a.name)) || (r.assets || []).find(a => /\.exe$/i.test(a.name));
    if (v && semverGt(v, upd.current)) updSet({ state: 'available', version: v, notes: cleanNotes(r.body), url: exe ? exe.browser_download_url : r.html_url || RELEASES });
    else updSet({ state: 'latest', checkedAt: Date.now() });
  } catch (e) { updSet({ state: 'error', error: friendlyUpdErr(e) }); }
  return upd;
}

// ---------- acciones expuestas a la interfaz ----------
const folderOf = { game: p => pdir(p), mods: p => path.join(pdir(p), 'mods'), saves: p => path.join(pdir(p), 'saves'),
  screenshots: p => path.join(pdir(p), 'screenshots'), resourcepacks: p => path.join(pdir(p), 'resourcepacks'), logs: p => path.join(pdir(p), 'logs') };
const sfolderOf = { server: s => sdir(s), mods: s => path.join(sdir(s), 'mods'), world: s => path.join(sdir(s), readProps(s)['level-name'] || 'world'),
  logs: s => path.join(sdir(s), 'logs'), backups: s => path.join(sdir(s), 'backups'), crash: s => path.join(sdir(s), 'crash-reports') };
const BK = s => path.join(sdir(s), 'backups');
const copyJars = (files, dest) => { fs.mkdirSync(dest, { recursive: true }); files.forEach(p => fs.copyFileSync(p, path.join(dest, path.basename(p)))); return files.length; };
const quickPlay = (mc, addr) => {
  const p = mc.split('.').map(Number), modern = p[0] > 1 || p[1] >= 20, dir = path.join(ROOT(), 'quickPlay'); fs.mkdirSync(dir, { recursive: true });
  return { type: modern ? 'multiplayer' : 'legacy', identifier: addr };   // entra directo al servidor, sin pasar por el menú
};

const H = {
  state: async () => {
    const c = cfg(), latest = (await fabricVersions())[0]; let ch = false;
    for (const x of [...c.profiles, ...c.servers]) if (!x.mc) { x.mc = latest; ch = true; }
    if (!prof(c.active)) { c.active = c.profiles[0] && c.profiles[0].id; ch = true; }
    if (ch) save();
    return { profiles: c.profiles, servers: c.servers.map(x => ({ ...x, offline: readProps(x)['online-mode'] === 'false', icon: fs.existsSync(path.join(sdir(x), 'server-icon.png')) })), active: c.active, ram: c.ram, hasKey: !!c.cfKey, game: gameState, host: hostView(), minOnPlay: c.minOnPlay !== false, showHost: c.showHost != null ? c.showHost : c.servers.length > 0, onboarded: !!c.onboarded, prefs: { shareOptions: PREF('shareOptions'), zoomKey: PREF('zoomKey'), freeLook: PREF('freeLook'), menuLogo: PREF('menuLogo'), menuServer: PREF('menuServer') }, look: c.look || {}, glassOk: glassOk() };
  },
  sysInfo: async () => ({ totalGb: Math.floor(os.totalmem() / 2 ** 30), versions: await fabricVersions(), all: await mcVersions(), snapshots: !!cfg().showSnapshots, app: app.getVersion() }),
  // ----- actualizaciones -----
  updState: async () => ({ ...upd, auto: cfg().autoUpdate !== false }),
  updCheck: async () => { await updCheck(); return { ...upd, auto: cfg().autoUpdate !== false }; },
  updDownload: async () => {
    if (au && upd.state === 'available') { updSet({ state: 'downloading', pct: 0 }); au.downloadUpdate().catch(e => updSet({ state: 'error', error: friendlyUpdErr(e) })); }
    else await shell.openExternal(upd.url || RELEASES);   // portable: se abre la descarga del .exe nuevo
  },
  updInstall: async () => {
    if (!au || upd.state !== 'downloaded') throw new Error('Todavía no se ha descargado la actualización');
    quitting = true; try { await srvStop(); } catch {} try { await cleanupNet(); } catch {}
    setImmediate(() => au.quitAndInstall(true, true));   // instala en silencio y vuelve a abrir Compass
  },
  updAuto: async v => { cfg().autoUpdate = !!v; save(); if (au) au.autoDownload = !!v; if (v && upd.state === 'available' && au) au.downloadUpdate().catch(() => {}); pushUpd(); },
  updPage: async () => shell.openExternal(RELEASES),
  // ----- app del móvil -----
  remoteInfo: async () => ({ ...(await remote.info()), clients: remote.clients(), apk: APK_URL }),
  remoteSet: async patch => {
    const c = cfg(); c.remote = c.remote || {};
    if ('name' in patch) c.remote.name = String(patch.name || '').trim().slice(0, 40) || os.hostname();
    if ('on' in patch) {
      c.remote.on = !!patch.on;
      if (c.remote.on) {   // para que se pueda encender desde el móvil, Compass se abre solo (escondido) al entrar en Windows
        c.openAtLogin = true; try { app.setLoginItemSettings({ openAtLogin: true, args: ['--compass-hidden'] }); } catch {}
        await remote.start();
      } else await remote.stop();
    }
    save(); return H.remoteInfo();
  },
  remotePairing: async () => { const code = await remote.pairing(); return { code, svg: QR.svg(code, { ecl: 'L', border: 2 }) }; },
  remoteNewKey: async () => { remote.newKey(); return H.remoteInfo(); },
  remoteForget: async id => { const r = cfg().remote || {}; r.devices = (r.devices || []).filter(d => d.id !== id); save(); return H.remoteInfo(); },
  apkQr: async () => QR.svg(APK_URL, { ecl: 'M', border: 2 }),
  remoteOpen: async w => {
    if (w === 'netplwiz') spawn('netplwiz', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    else if (w === 'signin') await shell.openExternal('ms-settings:signinoptions');
    else if (w === 'power') await shell.openExternal('ms-settings:powersleep');
    else if (w === 'apk') await shell.openExternal(APK_URL);
  },
  remotePrepare: async () => prepareWake(),
  javaAll: async () => javaAll(),
  // botones propios de la ventana (minimizar, maximizar, cerrar), como en Discord
  win: async a => {
    if (!win || win.isDestroyed()) return null;
    if (a === 'min') win.minimize();
    else if (a === 'max') { if (win.isFullScreen()) win.setFullScreen(false); else if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (a === 'close') win.close();   // pasa por el aviso de «servidor encendido»
    return { max: win.isMaximized(), full: win.isFullScreen(), focus: win.isFocused() };
  },
  paste: async () => clipboard.readText(),
  copy: async t => { clipboard.writeText(String(t)); },
  setRam: async r => { if (/^\d+G$/.test(r)) { cfg().ram = r; save(); } },
  setKey: async k => { cfg().cfKey = (k || '').trim(); save(); },
  setPref: async (k, v) => {
    if (['minOnPlay', 'showHost', 'onboarded', 'shareOptions', 'zoomKey', 'freeLook', 'menuLogo', 'menuServer', 'showSnapshots'].includes(k)) { cfg()[k] = !!v; save(); }
    if (k === 'look' && v && typeof v === 'object') { cfg().look = cleanLook(v); save(); applyLook(); }
  },
  logError: async m => { log('[interfaz] ' + String(m).slice(0, 4000)); },
  openLog: async () => { log('Registro abierto desde Ajustes.'); await new Promise(r => logStream ? logStream.write('', r) : r()); const e = await shell.openPath(LOGF()); if (e) throw new Error('No se pudo abrir el registro: ' + e); },
  openApp: async w => { const p = { data: U(), root: ROOT(), java: path.join(U(), 'java') }[w]; if (p) { fs.mkdirSync(p, { recursive: true }); await shell.openPath(p); } },

  login: async () => me(await ensureLogin(true)),
  skinGet: async () => {   // tu skin y tus capas actuales
    const p = await mcApi(MCS), sk = (p.skins || []).find(x => x.state === 'ACTIVE') || (p.skins || [])[0] || null;
    const capes = await Promise.all((p.capes || []).map(async c => ({ id: c.id, name: c.alias || 'Capa', on: c.state === 'ACTIVE', data: await texData(c.url) })));
    const skin = sk ? { url: sk.url, variant: String(sk.variant || 'CLASSIC').toLowerCase() === 'slim' ? 'slim' : 'classic', data: await texData(sk.url) } : null;
    if (skin && skin.data) { try { const d = SKINS(), b = Buffer.from(skin.data.split(',')[1], 'base64'), h = require('crypto').createHash('sha1').update(b).digest('hex').slice(0, 12); if (!fs.existsSync(path.join(d, h + '.png'))) skinKeep(b, skin.variant, 'Mi skin'); } catch {} }
    return { name: p.name, uuid: p.id, skin, capes, lib: skinLib() };
  },
  skinPick: async () => {   // elegir un PNG del PC
    const r = await dialog.showOpenDialog(win, { title: 'Elige tu skin (PNG de 64×64)', properties: ['openFile'], filters: [{ name: 'Skin de Minecraft', extensions: ['png'] }] });
    if (r.canceled) return null;
    const b = fs.readFileSync(r.filePaths[0]); skinCheck(b);
    return { data: 'data:image/png;base64,' + b.toString('base64'), name: path.basename(r.filePaths[0]).replace(/\.png$/i, '') };
  },
  skinSet: async ({ data, variant, name }) => {
    const m = /^data:image\/png;base64,(.+)$/.exec(String(data || '')); if (!m) throw new Error('La skin no es válida');
    await skinUpload(Buffer.from(m[1], 'base64'), variant, name); return true;
  },
  skinVariant: async ({ url, data, variant }) => {   // cambiar entre brazos normales y finos con la misma skin
    if (data) { const m = /^data:image\/png;base64,(.+)$/.exec(data); if (m) { await skinUpload(Buffer.from(m[1], 'base64'), variant); return true; } }
    await mcApi(MCS + '/skins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variant: variant === 'slim' ? 'slim' : 'classic', url }) }); return true;
  },
  skinReset: async () => { await mcApi(MCS + '/skins/active', { method: 'DELETE' }); return true; },
  skinForget: async file => { const f = path.join(SKINS(), path.basename(String(file))); try { fs.unlinkSync(f); } catch {} return skinLib(); },
  capeSet: async id => {
    if (id) await mcApi(MCS + '/capes/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId: id }) });
    else await mcApi(MCS + '/capes/active', { method: 'DELETE' });
    return true;
  },
  autologin: async () => { try { return cfg().msToken ? me(await ensureLogin(false)) : null; } catch { return null; } },
  logout: async () => { mcAuth = null; delete cfg().msToken; save(); },

  // ----- perfiles -----
  setActive: async id => { if (prof(id)) { cfg().active = id; save(); } },
  profileAdd: async ({ name, mc, ram, desc, icon }) => {
    const id = uid(), p = { id, name: (name || '').trim() || 'Nuevo perfil', kind: 'local', mc: mc || (await fabricVersions())[0], ram: ram || cfg().ram, dir: 'profiles/' + id };
    if (desc) p.desc = String(desc).slice(0, 300);
    if (okIcon(icon)) p.icon = icon;
    fs.mkdirSync(path.join(pdir(p), 'mods'), { recursive: true });
    cfg().profiles.push(p); save(); return p;
  },
  profileSet: async (id, patch) => {
    const p = prof(id); if (!p) throw new Error('Perfil no encontrado');
    for (const k of ['name', 'mc', 'ram', 'autoJoin']) if (k in patch && !(k === 'mc' && p.kind === 'friend' && p.compass !== false)) p[k] = patch[k];
    if ('desc' in patch) p.desc = String(patch.desc || '').slice(0, 300);
    if ('icon' in patch) { if (okIcon(patch.icon)) p.icon = patch.icon; else delete p.icon; }
    if (!String(p.name).trim()) p.name = 'Perfil';
    save(); return p;
  },
  profileWorlds: async id => {   // mundos de un perfil (para llevarse uno al convertirlo en servidor)
    const p = prof(id); if (!p) return [];
    const d = path.join(pdir(p), 'saves'); if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(d, e.name, 'level.dat')))
      .map(e => ({ folder: e.name, name: (WM.levelInfo(path.join(d, e.name)) || {}).name || e.name, mtime: fs.statSync(path.join(d, e.name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  },
  // un perfil de jugador → un servidor: misma versión, sus mods (los solo de cliente quedan desactivados en el
  // servidor pero tus amigos los reciben igual), su imagen, su descripción y, si quieres, uno de sus mundos
  profileToServer: async (id, { world } = {}) => {
    const p = prof(id); if (!p) throw new Error('Perfil no encontrado');
    const sid = uid(), s = { id: sid, name: p.name, mc: p.mc, ram: cfg().ram, dir: 'servers/' + sid, mode: 'online', autoRestart: false, type: 'fabric', desc: p.desc || '' };
    const sm = path.join(sdir(s), 'mods'), pm = path.join(pdir(p), 'mods'); fs.mkdirSync(sm, { recursive: true });
    let n = 0;
    for (const i of await listLocal(pm)) {
      if (!i.enabled) continue;
      const src = path.join(pm, i.file), m = metaOf(src, i.sha1);
      fs.copyFileSync(src, path.join(sm, i.file + (m && m.env === 'client' ? '.disabled' : ''))); n++;
    }
    setProps(s, { motd: p.desc ? String(p.desc).replace(/[\r\n]+/g, ' ').slice(0, 59) : 'Un servidor de Compass', 'max-players': 10, 'server-port': GAME_PORT, 'online-mode': 'true' });
    const ic = /^data:image\/png;base64,(.+)$/.exec(p.icon || ''); if (ic) fs.writeFileSync(path.join(sdir(s), 'server-icon.png'), Buffer.from(ic[1], 'base64'));
    if (world) {
      const src = path.join(pdir(p), 'saves', path.basename(world));
      if (fs.existsSync(path.join(src, 'level.dat'))) { fs.cpSync(src, path.join(sdir(s), 'world'), { recursive: true, filter: f => !/session\.lock$/.test(f) }); setProps(s, { 'level-name': 'world' }); }
    }
    cfg().servers.push(s); cfg().showHost = true; save();
    log(`Perfil ${p.name} convertido en servidor (${n} mods)`);
    return { id: sid, mods: n };
  },
  profileDel: async (id, files) => {
    const c = cfg(), p = prof(id); if (!p) return;
    if (c.profiles.length < 2) throw new Error('Tiene que quedar al menos un perfil');
    if (files && p.dir !== 'instance') fs.rmSync(pdir(p), { recursive: true, force: true });
    c.profiles = c.profiles.filter(x => x.id !== id);
    if (c.active === id) c.active = c.profiles[0].id;
    save();
  },
  profileOpen: async (id, what) => { const p = prof(id); if (p && folderOf[what]) { const d = folderOf[what](p); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); } },
  // unirse con un código CMP-… o con una IP / dominio cualquiera: crea (o reutiliza) un perfil para ese servidor
  join: async code => {
    const inv = String(code || '').trim(), c = cfg();
    if (!inv) throw new Error('Escribe la IP o pega el código de tu amigo');
    prog('Buscando el servidor', 3);
    let p = c.profiles.find(x => x.kind === 'friend' && (x.invite === inv || x.server === inv));
    try {
      const { game, m } = await fetchManifest(inv);
      if (!p) p = c.profiles.find(x => x.kind === 'friend' && x.server === game);
      if (!p) { const id = uid(); p = { id, name: m.name || 'Servidor de amigo', kind: 'friend', mc: m.mc, ram: c.ram, dir: 'profiles/' + id, invite: inv, server: game, autoJoin: true, managed: [] }; c.profiles.push(p); }
      p.invite = inv; save();
      const r = await syncFriend(p, false);
      c.active = p.id; save();
      return { id: p.id, ...r, note: syncNote(r), compass: true };
    } catch (e) {
      if (!e.noCompass) { prog('', 0); throw e; }
    }
    // no es un servidor de Compass: se mira el servidor de Minecraft directamente para saber la versión
    const game = inv.startsWith('CMP-') ? JSON.parse(Buffer.from(inv.slice(4), 'base64url').toString()).g : inv;
    let ping; try { ping = await slpPing(game, 6000); } catch (e) { prog('', 0); throw new Error(`No encuentro ningún servidor en «${game}». Revisa la dirección y que esté encendido.`); }
    const mc = await versionFromPing(ping) || (await fabricVersions())[0];
    const host = parseAddr(game).host;
    // nombre: la primera línea del mensaje del servidor (MOTD) en vez de la IP; icono y descripción también de ahí
    const motd = String(ping.motd || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean), title = (motd[0] || '').slice(0, 40);
    if (!p) { const id = uid(); p = { id, name: title || host, kind: 'friend', mc, ram: c.ram, dir: 'profiles/' + id, invite: inv, server: game, autoJoin: true, managed: [], compass: false }; c.profiles.push(p); }
    else if (title && looksLikeAddr(p, p.name)) p.name = title;
    Object.assign(p, { mc, server: game, compass: false, canWorld: false, desc: motd.slice(1).join(' ').slice(0, 300) });
    if (ping.favicon) p.icon = ping.favicon;
    fs.mkdirSync(path.join(pdir(p), 'mods'), { recursive: true });
    fs.writeFileSync(path.join(pdir(p), 'servers.dat'), serversDat([[p.name, game, p.icon]]));
    try { await ensureFabric(mc); } catch {}
    c.active = p.id; save(); prog('', 0);
    return { id: p.id, mods: 0, mc, compass: false, guessed: !(await versionFromPing(ping)) };
  },
  // estado (encendido, jugadores, versión) de los servidores de tus amigos
  friendStatus: async () => {
    const out = {};
    await Promise.all(cfg().profiles.filter(p => p.kind === 'friend' && p.server).map(async p => {
      try { out[p.id] = await slpPing(p.server, 3000); } catch (e) { out[p.id] = { online: false, error: e.message }; }
    }));
    return out;
  },
  // copia del mapa del servidor de un amigo, para jugarlo tú solo en ese perfil
  friendWorld: async id => {
    const p = prof(id); if (!p || p.kind !== 'friend') throw new Error('Perfil no encontrado');
    let r; try { r = await fetchManifest(p.invite); } catch { throw new Error('Solo se puede copiar el mapa de servidores de Compass que estén encendidos.'); }
    if (!r.m.world) throw new Error('Tu amigo no comparte el mapa. Lo puede activar en los ajustes de su servidor.');
    const tmp = path.join(os.tmpdir(), 'compass-copia-' + uid()), zip = tmp + '.zip';
    try {
      prog('Pidiendo el mapa a tu amigo', 2);
      await dl(r.base + '/world.zip', zip, 'Descargando el mapa');
      prog('Descomprimiendo el mapa', 99);
      fs.mkdirSync(tmp, { recursive: true }); await runCmd('tar', ['-xf', zip, '-C', tmp]);
      const root = findWorldRoot(tmp); if (!root) throw new Error('El mapa descargado no trae level.dat');
      return copyWorldTo(root, path.join(pdir(p), 'saves'), `${p.name} copia ${new Date().toLocaleDateString('es').replace(/\//g, '-')}`);
    } finally { prog('', 0); try { fs.rmSync(tmp, { recursive: true, force: true }); fs.unlinkSync(zip); } catch {} }
  },
  // copia del mapa de uno de tus servidores a un perfil (para jugarlo en individual)
  worldToProfile: async (sid, pid) => {
    const s = srv(sid), p = prof(pid); if (!s || !p) throw new Error('Servidor o perfil no encontrado');
    const live = run && run.id === sid && run.proc && run.state === 'ready';
    if (live) { srvCmd('save-off'); srvCmd('save-all flush'); await sleep(3500); }
    try {
      const src = path.join(sdir(s), levelName(s)); if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Todavía no hay mundo: enciende el servidor una vez');
      return copyWorldTo(src, path.join(pdir(p), 'saves'), `${s.name} copia`);
    } finally { if (live) srvCmd('save-on'); }
  },
  resync: async id => { const p = prof(id); if (!p || p.kind !== 'friend') throw new Error('Este perfil no es de un amigo'); const r = p.own ? await syncOwn(p) : await syncFriend(p, false); return { ...r, note: syncNote(r) }; },
  ownProfile: async sid => ownProfile(sid).id,
  hybridVersions: async () => hybridVersions(),

  // ----- servidores -----
  serverAdd: async ({ name, mc, ram, type }) => {
    const id = uid(), s = { id, name: (name || '').trim() || 'Nuevo servidor', mc: mc || (await fabricVersions())[0], ram: ram || cfg().ram, dir: 'servers/' + id, mode: 'online', autoRestart: false, type: ['paper', 'hybrid'].includes(type) ? type : 'fabric' };
    if (s.type !== 'paper') fs.mkdirSync(path.join(sdir(s), 'mods'), { recursive: true });
    if (s.type !== 'fabric') fs.mkdirSync(path.join(sdir(s), 'plugins'), { recursive: true });
    setProps(s, { motd: 'Un servidor de Compass', 'max-players': 10, 'server-port': GAME_PORT, 'online-mode': 'true' });
    cfg().servers.push(s); save(); return s;
  },
  serverSet: async (id, patch) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    for (const k of ['name', 'mc', 'ram', 'mode', 'autoRestart', 'shareWorld', 'welcome', 'desc', 'color', 'type']) if (k in patch) s[k] = patch[k];
    if (!['paper', 'hybrid'].includes(s.type)) s.type = 'fabric';
    s.welcome = String(s.welcome || '').replace(/[\r\n]+/g, ' ').slice(0, 200); s.desc = String(s.desc || '').slice(0, 300);
    if (s.color && !/^#[0-9a-f]{6}$/i.test(s.color)) delete s.color;
    if (!String(s.name).trim()) s.name = 'Servidor';
    save(); return s;
  },
  serverDel: async (id, files) => {
    const c = cfg(), s = srv(id); if (!s) return;
    if (run && run.id === id) throw new Error('Para el servidor antes de borrarlo');
    if (files) fs.rmSync(sdir(s), { recursive: true, force: true });
    c.servers = c.servers.filter(x => x.id !== id); save();
  },
  serverOpen: async (id, what) => {
    const s = srv(id); if (!s) return;
    if (what === 'props') { if (!fs.existsSync(propsFile(s))) setProps(s, {}); return void await shell.openPath(propsFile(s)); }
    if (sfolderOf[what]) { const d = sfolderOf[what](s); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); }
  },
  serverProps: async id => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const d = { motd: 'Un servidor de Compass', 'max-players': '10', gamemode: 'survival', difficulty: 'easy', pvp: 'true', 'white-list': 'false', 'online-mode': 'true',
      'view-distance': '10', 'simulation-distance': '10', 'spawn-protection': '16', 'allow-flight': 'false', 'level-seed': '',
      hardcore: 'false', 'enable-command-block': 'false', 'op-permission-level': '4', 'level-type': 'minecraft:normal', 'force-gamemode': 'false', 'spawn-monsters': 'true', 'enforce-whitelist': 'false', 'resource-pack': '', 'resource-pack-sha1': '', 'require-resource-pack': 'false', 'resource-pack-prompt': '', 'hide-online-players': 'false' }, p = readProps(s);
    return Object.fromEntries(PKEYS.map(k => [k, k in p ? p[k] : d[k]]));
  },
  setServerProps: async (id, patch) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    setProps(s, Object.fromEntries(Object.entries(patch).filter(([k]) => PKEYS.includes(k))));
  },
  hostStart: async (id, o = {}) => {
    if (run) throw new Error('Ya hay un servidor en marcha' + (srv(run.id) ? ': ' + srv(run.id).name : ''));
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const t = tgt({ kind: 'server', id });
    if (t.type === 'paper' || t.type === 'hybrid') { fs.mkdirSync(t.plugins, { recursive: true }); try { await resolvePluginDeps(s); } catch {} }
    if (t.type !== 'paper') { fs.mkdirSync(t.mods, { recursive: true });
      if (!o.force) { try { await resolveDeps(t); } catch {} const issues = await issuesOf(t); if (issues.length) return { blocked: true, issues }; } }
    if (run) throw new Error('Ya hay un servidor en marcha');
    if (previewBusy) throw new Error('Espera a que termine la vista previa del mundo');
    applyDimProps(s);
    srvLines = [];
    run = { id, proc: null, state: 'starting', players: [], share: null, ip: null, note: 'Preparando…', stopping: false, restarting: false, crashes: 0, wasReady: false, waiters: [] };
    const r = run; pushHost();
    ensureFirewall().catch(e => log('Cortafuegos: ' + e.message));
    try {
      await srvSpawn(s, r);
      if (run === r && !r.stopping) srvNet(s, r).then(x => { if (run === r) hset(x); })
        .catch(e => { log('Red: ' + e.message); if (run === r) hset({ note: 'El servidor funciona, pero no se pudo exponer a internet: ' + e.message }); });
    } catch (e) { if (run === r) { await cleanupNet(); run = null; pushHost(); } throw e; }
    return { ok: true };
  },
  hostStop: async () => srvStop(false),
  hostKill: async () => srvStop(true),
  hostRestart: async () => {
    const r = run; if (!r || !r.proc || r.stopping || r.restarting) return;
    const p = r.proc; r.restarting = true; hset({ state: 'restarting', players: [] });
    try { p.stdin.write('stop\n'); } catch {}
    setTimeout(() => { if (run === r && r.proc === p && r.restarting) try { p.kill(); } catch {} }, 35000);
  },
  hostCmd: async c => srvCmd(c),
  hostLog: async () => srvLines,
  backupList: async id => {
    const s = srv(id); if (!s || !fs.existsSync(BK(s))) return [];
    return fs.readdirSync(BK(s)).filter(f => f.endsWith('.zip')).map(f => { const st = fs.statSync(path.join(BK(s), f)); return { file: f, size: st.size, time: st.mtimeMs }; }).sort((a, b) => b.time - a.time);
  },
  backupCreate: async id => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const lvl = readProps(s)['level-name'] || 'world';
    if (!fs.existsSync(path.join(sdir(s), lvl))) throw new Error('Todavía no hay mundo: arranca el servidor al menos una vez');
    const live = run && run.id === id && run.proc && run.state === 'ready';
    if (live) { srvCmd('save-off'); srvCmd('save-all flush'); await sleep(4000); }
    try {
      fs.mkdirSync(BK(s), { recursive: true });
      const name = `${lvl}-${stamp()}.zip`;
      await runCmd('tar', ['-a', '-cf', path.join(BK(s), name), '-C', sdir(s), lvl]);
      return name;
    } finally { if (live) srvCmd('save-on'); }
  },
  backupRestore: async (id, file) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (run && run.id === id) throw new Error('Para el servidor antes de restaurar una copia');
    const zip = path.join(BK(s), path.basename(file)), lvl = readProps(s)['level-name'] || 'world', wd = path.join(sdir(s), lvl);
    if (!fs.existsSync(zip)) throw new Error('No encuentro esa copia');
    if (fs.existsSync(wd)) fs.renameSync(wd, wd + '.antes-de-restaurar-' + stamp());
    await runCmd('tar', ['-xf', zip, '-C', sdir(s)]);
  },
  backupDelete: async (id, file) => { const s = srv(id); if (s) fs.unlinkSync(path.join(BK(s), path.basename(file))); },

  // ----- mods (sirven para perfiles y servidores) -----
  modCount: async t => { try { return (await listLocal(tgt(t).mods)).filter(i => i.enabled).length; } catch { return 0; } },
  scan: async t => scanMods(tgt(t).mods),
  checkCompat: async t => (await issuesOf(tgt(t))),
  fixMods: async t => autoFix(tgt(t)),
  toggleMod: async (t, file) => { const f = path.basename(file), p = path.join(tgt(t).mods, f); fs.renameSync(p, f.endsWith('.disabled') ? p.slice(0, -9) : p + '.disabled'); },
  deleteMod: async (t, file) => { fs.unlinkSync(path.join(tgt(t).mods, path.basename(file))); },
  importMods: async t => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Carpeta con mods' });
    if (r.canceled) return 0;
    const n = await copyJars(fs.readdirSync(r.filePaths[0]).filter(f => f.endsWith('.jar')).map(f => path.join(r.filePaths[0], f)), tgt(t).mods);
    try { await resolveDeps(tgt(t)); } catch {} return n;
  },
  addJar: async t => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Mod', extensions: ['jar'] }] });
    if (r.canceled) return 0;
    const n = await copyJars(r.filePaths, tgt(t).mods); try { await resolveDeps(tgt(t)); } catch {} return n;
  },
  addJars: async (t, paths) => { const n = await copyJars((paths || []).filter(p => /\.jar$/i.test(p) && fs.existsSync(p)), tgt(t).mods); try { await resolveDeps(tgt(t)); } catch {} return n; },
  copyMods: async (dest, src) => {   // copia los mods activos de otro perfil/servidor, saltando los que no sirven en el destino
    const d = tgt(dest), s = tgt(src); let n = 0;
    for (const i of (await listLocal(s.mods)).filter(i => i.enabled)) {
      const m = metaOf(path.join(s.mods, i.file), i.sha1);
      if (m && m.env && m.env !== '*' && m.env !== d.env) continue;
      fs.mkdirSync(d.mods, { recursive: true }); fs.copyFileSync(path.join(s.mods, i.file), path.join(d.mods, i.file)); n++;
    }
    try { await resolveDeps(d); } catch {}
    return n;
  },
  openOptifine: async () => shell.openExternal('https://optifine.net/downloads'),
  openUrl: async u => { if (/^https:\/\/[\w.-]+\//.test(String(u))) await shell.openExternal(String(u)); },
  checkUpdates: async t0 => {
    const t = tgt(t0), mods = (await scanMods(t.mods)).filter(m => m.projectId && m.enabled);
    if (!mods.length) return [];
    const r = await J(`${MR}/version_files/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: mods.map(m => m.sha1), algorithm: 'sha1', loaders: ['fabric'], game_versions: [t.mc] }) });
    const out = [];
    for (const m of mods) {
      const v = r[m.sha1]; if (!v) continue;
      const f = primary(v);
      if (f && f.hashes.sha1 !== m.sha1) out.push({ file: m.file, title: m.title, from: m.ver, to: v.version_number, type: v.version_type, newFile: f.filename, url: f.url });
    }
    return out;
  },
  updateMod: async (t0, { file, newFile, url }) => {
    const t = tgt(t0), old = path.join(t.mods, path.basename(file)), nf = path.basename(newFile);
    await dl(url, path.join(t.mods, nf), 'Actualizando ' + nf);
    if (old !== path.join(t.mods, nf)) fs.unlinkSync(old);
    prog('', 0);
  },
  pack: async t0 => {   // mods de rendimiento, con versiones que encajan entre sí
    const t = tgt(t0); fs.mkdirSync(t.mods, { recursive: true });
    let n = 0;
    for (const slug of t.kind === 'server' ? ['fabric-api', 'lithium'] : ['fabric-api', 'sodium', 'lithium', 'iris']) {
      try { if (await mrInstall(slug, t)) n++; } catch (e) { log(`${slug}: ${e.message}`); }
    }
    const fix = await autoFix(t);
    return { installed: n, fixed: fix.fixed, remaining: fix.remaining };
  },
  storeSearch: async ({ t, q, source, sort, offset }) => source === 'curseforge' ? cfSearch(tgt(t), q, sort, offset) : mrSearch(tgt(t), q, sort, offset),
  storeInstall: async ({ t: t0, id, source }) => {
    const t = tgt(t0); fs.mkdirSync(t.mods, { recursive: true });
    if (source === 'curseforge') await cfInstall(id, t); else await mrInstall(id, t);
    try { await resolveDeps(t); } catch {}
    prog('', 0);
    return { issues: await issuesOf(t) };
  },

  // ----- jugar -----
  launch: async (pid, o = {}) => {
    if (gameState !== 'idle') throw new Error('Minecraft ya está en marcha');
    const p = prof(pid); if (!p) throw new Error('Perfil no encontrado');
    let t = tgt({ kind: 'profile', id: pid });
    fs.mkdirSync(t.mods, { recursive: true });
    setGame('preparing');
    try {
      await ensureLogin(true);
      if (p.own) {   // tu propio servidor: mismos mods y versión que el servidor, copiados de su carpeta
        try { await syncOwn(p); }
        catch (e) { throw new Error('No he podido preparar los mods de tu servidor: ' + e.message + '. Sin ellos no podrías entrar.'); }
      } else if (p.kind === 'friend' && (p.invite || p.server) && !o.server) {
        // también se reintenta con los que se añadieron «sin mods»: quizá era un servidor de Compass que no se pudo leer
        let synced = false;
        try { const r = await syncFriend(p, p.compass === false ? 'quick' : true); synced = true; const n = syncNote(r); if (n) toast(n, r.failed.length ? 'warn' : 'info'); }
        catch (e) { if (p.compass !== false) toast('Sin sincronizar: ' + e.message + ' Se usan tus mods actuales.', 'warn'); }
        if (!synced && p.compass === false) { try { const v = await versionFromPing(await slpPing(p.server, 3000)); if (v && v !== p.mc) { p.mc = v; save(); log('El servidor ahora es de Minecraft ' + v); } } catch {} }
      }
      t = tgt({ kind: 'profile', id: pid });   // la versión puede haber cambiado al sincronizar
      const hasFabric = ((allVers && allVers.list) || cfg().knownAll || []).find(v => v.id === p.mc)?.fabric !== false;
      if (hasFabric) for (const X of Object.values(EXTRAS)) { try { await extraSetup(p, t, X); } catch (e) { log(X.label + ': ' + e.message); } }
      // la comprobación va DESPUÉS de sincronizar y de poner los extras: si no, se comprobaban mods que luego cambiaban
      try { await resolveDeps(t, true); } catch {}
      if (!o.force && hasFabric) { const issues = await issuesOf(t); if (issues.length) { prog('', 0); setGame('idle'); return { blocked: true, issues }; } }
      if (mcModern(p.mc)) {
        try { optsIn(p); } catch (e) { log('Ajustes compartidos: ' + e.message); }
        try { menuSetup(p); } catch (e) { log('Menú de Compass: ' + e.message); }
      }
      const javaPath = await ensureJava(p.mc);
      let versionId = null;   // las versiones sin Fabric (muy antiguas o snapshots raras) se juegan sin mods
      try { versionId = await ensureFabric(p.mc); } catch (e) { if (!/no soporta/i.test(e.message)) throw e; log(`Minecraft ${p.mc} no tiene Fabric: se juega sin mods`); toast(`Minecraft ${p.mc} no admite mods (Fabric): se juega normal, sin mods.`, 'info'); }
      const addr = o.server || (p.kind === 'friend' && (o.join || p.autoJoin !== false) ? p.server : null);
      if (addr) log('Entrando directo a ' + addr);
      const l = new Client();
      const PL = { assets: 'Recursos del juego', classes: 'Librerías', 'classes-custom': 'Librerías', 'classes-maven-custom': 'Librerías', natives: 'Componentes nativos' };
      l.on('progress', e => prog(PL[e.type] || 'Descargando', e.total ? e.task / e.total * 100 : 0));
      let out = '';   // lo último que dice el juego, para saber por qué se ha cerrado
      l.on('debug', log); l.on('data', d => { log(d); out = (out + String(d) + '\n').slice(-60000); });
      const t0 = Date.now();
      l.on('close', async code => {
        optsOut(p);
        prog('', 0); setGame('idle'); log(`Minecraft se cerró (código ${code}).`);
        if (minimizedForGame && win && !win.isDestroyed()) { minimizedForGame = false; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
        if (!code) return;
        // Fabric enseña su propia ventana de error y espera a que la cierres: por eso no hay límite de tiempo aquí
        let ff = fabricFail(out);
        if (!ff) { try { const lf = path.join(pdir(p), 'logs', 'latest.log'); if (fs.existsSync(lf) && fs.statSync(lf).mtimeMs >= t0) ff = fabricFail(fs.readFileSync(lf, 'utf8').slice(-80000)); } catch {} }
        if (!ff) { if (Date.now() - t0 < 60000) toast('Minecraft se cerró con un error. Puedes ver el motivo en Ajustes, Registro.', 'error'); return; }
        // Fabric no arranca por los mods («mod resolution»): se intenta arreglar solo y se avisa con lo que pasaba
        log('Fabric no ha arrancado por los mods: ' + ff.lines.join(' | '));
        let r = { fixed: [], failed: [] };
        try { prog('Arreglando los mods', 50); r = await repairFabric(p, tgt({ kind: 'profile', id: pid }), ff); } catch (e) { log('Arreglo: ' + e.message); }
        send('gameFail', { pid, lines: ff.lines, fixed: r.fixed, failed: r.failed, server: o.server || null });
      });
      log(`Lanzando Minecraft ${p.mc} (${p.name}) ...`);
      prog('Iniciando Minecraft', 100);
      const proc = await l.launch({
        authorization: mcAuth.mclc(), root: ROOT(), javaPath,
        overrides: { gameDirectory: pdir(p) },
        ...(addr ? { quickPlay: quickPlay(p.mc, addr) } : {}),
        version: { number: p.mc, type: mcType(p.mc), ...(versionId ? { custom: versionId } : {}) },
        memory: { max: p.ram || '4G', min: Math.min(2, gbOf(p.ram)) + 'G' },
      });
      if (!proc) throw new Error('No se pudo iniciar Minecraft. Mira el registro en Ajustes.');
      setGame('running');
      if (cfg().minOnPlay !== false && win && !win.isDestroyed()) setTimeout(() => { if (gameState === 'running' && !win.isDestroyed()) { minimizedForGame = true; win.minimize(); } }, 4000);
      return { ok: true };
    } catch (e) { prog('', 0); setGame('idle'); throw e; }
  },
};


// ---------- mundos, mapas y vista previa ----------
const LIB = () => path.join(U(), 'maps');
const slug = t => (String(t || 'mapa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mapa');
const freeName = (dir, base) => { let n = base, i = 2; while (fs.existsSync(path.join(dir, n))) n = `${base}-${i++}`; return n; };
const levelName = s => readProps(s)['level-name'] || 'world';
const isRunning = id => !!(run && run.id === id && run.state !== 'off');
function worldDirOf(ref) {   // ref: { kind: 'server', id, world? } | { kind: 'library', id }
  if (ref.kind === 'library') { const d = path.join(LIB(), path.basename(ref.id)); if (!fs.existsSync(d)) throw new Error('Ese mapa ya no está en la biblioteca'); return d; }
  const s = srv(ref.id); if (!s) throw new Error('Servidor no encontrado');
  return path.join(sdir(s), path.basename(ref.world || levelName(s)));
}
const mapCacheDir = wd => path.join(U(), 'mapcache', crypto.createHash('sha1').update(wd).digest('hex').slice(0, 16));
const tileJobs = new Map();
async function tile(wd, x, z) {   // PNG (y alturas) de una región, con caché por fecha de modificación
  const src = path.join(wd, 'region', `r.${x}.${z}.mca`), cd = mapCacheDir(wd), png = path.join(cd, `r.${x}.${z}.png`), hf = path.join(cd, `r.${x}.${z}.h`);
  if (!fs.existsSync(src)) return null;
  const mt = fs.statSync(src).mtimeMs;
  if (fs.existsSync(png) && fs.existsSync(hf) && fs.statSync(png).mtimeMs >= mt) return { png, hf };
  const key = png;
  if (!tileJobs.has(key)) tileJobs.set(key, (async () => {
    const r = await WM.renderRegion(src);
    fs.mkdirSync(cd, { recursive: true });
    fs.writeFileSync(png, WM.encodePNG(512, 512, r.rgba));
    fs.writeFileSync(hf, Buffer.from(r.heights.buffer));
    return { png, hf, old: r.old && !r.chunks };
  })().finally(() => tileJobs.delete(key)));
  return tileJobs.get(key);
}
function findWorldRoot(dir, depth = 0) {   // carpeta que contiene level.dat dentro de algo descomprimido
  if (fs.existsSync(path.join(dir, 'level.dat'))) return dir;
  if (depth > 3) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('__MACOSX')) { const r = findWorldRoot(path.join(dir, e.name), depth + 1); if (r) return r; }
  return null;
}
function libAdd(srcDir, meta) {   // copia/mueve un mundo a la biblioteca de mapas
  const root = findWorldRoot(srcDir);
  if (!root) throw new Error('Ahí dentro no hay ningún mundo de Minecraft (falta level.dat)');
  const info = WM.levelInfo(root) || {};
  fs.mkdirSync(LIB(), { recursive: true });
  const name = freeName(LIB(), slug(meta.title || info.name || path.basename(root))), dest = path.join(LIB(), name);
  fs.cpSync(root, dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'compass.json'), JSON.stringify({ title: meta.title || info.name || name, source: meta.source || 'local', icon: meta.icon || null, author: meta.author || null, url: meta.url || null, added: Date.now() }));
  return name;
}
function applyPendingSpawn(s) {
  const p = s.pendingSpawn; if (!p) return;
  if (p.world && p.world !== levelName(s)) return;
  srvCmd(`setworldspawn ${p.x | 0} ${p.y | 0} ${p.z | 0}`);
  srvOut(`[Compass] Spawn colocado en ${p.x} ${p.y} ${p.z}\n`);
  delete s.pendingSpawn; save();
}

// ---------- permisos: ops, lista blanca y baneos ----------
const NAME_RE = /^[A-Za-z0-9_]{2,16}$/, IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const jread = (f, d = []) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const jwrite = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const dashed = h => h.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
const mcDate = () => { const d = new Date(), z = n => String(n).padStart(2, '0'), o = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())} ${o >= 0 ? '+' : '-'}${z(Math.abs(o) / 60 | 0)}${z(Math.abs(o) % 60)}`; };
async function whoIs(s, name) {
  if (!NAME_RE.test(name)) throw new Error(`«${name}» no es un nombre de Minecraft válido`);
  const cache = jread(path.join(sdir(s), 'usercache.json')).find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
  if (cache) return { uuid: cache.uuid, name: cache.name };
  if (readProps(s)['online-mode'] === 'false') {
    const h = crypto.createHash('md5').update('OfflinePlayer:' + name).digest(); h[6] = (h[6] & 0x0f) | 0x30; h[8] = (h[8] & 0x3f) | 0x80;
    return { uuid: dashed(h.toString('hex')), name };
  }
  const r = await get('https://api.mojang.com/users/profiles/minecraft/' + enc(name));
  if (r.status === 204 || r.status === 404) throw new Error(`No existe ninguna cuenta de Minecraft llamada «${name}»`);
  if (!r.ok) throw new Error('Mojang no respondió. Prueba con el servidor encendido.');
  const j = await r.json(); return { uuid: dashed(j.id), name: j.name };
}

// ---------- archivos del servidor ----------
const TEXT_EXT = /\.(txt|json|json5|properties|ya?ml|toml|cfg|conf|ini|log|mcmeta|md|csv|snbt|js|sk|lang|list|secret)$/i;
function inside(s, rel) {
  const base = path.resolve(sdir(s)), p = path.resolve(base, rel || '.');
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('Ruta fuera del servidor');
  return p;
}
const relOf = (s, p) => path.relative(path.resolve(sdir(s)), p).split(path.sep).join('/');

Object.assign(H, {
  // ----- mundos del servidor -----
  worldsList: async id => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const cur = levelName(s), out = [];
    for (const e of fs.readdirSync(sdir(s), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = path.join(sdir(s), e.name); if (!fs.existsSync(path.join(d, 'level.dat'))) continue;
      const info = WM.levelInfo(d) || {};
      out.push({ folder: e.name, name: info.name || e.name, version: info.version, spawn: info.spawn, current: e.name === cur, regions: WM.listRegions(d).length });
    }
    if (!out.some(w => w.current)) out.unshift({ folder: cur, name: cur, version: null, spawn: null, current: true, regions: 0, fresh: true });
    return { current: cur, worlds: out, pendingSpawn: s.pendingSpawn || null, running: isRunning(id), seed: readProps(s)['level-seed'] || '', type: readProps(s)['level-type'] || 'minecraft:normal' };
  },
  worldUse: async (id, folder) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (isRunning(id)) throw new Error('Para el servidor antes de cambiar de mundo');
    setProps(s, { 'level-name': path.basename(folder) }); delete s.pendingSpawn; save();
  },
  worldNew: async (id, { name, seed, type }) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (isRunning(id)) throw new Error('Para el servidor antes de crear otro mundo');
    const folder = freeName(sdir(s), slug(name || 'mundo-nuevo'));
    setProps(s, { 'level-name': folder, 'level-seed': String(seed || '').trim(), 'level-type': type || 'minecraft:normal' }); delete s.pendingSpawn; save();
    return folder;
  },
  worldDelete: async (id, folder) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const f = path.basename(folder);
    if (f === levelName(s) && isRunning(id)) throw new Error('Es el mundo en uso: para el servidor primero');
    await shell.trashItem(path.join(sdir(s), f));
  },
  worldToLibrary: async (id, folder) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    return libAdd(path.join(sdir(s), path.basename(folder)), { source: 'servidor ' + s.name });
  },

  // ----- vista del mapa -----
  mapInfo: async ref => {
    const wd = worldDirOf(ref), info = WM.levelInfo(wd);
    let meta = null; if (ref.kind === 'library') meta = jread(path.join(wd, 'compass.json'), null);
    return { exists: fs.existsSync(path.join(wd, 'level.dat')), regions: WM.listRegions(wd), spawn: info && info.spawn, version: info && info.version, name: (meta && meta.title) || (info && info.name) || path.basename(wd), seed: info && info.seed,
             pending: ref.kind === 'server' ? (srv(ref.id) || {}).pendingSpawn || null : null };
  },
  mapTile: async (ref, x, z) => {
    const t = await tile(worldDirOf(ref), x | 0, z | 0); if (!t) return null;
    return { url: 'data:image/png;base64,' + fs.readFileSync(t.png).toString('base64'), old: !!t.old };
  },
  mapHeight: async (ref, x, z) => {
    const rx = Math.floor(x / 512), rz = Math.floor(z / 512), t = await tile(worldDirOf(ref), rx, rz);
    if (!t) return null;
    const b = fs.readFileSync(t.hf), i = (((z - rz * 512) | 0) * 512 + ((x - rx * 512) | 0)) * 2, h = b.readInt16LE(i);
    return h === -32768 ? null : h + 1;
  },
  mapSetSpawn: async (id, { x, y, z }) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const p = { x: Math.round(x), y: Math.round(y || 80), z: Math.round(z), world: levelName(s) };
    if (run && run.id === id && run.state === 'ready') { srvCmd(`setworldspawn ${p.x} ${p.y} ${p.z}`); srvOut(`[Compass] Spawn colocado en ${p.x} ${p.y} ${p.z}\n`); delete s.pendingSpawn; save(); return { now: true }; }
    s.pendingSpawn = p; save(); return { now: false };
  },
  mapClearPending: async id => { const s = srv(id); if (s) { delete s.pendingSpawn; save(); } },

  // ----- biblioteca de mapas -----
  libList: async () => {
    if (!fs.existsSync(LIB())) return [];
    return fs.readdirSync(LIB(), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => {
      const d = path.join(LIB(), e.name), m = jread(path.join(d, 'compass.json'), {}), info = WM.levelInfo(d) || {};
      return { id: e.name, title: m.title || info.name || e.name, source: m.source || 'local', icon: m.icon || null, author: m.author || null, version: info.version, regions: WM.listRegions(d).length, spawn: info.spawn, added: m.added || 0 };
    }).sort((a, b) => b.added - a.added);
  },
  libImportZip: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Mapa en .zip', properties: ['openFile'], filters: [{ name: 'Mapa', extensions: ['zip'] }] });
    if (r.canceled) return null;
    const tmp = path.join(U(), 'tmp', 'map-' + uid());
    try { new AdmZip(r.filePaths[0]).extractAllTo(tmp, true); return libAdd(tmp, { title: path.basename(r.filePaths[0], '.zip') }); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  },
  libImportFolder: async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Carpeta del mundo', properties: ['openDirectory'] });
    return r.canceled ? null : libAdd(r.filePaths[0], {});
  },
  libDelete: async lid => { await shell.trashItem(path.join(LIB(), path.basename(lid))); },
  libRename: async (lid, title) => { const f = path.join(LIB(), path.basename(lid), 'compass.json'), m = jread(f, {}); m.title = String(title || '').trim() || m.title; jwrite(f, m); },
  libToServer: async (lid, id) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (isRunning(id)) throw new Error('Para el servidor antes de poner otro mapa');
    const src = path.join(LIB(), path.basename(lid)); if (!fs.existsSync(src)) throw new Error('Ese mapa ya no está');
    const folder = freeName(sdir(s), path.basename(lid));
    fs.cpSync(src, path.join(sdir(s), folder), { recursive: true, filter: f => path.basename(f) !== 'compass.json' });
    setProps(s, { 'level-name': folder }); delete s.pendingSpawn; save();
    return folder;
  },
  mapSearch: async ({ q, offset, mc }) => {
    const r = await cfGet(`/mods/search?gameId=432&classId=17&pageSize=24&index=${offset || 0}&sortField=${q ? 2 : 6}&sortOrder=desc` + (mc ? `&gameVersion=${enc(mc)}` : '') + (q ? `&searchFilter=${enc(q)}` : ''));
    return { total: r.pagination ? r.pagination.totalCount : r.data.length, items: r.data.map(m => ({ id: String(m.id), title: m.name, desc: m.summary, icon: m.logo && m.logo.thumbnailUrl,
      shot: m.screenshots && m.screenshots[0] && m.screenshots[0].thumbnailUrl, downloads: m.downloadCount, author: m.authors && m.authors[0] && m.authors[0].name, url: m.links && m.links.websiteUrl,
      versions: [...new Set((m.latestFilesIndexes || []).map(f => f.gameVersion))].slice(0, 4) })) };
  },
  mapDownload: async mid => {
    const m = (await cfGet(`/mods/${enc(mid)}`)).data;
    const files = (await cfGet(`/mods/${enc(mid)}/files?pageSize=20`)).data.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate));
    const f = files.find(x => x.releaseType === 1) || files[0];
    if (!f) throw new Error('Ese mapa no tiene archivos para descargar');
    if (!f.downloadUrl) { if (m.links && m.links.websiteUrl) shell.openExternal(m.links.websiteUrl + '/files'); throw new Error(`«${m.name}» solo se puede descargar desde su web: te la he abierto`); }
    const tmpZip = path.join(U(), 'tmp', `map-${mid}.zip`), tmp = path.join(U(), 'tmp', 'map-' + uid());
    try {
      await dl(f.downloadUrl, tmpZip, 'Descargando ' + m.name);
      new AdmZip(tmpZip).extractAllTo(tmp, true);
      return libAdd(tmp, { title: m.name, source: 'curseforge', icon: m.logo && m.logo.thumbnailUrl, author: m.authors && m.authors[0] && m.authors[0].name, url: m.links && m.links.websiteUrl });
    } finally { prog('', 0); fs.rmSync(tmp, { recursive: true, force: true }); try { fs.unlinkSync(tmpZip); } catch {} }
  },

  // ----- automático: 24/7, Nether/End, tareas, vista previa -----
  dimSet: async (id, which, blocked) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (which === 'nether') s.blockNether = !!blocked; else if (which === 'end') s.blockEnd = !!blocked; else throw new Error('Dimensión desconocida');
    save(); applyDimProps(s);
    if (run && run.id === id && run.state === 'ready') { if (blocked) dimGuard(); chat('@a', `[Compass] ${which === 'nether' ? 'El Nether' : 'El End'} está ${blocked ? 'cerrado' : 'abierto'}`, blocked ? 'red' : 'green'); }
  },
  tasksSet: async (id, tasks) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const K = ['save', 'message', 'command', 'backup', 'restart'];
    s.tasks = (tasks || []).filter(t => t && K.includes(t.kind)).slice(0, 40).map(t => ({ id: String(t.id || uid()).slice(0, 12), kind: t.kind, on: t.on !== false,
      every: t.at ? null : Math.max(1, Math.min(10080, +t.every || 30)), at: /^\d{2}:\d{2}$/.test(t.at || '') ? t.at : null, text: String(t.text || '').slice(0, 300), color: /^[a-z_]+$/.test(t.color || '') ? t.color : 'gold' }));
    save(); return s.tasks;
  },
  taskRunNow: async (id, tid) => { const s = srv(id), t = s && (s.tasks || []).find(x => x.id === tid); if (!t) throw new Error('Tarea no encontrada'); if (!run || run.id !== id || run.state !== 'ready') throw new Error('El servidor no está encendido'); await runTask(s, t); },
  set247: async (id, patch) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado'); const c = cfg();
    if ('keep247' in patch) { s.keep247 = !!patch.keep247; if (run && run.id === id && run.state === 'ready') keepAwake(s.keep247); }
    if ('autostart' in patch) c.autostartServer = patch.autostart ? id : (c.autostartServer === id ? null : c.autostartServer);
    if ('atLogin' in patch) { c.openAtLogin = !!patch.atLogin; try { app.setLoginItemSettings({ openAtLogin: c.openAtLogin, args: ['--compass-hidden'] }); } catch {} }
    save();
    return { keep247: !!s.keep247, autostart: c.autostartServer === id, atLogin: !!c.openAtLogin };
  },
  get247: async id => { const s = srv(id), c = cfg(); return { keep247: !!(s && s.keep247), autostart: c.autostartServer === id, atLogin: !!c.openAtLogin, awake: awakeId !== null }; },
  seedPreview: async (id, seed, type) => { const s = srv(id); if (!s) throw new Error('Servidor no encontrado'); return seedPreview(s, seed, type); },
  seedRandom: async () => String(crypto.randomBytes(6).readIntBE(0, 6)),
  previewKeep: async (id, folder, name) => {   // usar el mundo de la vista previa tal cual (mismo spawn)
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (isRunning(id)) throw new Error('Para el servidor antes de cambiar de mundo');
    const src = path.join(sdir(s), path.basename(folder)); if (!/^\.preview-/.test(path.basename(folder)) || !fs.existsSync(src)) throw new Error('La vista previa ya no existe');
    const dest = freeName(sdir(s), slug(name || 'mundo-nuevo'));
    fs.renameSync(src, path.join(sdir(s), dest));
    const info = WM.levelInfo(path.join(sdir(s), dest)) || {};
    setProps(s, { 'level-name': dest, 'level-seed': info.seed != null ? String(info.seed) : '' }); delete s.pendingSpawn; save();
    return dest;
  },
  previewDrop: async (id, folder) => { const s = srv(id); if (s && /^\.preview-/.test(path.basename(folder || ''))) fs.rmSync(path.join(sdir(s), path.basename(folder)), { recursive: true, force: true }); },

  // ----- tienda ampliada y plugins -----
  kindSearch: async ({ t, kind, q, sort, offset }) => kindSearch(tgt(t), kind, q, sort, offset),
  kindInstall: async ({ t, kind, id }) => { const r = await kindInstall(tgt(t), kind, id); prog('', 0); return r; },
  kindList: async (t0, kind) => {   // shaders / resource packs instalados en un perfil
    const t = tgt(t0), d = path.join(t.dir, KIND_DIR[kind] || 'x'); if (!fs.existsSync(d)) return [];
    const rec = storeRecs(t.dir);
    return fs.readdirSync(d).filter(f => !f.startsWith('.')).map(f => { const r = Object.values(rec).find(x => x.file === f) || {}; return { file: f, title: r.title || f.replace(/\.zip$/i, ''), icon: r.icon || null }; });
  },
  kindDelete: async (t0, kind, file) => { const t = tgt(t0), f = path.join(t.dir, KIND_DIR[kind], path.basename(file)); fs.rmSync(f, { recursive: true, force: true }); },
  kindOpen: async (t0, kind) => { const t = tgt(t0), d = path.join(t.dir, KIND_DIR[kind]); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); },
  mapToProfile: async (mid, pid) => {   // un mapa de la tienda directo a «Un jugador» de un perfil
    const p = prof(pid); if (!p) throw new Error('Perfil no encontrado');
    const name = await H.mapDownload(mid), m = jread(path.join(LIB(), name, 'compass.json'), {});
    return copyWorldTo(path.join(LIB(), name), path.join(pdir(p), 'saves'), m.title || name);
  },
  pluginsList: async id => { const s = srv(id); if (!s) throw new Error('Servidor no encontrado'); return pluginsList(s); },
  pluginToggle: async (id, file) => { const s = srv(id), f = path.basename(file), p = path.join(pluginsDir(s), f); fs.renameSync(p, f.endsWith('.disabled') ? p.slice(0, -9) : p + '.disabled'); },
  pluginDelete: async (id, file) => { const s = srv(id); fs.unlinkSync(path.join(pluginsDir(s), path.basename(file))); },
  pluginAdd: async (id, paths) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    if (!paths) { const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Plugin', extensions: ['jar'] }] }); if (r.canceled) return 0; paths = r.filePaths; }
    const n = copyJars(paths.filter(p => /\.jar$/i.test(p) && fs.existsSync(p)), pluginsDir(s));
    try { await resolvePluginDeps(s); } catch {} return n;
  },
  pluginsFix: async id => { const s = srv(id); return resolvePluginDeps(s, true); },
  pluginsOpen: async id => { const s = srv(id), d = pluginsDir(s); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); },
  serverIconGet: async id => { const s = srv(id), f = s && path.join(sdir(s), 'server-icon.png'); return f && fs.existsSync(f) ? 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') : null; },
  serverIconSet: async (id, data) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const f = path.join(sdir(s), 'server-icon.png');
    if (!data) { try { fs.unlinkSync(f); } catch {} return; }
    const m = /^data:image\/png;base64,(.+)$/.exec(String(data)); if (!m) throw new Error('La imagen no es válida');
    const b = Buffer.from(m[1], 'base64'); if (b.length > 512 * 1024) throw new Error('Imagen demasiado grande');
    fs.mkdirSync(sdir(s), { recursive: true }); fs.writeFileSync(f, b);
  },
  pickImage: async () => {   // devuelve la imagen elegida como data URL (la interfaz la recorta a 64×64)
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
    if (r.canceled) return null;
    const f = r.filePaths[0], ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
    if (fs.statSync(f).size > 15 * 1024 * 1024) throw new Error('Esa imagen pesa demasiado');
    return `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64');
  },

  // ----- gente y permisos -----
  permsGet: async id => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const d = sdir(s), pr = readProps(s), J2 = f => jread(path.join(d, f));
    return { ops: J2('ops.json'), whitelist: J2('whitelist.json'), bans: J2('banned-players.json'), ipbans: J2('banned-ips.json'),
      known: J2('usercache.json').map(u => u.name).filter(Boolean).slice(0, 200), online: run && run.id === id ? run.players : [],
      tp: tpList(s), running: !!(run && run.id === id && run.state === 'ready'), whitelistOn: pr['white-list'] === 'true', onlineMode: pr['online-mode'] !== 'false', opLevel: pr['op-permission-level'] || '4' };
  },
  permsAct: async (id, action, a = {}) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const live = run && run.id === id && run.state === 'ready', d = sdir(s), name = String(a.name || '').trim(), reason = String(a.reason || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
    const F = { ops: path.join(d, 'ops.json'), wl: path.join(d, 'whitelist.json'), ban: path.join(d, 'banned-players.json'), ip: path.join(d, 'banned-ips.json') };
    const drop = (f, key, val) => jwrite(f, jread(f).filter(x => String(x[key]).toLowerCase() !== String(val).toLowerCase()));
    const cmd = c => { srvCmd(c); srvOut('> ' + c + '\n'); };
    if (['op', 'deop', 'wlAdd', 'wlRemove', 'ban', 'pardon', 'setLevel', 'tpAdd', 'tpRemove'].includes(action) && !NAME_RE.test(name)) throw new Error(`«${name}» no es un nombre de Minecraft válido`);
    if (['banIp', 'pardonIp'].includes(action) && !IP_RE.test(String(a.ip || ''))) throw new Error('Esa IP no es válida');
    switch (action) {
      case 'whitelist':
        setProps(s, { 'white-list': a.on ? 'true' : 'false' }); if (live) cmd('whitelist ' + (a.on ? 'on' : 'off')); return;
      case 'op':
        if (live && !a.level) return cmd('op ' + name);
        { const u = await whoIs(s, name), l = jread(F.ops).filter(x => x.uuid !== u.uuid); l.push({ uuid: u.uuid, name: u.name, level: +a.level || +(readProps(s)['op-permission-level'] || 4), bypassesPlayerLimit: false }); jwrite(F.ops, l);
          if (live) cmd('op ' + u.name); return; }
      case 'setLevel': {
        if (live) throw new Error('Para cambiar el nivel exacto, para el servidor (con él encendido solo se puede dar OP completo)');
        const l = jread(F.ops), o = l.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!o) throw new Error(name + ' no es OP'); o.level = Math.max(1, Math.min(4, +a.level || 4)); jwrite(F.ops, l); return; }
      case 'deop': if (live) return cmd('deop ' + name); return drop(F.ops, 'name', name);
      case 'wlAdd':
        if (live) return cmd('whitelist add ' + name);
        { const u = await whoIs(s, name), l = jread(F.wl).filter(x => x.uuid !== u.uuid); l.push({ uuid: u.uuid, name: u.name }); jwrite(F.wl, l); return; }
      case 'wlRemove': if (live) return cmd('whitelist remove ' + name); return drop(F.wl, 'name', name);
      case 'ban':
        if (live) return cmd('ban ' + name + (reason ? ' ' + reason : ''));
        { const u = await whoIs(s, name), l = jread(F.ban).filter(x => x.uuid !== u.uuid); l.push({ uuid: u.uuid, name: u.name, created: mcDate(), source: 'Compass Launcher', expires: 'forever', reason: reason || 'Baneado por un operador.' }); jwrite(F.ban, l); return; }
      case 'pardon': if (live) return cmd('pardon ' + name); return drop(F.ban, 'name', name);
      case 'banIp':
        if (live) return cmd('ban-ip ' + a.ip + (reason ? ' ' + reason : ''));
        { const l = jread(F.ip).filter(x => x.ip !== a.ip); l.push({ ip: a.ip, created: mcDate(), source: 'Compass Launcher', expires: 'forever', reason: reason || 'Baneado por un operador.' }); jwrite(F.ip, l); return; }
      case 'pardonIp': if (live) return cmd('pardon-ip ' + a.ip); return drop(F.ip, 'ip', a.ip);
      case 'tpAdd': {
        if (tpHas(s, name)) return;
        const l = tpList(s); l.push({ name }); tpSave(s, l);
        if (live) chat(name, '[Compass] Ya puedes teletransportarte: escribe en el chat !tp Nombre o !tp x y z', 'aqua'); return; }
      case 'tpRemove': tpSave(s, tpList(s).filter(x => x.name.toLowerCase() !== name.toLowerCase())); return;
      case 'kick': if (!live) throw new Error('El servidor no está encendido'); return cmd('kick ' + name + (reason ? ' ' + reason : ''));
      case 'gamemode': if (!live) throw new Error('El servidor no está encendido'); if (!['survival', 'creative', 'adventure', 'spectator'].includes(a.mode)) throw new Error('Modo no válido'); return cmd(`gamemode ${a.mode} ${name}`);
      case 'tpSpawn': {
        if (!live) throw new Error('El servidor no está encendido');
        const sp = (WM.levelInfo(path.join(d, levelName(s))) || {}).spawn; if (!sp) throw new Error('No encuentro el spawn del mundo');
        return cmd(`execute in minecraft:overworld run tp ${name} ${sp.x} ${sp.y} ${sp.z}`); }
      default: throw new Error('Acción desconocida');
    }
  },

  // ----- archivos -----
  fsList: async (id, rel) => {
    const s = srv(id); if (!s) throw new Error('Servidor no encontrado');
    const d = inside(s, rel); fs.mkdirSync(sdir(s), { recursive: true });
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error('Esa carpeta no existe');
    const items = fs.readdirSync(d, { withFileTypes: true }).map(e => {
      let st = null; try { st = fs.statSync(path.join(d, e.name)); } catch {}
      return { name: e.name, dir: e.isDirectory(), size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0, text: !e.isDirectory() && TEXT_EXT.test(e.name) };
    }).sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'es'));
    return { rel: relOf(s, d), items };
  },
  fsRead: async (id, rel) => {
    const s = srv(id), f = inside(s, rel), st = fs.statSync(f);
    if (st.size > 3 * 2 ** 20) throw new Error('El archivo es demasiado grande para editarlo aquí: ábrelo con otro programa');
    return fs.readFileSync(f, 'utf8');
  },
  fsWrite: async (id, rel, text) => { const s = srv(id), f = inside(s, rel); fs.writeFileSync(f, String(text)); },
  fsDelete: async (id, rel) => { const s = srv(id), f = inside(s, rel); if (f === path.resolve(sdir(s))) throw new Error('No se puede borrar la carpeta del servidor'); await shell.trashItem(f); },
  fsRename: async (id, rel, name) => {
    const s = srv(id), f = inside(s, rel), n = path.basename(String(name || '').trim());
    if (!n || n === '.' || n === '..') throw new Error('Nombre no válido');
    const dest = path.join(path.dirname(f), n); if (fs.existsSync(dest)) throw new Error('Ya hay algo con ese nombre');
    fs.renameSync(f, dest);
  },
  fsMkdir: async (id, rel, name) => { const s = srv(id), d = inside(s, path.posix.join(rel || '', path.basename(String(name || '').trim()))); fs.mkdirSync(d, { recursive: true }); },
  fsNewFile: async (id, rel, name) => { const s = srv(id), f = inside(s, path.posix.join(rel || '', path.basename(String(name || '').trim()))); if (fs.existsSync(f)) throw new Error('Ya existe'); fs.writeFileSync(f, ''); },
  fsUpload: async (id, rel) => {
    const s = srv(id), d = inside(s, rel);
    const r = await dialog.showOpenDialog(win, { title: 'Subir archivos al servidor', properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return 0;
    r.filePaths.forEach(p => fs.copyFileSync(p, path.join(d, path.basename(p)))); return r.filePaths.length;
  },
  fsAddPaths: async (id, rel, paths) => {
    const s = srv(id), d = inside(s, rel); let n = 0;
    for (const p of paths || []) { if (!fs.existsSync(p)) continue; fs.cpSync(p, path.join(d, path.basename(p)), { recursive: true }); n++; }
    return n;
  },
  fsReveal: async (id, rel) => { const s = srv(id), f = inside(s, rel); if (fs.statSync(f).isDirectory()) await shell.openPath(f); else shell.showItemInFolder(f); },
});

remote = require('./remote.js')({ H, cfg, save, log, send, toast, J, version: app.getVersion() });
ipcMain.handle('call', async (e, n, ...a) => {
  if (typeof H[n] !== 'function') throw new Error('Acción desconocida: ' + n);
  try {
    const r = await H[n](...a);
    if (remote) { if (remote.ALLOWED.has(n) && !remote.READONLY.has(n)) remote.broadcast('changed', { fn: n, from: 'pc' }); if (n === 'setPref' && a[0] === 'look') remote.broadcast('look', cfg().look || {}); }
    return r;
  }
  catch (err) { if (n !== 'autologin') log(`[error] ${n}: ${err && err.stack || err}`); throw err; }
});
process.on('uncaughtException', e => log('[error grave] ' + (e && e.stack || e)));
process.on('unhandledRejection', e => log('[error grave] ' + (e && e.stack || e)));

(() => {   // el nombre cambió de «Compas» a «Compass»: se conservan perfiles, servidores y sesión
  try {
    const ad = app.getPath('appData'), nu = path.join(ad, 'Compass Launcher');
    const old = ['Compas Launcher', 'compas-launcher'].map(n => path.join(ad, n)).find(d => fs.existsSync(path.join(d, 'config.json')));
    if (old && !fs.existsSync(path.join(nu, 'config.json'))) { try { if (fs.existsSync(nu)) fs.rmdirSync(nu); fs.renameSync(old, nu); } catch { app.setPath('userData', old); } }
  } catch {}
})();
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (!win.isVisible()) win.show(); if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    migrate();
    win = new BrowserWindow({
      width: 1280, height: 800, icon: path.join(__dirname, 'assets', 'icon.png'), minWidth: 1040, minHeight: 680, show: false, backgroundColor: '#15111d', autoHideMenuBar: true,
      titleBarStyle: 'hidden', frame: process.platform === 'win32',   // sin la barra de Windows: los botones de la ventana son de Compass (como Discord)
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
    });
    const hidden = process.argv.includes('--compass-hidden');
    win.once('ready-to-show', () => {
      applyLook();
      if (hidden && (cfg().autostartServer || (cfg().remote || {}).on)) { makeTray(); } else win.show();
      if ((cfg().remote || {}).on) remote.start().catch(e => log('Móvil: ' + e.message));
      const a = cfg().autostartServer;   // 24/7: el servidor elegido arranca solo al abrir Compass
      if (a && srv(a)) setTimeout(() => H.hostStart(a, { force: true }).then(() => toast('Servidor arrancado automáticamente (24/7)', 'ok')).catch(e => log('Arranque automático: ' + e.message)), 2500);
    });
    const winState = () => send('winState', { max: win.isMaximized(), full: win.isFullScreen(), focus: win.isFocused() });
    for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur', 'restore']) win.on(ev, winState);
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('preload-error', (e, p, err) => dialog.showErrorBox('Error del preload', String(err)));
    win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && (i.key === 'F12' || (i.control && i.shift && i.key.toLowerCase() === 'i'))) win.webContents.toggleDevTools(); });
    win.on('close', async e => {
      if (quitting) return;
      if (!run && (cfg().remote || {}).on) {   // con la app del móvil activada, Compass se queda junto al reloj para poder recibir órdenes
        e.preventDefault(); makeTray(); win.hide();
        if (!cfg().trayTold) { cfg().trayTold = true; save(); try { const { Notification } = require('electron'); new Notification({ title: 'Compass sigue abierto', body: 'Está junto al reloj para que puedas encender tus servidores desde el móvil. Para cerrarlo del todo: clic derecho en el icono, Salir.', icon: path.join(__dirname, 'assets', 'icon.png') }).show(); } catch {} }
        return;
      }
      if (!run) return;
      e.preventDefault();
      const r = await dialog.showMessageBox(win, { type: 'question', title: 'Servidor encendido', message: 'Tu servidor sigue encendido',
        detail: 'Puedes dejarlo funcionando en segundo plano (icono junto al reloj) o apagarlo y salir.',
        buttons: ['Seguir en segundo plano', 'Apagar servidor y salir', 'Cancelar'], defaultId: 0, cancelId: 2 });
      if (r.response === 0) { makeTray(); win.hide(); }
      else if (r.response === 1) await quitAll();
    });
    win.loadFile('index.html');
    setupUpdates();
    // el instalador deja esta marca si elegiste «Descargar ya todas las versiones de Java»
    try { const fl = path.join(U(), 'preparar-java.flag'); if (fs.existsSync(fl)) { fs.unlinkSync(fl); setTimeout(() => { toast('Descargando todas las versiones de Java en segundo plano…', 'info'); javaAll().catch(() => {}); }, 5000); } } catch {}
    try { if (!('openAtLogin' in cfg())) { cfg().openAtLogin = app.getLoginItemSettings({ args: ['--compass-hidden'] }).openAtLogin; save(); } } catch {}
  });
  app.on('window-all-closed', () => { quitAll(); });
}
