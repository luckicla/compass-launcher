'use strict';
// Vista cenital de mundos de Minecraft (Java 1.17+), sin red y sin dependencias:
// lee los archivos de región (.mca), saca el bloque visible de cada columna con los heightmaps
// y pinta un PNG de 512×512 por región (1 píxel = 1 bloque).
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// ---------- NBT ----------
function parseNBT(buf) {
  let o = 0;
  const str = () => { const n = buf.readUInt16BE(o); o += 2; const s = buf.toString('utf8', o, o + n); o += n; return s; };
  const i32 = () => { const v = buf.readInt32BE(o); o += 4; return v; };
  function pay(t) {
    switch (t) {
      case 1: return buf.readInt8(o++);
      case 2: { const v = buf.readInt16BE(o); o += 2; return v; }
      case 3: return i32();
      case 4: { const v = Number(buf.readBigInt64BE(o)); o += 8; return v; }
      case 5: { const v = buf.readFloatBE(o); o += 4; return v; }
      case 6: { const v = buf.readDoubleBE(o); o += 8; return v; }
      case 7: { const n = i32(); const v = buf.subarray(o, o + n); o += n; return v; }
      case 8: return str();
      case 9: { const et = buf[o++], n = i32(), a = new Array(Math.max(0, n)); for (let i = 0; i < n; i++) a[i] = pay(et); return a; }
      case 10: { const r = {}; for (;;) { const tt = buf[o++]; if (tt === 0 || tt === undefined) break; const k = str(); r[k] = pay(tt); } return r; }
      case 11: { const n = i32(), a = new Array(n); for (let i = 0; i < n; i++) a[i] = i32(); return a; }
      case 12: { const n = i32(), v = { longs: buf.subarray(o, o + n * 8), n }; o += n * 8; return v; }
      default: throw new Error('NBT: tipo desconocido ' + t);
    }
  }
  const t = buf[o++]; if (t !== 10) throw new Error('NBT: no empieza por un compuesto');
  str(); return pay(10);
}

// valores empaquetados en un long array (formato 1.16+: un valor nunca cruza dos longs)
function packed(la, count) {
  const L = la.n || la.longs.length / 8; if (!L) return null;
  const vpl = Math.ceil(count / L), bits = Math.floor(64 / vpl), mask = 2 ** bits - 1, b = la.longs;
  return i => {
    const li = (i / vpl) | 0, off = (i % vpl) * bits, hi = b.readUInt32BE(li * 8), lo = b.readUInt32BE(li * 8 + 4);
    if (off + bits <= 32) return (lo >>> off) & mask;
    if (off >= 32) return (hi >>> (off - 32)) & mask;
    return (((lo >>> off) | (hi << (32 - off))) & mask) >>> 0;
  };
}

