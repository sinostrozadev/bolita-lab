/**
 * Síntesis de audio en Node sin dependencias: buffers Float32, mezcla y WAV 48 kHz 16-bit.
 * Lo comparten todas las plantillas. No hagas síntesis dentro de Remotion.
 */
import fs from 'node:fs';

export const SR = 48000;

export const crearPista = (segundos: number) => new Float32Array(Math.ceil(segundos * SR));

/** Frecuencia de una nota MIDI (69 = La4 = 440 Hz). */
export const midiAHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export type Timbre = 'seno' | 'triangulo' | 'cuadrada' | 'sierra' | 'pluck';

const onda = (timbre: Timbre, fase: number, t: number) => {
  const x = fase % 1;
  switch (timbre) {
    case 'seno': return Math.sin(2 * Math.PI * x);
    case 'triangulo': return 4 * Math.abs(x - 0.5) - 1;
    case 'cuadrada': return x < 0.5 ? 1 : -1;
    case 'sierra': return 2 * x - 1;
    case 'pluck': // seno con armónicos que se apagan rápido: suena a marimba/pluck
      return Math.sin(2 * Math.PI * x) + 0.5 * Math.exp(-6 * t) * Math.sin(4 * Math.PI * x) + 0.25 * Math.exp(-10 * t) * Math.sin(6 * Math.PI * x);
  }
};

/** Mezcla una nota en `pista` en el instante `inicio` (s). Envolvente ADSR en segundos. */
export const nota = (
  pista: Float32Array,
  opciones: { inicio: number; hz: number; duracion: number; volumen?: number; timbre?: Timbre; ataque?: number; caida?: number; sostenido?: number; liberacion?: number },
) => {
  const { inicio, hz, duracion, volumen = 0.5, timbre = 'pluck', ataque = 0.005, caida = 0.08, sostenido = 0.6, liberacion = 0.12 } = opciones;
  const desde = Math.floor(inicio * SR);
  const total = Math.floor((duracion + liberacion) * SR);
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    const t = i / SR;
    let env: number;
    if (t < ataque) env = t / ataque;
    else if (t < ataque + caida) env = 1 - (1 - sostenido) * ((t - ataque) / caida);
    else if (t < duracion) env = sostenido;
    else env = sostenido * Math.max(0, 1 - (t - duracion) / liberacion);
    if (timbre === 'pluck') env *= Math.exp(-2.5 * t);
    pista[idx] += onda(timbre, hz * t, t) * env * volumen;
  }
};

/** Golpe de ruido filtrado: útil para choques, "tic" de pared, caja. */
export const golpe = (pista: Float32Array, inicio: number, opciones: { duracion?: number; volumen?: number; tono?: number; semilla?: number } = {}) => {
  const { duracion = 0.05, volumen = 0.4, tono = 0.5, semilla = 1 } = opciones;
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(duracion * SR);
  let s = semilla >>> 0 || 1;
  let prev = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= pista.length) break;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const ruido = (s / 4294967296) * 2 - 1;
    prev = prev + tono * (ruido - prev); // filtro paso bajo de 1 polo: tono 0..1
    const env = Math.exp(-(i / total) * 8);
    pista[idx] += prev * env * volumen;
  }
};

/** Barrido ("whoosh"/"riser"): de hz0 a hz1 en `duracion` s. */
export const barrido = (pista: Float32Array, inicio: number, hz0: number, hz1: number, duracion: number, volumen = 0.3, timbre: Timbre = 'seno') => {
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(duracion * SR);
  let fase = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= pista.length) break;
    const t = i / SR;
    const hz = hz0 * Math.pow(hz1 / hz0, t / duracion);
    fase += hz / SR;
    const env = Math.sin(Math.PI * (t / duracion));
    pista[idx] += onda(timbre, fase, t) * env * volumen;
  }
};

