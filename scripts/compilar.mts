/**
 * Compilación semanal: un video LARGO horizontal (1920×1080) que concatena Shorts de la bandeja,
 * cada vertical centrado sobre una copia suya desenfocada y oscurecida. Sirve para acumular
 * horas de reproducción (los Shorts no cuentan para las 4.000 h; los largos sí).
 *
 *   npx tsx scripts/compilar.mts [--n 7] [--listos] [--ids a,b,c] [--fps 30] [--salida ruta.mp4] [--dry-run]
 *
 * Toma los últimos N videos 'subido' (o, con --listos / si no hay subidos, los 'listo'; o los de --ids).
 * Antepone salida/marca/intro.mp4 si existe. Escribe salida/compilaciones/<fecha>-compilacion.mp4
 * + .json (título, descripción con capítulos, tipo 'largo', miniatura si existe
 * salida/marca/miniatura-compilacion.png) que `subir --compilacion` entiende.
 *
 * Funciona con el ffmpeg mínimo de Remotion (no hace falta instalar nada): ffmpeg decodifica y
 * escala cada pieza a frames crudos YUV 4:2:0 (fondo = la misma imagen reducida a 32×18 y
 * reampliada, que da el desenfoque; frente = vertical a 1080 de alto); Node oscurece el fondo y
 * pega el frente al centro; otro ffmpeg codifica h264 crf 20 con -threads 2. Poca RAM (~300 MB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable } from 'node:stream';
import { parseArgs } from 'node:util';
import {
  DIR_COMPILACIONES, DIR_MARCA, FFMPEG, RAIZ,
  asegurarDirectorios, cargarCalendario, correr, escribirJson, fechaHoyLocal, formatoDuracion, infoVideo,
  leerBandeja, leerJson, memoriaDisponibleMb, normalizarHashtag, resumenSalida, type EntradaBandeja, type EntradaConRuta,
} from './lib/operacion.mjs';

const { values: opc } = parseArgs({
  args: process.argv.slice(2),
  options: {
    n: { type: 'string', default: '7' },
    listos: { type: 'boolean', default: false },
    ids: { type: 'string' },
    fps: { type: 'string', default: '30' },
    salida: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const ANCHO = 1920, ALTO = 1080;
const FONDO_REDUCIDO = '32:18'; // tamaño al que se reduce el fondo: cuanto menor, más desenfoque
const OSCURECER = 0.45; // brillo del fondo (0..1)
const SATURACION_FONDO = 0.8;
const rel = (p: string) => path.relative(RAIZ, p);

// ---------------------------------------------------------------- selección
const elegirVideos = (n: number): EntradaConRuta[] => {
  const bandeja = leerBandeja().filter((e) => e.mp4Existe && e.tipo !== 'largo');
  if (opc.ids) {
    const ids = opc.ids.split(',').map((x) => x.trim()).filter(Boolean);
    const faltan = ids.filter((id) => !bandeja.some((e) => e.id === id));
    if (faltan.length) throw new Error(`--ids: no están en la bandeja (con mp4): ${faltan.join(', ')}`);
    return ids.map((id) => bandeja.find((e) => e.id === id) as EntradaConRuta);
  }
  const subidos = bandeja
    .filter((e) => e.estado === 'subido')
    .sort((a, b) => (a.publicarEn ?? a.subidoEn ?? a.id).localeCompare(b.publicarEn ?? b.subidoEn ?? b.id));
  if (!opc.listos && subidos.length > 0) return subidos.slice(-n);
  return bandeja.filter((e) => e.estado === 'listo').slice(-n);
};

// ---------------------------------------------------------------- frames crudos
/** Lee de un stream bloques exactos de `tam` bytes (un frame YUV), con contrapresión. */
class LectorFrames {
  private trozos: Buffer[] = [];
  private largo = 0;
  private terminado = false;
  private despertar?: () => void;
  constructor(private stream: Readable, private tam: number) {
    stream.on('data', (b: Buffer) => {
      this.trozos.push(b);
      this.largo += b.length;
      if (this.largo > this.tam * 2) stream.pause();
      this.despertar?.();
    });
    stream.on('end', () => { this.terminado = true; this.despertar?.(); });
    stream.on('error', () => { this.terminado = true; this.despertar?.(); });
  }
  async siguiente(): Promise<Buffer | null> {
    while (this.largo < this.tam) {
      if (this.terminado) return null;
      this.stream.resume();
      await new Promise<void>((ok) => { this.despertar = ok; });
      this.despertar = undefined;
    }
    const todo = this.trozos.length === 1 ? this.trozos[0] : Buffer.concat(this.trozos, this.largo);
    const frame = Buffer.from(todo.subarray(0, this.tam)); // copia propia: se modifica y se encola
    const resto = todo.subarray(this.tam);
    this.trozos = resto.length ? [resto] : [];
    this.largo = resto.length;
    if (this.largo <= this.tam * 2) this.stream.resume();
    return frame;
  }
}

