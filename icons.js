'use strict';
// Iconos propios de Compass Launcher: rejilla de 24, trazo de 2 con remates cuadrados
// y un "píxel" macizo de acento en muchos de ellos, como guiño a los bloques.
const PX = (x, y, s = 2) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="currentColor" stroke="none"/>`;
const ICONS = {
  play: '<path d="M7 4.5v15L19.5 12z" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.5V20h4.5v-6h4v6h4.5V9.5"/>',
  profiles: '<rect x="3" y="7" width="13" height="14"/><path d="M8 3h13v14"/><rect x="7" y="10" width="5" height="5"/><path d="M6.5 18h6"/>',
  bag: '<path d="M4 8h16l-1.2 13H5.2z"/><path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8"/>' + PX(11, 13),
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>' + PX(15, 13.5),
  server: '<rect x="3" y="4" width="18" height="7"/><rect x="3" y="13" width="18" height="7"/><path d="M6.5 7.5h3M6.5 16.5h3"/>' + PX(15.5, 6.5) + PX(15.5, 15.5),
  map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  flag: '<path d="M6 21V3"/><path d="M6 4h12l-3 3.5 3 3.5H6"/>' + PX(4, 20, 4),
  console: '<rect x="3" y="4" width="18" height="16"/><path d="m7 9 3 3-3 3M12.5 15H17"/>',
  users: '<rect x="5" y="4" width="6" height="6"/><path d="M2.5 20v-2.5A3.5 3.5 0 0 1 6 14h4a3.5 3.5 0 0 1 3.5 3.5V20"/><path d="M15 4h4v6h-4M17 14h1.5a3.5 3.5 0 0 1 3 3.5V20"/>',
  user: '<rect x="8" y="3" width="8" height="8"/><path d="M4 21v-2.5A4.5 4.5 0 0 1 8.5 14h7a4.5 4.5 0 0 1 4.5 4.5V21"/>',
  userplus: '<rect x="5" y="3" width="8" height="8"/><path d="M2 21v-2.5A4.5 4.5 0 0 1 6.5 14h5a4.5 4.5 0 0 1 4.5 4.5V21M19 7v6M16 10h6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>' + PX(11, 14),
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  folder: '<path d="M3 5h6l2 2.5h10V19H3z"/>',
  folderplus: '<path d="M3 5h6l2 2.5h10V19H3z"/><path d="M12 10.5v6M9 13.5h6"/>',
  file: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/>',
  fileplus: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  filetext: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M8.5 12.5h7M8.5 16.5h5"/>',
  chest: '<path d="M3 10V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3"/><rect x="3" y="10" width="18" height="10"/><path d="M3 13h18"/>' + PX(10.5, 11.5, 3),
  // ajustes: tres deslizadores a píxeles (antes una rueda dentada)
  gear: '<rect x="3" y="5" width="18" height="2" fill="currentColor" stroke="none"/><rect x="3" y="11" width="18" height="2" fill="currentColor" stroke="none"/><rect x="3" y="17" width="18" height="2" fill="currentColor" stroke="none"/><rect x="13" y="3" width="4" height="6" fill="currentColor" stroke="none"/><rect x="5" y="9" width="4" height="6" fill="currentColor" stroke="none"/><rect x="15" y="15" width="4" height="6" fill="currentColor" stroke="none"/>',
  power: '<path d="M12 3v8"/><path d="M7 6.2a7.5 7.5 0 1 0 10 0"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3.5V9h-5.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5"/><path d="M4 3.5V8.5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.6l1.7-2.1"/><path d="M20 20.5v-5h-5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 6.5h16M9 6.5V3.5h6v3M6 6.5l1 14.5h10l1-14.5"/><path d="M10 10.5v6.5M14 10.5v6.5"/>',
  copy: '<rect x="8" y="8" width="13" height="13"/><path d="M16 8V3H3v13h5"/>',
  link: '<path d="M10 14l4-4"/><path d="M8.5 7.5l2-2a4.25 4.25 0 0 1 6 6l-2 2M15.5 16.5l-2 2a4.25 4.25 0 0 1-6-6l2-2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4"/>' + PX(11, 16.5),
  info: '<rect x="3" y="3" width="18" height="18"/><path d="M12 11v6"/>' + PX(11, 7),
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16.5a5 5 0 0 1 6 0"/>' + PX(11, 19),
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/>',
  tunnel: '<path d="M2 20h20M4 20v-8a8 8 0 0 1 16 0v8"/><path d="M9 20v-7a3 3 0 0 1 6 0v7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><rect x="10" y="10" width="4" height="4"/>',
  edit: '<path d="M4 20h4.5L19.5 9 15 4.5 4 15.5z"/><path d="m12.5 7 4.5 4.5"/>',
  bolt: '<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12z"/>',
  chevdown: '<path d="m6 9 6 6 6-6"/>', chevup: '<path d="m6 15 6-6 6 6"/>', chevright: '<path d="m9 6 6 6-6 6"/>', chevleft: '<path d="m15 6-6 6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  seed: '<path d="M12 21v-9"/><path d="M12 12c0-4.5-3.5-7-8-7 0 4.5 3 7 8 7zM12 14.5c0-4 3-6.5 8-6.5 0 4-3 6.5-8 6.5z"/>',
  sword: '<path d="M20 4v4.5L10.5 18 6 13.5 15.5 4z"/><path d="m4.5 15 4.5 4.5M3 21l3-3"/>',
  pc: '<rect x="2.5" y="4" width="19" height="12"/><path d="M8 20h8M12 16v4"/>' + PX(5, 7),
  phone: '<rect x="6" y="2.5" width="12" height="19"/><path d="M10 18.5h4"/>' + PX(11, 5),
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' + PX(15, 15) + PX(19, 19) + PX(19, 15) + PX(15, 19) + PX(5.5, 5.5) + PX(16.5, 5.5) + PX(5.5, 16.5),
  key: '<rect x="2.5" y="9" width="7" height="7"/><path d="M9.5 12.5H21M17.5 12.5V16M20.5 12.5V15"/>',
  door: '<path d="M14 3h6v18h-6"/><path d="M3 12h11M10 8l4 4-4 4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  sun: '<rect x="8" y="8" width="8" height="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9A5.5 5.5 0 0 1 17 8a4.5 4.5 0 0 1 .5 10z"/>',
  save: '<path d="M4 4h12.5L20 7.5V20H4z"/><path d="M8 4v5h7.5V4M8 20v-6h8v6"/>',
  target: '<path d="M12 2.5V8M12 16v5.5M2.5 12H8M16 12h5.5"/><rect x="10" y="10" width="4" height="4" fill="currentColor" stroke="none"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
  send: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  heart: '<path d="M12 20 4 12V7l3-3h3l2 2 2-2h3l3 3v5z"/>',
  pickaxe: '<path d="M13.5 10.5 4 20"/><path d="M5 5.5C9.5 2.5 15 3 18 6s3.5 8.5.5 13"/>' + PX(12, 9, 3),
  layout: '<rect x="3" y="4" width="18" height="16"/><path d="M9 4v16"/>',
  zap: '<path d="M4 14h5l-2 7 13-11h-6l2-7z"/>',
  image: '<rect x="3" y="4" width="18" height="16"/><path d="m3 17 5-5 4 4 3-3 6 6"/>' + PX(15, 7.5, 3),
  rename: '<rect x="3" y="7" width="18" height="10"/><path d="M15 4v16M12.5 4h5M12.5 20h5"/>',
  tp: '<rect x="3" y="3" width="7" height="7"/><path d="M10 6.5h7.5v6"/><path d="m14.5 10 3 3 3-3"/>' + PX(14, 15, 7) + PX(5, 5, 3),
  palette: '<path d="M3 4h18v11h-7v6H3z"/>' + PX(6, 7, 3) + PX(10.5, 7, 3) + PX(15, 7, 3) + PX(6, 11.5, 3),
  sparkle: PX(11, 2, 2) + PX(11, 20, 2) + PX(2, 11, 2) + PX(20, 11, 2) + '<rect x="8" y="8" width="8" height="8"/>' + PX(10.5, 10.5, 3) + PX(5, 5, 2) + PX(17, 17, 2),
  grid: '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  dots: PX(5, 11) + PX(11, 11) + PX(17, 11),
};
// el logo: aguja de brújula a bloques (norte ámbar = jugar, sur prismarina = servidores)
const LOGO = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M8 2h48v2h2v2h2v2h2v48h-2v2h-2v2h-2v2H8v-2H6v-2H4v-2H2V8h2V6h2V4h2z" fill="#2b2139"/>
<path d="M8 4h48v2h2v2H6V6h2z" fill="#fff" opacity=".08"/>
<g fill="#f1eadf" opacity=".35"><rect x="31" y="5" width="2" height="3"/><rect x="31" y="56" width="2" height="3"/><rect x="5" y="31" width="3" height="2"/><rect x="56" y="31" width="3" height="2"/></g>
<g class="needle">
<path d="M30 10h4v6h2v6h2v6h2v4H24v-4h2v-6h2v-6h2z" fill="#ffb547"/><path d="M32 10h2v6h2v6h2v6h2v4h-8z" fill="#ffd28a"/>
<path d="M24 32h16v4h-2v6h-2v6h-2v6h-4v-6h-2v-6h-2v-6h-2z" fill="#5fd4c4"/><path d="M24 32h8v22h-2v-6h-2v-6h-2v-6h-2z" fill="#2f9f92"/>
</g>
<rect x="29" y="29" width="6" height="6" fill="#f1eadf"/><rect x="31" y="31" width="2" height="2" fill="#1c1527"/></svg>`;
