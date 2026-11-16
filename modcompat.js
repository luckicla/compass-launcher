'use strict';
// Comprobación de compatibilidad de mods Fabric SIN red:
// lee fabric.mod.json de cada .jar y evalúa "depends" y "breaks" como lo hace Fabric Loader.

// ---------- versiones (semver + extensiones de Fabric) ----------
function parseVer(s) {
  const noBuild = String(s).trim().split('+')[0];
  const i = noBuild.indexOf('-');
  const core = (i < 0 ? noBuild : noBuild.slice(0, i)).split('.');
  const pre = i < 0 ? [] : noBuild.slice(i + 1).split('.');
  return { core: core.map(x => /^\d+$/.test(x) ? +x : (x === '*' || x.toLowerCase() === 'x') ? null : NaN), pre };
}
function cmp(a, b) {
  const n = Math.max(a.core.length, b.core.length);
  for (let i = 0; i < n; i++) {
    const x = a.core[i] ?? 0, y = b.core[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y) || x === null || y === null) throw new Error('versión no numérica');
    if (x !== y) return x < y ? -1 : 1;
  }
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;     // 1.0.0 > 1.0.0-beta
  if (!b.pre.length) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (+x !== +y) return +x < +y ? -1 : 1; }
    else if (nx) return -1;
    else if (ny) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function matchTerm(v, t) {
  t = t.trim();
  if (!t || t === '*') return true;
  const m = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(t);
  const op = m[1] || '=', b = parseVer(m[2]), a = parseVer(v);
  if (b.core.some(x => x === null)) {          // 1.20.x
    for (let i = 0; i < b.core.length; i++) {
      if (b.core[i] === null) break;
      if ((a.core[i] ?? 0) !== b.core[i]) return false;
    }
    return true;
  }
  const c = cmp(a, b);
  switch (op) {
    case '>=': return c >= 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    case '<': return c < 0;
    case '=': return c === 0;
    case '~': {
      if (c < 0) return false;
      const up = b.core.length >= 2 ? [b.core[0], b.core[1] + 1] : [b.core[0] + 1];
      return cmp(a, { core: up, pre: [] }) < 0;
    }
    case '^': return c >= 0 && cmp(a, { core: [b.core[0] + 1], pre: [] }) < 0;
  }
  return true;
}
// range: string ("<=1.12.0", ">=1.0 <2", "1.x || 2.x") o array (OR). Si algo no se entiende, se da por válido.
function satisfies(v, range) {
  try {
    return (Array.isArray(range) ? range : [range]).some(r =>
      String(r).split('||').some(g => g.replace(/(>=|<=|>|<|=|~|\^)\s+/g, '$1').trim().split(/\s+/).every(t => matchTerm(v, t))));
  } catch { return true; }
}

// ---------- lectura de fabric.mod.json (incluye jars anidados, como Fabric API) ----------
function metaFromZip(zip, depth = 0) {
  const AdmZip = require('adm-zip');
  const e = zip.getEntry('fabric.mod.json');
  if (!e) return null;
  let j;
  try { j = JSON.parse(e.getData().toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; }
  if (!j || !j.id) return null;
  const m = {
    id: String(j.id), name: String(j.name || j.id), version: String(j.version || '0'),
    env: j.environment || '*', depends: j.depends || {}, breaks: j.breaks || {},
    provides: (j.provides || []).map(x => typeof x === 'string' ? x : x && x.id).filter(Boolean), nested: [],
  };
  if (depth < 2) for (const n of j.jars || []) {
    try {
      const ent = zip.getEntry(n.file);
      if (ent) { const sub = metaFromZip(new AdmZip(ent.getData()), depth + 1); if (sub) m.nested.push(sub); }
    } catch {}
  }
  return m;
}
function readMeta(file) {
  const AdmZip = require('adm-zip');
  return metaFromZip(new AdmZip(file));
}

// ---------- comprobación ----------
const envOk = (e, ctx) => !e || e === '*' || e === ctx;
// Lo que ya trae Fabric Loader dentro (desde la 0.15): no hay que instalarlo aparte.
// Lithium, Sodium, etc. piden «mixinextras» y antes salía como «no está instalado».
const BUILTIN = new Set(['mixinextras', 'fabricloader', 'fabric-loader', 'java', 'minecraft']);
const rng = r => Array.isArray(r) ? r.join(' o ') : String(r);
const ref = (m, file) => ({ id: m.id, name: m.name, version: m.version, file });

// mods: [{ file, meta }]  ·  ctx: { mc, loader?, env: 'client' | 'server' }
function check(mods, ctx) {
  const issues = [];
  const loaded = mods.filter(m => m.meta && envOk(m.meta.env, ctx.env));
  const idx = new Map(), seen = new Map();
  const add = (id, meta, file) => { if (!idx.has(id)) idx.set(id, ref(meta, file)); };

  for (const m of loaded) {
    if (seen.has(m.meta.id)) {
      const o = seen.get(m.meta.id);
      issues.push({ type: 'duplicate', mod: ref(m.meta, m.file), other: ref(o.meta, o.file), dep: m.meta.id,
        text: `«${m.meta.name}» está repetido (${o.file} y ${m.file}). Borra uno de los dos.` });
    } else seen.set(m.meta.id, m);
    add(m.meta.id, m.meta, m.file);
    m.meta.provides.forEach(p => add(p, m.meta, m.file));
  }
  const walk = (n, f) => { add(n.id, n, f); n.provides.forEach(p => add(p, n, f)); n.nested.forEach(c => walk(c, f)); };
  loaded.forEach(m => m.meta.nested.forEach(n => walk(n, m.file)));

  for (const m of loaded) {
    const me = ref(m.meta, m.file);
    for (const [dep, range] of Object.entries(m.meta.depends)) {
      if (dep === 'java') continue;
      if (dep === 'minecraft') {
        if (ctx.mc && !satisfies(ctx.mc, range))
          issues.push({ type: 'mc', mod: me, other: null, dep, text: `«${m.meta.name}» no es para Minecraft ${ctx.mc} (pide ${rng(range)}).` });
        continue;
      }
      if (dep === 'fabricloader') {
        if (ctx.loader && !satisfies(ctx.loader, range))
          issues.push({ type: 'loader', mod: me, other: null, dep, text: `«${m.meta.name}» necesita Fabric Loader ${rng(range)} y tienes el ${ctx.loader}.` });
        continue;
      }
      const o = idx.get(dep);
      if (!o && BUILTIN.has(dep)) continue;
      if (!o) issues.push({ type: 'missing', mod: me, other: null, dep, text: `«${m.meta.name}» necesita «${dep}» (${rng(range)}) y no está instalado.` });
      else if (!satisfies(o.version, range))
        issues.push({ type: 'version', mod: me, other: o, dep, text: `«${m.meta.name}» necesita ${o.name} ${rng(range)}, pero tienes la ${o.version}.` });
    }
    for (const [dep, range] of Object.entries(m.meta.breaks)) {
      const o = idx.get(dep);
      if (o && o.file !== m.file && satisfies(o.version, range))
        issues.push({ type: 'breaks', mod: me, other: o, dep,
          text: `«${m.meta.name} ${m.meta.version}» no funciona con «${o.name} ${o.version}».` });
    }
  }
  return issues;
}

module.exports = { parseVer, cmp, satisfies, readMeta, check, BUILTIN };