// ---------- colores de bloques ----------
const C = {
  grass_block: [109, 153, 63], dirt: [134, 96, 67], coarse_dirt: [119, 85, 59], rooted_dirt: [144, 103, 76], podzol: [91, 63, 24], mycelium: [111, 99, 105],
  dirt_path: [148, 121, 65], farmland: [110, 76, 45], mud: [60, 57, 60], moss_block: [89, 109, 45], moss_carpet: [89, 109, 45], pale_moss_block: [120, 130, 115],
  sand: [219, 207, 163], red_sand: [190, 102, 33], sandstone: [216, 203, 155], red_sandstone: [186, 99, 29], gravel: [131, 127, 126], clay: [160, 166, 179],
  stone: [125, 125, 125], cobblestone: [122, 122, 122], mossy_cobblestone: [110, 118, 94], andesite: [136, 136, 137], diorite: [188, 188, 188], granite: [149, 103, 85],
  deepslate: [80, 80, 82], cobbled_deepslate: [77, 77, 80], tuff: [108, 109, 102], calcite: [223, 224, 220], dripstone_block: [134, 107, 92], bedrock: [85, 85, 85],
  snow: [249, 254, 254], snow_block: [249, 254, 254], powder_snow: [248, 253, 253], ice: [145, 183, 253], packed_ice: [141, 180, 250], blue_ice: [116, 167, 253],
  water: [52, 92, 196], lava: [207, 92, 15], obsidian: [15, 10, 24], magma_block: [142, 63, 31],
  terracotta: [152, 94, 67], white_terracotta: [209, 178, 161], orange_terracotta: [161, 83, 37], yellow_terracotta: [186, 133, 35], brown_terracotta: [77, 51, 35],
  red_terracotta: [143, 61, 46], light_gray_terracotta: [135, 106, 97],
  oak_leaves: [59, 105, 30], spruce_leaves: [46, 78, 46], birch_leaves: [94, 128, 56], jungle_leaves: [48, 115, 22], acacia_leaves: [70, 110, 25],
  dark_oak_leaves: [44, 88, 22], mangrove_leaves: [62, 112, 35], cherry_leaves: [229, 172, 194], azalea_leaves: [90, 117, 44], flowering_azalea_leaves: [112, 121, 64],
  pale_oak_leaves: [160, 168, 150],
  cactus: [85, 127, 43], pumpkin: [198, 118, 24], melon: [111, 145, 30], hay_block: [166, 136, 38], lily_pad: [32, 128, 48], sugar_cane: [148, 192, 101],
  bamboo: [93, 144, 19], mangrove_roots: [74, 59, 38], muddy_mangrove_roots: [70, 59, 45], sculk: [12, 29, 36], dried_kelp_block: [50, 58, 38],
  netherrack: [98, 38, 38], soul_sand: [81, 62, 50], soul_soil: [75, 57, 46], basalt: [80, 80, 86], blackstone: [42, 35, 40], crimson_nylium: [130, 31, 31],
  warped_nylium: [43, 114, 101], glowstone: [171, 131, 84], end_stone: [219, 222, 158], purpur_block: [169, 125, 169],
  oak_planks: [162, 130, 78], spruce_planks: [114, 84, 48], birch_planks: [192, 175, 121], stone_bricks: [122, 121, 122], bricks: [150, 97, 83],
  glass: [175, 213, 219], torch: [255, 210, 120], white_wool: [233, 236, 236], quartz_block: [235, 229, 222], smooth_stone: [158, 158, 158],
};
const KW = [
  [/_leaves$/, [60, 104, 34]], [/_log$|_wood$|_stem$|_hyphae$/, [102, 81, 51]], [/_planks$|_slab$|_stairs$|_fence|_door$|_trapdoor$/, [150, 120, 75]],
  [/terracotta$/, [150, 92, 66]], [/concrete/, [140, 140, 140]], [/_wool$|_carpet$/, [200, 200, 200]], [/glass/, [175, 213, 219]],
  [/coral/, [200, 90, 140]], [/snow/, [249, 254, 254]], [/ice$/, [145, 183, 253]], [/deepslate/, [80, 80, 82]], [/sandstone/, [214, 200, 152]],
  [/brick/, [130, 110, 105]], [/ore$/, [125, 125, 125]], [/_flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of/, [109, 153, 63]],
  [/grass|fern|bush|sapling|vine|roots|sprouts/, [100, 145, 60]], [/mushroom/, [150, 110, 90]], [/copper/, [190, 110, 80]], [/rail/, [120, 110, 100]],
];
// colores de cada bioma como en el juego: hierba, hojas y agua (hex)
const BIOME = {
  plains: [0x91bd59, 0x77ab2f, 0x3f76e4], sunflower_plains: [0x91bd59, 0x77ab2f, 0x3f76e4], beach: [0x91bd59, 0x77ab2f, 0x3f76e4],
  forest: [0x79c05a, 0x59ae30, 0x3f76e4], flower_forest: [0x79c05a, 0x59ae30, 0x3f76e4], birch_forest: [0x88bb67, 0x6ba941, 0x3f76e4], old_growth_birch_forest: [0x88bb67, 0x6ba941, 0x3f76e4],
  dark_forest: [0x507a32, 0x59ae30, 0x3f76e4], pale_garden: [0x778272, 0x878d76, 0x76889d],
  taiga: [0x86b783, 0x68a464, 0x287082], old_growth_pine_taiga: [0x86b87f, 0x68a55f, 0x3f76e4], old_growth_spruce_taiga: [0x86b783, 0x68a464, 0x3f76e4],
  snowy_taiga: [0x80b497, 0x60a17b, 0x3d57d6], snowy_plains: [0x80b497, 0x60a17b, 0x3d57d6], ice_spikes: [0x80b497, 0x60a17b, 0x3d57d6], snowy_beach: [0x83b593, 0x64a278, 0x3d57d6],
  grove: [0x80b497, 0x60a17b, 0x3d57d6], snowy_slopes: [0x80b497, 0x60a17b, 0x3d57d6], frozen_peaks: [0x80b497, 0x60a17b, 0x3d57d6], jagged_peaks: [0x80b497, 0x60a17b, 0x3d57d6], stony_peaks: [0x9abe4b, 0x82ac1e, 0x3f76e4],
  meadow: [0x83bb6d, 0x63a948, 0x0e4ecf], cherry_grove: [0xb6db61, 0xb6db61, 0x5db7ef],
  windswept_hills: [0x8ab689, 0x6da36b, 0x3f76e4], windswept_gravelly_hills: [0x8ab689, 0x6da36b, 0x3f76e4], windswept_forest: [0x8ab689, 0x6da36b, 0x3f76e4], stony_shore: [0x8ab689, 0x6da36b, 0x3f76e4],
  jungle: [0x59c93c, 0x30bb0b, 0x14a2c5], sparse_jungle: [0x64c73f, 0x3eb80f, 0x0d8ae3], bamboo_jungle: [0x59c93c, 0x30bb0b, 0x14a2c5],
  savanna: [0xbfb755, 0xaea42a, 0x2c8b9c], savanna_plateau: [0xbfb755, 0xaea42a, 0x2590a8], windswept_savanna: [0xbfb755, 0xaea42a, 0x2590a8],
  desert: [0xbfb755, 0xaea42a, 0x32a598], badlands: [0x90814d, 0x9e814d, 0x4e7f81], eroded_badlands: [0x90814d, 0x9e814d, 0x497f99], wooded_badlands: [0x90814d, 0x9e814d, 0x55809e],
  swamp: [0x6a7039, 0x6a7039, 0x617b64], mangrove_swamp: [0x6a7039, 0x8db127, 0x3a7a6a], mushroom_fields: [0x55c93f, 0x2bbb0f, 0x8a8997],
  river: [0x8db360, 0x71a74d, 0x3f76e4], frozen_river: [0x80b497, 0x60a17b, 0x3938c9],
  ocean: [0x8db360, 0x71a74d, 0x3f76e4], deep_ocean: [0x8db360, 0x71a74d, 0x3f76e4], warm_ocean: [0x8db360, 0x71a74d, 0x43d5ee],
  lukewarm_ocean: [0x8db360, 0x71a74d, 0x45adf2], deep_lukewarm_ocean: [0x8db360, 0x71a74d, 0x45adf2], cold_ocean: [0x8db360, 0x71a74d, 0x3d57d6], deep_cold_ocean: [0x8db360, 0x71a74d, 0x3d57d6],
  frozen_ocean: [0x80b497, 0x60a17b, 0x3938c9], deep_frozen_ocean: [0x80b497, 0x60a17b, 0x3938c9],
  dripstone_caves: [0x91bd59, 0x77ab2f, 0x3f76e4], lush_caves: [0x91bd59, 0x77ab2f, 0x3f76e4], deep_dark: [0x91bd59, 0x77ab2f, 0x3f76e4],
};
const BIOME0 = [0x91bd59, 0x77ab2f, 0x3f76e4];
const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const BIOME_RGB = new Map();
const biomeRGB = name => { let v = BIOME_RGB.get(name); if (!v) { const b = BIOME[name] || BIOME0; v = b.map(rgb); BIOME_RGB.set(name, v); } return v; };
const GRASSY = /^(grass_block|short_grass|grass|tall_grass|fern|large_fern|sugar_cane)$/;
const LEAFY = /^(oak_leaves|jungle_leaves|acacia_leaves|dark_oak_leaves|mangrove_leaves|vine)$/;
const WATERY = new Set(['water', 'kelp', 'kelp_plant', 'seagrass', 'tall_seagrass', 'bubble_column']);
const AIR = new Set(['air', 'cave_air', 'void_air', 'light', 'structure_void', 'barrier']);
const colorCache = new Map(), unknown = new Map();   // bloques sin color propio (para ir completando la tabla)
function colorOf(name) {
  let c = colorCache.get(name); if (c) return c;
  c = C[name];
  if (!c) for (const [re, col] of KW) if (re.test(name)) { c = col; break; }
  if (!c) { c = [128, 124, 118]; unknown.set(name, (unknown.get(name) || 0) + 1); }
  colorCache.set(name, c); return c;
}

