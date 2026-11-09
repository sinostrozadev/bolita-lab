// Sube y programa videos de EN NÚMEROS ROJOS (Shorts `grafico` y LARGOS `tesis`) en YouTube Studio a través del
// piloto de Bolita Lab (127.0.0.1:8777). El piloto NO vive en este repo: es
// /home/santiago/projects/yt/bolita-lab/herramientas/navegador/piloto.mjs (un solo usuario a la vez; skill
// navegador-piloto). Este script solo le habla por HTTP.
// Uso: NR_CANAL_ID=UC... node herramientas/navegador/subir-studio.mjs <id> <YYYY-MM-DD> <HH:MM>   (hora de Chile, 24h)
// NR_CANAL_ID = id del canal @enumerosrojos (Studio → Configuración → Canal); sin él no se sube nada, para no subir
// por error a Bolita Lab o Línea Punteada (la sesión de Google del piloto es la misma). NR_CANAL_NOMBRE = nombre
// visible del canal (por defecto 'Bolita Lab') para el selector "Select a channel".
// El tipo sale de salida/bandeja/<id>.json (`tipo: 'largo'` → video normal 16:9: URL watch?v=, sin #Shorts, miniatura
// salida/bandeja/<id>-mini.png si existe, descripción con capítulos tal como la dejó el diario; si no, Short).
// Categoría: Educación siempre. Las pausas publicitarias y la pantalla final del largo se ponen después en Studio.
// NR_VISIBILIDAD=privado: sube el video como PRIVADO (sin programar; fecha y hora se ignoran, pasar "-"). Sirve para que Santiago
// revise una versión de prueba en Studio sin tocar la ranura programada. La bandeja queda con estado 'privado'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const B = 'http://127.0.0.1:8777';
const BANDEJA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'salida', 'bandeja');
const CANAL = process.env.NR_CANAL_ID;
const PRIVADO = process.env.NR_VISIBILIDAD === 'privado';
// RETOMAR=1: el diálogo de subida ya está abierto en el piloto con el archivo cargado y los detalles puestos (un intento
// anterior falló después del paso 4): se salta todo hasta Visibility. Se comprueba que el título del diálogo coincida.
const RETOMAR = process.env.RETOMAR === '1';
// En modo privado el título en Studio lleva un sufijo con la versión (el id termina en -vN), para que Santiago lo
// distinga del programado y para que el anti-duplicados no lo confunda con la versión ya subida con el mismo título.
const NOMBRE = process.env.NR_CANAL_NOMBRE || 'Bolita Lab'; // nombre visible del canal de marca (selector "Select a channel")
const [id, fecha, hora] = process.argv.slice(2);
if (!id || (!PRIVADO && (!fecha || !hora))) { console.error('uso: node subir-studio.mjs <id> <YYYY-MM-DD> <HH:MM>   (o NR_VISIBILIDAD=privado node subir-studio.mjs <id> - -)'); process.exit(2); }

const q = (s) => encodeURIComponent(s);
const llamar = async (path) => { const r = await fetch(B + path); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const esperar = (ms) => llamar(`/esperar?ms=${ms}`);
const evalJs = (js) => llamar(`/eval?js=${q(js)}`);
const textoDialogo = () => evalJs(`(document.querySelector('ytcp-uploads-dialog')?.innerText||'').replace(/\\n+/g,' | ')`);
const hasta = async (fn, ms = 60000, paso = 1000, nombre = 'condición') => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await esperar(paso); }
  throw new Error('timeout esperando ' + nombre);
};
const fallo = (m) => { console.error('FALLO:', m); process.exit(1); };
if (!CANAL || !/^UC[\w-]{22}$/.test(CANAL)) fallo('falta NR_CANAL_ID (id UC… del canal @enumerosrojos)');

