// Pinta las regiones de un mundo con worldmap.js y dice qué parte sale sin color (gris por defecto)
const WM = require('../../worldmap.js'), fs = require('fs'), path = require('path');
(async () => {
  const wd = process.argv[2], out = process.argv[3];
  const regs = WM.listRegions(wd); console.log('carpeta de regiones:', WM.regionDir(wd), 'regiones:', regs.length, 'info:', JSON.stringify(WM.levelInfo(wd)));
  if (!regs.length) { console.log('SIN REGIONES'); process.exit(1); }
  let px = 0, gray = 0, chunks = 0, counts = new Map();
  for (const r of regs.slice(0, 6)) {
    const res = await WM.renderRegion(path.join(WM.regionDir(wd), `r.${r.x}.${r.z}.mca`)); chunks += res.chunks;
    for (let i = 0; i < res.rgba.length; i += 4) if (res.rgba[i + 3]) { px++; const k = res.rgba[i] + ',' + res.rgba[i + 1] + ',' + res.rgba[i + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
    fs.writeFileSync(path.join(out, `r.${r.x}.${r.z}.png`), WM.encodePNG(512, 512, res.rgba));
  }
  for (const [n, c] of WM.unknown) gray += c;
  console.log('chunks:', chunks, 'pixeles:', px, 'colores distintos:', counts.size);
  console.log('bloques sin color:', JSON.stringify([...WM.unknown].sort((a, b) => b[1] - a[1]).slice(0, 40)));
  if (!chunks || counts.size < 8) { console.log('MAPA SIN COLOR'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