/** Normaliza a pico objetivo (dBFS) y aplica un limitador suave. */
export const normalizar = (pista: Float32Array, picoDb = -1) => {
  let pico = 0;
  for (const v of pista) pico = Math.max(pico, Math.abs(v));
  if (pico === 0) return pista;
  const objetivo = Math.pow(10, picoDb / 20);
  const g = objetivo / pico;
  for (let i = 0; i < pista.length; i++) pista[i] = Math.tanh(pista[i] * g * 1.2) / Math.tanh(1.2) * objetivo;
  return pista;
};

export const mezclar = (destino: Float32Array, fuente: Float32Array, ganancia = 1, desplazamientoSeg = 0) => {
  const off = Math.floor(desplazamientoSeg * SR);
  for (let i = 0; i < fuente.length; i++) {
    const idx = i + off;
    if (idx >= 0 && idx < destino.length) destino[idx] += fuente[i] * ganancia;
  }
};

/** Escribe WAV mono o estéreo (mismo buffer a ambos canales si se pasa uno). */
export const escribirWav = (ruta: string, canales: Float32Array[]) => {
  const n = canales[0].length;
  const nc = canales.length;
  const datos = Buffer.alloc(n * nc * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = Math.max(-1, Math.min(1, canales[c][i]));
    datos.writeInt16LE(Math.round(v * 32767), (i * nc + c) * 2);
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8);
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(nc, 22);
  cab.writeUInt32LE(SR, 24); cab.writeUInt32LE(SR * nc * 2, 28); cab.writeUInt16LE(nc * 2, 32); cab.writeUInt16LE(16, 34);
  cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
  fs.mkdirSync(ruta.substring(0, ruta.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(ruta, Buffer.concat([cab, datos]));
};

/** Melodías de dominio público como secuencias [midi, duración en pulsos]. Pulso = negra. */
export const MELODIAS: Record<string, { nombre: string; bpm: number; notas: [number, number][] }> = {
  furelise: { nombre: 'Para Elisa (Beethoven)', bpm: 140, notas: [[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],[0,.5],[60,.5],[64,.5],[69,.5],[71,1],[0,.5],[64,.5],[68,.5],[71,.5],[72,1],[0,.5],[64,.5],[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],[0,.5],[60,.5],[64,.5],[69,.5],[71,1],[0,.5],[64,.5],[72,.5],[71,.5],[69,1]] },
  odaalegria: { nombre: 'Oda a la Alegría (Beethoven)', bpm: 120, notas: [[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[64,1.5],[62,.5],[62,2],[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[62,1.5],[60,.5],[60,2]] },
  marchaturca: { nombre: 'Marcha Turca (Mozart)', bpm: 130, notas: [[71,.5],[69,.5],[68,.5],[69,.5],[72,1],[0,.5],[74,.5],[72,.5],[71,.5],[72,.5],[76,1],[0,.5],[77,.5],[76,.5],[75,.5],[76,.5],[83,.5],[81,.5],[80,.5],[81,.5],[83,.5],[81,.5],[80,.5],[81,.5],[84,1],[81,.5],[84,.5],[0,.5],[83,.5],[81,.5],[79,.5],[81,.5],[83,.5],[81,.5],[79,.5],[81,.5],[83,.5],[81,.5],[79,.5],[78,.5],[76,1]] },
  canon: { nombre: 'Canon en Re (Pachelbel)', bpm: 100, notas: [[78,2],[76,2],[74,2],[73,2],[71,2],[69,2],[71,2],[73,2],[74,2],[73,2],[71,2],[69,2],[67,2],[66,2],[67,2],[61,2]] },
  cisnes: { nombre: 'Lago de los Cisnes (Chaikovski)', bpm: 110, notas: [[78,1.5],[79,.5],[81,1],[83,1],[84,1],[86,1],[83,1],[79,1],[78,1.5],[79,.5],[81,1],[83,1],[84,1],[86,1],[83,1],[79,1]] },
};
