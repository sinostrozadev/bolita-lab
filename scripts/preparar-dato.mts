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

const ruta = process.argv[2];
if (!ruta) { console.error('uso: npx tsx scripts/preparar-dato.mts <ruta-guion.json>'); process.exit(2); }
const raiz = process.cwd();
const guion = leerGuion(path.resolve(ruta));
const tiempos = await generarVoz(guion.id, guion);
const plan = generarSonido(guion.id, guion, tiempos);
const finales = { ...guion, duracionFrames: plan.duracionFrames, tiempos };
const salida = path.join(raiz, 'salida/trabajo', `${guion.id}.props.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
console.log(`props → ${path.relative(raiz, salida)} (${plan.duracionSeg.toFixed(1)} s)`);
process.exit(0);
