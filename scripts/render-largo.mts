/**
 * Render de un LARGO 16:9 por TRAMOS (para compartir la máquina y poder retomar si algo se corta).
 *
 * Uso: npx tsx scripts/render-largo.mts <Composicion> <props.json> <salida.mp4> [--tramo 4500] [--gl swangle] [--crf 20]
 *   1. Lee `duracionFrames` del props (lo pone el preparar del largo).
 *   2. Renderiza cada tramo SIN audio con `flock -w 7200 /tmp/bolita-render.lock` (el lock se toma por tramo: entre
 *      tramos pueden pasar los renders de otros agentes) y `--concurrency=1`. Un tramo terminado deja `<tN>.ok`: si
 *      se vuelve a correr, se salta (retoma).
 *   3. Concatena sin recodificar y mezcla el wav completo `public/audio/generado/<id>.wav` (AAC 192 kb/s).
 * Los tramos quedan en salida/tmp/<id>/ (se borran al terminar bien).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FFMPEG } from './lib/operacion.mjs';

const args = process.argv.slice(2);
const opc = (n: string, d?: string) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const tramo = Number(opc('--tramo', '4500'));
const gl = opc('--gl');
const crf = opc('--crf', '20');
const [comp, rutaProps, salida] = args;
if (!comp || !rutaProps || !salida) { console.error('Uso: npx tsx scripts/render-largo.mts <Comp> <props.json> <salida.mp4> [--tramo N] [--gl swangle]'); process.exit(2); }
const props = JSON.parse(fs.readFileSync(rutaProps, 'utf8'));
const total: number = props.duracionFrames;
if (!total) throw new Error('el props no trae duracionFrames: corre el preparar del largo');
const dir = path.resolve('salida/tmp', props.id);
fs.mkdirSync(dir, { recursive: true });
const t0 = Date.now();
const partes: string[] = [];
for (let a = 0, k = 1; a < total; a += tramo, k++) {
  const b = Math.min(total - 1, a + tramo - 1);
  const mp4 = path.join(dir, `t${String(k).padStart(2, '0')}.mp4`);
  partes.push(mp4);
  if (fs.existsSync(`${mp4}.ok`)) { console.log(`[render-largo] tramo ${k} ya está (${a}-${b})`); continue; }
  const ti = Date.now();
  const cmd = ['-w', '7200', '/tmp/bolita-render.lock', 'npx', 'remotion', 'render', 'src/index.ts', comp, mp4,
    `--props=${path.resolve(rutaProps)}`, `--frames=${a}-${b}`, '--muted', '--concurrency=1', '--codec=h264', `--crf=${crf}`,
    '--timeout=240000', ...(gl ? [`--gl=${gl}`] : [])];
  console.log(`[render-largo] tramo ${k}: frames ${a}-${b}…`);
  const r = spawnSync('flock', cmd, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(`[render-largo] ✗ tramo ${k} falló (código ${r.status}). Vuelve a correr el mismo comando para retomar.`); process.exit(1); }
  fs.writeFileSync(`${mp4}.ok`, String(Date.now()));
  console.log(`[render-largo] tramo ${k} listo en ${((Date.now() - ti) / 60000).toFixed(1)} min`);
}
const lista = path.join(dir, 'lista.txt');
fs.writeFileSync(lista, partes.map((p) => `file '${p}'`).join('\n') + '\n');
const wav = path.resolve('public/audio/generado', `${props.id}.wav`);
fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
const ff = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-i', wav,
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', path.resolve(salida)], { stdio: 'inherit' });
if (ff.status !== 0) { console.error('[render-largo] ✗ falló la unión con ffmpeg'); process.exit(1); }
for (const p of partes) { fs.rmSync(p, { force: true }); fs.rmSync(`${p}.ok`, { force: true }); }
console.log(`[render-largo] ✓ ${salida} · ${(total / 30 / 60).toFixed(2)} min de video · render ${((Date.now() - t0) / 60000).toFixed(1)} min`);
