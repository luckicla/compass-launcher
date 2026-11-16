'use strict';
// Web de Compass Launcher: las descargas, las novedades y las versiones antiguas salen solas de GitHub Releases.
const REPO = 'luckicla/compass-launcher';
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// el mismo tema y fondo animado que Compass (tema Compass, oscuro)
try { applyTheme({ theme: 'compass', scheme: 'dark', bg: 'noche', anim: !matchMedia('(prefers-reduced-motion: reduce)').matches }); document.body.prepend(BG.el); } catch (e) { console.error(e); }
for (const id of ['mk', 'logoBig', 'logoAbout']) { const e = document.getElementById(id); if (e) e.innerHTML = LOGO; }
document.querySelectorAll('[data-i]').forEach(e => { e.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">${ICONS[e.dataset.i] || ''}</svg>`; });
$('#qr').innerHTML = QR.svg(`https://github.com/${REPO}/releases/latest/download/Compass-Movil.apk`, { ecl: 'M', border: 2 });

// markdown muy sencillo para las notas: títulos, listas, negritas, cursivas y enlaces
function md(t) {
  const out = []; let list = false;
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
  for (const raw of String(t || '').replace(/\r/g, '').split('\n')) {
    const l = raw.trimEnd(); let m;
    if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if ((m = /^(#{1,4})\s+(.*)/.exec(l))) out.push(`<h4>${inline(m[2])}</h4>`);
    else if (l.trim()) out.push('<p>' + inline(l) + '</p>');
  }
  if (list) out.push('</ul>');
  return out.join('');
}
const fecha = d => new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
const asset = (r, re) => (r.assets || []).find(a => re.test(a.name));
const mb = b => (b / 1048576).toFixed(0) + ' MB';

(async () => {
  let notes = {}; try { notes = await (await fetch('changelog.json', { cache: 'no-store' })).json(); } catch {}
  let rel = [];
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.ok) rel = (await r.json()).filter(x => !x.draft && !x.prerelease);
  } catch {}
  const latest = rel[0];
  if (latest) {
    const v = latest.tag_name.replace(/^v/, ''), inst = asset(latest, /Instalador.*\.exe$/i), port = asset(latest, /Portable.*\.exe$/i);
    if (inst) $('#dlWin').href = inst.browser_download_url;
    if (port) $('#dlPortable').href = port.browser_download_url;
    $('#ver').textContent = `Versión ${v} · ${fecha(latest.published_at)} · Gratis · Windows 10/11 y Android 7+`;
  }
  // novedades: las de cada release (o las de changelog.json si el release no trae notas) + las versiones de antes de GitHub
  const seen = new Set(), items = [];
  for (const r of rel) { const v = r.tag_name.replace(/^v/, ''); seen.add(v); items.push({ v, date: r.published_at, body: (r.body && r.body.trim()) || notes[v] || '', url: r.html_url }); }
  for (const [v, body] of Object.entries(notes)) if (v !== '_' && !seen.has(v)) items.push({ v, date: null, body, old: true });
  items.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
  $('#log').innerHTML = items.length ? items.slice(0, 8).map((x, i) => `<article class="card rel${i === 0 ? ' new' : ''}">
    <header><b>Versión ${esc(x.v)}</b>${i === 0 ? '<span class="tag">Última</span>' : ''}<small>${x.date ? fecha(x.date) : 'antes de publicarse en GitHub'}</small></header>
    <div class="body">${md(x.body) || '<p class="small">Sin notas.</p>'}</div></article>`).join('') : '<p class="small">No he podido cargar las versiones. Míralas en <a href="https://github.com/' + REPO + '/releases">GitHub</a>.</p>';
  // tabla de descargas de todas las versiones
  const link = a => a ? `<a href="${a.browser_download_url}">Descargar</a> <small>${mb(a.size)}</small>` : '<small>—</small>';
  $('#vers tbody').innerHTML = rel.length ? rel.map(r => `<tr><td><b>${esc(r.tag_name)}</b></td><td>${fecha(r.published_at)}</td><td>${link(asset(r, /Instalador.*\.exe$/i))}</td><td>${link(asset(r, /Portable.*\.exe$/i))}</td><td>${link(asset(r, /\.apk$/i))}</td></tr>`).join('')
    : `<tr><td colspan="5" class="small">Mira todas las versiones en <a href="https://github.com/${REPO}/releases">GitHub</a>.</td></tr>`;
})();
