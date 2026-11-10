/**
 * Plantilla "maquina": la PARTITURA manda. Para cada nota se calcula HACIA ATRÁS cuándo abrir la compuerta:
 *   t_suelta = t_golpe − √(2·Δy / g)
 * (caída libre desde la compuerta hasta el punto de contacto con la lámina, el bajo, el bombo o el platillo), así el
 * contacto cae en el frame exacto del evento. Después del golpe la canica rebota hacia la cámara (restitución de la
 * pieza), cae en la bandeja o en el depósito, rueda, gira en el embudo y vuelve al depósito: trayectorias analíticas
 * por tramos, muestreadas por frame. Entre las variantes (carril de la bandeja, tiempo en el embudo, desvío lateral)
 * se elige la que menos se toca con las demás canicas. También se calcula la cámara (planos por pulso).
 * Nada de Math.random: todo sale de crearAzar(semilla).
 */
import fs from 'node:fs';
import path from 'node:path';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import {
  BAJO, BANDEJA, BOMBO, CARRILES_BANDEJA, COLORES_VIBRA, DEPOSITO, EMBUDO, G, NOTAS_BAJO, NOTAS_VIBRA, PLATILLO, R_CANICA, VIBRA,
  contacto, largoLamina, xBajo, xLamina, yBandeja, type Pieza,
} from '../src/plantillas/maquina/geometria';
import {
  GuionMaquina, PartituraMaquina, type CanicaMaquina, type CompuertaMaquina, type GolpeMaquina, type PistaMaquina, type SimMaquina,
  type SonidoMaquina,
} from '../src/plantillas/maquina/guion';

/** Segundos antes del pulso 0 (el bombo de la cuenta cae a los 0,4 s: la máquina ya anda en el frame 0). */
export const ENTRADA = 0.4;
/** Tras el último golpe: el acorde suena, la cámara se abre al plano general; luego 1,2 s de cierre de marca. */
export const COLA = 3.2;
export const SEG_CIERRE = 1.2;

export const COLOR_BAJO = '#B8742F';
export const COLOR_BOMBO = '#E0343A';
export const COLOR_PLATILLO = '#E8C25A';

type V3 = { x: number; y: number; z: number };
type Tramo = { t0: number; t1: number; pos: (t: number) => V3 };

export const leerGuion = (rutaGuion: string): GuionMaquina => {
  const crudo = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
  if (crudo.plantilla && crudo.plantilla !== 'maquina') throw new Error(`el guion es de la plantilla "${crudo.plantilla}", no "maquina"`);
  const props = crudo.props ?? crudo;
  if (crudo.id && !props.id) props.id = crudo.id;
  return GuionMaquina.parse(props);
};
export const leerPartitura = (nombre: string, raiz = process.cwd()): PartituraMaquina =>
  PartituraMaquina.parse(JSON.parse(fs.readFileSync(path.join(raiz, 'contenido/partituras', `${nombre}.json`), 'utf8')));

