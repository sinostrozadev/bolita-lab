/**
 * Escucha la melodía de un guion "bola" a tempo (bpm, sin rebotes) con su timbre y acompañamiento, para
 * revisar que esté bien escrita ANTES de simular/renderizar:
 *   npx tsx scripts/escuchar-melodia.mts <guion.json> [--segundos 12] [--salida ruta.wav]
 * Por defecto escribe salida/pruebas/melodias/<id>-preview.wav.
 */
import path from 'node:path';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { leerProps, opcionesAudio } from './simular-bola.mjs';
import { escribirWav, melodiaATempo } from './lib/wav.mjs';

const { values: opc, positionals } = parseArgs({
  args: process.argv.slice(2), allowPositionals: true,
  options: { segundos: { type: 'string', default: '12' }, salida: { type: 'string' } },
});
const ruta = positionals[0];
if (!ruta) { console.error('uso: npx tsx scripts/escuchar-melodia.mts <guion.json> [--segundos 12] [--salida ruta.wav]'); process.exit(2); }
const props = leerProps(ruta);
const audio = opcionesAudio(props);
const segundos = Number(opc.segundos);
const pista = melodiaATempo(audio.melodia, audio.timbre, audio.acompanamiento, segundos);
const salida = opc.salida ?? path.join('salida/pruebas/melodias', `${props.id}-preview.wav`);
fs.mkdirSync(path.dirname(salida), { recursive: true });
escribirWav(salida, [pista, pista]);
console.log(`${salida} · ${segundos} s · timbre ${audio.timbre} · acompañamiento ${audio.acompanamiento ?? 'no'}`);
