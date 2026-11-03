/**
 * Galería local: una página HTML con todos los videos de la bandeja, las compilaciones y la marca,
 * para revisarlos desde Windows con un clic (ruta \\wsl$\...\idea\salida\galeria\index.html).
 * Uso: npx tsx scripts/galeria.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const raiz = path.resolve(import.meta.dirname, '..');
const ffmpeg = path.join(raiz, 'node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg');
const destino = path.join(raiz, 'salida/galeria');
fs.mkdirSync(path.join(destino, 'posters'), { recursive: true });

type Item = { id: string; mp4: string; poster: string; titulo: string; descripcion: string; plantilla: string; duracionSeg?: number; estado?: string; vertical: boolean };

const poster = (mp4: string, nombre: string, seg: number) => {
  const salida = path.join(destino, 'posters', `${nombre}.jpg`);
  if (!fs.existsSync(salida) || fs.statSync(salida).mtimeMs < fs.statSync(mp4).mtimeMs) {
    try { execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(seg), '-i', mp4, '-frames:v', '1', '-q:v', '4', salida]); } catch { /* sin poster */ }
  }
  return path.relative(destino, salida);
};

const leer = (dir: string, vertical: boolean): Item[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort().map((f) => {
    const mp4 = path.join(dir, f);
    const id = f.replace(/\.mp4$/, '');
    const metaRuta = path.join(dir, `${id}.json`);
    const meta = fs.existsSync(metaRuta) ? JSON.parse(fs.readFileSync(metaRuta, 'utf8')) : {};
    return { id, mp4: path.relative(destino, mp4), poster: poster(mp4, id, vertical ? 8 : 20), titulo: meta.titulo ?? id, descripcion: meta.descripcion ?? '', plantilla: meta.plantilla ?? meta.tipo ?? '', duracionSeg: meta.duracionSeg, estado: meta.estado, vertical };
  });
};

const shorts = leer(path.join(raiz, 'salida/bandeja'), true);
const largos = leer(path.join(raiz, 'salida/compilaciones'), false);
const marca = ['logo.png', 'banner.png', 'miniatura-compilacion.png'].filter((f) => fs.existsSync(path.join(raiz, 'salida/marca', f)));
const intro = fs.existsSync(path.join(raiz, 'salida/marca/intro.mp4'));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const tarjeta = (v: Item) => `
  <article class="tarjeta ${v.vertical ? 'vertical' : 'horizontal'}">
    <video controls preload="none" poster="${v.poster}" src="${v.mp4}"></video>
    <div class="info">
      <span class="chip">${esc(v.plantilla)}</span>${v.duracionSeg ? `<span class="chip">${Math.round(v.duracionSeg)} s</span>` : ''}${v.estado ? `<span class="chip estado-${esc(v.estado)}">${esc(v.estado)}</span>` : ''}
      <h3>${esc(v.titulo)}</h3>
      <p>${esc(v.descripcion).replace(/\n/g, '<br>')}</p>
      <code>${esc(v.id)}</code>
    </div>
  </article>`;

const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Bolita Lab · galería</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --fondo:#0B0B12; --fondo2:#141426; --tinta:#F4F4FF; --suave:#A9A9C7; --lima:#C8FF3D; --cian:#2EF2FF; }
  body { margin:0; background:var(--fondo); color:var(--tinta); font-family: Inter, system-ui, sans-serif; }
  header { padding:28px 32px; display:flex; align-items:center; gap:16px; border-bottom:1px solid #22223a; }
  header .bola { width:28px; height:28px; border-radius:50%; background:var(--lima); box-shadow:0 0 18px var(--lima); }
  h1 { font-size:26px; margin:0; } h2 { font-size:18px; color:var(--suave); margin:32px 32px 12px; font-weight:600; }
  .grilla { display:grid; gap:20px; padding:0 32px 32px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .grilla.largos { grid-template-columns: repeat(auto-fill, minmax(520px, 1fr)); }
  .tarjeta { background:var(--fondo2); border-radius:14px; overflow:hidden; border:1px solid #22223a; }
  .tarjeta video { width:100%; display:block; background:#000; }
  .vertical video { aspect-ratio: 9/16; } .horizontal video { aspect-ratio: 16/9; }
  .info { padding:14px 16px; } .info h3 { font-size:16px; margin:8px 0 6px; } .info p { font-size:13px; color:var(--suave); margin:0 0 8px; white-space:normal; }
  .info code { font-size:11px; color:#6c6c8a; }
  .chip { display:inline-block; font-size:11px; padding:2px 8px; border-radius:999px; background:#22223a; color:var(--cian); margin-right:6px; text-transform:uppercase; letter-spacing:.5px; }
  .estado-listo { color:var(--lima); } .estado-subido { color:#3DFF8F; } .estado-error { color:#FF4D5B; }
  .marca { display:flex; gap:20px; padding:0 32px 32px; flex-wrap:wrap; align-items:flex-start; }
  .marca img { max-width:420px; border-radius:12px; border:1px solid #22223a; } .marca video { width:240px; border-radius:12px; }
  .vacio { color:var(--suave); padding:0 32px 24px; }
</style></head><body>
<header><span class="bola"></span><h1>Bolita Lab · galería de revisión</h1><span style="color:var(--suave)">generada ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span></header>
<h2>Shorts en bandeja (${shorts.length})</h2>
${shorts.length ? `<div class="grilla">${shorts.map(tarjeta).join('')}</div>` : '<p class="vacio">Todavía no hay videos en la bandeja.</p>'}
<h2>Compilaciones largas (${largos.length})</h2>
${largos.length ? `<div class="grilla largos">${largos.map(tarjeta).join('')}</div>` : '<p class="vacio">Todavía no hay compilaciones.</p>'}
<h2>Marca</h2>
<div class="marca">${marca.map((f) => `<img src="../marca/${f}" alt="${f}">`).join('')}${intro ? '<video controls src="../marca/intro.mp4"></video>' : ''}</div>
</body></html>`;
fs.writeFileSync(path.join(destino, 'index.html'), html);
console.log(`galería: ${path.join(destino, 'index.html')} · ${shorts.length} shorts · ${largos.length} largos`);
