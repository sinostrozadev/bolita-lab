// Sube y programa Shorts en YouTube Studio a través del piloto (127.0.0.1:8777).
// Uso: node subir-studio.mjs <id> <YYYY-MM-DD> <HH:MM>   (hora local de Chile, 24h)
import fs from 'node:fs';

const B = 'http://127.0.0.1:8777';
const BANDEJA = '/home/santiago/projects/yt/bolita-lab/salida/bandeja';
const [id, fecha, hora] = process.argv.slice(2);
if (!id || !fecha || !hora) { console.error('uso: node subir-studio.mjs <id> <YYYY-MM-DD> <HH:MM>'); process.exit(2); }

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

const meta = JSON.parse(fs.readFileSync(`${BANDEJA}/${id}.json`, 'utf8'));
if (meta.estado === 'subido') { console.log('ya subido:', id); process.exit(0); }
const archivo = `${BANDEJA}/${id}.mp4`;
if (!fs.existsSync(archivo)) fallo('no existe ' + archivo);
const categoria = meta.plantilla === 'dato' ? 'Science & Technology' : 'Entertainment';
const etiquetas = (meta.hashtags || []).map((h) => h.replace(/^#/, '')).join(', ') + ',';

// Fecha → "Nov 5, 2026" y hora → "6:00 PM"
const [y, m, d] = fecha.split('-').map(Number);
const meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fechaStudio = `${meses[m - 1]} ${d}, ${y}`;
const [hh, mm] = hora.split(':').map(Number);
const horaStudio = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;

console.log(`→ ${id} · ${fechaStudio} ${horaStudio} · ${categoria}`);

// 1. Abrir diálogo de subida y cargar el archivo (o retomar un borrador ya subido con BORRADOR=1)
if (process.env.CONTINUAR === '1') {
  // El diálogo ya está abierto con el archivo cargado (p. ej. tras un fallo a mitad): se retoma desde el título.
} else if (process.env.BORRADOR === '1') {
  await llamar(`/ir?url=${q('https://studio.youtube.com/channel/UCi1_1_ItZCLY4axLshZcuZQ/videos/short')}`);
  await hasta(() => evalJs(`Array.from(document.querySelectorAll('ytcp-video-row')).some(r=>/Edit draft/.test(r.innerText))`), 90000, 2000, 'fila del borrador');
  const fila = await evalJs(`Array.from(document.querySelectorAll('ytcp-video-row')).filter(r=>/Edit draft/.test(r.innerText)).map(r=>r.innerText.split(String.fromCharCode(10))[1]||r.innerText.slice(0,60))`);
  if (!Array.isArray(fila) || fila.length !== 1 || !fila[0].replace(/\s/g,'-').includes(id)) fallo('borrador inesperado: ' + JSON.stringify(fila));
  await llamar(`/clicktexto?texto=${q('Edit draft')}&exacto=1`);
} else {
  await llamar(`/ir?url=${q('https://studio.youtube.com/channel/UCi1_1_ItZCLY4axLshZcuZQ/videos/upload?d=ud')}`);
  await hasta(() => evalJs(`document.querySelectorAll('input[type=file]').length>0`), 30000, 1000, 'input de archivo');
  await esperar(1500);
  const sub = await llamar(`/archivo?sel=${q('input[type=file]')}&ruta=${q(archivo)}`);
  if (sub.error) fallo('archivo: ' + sub.error);
}
await hasta(() => evalJs(`!!document.querySelector('#title-textarea #textbox')`), 60000, 1000, 'formulario de detalles');
await esperar(2000);

// 2. Título y descripción
if (process.env.CONTINUAR !== '1') {
  await llamar(`/escribir?sel=${q('#title-textarea #textbox')}&texto=${q(meta.titulo)}`);
  await llamar(`/escribir?sel=${q('#description-textarea #textbox')}&texto=${q(meta.descripcion)}`);
}
await esperar(1000);
const [t, dsc] = await evalJs(`[document.querySelector('#title-textarea #textbox').innerText.trim(), document.querySelector('#description-textarea #textbox').innerText.trim()]`);
if (t !== meta.titulo.trim()) fallo('título no coincide: ' + t);
if (!dsc.startsWith(meta.descripcion.slice(0, 40))) fallo('descripción no coincide');

// 3. Audiencia (heredada del canal) — verificar
const txt = await textoDialogo();
if (!/not made for kids/.test(txt)) fallo('audiencia no quedó en "not made for kids"');

// 4. Más opciones: etiquetas, idioma, categoría
if (process.env.CONTINUAR !== '1') {
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
}
// Studio recuerda la última categoría usada, así que el desplegable no siempre dice "People & Blogs":
// se localiza por su contenedor (#category) y solo se abre si no está ya en la categoría pedida.
const catActual = String(await evalJs(`(document.querySelector('ytcp-uploads-dialog ytcp-form-select#category ytcp-dropdown-trigger')?.innerText||'').trim()`));
if (catActual !== categoria) {
  const r2 = await llamar(`/click?sel=${q('ytcp-uploads-dialog ytcp-form-select#category ytcp-dropdown-trigger')}`);
  if (r2.error) fallo('categoría: ' + r2.error);
  await esperar(1200);
  await llamar(`/clicktexto?texto=${q(categoria)}&exacto=1`);
  await esperar(1000);
}
const resumen = await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-dropdown-trigger')).map(i=>i.innerText.trim().replace(/\\n/g,'=')).filter(t=>/language|Entertain|Science|People/.test(t)).join(' ; ')`);
if (!/Spanish \(Latin America\)/.test(resumen) || !resumen.includes(categoria)) fallo('idioma/categoría: ' + resumen);
const chips = await evalJs(`Array.from(document.querySelectorAll('ytcp-uploads-dialog ytcp-chip')).map(c=>c.innerText.trim())`);
if (!Array.isArray(chips) || chips.length < 3) fallo('etiquetas: ' + JSON.stringify(chips));

// 5. Siguiente ×3 → Visibility
for (let i = 0; i < 3; i++) {
  await hasta(() => evalJs(`(()=>{const b=document.querySelector('ytcp-uploads-dialog #next-button');return !!b && !b.hasAttribute('disabled') && b.getAttribute('aria-disabled')!=='true'})()`), 60000, 1000, 'botón Next');
  await llamar(`/click?sel=${q('ytcp-uploads-dialog #next-button')}`);
  await esperar(2500);
}
await hasta(async () => /Schedule as public|Select a date to make your video public/.test(await textoDialogo()), 30000, 1000, 'paso Visibility');

// 6. Programar: fecha, hora, zona
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

// 7. Esperar a que termine la subida y programar
await hasta(async () => /Checks complete|Upload complete|Processing/.test(await textoDialogo()), 120000, 2000, 'subida completa');
await hasta(() => evalJs(`(()=>{const b=document.querySelector('ytcp-uploads-dialog #done-button');return !!b && !b.hasAttribute('disabled')})()`), 60000, 1000, 'botón Schedule');
await llamar(`/click?sel=${q('ytcp-uploads-dialog #done-button')}`);
const leerConfirmacion = () => evalJs(`(()=>{const d=document.querySelector('ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog');const t=d?d.innerText:'';return /Video scheduled|will be set to public/.test(t)?t.replace(/\\n+/g,' | '):''})()`);
// Si los chequeos de copyright aún corren ("Checking 27% …"), Studio abre "We're still checking your content"
// con un botón "Got it" en vez de programar. Se cierra, se espera a "Checks complete" y se vuelve a pulsar Schedule.
const aunChequeando = () => evalJs(`/still checking your content/.test(document.body.innerText)`);
let conf = '';
for (let intento = 0; intento < 3 && !conf; intento++) {
  conf = await hasta(async () => (await leerConfirmacion()) || ((await aunChequeando()) ? 'CHEQUEANDO' : ''), 60000, 1000, 'confirmación');
  if (conf === 'CHEQUEANDO') {
    conf = '';
    console.log('  · chequeos en curso: espero a "Checks complete"');
    await llamar(`/clicktexto?texto=${q('Got it')}&exacto=1`);
    await hasta(async () => /Checks complete/.test(await textoDialogo()), 8 * 60000, 5000, 'Checks complete');
    await esperar(1500);
    await llamar(`/click?sel=${q('ytcp-uploads-dialog #done-button')}`);
  }
}
if (!conf) fallo('sin confirmación tras los chequeos');
const link = (conf.match(/https:\/\/youtube\.com\/shorts\/[\w-]+/) || [])[0];
if (!link) fallo('sin link en confirmación: ' + conf.slice(0, 300));
await llamar(`/clicktexto?texto=Close&exacto=1`);
await esperar(1000);

// 8. Marcar en la bandeja
meta.estado = 'subido';
meta.publicarEn = `${fecha}T${hora}:00-03:00`;
meta.videoId = (link.match(/shorts\/([\w-]+)/) || [])[1];
meta.subidoEn = new Date().toISOString();
fs.writeFileSync(`${BANDEJA}/${id}.json`, JSON.stringify(meta, null, 2) + '\n');
console.log(`✓ ${id} → ${link} · ${fecha} ${hora}`);