const decodificador = (ruta: string, filtro: string, fps: number): ChildProcessWithoutNullStreams => {
  const p = spawn(FFMPEG, [
    '-v', 'error', '-nostdin', '-threads', '2', '-i', ruta, '-an', '-sn',
    // El ffmpeg de Remotion no trae el muxer "rawvideo": image2pipe + códec rawvideo escribe lo mismo (frames pegados).
    '-vf', filtro, '-r', String(fps), '-c:v', 'rawvideo', '-pix_fmt', 'yuv420p', '-f', 'image2pipe', 'pipe:1',
  ]);
  let err = '';
  p.stderr.on('data', (b) => { err += b; });
  p.on('close', (c) => { if (c) console.error(`  ⚠ decodificador (${path.basename(ruta)}) salió con ${c}: ${err.trim().slice(-300)}`); });
  return p;
};

// Tablas para oscurecer el fondo (rango limitado BT.601/709: Y 16..235, UV centrado en 128).
const LUT_Y = new Uint8Array(256).map((_, v) => Math.round(16 + Math.max(0, v - 16) * OSCURECER));
const LUT_UV = new Uint8Array(256).map((_, v) => Math.round(128 + (v - 128) * SATURACION_FONDO));

const T_Y = ANCHO * ALTO, T_UV = (ANCHO / 2) * (ALTO / 2), T_FRAME = T_Y + 2 * T_UV;

/** Pega el frente (anchoF×ALTO, yuv420p) centrado sobre el fondo ya oscurecido (in place). */
const componer = (fondo: Buffer, frente: Buffer | null, anchoF: number) => {
  for (let i = 0; i < T_Y; i++) fondo[i] = LUT_Y[fondo[i]];
  for (let i = T_Y; i < T_FRAME; i++) fondo[i] = LUT_UV[fondo[i]];
  if (!frente) return;
  const x0 = (ANCHO - anchoF) / 2;
  for (let y = 0; y < ALTO; y++) frente.copy(fondo, y * ANCHO + x0, y * anchoF, (y + 1) * anchoF);
  const anchoFc = anchoF / 2, x0c = x0 / 2, anchoC = ANCHO / 2, altoC = ALTO / 2, tYf = anchoF * ALTO, tUVf = anchoFc * altoC;
  for (let plano = 0; plano < 2; plano++) {
    const baseF = tYf + plano * tUVf, baseB = T_Y + plano * T_UV;
    for (let y = 0; y < altoC; y++) frente.copy(fondo, baseB + y * anchoC + x0c, baseF + y * anchoFc, baseF + (y + 1) * anchoFc);
  }
};

interface Pieza { ruta: string; titulo: string; id: string; duracion: number; ancho: number; alto: number; tieneAudio: boolean; esIntro: boolean; frames?: number }

