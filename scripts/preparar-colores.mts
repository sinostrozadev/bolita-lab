/**
 * Prepara un guion de la plantilla "colores" para renderizar:
 *   npx tsx scripts/preparar-colores.mts contenido/guiones/<guion>.json
 * Lee el envoltorio { plantilla:'colores', id, titulo, descripcion, hashtags, props }, busca la partida
 * (semilla/daño), sintetiza el audio y escribe salida/trabajo/<id>.props.json (con `duracionFrames`). Luego:
 *   npx remotion render src/index.ts Colores salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { leerProps, simularYSintetizar } from './simular-colores.mjs';

const ruta = process.argv[2];
if (!ruta) { console.error('uso: npx tsx scripts/preparar-colores.mts <ruta-guion.json>'); process.exit(2); }
const raiz = process.cwd();
const props = leerProps(ruta);
const sim = simularYSintetizar(props, raiz);
const finales = { ...props, duracionFrames: sim.duracionFrames };
const salida = path.join(raiz, 'salida/trabajo', `${props.id}.props.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
console.log(`props → ${path.relative(raiz, salida)} (${(finales.duracionFrames / sim.fps).toFixed(1)} s)`);
