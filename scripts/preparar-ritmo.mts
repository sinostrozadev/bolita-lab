/**
 * Prepara un guion de la plantilla "ritmo" para renderizar:
 *   npx tsx scripts/preparar-ritmo.mts contenido/backlog/<guion>.json
 * 1. lee el envoltorio { plantilla:'ritmo', id, titulo, descripcion, hashtags, props } y la partitura;
 * 2. genera el nivel desde la música (scripts/simular-ritmo.mts) → public/sim/<id>.json;
 * 3. sintetiza las tres pistas en el instante exacto de cada golpe → public/audio/generado/<id>.wav;
 * 4. escribe salida/trabajo/<id>.props.json (con duracionFrames). Luego (ojo: --gl=swangle, sin GPU en WSL):
 *   npx remotion render src/index.ts Ritmo salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --gl=swangle
 */
import fs from 'node:fs';
import path from 'node:path';
import { EnvoltorioRitmo, type GuionRitmo, type PartituraRitmo, type SimRitmo } from '../src/plantillas/ritmo/guion';
import { FPS, eventosDe, generarNivel, leerGuion, leerPartitura } from './simular-ritmo.mjs';
import { SR, crearPista, escribirWav, midiAHz, tocar, type Instrumento } from './lib/wav.mjs';

// ---------- Instrumentos propios de la plantilla ----------

/** Ruido determinista (LCG). */
const ruido = (semilla: number) => {
  let s = semilla >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
};

/** Bajo redondo: seno + 2.º armónico (se oye en el parlante del teléfono) + 3.º muy débil; ataque suave de 18 ms. */
const bajo = (p: Float32Array, inicio: number, hz: number, dur: number, vol: number) => {
  const desde = Math.round(inicio * SR);
  const suelta = Math.min(dur * 0.92, 1.4);
  const total = Math.round((suelta + 0.25) * SR);
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    let env = Math.min(1, t / 0.018) * Math.exp(-t / 0.9);
    if (t > suelta) env *= Math.max(0, 1 - (t - suelta) / 0.25);
    const w = 2 * Math.PI * hz * t;
    p[idx] += vol * env * (Math.sin(w) + 0.5 * Math.exp(-t / 0.5) * Math.sin(2 * w) + 0.12 * Math.exp(-t / 0.3) * Math.sin(3 * w));
  }
};

/** Bombo: seno con barrido 150 → 50 Hz (fase acumulada) + clic de 3 ms. */
const bombo = (p: Float32Array, inicio: number, vol: number, semilla: number) => {
  const desde = Math.round(inicio * SR);
  const total = Math.round(0.45 * SR);
  const az = ruido(semilla);
  let fase = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    const hz = 50 + 100 * Math.exp(-t / 0.045);
    fase += hz / SR;
    const cuerpo = Math.sin(2 * Math.PI * fase) * Math.exp(-t / 0.26) * Math.min(1, t / 0.0015);
    const clic = t < 0.003 ? az() * (1 - t / 0.003) * 0.35 : 0;
    p[idx] += vol * (cuerpo + clic);
  }
};

/** Caja: ruido filtrado (paso alto suave) con cola corta + tono de 180 Hz (y 330 Hz débil) que da el cuerpo. */
const caja = (p: Float32Array, inicio: number, vol: number, semilla: number) => {
  const desde = Math.round(inicio * SR);
  const total = Math.round(0.24 * SR);
  const az = ruido(semilla);
  let prev = 0, lp = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    const r = az();
    const hp = r - prev; prev = r; // paso alto de 1 cero
    lp += 0.45 * (hp - lp);        // y un paso bajo: banda "de caja"
    const ataque = Math.min(1, t / 0.001);
    const tono = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.05) + 0.4 * Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t / 0.03);
    p[idx] += vol * ataque * (0.9 * lp * Math.exp(-t / 0.07) + 0.55 * tono);
  }
};