/** Codifica todas las piezas en un solo h264 (sin audio). Devuelve los frames de cada pieza. */
const codificarVideo = async (piezas: Pieza[], fps: number, destino: string) => {
  const codificador = spawn(FFMPEG, [
    '-y', '-v', 'error', '-f', 'image2pipe', '-frame_size', String(T_FRAME), '-c:v', 'rawvideo', '-pixel_format', 'yuv420p',
    '-video_size', `${ANCHO}x${ALTO}`, '-framerate', String(fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-movflags', '+faststart', destino,
  ]);
  let errCod = '';
  codificador.stderr.on('data', (b) => { errCod += b; if (errCod.length > 20000) errCod = errCod.slice(-10000); });
  const cierre = once(codificador, 'close');
  let total = 0;
  const inicio = Date.now();
  for (const p of piezas) {
    const vertical = p.ancho / Math.max(1, p.alto) < 1.5;
    // Frente: vertical a 1080 de alto (ancho par). Horizontal: ocupa todo el cuadro.
    const anchoF = vertical ? Math.round((p.ancho / p.alto) * ALTO / 2) * 2 : ANCHO;
    const fondo = decodificador(p.ruta, vertical
      ? `scale=${FONDO_REDUCIDO}:force_original_aspect_ratio=increase,crop=${FONDO_REDUCIDO},scale=160:90:flags=bicubic,scale=${ANCHO}:${ALTO}:flags=bicubic`
      : `scale=${ANCHO}:${ALTO}`, fps);
    const frente = vertical ? decodificador(p.ruta, `scale=${anchoF}:${ALTO}:flags=lanczos`, fps) : null;
    const lf = new LectorFrames(fondo.stdout, T_FRAME);
    const lfr = frente ? new LectorFrames(frente.stdout, anchoF * ALTO * 1.5) : null;
    let n = 0;
    for (;;) {
      const b = await lf.siguiente();
      if (!b) break;
      const f = lfr ? await lfr.siguiente() : null;
      if (lfr && !f) break;
      if (vertical) componer(b, f, anchoF); // un horizontal ya ocupa el cuadro: va tal cual
      if (!codificador.stdin.write(b)) await once(codificador.stdin, 'drain');
      n++;
      total++;
      if (total % 300 === 0) process.stdout.write(`\r  ${total} frames (${formatoDuracion(total / fps)}) · ${(total / ((Date.now() - inicio) / 1000)).toFixed(1)} fps`);
    }
    fondo.kill(); frente?.kill();
    p.frames = n;
  }
  codificador.stdin.end();
  const [codigo] = await cierre;
  process.stdout.write('\n');
  if (codigo !== 0) throw new Error(`el codificador h264 salió con código ${codigo}: ${resumenSalida(errCod, 4)}`);
  return total;
};

/** Concatena el audio de cada pieza, recortado/rellenado a la duración exacta de sus frames. */
const codificarAudio = async (piezas: Pieza[], fps: number, destino: string) => {
  const args = ['-y', '-v', 'error', '-nostdin'];
  const filtros: string[] = [];
  let entrada = 0;
  piezas.forEach((p, i) => {
    const dur = ((p.frames ?? 0) / fps).toFixed(4);
    if (p.tieneAudio) args.push('-i', p.ruta);
    else args.push('-f', 'lavfi', '-t', dur, '-i', 'anullsrc=r=48000:cl=stereo');
    filtros.push(`[${entrada}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=duration=${dur},apad=whole_dur=${dur},asetpts=PTS-STARTPTS[a${i}]`);
    entrada++;
  });
  filtros.push(`${piezas.map((_, i) => `[a${i}]`).join('')}concat=n=${piezas.length}:v=0:a=1[aout]`);
  args.push('-filter_complex', filtros.join(';'), '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-f', 'mp4', destino);
  const r = await correr(FFMPEG, args, { silencioso: true, timeoutMs: 30 * 60_000 });
  if (r.codigo !== 0) throw new Error(`ffmpeg (audio) salió con código ${r.codigo}: ${resumenSalida(r.salida, 4)}`);
};

const unir = async (video: string, audio: string, destino: string) => {
  const r = await correr(FFMPEG, [
    '-y', '-v', 'error', '-nostdin', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy',
    '-shortest', '-movflags', '+faststart', '-f', 'mp4', destino,
  ], { silencioso: true, timeoutMs: 30 * 60_000 });
  if (r.codigo !== 0) throw new Error(`ffmpeg (unir) salió con código ${r.codigo}: ${resumenSalida(r.salida, 4)}`);
};

// ---------------------------------------------------------------- textos
const SIMULACIONES = new Set(['bola', 'carrera']);

const tituloDe = (videos: EntradaConRuta[]) => {
  const n = videos.length;
  const soloSim = videos.every((v) => SIMULACIONES.has(v.plantilla));
  const soloDato = videos.every((v) => v.plantilla === 'dato');
  if (soloSim) return `${n} simulaciones de bolitas de neón para relajarte | Bolita Lab`;
  if (soloDato) return `${n} datos que no vas a creer, explicados con bolitas | Bolita Lab`;
  const tipos = [
    videos.some((v) => v.plantilla === 'bola') && 'rebotes',
    videos.some((v) => v.plantilla === 'carrera') && 'carreras',
    videos.some((v) => v.plantilla === 'dato') && 'datos increíbles',
  ].filter(Boolean) as string[];
  return `${n} Shorts de Bolita Lab: ${tipos.slice(0, -1).join(', ')}${tipos.length > 1 ? ' y ' : ''}${tipos.at(-1)}`;
};

const descripcionDe = (videos: EntradaConRuta[], capitulos: Array<{ marca: string; titulo: string }>) => {
  const hayDatos = videos.some((v) => v.plantilla === 'dato');
  const hayCarreras = videos.some((v) => v.plantilla === 'carrera');
  return [
    `Recopilación de Bolita Lab: ${videos.length} Shorts seguidos, sin cortes.` +
      ` Bolitas de neón que rebotan al ritmo de melodías clásicas${hayCarreras ? ', carreras con física real' : ''}${hayDatos ? ' y datos sorprendentes con fuente' : ''}.`,
    '',
    'Capítulos:',
    ...capitulos.map((c) => `${c.marca} ${c.titulo}`),
    '',
    ...(hayDatos ? ['Las fuentes de cada dato están en la descripción de su Short.', ''] : []),
    'Simulaciones físicas deterministas y sonido sincronizado a cada rebote. Música de dominio público.',
    'Suscríbete: hay un Short nuevo cada día.',
  ].join('\n');
};

// ---------------------------------------------------------------- main
const main = async () => {
  asegurarDirectorios();
  const n = Math.max(1, parseInt(opc.n ?? '7', 10) || 7);
  const fps = Math.max(24, parseInt(opc.fps ?? '30', 10) || 30);
  const videos = elegirVideos(n);
  if (videos.length === 0) throw new Error('No hay videos en la bandeja (ni subidos ni listos, con mp4) para compilar.');

  const zona = cargarCalendario().zonaHoraria;
  const fecha = fechaHoyLocal(zona);
  let salida = path.resolve(opc.salida ?? path.join(DIR_COMPILACIONES, `${fecha}-compilacion.mp4`));
  // No pisar una compilación ya subida.
  for (let k = 2; fs.existsSync(salida.replace(/\.mp4$/, '.json')) && (leerJson<{ estado?: string }>(salida.replace(/\.mp4$/, '.json')).estado === 'subido'); k++) {
    salida = salida.replace(/(-\d+)?\.mp4$/, `-${k}.mp4`);
  }
  const intro = path.join(DIR_MARCA, 'intro.mp4');
  const miniatura = path.join(DIR_MARCA, 'miniatura-compilacion.png');

  const piezas: Pieza[] = [];
  if (fs.existsSync(intro)) {
    const i = await infoVideo(intro);
    piezas.push({ ruta: intro, titulo: 'Intro', id: 'intro', duracion: i.duracion, ancho: i.ancho, alto: i.alto, tieneAudio: i.tieneAudio, esIntro: true });
  }
  for (const v of videos) {
    const i = await infoVideo(v.rutaMp4);
    piezas.push({ ruta: v.rutaMp4, titulo: v.titulo, id: v.id, duracion: i.duracion, ancho: i.ancho, alto: i.alto, tieneAudio: i.tieneAudio, esIntro: false });
  }
  const estimado = piezas.reduce((t, p) => t + p.duracion, 0);
  console.log(`Compilación: ${videos.length} Short(s)${piezas[0]?.esIntro ? ' + intro' : ''}, ~${formatoDuracion(estimado)}, ${ANCHO}×${ALTO}@${fps} → ${rel(salida)}  (ffmpeg: ${FFMPEG === 'ffmpeg' ? 'sistema' : rel(FFMPEG)})`);
  for (const p of piezas) console.log(`  ${formatoDuracion(p.duracion)}  ${p.ancho}×${p.alto}${p.tieneAudio ? '' : ' (sin audio)'}  ${p.titulo}`);
  if (opc['dry-run']) return console.log('[dry-run] no se codifica.');
  if (memoriaDisponibleMb() < 500) console.log(`⚠ RAM disponible baja (${memoriaDisponibleMb()} MB); la compilación usa ~300 MB, sigo.`);

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const tmpVideo = salida.replace(/\.mp4$/, '.tmp-video.mp4');
  const tmpAudio = salida.replace(/\.mp4$/, '.tmp-audio.mp4');
  const inicio = Date.now();
  try {
    await codificarVideo(piezas, fps, tmpVideo);
    await codificarAudio(piezas, fps, tmpAudio);
    await unir(tmpVideo, tmpAudio, salida);
  } finally {
    for (const t of [tmpVideo, tmpAudio]) try { fs.unlinkSync(t); } catch { /* no estaba */ }
  }
  const info = await infoVideo(salida);

  // Capítulos con tiempos exactos (frames reales). La intro (1,5 s) se funde con el 1.er capítulo:
  // YouTube exige que el primero empiece en 00:00 y que cada uno dure ≥ 10 s.
  let t = 0;
  const capitulos: Array<{ inicio: number; marca: string; titulo: string; id: string }> = [];
  for (const p of piezas) {
    const dur = (p.frames ?? 0) / fps;
    if (!p.esIntro) capitulos.push({ inicio: capitulos.length === 0 ? 0 : t, marca: formatoDuracion(capitulos.length === 0 ? 0 : Math.floor(t)), titulo: p.titulo, id: p.id });
    t += dur;
  }

  const entrada: EntradaBandeja = {
    id: path.basename(salida, '.mp4'),
    plantilla: 'compilacion',
    tipo: 'largo',
    titulo: tituloDe(videos),
    descripcion: descripcionDe(videos, capitulos),
    hashtags: ['#bolitalab', '#satisfying', '#simulacion', '#fisica', ...(videos.some((v) => v.plantilla === 'dato') ? ['#datoscuriosos'] : [])].map(normalizarHashtag),
    duracionSeg: Math.round(info.duracion * 10) / 10,
    estado: 'listo',
    videos: videos.map((v) => v.id),
    ...(fs.existsSync(miniatura) ? { miniatura: rel(miniatura) } : {}),
  };
  escribirJson(salida.replace(/\.mp4$/, '.json'), { ...entrada, capitulos });
  console.log(`✓ ${rel(salida)} (${info.ancho}×${info.alto}, ${formatoDuracion(info.duracion)}, ${(fs.statSync(salida).size / 1048576).toFixed(1)} MB, ${((Date.now() - inicio) / 1000).toFixed(0)}s)`);
  if (capitulos.length < 3) console.log('  ⚠ menos de 3 capítulos: YouTube no mostrará capítulos (pide ≥3 de ≥10 s).');
  if (info.duracion < 8 * 60) console.log(`  ⚠ dura ${formatoDuracion(info.duracion)}: para sumar horas de reproducción conviene 8–12 min (--n más alto).`);
  console.log(`  subir:  npx tsx scripts/subir.mts subir --compilacion ${rel(salida)}`);
};

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
