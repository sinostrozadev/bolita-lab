/**
 * Hoja de contacto liviana por video: 6 fotogramas en fila (0 s, 1,5 s, 25 %, 50 %, 75 %, último),
 * ≤ 150 KB, en salida/revisiones/hojas/<id>.jpg. La nube la commitea para ver cada Short sin bajar
 * el mp4 (que va a un artifact). Solo crea las que faltan.
 *
 *   npx tsx scripts/hojas.mts [--ids a,b] [--max-kb 150] [--rehacer]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DIR_SALIDA, RAIZ, infoVideo, leerBandeja } from './lib/operacion.mjs';
import { hojaLiviana } from './lib/fotogramas.mjs';

const { values: opc } = parseArgs({
  args: process.argv.slice(2),
  options: {
    ids: { type: 'string' },
    'max-kb': { type: 'string', default: '150' },
    rehacer: { type: 'boolean', default: false },
  },
});

export const DIR_HOJAS = path.join(DIR_SALIDA, 'revisiones', 'hojas');

const main = async () => {
  const ids = opc.ids?.split(',').map((x) => x.trim()).filter(Boolean);
  const videos = leerBandeja().filter((e) => e.mp4Existe && (!ids || ids.includes(e.id)));
  let hechas = 0, fallos = 0;
  for (const e of videos) {
    const destino = path.join(DIR_HOJAS, `${e.id}.jpg`);
    if (fs.existsSync(destino) && !opc.rehacer) continue;
    try {
      const info = await infoVideo(e.rutaMp4);
      const kb = await hojaLiviana(e.rutaMp4, destino, info.duracion, info.alto / info.ancho, { maxKb: parseInt(opc['max-kb'], 10) });
      console.log(`✓ ${path.relative(RAIZ, destino)} (${kb} KB)`);
      hechas++;
    } catch (err) {
      console.error(`✗ ${e.id}: ${(err as Error).message}`);
      fallos++;
    }
  }
  console.log(`${hechas} hoja(s) nueva(s), ${fallos} con error.`);
  if (fallos) process.exitCode = 1;
};

main();
