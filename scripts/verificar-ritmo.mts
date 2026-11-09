/**
 * Verifica la SINCRONÍA de un video "ritmo": partitura ↔ choque geométrico del sim ↔ ataque en el wav.
 *   npx tsx scripts/verificar-ritmo.mts <id> [n=10]
 * Para n golpes repartidos (todas las pistas): frame esperado por la partitura, frame en que la bolita toca de
 * verdad la superficie de su clavija (mínima holgura en ±6 frames, y la velocidad normal cambia de signo) y el
 * ataque en el wav (máximo salto de energía en ±30 ms). Sale con código 1 si algo se va de ±1 frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SimRitmo, ClavijaSim } from '../src/plantillas/ritmo/guion';
import { eventosDe, leerPartitura } from './simular-ritmo.mjs';

const id = process.argv[2];
const n = Number(process.argv[3] ?? 10);
if (!id) { console.error('uso: npx tsx scripts/verificar-ritmo.mts <id> [n]'); process.exit(2); }
const raiz = process.cwd();
const sim = JSON.parse(fs.readFileSync(path.join(raiz, 'public/sim', `${id}.json`), 'utf8')) as SimRitmo;
const props = JSON.parse(fs.readFileSync(path.join(raiz, 'salida/trabajo', `${id}.props.json`), 'utf8'));
const partitura = leerPartitura(props.partitura, raiz);
const ev = eventosDe(partitura);

// wav 16-bit → mono float
const buf = fs.readFileSync(path.join(raiz, 'public/audio/generado', `${id}.wav`));
const nc = buf.readUInt16LE(22), sr = buf.readUInt32LE(24);
const datos = buf.subarray(44);
const N = datos.length / (2 * nc);
const mono = new Float32Array(N);
for (let i = 0; i < N; i++) { let s = 0; for (let c = 0; c < nc; c++) s += datos.readInt16LE((i * nc + c) * 2); mono[i] = s / nc / 32768; }

/**
 * Ataque cerca de t: energía del agudo (primera diferencia, resalta el golpe frente a las notas que ya sonaban) en
 * ventanas de 1 ms; línea base = media en [t−30, t−8] ms, pico = máximo en [t−8, t+30] ms; el ataque es la primera
 * ventana de ±30 ms que supera base + 30 % del salto.
 */
const ataqueCerca = (t: number) => {
  const hop = Math.round(sr * 0.00025), win = Math.round(sr * 0.001);
  const e = (i: number) => { let s = 0; for (let k = i; k < i + win; k++) if (k > 0 && k < N) { const d = mono[k] - mono[k - 1]; s += d * d; } return s; };
  const ventanas: { t: number; e: number }[] = [];
  for (let i = Math.round((t - 0.03) * sr); i <= Math.round((t + 0.03) * sr); i += hop) ventanas.push({ t: (i + win / 2) / sr, e: e(i) });
  const antes = ventanas.filter((v) => v.t < t - 0.008);
  const base = antes.reduce((a, v) => a + v.e, 0) / Math.max(1, antes.length);
  const pico = Math.max(...ventanas.filter((v) => v.t >= t - 0.008).map((v) => v.e));
  const umbral = base + 0.3 * (pico - base);
  return (ventanas.find((v) => v.t >= t - 0.008 && v.e >= umbral) ?? { t }).t;
};

const distSup = (x: number, y: number, c: ClavijaSim) => {
  const tx = -c.ny, ty = c.nx;
  const ax = c.x - tx * c.largo, ay = c.y - ty * c.largo, bx = c.x + tx * c.largo, by = c.y + ty * c.largo;
  const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / l2));
  return Math.hypot(x - (ax + abx * u), y - (ay + aby * u)) - c.radio;
};

// n golpes repartidos a lo largo del video, rotando por pista para cubrir las cinco.
const pistas = ['melodia', 'bajo', 'kick', 'snare', 'hat'] as const;
const elegidos = Array.from({ length: n }, (_, k) => {
  const pista = pistas[k % pistas.length];
  const lista = sim.golpes.filter((g) => g.pista === pista);
  return lista[Math.min(lista.length - 1, Math.floor(((k + 0.5) / n) * lista.length))];
});

let fallos = 0;
console.log('pista    | partitura f | choque sim f (holgura u) | vel. normal antes→después | ataque wav (Δ ms) | ok');
for (const g of elegidos) {
  const b = sim.bolitas[g.bolita];
  const c = sim.clavijas[g.clavija];
  const iEv = sim.golpes.filter((x) => x.pista === g.pista).indexOf(g);
  const fPart = ev[g.pista][iEv].frame;
  let fMin = g.frame, hMin = Infinity;
  for (let f = g.frame - 6; f <= g.frame + 6; f++) {
    const h = distSup(b.cuadros[f * 2], b.cuadros[f * 2 + 1], c) - b.r;
    if (h < hMin) { hMin = h; fMin = f; }
  }
  const v = (f: number) => ({ x: (b.cuadros[(f + 1) * 2] - b.cuadros[f * 2]), y: (b.cuadros[(f + 1) * 2 + 1] - b.cuadros[f * 2 + 1]) });
  const vAntes = v(g.frame - 1), vDesp = v(g.frame);
  const nA = vAntes.x * c.nx + vAntes.y * c.ny, nD = vDesp.x * c.nx + vDesp.y * c.ny;
  const tAt = ataqueCerca(fPart / sim.fps);
  const dMs = (tAt - fPart / sim.fps) * 1000;
  const ok = Math.abs(fMin - fPart) <= 1 && Math.abs(dMs) <= 1000 / sim.fps && nA < 0 && nD > 0 && Math.abs(hMin) < 1;
  if (!ok) fallos++;
  console.log(`${g.pista.padEnd(8)} | ${String(fPart).padStart(11)} | ${String(fMin).padStart(12)} (${hMin.toFixed(2).padStart(6)}) | ${nA.toFixed(1).padStart(8)} → ${nD.toFixed(1).padStart(6)} u/frame | ${(tAt * 1000).toFixed(0).padStart(7)} ms (${dMs >= 0 ? '+' : ''}${dMs.toFixed(1)}) | ${ok ? 'sí' : 'NO'}`);
}
console.log(fallos ? `${fallos} golpe(s) fuera de tolerancia` : `sincronía OK en ${elegidos.length} golpes (±1 frame = ±${(1000 / sim.fps).toFixed(1)} ms)`);
process.exit(fallos ? 1 : 0);
