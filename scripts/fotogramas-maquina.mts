/**
 * Fotogramas sueltos de la composición "Maquina" sin renderizar el video: un solo bundle y renderStill por instante.
 *   npx tsx scripts/fotogramas-maquina.mts <id> <salida-dir> [escala=0.5] [segundos…]
 * Por defecto: 0, 2, 8, 15, 25, 35 s y el último frame. Usa --gl=swangle (Three.js sin GPU en WSL).
 */
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [id, dir, escalaTxt, ...segs] = process.argv.slice(2);
if (!id || !dir) { console.error('uso: npx tsx scripts/fotogramas-maquina.mts <id> <dir> [escala] [s…]'); process.exit(2); }
const raiz = process.cwd();
const props = JSON.parse(fs.readFileSync(path.join(raiz, 'salida/trabajo', `${id}.props.json`), 'utf8'));
const escala = Number(escalaTxt ?? 0.5);
fs.mkdirSync(dir, { recursive: true });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(raiz, 'src/index.ts'), publicDir: path.join(raiz, 'public') });
const comp = await selectComposition({ serveUrl, id: 'Maquina', inputProps: props, chromiumOptions: { gl: 'swangle' } });
const ultimos = comp.durationInFrames - 1;
const lista = segs.length ? segs.map(Number) : [0, 2, 8, 15, 25, 35, -1];
console.log(`bundle ${((Date.now() - t0) / 1000).toFixed(0)} s · ${comp.durationInFrames} frames a ${comp.fps} fps`);
for (const s of lista) {
  const frame = s < 0 ? ultimos : Math.min(ultimos, Math.round(s * comp.fps));
  const out = path.join(dir, `f${String(frame).padStart(5, '0')}.jpg`);
  const t1 = Date.now();
  await renderStill({ serveUrl, composition: comp, frame, output: out, inputProps: props, scale: escala, imageFormat: 'jpeg', jpegQuality: 88, chromiumOptions: { gl: 'swangle' } });
  console.log(`${out} (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
}
process.exit(0);