// ---------- región ----------
const tick = () => new Promise(r => setImmediate(r));
function chunkNBT(b, i) {
  const loc = b.readUInt32BE(i * 4), off = (loc >>> 8) * 4096, cnt = loc & 255;
  if (!off || !cnt || off + 5 > b.length) return null;
  const len = b.readUInt32BE(off), ct = b[off + 4];
  if (ct & 128 || len < 2) return null;            // chunk enorme guardado aparte (.mcc): se omite
  const data = b.subarray(off + 5, Math.min(b.length, off + 4 + len));
  try {
    const raw = ct === 1 ? zlib.gunzipSync(data) : ct === 2 ? zlib.inflateSync(data) : ct === 3 ? data : null;
    return raw ? parseNBT(raw) : null;
  } catch { return null; }
}

// devuelve { rgba: Buffer(512*512*4), heights: Int16Array(512*512), chunks, old }
async function renderRegion(file) {
  const b = fs.readFileSync(file), W = 512;
  const rgba = Buffer.alloc(W * W * 4), H = new Int16Array(W * W).fill(-32768), depth = new Int16Array(W * W).fill(-1);
  let chunks = 0, old = 0;
  for (let i = 0; i < 1024; i++) {
    if (i % 48 === 47) await tick();                 // deja respirar al resto de la app
    const nbt = chunkNBT(b, i); if (!nbt) continue;
    const root = nbt.Level || nbt;
    const hms = root.Heightmaps || {};
    const hmRaw = hms.MOTION_BLOCKING || hms.WORLD_SURFACE; if (!hmRaw || !hmRaw.longs) { if (root.Sections && !hmRaw) old++; continue; }
    const secsRaw = root.sections || root.Sections || [];
    const secs = new Map(); let minSec = Infinity;
    for (const s of secsRaw) {
      const bs = s.block_states, pal = bs ? bs.palette : s.Palette, data = bs ? bs.data : s.BlockStates;
      if (!pal || !pal.length) continue;
      const names = pal.map(p => String(p.Name || 'air').replace(/^minecraft:/, ''));
      const bm = s.biomes, bpal = bm && bm.palette ? bm.palette.map(b => String(b).replace(/^minecraft:/, '')) : null;
      secs.set(s.Y, { names, get: names.length > 1 && data && data.longs ? packed(data, 4096) : null,
        bpal, bget: bpal && bpal.length > 1 && bm.data && bm.data.longs ? packed(bm.data, 64) : null });
      if (s.Y < minSec) minSec = s.Y;
    }
    if (minSec === Infinity) continue;
    const minY = minSec * 16, hm = packed(hmRaw, 256), of = hms.OCEAN_FLOOR && hms.OCEAN_FLOOR.longs ? packed(hms.OCEAN_FLOOR, 256) : null;
    const cx = (i & 31) * 16, cz = (i >> 5) * 16;
    const biomeAt = (x, y, z) => {
      const s = secs.get(Math.floor(y / 16)); if (!s || !s.bpal) return 'plains';
      return s.bget ? (s.bpal[s.bget((((y & 15) >> 2) * 4 + (z >> 2)) * 4 + (x >> 2))] || 'plains') : s.bpal[0];
    };
    const blockAt = (x, y, z) => {
      const s = secs.get(Math.floor(y / 16)); if (!s) return 'air';
      return s.get ? (s.names[s.get((((y & 15) * 16) + z) * 16 + x)] || 'air') : s.names[0];
    };
    chunks++;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const v = hm(z * 16 + x); if (!v) continue;
      let y = minY + v - 1, name = blockAt(x, y, z);
      for (let k = 0; k < 6 && AIR.has(name); k++) name = blockAt(x, --y, z);
      const p = (cz + z) * W + cx + x;
      H[p] = y;
      let c = colorOf(name);
      if (WATERY.has(name)) { c = biomeRGB(biomeAt(x, y, z))[2]; depth[p] = of ? Math.max(1, y - (minY + of(z * 16 + x) - 1)) : 4; }
      else if (GRASSY.test(name)) { const g = biomeRGB(biomeAt(x, y, z))[0]; c = [g[0] * .82, g[1] * .82, g[2] * .82]; }
      else if (LEAFY.test(name)) { const f = biomeRGB(biomeAt(x, y, z))[1]; c = [f[0] * .78, f[1] * .78, f[2] * .78]; }
      rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2]; rgba[p * 4 + 3] = 255;
    }
  }
  // relieve: más claro si sube respecto al bloque de arriba (norte), más oscuro si baja; el agua se oscurece con la profundidad
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const p = z * W + x; if (H[p] === -32768) continue;
    let f;
    if (depth[p] >= 0) f = Math.max(0.45, 1.08 - depth[p] * 0.045);
    else { const n = z > 0 && H[p - W] !== -32768 ? H[p - W] : H[p]; const w = x > 0 && H[p - 1] !== -32768 ? H[p - 1] : H[p]; const d = (H[p] - n) + (H[p] - w) * 0.5; f = d > 0 ? Math.min(1.22, 1 + d * 0.07) : d < 0 ? Math.max(0.7, 1 + d * 0.07) : 1; }
    for (let k = 0; k < 3; k++) rgba[p * 4 + k] = Math.max(0, Math.min(255, Math.round(rgba[p * 4 + k] * f)));
  }
  return { rgba, heights: H, chunks, old };
}