/** Eventos de la partitura en frames (redondeo al frame más cercano; el audio se sintetiza en ESE frame). */
export const eventosDe = (p: PartituraMaquina, fps: number) => {
  const fpp = (60 / p.bpm) * fps;
  const aFrame = (pulso: number) => Math.round(ENTRADA * fps + pulso * fpp);
  const durSeg = (d: number) => (d * 60) / p.bpm;
  const ev: Omit<GolpeMaquina, 'canica'>[] = [];
  for (const [m, pu, d] of p.pistas.melodia) {
    const idx = NOTAS_VIBRA.indexOf(m as (typeof NOTAS_VIBRA)[number]);
    if (idx < 0) throw new Error(`la nota ${m} no está en el vibráfono (${NOTAS_VIBRA.join(', ')})`);
    ev.push({ pista: 'melodia', pieza: 'lamina', idx, frame: aFrame(pu), nota: m, dur: durSeg(d) });
  }
  for (const [m, pu, d] of p.pistas.bajo) {
    const idx = NOTAS_BAJO.indexOf(m as (typeof NOTAS_BAJO)[number]);
    if (idx < 0) throw new Error(`la nota ${m} no está en el bajo (${NOTAS_BAJO.join(', ')})`);
    ev.push({ pista: 'bajo', pieza: 'bajo', idx, frame: aFrame(pu), nota: m, dur: durSeg(d) });
  }
  for (const r of p.pistas.ritmo) {
    ev.push({ pista: r.tipo, pieza: r.tipo, idx: 0, frame: aFrame(r.pulso), ...(r.acento ? { acento: true } : {}), ...(r.abierto ? { abierto: true } : {}) });
  }
  ev.sort((a, b) => a.frame - b.frame || a.pista.localeCompare(b.pista) || a.idx - b.idx);
  // Una misma pieza no puede recibir dos canicas en el mismo frame.
  const vistos = new Set<string>();
  for (const e of ev) {
    const k = `${e.pieza}:${e.idx}:${e.frame}`;
    if (vistos.has(k)) throw new Error(`dos golpes a la vez en ${e.pieza} ${e.idx} (frame ${e.frame})`);
    vistos.add(k);
  }
  return ev;
};

/** Vuelo balístico desde p0 con velocidad v0 hasta que y = yObjetivo (bajando). Devuelve el tiempo. */
const tiempoHasta = (p0: V3, v0: V3, yObjetivo: number) => (v0.y + Math.sqrt(v0.y * v0.y + 2 * G * (p0.y - yObjetivo))) / G;
const balistico = (p0: V3, v0: V3, t0: number) => (t: number): V3 => {
  const s = t - t0;
  return { x: p0.x + v0.x * s, y: p0.y + v0.y * s - 0.5 * G * s * s, z: p0.z + v0.z * s };
};

/** Aterrizaje en la pila del depósito: un rebote corto y se hunde rodando hacia la noria (fondo). */
const tramosDeposito = (p: V3, v: V3, t: number, sonidos: SonidoMaquina[], deriva = 0): Tramo[] => {
  const yP = DEPOSITO.yPila + R_CANICA;
  const v1 = { x: v.x * 0.45, y: Math.abs(v.y) * 0.22, z: v.z * 0.35 };
  const tb = (2 * v1.y) / G;
  const p1 = { x: p.x + v1.x * tb, y: yP, z: p.z + v1.z * tb };
  sonidos.push({ t, tipo: 'deposito', x: p.x, vol: Math.min(1, Math.abs(v.y) / 400) });
  const hundir = 0.55;
  const dx = Math.sin(deriva) * 7, dz = -Math.abs(Math.cos(deriva)) * 7;
  return [
    { t0: t, t1: t + tb, pos: balistico({ ...p, y: yP }, v1, t) },
    { t0: t + tb, t1: t + tb + hundir, pos: (tt) => { const u = (tt - t - tb) / hundir; return { x: p1.x + dx * u, y: yP - 2.4 * R_CANICA * u * u, z: p1.z + dz * u }; } },
  ];
};

