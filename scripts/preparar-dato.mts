/**
 * Prepara un guion de la plantilla "dato" para renderizar:
 *   npx tsx scripts/preparar-dato.mts contenido/guiones/<guion>.json
 * Corre la voz (msedge-tts) y la cama + SFX, y escribe salida/trabajo/<id>.props.json
 * (guion + duracionFrames + tiempos). Luego:
 *   npx remotion render src/index.ts Dato salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { generarVoz, leerGuion } from './voz.mjs';
import { generarSonido } from './sonido-dato.mjs';
import { FRAMES_CIERRE } from '../src/plantillas/dato/plan';
import { FORMATO } from '../src/marca/tokens';

/** Límites de duración de un Short (docs/CONVENCIONES.md: 25–58 s). */
const MIN_SEG = 25;
const MAX_SEG = 58;

const ruta = process.argv[2];
if (!ruta) { console.error('uso: npx tsx scripts/preparar-dato.mts <ruta-guion.json>'); process.exit(2); }
const raiz = process.cwd();
const guion = leerGuion(path.resolve(ruta));
const tiempos = await generarVoz(guion.id, guion);
// Red de seguridad: voz (líneas + pausas) + cierre. Fuera de 25–58 s no vale la pena renderizar;
// salimos con error para que el diario marque el guion como `error` en vez de producir un Short inválido.
const estimadoSeg = tiempos.total + FRAMES_CIERRE / FORMATO.fps;
if (estimadoSeg < MIN_SEG) {
  console.error(`✗ guion demasiado corto: ${estimadoSeg.toFixed(1)} s, mínimo ${MIN_SEG} (${guion.id}). Agrega escenas o alarga las líneas.`);
  process.exit(1);
}
if (estimadoSeg > MAX_SEG) {
  console.error(`✗ guion demasiado largo: ${estimadoSeg.toFixed(1)} s, máximo ${MAX_SEG} (${guion.id}). Recorta escenas o líneas.`);
  process.exit(1);
}
const plan = generarSonido(guion.id, guion, tiempos);
const finales = { ...guion, duracionFrames: plan.duracionFrames, tiempos };
const salida = path.join(raiz, 'salida/trabajo', `${guion.id}.props.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
console.log(`props → ${path.relative(raiz, salida)} (${plan.duracionSeg.toFixed(1)} s)`);
process.exit(0);
