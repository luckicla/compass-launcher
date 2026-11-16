'use strict';
// Idiomas de Compass: español, inglés y catalán. Por defecto, el del sistema (si no es español ni catalán, inglés).
// La interfaz está escrita en español y esta capa traduce lo que se ve en pantalla (textos, títulos, placeholders),
// también lo que llega después (avisos, listas…). Lo que no está en el diccionario se queda en español.
const I18N = (() => {
  const DICT = (typeof I18N_DICT !== 'undefined' && I18N_DICT) || {};
  const pick = l => { l = String(l || '').toLowerCase(); return l.startsWith('ca') ? 'ca' : /^(es|gl|eu)/.test(l) ? 'es' : 'en'; };
  const saved = (() => { try { return JSON.parse(localStorage.getItem('cl.lang')); } catch { return null; } })();
  let pref = saved || 'auto';
  let lang = pref === 'auto' ? pick(navigator.language) : pref;
  let map = null, pre = [], suf = [];
  const keep = new Set();   // nombres que pone el usuario (perfiles, servidores, el PC): nunca se traducen
  // frases que cambian (con nombres o números dentro)
  const RX = {
    en: [[/^Tu PC tiene (\d+) GB\. Con 4 a 6 GB va bien para casi cualquier pack de mods\.$/, 'Your PC has $1 GB. 4 to 6 GB is enough for almost any modpack.'],
      [/^Al pulsar Jugar entras directo a (.+), sin pasar por el menú de Minecraft\.$/, 'Press Play to jump straight into $1, skipping the Minecraft menu.'],
      [/^Al pulsar Jugar se sincronizan los mods de (.+) y entras directo a su servidor\.$/, "Press Play to sync $1's mods and jump straight into its server."],
      [/^(.+) está activo\. Ya puedes entrar\.$/, '$1 is active. You can join now.'], [/^Copiado como «(.+)» en (.+)$/, 'Copied as «$1» to $2'], [/^Spawn colocado en (.+)$/, 'Spawn set at $1'],
      [/^«(.+)» instalado como perfil nuevo y activado\. ¡A jugar!$/, '«$1» installed as a new profile and activated. Have fun!'], [/^Mapa guardado como «(.+)»\. Ábrelo en Un jugador\.$/, 'Map saved as «$1». Open it in Singleplayer.'],
      [/^Ahora mismo está encendido «(.+)»\. Solo puede haber un servidor en marcha a la vez\.$/, '«$1» is running right now. Only one server can run at a time.'],
      [/^(\d+) móvil\(es\) conectado\(s\) ahora$/, '$1 phone(s) connected now'], [/^Para Minecraft (.+)\.$/, 'For Minecraft $1.'], [/^Servidor creado con (\d+) mods?\. Pulsa Iniciar cuando quieras\.$/, 'Server created with $1 mod(s). Press Start whenever you like.'],
      [/^Elige dónde instalar (.+)\. Se pone la versión que corresponde a la de Minecraft de cada perfil\.$/, "Choose where to install $1. Each profile gets the build that matches its Minecraft version."],
      [/^«(.+)» va a la papelera\. Los servidores que ya lo usan no se tocan\.$/, '«$1» goes to the bin. Servers already using it are left alone.'],
      [/^hace (\d+) min$/, '$1 min ago'], [/^hace (\d+) h$/, '$1 h ago'], [/^hace (\d+) días$/, '$1 days ago'], [/^Usado hace (\d+) (min|h|días)$/, (m, n, u) => `Used ${n} ${u === 'días' ? 'days' : u} ago`],
      [/^(\d+) jugando$/, '$1 playing'], [/^(\d+) en total$/, '$1 in total'], [/^Minecraft (.+) \(sin mods\)$/, 'Minecraft $1 (no mods)'], [/^(\d+) GB de RAM$/, '$1 GB of RAM'],
      [/^En línea, (\d+) jugador(es)?$/, (m, n) => `Online, ${n} player${n === '1' ? '' : 's'}`], [/^(.+), vas a jugar con$/, "$1, you're playing with"], [/^Ahora juegas con (.+)$/, 'Now playing with $1'],
      [/^¿Quitar (.+)\?$/, 'Remove $1?'], [/^¿Eliminar (.+)\?$/, 'Delete $1?'], [/^¿Borrar (.+)\?$/, 'Delete $1?'], [/^¿Banear a (.+)\?$/, 'Ban $1?'], [/^Compass (.+) está disponible\.(.*)$/, 'Compass $1 is available.$2'],
      [/^¡Nueva versión (.+)!$/, 'New version $1!'], [/^Compass (.+) está listo$/, 'Compass $1 is ready'], [/^Novedades de la (.+)$/, "What's new in $1"], [/^Versión (.+)$/, 'Version $1']],
    ca: [[/^Tu PC tiene (\d+) GB\. Con 4 a 6 GB va bien para casi cualquier pack de mods\.$/, 'El teu PC té $1 GB. Amb 4 a 6 GB n\'hi ha prou per a gairebé qualsevol pack de mods.'],
      [/^Al pulsar Jugar entras directo a (.+), sin pasar por el menú de Minecraft\.$/, 'En prémer Jugar entres directament a $1, sense passar pel menú de Minecraft.'],
      [/^Al pulsar Jugar se sincronizan los mods de (.+) y entras directo a su servidor\.$/, 'En prémer Jugar se sincronitzen els mods de $1 i entres directament al seu servidor.'],
      [/^(.+) está activo\. Ya puedes entrar\.$/, '$1 està actiu. Ja pots entrar.'], [/^Copiado como «(.+)» en (.+)$/, 'Copiat com a «$1» a $2'], [/^Spawn colocado en (.+)$/, 'Spawn col·locat a $1'],
      [/^«(.+)» instalado como perfil nuevo y activado\. ¡A jugar!$/, '«$1» instal·lat com a perfil nou i activat. A jugar!'], [/^Mapa guardado como «(.+)»\. Ábrelo en Un jugador\.$/, 'Mapa desat com a «$1». Obre\'l a Un jugador.'],
      [/^Ahora mismo está encendido «(.+)»\. Solo puede haber un servidor en marcha a la vez\.$/, 'Ara mateix està encès «$1». Només hi pot haver un servidor en marxa alhora.'],
      [/^(\d+) móvil\(es\) conectado\(s\) ahora$/, '$1 mòbil(s) connectat(s) ara'], [/^Para Minecraft (.+)\.$/, 'Per a Minecraft $1.'], [/^Servidor creado con (\d+) mods?\. Pulsa Iniciar cuando quieras\.$/, 'Servidor creat amb $1 mod(s). Prem Iniciar quan vulguis.'],
      [/^Elige dónde instalar (.+)\. Se pone la versión que corresponde a la de Minecraft de cada perfil\.$/, 'Tria on instal·lar $1. S\'hi posa la versió que correspon a la de Minecraft de cada perfil.'],
      [/^«(.+)» va a la papelera\. Los servidores que ya lo usan no se tocan\.$/, '«$1» va a la paperera. Els servidors que ja l\'usen no es toquen.'],
      [/^hace (\d+) min$/, 'fa $1 min'], [/^hace (\d+) h$/, 'fa $1 h'], [/^hace (\d+) días$/, 'fa $1 dies'], [/^Usado hace (\d+) (min|h|días)$/, (m, n, u) => `Fet servir fa ${n} ${u === 'días' ? 'dies' : u}`],
      [/^(\d+) jugando$/, '$1 jugant'], [/^(\d+) en total$/, '$1 en total'], [/^Minecraft (.+) \(sin mods\)$/, 'Minecraft $1 (sense mods)'], [/^(\d+) GB de RAM$/, '$1 GB de RAM'],
      [/^En línea, (\d+) jugador(es)?$/, (m, n) => `En línia, ${n} jugador${n === '1' ? '' : 's'}`], [/^(.+), vas a jugar con$/, '$1, jugaràs amb'], [/^Ahora juegas con (.+)$/, 'Ara jugues amb $1'],
      [/^¿Quitar (.+)\?$/, 'Treure $1?'], [/^¿Eliminar (.+)\?$/, 'Eliminar $1?'], [/^¿Borrar (.+)\?$/, 'Esborrar $1?'], [/^¿Banear a (.+)\?$/, 'Bandejar $1?'], [/^Compass (.+) está disponible\.(.*)$/, 'Compass $1 està disponible.$2'],
      [/^¡Nueva versión (.+)!$/, 'Nova versió $1!'], [/^Compass (.+) está listo$/, 'Compass $1 està a punt'], [/^Novedades de la (.+)$/, 'Novetats de la $1'], [/^Versión (.+)$/, 'Versió $1']],
  };
  function build() {
    map = lang === 'es' ? null : DICT[lang] || null; pre = []; suf = [];
    if (!map) return;
    for (const k of Object.keys(map)) {
      if (/[\s:(«¿]$/.test(k) && k.trim().length > 2) pre.push(k);
      if (/^[\s,.:;)·»]/.test(k) && k.trim().length > 2) suf.push(k);
    }
    pre.sort((a, b) => b.length - a.length); suf.sort((a, b) => b.length - a.length);
  }
  function tr(s, depth = 0) {
    if (!map || !s || depth > 3) return s;
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], t = s.trim();
    if (!t || !/[A-Za-zÁÉÍÓÚáéíóúÑñ¿¡]/.test(t) || keep.has(t)) return s;
    if (Object.prototype.hasOwnProperty.call(map, t)) return lead + map[t] + tail;
    if (Object.prototype.hasOwnProperty.call(map, s)) return map[s];
    for (const [re, to] of RX[lang] || []) if (to != null && re.test(t)) return lead + t.replace(re, to) + tail;
    for (const k of pre) if (s.startsWith(k) && s.length > k.length) return map[k] + tr(s.slice(k.length), depth + 1);
    for (const k of suf) if (s.endsWith(k) && s.length > k.length) return tr(s.slice(0, -k.length), depth + 1) + map[k];
    return s;
  }
  // ----- traducir lo que hay en pantalla y lo que vaya apareciendo -----
  const ATTRS = ['title', 'placeholder', 'aria-label', 'label', 'data-tip'];
  const done = new WeakMap();
  function node(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(p.nodeName) || (p.closest && p.closest('[data-noi18n],.console,.cmdline,svg'))) return;
      const v = n.nodeValue; if (done.get(n) === v) return;
      const out = tr(v); done.set(n, out); if (out !== v) n.nodeValue = out;
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName) || n.hasAttribute('data-noi18n')) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), out = tr(v); if (out !== v) n.setAttribute(a, out); }
    if (n.nodeName === 'INPUT' && (n.type === 'button' || n.type === 'submit') && n.value) n.value = tr(n.value);
    for (const c of n.childNodes) node(c);
  }
  let obs = null;
  function start(root = document.body) {
    build();
    document.documentElement.lang = lang;
    if (!map) { if (obs) { obs.disconnect(); obs = null; } return; }
    node(root);
    if (obs) return;
    obs = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') node(m.target);
        else if (m.type === 'attributes') { if (ATTRS.includes(m.attributeName)) node(m.target); }
        else m.addedNodes.forEach(node);
      }
    });
    obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function set(p) {   // 'auto' | 'es' | 'en' | 'ca'
    pref = p; try { localStorage.setItem('cl.lang', JSON.stringify(p)); } catch {}
    const was = lang; lang = p === 'auto' ? pick(navigator.language) : p;
    return was !== lang;   // si cambia, lo más limpio es recargar la vista
  }
  const protect = names => { for (const n of names || []) if (n && String(n).trim()) keep.add(String(n).trim()); };
  return { tr, start, set, protect, get lang() { return lang; }, get pref() { return pref; }, pick, NAMES: { auto: 'Automático (el del sistema)', es: 'Español', en: 'English', ca: 'Català' } };
})();
if (typeof module !== 'undefined') module.exports = I18N;
