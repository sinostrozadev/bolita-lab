/**
 * Json de BANDEJA de un largo ya renderizado (no sube nada: eso lo hace el agente de operación).
 * Uso: npx tsx scripts/bandeja-largo.mts contenido/largos/<id>.json <mp4> <miniatura.png> <publicarEn ISO>
 * Lee el envoltorio del guion (titulo, descripcion con {CAPITULOS}, hashtags) y los capítulos del plan
 * (public/sim/<id>.json), mide la duración real con ffprobe y escribe salida/bandeja/<id>.json (tipo: 'largo').
 */
import fs from 'node:fs';
import path from 'node:path';
import { infoVideo } from './lib/operacion.mjs';

const [rutaGuion, mp4, mini, publicarEn] = process.argv.slice(2);
if (!publicarEn) { console.error('Uso: npx tsx scripts/bandeja-largo.mts <guion> <mp4> <miniatura> <publicarEn>'); process.exit(2); }
const g = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join('public/sim', `${g.id}.json`), 'utf8'));
const info = await infoVideo(path.resolve(mp4));
if (info.duracion < 480) throw new Error(`el largo dura ${info.duracion.toFixed(1)} s: menos de 8 min (sin mid-rolls)`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const caps = (plan.capitulos as { seg: number; titulo: string }[]).map((c) => `${mmss(c.seg)} ${c.titulo}`).join('\n');
const descripcion = String(g.descripcion).replace('{CAPITULOS}', caps);
const entrada = {
  id: g.id, plantilla: g.plantilla, tipo: 'largo', titulo: g.titulo, descripcion, hashtags: g.hashtags,
  duracionSeg: Math.round(info.duracion * 10) / 10, estado: 'listo', publicarEn, categoria: g.categoria ?? '24',
  mp4: path.resolve(mp4), miniatura: path.resolve(mini), capitulos: plan.capitulos, midrollsSeg: plan.midrollsSeg ?? [],
  noEsParaNinos: true, contenidoSintetico: false,
  nota: 'Largo 16:9. Subir por Studio (no es Short: sin #Shorts). Marcar las pausas publicitarias en midrollsSeg cuando el canal esté en el YPP.',
};
const ruta = path.join('salida/bandeja', `${g.id}.json`);
fs.writeFileSync(ruta, JSON.stringify(entrada, null, 2) + '\n');
console.log(`[bandeja-largo] → ${ruta} · ${mmss(info.duracion)} · publicar ${publicarEn}`);