/** Recorrido de una canica tras golpear (sin la caída previa). Variante: carril de bandeja, tiempo en el embudo, desvío. */
const despuesDelGolpe = (
  pieza: Pieza, c: V3, vIn: number, tg: number, az: () => number,
  variante: { carril: number; tEmbudo: number; desvio: number },
  sonidos: SonidoMaquina[],
): Tramo[] => {
  const tr: Tramo[] = [];
  if (pieza === 'lamina') {
    // Rebote corto hacia la cámara: cae en la bandeja delantera, en el carril elegido.
    const vy = (0.28 + 0.06 * az()) * vIn;
    const vx = variante.desvio;
    let tl = 0.2, xl = c.x;
    for (let k = 0; k < 6; k++) { // aterriza donde y = yBandeja(x) + R (x depende de tl)
      xl = c.x + vx * tl;
      tl = tiempoHasta(c, { x: vx, y: vy, z: 0 }, yBandeja(xl) + R_CANICA);
    }
    const vz = (variante.carril - c.z) / tl;
    const v0 = { x: vx, y: vy, z: vz };
    tr.push({ t0: tg, t1: tg + tl, pos: balistico(c, v0, tg) });
    const ta = tg + tl;
    sonidos.push({ t: ta, tipo: 'bandeja', x: xl, vol: 0.6 + 0.4 * az() });
    // Rueda bandeja abajo (aceleración de rodadura 5/7·g·senθ); los últimos 9 cm se acerca al carril del embudo.
    const sen = BANDEJA.pendiente / Math.hypot(1, BANDEJA.pendiente);
    const a = (5 / 7) * G * sen;
    const v0x = Math.max(4, vx * 0.6);
    const dist = EMBUDO.x - xl;
    const tr2 = (-v0x + Math.sqrt(v0x * v0x + 2 * a * dist)) / a;
    const zEntrada = EMBUDO.z + EMBUDO.rBoca - 1.5;
    const zEn = (x: number) => {
      const u = Math.max(0, Math.min(1, (x - (EMBUDO.x - 12)) / 12));
      return variante.carril + (zEntrada - variante.carril) * u * u * (3 - 2 * u);
    };
    tr.push({ t0: ta, t1: ta + tr2, pos: (t) => { const s = t - ta; const x = xl + v0x * s + 0.5 * a * s * s; return { x, y: yBandeja(x) + R_CANICA, z: zEn(x) }; } });
    const te0 = ta + tr2;
    const vEnt = v0x + a * tr2;
    sonidos.push({ t: te0, tipo: 'embudo', x: EMBUDO.x, vol: 0.7 });
    // Embudo: espiral hacia el centro. R(u) baja de R0 a R1; la rapidez sube (∝ R^-0,5); y sobre el cono.
    const R0 = zEntrada - EMBUDO.z, R1 = EMBUDO.rFondo + R_CANICA * 0.6;
    const Te = variante.tEmbudo;
    const pasos = 600;
    const ang = new Float64Array(pasos + 1);
    const radio = (u: number) => R1 + (R0 - R1) * Math.pow(1 - u, 1.35);
    for (let k = 1; k <= pasos; k++) {
      const u = (k - 0.5) / pasos;
      const R = radio(u);
      const v = vEnt * Math.sqrt(R0 / R);
      ang[k] = ang[k - 1] + (v / R) * (Te / pasos);
    }
    const pend = (EMBUDO.yBoca - EMBUDO.yFondo) / (EMBUDO.rBoca - EMBUDO.rFondo);
    const enEmbudo = (t: number): V3 => {
      const u = Math.max(0, Math.min(1, (t - te0) / Te));
      const k = Math.min(pasos, Math.floor(u * pasos));
      const phi = Math.PI / 2 - ang[k];
      const R = radio(u);
      return { x: EMBUDO.x + R * Math.cos(phi), y: EMBUDO.yFondo + (R - EMBUDO.rFondo) * pend + R_CANICA * 1.25, z: EMBUDO.z + R * Math.sin(phi) };
    };
    tr.push({ t0: te0, t1: te0 + Te, pos: enEmbudo });
    // Cae por el tubo de vidrio hasta el depósito.
    const pf = enEmbudo(te0 + Te);
    const tc0 = te0 + Te;
    const yP = DEPOSITO.yPila + R_CANICA;
    const tcaida = Math.sqrt((2 * (pf.y - yP)) / G);
    tr.push({ t0: tc0, t1: tc0 + tcaida, pos: (t) => {
      const s = t - tc0; const u = Math.min(1, s / 0.06);
      return { x: pf.x + (EMBUDO.x - pf.x) * u, y: pf.y - 0.5 * G * s * s, z: pf.z + (EMBUDO.z - pf.z) * u };
    } });
    tr.push(...tramosDeposito({ x: EMBUDO.x, y: yP, z: EMBUDO.z }, { x: 0, y: -G * tcaida, z: 4 }, tc0 + tcaida, sonidos, (az() - 0.5) * 3));
    return tr;
  }
  // Bajo, bombo y platillo: rebote hacia la cámara y caída al depósito.
  let v0: V3;
  if (pieza === 'bajo') v0 = { x: variante.desvio, y: (0.28 + 0.06 * az()) * vIn, z: 58 + 10 * az() };
  else if (pieza === 'bombo') v0 = { x: 9 + variante.desvio * 0.5, y: (0.53 + 0.05 * az()) * vIn, z: 40 + 6 * az() };
  else {
    // Reflexión sobre la normal del platillo con restitución 0,4 (la componente tangencial se conserva).
    const { n } = PLATILLO;
    const e = 0.38 + 0.05 * az();
    const vn = -vIn * n.y; // v_in · n (v_in = (0, −vIn, 0))
    v0 = { x: -(1 + e) * vn * n.x + variante.desvio * 0.4, y: -vIn - (1 + e) * vn * n.y, z: -(1 + e) * vn * n.z };
  }
  const yP = DEPOSITO.yPila + R_CANICA;
  const tl = tiempoHasta(c, v0, yP);
  tr.push({ t0: tg, t1: tg + tl, pos: balistico(c, v0, tg) });
  const pl = balistico(c, v0, tg)(tg + tl);
  tr.push(...tramosDeposito(pl, { x: v0.x, y: v0.y - G * tl, z: v0.z }, tg + tl, sonidos, (az() - 0.5) * 3));
  return tr;
};

