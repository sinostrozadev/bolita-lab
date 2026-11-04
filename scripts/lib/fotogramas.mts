/**
 * Fotogramas y hojas de contacto de un mp4 con el ffmpeg mínimo de Remotion (no trae `tile` ni
 * `hstack`: la hoja se compone en Node con frames crudos RGB, como compilar.mts).
 * Lo usan revisar.mts (revisión semanal) y hojas.mts (hoja liviana que la nube commitea por video).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAIZ } from './operacion.mjs';

const DIR_COMPOSITOR = path.join(RAIZ, 'node_modules', '@remotion', 'compositor-linux-x64-gnu');
export const FFMPEG_R = path.join(DIR_COMPOSITOR, 'ffmpeg');
const ENV_FFMPEG = { LD_LIBRARY_PATH: [DIR_COMPOSITOR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
/** Ancho de cada fotograma suelto. */
export const ANCHO = 540;

/** Ejecuta un comando y devuelve stdout binario (ffmpeg → frames crudos). */
export const correrBinario = (comando: string, args: string[], entrada?: Buffer): Promise<{ codigo: number; datos: Buffer; error: string }> =>
  new Promise((resolver) => {
    const hijo = spawn(comando, args, { env: { ...process.env, ...ENV_FFMPEG }, stdio: [entrada ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const trozos: Buffer[] = [];
    let error = '';
    hijo.stdout?.on('data', (b: Buffer) => trozos.push(b));
    hijo.stderr?.on('data', (b: Buffer) => { error += b.toString(); });
    hijo.on('error', (e) => resolver({ codigo: 127, datos: Buffer.alloc(0), error: String(e) }));
    hijo.on('close', (codigo) => resolver({ codigo: codigo ?? 1, datos: Buffer.concat(trozos), error }));
    if (entrada) hijo.stdin?.end(entrada);
  });

/** Instantes de los 6 fotogramas que pide MEJORA-CONTINUA §1.1. */
export const instantes = (d: number) => [0, Math.min(1.5, Math.max(0, d - 0.1)), d * 0.25, d * 0.5, d * 0.75, Math.max(0, d - 0.1)];
export const ETIQUETAS = ['0 s', '1,5 s', '25 %', '50 %', '75 %', 'último'];

/** Extrae un fotograma escalado como RGB crudo. */
export const fotogramaCrudo = async (mp4: string, t: number, alto: number, ancho = ANCHO): Promise<Buffer> => {
  const r = await correrBinario(FFMPEG_R, [
    '-v', 'error', '-ss', t.toFixed(3), '-i', mp4, '-frames:v', '1',
    // Este ffmpeg no trae el muxer "rawvideo": image2pipe + códec rawvideo (como compilar.mts).
    '-vf', `scale=${ancho}:${alto}`, '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-f', 'image2pipe', 'pipe:1',
  ]);
  if (r.codigo !== 0 || r.datos.length !== ancho * alto * 3) throw new Error(`ffmpeg (fotograma ${t.toFixed(1)} s): ${r.error.trim().split('\n').pop() || `tamaño ${r.datos.length}`}`);
  return r.datos;
};

/** Codifica RGB crudo a JPG (escalado opcional; `calidad` = -q:v de ffmpeg, 2 mejor … 31 peor). */
export const aJpg = async (crudo: Buffer, ancho: number, alto: number, destino: string, escala?: string, calidad = 4) => {
  const r = await correrBinario(FFMPEG_R, [
    '-v', 'error', '-y', '-f', 'image2pipe', '-frame_size', String(ancho * alto * 3), '-c:v', 'rawvideo',
    '-pixel_format', 'rgb24', '-video_size', `${ancho}x${alto}`, '-i', 'pipe:0',
    '-frames:v', '1', '-vf', `${escala ? `scale=${escala},` : ''}format=yuvj420p`, '-q:v', String(calidad), destino,
  ], crudo);
  if (r.codigo !== 0) throw new Error(`ffmpeg (jpg): ${r.error.trim().split('\n').pop()}`);
};

/** Junta frames RGB del mismo tamaño en una fila, con un separador oscuro de 4 px. */
export const componerFila = (crudos: Buffer[], ancho: number, alto: number): Buffer => {
  const anchoHoja = ancho * crudos.length;
  const hoja = Buffer.alloc(anchoHoja * alto * 3);
  const fila = ancho * 3;
  for (let y = 0; y < alto; y++) {
    crudos.forEach((c, k) => c.copy(hoja, y * anchoHoja * 3 + k * fila, y * fila, (y + 1) * fila));
    for (let k = 1; k < crudos.length; k++) hoja.fill(0, y * anchoHoja * 3 + k * fila, y * anchoHoja * 3 + k * fila + 12);
  }
  return hoja;
};

/** 6 fotogramas + hoja de contacto (6 en fila) de un mp4. Devuelve rutas. */
export const extraerFotogramas = async (mp4: string, base: string, dir: string, duracion: number, proporcion: number) => {
  fs.mkdirSync(dir, { recursive: true });
  const alto = Math.round((ANCHO * proporcion) / 2) * 2;
  const crudos: Buffer[] = [];
  const rutas: string[] = [];
  for (const [n, t] of instantes(duracion).entries()) {
    const crudo = await fotogramaCrudo(mp4, t, alto);
    const destino = path.join(dir, `${base}-${n + 1}.jpg`);
    await aJpg(crudo, ANCHO, alto, destino);
    crudos.push(crudo);
    rutas.push(destino);
  }
  const anchoHoja = ANCHO * crudos.length;
  const rutaHoja = path.join(dir, `${base}-hoja.jpg`);
  await aJpg(componerFila(crudos, ANCHO, alto), anchoHoja, alto, rutaHoja, `${Math.round(anchoHoja * 2 / 3 / 2) * 2}:-2`);
  return { rutas, hoja: rutaHoja };
};

/**
 * Hoja de contacto liviana (6 fotogramas en fila, sin fotogramas sueltos) para commitear:
 * baja la calidad JPG hasta que pese ≤ `maxKb`. Devuelve los KB finales.
 */
export const hojaLiviana = async (mp4: string, destino: string, duracion: number, proporcion: number, { anchoFrame = 240, maxKb = 150 } = {}) => {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const ancho = Math.round(anchoFrame / 2) * 2;
  const alto = Math.round((ancho * proporcion) / 2) * 2;
  const crudos: Buffer[] = [];
  for (const t of instantes(duracion)) crudos.push(await fotogramaCrudo(mp4, t, alto, ancho));
  const hoja = componerFila(crudos, ancho, alto);
  for (const calidad of [4, 6, 9, 13, 18, 25]) {
    await aJpg(hoja, ancho * crudos.length, alto, destino, undefined, calidad);
    const kb = fs.statSync(destino).size / 1024;
    if (kb <= maxKb) return Math.round(kb);
  }
  throw new Error(`hoja de ${path.basename(mp4)} pesa más de ${maxKb} KB incluso con calidad mínima`);
};
