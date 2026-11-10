/**
 * Prepara un guion de la plantilla "maquina" para renderizar:
 *   npx tsx scripts/preparar-maquina.mts contenido/backlog/<guion>.json
 * 1. lee el envoltorio { plantilla:'maquina', id, … props } y la partitura;
 * 2. calcula la máquina (scripts/simular-maquina.mts: compuertas, trayectorias, cámara) → public/sim/<id>.json;
 * 3. sintetiza el audio en el instante exacto de cada golpe → public/audio/generado/<id>.wav:
 *    vibráfono (parciales de lámina 1:4:10 y trémolo de motor), bajo de madera (marimba grave con resonador),
 *    bombo de membrana, platillo (parciales inarmónicos), y la máquina: clac del trinquete de la noria, compuertas,
 *    canicas que caen en la bandeja y en el depósito, y el rodar de fondo (ruido filtrado según cuántas ruedan);
 * 4. escribe salida/trabajo/<id>.props.json (con duracionFrames y fps). Render (Three.js: --gl=swangle, sin GPU en WSL):
 *   npx remotion render src/index.ts Maquina salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --gl=swangle --concurrency=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { EnvoltorioMaquina, type GuionMaquina, type PistaMaquina, type SimMaquina } from '../src/plantillas/maquina/guion';
import { xBajo, xLamina } from '../src/plantillas/maquina/geometria';
import { generarMaquina, leerGuion, leerPartitura } from './simular-maquina.mjs';
import { SR, crearPista, escribirWav, midiAHz } from './lib/wav.mjs';

/** Ruido determinista (LCG). */
const ruido = (semilla: number) => {
  let s = semilla >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
};

/** Suma de parciales [razón, amplitud, tau] con envolvente; `apagar` = s desde el ataque en que se apaga (fundido `soltar`). */
const parciales = (p: Float32Array, inicio: number, hz: number, vol: number, lista: [number, number, number][], largo: number,
  ataque: number, apagar: number | null, soltar: number, mod?: (tAbs: number) => number) => {
  const desde = Math.round(inicio * SR);
  const total = Math.round(largo * SR);
  const activos = lista.filter(([r]) => hz * r < SR / 2 - 800);
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= p.length) continue;
    const t = i / SR;
    let v = 0;
    for (const [r, a, tau] of activos) v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * hz * r * t);
    let env = Math.min(1, t / ataque);
    if (apagar !== null && t > apagar) env *= Math.max(0, 1 - (t - apagar) / soltar);
    if (mod) env *= mod(idx / SR);
    p[idx] += vol * env * v;
  }
};

/** Clic de mazo: ruido de ~2 ms por un paso banda suave (la canica golpea la lámina). */
const clic = (p: Float32Array, inicio: number, vol: number, semilla: number, ms = 2, brillo = 0.5) => {
  const desde = Math.round(inicio * SR);
  const n = Math.round((ms / 1000) * SR);
  const az = ruido(semilla);
  let lp = 0, prev = 0;
  for (let i = 0; i < n * 3; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= p.length) break;
    const r = az();
    const hp = r - prev; prev = r;
    lp += brillo * (hp - lp);
    p[idx] += vol * lp * Math.exp(-i / n);
  }
};

/** Resonador de 2 polos excitado por un impulso de ruido: "toc" de madera o "tic" metálico. */
const resonador = (p: Float32Array, inicio: number, hz: number, tau: number, vol: number, semilla: number) => {
  const desde = Math.round(inicio * SR);
  const r = Math.exp(-1 / (tau * SR));
  const w = (2 * Math.PI * hz) / SR;
  const a1 = 2 * r * Math.cos(w), a2 = -r * r;
  const az = ruido(semilla);
  let y1 = 0, y2 = 0;
  const n = Math.round(tau * 7 * SR);
  for (let i = 0; i < n; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= p.length) break;
    const x = i < 48 ? az() * (1 - i / 48) : 0;
    const y = x * (1 - r) * 4 + a1 * y1 + a2 * y2;
    y2 = y1; y1 = y;
    p[idx] += vol * y;
  }
};