const meta = JSON.parse(fs.readFileSync(`${BANDEJA}/${id}.json`, 'utf8'));
const SUFIJO_PRIVADO = PRIVADO ? ` · PRUEBA ${(id.match(/-(v\d+)$/)?.[1] || 'privada').toUpperCase()}` : '';
const TITULO_STUDIO = (meta.titulo.trim() + SUFIJO_PRIVADO).slice(0, 100);
if (meta.estado === 'subido' || meta.estado === 'privado') { console.log('ya subido:', id, `(${meta.estado})`); process.exit(0); }
const archivo = `${BANDEJA}/${id}.mp4`;
if (!fs.existsSync(archivo)) fallo('no existe ' + archivo);
const LARGO = meta.tipo === 'largo';
const PESTANA = LARGO ? 'upload' : 'short'; // lista de Studio donde aparece el video (Videos / Shorts)
const categoria = 'Education'; // todo el canal: economía explicada con datos y fuentes
// Largo: sin #Shorts en etiquetas ni descripción (lo clasificaría como Short).
const etiquetas = (meta.hashtags || []).map((h) => h.replace(/^#/, '')).filter((h) => !LARGO || h.toLowerCase() !== 'shorts').join(', ') + ',';
if (LARGO) meta.descripcion = String(meta.descripcion || '').replace(/(^|\s)#shorts\b/gi, '$1').trim();
const MINIATURA = LARGO ? [meta.miniatura && path.resolve(BANDEJA, '..', '..', meta.miniatura), `${BANDEJA}/${id}-mini.png`, `${BANDEJA}/${id}-mini.jpg`].filter(Boolean).find((r) => fs.existsSync(r)) : undefined;
const urlVideo = (v) => (LARGO ? `https://www.youtube.com/watch?v=${v}` : `https://youtube.com/shorts/${v}`);

// Fecha → "Nov 5, 2026" y hora → "6:00 PM"
const [y, m, d] = PRIVADO ? [0, 1, 0] : fecha.split('-').map(Number);
const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fechaStudio = `${meses[m - 1]} ${d}, ${y}`;
const [hh, mm] = PRIVADO ? [0, 0] : hora.split(':').map(Number);
const horaStudio = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;

// Selector de canal de marca: si Studio redirige a signin_prompt ("Select a channel"), elegir el canal objetivo por nombre y
// verificar que de verdad estamos en él. Si no se puede comprobar, FALLA (nunca subir al canal equivocado).
const textoPagina = async () => { const t = await llamar('/texto'); return typeof t === 'string' ? t : JSON.stringify(t); };
const asegurarCanal = async () => {
  await esperar(2500);
  for (let i = 0; i < 2; i++) {
    const tx = await textoPagina();
    // "Oops, you don't have permission": la sesión del piloto está en OTRO canal de la cuenta (otro canal usó Studio antes).
    // Studio ofrece "Switch account" → youtube.com/account lista todos los canales → se elige el nuestro y vuelve a la URL pedida.
    if (/don.t have permission to view this page/i.test(tx)) {
      console.log(`… Studio está en otro canal de la cuenta → "Switch account" → "${NOMBRE}"`);
      await llamar(`/clicktexto?texto=${q('Switch account')}&exacto=1`);
      await esperar(4000);
      const r = await llamar(`/clicktexto?texto=${q(NOMBRE)}&exacto=1`);
      if (r && r.error) fallo('no pude elegir el canal "' + NOMBRE + '" en el selector: ' + r.error);
      await esperar(6000);
      continue;
    }
    if (!/Select a channel/i.test(tx)) break;
    console.log(`… YouTube pide elegir canal → "${NOMBRE}"`);
    const r = await llamar(`/clicktexto?texto=${q(NOMBRE)}&exacto=1`);
    if (r && r.error) fallo('no pude elegir el canal "' + NOMBRE + '": ' + r.error);
    await esperar(5000);
  }
  const estado = () => evalJs(`({u:location.href,n:(document.querySelector('#entity-name, ytcp-navigation-drawer')?.innerText||'').replace(/\\n+/g,' | ')})`);
  let e = {};
  try {
    e = await hasta(async () => {
      const v = await estado();
      return v && typeof v === 'object' && !/signin_prompt/.test(v.u) && v.n.includes(NOMBRE) && (v.u.includes(CANAL) || !/studio\.youtube\.com\/channel\//.test(v.u)) ? v : null;
    }, 30000, 1500, 'verificación de canal');
  } catch { e = await estado(); fallo('no estoy en el canal "' + NOMBRE + '" / ' + CANAL + ': ' + JSON.stringify(e).slice(0, 300)); }
  console.log('✓ canal verificado:', (e.u || '').slice(0, 80));
};
const idDeFila = (extra = '') => `(()=>{const T=${JSON.stringify(TITULO_STUDIO)};for(const r of document.querySelectorAll('ytcp-video-row')){const ls=r.innerText.split(String.fromCharCode(10)).map(x=>x.trim());if(!ls.includes(T)${extra})continue;const a=r.querySelector('a[href*="/video/"]');const m=a&&a.href.match(/\\/video\\/([\\w-]+)/);if(m)return m[1];}return ''})()`;
// Abre /videos/short (o /videos/upload si es largo) y devuelve el id de la fila programada/publicada con ese título ('' si no hay; los borradores no cuentan)
const buscarEnLista = async () => {
  await llamar(`/ir?url=${q(`https://studio.youtube.com/channel/${CANAL}/videos/${PESTANA}`)}`);
  await asegurarCanal();
  await esperar(5000);
  return String(await evalJs(idDeFila(`||/Edit draft/.test(r.innerText)`)) || '');
};
const extraerId = (hrefs, t = '') => ((hrefs || []).join(' ') + ' ' + t).match(/(?:youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/watch\?v=)([\w-]{11})/)?.[1] || '';
const leerConfirmacion = () => evalJs(`(()=>{const ds=[...document.querySelectorAll('ytcp-uploads-dialog, ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog')];return {t:ds.map(d=>d.innerText).join(' ').replace(/\\n+/g,' | '),h:ds.flatMap(d=>[...d.querySelectorAll('a')].map(a=>a.href))}})()`);
const marcar = (videoId, extra = {}) => {
  meta.estado = PRIVADO ? 'privado' : 'subido';
  if (!PRIVADO) meta.publicarEn = meta.publicarEn || `${fecha}T${hora}:00-03:00`;
  meta.videoId = videoId;
  meta.url = urlVideo(videoId);
  if (!PRIVADO) meta.programado = `${fecha} ${hora}`;
  meta.subidoEn = new Date().toISOString();
  Object.assign(meta, extra);
  fs.writeFileSync(`${BANDEJA}/${id}.json`, JSON.stringify(meta, null, 2) + '\n');
};

console.log(`→ ${id} · ${LARGO ? 'LARGO' : 'Short'} · ${fechaStudio} ${horaStudio} · ${categoria}${LARGO ? ` · miniatura ${MINIATURA ? path.basename(MINIATURA) : '(no hay)'}` : ''}`);

let notaMiniatura = '';
if (RETOMAR) {
  const tDialogo = await evalJs(`(document.querySelector('ytcp-uploads-dialog #title-textarea #textbox')||{}).innerText||''`);
  if (String(tDialogo).trim() !== TITULO_STUDIO) fallo('RETOMAR: el diálogo abierto no es este video: ' + String(tDialogo).slice(0, 80));
  console.log('↻ retomando el diálogo abierto desde Visibility');
} else {
// 1. Abrir diálogo de subida y cargar el archivo (o retomar un borrador ya subido con BORRADOR=1)
if (process.env.BORRADOR === '1') {
  await llamar(`/ir?url=${q(`https://studio.youtube.com/channel/${CANAL}/videos/${PESTANA}`)}`);
  await asegurarCanal();
  await hasta(() => evalJs(`Array.from(document.querySelectorAll('ytcp-video-row')).some(r=>/Edit draft/.test(r.innerText))`), 90000, 2000, 'fila del borrador');
  const fila = await evalJs(`Array.from(document.querySelectorAll('ytcp-video-row')).filter(r=>/Edit draft/.test(r.innerText)).map(r=>r.innerText.split(String.fromCharCode(10))[1]||r.innerText.slice(0,60))`);
  if (!Array.isArray(fila) || fila.length !== 1 || !fila[0].replace(/\s/g,'-').includes(id)) fallo('borrador inesperado: ' + JSON.stringify(fila));
  await llamar(`/clicktexto?texto=${q('Edit draft')}&exacto=1`);
} else {
  // Anti-duplicados: si ya hay una fila con este título (fallo a medias), no volver a subir.
  const previo = await buscarEnLista();
  if (previo) {
    marcar(previo, { nota: 'ya existía en Studio; marcado sin re-subir' });
    console.log(`✓ ${id} ya estaba en Studio → ${urlVideo(previo)} (bandeja marcada, sin re-subir)`);
    process.exit(0);
  }
  await llamar(`/ir?url=${q(`https://studio.youtube.com/channel/${CANAL}/videos/upload?d=ud`)}`);
  await asegurarCanal();
  await hasta(() => evalJs(`document.querySelectorAll('input[type=file]').length>0`), 30000, 1000, 'input de archivo');
  await esperar(1500);
  const sub = await llamar(`/archivo?sel=${q('input[type=file]')}&ruta=${q(archivo)}`);
  if (sub.error) fallo('archivo: ' + sub.error);
}
await hasta(() => evalJs(`!!document.querySelector('ytcp-uploads-dialog #title-textarea #textbox')`), 60000, 1000, 'formulario de detalles del diálogo');
// Tope diario (canal sin verificar): el diálogo abre pero con un scrim que bloquea los campos. Abortar AQUÍ, antes de
// escribir nada: cada reintento gasta otra subida del día siguiente. Código 3 para que un lote se detenga.
await esperar(1500);
if (/Daily upload limit reached/i.test(await textoDialogo())) { console.error('✗ TOPE DIARIO DE SUBIDAS: "Daily upload limit reached". No reintentar hasta dentro de 24 h (o verificar el teléfono).'); process.exit(3); }
await esperar(2000);

// 2. Título y descripción (selectores acotados a ytcp-uploads-dialog: si el piloto venía de /video/<id>/edit, la página de
//    atrás también tiene #title-textarea y el texto iba a parar al video equivocado; pasó el 2026-11-08 con reemplazar-largo.sh)
// Escribe en una caja contenteditable del diálogo: /escribir (click+fill) y, si el texto no quedó, foco por /eval +
// seleccionar todo + /tipear. El 2026-11-08 /escribir dejó el título sin cambiar en tres Shorts seguidos (sin error) y la
// descripción respondió "not visible": con este camino de respaldo los dos quedan bien.
const escribirCaja = async (sel, texto, nombre) => {
  const r = await llamar(`/escribir?sel=${q(sel)}&texto=${q(texto)}`);
  await esperar(600);
  const lee = async () => String(await evalJs(`(document.querySelector(${JSON.stringify(sel)})||{}).innerText||''`)).trim();
  if ((await lee()).startsWith(texto.slice(0, 40))) return;
  console.log(`… ${nombre}: /escribir no dejó el texto${r && r.error ? ' (' + String(r.error).slice(0, 60) + ')' : ''}; foco por /eval + seleccionar todo + /tipear`);
  await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'center'});e.focus();e.click();document.execCommand('selectAll',false,null);return true})()`);
  await esperar(400);
  await llamar(`/tecla?k=Backspace`);
  await esperar(300);
  await llamar(`/tipear?t=${q(texto)}`);
  await esperar(800);
  if (!(await lee()).startsWith(texto.slice(0, 40))) fallo(`${nombre}: no pude escribirlo en el diálogo (quedó "${(await lee()).slice(0, 60)}")`);
};
await escribirCaja('ytcp-uploads-dialog #title-textarea #textbox', TITULO_STUDIO, 'título');
await escribirCaja('ytcp-uploads-dialog #description-textarea #textbox', meta.descripcion, 'descripción');
await esperar(1000);
const leido = await evalJs(`[document.querySelector('ytcp-uploads-dialog #title-textarea #textbox').innerText.trim(), document.querySelector('ytcp-uploads-dialog #description-textarea #textbox').innerText.trim()]`);
if (!Array.isArray(leido)) fallo('no pude leer título/descripción del diálogo: ' + JSON.stringify(leido).slice(0, 200));
const [t, dsc] = leido;
if (t !== TITULO_STUDIO) fallo('título no coincide: ' + t);
if (!dsc.startsWith(meta.descripcion.slice(0, 40))) fallo('descripción no coincide');

// 2b. Miniatura del largo (input de archivo del bloque "Thumbnail" del diálogo). Mejor esfuerzo: si Studio no lo permite
// (canal sin verificación por teléfono / funciones intermedias), se avisa y se sigue; queda anotado en la bandeja.
notaMiniatura = '';
if (LARGO && MINIATURA) {
  const SEL_MINI = 'ytcp-uploads-dialog ytcp-thumbnails-compact-editor-uploader input[type=file], ytcp-uploads-dialog ytcp-thumbnail-uploader input[type=file], ytcp-uploads-dialog input#file-loader';
  const hay = await evalJs(`!!document.querySelector(${JSON.stringify(SEL_MINI)})`);
  if (!hay) notaMiniatura = 'no encontré el input de miniatura (¿canal sin verificación por teléfono?)';
  else {
    const rm = await llamar(`/archivo?sel=${q(SEL_MINI)}&ruta=${q(MINIATURA)}`);
    if (rm && rm.error) notaMiniatura = 'miniatura: ' + rm.error;
    else {
      try {
        await hasta(() => evalJs(`(()=>{const d=document.querySelector('ytcp-uploads-dialog');return !!d && [...d.querySelectorAll('ytcp-thumbnails-compact-editor-uploader img, ytcp-thumbnail-uploader img, #still-picker img')].some(i=>/^blob:|^data:/.test(i.src)||i.closest('[selected]'))})()`), 30000, 1500, 'vista previa de la miniatura');
        console.log('✓ miniatura cargada:', path.basename(MINIATURA));
      } catch { notaMiniatura = 'miniatura enviada pero sin vista previa visible: revisarla en Studio'; }
    }
  }
  if (notaMiniatura) console.log('⚠', notaMiniatura, '→ súbela a mano en Studio:', MINIATURA);
} else if (LARGO) notaMiniatura = 'sin archivo de miniatura (salida/bandeja/<id>-mini.png)';

// 3. Audiencia (heredada del canal) — verificar
const txt = await textoDialogo();
if (!/not made for kids/.test(txt)) fallo('audiencia no quedó en "not made for kids"');

// 4. Más opciones: etiquetas, idioma, categoría
await llamar(`/clicktexto?texto=${q('Show more')}&exacto=1`);
await esperar(1500);
await llamar(`/escribir?sel=${q('ytcp-uploads-dialog input[aria-label=Tags]')}&texto=`);
await llamar(`/tipear?t=${q(etiquetas)}`);
await esperar(800);
const r1 = await llamar(`/click?sel=${q('ytcp-uploads-dialog ytcp-dropdown-trigger:has-text("Video language")')}`);
if (r1.error) fallo('idioma: ' + r1.error);
await esperar(1200);
await llamar(`/clicktexto?texto=${q('Spanish (Latin America)')}&exacto=1`);
await esperar(1000);
// Studio recuerda la última categoría del canal: el desplegable puede decir ya "Education" en vez de "People & Blogs".
const catActual = String(await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-dropdown-trigger')).map(i=>i.innerText.trim()).find(t=>/^(People & Blogs|Education|Entertainment|Science & Technology|News & Politics|Howto & Style|Film & Animation|Travel & Events)$/.test(t))||''`));
if (catActual !== categoria) {
  const r2 = await llamar(`/click?sel=${q(`ytcp-uploads-dialog ytcp-dropdown-trigger:has-text("${catActual || 'People & Blogs'}")`)}`);
  if (r2.error) fallo('categoría: ' + r2.error);
  await esperar(1200);
  await llamar(`/clicktexto?texto=${q(categoria)}&exacto=1`);
  await esperar(1000);
}
const resumen = await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-dropdown-trigger')).map(i=>i.innerText.trim().replace(/\\n/g,'=')).filter(t=>/language|Entertain|Science|Educat|People/.test(t)).join(' ; ')`);
if (!/Spanish \(Latin America\)/.test(resumen) || !resumen.includes(categoria)) fallo('idioma/categoría: ' + resumen);
const chips = await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-chip')).map(c=>c.innerText.trim())`);
if (!Array.isArray(chips) || chips.length < 3) fallo('etiquetas: ' + JSON.stringify(chips));

}

// 5. Siguiente ×3 → Visibility
for (let i = 0; i < 3; i++) {
  await hasta(() => evalJs(`(()=>{const b=document.querySelector('ytcp-uploads-dialog #next-button');return !!b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled')!=='true'})()`), 60000, 1000, 'botón Next');
  await llamar(`/click?sel=${q('ytcp-uploads-dialog #next-button')}`);
  await esperar(2500);
}
await hasta(async () => /Schedule as public|Select a date to make your video public/.test(await textoDialogo()), 30000, 1000, 'paso Visibility');

// 6. Visibilidad: PRIVADO (prueba) o programar fecha, hora y zona
if (PRIVADO) {
  await llamar(`/clicktexto?texto=Private&exacto=1`);
  await esperar(1500);
  const marcado = await evalJs(`(()=>{const r=Array.from(document.querySelectorAll('ytcp-uploads-dialog tp-yt-paper-radio-button, ytcp-uploads-dialog [role=radio]')).find(e=>/^\\s*Private/.test(e.innerText||''));return r?(r.getAttribute('aria-checked')||r.getAttribute('checked')||''):'no-radio'})()`);
  if (marcado !== 'true' && marcado !== '') fallo('no quedó marcado Private: ' + marcado);
} else {
  await llamar(`/clicktexto?texto=Schedule&exacto=1`);
  await esperar(1500);
  const r3 = await llamar(`/click?sel=${q('ytcp-uploads-dialog ytcp-dropdown-trigger:has-text("2026")')}`);
  if (r3.error) fallo('selector de fecha: ' + r3.error);
  await esperar(1200);
  await llamar(`/escribir?sel=${q('ytcp-date-picker input')}&texto=${q(fechaStudio)}`);
  await llamar(`/tecla?k=Enter`);
  await esperar(1200);
  const r4 = await llamar(`/click?sel=${q('ytcp-uploads-dialog ytcp-datetime-picker input, ytcp-uploads-dialog input[value$=" AM"], ytcp-uploads-dialog input[value$=" PM"]')}`);
  if (r4.error) fallo('selector de hora: ' + r4.error);
  await esperar(1000);
  await llamar(`/clicktexto?texto=${q(horaStudio)}&exacto=1`);
  await esperar(1000);
  await llamar(`/clicktexto?texto=${q('Time zone')}&exacto=1`);
  await esperar(1200);
  await llamar(`/clicktexto?texto=${q('(GMT-0300) Local Time')}&exacto=1`);
  await esperar(1200);
  const vis = String(await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-dropdown-trigger, ytcp-uploads-dialog input')).filter(e=>e.offsetParent).map(i=>(i.innerText||i.value||'').trim().slice(0,30)).join(' ; ')`)).replace(/\s/g, ' ');
  if (!vis.includes(fechaStudio) || !vis.includes(horaStudio) || !vis.includes('GMT-0300')) fallo('fecha/hora/zona: ' + vis);
}

// 7. Esperar a que termine la subida y programar (un largo de 9–12 min pesa cientos de MB: hasta 45 min)
await hasta(async () => /Checks complete|Upload complete|Processing/.test(await textoDialogo()), LARGO ? 45 * 60000 : 120000, 3000, 'subida completa');
await hasta(() => evalJs(`(()=>{const b=document.querySelector('ytcp-uploads-dialog #done-button');return !!b && !b.hasAttribute('disabled')})()`), 60000, 1000, 'botón Schedule');
await llamar(`/click?sel=${q('ytcp-uploads-dialog #done-button')}`);
await hasta(async () => { const c = await leerConfirmacion(); return c && /Video scheduled|will be set to public|Video processing|Video link|Video saved|saved as private|Video published/i.test(c.t); }, 60000, 1000, 'confirmación');
let c = await leerConfirmacion();
let videoId = extraerId(c.h, c.t);
if (!videoId) {
  console.log('… sin link aún; esperando a que termine el procesamiento (hasta 3 min)');
  try {
    await hasta(async () => {
      c = await leerConfirmacion();
      videoId = extraerId(c.h, c.t);
      return videoId || !/Video processing/.test(c.t) || /Video link/.test(c.t);
    }, 180000, 3000, 'fin de procesamiento');
  } catch (e) { console.log('… ' + e.message); }
  c = await leerConfirmacion(); videoId = videoId || extraerId(c.h, c.t);
}
const cerrar = async () => {
  const r = await llamar(`/click?sel=${q('ytcp-uploads-dialog ytcp-button:has-text("Close") >> visible=true')}`);
  if (r && r.error) await llamar(`/clicktexto?texto=Close&exacto=1`);
  await esperar(1500);
};
await cerrar();
if (!videoId) {
  console.log(`… último recurso: buscar la fila en /videos/${PESTANA}`);
  videoId = await hasta(async () => (await buscarEnLista()) || null, 120000, 5000, 'fila del video en la lista').catch(() => '');
}
if (!videoId) fallo('video programado pero sin id (bandeja NO marcada): ' + (c.t || '').slice(0, 300));

// 8. Marcar en la bandeja (solo con id)
marcar(videoId, notaMiniatura ? { notaMiniatura } : {});
console.log(PRIVADO ? `✓ ${id} → ${urlVideo(videoId)} · PRIVADO (prueba para Santiago)` : `✓ ${id} → ${urlVideo(videoId)} · ${fecha} ${hora}`);
if (LARGO) console.log('  Pendiente a mano en Studio (largo): pausas publicitarias en los límites de capítulo, pantalla final de 20 s y comentario fijado con la pregunta del cierre.');
