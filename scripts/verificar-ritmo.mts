/**
 * Verifica un video "ritmo" desde el sim ya generado (independiente del generador):
 *   npx tsx scripts/verificar-ritmo.mts <id> [n=todos] [--detalle]
 * 1. SINCRONÍA partitura ↔ choque geométrico del sim ↔ ataque en el wav: para n golpes repartidos (o todos), frame
 *    esperado por la partitura, frame en que la bolita toca de verdad la superficie de su clavija (mínima holgura en
 *    ±6 frames, y la velocidad normal cambia de signo) y el ataque en el wav. Falla si algo se va de ±1 frame.
 * 2. GEOMETRÍA (v3, cuadro a cuadro): bolitas que se tocan; bolita que roza o atraviesa una clavija, pared, riel o
 *    columpio de OTRA bolita mientras se ve; bolita que atraviesa una clavija propia que no es la de su golpe; bolita
 *    que se sale del cuadro; más de 2 figuras grandes a la vista. Cada racha seguida cuenta como 1 aviso. Falla si
 *    queda alguno.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { SimRitmo, ClavijaSim } from '../src/plantillas/ritmo/guion';
import { eventosDe, leerPartitura } from './simular-ritmo.mjs';

const id = process.argv[2];
const args = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const detalle = process.argv.includes('--detalle');
const n = args[0] && args[0] !== 'todos' ? Number(args[0]) : Infinity;
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

function distSup(x: number, y: number, c: { x: number; y: number; nx: number; ny: number; largo: number; radio: number }) {
  const tx = -c.ny, ty = c.nx;
  const ax = c.x - tx * c.largo, ay = c.y - ty * c.largo, bx = c.x + tx * c.largo, by = c.y + ty * c.largo;
  const abx = bx - ax, aby = by - ay, l2 = abx * abx + aby * aby;
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / l2));
  return Math.hypot(x - (ax + abx * u), y - (ay + aby * u)) - c.radio;
}

/**
 * Auditoría geométrica del sim. Tiempos de vida (deben coincidir con simular-ritmo.mts y Ritmo.tsx): clavija desde
 * 40 frames antes de su golpe hasta 18 después; riel desde 0,9 s antes de que entre la bolita hasta 0,32 s después
 * de que pasa cada punto; pared mientras dura su zigzag; columpio en sus frames; portal 0,9 s antes → 0,5 s después.
 */
/** Escala de dibujo de una clavija (igual que Ritmo.tsx y simular-ritmo.mts) en el frame (de simulación) f. */
function escala(c: ClavijaSim, f: number) {
  const tras = f - c.golpe, antes = c.golpe - (c.aparece ?? c.golpe - 40);
  if (tras < -antes) return 0;
  if (tras < 0) { const nace = Math.min(1, (tras + antes) / 12); return nace * (1 + 0.15 * Math.sin(nace * Math.PI)); }
  const d = Math.min(1, tras / 18);
  return (1 + 0.35 * Math.exp(-tras / 3)) * (1 - d * d);
}

