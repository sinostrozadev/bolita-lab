/**
 * Verifica la SINCRONÍA de un video "maquina": partitura ↔ contacto geométrico de la canica ↔ ataque en el audio.
 *   npx tsx scripts/verificar-maquina.mts <id> [mínimo=40]
 * Para CADA golpe:
 *  - frame de la partitura (recalculado desde contenido/partituras, no desde el sim);
 *  - frame del contacto real: el de mínima holgura entre la canica y la superficie de su pieza (geometria.ts) en
 *    ±8 frames, con la canica sobre la huella de la pieza y la velocidad normal que pasa de entrar a salir;
 *  - ataque en la pista sola de ese instrumento (re-sintetizada) y en el wav mezclado que va al video.
 * Comprueba además que la canica arranca quieta en su compuerta. Sale con código 1 si algún golpe se va de ±1 frame
 * o si hay menos golpes verificados que el mínimo.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SimMaquina } from '../src/plantillas/maquina/guion';
import { contacto, holgura } from '../src/plantillas/maquina/geometria';
import { eventosDe, leerPartitura } from './simular-maquina.mjs';
import { sintetizar } from './preparar-maquina.mjs';

const id = process.argv[2];
const minimo = Number(process.argv[3] ?? 40);
if (!id) { console.error('uso: npx tsx scripts/verificar-maquina.mts <id> [mínimo]'); process.exit(2); }
const raiz = process.cwd();
const sim = JSON.parse(fs.readFileSync(path.join(raiz, 'public/sim', `${id}.json`), 'utf8')) as SimMaquina;
const props = JSON.parse(fs.readFileSync(path.join(raiz, 'salida/trabajo', `${id}.props.json`), 'utf8'));
const ev = eventosDe(leerPartitura(props.partitura, raiz), sim.fps);
const fps = sim.fps;

// wav mezclado (16 bit) → mono
const buf = fs.readFileSync(path.join(raiz, 'public/audio/generado', `${id}.wav`));
const nc = buf.readUInt16LE(22), sr = buf.readUInt32LE(24);
const datos = buf.subarray(44);
const N = datos.length / (2 * nc);
const mezcla = new Float32Array(N);
for (let i = 0; i < N; i++) { let s = 0; for (let c = 0; c < nc; c++) s += datos.readInt16LE((i * nc + c) * 2); mezcla[i] = s / nc / 32768; }
const { pistas } = sintetizar(sim);

/**
 * Ataque cerca de t: energía de la primera diferencia (resalta el golpe frente a lo que ya sonaba) en ventanas de
 * 1 ms; base = media en [t−30, t−8] ms; el ataque es la primera ventana desde t−8 ms que supera base + 30 % del salto.
 */
const ataqueCerca = (x: Float32Array, t: number) => {
  const hop = Math.round(sr * 0.00025), win = Math.round(sr * 0.001);
  const e = (i: number) => { let s = 0; for (let k = i; k < i + win; k++) if (k > 0 && k < x.length) { const d = x[k] - x[k - 1]; s += d * d; } return s; };
  const v: { t: number; e: number }[] = [];
  for (let i = Math.round((t - 0.03) * sr); i <= Math.round((t + 0.03) * sr); i += hop) v.push({ t: (i + win / 2) / sr, e: e(i) });
  const antes = v.filter((w) => w.t < t - 0.008);
  const base = antes.reduce((a, w) => a + w.e, 0) / Math.max(1, antes.length);
  const pico = Math.max(...v.filter((w) => w.t >= t - 0.008).map((w) => w.e));
  const umbral = base + 0.3 * (pico - base);
  return (v.find((w) => w.t >= t - 0.008 && w.e >= umbral) ?? { t: NaN }).t;
};

