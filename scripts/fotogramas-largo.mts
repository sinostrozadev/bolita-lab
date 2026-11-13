/**
 * Fotogramas de control de un LARGO: renderiza stills de una composición en los frames pedidos (un solo bundle).
 * Uso: npx tsx scripts/fotogramas-largo.mts <Composicion> <props.json> <dir> nombre:frame [nombre:frame …] [--escala 0.5] [--gl swangle]
 * Correr dentro del lock: flock -w 7200 /tmp/bolita-render.lock npx tsx scripts/fotogramas-largo.mts …
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [comp, rutaProps, dir, ...resto] = process.argv.slice(2);
const opc = (n: string) => { const i = resto.indexOf(n); return i >= 0 ? resto.splice(i, 2)[1] : undefined; };
const escala = Number(opc('--escala') ?? 0.5);
const gl = opc('--gl') as 'swangle' | undefined;
const props = JSON.parse(fs.readFileSync(rutaProps, 'utf8'));
fs.mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: comp, inputProps: props, chromiumOptions: gl ? { gl } : undefined });
for (const par of resto) {
  const [nombre, f] = par.split(':');
  const salida = path.join(dir, `${nombre}.jpg`);
  await renderStill({ composition, serveUrl, output: salida, frame: Number(f), inputProps: props, scale: escala, imageFormat: 'jpeg', jpegQuality: 80, chromiumOptions: gl ? { gl } : undefined });
  console.log(`[fotogramas] ${salida} (frame ${f})`);
}