function auditarGeometria(sim: SimRitmo) {
  const fps = sim.fps;
  const ALTO = (sim.mundo.ancho * 1920) / 1080 / 2, ANCHO = sim.mundo.ancho / 2;
  const tSim = (f: number) => (f <= sim.finalFrame ? f : sim.finalFrame + (f - sim.finalFrame) * sim.lentoClimax) / fps;
  const fin = sim.duracionFrames - 72; // el cierre de marca tapa todo
  const avisos: { tipo: string; texto: string }[] = [];
  const abiertas = new Map<string, number>(); // clave → último frame con el problema (rachas)
  const marcar = (tipo: string, clave: string, f: number, texto: string) => {
    const k = `${tipo}|${clave}`;
    const u = abiertas.get(k);
    if (u === undefined || f - u > 2) avisos.push({ tipo, texto: `frame ${f}: ${texto}` });
    abiertas.set(k, f);
  };
  const oculta = (b: SimRitmo['bolitas'][number], f: number) => !!b.ocultos?.some(([a, z]) => f >= a && f <= z);
  const pos = (b: SimRitmo['bolitas'][number], f: number) => ({ x: b.cuadros[f * 2], y: b.cuadros[f * 2 + 1] });
  // objetos de figura por tipo
  const rieles = sim.objetos.flatMap((o) => (o.tipo === 'riel' ? [o] : []));
  const paredes = sim.objetos.flatMap((o) => (o.tipo === 'pared' ? [o] : []));
  const columpios = sim.objetos.flatMap((o) => (o.tipo === 'pendulo' ? [o] : []));
  let huecoMin = { d: Infinity, f: 0, a: '', b: '' };
  for (let f = 0; f < fin; f++) {
    const t = tSim(f);
    const camX = sim.camara[f * 2], camY = sim.camara[f * 2 + 1];
    sim.bolitas.forEach((b, i) => {
      if (oculta(b, f)) return;
      const p = pos(b, f);
      // fuera del cuadro (la bolita entera debe verse)
      // (en reposo sobre su repisa no cuenta: la cámara llega hasta ella)
      if (f >= b.repisa.abre && (Math.abs(p.x - camX) + b.r > ANCHO + 0.5 || Math.abs(p.y - camY) + b.r > ALTO + 0.5)) marcar('fuera-de-cuadro', `${i}`, f, `${b.pista} sale del cuadro`);
      // bolitas que se tocan
      for (let j = i + 1; j < sim.bolitas.length; j++) {
        const o = sim.bolitas[j];
        if (oculta(o, f)) continue;
        const q = pos(o, f);
        const hueco = Math.hypot(p.x - q.x, p.y - q.y) - b.r - o.r;
        if (hueco < huecoMin.d) huecoMin = { d: hueco, f, a: b.pista, b: o.pista };
        if (hueco < 2) marcar('bolitas-se-tocan', `${i}-${j}`, f, `${b.pista} y ${o.pista}`);
      }
      // clavijas vivas
      sim.clavijas.forEach((c0, k) => {
        if (Math.abs(c0.y - p.y) > b.r + c0.largo + c0.radio + 10) return;
        // la clavija con el tamaño con que se DIBUJA en ese instante (nace en 12 frames, se disuelve en 18)
        const e = escala(c0, t * fps);
        if (e < 0.3) return;
        const c = { ...c0, largo: c0.largo * e, radio: c0.radio * e };
        const d = distSup(p.x, p.y, c) - b.r;
        if (c.bolita !== i) { if (d < 2) marcar('clavija-ajena', `${i}-${k}`, f, `${b.pista} ${d < 0 ? 'atraviesa' : 'roza'} una clavija de ${sim.bolitas[c.bolita].pista} (${d.toFixed(1)} u)`); }
        else if (Math.abs(f - c.golpe) > 2 && d < -2) marcar('clavija-propia', `${i}-${k}`, f, `${b.pista} atraviesa su clavija del frame ${c.golpe} (${d.toFixed(1)} u)`);
      });
      for (const w of paredes) {
        if (w.bolita === i || t < w.desde || t > w.hasta) continue;
        const d = distSup(p.x, p.y, { x: w.x, y: (w.y0 + w.y1) / 2, nx: 1, ny: 0, largo: (w.y1 - w.y0) / 2, radio: 8 }) - b.r;
        if (d < 2) marcar('pared-ajena', `${i}-${w.x}-${w.y0}`, f, `${b.pista} toca una pared de ${sim.bolitas[w.bolita].pista}`);
      }
      for (const rl of rieles) {
        if (rl.bolita === i) continue;
        const ts = rl.tiempos;
        if (t < ts[0] - 0.9 || t > ts[ts.length - 1] + 0.32) continue;
        const rr = sim.bolitas[rl.bolita].r + 12;
        for (let k = 0; k < ts.length; k++) {
          if (t > ts[k] + 0.32) continue;
          if (Math.hypot(rl.puntos[k * 3] - p.x, rl.puntos[k * 3 + 1] - p.y) < rr + b.r + 2) { marcar('riel-ajeno', `${i}-${ts[0]}`, f, `${b.pista} pasa por un riel de ${sim.bolitas[rl.bolita].pista}`); break; }
        }
      }
      for (const o of columpios) {
        const k = f - o.desdeFrame;
        if (o.bolita === i || k < 0 || k >= o.angulos.length) continue;
        const th = o.angulos[k], R = sim.bolitas[o.bolita].r + 16;
        if (Math.hypot(o.px + o.largo * Math.sin(th) - p.x, o.py + o.largo * Math.cos(th) - p.y) < R + b.r + 2) marcar('columpio-ajeno', `${i}-${o.desdeFrame}`, f, `${b.pista} toca el columpio de ${sim.bolitas[o.bolita].pista}`);
      }
    });
    // tope de figuras grandes a la vista (ventana 0,9 s antes → 0,5 s después)
    const grandes = sim.tramos.filter((tr) => tr.grande && t >= tr.desde / fps - 0.9 && t <= tr.hasta / fps + 0.5).length;
    if (grandes > 2) marcar('grandes', 'tope', f, `${grandes} figuras grandes a la vista`);
  }
  console.log(`hueco mínimo entre bolitas: ${huecoMin.d.toFixed(1)} u (${huecoMin.a} y ${huecoMin.b}, frame ${huecoMin.f}); figuras grandes: ${sim.tramos.filter((t) => t.grande).length}`);
  return avisos;
}

// n golpes repartidos a lo largo del video, rotando por pista para cubrir las cinco (o todos).
const pistas = ['melodia', 'bajo', 'kick', 'snare', 'hat'] as const;
const elegidos = Number.isFinite(n) ? Array.from({ length: n }, (_, k) => {
  const pista = pistas[k % pistas.length];
  const lista = sim.golpes.filter((g) => g.pista === pista);
  return lista[Math.min(lista.length - 1, Math.floor(((k + 0.5) / n) * lista.length))];
}) : sim.golpes;

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
  if (detalle || !ok || Number.isFinite(n)) console.log(`${g.pista.padEnd(8)} | ${String(fPart).padStart(11)} | ${String(fMin).padStart(12)} (${hMin.toFixed(2).padStart(6)}) | ${nA.toFixed(1).padStart(8)} → ${nD.toFixed(1).padStart(6)} u/frame | ${(tAt * 1000).toFixed(0).padStart(7)} ms (${dMs >= 0 ? '+' : ''}${dMs.toFixed(1)}) | ${ok ? 'sí' : 'NO'}`);
}
console.log(fallos ? `sincronía: ${fallos} de ${elegidos.length} golpe(s) fuera de tolerancia` : `sincronía OK en ${elegidos.length}/${sim.golpes.length} golpes (±1 frame = ±${(1000 / sim.fps).toFixed(1)} ms)`);

// ---------------------------------------------------------------- 2. geometría cuadro a cuadro
const avisos = auditarGeometria(sim);
const porTipo = new Map<string, number>();
for (const a of avisos) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1);
for (const a of avisos.slice(0, detalle ? avisos.length : 12)) console.log(`  aviso ${a.tipo}: ${a.texto}`);
console.log(avisos.length ? `geometría: ${avisos.length} aviso(s) (${[...porTipo].map(([k, v]) => `${k} ${v}`).join(', ')})` : 'geometría OK: 0 avisos');
process.exit(fallos || avisos.length ? 1 : 0);