/** Trémolo del motor del vibráfono (5,6 Hz, fase común a todas las notas: el motor no se detiene). */
const tremolo = (t: number) => 1 - 0.2 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 5.6 * t));

/** Vibráfono: lámina de aluminio afinada 1:4:10, la fundamental resuena largo (pedal), mazo suave. */
const vibrafono = (p: Float32Array, inicio: number, hz: number, dur: number, vol: number, semilla: number) => {
  const k = Math.sqrt(hz / 392);
  const sosten = Math.max(0.55, dur) + 0.45;
  parciales(p, inicio, hz, vol, [[1, 1, 1.9 / k], [1.0018, 0.3, 1.6 / k], [4, 0.2, 0.32 / k], [10, 0.055, 0.07], [2, 0.04, 0.4]], sosten + 0.35, 0.0012, sosten, 0.35, tremolo);
  clic(p, inicio, vol * 0.18, semilla, 1.5, 0.35);
};

/** Bajo de madera: marimba grave (palisandro) con resonador; el 2.º armónico se oye en el parlante del teléfono. */
const bajoMadera = (p: Float32Array, inicio: number, hz: number, dur: number, vol: number, semilla: number) => {
  const sosten = Math.min(1.3, dur * 0.9);
  parciales(p, inicio, hz, vol, [[1, 1, 0.75], [2, 0.55, 0.32], [3, 0.12, 0.14], [4, 0.32, 0.08], [9.2, 0.04, 0.03]], sosten + 0.3, 0.0018, sosten, 0.3);
  resonador(p, inicio, 620, 0.012, vol * 0.8, semilla); // golpe de la canica en la madera
};

/** Bombo de membrana: barrido 140 → 52 Hz + golpe de parche. */
const bombo = (p: Float32Array, inicio: number, vol: number, semilla: number) => {
  const desde = Math.round(inicio * SR);
  const total = Math.round(0.5 * SR);
  let fase = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    const hz = 52 + 88 * Math.exp(-t / 0.04);
    fase += hz / SR;
    p[idx] += vol * Math.sin(2 * Math.PI * fase) * Math.exp(-t / 0.28) * Math.min(1, t / 0.0015);
  }
  resonador(p, inicio, 180, 0.03, vol * 0.5, semilla);
  clic(p, inicio, vol * 0.25, semilla + 7, 2, 0.3);
};

/** Platillo: parciales inarmónicos de latón (con batidos) + ruido brillante; abierto = cola larga. */
const platillo = (p: Float32Array, inicio: number, vol: number, semilla: number, abierto = false) => {
  const largo = abierto ? 2.2 : 0.9;
  const tau = abierto ? 0.85 : 0.32;
  const lista: [number, number, number][] = [
    [1, 0.5, tau * 1.2], [1.48, 0.42, tau], [1.93, 0.35, tau * 0.9], [2.37, 0.3, tau * 0.8], [2.91, 0.25, tau * 0.7],
    [3.53, 0.2, tau * 0.6], [4.21, 0.16, tau * 0.5], [1.004, 0.3, tau * 1.1],
  ];
  parciales(p, inicio, 2150, vol * 0.5, lista, largo, 0.0008, null, 0);
  const desde = Math.round(inicio * SR);
  const az = ruido(semilla);
  let a = 0, b = 0;
  for (let i = 0; i < Math.round(largo * SR); i++) {
    const idx = desde + i;
    if (idx >= p.length) break;
    const t = i / SR;
    const r = az();
    const h1 = r - a; a = r;
    const h2 = h1 - b; b = h1;
    p[idx] += vol * 0.35 * Math.min(1, t / 0.0008) * (Math.exp(-t / (tau * 0.5)) * 0.8 + 0.2 * Math.exp(-t / 0.02)) * h2;
  }
};

