/**
 * Prepara un guion de la plantilla "bola" para renderizar:
 *   npx tsx scripts/preparar-bola.mts contenido/guiones/<guion>.json
 * Lee el envoltorio { plantilla:'bola', id, titulo, descripcion, hashtags, props },
 * corre la simulación y la síntesis de audio y escribe salida/trabajo/<id>.props.json
 * (las props finales, con `duracionFrames`). Luego:
 *   npx remotion render src/index.ts Bola salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { leerProps, simularYSintetizar } from './simular-bola.mjs';

const ruta = process.argv[2];
if (!ruta) { console.error('uso: npx tsx scripts/preparar-bola.mts <ruta-guion.json>'); process.exit(2); }
const raiz = process.cwd();
const props = leerProps(ruta);
const sim = simularYSintetizar(props, raiz);
const finales = { ...props, duracionFrames: sim.duracionFrames };
const salida = path.join(raiz, 'salida/trabajo', `${props.id}.props.json`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
console.log(`props → ${path.relative(raiz, salida)} (${(sim.duracionFrames / sim.fps).toFixed(1)} s)`);
