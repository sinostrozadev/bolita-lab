/**
 * Plantilla "ritmo": NIVEL GENERADO DESDE LA MÚSICA. La partitura manda: para cada pista (melodía, bajo, bombo,
 * caja, platillo) hay una bolita, y cada evento musical t_i es un choque contra una clavija colocada de antemano
 * justo donde la bolita estará en t_i. Entre golpes la trayectoria es una parábola exacta, así que el choque cae
 * en el frame exacto del evento (los eventos caen en frames enteros: a 75 bpm la corchea dura 24 cuadros).
 *
 * Para cada golpe i (punto P_i, velocidad de llegada v_in):
 *   1. se elige P_{i+1} dentro del carril y cerca de la "línea de descenso" común (azar determinista por semilla);
 *   2. velocidad de salida necesaria: v_out = (P_{i+1} − P_i − ½·g·Δt²·ŷ) / Δt;
 *   3. normal de la clavija = normalize(v_out − v_in): un choque sin fricción con esa normal produce exactamente
 *      v_out (la componente tangencial se conserva; la normal se escala por la restitución e);
 *   4. se descartan candidatos con e absurda, choques rasantes, saltos enormes o que atraviesen otra clavija u
 *      otra bolita; de los válidos gana el de menor costo.
 * No hay Math.random: todo sale de crearAzar(semilla).
 */
import fs from 'node:fs';
import path from 'node:path';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import { PALETA } from '../src/marca/tokens';
import {
  GuionRitmo, PartituraRitmo, type BolitaSim, type ClavijaSim, type GolpeSim, type PistaRitmo, type SimRitmo,
} from '../src/plantillas/ritmo/guion';

export const FPS = 60;
/** Frames antes del primer evento (0,8 s): las bolitas se ven quietas en sus repisas con el texto. */
export const FRAMES_ENTRADA = 48;
/** Caída libre desde la repisa hasta el primer golpe (0,5 s). */
const FRAMES_CAIDA = 30;
/** Tras el golpe final: 1,6 s de clímax en cámara lenta (revela qué toca cada una) + 1,2 s de cierre de marca. */
export const FRAMES_CLIMAX = 96;
/** Tras el golpe final el tiempo de la simulación corre a este ritmo (cámara lenta del clímax). */
export const LENTO_CLIMAX = 0.35;
export const FRAMES_CIERRE = 72;

const G = 2800; // unidades/s² (la vista mide 1500 unidades de ancho)
const ANCHO_MUNDO = 1500;
/** Semiancho útil del carril para el centro de la bolita. */
const SEMI_CARRIL = 85;
/** Muestreo para detectar choques no deseados (240 Hz: < 13 unidades entre muestras a 3000 u/s). */
const SUB = 4;

type Config = { pista: PistaRitmo; carril: number; r: number; color: string; brillo: number; largo: number; radio: number; desfase: number };
const CONFIG: Config[] = [
  // Orden de generación = orden de prioridad (la melodía elige primero su camino).
  { pista: 'melodia', carril: 0, r: 52, color: PALETA.neon.amarillo, brillo: 1.0, largo: 48, radio: 13, desfase: 0 },
  { pista: 'bajo', carril: -300, r: 58, color: PALETA.neon.violeta, brillo: 0.35, largo: 54, radio: 14, desfase: -110 },
  { pista: 'kick', carril: -600, r: 34, color: PALETA.neon.naranja, brillo: 0.8, largo: 0, radio: 19, desfase: 140 },
  { pista: 'snare', carril: 300, r: 31, color: PALETA.verde, brillo: 0.8, largo: 0, radio: 16, desfase: -60 },
  { pista: 'hat', carril: 600, r: 27, color: PALETA.neon.cian, brillo: 0.8, largo: 0, radio: 13, desfase: 80 },
];

