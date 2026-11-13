/**
 * LARGO "¿Cuántas adivinas?" (16:9, 30 fps, versión simple): 10 melodías de dominio público que toca una bolita
 * saltando sobre un teclado de pads (cada salto cae JUSTO en la nota: la partitura manda), tarjeta de 9 s con cuenta
 * regresiva y la respuesta, y cierre "comenta tu puntaje".
 *
 * Uso: npx tsx scripts/preparar-largo-quiz.mts contenido/largos/<id>.json [--previews <dir>]
 *   → public/sim/<id>.json (plan) · public/audio/generado/<id>.wav · salida/trabajo/<id>.props.json
 *   --previews: además 12 s de cada melodía en <dir>/largo-quiz-<n>.wav (para escuchar antes de renderizar).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANCIONES_QUIZ } from './lib/canciones-quiz.mjs';
import { SR, escribirWav, masterizar, melodiaATempo, midiAHz, nota } from './lib/wav.mjs';
import { metal, bombo } from './lib/sonido-carrera.mjs';
import { GuionQuiz, T_QUIZ, type PlanQuiz } from '../src/plantillas/quiz/guion';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;

export const prepararQuiz = (g: GuionQuiz, previews?: string) => {
  const { portada, intro, toca, tarjeta, final } = T_QUIZ;
  const porCancion = intro + toca + tarjeta;
  const duracionFrames = portada + CANCIONES_QUIZ.length * porCancion + final;
  const total = duracionFrames / FPS;
  const L = new Float32Array(Math.ceil((total + 1) * SR)), R = new Float32Array(L.length);
  const ambos = (f: (p: Float32Array) => void) => { f(L); f(R); };
  const canciones: PlanQuiz['canciones'] = [];
  const capitulos: PlanQuiz['capitulos'] = [{ seg: 0, titulo: 'Las reglas: cuenta tus aciertos' }];
  // portada: acorde + golpe
  ambos((p) => bombo(p, 0.1, 0.4));
  [60, 64, 67, 72].forEach((m, k) => ambos((p) => metal(p, 0.15 + k * 0.12, midiAHz(m), 0.12, 0.2)));
  CANCIONES_QUIZ.forEach((c, k) => {
    const desde = portada + k * porCancion;
    const t0 = (desde + intro) / FPS;
    const segundos = toca / FPS - 0.6;
    // notas (con la misma vuelta en bucle que melodiaATempo)
    const pulso = 60 / c.melodia.bpm;
    const notas: [number, number][] = [];
    for (let t = 0; t < segundos;) {
      for (const [m, d] of c.melodia.notas) { if (t >= segundos) break; if (m > 0) notas.push([Math.round(t * 1000) / 1000, m]); t += d * pulso; }
    }
    const pads = [...new Set(notas.map(([, m]) => m))].sort((a, b) => a - b);
    const mel = melodiaATempo(c.melodia, 'piano', 'acorde', segundos);
    const off = Math.floor(t0 * SR);
    for (let i = 0; i < mel.length; i++) { L[off + i] += mel[i] * 0.55; R[off + i] += mel[i] * 0.55; }
    if (previews) {
      const p12 = melodiaATempo(c.melodia, 'piano', 'acorde', 12);
      escribirWav(path.join(previews, `largo-quiz-${k + 1}.wav`), [p12]);
    }
    // intro: "tic"; tarjeta: 3 tics de cuenta regresiva + revelado
    const ti = desde / FPS;
    ambos((p) => nota(p, { inicio: ti + 0.1, hz: 880, duracion: 0.05, volumen: 0.12, timbre: 'seno', liberacion: 0.2 }));
    const tt = (desde + intro + toca) / FPS;
    for (let s = 0; s < 3; s++) ambos((p) => nota(p, { inicio: tt + s, hz: 660, duracion: 0.06, volumen: 0.16, timbre: 'triangulo', liberacion: 0.15 }));
    [72, 76, 79, 84].forEach((m, j) => ambos((p) => metal(p, tt + 3 + j * 0.08, midiAHz(m), 0.3, 0.14)));
    canciones.push({ nombre: c.nombre, autor: c.autor, dificultad: c.dificultad, desde, notas, pads });
    capitulos.push({ seg: Math.round(desde / FPS), titulo: `Canción ${k + 1} · ${'★'.repeat(c.dificultad)}${'☆'.repeat(3 - c.dificultad)}` });
  });
  capitulos.push({ seg: Math.round((portada + CANCIONES_QUIZ.length * porCancion) / FPS), titulo: '¿Cuántas adivinaste? Tu puntaje' });
  const tf = (portada + CANCIONES_QUIZ.length * porCancion) / FPS;
  [60, 64, 67, 72, 76].forEach((m, j) => ambos((p) => metal(p, tf + j * 0.1, midiAHz(m), 0.6, 0.14)));
  for (let s = 0; s < final / FPS - 2; s += 2) [48, 55, 64].forEach((m) => ambos((p) => nota(p, { inicio: tf + 1 + s, hz: midiAHz(m), duracion: 1.9, volumen: 0.05, timbre: 'triangulo', ataque: 0.4, liberacion: 0.6 })));
  masterizar([L, R], { rmsDb: -16, techoDb: -1.5 });
  escribirWav(path.join(RAIZ, 'public/audio/generado', `${g.id}.wav`), [L, R]);
  const plan: PlanQuiz = { version: 1, id: g.id, fps: 30, duracionFrames, canciones, capitulos };
  fs.writeFileSync(path.join(RAIZ, 'public/sim', `${g.id}.json`), JSON.stringify(plan));
  const rutaProps = path.join(RAIZ, 'salida/trabajo', `${g.id}.props.json`);
  fs.writeFileSync(rutaProps, JSON.stringify({ ...g, duracionFrames }, null, 2));
  console.log(`[quiz] ${g.id}: ${(total / 60).toFixed(2)} min · ${canciones.map((c) => `${c.nombre} (${c.notas.length} notas, ${c.pads.length} pads)`).join(' · ')}`);
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const crudo = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'));
  const i = process.argv.indexOf('--previews');
  prepararQuiz(GuionQuiz.parse(crudo.props ?? crudo), i > 0 ? process.argv[i + 1] : undefined);
}