/** Limitador común a los dos canales. */
const normalizarEstereo = (L: Float32Array, R: Float32Array, picoDb = -1) => {
  let pico = 0;
  for (let i = 0; i < L.length; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  if (!pico) return;
  const obj = Math.pow(10, picoDb / 20);
  const g = obj / pico;
  for (const c of [L, R]) for (let i = 0; i < c.length; i++) c[i] = (Math.tanh(c[i] * g * 1.5) / Math.tanh(1.5)) * obj;
};

type Pista = Float32Array;
/** Pistas sueltas (las usa el verificador para medir el ataque de CADA instrumento) y la mezcla estéreo. */
export const sintetizar = (sim: SimMaquina) => {
  const seg = sim.duracionFrames / sim.fps + 0.3;
  const musica: Record<PistaMaquina, { L: Pista; R: Pista; mono: Pista }> = {} as never;
  for (const k of ['melodia', 'bajo', 'bombo', 'platillo'] as const) musica[k] = { L: crearPista(seg), R: crearPista(seg), mono: crearPista(seg) };
  const maquina = { L: crearPista(seg), R: crearPista(seg) };
  // Cada golpe a una pista mono y luego al estéreo con su paneo (posición x de la pieza).
  const tmp = crearPista(seg);
  const panear = (dst: { L: Pista; R: Pista }, src: Pista, x: number, desde: number, hasta: number) => {
    const pan = Math.max(-0.7, Math.min(0.7, x / 75));
    const a = (pan + 1) * (Math.PI / 4);
    const gl = Math.cos(a) * Math.SQRT2, gr = Math.sin(a) * Math.SQRT2;
    for (let i = Math.max(0, desde); i < Math.min(src.length, hasta); i++) { dst.L[i] += src[i] * gl; dst.R[i] += src[i] * gr; src[i] = 0; }
  };
  sim.golpes.forEach((g, k) => {
    const t = g.frame / sim.fps;
    const desde = Math.round(t * SR);
    let largo = 1.0, x = 0;
    if (g.pista === 'melodia') { vibrafono(tmp, t, midiAHz(g.nota!), g.dur!, 0.42, k + 1); largo = Math.max(0.55, g.dur!) + 0.9; x = xLamina(g.idx); }
    else if (g.pista === 'bajo') { bajoMadera(tmp, t, midiAHz(g.nota!), g.dur!, 0.62, 100 + k); largo = 1.7; x = xBajo(g.idx); }
    else if (g.pista === 'bombo') { bombo(tmp, t, g.acento ? 0.95 : 0.8, 500 + k); largo = 0.6; x = 26; }
    else { platillo(tmp, t, g.abierto ? 0.32 : g.acento ? 0.26 : 0.2, 900 + k, g.abierto); largo = 2.3; x = 2; }
    const hasta = desde + Math.round(largo * SR);
    for (let i = desde; i < Math.min(tmp.length, hasta); i++) musica[g.pista].mono[i] += tmp[i];
    panear(musica[g.pista], tmp, x, desde, hasta);
  });
  // Sonidos de la máquina.
  sim.sonidos.forEach((s, k) => {
    const desde = Math.round(s.t * SR);
    if (s.tipo === 'noria') { // trinquete: alza (tic seco) y cae (toc de madera) + golpe grave del eje
      resonador(tmp, s.t, 1850, 0.006, 0.09 * s.vol, 3000 + k);
      resonador(tmp, s.t + 0.045, 1250, 0.009, 0.07 * s.vol, 3100 + k);
      resonador(tmp, s.t + 0.045, 150, 0.03, 0.08 * s.vol, 3200 + k);
    } else if (s.tipo === 'compuerta') resonador(tmp, s.t, 4300, 0.004, 0.035, 4000 + k);
    else if (s.tipo === 'bandeja') { resonador(tmp, s.t, 2900, 0.004, 0.05 * s.vol, 5000 + k); resonador(tmp, s.t, 820, 0.008, 0.04 * s.vol, 5100 + k); }
    else if (s.tipo === 'embudo') resonador(tmp, s.t, 3600, 0.03, 0.018, 6000 + k);
    else { // depósito: la canica cae sobre las otras (tres choquecitos)
      for (let j = 0; j < 3; j++) resonador(tmp, s.t + j * 0.014 * (1 + j), 4200 + 900 * j, 0.003, 0.05 * s.vol / (1 + j), 7000 + k * 3 + j);
    }
    panear(maquina, tmp, s.x * 0.6, desde, desde + Math.round(0.4 * SR));
  });
  // Rodar de fondo: ruido grave + grano medio, más fuerte cuantas más canicas ruedan (bandeja, embudo, depósito).
  const actividad = new Float32Array(Math.ceil(seg * 100));
  for (const c of sim.canicas) {
    const n = c.pos.length / 3;
    for (let j = 0; j < n; j++) {
      const y = c.pos[j * 3 + 1], z = c.pos[j * 3 + 2];
      const rodando = (c.pieza === 'lamina' && z > 15 && y < 113 && y > 80) || y < 20;
      if (!rodando) continue;
      const k = Math.floor(((c.desde + j) / sim.fps) * 100);
      if (k < actividad.length) actividad[k] += 1;
    }
  }
  const az = ruido(99);
  let lp1 = 0, lp2 = 0, bp = 0, bpPrev = 0, envS = 0;
  for (let i = 0; i < maquina.L.length; i++) {
    const t = i / SR;
    const k = Math.min(actividad.length - 1, Math.floor(t * 100));
    const objetivo = 0.35 + 0.22 * Math.min(6, actividad[k]);
    envS += (objetivo - envS) * 0.0004;
    const r = az();
    lp1 += 0.04 * (r - lp1); lp2 += 0.04 * (lp1 - lp2);
    const hp = r - bpPrev; bpPrev = r; bp += 0.18 * (hp - bp);
    const grano = 0.6 + 0.4 * Math.sin(2 * Math.PI * 7.3 * t + Math.sin(2 * Math.PI * 0.37 * t) * 3);
    const v = envS * (lp2 * 0.5 + bp * 0.02 * grano);
    maquina.L[i] += v * 0.9; maquina.R[i] += v * 1.1;
  }
  const L = crearPista(seg), R = crearPista(seg);
  for (const m of Object.values(musica)) for (let i = 0; i < L.length; i++) { L[i] += m.L[i]; R[i] += m.R[i]; }
  for (let i = 0; i < L.length; i++) { L[i] += maquina.L[i]; R[i] += maquina.R[i]; }
  normalizarEstereo(L, R, -1);
  return { L, R, pistas: Object.fromEntries(Object.entries(musica).map(([k, v]) => [k, v.mono])) as Record<PistaMaquina, Float32Array> };
};

export const prepararMaquina = (props: GuionMaquina, raiz = process.cwd()) => {
  const partitura = leerPartitura(props.partitura, raiz);
  const sim = generarMaquina(props, partitura);
  const rutaSim = path.join(raiz, 'public/sim', `${props.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const { L, R } = sintetizar(sim);
  escribirWav(path.join(raiz, 'public/audio/generado', `${props.id}.wav`), [L, R]);
  return sim;
};

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: npx tsx scripts/preparar-maquina.mts <ruta-guion.json>'); process.exit(2); }
  const raiz = process.cwd();
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  if (crudo.plantilla) EnvoltorioMaquina.parse(crudo);
  const props = leerGuion(ruta);
  if (process.env.MAQUINA_FPS) props.fps = Number(process.env.MAQUINA_FPS) as 30 | 60;
  const t0 = Date.now();
  const sim = prepararMaquina(props, raiz);
  const finales = { ...props, fps: sim.fps, duracionFrames: sim.duracionFrames };
  const salida = path.join(raiz, 'salida/trabajo', `${props.id}.props.json`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify(finales, null, 2) + '\n');
  console.log(`sim → public/sim/${props.id}.json (${sim.golpes.length} golpes, ${sim.canicas.length} canicas, ${sim.solapes} frames con solape) · wav → public/audio/generado/${props.id}.wav · props → ${path.relative(raiz, salida)} (${(sim.duracionFrames / sim.fps).toFixed(1)} s a ${sim.fps} fps, ${((Date.now() - t0) / 1000).toFixed(1)} s de cálculo)`);
}
