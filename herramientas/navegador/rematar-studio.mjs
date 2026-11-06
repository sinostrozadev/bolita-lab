// Remata una subida que quedó con el diálogo de Studio abierto en el paso Visibility (fecha/hora ya puestas):
// cierra "We're still checking", espera "Checks complete", pulsa Schedule, lee el link y marca la bandeja.
// Uso: node rematar-studio.mjs <id> <YYYY-MM-DD> <HH:MM>
import fs from 'node:fs';
const B = 'http://127.0.0.1:8777';
const BANDEJA = '/home/santiago/projects/yt/bolita-lab/salida/bandeja';
const [id, fecha, hora] = process.argv.slice(2);
const q = (s) => encodeURIComponent(s);
const llamar = async (p) => { const t = await (await fetch(B + p)).text(); try { return JSON.parse(t); } catch { return t; } };
const esperar = (ms) => llamar(`/esperar?ms=${ms}`);
const evalJs = (js) => llamar(`/eval?js=${q(js)}`);
const textoDialogo = () => evalJs(`(document.querySelector('ytcp-uploads-dialog')?.innerText||'').replace(/\\n+/g,' | ')`);
const hasta = async (fn, ms, paso, nombre) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await esperar(paso); } throw new Error('timeout esperando ' + nombre); };
const meta = JSON.parse(fs.readFileSync(`${BANDEJA}/${id}.json`, 'utf8'));
const titulo = await evalJs(`(document.querySelector('ytcp-uploads-dialog div#title')?.innerText||'').trim()`);
if (!String(titulo).startsWith(meta.titulo.slice(0, 20))) { console.error('FALLO: el diálogo abierto no es de', id, '→', titulo); process.exit(1); }
if (await evalJs(`/still checking your content/.test(document.body.innerText)`)) await llamar(`/clicktexto?texto=${q('Got it')}&exacto=1`);
await hasta(async () => /Checks complete/.test(await textoDialogo()), 8 * 60000, 5000, 'Checks complete');
await esperar(1500);
await llamar(`/click?sel=${q('ytcp-uploads-dialog #done-button')}`);
const conf = await hasta(() => evalJs(`(()=>{const d=document.querySelector('ytcp-video-share-dialog, ytcp-uploads-still-processing-dialog');const t=d?d.innerText:'';return /Video scheduled|will be set to public/.test(t)?t.replace(/\\n+/g,' | '):''})()`), 60000, 1000, 'confirmación');
const link = (conf.match(/https:\/\/youtube\.com\/shorts\/[\w-]+/) || [])[0];
if (!link) { console.error('FALLO: sin link:', conf.slice(0, 300)); process.exit(1); }
await llamar(`/clicktexto?texto=Close&exacto=1`); await esperar(1000);
Object.assign(meta, { estado: 'subido', publicarEn: `${fecha}T${hora}:00-03:00`, videoId: link.match(/shorts\/([\w-]+)/)[1], subidoEn: new Date().toISOString() });
fs.writeFileSync(`${BANDEJA}/${id}.json`, JSON.stringify(meta, null, 2) + '\n');
console.log(`✓ ${id} → ${link} · ${fecha} ${hora}`);