let fallos = 0, verificados = 0;
const tol = 1000 / fps;
const filas: string[] = [];
const usados = new Set<number>();
for (const e of ev) {
  // golpe del sim que corresponde a este evento de la partitura
  const gi = sim.golpes.findIndex((g, i) => !usados.has(i) && g.pieza === e.pieza && g.idx === e.idx && Math.abs(g.frame - e.frame) <= 3);
  if (gi < 0) { fallos++; filas.push(`${e.pista.padEnd(8)} | ${String(e.frame).padStart(5)} | SIN GOLPE EN EL SIM`); continue; }
  usados.add(gi);
  const g = sim.golpes[gi];
  const c = sim.canicas[g.canica];
  const p = (f: number) => { const k = (f - c.desde) * 3; return { x: c.pos[k], y: c.pos[k + 1], z: c.pos[k + 2] }; };
  let fMin = -1, hMin = Infinity, dentro = false;
  for (let f = e.frame - 8; f <= e.frame + 8; f++) {
    if (f < c.desde || f >= c.desde + c.pos.length / 3) continue;
    const h = holgura(e.pieza, e.idx, p(f));
    if (Math.abs(h.h) < Math.abs(hMin)) { hMin = h.h; fMin = f; dentro = h.dentro; }
  }
  const n = contacto(e.pieza, e.idx).n;
  const vel = (f: number) => { const a = p(f), b = p(f + 1); return (b.x - a.x) * n.x + (b.y - a.y) * n.y + (b.z - a.z) * n.z; };
  const vA = vel(fMin - 1), vD = vel(fMin);
  // arranca quieta en su compuerta
  const comp = sim.compuertas[c.compuerta];
  const p0 = p(c.desde);
  const tS = c.desde / fps - c.suelta;
  const enCompuerta = Math.abs(p0.x - comp.x) < 0.05 && Math.abs(p0.z - comp.z) < 0.05 && Math.abs(comp.y - 0.5 * 981 * tS * tS - p0.y) < 0.05;
  const tAtSolo = ataqueCerca(pistas[e.pista], e.frame / fps);
  const tAtMez = ataqueCerca(mezcla, e.frame / fps);
  const dSolo = (tAtSolo - e.frame / fps) * 1000, dMez = (tAtMez - e.frame / fps) * 1000;
  const ok = Math.abs(fMin - e.frame) <= 1 && Math.abs(hMin) < 0.5 && dentro && vA < 0 && vD > 0 && enCompuerta
    && Math.abs(dSolo) <= tol && Math.abs(dMez) <= tol;
  if (ok) verificados++; else fallos++;
  filas.push(`${e.pista.padEnd(8)} | ${String(e.frame).padStart(5)} | ${String(fMin).padStart(5)} (${hMin.toFixed(2).padStart(5)}${dentro ? '' : ' fuera'}) | ${vA.toFixed(2).padStart(6)} → ${vD.toFixed(2).padStart(5)} | ${dSolo >= 0 ? '+' : ''}${dSolo.toFixed(1).padStart(4)} ms | ${dMez >= 0 ? '+' : ''}${dMez.toFixed(1).padStart(4)} ms | ${enCompuerta ? 'sí' : 'NO'} | ${ok ? 'sí' : 'NO'}`);
}
console.log('pista    | part. | contacto (holgura cm) | v normal antes→después (cm/frame) | ataque pista sola | ataque mezcla | sale de compuerta | ok');
const verTodo = process.argv.includes('--todo');
filas.forEach((f, i) => { if (verTodo || f.endsWith('NO') || i % 8 === 0) console.log(f); });
if (!verTodo) console.log(`(una de cada 8 filas y todas las que fallan; --todo para todas)`);
const porPista = ['melodia', 'bajo', 'bombo', 'platillo'].map((pi) => `${pi} ${ev.filter((e) => e.pista === pi).length}`).join(', ');
console.log(`${verificados}/${ev.length} golpes dentro de ±1 frame (±${tol.toFixed(1)} ms) en geometría, pista sola y mezcla · ${porPista} · ${sim.solapes} frames-canica con solape visible`);
if (fallos || verificados < minimo) { console.log(`FALLA: ${fallos} golpe(s) fuera de tolerancia${verificados < minimo ? `, menos de ${minimo} verificados` : ''}`); process.exit(1); }
console.log('sincronía OK');