/** ¿Se ve la canica? (no cuenta hundida en la pila ni en el fondo del embudo de latón, que es opaco). */
const visible = (p: V3) => p.y > DEPOSITO.yPila + R_CANICA - 0.6
  && !(Math.hypot(p.x - EMBUDO.x, p.z - EMBUDO.z) < EMBUDO.rBoca + 1 && p.y < EMBUDO.yBoca - 5 && p.y > EMBUDO.yFondo - 25);

const muestrear = (tramos: Tramo[], f0: number, f1: number, fps: number) => {
  const pos: number[] = [];
  let k = 0;
  for (let f = f0; f <= f1; f++) {
    const t = f / fps;
    while (k < tramos.length - 1 && t >= tramos[k].t1 - 1e-9) k++;
    const p = tramos[k].pos(Math.min(t, tramos[k].t1));
    pos.push(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100);
  }
  return pos;
};

// ---------- Cámara ----------

type Pose = { p: V3; t: V3; fov: number };
type Plano = { nombre: string; desde: number; hasta: number; corte?: boolean; pose: (t: number, u: number) => Pose };
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: V3, b: V3, u: number): V3 => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) });
const suave = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
const suave5 = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * k * (k * (6 * k - 15) + 10); };

/** Generador de la máquina completa. */
export const generarMaquina = (props: GuionMaquina, partitura: PartituraMaquina): SimMaquina => {
  const fps = props.fps ?? 60;
  const semilla = props.semilla ?? semillaDesde(`maquina:${props.id}`);
  const az = crearAzar(semilla);
  const evs = eventosDe(partitura, fps);
  const finalFrame = evs[evs.length - 1].frame;
  const duracionFrames = Math.round(finalFrame + (COLA + SEG_CIERRE) * fps);
  const pulso = (p: number) => ENTRADA + (p * 60) / partitura.bpm;

  // Compuertas: una por lámina, una por barra de bajo, una para el bombo, una para el platillo.
  const compuertas: CompuertaMaquina[] = [];
  const idCompuerta = new Map<string, number>();
  const agregarCompuerta = (pieza: Pieza, idx: number, color: string, yTope: number) => {
    const c = contacto(pieza, idx);
    idCompuerta.set(`${pieza}:${idx}`, compuertas.length);
    compuertas.push({ pieza, idx, x: c.x, y: c.yCompuerta, z: c.z, yTope, color, sueltas: [] });
  };
  NOTAS_VIBRA.forEach((_, i) => agregarCompuerta('lamina', i, COLORES_VIBRA[i], VIBRA.yCargador));
  NOTAS_BAJO.forEach((_, i) => agregarCompuerta('bajo', i, COLOR_BAJO, BAJO.yCargador));
  agregarCompuerta('bombo', 0, COLOR_BOMBO, BOMBO.yCargador);
  agregarCompuerta('platillo', 0, COLOR_PLATILLO, PLATILLO.yCargador);

  const colorDe = (pieza: Pieza, idx: number) => compuertas[idCompuerta.get(`${pieza}:${idx}`)!].color;

  // Canicas "de antes": la máquina ya está andando en el frame 0 (hay canicas en la bandeja, el embudo y el aire).
  const fantasmas: Omit<GolpeMaquina, 'canica'>[] = [];
  const tiempos = [-2.4, -2.0, -1.7, -1.35, -1.1, -0.8, -0.55, -0.3];
  tiempos.forEach((t, k) => fantasmas.push({ pista: 'melodia', pieza: 'lamina', idx: [5, 2, 6, 3, 0, 7, 4, 1][k], frame: Math.round(t * fps) }));
  fantasmas.push({ pista: 'bajo', pieza: 'bajo', idx: 1, frame: Math.round(-0.35 * fps) });
  fantasmas.push({ pista: 'platillo', pieza: 'platillo', idx: 0, frame: Math.round(-0.2 * fps) });

  const canicas: CanicaMaquina[] = [];
  const golpes: GolpeMaquina[] = [];
  const sonidos: SonidoMaquina[] = [];
  /** Posiciones ya ocupadas por frame (para elegir la variante que menos se toca con las demás). */
  const ocupado = new Map<number, V3[]>();
  let solapes = 0;

  const todos = [...fantasmas.map((e) => ({ e, fantasma: true })), ...evs.map((e) => ({ e, fantasma: false }))];
  for (const { e, fantasma } of todos) {
    const c = contacto(e.pieza, e.idx);
    const tg = e.frame / fps;
    const caida = Math.sqrt((2 * (c.yCompuerta - c.y)) / G);
    const ts = tg - caida;
    const vIn = G * caida;
    const tramoCaida: Tramo = { t0: ts, t1: tg, pos: (t) => ({ x: c.x, y: c.yCompuerta - 0.5 * G * (t - ts) ** 2, z: c.z }) };
    // Variantes: carril de la bandeja × tiempo en el embudo × desvío lateral. Gana la que menos frames se toca.
    const variantes: { carril: number; tEmbudo: number; desvio: number }[] = [];
    const carriles = e.pieza === 'lamina' ? CARRILES_BANDEJA : [0];
    const tEmb = e.pieza === 'lamina' ? [1.5, 1.25, 1.75, 1.05, 2.0, 1.4, 1.62, 2.3] : [0];
    const desvios = [(az() - 0.5) * 8, (az() - 0.5) * 16, (az() - 0.5) * 24];
    for (const carril of carriles) for (const tEmbudo of tEmb) for (const desvio of desvios) variantes.push({ carril, tEmbudo, desvio });
    let mejor: { tramos: Tramo[]; sons: SonidoMaquina[]; choques: number; f0: number; f1: number; pos: number[] } | null = null;
    for (const v of variantes) {
      const sons: SonidoMaquina[] = [];
      const azV = crearAzar(semilla ^ Math.imul(canicas.length + 1, 0x9e3779b1));
      const tramos = [tramoCaida, ...despuesDelGolpe(e.pieza, c, vIn, tg, azV, v, sons)];
      const f0 = Math.max(0, Math.ceil(ts * fps - 1e-6));
      const f1 = Math.min(duracionFrames - 1, Math.floor(tramos[tramos.length - 1].t1 * fps));
      if (f1 < f0) { mejor = { tramos, sons, choques: 0, f0, f1, pos: [] }; break; }
      const pos = muestrear(tramos, f0, f1, fps);
      let choques = 0;
      for (let f = f0; f <= f1; f++) {
        const k = (f - f0) * 3;
        const yo = { x: pos[k], y: pos[k + 1], z: pos[k + 2] };
        if (!visible(yo)) continue;
        for (const o of ocupado.get(f) ?? []) if (visible(o) && Math.hypot(o.x - yo.x, o.y - yo.y, o.z - yo.z) < 2 * R_CANICA * 0.98) choques++;
      }
      if (!mejor || choques < mejor.choques) mejor = { tramos, sons, choques, f0, f1, pos };
      if (choques === 0) break;
    }
    const m = mejor!;
    if (m.f1 < m.f0) continue; // terminó antes del frame 0
    solapes += m.choques;
    for (let f = m.f0; f <= m.f1; f++) {
      const k = (f - m.f0) * 3;
      const l = ocupado.get(f) ?? [];
      l.push({ x: m.pos[k], y: m.pos[k + 1], z: m.pos[k + 2] });
      ocupado.set(f, l);
    }
    const ic = idCompuerta.get(`${e.pieza}:${e.idx}`)!;
    compuertas[ic].sueltas.push(Math.round(ts * 10000) / 10000);
    const indice = canicas.length;
    canicas.push({
      pieza: e.pieza, idx: e.idx, color: colorDe(e.pieza, e.idx), suelta: Math.round(ts * 10000) / 10000,
      golpe: fantasma ? null : e.frame, desde: m.f0, pos: m.pos, compuerta: ic,
    });
    if (!fantasma) {
      golpes.push({ ...e, canica: indice });
      sonidos.push({ t: ts, tipo: 'compuerta', x: c.x, vol: 0.5 }, ...m.sons);
    } else sonidos.push(...m.sons.filter((s) => s.t > 0));
  }
  for (const c of compuertas) c.sueltas.sort((a, b) => a - b);

  // Trinquete de la noria: un "clac" por pulso (un bolsillo pasa por el trinquete en cada negra).
  for (let p = 0; pulso(p) < duracionFrames / fps; p++) if (pulso(p) > 0.05) sonidos.push({ t: pulso(p), tipo: 'noria', x: 0, vol: p % 4 === 0 ? 1 : 0.7 });
  sonidos.sort((a, b) => a.t - b.t);

  // ---------- Cámara: planos por pulso con fundidos suaves (travellings) ----------
  const mel = golpes.filter((g) => g.pista === 'melodia');
  /** x de la melodía suavizada (mira un poco adelante): la cámara de primer plano sigue a las láminas que suenan. */
  const xMelodia = (() => {
    const n = duracionFrames;
    const bruto = new Float64Array(n);
    let j = 0;
    for (let f = 0; f < n; f++) {
      const t = f / fps + 0.25;
      while (j < mel.length - 1 && mel[j + 1].frame / fps <= t) j++;
      // promedio de las notas en [t − 0,3, t + 0,5]
      let s = 0, w = 0;
      for (const g of mel) { const d = g.frame / fps - t; if (d > -0.3 && d < 0.5) { const p = 1 - Math.abs(d - 0.1) / 0.6; s += xLamina(g.idx) * p; w += p; } }
      bruto[f] = w > 0 ? s / w : (f > 0 ? bruto[f - 1] : xLamina(mel[0]?.idx ?? 4));
    }
    const a = 1 - Math.exp(-1 / (fps * 0.45));
    const s1 = new Float64Array(n), s2 = new Float64Array(n);
    s1[0] = s2[0] = bruto[0];
    for (let f = 1; f < n; f++) { s1[f] = s1[f - 1] + a * (bruto[f] - s1[f - 1]); s2[f] = s2[f - 1] + a * (s1[f] - s2[f - 1]); }
    return (t: number) => s2[Math.max(0, Math.min(n - 1, Math.round(t * fps)))];
  })();
  const T = duracionFrames / fps;
  const P = (p: number) => pulso(p);
  const general = (t0: number, t1: number): Plano['pose'] => (_t, u) => ({
    p: lerp3({ x: 95, y: 150, z: 400 }, { x: 70, y: 135, z: 360 }, suave(u)),
    t: { x: -2, y: 108, z: 0 }, fov: 32,
  });
  const planos: Plano[] = [
    // 0. Plano general: la máquina entera ya andando (gancho).
    { nombre: 'general', desde: 0, hasta: P(3.2), pose: general(0, P(3.2)) },
    // 1. Primer plano de las láminas: sigue a la melodía (frase 1, primera mitad).
    { nombre: 'laminas', desde: P(3.2), hasta: P(10), pose: (t, u) => {
      const x = xMelodia(t);
      return { p: { x: x + 14 - 10 * u, y: 150, z: 78 }, t: { x, y: 126, z: 4 }, fov: 30 };
    } },
    // 2. Bajada al bajo de madera y el bombo (travelling lateral).
    { nombre: 'bajo-bombo', desde: P(10), hasta: P(17.5), pose: (_t, u) => ({
      p: lerp3({ x: -46, y: 104, z: 196 }, { x: 34, y: 88, z: 190 }, suave(u)),
      t: lerp3({ x: -30, y: 60, z: 10 }, { x: 16, y: 48, z: 10 }, suave(u)), fov: 34,
    }) },
    // 3. Grúa: noria → ascensor → arriba (el ciclo).
    { nombre: 'noria-ascensor', desde: P(17.5), hasta: P(24), corte: true, pose: (_t, u) => ({
      p: lerp3({ x: -10, y: 52, z: 150 }, { x: -40, y: 196, z: 120 }, suave5(u)),
      t: lerp3({ x: -8, y: 56, z: -18 }, { x: -50, y: 196, z: 0 }, suave5(u)), fov: 36,
    }) },
    // 4. Riel superior → espiral → riel de reparto (de izquierda a derecha y abajo).
    { nombre: 'espiral', desde: P(24), hasta: P(30), pose: (_t, u) => ({
      p: lerp3({ x: -10, y: 205, z: 115 }, { x: 34, y: 168, z: 95 }, suave(u)),
      t: lerp3({ x: 10, y: 203, z: 0 }, { x: 30, y: 168, z: 4 }, suave(u)), fov: 36,
    }) },
    // 5. Contrapicado del vibráfono: compuertas abriéndose arriba y canicas cayendo.
    { nombre: 'contrapicado', desde: P(30), hasta: P(34), pose: (t, u) => {
      const x = xMelodia(t) * 0.6;
      return { p: { x: x - 30 + 24 * u, y: 104, z: 92 }, t: { x, y: 130, z: 0 }, fov: 38 };
    } },
    // 6. Órbita en 3/4: se ve la profundidad de la máquina (frase 3).
    { nombre: 'orbita', desde: P(34), hasta: P(44), corte: true, pose: (_t, u) => {
      const a = lerp(0.62, -0.5, suave(u));
      const r = 290;
      return { p: { x: Math.sin(a) * r, y: 150 - 20 * u, z: Math.cos(a) * r }, t: { x: 0, y: 105, z: 0 }, fov: 34 };
    } },
    // 7. Bombo y platillo de cerca.
    { nombre: 'percusion', desde: P(44), hasta: P(50), pose: (_t, u) => ({
      p: lerp3({ x: 40, y: 92, z: 92 }, { x: 0, y: 84, z: 98 }, suave(u)),
      t: lerp3({ x: 22, y: 46, z: 10 }, { x: 8, y: 54, z: 8 }, suave(u)), fov: 34,
    }) },
    // 8. Frase 4 con segunda voz: cenital suave de las láminas (dos canicas a la vez).
    { nombre: 'laminas-arriba', desde: P(50), hasta: P(60), corte: true, pose: (t, u) => {
      const x = xMelodia(t);
      return { p: { x: x + 6, y: 178 - 6 * u, z: 62 }, t: { x, y: 121, z: 6 }, fov: 32 };
    } },
    // 9. El vibráfono entero para el acorde final.
    { nombre: 'acorde', desde: P(60), hasta: P(64.6), pose: (_t, u) => ({
      p: lerp3({ x: 18, y: 150, z: 175 }, { x: 8, y: 142, z: 160 }, suave(u)), t: { x: 2, y: 122, z: 4 }, fov: 34,
    }) },
    // 10. Se abre al plano general.
    { nombre: 'final', desde: P(64.6), hasta: T + 1, pose: (_t, u) => ({
      p: lerp3({ x: 8, y: 142, z: 175 }, { x: -60, y: 140, z: 410 }, suave(Math.min(1, u * 1.6))), t: lerp3({ x: 2, y: 122, z: 4 }, { x: 0, y: 106, z: 0 }, suave(Math.min(1, u * 1.6))), fov: 32,
    }) },
  ];
  const FUNDIDO = 0.8;
  const evaluar = (pl: Plano, t: number) => pl.pose(t, Math.max(0, Math.min(1, (t - pl.desde) / (pl.hasta - pl.desde))));
  const camara: number[] = [];
  const marcas: { desde: number; nombre: string }[] = [];
  let ultimo = '';
  for (let f = 0; f < duracionFrames; f++) {
    const t = f / fps;
    let i = planos.findIndex((pl) => t >= pl.desde && t < pl.hasta);
    if (i < 0) i = planos.length - 1;
    const pl = planos[i];
    let pose = evaluar(pl, t);
    const sig = planos[i + 1];
    // Fundido hacia el plano siguiente en los últimos FUNDIDO s (salvo que el siguiente entre por corte).
    if (sig && !sig.corte && t > pl.hasta - FUNDIDO) {
      const w = suave5((t - (pl.hasta - FUNDIDO)) / FUNDIDO);
      const b = evaluar(sig, t);
      pose = { p: lerp3(pose.p, b.p, w), t: lerp3(pose.t, b.t, w), fov: lerp(pose.fov, b.fov, w) };
    }
    if (pl.nombre !== ultimo) { marcas.push({ desde: f, nombre: pl.nombre }); ultimo = pl.nombre; }
    camara.push(...[pose.p.x, pose.p.y, pose.p.z, pose.t.x, pose.t.y, pose.t.z, pose.fov].map((v) => Math.round(v * 100) / 100));
  }

  return {
    version: 1, id: props.id, fps, duracionFrames, finalFrame, bpm: partitura.bpm, entrada: ENTRADA,
    golpes, canicas, compuertas, sonidos, camara, planos: marcas, solapes,
  };
};

// CLI de diagnóstico: npx tsx scripts/simular-maquina.mts <guion.json>
if (import.meta.url === `file://${process.argv[1]}`) {
  const props = leerGuion(process.argv[2]);
  const p = leerPartitura(props.partitura);
  const t0 = Date.now();
  const sim = generarMaquina(props, p);
  const porPista = (pi: PistaMaquina) => sim.golpes.filter((g) => g.pista === pi).length;
  console.log(`${sim.golpes.length} golpes (melodía ${porPista('melodia')}, bajo ${porPista('bajo')}, bombo ${porPista('bombo')}, platillo ${porPista('platillo')}), ${sim.canicas.length} canicas, ${sim.solapes} frames-canica con solape, ${(sim.duracionFrames / sim.fps).toFixed(1)} s, ${Date.now() - t0} ms`);
  console.log(sim.planos.map((pl) => `${(pl.desde / sim.fps).toFixed(1)} s ${pl.nombre}`).join(' · '));
}