/** Platillo cerrado: ruido muy brillante (doble paso alto), 50 ms. Abierto: cola de 0,7 s. */
const platillo = (p: Float32Array, inicio: number, vol: number, semilla: number, abierto = false) => {
  const desde = Math.round(inicio * SR);
  const tau = abierto ? 0.22 : 0.016;
  const total = Math.round((abierto ? 0.9 : 0.08) * SR);
  const az = ruido(semilla);
  let a = 0, b = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    const r = az();
    const h1 = r - a; a = r;
    const h2 = h1 - b; b = h1;
    p[idx] += vol * Math.min(1, t / 0.0008) * Math.exp(-t / tau) * h2 * 0.5;
  }
};

/** Limitador común a los dos canales (mismo criterio que `normalizar` de wav.mts, sin descompensar el estéreo). */
const normalizarEstereo = (L: Float32Array, R: Float32Array, picoDb = -1) => {
  let pico = 0;
  for (let i = 0; i < L.length; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  if (!pico) return;
  const obj = Math.pow(10, picoDb / 20);
  const g = obj / pico;
  for (const c of [L, R]) for (let i = 0; i < c.length; i++) c[i] = (Math.tanh(c[i] * g * 1.6) / Math.tanh(1.6)) * obj;
};

/** Paneo por carril (potencia constante); bombo y bajo casi al centro. */
const PANEO: Record<string, number> = { melodia: 0, bajo: -0.08, kick: 0, snare: 0.22, hat: 0.38 };

export const sintetizar = (sim: SimRitmo, partitura: PartituraRitmo, timbre: Instrumento) => {
  const seg = sim.duracionFrames / FPS + 0.2;
  const pistas = { melodia: crearPista(seg), bajo: crearPista(seg), kick: crearPista(seg), snare: crearPista(seg), hat: crearPista(seg) };
  const ev = eventosDe(partitura);
  ev.melodia.forEach((e, k) => tocar(pistas.melodia, timbre, { inicio: e.frame / FPS, hz: midiAHz(e.nota!), duracion: Math.max(0.18, e.dur! * 0.95), volumen: 0.5, semilla: k + 1 }));
  ev.bajo.forEach((e) => bajo(pistas.bajo, e.frame / FPS, midiAHz(e.nota!), e.dur!, 0.42));
  ev.kick.forEach((e, k) => bombo(pistas.kick, e.frame / FPS, 0.8, 11 + k));
  ev.snare.forEach((e, k) => caja(pistas.snare, e.frame / FPS, 0.42, 101 + k));
  ev.hat.forEach((e, k) => platillo(pistas.hat, e.frame / FPS, e.abierto ? 0.3 : 0.2, 1001 + k, e.abierto));
  const L = crearPista(seg), R = crearPista(seg);
  for (const [nombre, p] of Object.entries(pistas)) {
    const a = ((PANEO[nombre] ?? 0) + 1) * (Math.PI / 4);
    const gl = Math.cos(a), gr = Math.sin(a);
    for (let i = 0; i < p.length; i++) { L[i] += p[i] * gl; R[i] += p[i] * gr; }
  }
  normalizarEstereo(L, R, -1);
  return [L, R];
};

export const prepararRitmo = (props: GuionRitmo, raiz = process.cwd()) => {
  const partitura = leerPartitura(props.partitura, raiz);
  const sim = generarNivel(props, partitura);
  const rutaSim = path.join(raiz, 'public/sim', `${props.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const [L, R] = sintetizar(sim, partitura, props.timbre ?? 'piano');
  escribirWav(path.join(raiz, 'public/audio/generado', `${props.id}.wav`), [L, R]);
  return sim;
};

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: npx tsx scripts/preparar-ritmo.mts <ruta-guion.json>'); process.exit(2); }
  const raiz = process.cwd();
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (crudo.plantilla) EnvoltorioRitmo.parse(crudo); // valida el envoltorio completo del backlog
  const props = leerGuion(ruta);
  const t0 = Date.now();
  const sim = prepararRitmo(props, raiz);
  const finales = { ...props, duracionFrames: sim.duracionFrames };
  const salida = path.join(raiz, 'salida/trabajo', `${props.id}.props.json`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
  console.log(`sim → public/sim/${props.id}.json · wav → public/audio/generado/${props.id}.wav · props → ${path.relative(raiz, salida)} (${(sim.duracionFrames / FPS).toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(1)} s de cálculo)`);
}