// ---------- PNG ----------
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------- mundo ----------
// carpeta con el terreno del mundo normal: desde la 26.1 está en dimensions/minecraft/overworld/region; antes, en region/
function regionDir(worldDir) {
  const nuevo = path.join(worldDir, 'dimensions', 'minecraft', 'overworld', 'region');
  return fs.existsSync(nuevo) ? nuevo : path.join(worldDir, 'region');
}
function readDat(f) { try { const b = fs.readFileSync(f); return parseNBT(b[0] === 0x1f ? zlib.gunzipSync(b) : b); } catch { return null; } }
function levelInfo(worldDir) {
  try {
    const d = parseNBT(zlib.gunzipSync(fs.readFileSync(path.join(worldDir, 'level.dat')))).Data || {};
    let seed = d.WorldGenSettings && d.WorldGenSettings.seed != null ? String(d.WorldGenSettings.seed) : d.RandomSeed != null ? String(d.RandomSeed) : null;
    if (seed == null) {   // 26.1+: la semilla va en data/minecraft/world_gen_settings.dat
      const w = readDat(path.join(worldDir, 'data', 'minecraft', 'world_gen_settings.dat'));
      const x = w && (w.data || w);
      if (x && x.seed != null) seed = String(x.seed);
    }
    let spawn = null;
    if (typeof d.SpawnX === 'number') spawn = { x: d.SpawnX, y: d.SpawnY, z: d.SpawnZ };
    else if (d.spawn && Array.isArray(d.spawn.pos)) spawn = { x: d.spawn.pos[0], y: d.spawn.pos[1], z: d.spawn.pos[2] };
    return { name: d.LevelName || path.basename(worldDir), version: d.Version && d.Version.Name || null, spawn, seed };
  } catch { return null; }
}
function listRegions(worldDir) {
  const dir = regionDir(worldDir);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const m = /^r\.(-?\d+)\.(-?\d+)\.mca$/.exec(f); if (!m) continue;
    const st = fs.statSync(path.join(dir, f)); if (st.size <= 8192) continue;
    out.push({ x: +m[1], z: +m[2], mtime: st.mtimeMs, size: st.size });
  }
  return out;
}
// tamaño de una carpeta (para mostrar cuánto ocupa un mundo)
function dirSize(d, depth = 0) {
  let n = 0;
  try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (depth < 6) n += dirSize(p, depth + 1); } else n += fs.statSync(p).size; } } catch {}
  return n;
}

module.exports = { unknown, regionDir, parseNBT, packed, renderRegion, encodePNG, levelInfo, listRegions, dirSize, colorOf };