type V = { x: number; y: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
const len = (a: V) => Math.hypot(a.x, a.y);

/** Velocidad común de descenso (u/s): lenta en la intro (todas a la vista), rápida cuando entra la percusión. */
const velDescenso = (t: number) => {
  const a = 6.0, b = 8.0;
  if (t <= a) return 110;
  if (t >= b) return 220;
  const s = (t - a) / (b - a);
  return 110 + 110 * s * s * (3 - 2 * s);
};
/** Línea de descenso y_c(t) = ∫ v (integrada numéricamente a 1 ms). */
const crearLinea = (hasta: number) => {
  const paso = 0.001;
  const ys = new Float64Array(Math.ceil(hasta / paso) + 2);
  for (let i = 1; i < ys.length; i++) ys[i] = ys[i - 1] + velDescenso((i - 0.5) * paso) * paso;
  return (t: number) => ys[Math.max(0, Math.min(ys.length - 1, Math.round(t / paso)))];
};

/** Cápsula de una clavija (extremos A, B y radio). */
const extremos = (c: ClavijaSim): [V, V] => {
  const t = { x: -c.ny, y: c.nx };
  return [{ x: c.x - t.x * c.largo, y: c.y - t.y * c.largo }, { x: c.x + t.x * c.largo, y: c.y + t.y * c.largo }];
};
const distSegmento = (p: V, a: V, b: V) => {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const u = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return Math.hypot(p.x - (a.x + ab.x * u), p.y - (a.y + ab.y * u));
};
/** Distancia de un punto a la superficie de la clavija. */
const distClavija = (p: V, c: ClavijaSim) => { const [a, b] = extremos(c); return distSegmento(p, a, b) - c.radio; };
const distClavijas = (c1: ClavijaSim, c2: ClavijaSim) => {
  const [a, b] = extremos(c1);
  let m = Infinity;
  for (let k = 0; k <= 6; k++) { const u = k / 6; m = Math.min(m, distClavija({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, c2)); }
  return m - c1.radio;
};

/** Tras sonar, la clavija se disuelve en chispas (0,3 s): deja de ser sólida. Así una parábola larga puede volver a pasar
 * por donde ya hubo clavijas (las notas largas lanzan alto). */
export const FRAMES_DISOLVER = 18;
const finVida = (c: ClavijaSim) => (c.golpe + FRAMES_DISOLVER) / FPS;

type Muestra = { t: number; x: number; y: number; r: number; b: number };

/** Índice de muestras por franjas de y (100 u) y por instante (para no recorrer 50 mil muestras por candidato). */
class Indice {
  porY = new Map<number, Muestra[]>();
  porT = new Map<number, Muestra[]>();
  agregar(m: Muestra) {
    const ky = Math.floor(m.y / 100), kt = Math.round(m.t * FPS * SUB);
    (this.porY.get(ky) ?? this.porY.set(ky, []).get(ky)!).push(m);
    (this.porT.get(kt) ?? this.porT.set(kt, []).get(kt)!).push(m);
  }
  *cerca(y: number, rango: number) {
    for (let k = Math.floor((y - rango) / 100); k <= Math.floor((y + rango) / 100); k++) { const l = this.porY.get(k); if (l) yield* l; }
  }
  enInstante(t: number) { return this.porT.get(Math.round(t * FPS * SUB)) ?? []; }
}

export type EventoPista = { frame: number; nota?: number; dur?: number; abierto?: boolean };

/** Eventos de cada pista en frames enteros (avisa si alguno no cae justo en un frame). */
export const eventosDe = (p: PartituraRitmo): Record<PistaRitmo, EventoPista[]> => {
  const fpp = (60 / p.bpm) * FPS; // frames por pulso
  const aFrame = (pulso: number) => {
    const f = FRAMES_ENTRADA + pulso * fpp;
    if (Math.abs(f - Math.round(f)) > 1e-6) console.warn(`aviso: el pulso ${pulso} cae entre frames (${f.toFixed(3)}); se redondea`);
    return Math.round(f);
  };
  const ordenar = (l: EventoPista[]) => {
    l.sort((a, b) => a.frame - b.frame);
    for (let i = 1; i < l.length; i++) if (l[i].frame <= l[i - 1].frame) throw new Error('pista con dos eventos en el mismo frame (las pistas son monofónicas)');
    return l;
  };
  const durSeg = (d: number) => (d * 60) / p.bpm;
  const r: Record<PistaRitmo, EventoPista[]> = {
    melodia: ordenar(p.pistas.melodia.map(([m, pu, d]) => ({ frame: aFrame(pu), nota: m, dur: durSeg(d) }))),
    bajo: ordenar(p.pistas.bajo.map(([m, pu, d]) => ({ frame: aFrame(pu), nota: m, dur: durSeg(d) }))),
    kick: [], snare: [], hat: [],
  };
  for (const tipo of ['kick', 'snare', 'hat'] as const) r[tipo] = ordenar(p.pistas.ritmo.filter((e) => e.tipo === tipo).map((e) => ({ frame: aFrame(e.pulso), abierto: e.abierto })));
  return r;
};

export const leerGuion = (rutaGuion: string): GuionRitmo => {
  const crudo = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
  if (crudo.plantilla && crudo.plantilla !== 'ritmo') throw new Error(`el guion es de la plantilla "${crudo.plantilla}", no "ritmo"`);
  const props = crudo.props ?? crudo;
  if (crudo.id && !props.id) props.id = crudo.id;
  return GuionRitmo.parse(props);
};

export const leerPartitura = (nombre: string, raiz = process.cwd()): PartituraRitmo =>
  PartituraRitmo.parse(JSON.parse(fs.readFileSync(path.join(raiz, 'contenido/partituras', `${nombre}.json`), 'utf8')));

/** Genera el nivel. Devuelve el sim completo (sin escribirlo). */
export const generarNivel = (props: GuionRitmo, partitura: PartituraRitmo): SimRitmo => {
  const semilla = props.semilla ?? semillaDesde(`ritmo:${props.id}`);
  const ev = eventosDe(partitura);
  const finalFrame = Math.max(...Object.values(ev).map((l) => l[l.length - 1].frame));
  const duracionFrames = finalFrame + FRAMES_CLIMAX + FRAMES_CIERRE;
  const linea = crearLinea(duracionFrames / FPS + 2);
  const clavijas: ClavijaSim[] = [];
  const golpes: GolpeSim[] = [];
  const bolitas: BolitaSim[] = [];
  const otras = new Indice();
  let avisos = 0;

  CONFIG.forEach((cfg, b) => {
    const lista = ev[cfg.pista];
    /** Un intento completo de la bolita con un azar propio; devuelve sus clavijas, golpes y reparos (no toca lo global). */
    const intentarBolita = (azar: () => number) => {
    const mias: ClavijaSim[] = [];
    const misGolpes: GolpeSim[] = [];
    const reparos: string[] = [];
    const t0 = lista[0].frame / FPS;
    const dtCaida = FRAMES_CAIDA / FPS;
    const xMin = cfg.carril - SEMI_CARRIL, xMax = cfg.carril + SEMI_CARRIL;
    const objetivoY = (t: number) => linea(t) + cfg.desfase;
    // Primer golpe: P_0 en la línea; la repisa está encima, a la altura de una caída libre de 0,5 s.
    let P: V = { x: cfg.carril + (azar() * 2 - 1) * SEMI_CARRIL * 0.6, y: objetivoY(t0) };
    let vIn: V = { x: 0, y: G * dtCaida };
    const repisa = { x: P.x, y: P.y - 0.5 * G * dtCaida * dtCaida, abre: lista[0].frame - FRAMES_CAIDA };
    const propias: Muestra[] = [];
    const propiasIdx = new Indice();
    // Caída desde la repisa (muestras para el chequeo de choques).
    for (let k = 0; k <= FRAMES_CAIDA * SUB; k++) {
      const s = k / (FPS * SUB);
      const m = { t: repisa.abre / FPS + s, x: repisa.x, y: repisa.y + 0.5 * G * s * s, r: cfg.r, b };
      propias.push(m); propiasIdx.agregar(m);
    }
    const segmentos: { t0: number; P: V; v: V }[] = [];

    for (let i = 0; i < lista.length; i++) {
      const ti = lista[i].frame / FPS;
      const ultimo = i === lista.length - 1;
      // Tras el golpe final la bolita sale despedida hacia arriba (fuegos del clímax) durante 1 s.
      const tj = ultimo ? ti + 1.0 : lista[i + 1].frame / FPS;
      const dt = tj - ti;
      const vigentes = clavijas.concat(mias);
      let mejor: { costo: number; viol: number; Pj: V; vOut: V; n: V; e: number; peg: ClavijaSim; muestras: Muestra[]; motivos: string[] } | null = null;
      const intentos = ultimo ? 40 : 160;
      for (let k = 0; k < intentos; k++) {
        // Candidato: x en el carril, con preferencia por cruzar al otro lado (zigzag visible); y cerca de la línea.
        const lado = P.x > cfg.carril ? -1 : 1;
        const x = Math.max(xMin, Math.min(xMax, ultimo
          ? P.x + (azar() * 2 - 1) * 60
          : cfg.carril + lado * azar() * SEMI_CARRIL * (azar() < 0.75 ? 1 : -0.6)));
        const y = ultimo ? P.y - 150 - azar() * 120 : objetivoY(tj) + (azar() * 2 - 1) * 110;
        const Pj = { x, y };
        const vOut = { x: (Pj.x - P.x) / dt, y: (Pj.y - P.y - 0.5 * G * dt * dt) / dt };
        const d = sub(vOut, vIn);
        const ld = len(d);
        if (ld < 1e-6) continue;
        const n = { x: d.x / ld, y: d.y / ld };
        const vin_n = dot(vIn, n), vout_n = dot(vOut, n);
        const e = -vout_n / vin_n;
        let viol = 0;
        const motivos: string[] = [];
        let costo = 0;
        // Choque frontal razonable (ni rasante ni absurdo).
        const rasanteIn = -vin_n / Math.max(1e-6, len(vIn));
        const rasanteOut = vout_n / Math.max(1e-6, len(vOut));
        if (rasanteIn < 0.25) { viol += 1; motivos.push('rasante-in'); }
        if (rasanteOut < 0.2) { viol += 1; motivos.push('rasante-out'); }
        if (!ultimo && !(e > 0.3 && e < 1.7)) { viol += 1; motivos.push(`e=${e.toFixed(2)}`); }
        if (len(vOut) > 3000) { viol += 1; motivos.push('veloz'); }
        const subida = vOut.y < 0 ? (vOut.y * vOut.y) / (2 * G) : 0;
        if (subida > 1000) { viol += 1; motivos.push('subida'); }
        costo += 3 * (e - 0.62) ** 2 + 0.6 * Math.max(0, 0.5 - rasanteIn) + Math.max(0, n.y + 0.35) * 2 - 0.25 * Math.min(Math.abs(Pj.x - P.x), 90) / 90 + subida / 3000;
        // Clavija i: detrás del punto de contacto, según la normal.
        const off = cfg.r + cfg.radio;
        const peg: ClavijaSim = { bolita: b, x: P.x - n.x * off, y: P.y - n.y * off, nx: n.x, ny: n.y, largo: cfg.largo, radio: cfg.radio, golpe: lista[i].frame };
        // (1) contra las otras clavijas
        // (las clavijas se disuelven tras su golpe: dos clavijas chocan solo si conviven en el tiempo — siempre, porque todas existen desde el frame 0)
        for (const c of vigentes) if (Math.abs(c.y - peg.y) < 260 && distClavijas(peg, c) < 8) { viol += 1; motivos.push('clavija-clavija'); }
        // (2) contra la trayectoria de las demás bolitas y la propia anterior (salvo el instante del choque)
        for (const m of otras.cerca(peg.y, 200)) if (m.t < finVida(peg) && distClavija(m, peg) < m.r + 5) { viol += 1; motivos.push('clavija-en-otra'); break; }
        for (const m of propiasIdx.cerca(peg.y, 200)) if (m.t < ti - 0.06 && distClavija(m, peg) < m.r + 5) { viol += 1; motivos.push('clavija-en-propia'); break; }
        // (3) el tramo nuevo no atraviesa clavijas ni bolitas
        const muestras: Muestra[] = [];
        const nS = Math.round(dt * FPS * SUB);
        let choca = false;
        for (let s = 1; s <= nS; s++) {
          const tt = (s / nS) * dt;
          const m = { t: ti + tt, x: P.x + vOut.x * tt, y: P.y + vOut.y * tt + 0.5 * G * tt * tt, r: cfg.r, b };
          muestras.push(m);
          if (choca || tt < 0.03) continue;
          for (const c of vigentes) if (m.t < finVida(c) && Math.abs(c.y - m.y) < 200 && distClavija(m, c) < cfg.r + 3) { choca = true; break; }
        }
        if (choca) { viol += 1; motivos.push('atraviesa'); }
        // bolita contra bolita (mismo instante)
        if (!choca) for (const m of muestras) {
          let junta = false;
          for (const o of otras.enInstante(m.t)) if (Math.hypot(o.x - m.x, o.y - m.y) < o.r + m.r + 6) { junta = true; break; }
          if (junta) { viol += 1; motivos.push('bolita-bolita'); break; }
        }
        if (!mejor || viol < mejor.viol || (viol === mejor.viol && costo < mejor.costo)) mejor = { costo, viol, Pj, vOut, n, e, peg, muestras, motivos };
        if (mejor.viol === 0 && k > 30) break;
      }
      if (!mejor) throw new Error(`sin candidato para ${cfg.pista} #${i}`);
      if (mejor.viol > 0) reparos.push(`${cfg.pista} golpe ${i} (frame ${lista[i].frame}): ${mejor.motivos.join(', ')}`);
      const idx = mias.length;
      mias.push(mejor.peg);
      misGolpes.push({
        frame: lista[i].frame, t: ti, pista: cfg.pista, bolita: b, clavija: idx, x: P.x, y: P.y, nx: mejor.n.x, ny: mejor.n.y,
        nota: lista[i].nota, fuerza: Math.min(1, Math.max(0.2, -dot(vIn, mejor.n) / 1400)),
      });
      segmentos.push({ t0: ti, P, v: mejor.vOut });
      for (const m of mejor.muestras) { propias.push(m); propiasIdx.agregar(m); }
      vIn = { x: mejor.vOut.x, y: mejor.vOut.y + G * dt };
      P = mejor.Pj;
    }
    // Muestreo por frame: repisa → caída → parábolas exactas entre golpes.
    const cuadros: number[] = [];
    for (let f = 0; f < duracionFrames; f++) {
      const t = f <= finalFrame ? f / FPS : (finalFrame + (f - finalFrame) * LENTO_CLIMAX) / FPS;
      let x: number, y: number;
      if (f <= repisa.abre) { x = repisa.x; y = repisa.y; }
      else if (f < lista[0].frame) { const s = t - repisa.abre / FPS; x = repisa.x; y = repisa.y + 0.5 * G * s * s; }
      else {
        let k = segmentos.length - 1;
        while (k > 0 && segmentos[k].t0 > t + 1e-9) k--;
        const sg = segmentos[k];
        const s = t - sg.t0;
        x = sg.P.x + sg.v.x * s; y = sg.P.y + sg.v.y * s + 0.5 * G * s * s;
      }
      cuadros.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    }
    return { mias, misGolpes, reparos, propias, bolita: { pista: cfg.pista, color: cfg.color, r: cfg.r, brillo: cfg.brillo, carril: cfg.carril, repisa, cuadros } as BolitaSim };
    };
    // Varios intentos con azar distinto (determinista): se queda el primero sin reparos o el que tenga menos.
    let elegido: ReturnType<typeof intentarBolita> | null = null;
    for (let intento = 0; intento < 16; intento++) {
      const r = intentarBolita(crearAzar((semilla ^ Math.imul(b + 1, 0x9e3779b1) ^ Math.imul(intento + 1, 0x85ebca6b)) >>> 0));
      if (!elegido || r.reparos.length < elegido.reparos.length) elegido = r;
      if (r.reparos.length === 0) break;
    }
    const e = elegido!;
    for (const msg of e.reparos) console.warn(`aviso: ${msg}`);
    avisos += e.reparos.length;
    const base = clavijas.length;
    clavijas.push(...e.mias);
    for (const g of e.misGolpes) golpes.push({ ...g, clavija: g.clavija + base });
    bolitas.push(e.bolita);
    for (const m of e.propias) otras.agregar(m);
  });

  // Cámara: sigue al centroide con dos pasadas de suavizado exponencial (≈ 0,25 s de retraso); se congela en el clímax.
  const camara: number[] = [];
  const tau = 0.18, alfa = 1 - Math.exp(-1 / (FPS * tau));
  let y1 = NaN, y2 = NaN, x1 = NaN;
  for (let f = 0; f < duracionFrames; f++) {
    const ff = Math.min(f, finalFrame);
    let cx = 0, cy = 0;
    for (const bo of bolitas) { cx += bo.cuadros[ff * 2]; cy += bo.cuadros[ff * 2 + 1]; }
    cx /= bolitas.length; cy /= bolitas.length;
    // mira un poco por delante (hacia abajo) para que se vea adónde van
    const objetivo = cy + 40;
    if (Number.isNaN(y1)) { y1 = y2 = objetivo; x1 = cx * 0.15; }
    y1 += alfa * (objetivo - y1);
    y2 += alfa * (y1 - y2);
    x1 += alfa * 0.3 * (cx * 0.15 - x1);
    camara.push(Math.round(x1 * 100) / 100, Math.round(y2 * 100) / 100);
  }
  golpes.sort((a, b) => a.frame - b.frame || a.bolita - b.bolita);
  console.log(`nivel: ${golpes.length} golpes, ${clavijas.length} clavijas, ${avisos} con reparos, semilla ${semilla}`);
  return {
    version: 1, id: props.id, fps: FPS, duracionFrames, finalFrame, lentoClimax: LENTO_CLIMAX, mundo: { ancho: ANCHO_MUNDO, gravedad: G },
    camara, bolitas, clavijas, golpes, semillaUsada: semilla,
  };
};
