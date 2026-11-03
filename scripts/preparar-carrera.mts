/**
 * Prepara un video de la plantilla `carrera` para el pipeline diario.
 *
 * Uso: npx tsx scripts/preparar-carrera.mts <ruta-guion.json>
 *
 * Lee el envoltorio `{plantilla:'carrera', id, titulo, descripcion, hashtags, props}`,
 * simula la física + sintetiza el audio (public/sim y public/audio/generado) y escribe
 * `salida/trabajo/<id>.props.json` con los props validados. Sale con código 0.
 *
 * Luego el pipeline renderiza:
 *   npx remotion render src/index.ts Carrera salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIERRE_FRAMES } from '../src/plantillas/carrera/tipos';
import { leerProps, prepararSimulacion } from './simular-carrera.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ruta = process.argv[2];
if (!ruta) { console.error('Uso: npx tsx scripts/preparar-carrera.mts <ruta-guion.json>'); process.exit(2); }

const envoltorio = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
if (envoltorio.plantilla && envoltorio.plantilla !== 'carrera') {
  console.error(`El guion es de la plantilla "${envoltorio.plantilla}", no "carrera".`);
  process.exit(2);
}
const props = leerProps(path.resolve(ruta));
const sim = prepararSimulacion(props);

const destino = path.join(RAIZ, 'salida/trabajo', `${props.id}.props.json`);
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(props, null, 2));

const duracionSeg = (sim.duracionFrames + CIERRE_FRAMES) / sim.fps;
console.log(`[preparar-carrera] props → ${path.relative(RAIZ, destino)} · duración ${duracionSeg.toFixed(1)} s`);
console.log(`[preparar-carrera] render: npx remotion render src/index.ts Carrera salida/bandeja/${props.id}.mp4 --props=${path.relative(RAIZ, destino)}`);
