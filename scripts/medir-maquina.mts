/**
 * Mide el costo de render de la composición "Maquina" con distintas banderas de `prueba` (mismo bundle y misma página):
 *   npx tsx scripts/medir-maquina.mts <id> <frame> [variantes…]   p. ej. "" sinaa sombra1k sinaa,sombra1k
 * Cada variante renderiza 4 frames seguidos a escala 1 y reporta el promedio de los 3 últimos.
 */
import path from 'node:path';
import fs from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderFrames, selectComposition } from '@remotion/renderer';

const [id, frameTxt, ...variantes] = process.argv.slice(2);
const raiz = process.cwd();
const base = JSON.parse(fs.readFileSync(path.join(raiz, 'salida/trabajo', `${id}.props.json`), 'utf8'));
const serveUrl = await bundle({ entryPoint: path.join(raiz, 'src/index.ts'), publicDir: path.join(raiz, 'public') });
const f0 = Number(frameTxt);
for (const v of variantes.length ? variantes : ['']) {
  const props = { ...base, prueba: v };
  const comp = await selectComposition({ serveUrl, id: 'Maquina', inputProps: props, chromiumOptions: { gl: 'swangle' } });
  const tiempos: number[] = [];
  let t = Date.now();
  const dir = fs.mkdtempSync('/tmp/medir-maquina-');
  await renderFrames({
    serveUrl, composition: comp, inputProps: props, outputDir: dir, frameRange: [f0, f0 + 5], concurrency: 1, imageFormat: 'jpeg',
    chromiumOptions: { gl: 'swangle' },
    onStart: () => { t = Date.now(); },
    onFrameUpdate: () => { const a = Date.now(); tiempos.push(a - t); t = a; },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  const ult = tiempos.slice(2);
  console.log(`${v || '(normal)'}: ${(ult.reduce((a, b) => a + b, 0) / ult.length / 1000).toFixed(2)} s/frame  [${tiempos.map((x) => (x / 1000).toFixed(1)).join(' ')}]`);
}
process.exit(0);
