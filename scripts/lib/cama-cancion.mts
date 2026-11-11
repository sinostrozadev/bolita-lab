/**
 * Cama musical desde una PARTITURA (prop `musica` de carrera y colores, 2026-11-10): en vez de la cama genérica,
 * de fondo suena una canción real (melodía en piano suave + bajo/arpegio + percusión suave si la partitura la trae).
 * Lee el mismo formato de `contenido/partituras/<nombre>.json` que usan `ritmo`/`maquina`
 * (`bpm`, `pistas.melodia|bajo` = [midi, pulso, duración], `pistas.ritmo` = {tipo, pulso, abierto?, acento?}) y, si
 * existe, `arpegio` (acompañamiento en corcheas, mejor que el bajo en blancas para una cama).
 * Si el video dura más que la canción, la repite; se apaga con un fundido de 0,5 s en `hasta`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SR, barrido, golpe, midiAHz, nota, piano } from './wav.mjs';

type NotaP = [number, number, number];
export type PartituraCama = {
  bpm: number;
  pistas: { melodia: NotaP[]; bajo: NotaP[]; ritmo?: { tipo: string; pulso: number; abierto?: boolean; acento?: boolean }[] };
  arpegio?: NotaP[];
};

/** Acepta el nombre de la partitura (`cancion-santiago-tema`) o una ruta a un .json (relativa al repo). */
export const leerPartituraCama = (musica: string, raiz = process.cwd()): PartituraCama => {
  const ruta = musica.endsWith('.json') ? path.resolve(raiz, musica) : path.join(raiz, 'contenido/partituras', `${musica}.json`);
  const p = JSON.parse(fs.readFileSync(ruta, 'utf8')) as PartituraCama;
  if (!p.bpm || !p.pistas?.melodia?.length) throw new Error(`musica: ${ruta} no es una partitura (falta bpm o pistas.melodia)`);
  return p;
};

/** Ruido determinista (LCG). */
const ruido = (semilla: number) => {
  let s = semilla >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
};
const ruidoAgudo = (p: Float32Array, t: number, dur: number, vol: number, semilla: number, caida = 8) => {
  const az = ruido(semilla);
  const desde = Math.floor(t * SR), total = Math.floor(dur * SR);
  let prev = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0) continue;
    if (idx >= p.length) break;
    const r = az();
    const hp = r - prev; prev = r * 0.85 + prev * 0.15;
    p[idx] += hp * Math.exp(-(i / total) * caida) * vol;
  }
};

/**
 * Escribe la cama en `canales` (1 = mono, 2 = estéreo; mismo contenido en ambos) entre `desde` y `hasta` (s).
 * `volumen` escala todo (1 ≈ melodía a 0,3 de pico). Devuelve la duración de una vuelta de la canción (s).
 */
export const tocarCama = (
  canales: Float32Array[], p: PartituraCama,
  o: { desde?: number; hasta: number; volumen?: number; percusion?: boolean },
) => {
  const { desde = 0, hasta, volumen = 1, percusion = true } = o;
  const pulso = 60 / p.bpm;
  const ultimo = Math.max(...[...p.pistas.melodia, ...p.pistas.bajo].map(([, s, d]) => s + d));
  const vuelta = Math.ceil(ultimo) * pulso + 0.6; // respiro corto antes de repetir
  const largo = canales[0].length;
  const pista = new Float32Array(largo);
  const acomp = p.arpegio?.length ? p.arpegio : p.pistas.bajo;
  for (let v = 0; desde + v * vuelta < hasta; v++) {
    const t0 = desde + v * vuelta;
    const en = (s: number) => t0 + s * pulso;
    p.pistas.melodia.forEach(([m, s, d], k) => {
      const t = en(s);
      if (t >= hasta) return;
      piano(pista, { inicio: t, hz: midiAHz(m), duracion: Math.max(0.12, d * pulso * 0.92), volumen: 0.3 * volumen, semilla: k + 11 });
    });
    acomp.forEach(([m, s, d]) => {
      const t = en(s);
      if (t >= hasta) return;
      // Bajo redondo: triángulo + seno una octava abajo (se oye en el parlante de un teléfono por los armónicos).
      nota(pista, { inicio: t, hz: midiAHz(m), duracion: d * pulso * 0.85, volumen: 0.16 * volumen, timbre: 'triangulo', ataque: 0.006, caida: 0.08, sostenido: 0.6, liberacion: 0.08 });
      nota(pista, { inicio: t, hz: midiAHz(m - 12), duracion: d * pulso * 0.85, volumen: 0.07 * volumen, timbre: 'seno', ataque: 0.006, caida: 0.1, sostenido: 0.7, liberacion: 0.08 });
    });
    if (percusion) for (const g of p.pistas.ritmo ?? []) {
      const t = en(g.pulso);
      if (t >= hasta) continue;
      const a = g.acento ? 1.4 : 1;
      if (g.tipo === 'kick' || g.tipo === 'bombo') {
        barrido(pista, t, 150, 45, 0.16, 0.26 * a * volumen, 'seno');
        golpe(pista, t, { duracion: 0.008, volumen: 0.08 * a * volumen, tono: 0.6, semilla: Math.floor(t * 1000) });
      } else if (g.tipo === 'snare') {
        ruidoAgudo(pista, t, 0.14, 0.12 * a * volumen, Math.floor(t * 977), 7);
        nota(pista, { inicio: t, hz: 190, duracion: 0.03, volumen: 0.07 * a * volumen, timbre: 'triangulo', caida: 0.03, liberacion: 0.05 });
      } else {
        ruidoAgudo(pista, t, g.abierto ? 0.5 : 0.03, (g.abierto ? 0.07 : 0.035) * a * volumen, Math.floor(t * 991), g.abierto ? 4 : 9);
      }
    }
  }
  // Fundido de entrada (60 ms) y de salida (0,5 s antes de `hasta`); nada después.
  const i0 = Math.floor(desde * SR), i1 = Math.floor(hasta * SR);
  for (let i = 0; i < largo; i++) {
    let g = 1;
    if (i < i0) g = 0; else if (i < i0 + 0.06 * SR) g = (i - i0) / (0.06 * SR);
    if (i >= i1) g = 0; else if (i > i1 - 0.5 * SR) g *= (i1 - i) / (0.5 * SR);
    const s = pista[i] * g;
    for (const c of canales) c[i] += s;
  }
  return vuelta;
};
