/**
 * Plantilla "ritmo": NIVEL GENERADO DESDE LA MÚSICA. La partitura manda: para cada pista (melodía, bajo, bombo,
 * caja, platillo) hay una bolita, y cada evento musical t_i es un choque contra una clavija colocada de antemano
 * justo donde la bolita estará en t_i. Entre golpes la bolita hace una FIGURA (scripts/lib/figuras-ritmo.mts:
 * parábola, riel curvo, rizo, zigzag entre paredes, columpio, hélice 3D, trampolín, portal o cruce con otra bolita)
 * que dura exactamente Δt, así que el choque cae en el frame exacto del evento.
 * Reglas de variedad: nunca la misma figura dos veces seguidas en una bolita; cada bolita usa ≥ 4 figuras.
 *
 * Para cada golpe i (punto P_i, velocidad de llegada v_in):
 *   1. se elige la figura (azar por semilla, las menos usadas primero) y la figura propone P_{i+1} (en el carril,
 *      cerca de la "línea de descenso" común) y la velocidad de salida v_out;
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
  GuionRitmo, PartituraRitmo, type EstiloRitmo, type BolitaSim, type ClavijaSim, type FiguraRitmo, type GolpeSim, type ObjetoSim,
  type PistaRitmo, type SimRitmo, type TramoSim,
} from '../src/plantillas/ritmo/guion';
import { CONSTRUCTORES, DT_MIN, PESO, vParab, type Candidato, type Contexto, type Solido, type Tramo } from './lib/figuras-ritmo.mjs';

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

/** Gravedad (u/s²; la vista mide 1100 u de ancho). 'figuras': 2800. 'plano': la de v1 a escala de la cámara nueva
 * (2800 · 1100/1500 ≈ 2050), así las parábolas de las notas largas se ven como en el Canon v1 y caben en el cuadro. */
const GRAVEDAD = { figuras: 2800, plano: 2050 } as const;
/** Escalonado vertical por estilo: en 'plano' las franjas ya separan a las bolitas y los arcos altos necesitan alto. */
const ESCALA_DESFASE = { figuras: 1, plano: 0.4 } as const;
let G = 2800;
/** Límites verticales del centro respecto de la cámara (el cuadro mide ±977 u): arriba la bolita entera dentro del
 * cuadro, abajo sin meterse bajo el texto inferior (centro a 568 u bajo la cámara). */
const ARRIBA_MAX = 970, ABAJO_MAX = 560;
/** Ruido vertical del objetivo de cada golpe alrededor de su línea (u). */
const RUIDO_Y = 90;

/**
 * Altura de cada bolita respecto de la cámara (v3). Parte del escalonado preferido de CONFIG y lo acota para que una
 * parábola del 90 % de sus Δt (la más larga razonable) quepa entera: las pistas de notas largas (arcos altos) bajan,
 * las de notas cortas pueden ir arriba.
 */
const calcularOffsets = (ev: Record<PistaRitmo, EventoPista[]>, estilo: EstiloRitmo) => {
  const pref = CONFIG.map((c) => c.desfase * ESCALA_DESFASE[estilo]);
  const media = pref.reduce((a, b) => a + b, 0) / pref.length;
  return CONFIG.map((c, b) => {
    const l = ev[c.pista];
    const dts = l.slice(1).map((e, k) => (e.frame - l[k].frame) / FPS).sort((a, z) => a - z);
    const dt90 = dts[Math.floor(dts.length * 0.9)] ?? 0.5;
    const vy = Math.max(0, (G * dt90) / 2 - 220);
    const apice = (vy * vy) / (2 * G);
    const oMin = -ARRIBA_MAX + c.r + RUIDO_Y + apice + 40, oMax = ABAJO_MAX - c.r / 2 - RUIDO_Y - 30;
    const o = pref[b] - media - 60;
    return Math.round(oMin > oMax ? oMax : Math.max(oMin, Math.min(oMax, o)));
  });
};
/** Ancho de la vista en unidades de mundo (debe coincidir con ANCHO_VISTA de Ritmo.tsx): cámara cerca del grupo. */
const ANCHO_MUNDO = 1100;
/** |x| + r ≤ BORDE: la bolita entera dentro del cuadro (la cámara no se mueve en x). */
const BORDE = 538;
/** Separación mínima (u) entre cosas de bolitas distintas: bolitas, clavijas, rieles, paredes, columpios, portales. */
export const SEP = 18;
/** Ventana en que una figura "grande" se ve (s antes de empezar / después de terminar). */
const GRANDE_ANTES = 0.9, GRANDE_DESPUES = 0.5;
/** A lo más 2 figuras grandes a la vista en todo el cuadro (v3: "se ve muy amontonado"). */
const TOPE_GRANDES = 2;
/** Figuras grandes: llenan el cuadro. El riel cuenta como grande si es largo (serpenteante). */
const GRANDES = new Set<FiguraRitmo>(['loop', 'espiral', 'pendulo', 'trampolin']);
/** Muestreo para detectar choques no deseados (240 Hz: < 13 unidades entre muestras a 3000 u/s). */
const SUB = 4;

type Config = {
  pista: PistaRitmo; carril: number; r: number; color: string; brillo: number; largo: number; radio: number; desfase: number;
  /** Semiancho del carril para el centro de la bolita. */
  semi: number;
  /** Figuras permitidas en el estilo 'figuras' (la percusión solo hace figuras chicas). */
  figuras: FiguraRitmo[];
  /** Figuras distintas mínimas (estilo 'figuras'). */
  minFiguras: number;
};
const CHICAS: FiguraRitmo[] = ['parabola', 'zigzag'];
const TODAS: FiguraRitmo[] = ['parabola', 'riel', 'loop', 'zigzag', 'pendulo', 'espiral', 'trampolin', 'portal'];
const CONFIG: Config[] = [
  // Orden de generación = orden de prioridad (la melodía elige primero su camino). v3: tamaño y brillo por rol (la
  // melodía es la más grande y brillante; la percusión, chica y discreta), 5 tonos bien separados (amarillo, violeta,
  // rojo, verde, cian) y escalonadas en altura (desfase) para que las vecinas no compartan franja.
  // Franjas (centro de la bolita) disjuntas con ≥ SEP entre cuerpos: melodía al centro (±100), bajo y bombo a la
  // izquierda, caja y platillo a la derecha. Solo las figuras grandes pueden salirse (hasta 110 u) si hay lugar.
  { pista: 'melodia', carril: 0, r: 80, color: PALETA.neon.amarillo, brillo: 1.0, largo: 56, radio: 15, desfase: 0, semi: 100, figuras: TODAS, minFiguras: 4 },
  { pista: 'bajo', carril: -301, r: 56, color: PALETA.neon.violeta, brillo: 0.6, largo: 46, radio: 14, desfase: -250, semi: 47, figuras: TODAS, minFiguras: 4 },
  { pista: 'kick', carril: -480, r: 40, color: PALETA.rojo, brillo: 0.5, largo: 0, radio: 16, desfase: 230, semi: 18, figuras: CHICAS, minFiguras: 1 },
  { pista: 'snare', carril: 262, r: 36, color: PALETA.verde, brillo: 0.5, largo: 0, radio: 15, desfase: 250, semi: 28, figuras: CHICAS, minFiguras: 1 },
  { pista: 'hat', carril: 441, r: 30, color: PALETA.neon.cian, brillo: 0.5, largo: 0, radio: 13, desfase: -230, semi: 67, figuras: CHICAS, minFiguras: 1 },
];
/** Franja del centro de una bolita. */
const franjaDe = (c: Config): [number, number] => [c.carril - c.semi, c.carril + c.semi];

type V = { x: number; y: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y;
const len = (a: V) => Math.hypot(a.x, a.y);

/** Velocidad común de descenso (u/s): lenta en la intro (todas a la vista), rápida cuando entra la percusión. */
const velDescenso = (t: number) => {
  const a = 3.0, b = 5.5;
  if (t <= a) return 130;
  if (t >= b) return 220;
  const s = (t - a) / (b - a);
  return 130 + 90 * s * s * (3 - 2 * s);
};
/** Línea de descenso y_c(t) = ∫ v (integrada numéricamente a 1 ms). */
const crearLinea = (hasta: number) => {
  const paso = 0.001;
  const ys = new Float64Array(Math.ceil(hasta / paso) + 2);
  for (let i = 1; i < ys.length; i++) ys[i] = ys[i - 1] + velDescenso((i - 0.5) * paso) * paso;
  return (t: number) => ys[Math.max(0, Math.min(ys.length - 1, Math.round(t / paso)))];
};

/** Cápsula de una clavija (extremos A, B y radio). */
type Caps = { x: number; y: number; nx: number; ny: number; largo: number; radio: number };
const extremos = (c: Caps): [V, V] => {
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
const distClavija = (p: V, c: Caps) => { const [a, b] = extremos(c); return distSegmento(p, a, b) - c.radio; };
const distClavijas = (c1: Caps, c2: Caps) => {
  const [a, b] = extremos(c1);
  let m = Infinity;
  for (let k = 0; k <= 6; k++) { const u = k / 6; m = Math.min(m, distClavija({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, c2)); }
  return m - c1.radio;
};

/** Tras sonar, la clavija se disuelve en chispas (0,3 s): deja de ser sólida. Así una parábola larga puede volver a pasar
 * por donde ya hubo clavijas (las notas largas lanzan alto). */
export const FRAMES_DISOLVER = 18;
const finVida = (c: { golpe: number }) => (c.golpe + FRAMES_DISOLVER) / FPS;
/** Las clavijas aparecen (crecen) 0,67 s antes de su golpe, como los rieles: el circuito se arma por delante de las
 * bolitas. Así solo estorban en su ventana de vida y no durante todo el video. Debe coincidir con Ritmo.tsx. */
export const FRAMES_APARECE = 40;
/** v3: una clavija aparece 40 frames antes de su golpe, pero nunca antes del golpe anterior de
 * su bolita (`aparece`): en los redobles solo se ve la clavija siguiente, no tres por delante. */
const iniVida = (c: { golpe: number; aparece?: number }) => (c.aparece ?? c.golpe - FRAMES_APARECE) / FPS;
/** Escala con que Ritmo.tsx dibuja una clavija en el frame f (crece al nacer, late al golpe y se disuelve). */
const escalaClavija = (c: { golpe: number; aparece?: number }, f: number) => {
  const tras = f - c.golpe, antes = c.golpe - (c.aparece ?? c.golpe - FRAMES_APARECE);
  if (tras < -antes) return 0;
  if (tras < 0) { const nace = Math.min(1, (tras + antes) / 12); return nace * (1 + 0.15 * Math.sin(nace * Math.PI)); }
  const d = Math.min(1, tras / FRAMES_DISOLVER);
  return (1 + 0.35 * Math.exp(-tras / 3)) * (1 - d * d);
};
const conviven = (a: { golpe: number; aparece?: number }, b: { golpe: number; aparece?: number }) => iniVida(a) < finVida(b) && iniVida(b) < finVida(a);

type Muestra = { t: number; x: number; y: number; r: number; b: number; oculto?: boolean };

/** Índice de muestras por franjas de y (100 u) y por instante (para no recorrer 50 mil muestras por candidato). */
class Indice {
  muertos = new Set<Muestra>();
  porY = new Map<number, Muestra[]>();
  porT = new Map<number, Muestra[]>();
  agregar(m: Muestra) {
    const ky = Math.floor(m.y / 100), kt = Math.round(m.t * FPS * SUB);
    (this.porY.get(ky) ?? this.porY.set(ky, []).get(ky)!).push(m);
    (this.porT.get(kt) ?? this.porT.set(kt, []).get(kt)!).push(m);
  }
  *cerca(y: number, rango: number) {
    for (let k = Math.floor((y - rango) / 100); k <= Math.floor((y + rango) / 100); k++) {
      const l = this.porY.get(k);
      if (l) for (const m of l) if (!this.muertos.size || !this.muertos.has(m)) yield m;
    }
  }
  enInstante(t: number) { const l = this.porT.get(Math.round(t * FPS * SUB)) ?? []; return this.muertos.size ? l.filter((m) => !this.muertos.has(m)) : l; }
}

/** Índice por franjas de y (200 u) de cápsulas (clavijas, paredes). */
class IndiceCaps<T extends Caps> {
  muertos = new Set<T>();
  porY = new Map<number, T[]>();
  agregar(c: T) { const k = Math.floor(c.y / 200); (this.porY.get(k) ?? this.porY.set(k, []).get(k)!).push(c); }
  *cerca(y: number, rango: number) {
    for (let k = Math.floor((y - rango - 200) / 200); k <= Math.floor((y + rango + 200) / 200); k++) {
      const l = this.porY.get(k);
      if (l) for (const c of l) if (!this.muertos.size || !this.muertos.has(c)) yield c;
    }
  }
}

/** Huella de algo visible: disco (x, y, rad) presente en [t0, t1] (s de simulación). */
export type Huella = { x: number; y: number; rad: number; t0: number; t1: number };

/**
 * Ocupación del espacio-tiempo por las bolitas YA generadas (todo lo que se ve de ellas: su camino, clavijas, rieles,
 * paredes, columpios, portales). Rejilla de celdas de 24 u; cada celda guarda intervalos de tiempo [t0, t1]. Un disco
 * marca las celdas que toca (inflado en SEP/2), así que dos discos a menos de SEP siempre comparten una celda en un
 * instante común: sin falsos negativos (los falsos positivos cuestan, como mucho, una celda de holgura).
 */
export class Ocupacion {
  static CELDA = 24;
  mapa = new Map<number, number[]>();
  private celdas(x: number, y: number, R: number, fn: (k: number) => boolean | void) {
    const c = Ocupacion.CELDA;
    const ix0 = Math.floor((x - R) / c), ix1 = Math.floor((x + R) / c), iy0 = Math.floor((y - R) / c), iy1 = Math.floor((y + R) / c);
    for (let iy = iy0; iy <= iy1; iy++) {
      const dy = Math.max(iy * c - y, 0, y - (iy + 1) * c);
      for (let ix = ix0; ix <= ix1; ix++) {
        const dx = Math.max(ix * c - x, 0, x - (ix + 1) * c);
        if (dx * dx + dy * dy > R * R) continue;
        if (fn(iy * 16384 + ix + 8192)) return true;
      }
    }
    return false;
  }
  ocupar(h: Huella) {
    this.celdas(h.x, h.y, h.rad + SEP / 2, (k) => {
      let l = this.mapa.get(k);
      if (!l) { l = []; this.mapa.set(k, l); }
      const n = l.length;
      if (n && h.t0 <= l[n - 1] + 0.02 && h.t1 >= l[n - 2] - 0.02) { l[n - 2] = Math.min(l[n - 2], h.t0); l[n - 1] = Math.max(l[n - 1], h.t1); }
      else l.push(h.t0, h.t1);
    });
  }
  choca(h: Huella) {
    return this.celdas(h.x, h.y, h.rad + SEP / 2, (k) => {
      const l = this.mapa.get(k);
      if (l) for (let i = 0; i < l.length; i += 2) if (h.t0 < l[i + 1] && l[i] < h.t1) return true;
      return false;
    });
  }
}

/** Radio del tubo de vidrio alrededor del camino (debe coincidir con RAD_VIDRIO de Ritmo.tsx). */
const RAD_VIDRIO = 12;
/** Instante → intervalo corto (una muestra a 120 Hz). */
const inst = (x: number, y: number, rad: number, t: number): Huella => ({ x, y, rad, t0: t - 1 / 120, t1: t + 1 / 120 });

/** Huellas de una clavija (cápsula muestreada a lo largo del eje) durante su vida. */
export const huellaClavija = (c: Caps & { golpe: number; aparece?: number }): Huella[] => {
  const [a, b] = extremos(c);
  const n = Math.max(1, Math.ceil((2 * c.largo) / 12));
  const out: Huella[] = [];
  for (let k = 0; k <= n; k++) { const u = k / n; out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, rad: c.radio, t0: iniVida(c), t1: finVida(c) }); }
  return out;
};

/** Huellas de un objeto de figura mientras se ve (los rieles se dibujan 0,9 s antes y se borran 0,32 s detrás). */
export const huellaObjeto = (o: ObjetoSim, r: number): Huella[] => {
  const out: Huella[] = [];
  if (o.tipo === 'riel') {
    const n = o.tiempos.length, t0 = o.tiempos[0] - 0.9;
    for (let i = 0; i < n; i += 2) out.push({ x: o.puntos[i * 3], y: o.puntos[i * 3 + 1], rad: r + RAD_VIDRIO, t0, t1: o.tiempos[i] + 0.32 });
  } else if (o.tipo === 'pared') {
    const n = Math.max(1, Math.ceil((o.y1 - o.y0) / 12));
    for (let k = 0; k <= n; k++) out.push({ x: o.x, y: o.y0 + ((o.y1 - o.y0) * k) / n, rad: 8, t0: o.desde, t1: o.hasta + 0.25 });
  } else if (o.tipo === 'pendulo') {
    const t0 = o.desdeFrame / FPS, t1 = (o.desdeFrame + o.angulos.length) / FPS;
    out.push({ x: o.px, y: o.py, rad: 16, t0, t1 });
    o.angulos.forEach((th, k) => {
      const t = (o.desdeFrame + k) / FPS;
      out.push(inst(o.px + o.largo * Math.sin(th), o.py + o.largo * Math.cos(th), r + 16, t));
      for (const u of [0.33, 0.66]) out.push(inst(o.px + u * o.largo * Math.sin(th), o.py + u * o.largo * Math.cos(th), 6, t));
    });
  } else if (o.tipo === 'portal') {
    for (const [x, y] of [[o.ax, o.ay], [o.bx, o.by]]) out.push({ x, y, rad: r + 24, t0: o.entra - 0.9, t1: o.sale + 0.5 });
  }
  return out;
};

export type EventoPista = { frame: number; nota?: number; dur?: number; abierto?: boolean; acento?: boolean };

/** Eventos de cada pista en frames enteros (avisa si alguno no cae justo en un frame). */
export const eventosDe = (p: PartituraRitmo): Record<PistaRitmo, EventoPista[]> => {
  const fpp = (60 / p.bpm) * FPS; // frames por pulso
  // Si la subdivisión no cae en frames enteros (92 bpm: corchea = 19,57 cuadros) cada evento se redondea al frame
  // más cercano (error ≤ ½ frame = 8 ms, inaudible) y el audio se sintetiza en ESE frame: imagen y sonido coinciden.
  const aFrame = (pulso: number) => Math.round(FRAMES_ENTRADA + pulso * fpp);
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
  for (const tipo of ['kick', 'snare', 'hat'] as const) r[tipo] = ordenar(p.pistas.ritmo.filter((e) => e.tipo === tipo).map((e) => ({ frame: aFrame(e.pulso), abierto: e.abierto, acento: e.acento })));
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
  const estilo = props.estilo ?? 'figuras';
  G = GRAVEDAD[estilo];
  /** Todo lo visible de las bolitas ya generadas (separación dura entre bolitas distintas). */
  const ocup = new Ocupacion();
  /** Ventanas de vista de las figuras grandes ya colocadas (de todas las bolitas). */
  const grandes: [number, number][] = [];
  const ev = eventosDe(partitura);
  const finalFrame = Math.max(...Object.values(ev).map((l) => l[l.length - 1].frame));
  const duracionFrames = finalFrame + FRAMES_CLIMAX + FRAMES_CIERRE;
  const linea = crearLinea(duracionFrames / FPS + 2);
  // Cámara (v3): sigue la línea de descenso con dos pasadas de suavizado exponencial (≈ 0,28 s de retraso), no se
  // mueve en x y se congela en el clímax. Se calcula ANTES del nivel para que el generador sepa qué entra en cuadro.
  const camY: number[] = [];
  {
    const tau = 0.14, alfa = 1 - Math.exp(-1 / (FPS * tau));
    let y1 = linea(0), y2 = linea(0);
    for (let f = 0; f <= finalFrame; f++) {
      y1 += alfa * (linea(f / FPS) - y1);
      y2 += alfa * (y1 - y2);
      camY.push(Math.round(y2 * 100) / 100);
    }
  }
  const camEn = (t: number) => camY[Math.max(0, Math.min(finalFrame, Math.round(t * FPS)))];
  const offsets = calcularOffsets(ev, estilo);
  const clavijas: ClavijaSim[] = [];
  const golpes: GolpeSim[] = [];
  const bolitas: BolitaSim[] = [];
  const tramosSim: TramoSim[] = [];
  const objetos: ObjetoSim[] = [];
  const otras = new Indice();
  const pegsGlobal = new IndiceCaps<ClavijaSim>();
  const murosGlobal = new IndiceCaps<Solido>();
  let avisos = 0;
  const resumen: string[] = [];

  const activas = CONFIG.slice(0, Number(process.env.RITMO_BOLITAS ?? CONFIG.length));
  /**
   * Reserva de las bolitas que AÚN no se generan (v3): una figura que se sale de su franja no puede meterse en la
   * franja de una bolita posterior en la banda de alto donde esa bolita va a estar (su línea ± ruido, más el ápice
   * de la parábola de la nota que esté sonando, o su repisa antes de entrar). Así las de percusión, que van después y
   * no pueden esquivar, siempre tienen su carril libre.
   */
  const reservas = activas.map((c, b) => {
    const l = ev[c.pista], ts = l.map((e) => e.frame / FPS);
    const fr = franjaDe(c), xa = fr[0] - c.r - SEP, xb = fr[1] + c.r + SEP;
    const abajo = RUIDO_Y + c.r + 2 * c.radio + c.largo + SEP;
    const apice = (dt: number) => { const vy = Math.max(0, (G * dt) / 2 - 220); return (vy * vy) / (2 * G); };
    const apices = ts.slice(1).map((t, k) => apice(t - ts[k]));
    const repY = linea(ts[0]) + offsets[b] - 0.5 * G * (FRAMES_CAIDA / FPS) ** 2;
    /** ¿La huella h pisa la banda reservada de la bolita b? */
    return (h: Huella) => {
      if (h.x + h.rad < xa || h.x - h.rad > xb) return false;
      let arriba: number, bajo: number;
      if (h.t1 < ts[0]) { arriba = repY - c.r - SEP - 30; bajo = linea(ts[0]) + offsets[b] + c.r + SEP; }
      else {
        let k0 = 0;
        while (k0 < ts.length - 1 && ts[k0 + 1] <= h.t0) k0++;
        let ap = 0;
        for (let k = k0; k < ts.length - 1 && ts[k] <= h.t1; k++) ap = Math.max(ap, apices[k]);
        if (h.t1 > ts[ts.length - 1]) ap = Math.max(ap, 500);
        arriba = Math.min(linea(Math.max(h.t0, ts[0])) + offsets[b] - RUIDO_Y - ap - c.r - SEP, h.t0 < ts[0] ? repY - c.r - SEP - 30 : Infinity);
        bajo = linea(Math.min(h.t1, ts[ts.length - 1])) + offsets[b] + abajo;
      }
      return h.y + h.rad > arriba && h.y - h.rad < bajo;
    };
  });
  activas.forEach((cfg, b) => {
    const posteriores = reservas.slice(b + 1);
    const reservado = (h: Huella) => posteriores.some((f) => f(h));
    const lista = ev[cfg.pista];
    const vecinos = CONFIG.slice(0, b).map((c) => c.carril);
    const xMax = BORDE - cfg.r;
    const franja = franjaDe(cfg);
    /** Un intento completo de la bolita con un azar propio; devuelve sus clavijas, golpes y reparos (no toca lo global). */
    const intentarBolita = (azar: () => number) => {
      const mias: ClavijaSim[] = [];
      const misPegs = new IndiceCaps<ClavijaSim>();
      const misMuros = new IndiceCaps<Solido>();
      const murosLista: Solido[] = [];
      const misGolpes: GolpeSim[] = [];
      const misTramos: TramoSim[] = [];
      const misObjetos: ObjetoSim[] = [];
      const reparos: string[] = [];
      const usos = new Map<FiguraRitmo, number>();
      const t0 = lista[0].frame / FPS;
      const dtCaida = FRAMES_CAIDA / FPS;
      const objetivoY = (t: number) => linea(t) + offsets[b];
      let P: V = { x: cfg.carril + (azar() * 2 - 1) * cfg.semi * 0.6, y: objetivoY(t0) };
      let vIn: V = { x: 0, y: G * dtCaida };
      const repisa = { x: P.x, y: P.y - 0.5 * G * dtCaida * dtCaida, abre: lista[0].frame - FRAMES_CAIDA };
      const propias: Muestra[] = [];
      const propiasIdx = new Indice();
      // En reposo sobre la repisa (las demás no deben pasarle por encima) y la caída hasta el primer golpe.
      for (let k = 0; k <= repisa.abre * SUB; k++) {
        const m = { t: k / (FPS * SUB), x: repisa.x, y: repisa.y, r: cfg.r, b };
        propias.push(m); propiasIdx.agregar(m);
      }
      for (let k = 1; k <= FRAMES_CAIDA * SUB; k++) {
        const s = k / (FPS * SUB);
        const m = { t: repisa.abre / FPS + s, x: repisa.x, y: repisa.y + 0.5 * G * s * s, r: cfg.r, b };
        propias.push(m); propiasIdx.agregar(m);
      }
      const segmentos: Tramo[] = [
        { t0: 0, dur: repisa.abre / FPS, pos: () => [repisa.x, repisa.y, 0] },
        { t0: repisa.abre / FPS, dur: dtCaida, pos: (s) => [repisa.x, repisa.y + 0.5 * G * s * s, 0] },
      ];
      let anterior: FiguraRitmo | null = null;
      /** Huellas de los objetos propios por paso (para que un riel nuevo no pise uno propio que aún se ve). */

      // Pila de pasos aceptados: si un golpe no encuentra camino limpio, se deshace el anterior y se rehace con otro
      // azar (retroceso acotado). Lo deshecho se marca muerto en los índices propios.
      type Paso = { peg: ClavijaSim; muestras: Muestra[]; paredes: Solido[]; nSeg: number; nObj: number; figura: FiguraRitmo | null;
        anterior: FiguraRitmo | null; P: V; vIn: V; reparo?: string; huellas: Huella[]; grande?: [number, number] };
      const pila: Paso[] = [];
      const retros = new Array(lista.length).fill(0);
      let retrosTotales = 0;
      let i = 0;
      while (i < lista.length) {
        const ti = lista[i].frame / FPS;
        const ultimo = i === lista.length - 1;
        // Tras el golpe final la bolita sale despedida hacia arriba (fuegos del clímax): parábola abierta.
        const tj = ultimo ? ti + 1.0 : lista[i + 1].frame / FPS;
        const dt = tj - ti;
        const ctx: Contexto = {
          P, vIn, ti, dt, tj, r: cfg.r, carril: cfg.carril, bolita: b, G, semiCarril: cfg.semi, franja, tPrev: i > 0 ? lista[i - 1].frame / FPS : undefined, azar, objetivoY, vecinos, xMax,
          objetivo: (ladoForzado?: number) => {
            const lado = ladoForzado ?? (P.x > cfg.carril ? -1 : 1);
            const x = cfg.carril + lado * azar() * cfg.semi * (ladoForzado || azar() < 0.75 ? 1 : -0.6);
            return { x: Math.max(franja[0], Math.min(franja[1], x)), y: objetivoY(tj) + (azar() * 2 - 1) * RUIDO_Y };
          },
        };
        // Tope de figuras grandes: a lo más TOPE_GRANDES a la vista en todo el cuadro y una por bolita.
        const ventana: [number, number] = [ti - GRANDE_ANTES, tj + GRANDE_DESPUES];
        const solapa = (w: [number, number]) => w[0] < ventana[1] && ventana[0] < w[1];
        const propiasGrandes = pila.filter((ps) => ps.grande && solapa(ps.grande)).length;
        const cabeGrande = propiasGrandes === 0 && propiasGrandes + grandes.filter(solapa).length < TOPE_GRANDES;
        // Orden de figuras a probar: las que caben en Δt, nunca la anterior, las menos usadas primero (con azar).
        let orden: FiguraRitmo[];
        if (ultimo || estilo === 'plano') orden = ['parabola'];
        else {
          orden = cfg.figuras.filter((f) => (f !== anterior || cfg.minFiguras === 1) && dt >= DT_MIN[f] && (cabeGrande || !GRANDES.has(f)))
            .map((f) => ({ f, p: (PESO[f] / (1 + 1.4 * (usos.get(f) ?? 0))) * (0.4 + azar()) }))
            .sort((a, z) => z.p - a.p).map((o) => o.f).slice(0, 3);
          if (!orden.includes('parabola') && (anterior !== 'parabola' || cfg.minFiguras === 1)) orden.push('parabola');
        }
        type Mejor = { costo: number; viol: number; cand: Candidato; n: V; e: number; peg: ClavijaSim; muestras: Muestra[]; motivos: string[]; huellas: Huella[] };
        let mejor: Mejor | null = null;
        // Lo ajeno (clavijas, paredes, caminos de las bolitas ya generadas) lo cubre la rejilla de ocupación `ocup`.
        const vigentesPegs = [misPegs];
        const vigentesMuros = [misMuros];
        for (const figura of orden) {
          let mejorFig: Mejor | null = null;
          const intentos = ultimo ? 40 : figura === 'parabola' ? 90 : 45;
          for (let k = 0; k < intentos; k++) {
            let cand: Candidato | null;
            if (ultimo) {
              const Pj = { x: Math.max(-xMax, Math.min(xMax, P.x + (azar() * 2 - 1) * 60)), y: P.y - 150 - azar() * 120 };
              const v = vParab(P, Pj, dt, G);
              const P0 = { ...P }; // copia: P se reasigna después y el cierre debe quedarse con este punto
              cand = { figura: 'parabola', vOut: v, tramos: [{ t0: 0, dur: dt, pos: (s) => [P0.x + v.x * s, P0.y + v.y * s + 0.5 * G * s * s, 0] }], Pj, vFin: { x: v.x, y: v.y + G * dt }, objetos: [], paredes: [], costo: 0, motivos: [] };
            } else cand = CONSTRUCTORES[figura](ctx);
            if (!cand) continue;
            if (cand.grande === undefined) cand.grande = GRANDES.has(cand.figura);
            if (cand.grande && !cabeGrande) continue;
            const cota = DIAG ? 99 : Math.min(mejorFig?.viol ?? 99, mejor?.viol ?? 99);
            const r = evaluar(cand, ctx, ultimo, i === 0, vigentesPegs, vigentesMuros, otras, propiasIdx, camEn, xMax, cfg, ocup, pila, reservado, cota);
            if (!r) continue;
            if (!mejorFig || r.viol < mejorFig.viol || (r.viol === mejorFig.viol && r.costo < mejorFig.costo)) mejorFig = { ...r, cand };
            if (mejorFig.viol === 0 && k > 5) break;
          }
          if (mejorFig && (!mejor || mejorFig.viol < mejor.viol)) mejor = mejorFig;
          if (mejor && mejor.viol === 0) break;
        }
        if (!mejor) for (let k = 0; k < 60; k++) { // último recurso: parábola aunque repita figura
          const cand = CONSTRUCTORES.parabola(ctx)!;
          const r = evaluar(cand, ctx, ultimo, i === 0, vigentesPegs, vigentesMuros, otras, propiasIdx, camEn, xMax, cfg, ocup, pila, reservado);
          if (r && (!mejor || r.viol < mejor.viol || (r.viol === mejor.viol && r.costo < mejor.costo))) mejor = { ...r, cand };
        }
        if (!mejor) throw new Error(`sin candidato para ${cfg.pista} #${i}`);
        if (mejor.viol > 0 && i > 0 && retros[i] < 8 && retrosTotales < 6 * lista.length) {
          // deshacer el paso anterior y rehacerlo
          retros[i]++; retrosTotales++;
          const ps = pila.pop()!;
          mias.pop(); misPegs.muertos.add(ps.peg); misGolpes.pop();
          for (const m of ps.muestras) propiasIdx.muertos.add(m);
          propias.length -= ps.muestras.length;
          for (const w of ps.paredes) { misMuros.muertos.add(w); murosLista.pop(); }
          segmentos.length = ps.nSeg; misObjetos.length = ps.nObj;
          if (ps.figura) { misTramos.pop(); usos.set(ps.figura, (usos.get(ps.figura) ?? 1) - 1); if (!usos.get(ps.figura)) usos.delete(ps.figura); }
          anterior = ps.anterior; P = ps.P; vIn = ps.vIn;
          i--;
          continue;
        }
        const { cand } = mejor;
        const paso: Paso = { peg: mejor.peg, muestras: mejor.muestras, paredes: cand.paredes, nSeg: segmentos.length, nObj: misObjetos.length,
          figura: ultimo ? null : cand.figura, anterior, P, vIn, huellas: mejor.huellas, ...(cand.grande ? { grande: ventana } : {}),
          reparo: mejor.viol > 0 ? `${cfg.pista} golpe ${i} (frame ${lista[i].frame}, ${cand.figura}): ${mejor.motivos.join(', ')}` : undefined };
        const idx = mias.length;
        if (cand.estilo) mejor.peg.estilo = cand.estilo;
        mias.push(mejor.peg); misPegs.agregar(mejor.peg);
        misGolpes.push({
          frame: lista[i].frame, t: ti, pista: cfg.pista, bolita: b, clavija: idx, x: P.x, y: P.y, nx: mejor.n.x, ny: mejor.n.y,
          nota: lista[i].nota, fuerza: Math.min(1, Math.max(0.2, -dot(vIn, mejor.n) / 1400)), ...(lista[i].acento ? { acento: true } : {}),
        });
        for (const tr of cand.tramos) segmentos.push({ ...tr, t0: ti + tr.t0 });
        for (const m of mejor.muestras) { propias.push(m); propiasIdx.agregar(m); }
        for (const w of cand.paredes) { misMuros.agregar(w); murosLista.push(w); }
        misObjetos.push(...cand.objetos);
        if (!ultimo) {
          misTramos.push({ bolita: b, figura: cand.figura, desde: lista[i].frame, hasta: lista[i + 1].frame, ...(cand.grande ? { grande: true } : {}) });
          usos.set(cand.figura, (usos.get(cand.figura) ?? 0) + 1);
          if (anterior === cand.figura && estilo !== 'plano' && cfg.minFiguras > 1) paso.reparo = `${paso.reparo ?? `${cfg.pista} golpe ${i}:`} figura repetida (${cand.figura})`;
          anterior = cand.figura;
        }
        pila.push(paso);
        vIn = cand.vFin;
        P = cand.Pj;
        i++;
      }
      for (const ps of pila) if (ps.reparo) reparos.push(ps.reparo);

      if (estilo !== 'plano' && usos.size < cfg.minFiguras) reparos.push(`${cfg.pista}: solo ${usos.size} figuras distintas`);
      const misGrandes = pila.flatMap((ps) => (ps.grande ? [ps.grande] : []));
      // Muestreo por frame de todos los tramos (respeta la cámara lenta del clímax).
      const cuadros: number[] = [], zs: number[] = [], ocultos: [number, number][] = [];
      let k = 0;
      for (let f = 0; f < duracionFrames; f++) {
        const t = f <= finalFrame ? f / FPS : (finalFrame + (f - finalFrame) * LENTO_CLIMAX) / FPS;
        while (k < segmentos.length - 1 && segmentos[k + 1].t0 <= t + 1e-9) k++;
        const sg = segmentos[k];
        const p = sg.pos(t - sg.t0);
        cuadros.push(Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100);
        zs.push(Math.round(p[2] * 10) / 10);
        if (sg.oculto && t - sg.t0 < sg.dur - 1e-9) {
          const u = ocultos[ocultos.length - 1];
          if (u && u[1] === f - 1) u[1] = f; else ocultos.push([f, f]);
        }
      }
      const bolita: BolitaSim = {
        pista: cfg.pista, color: cfg.color, r: cfg.r, brillo: cfg.brillo, carril: cfg.carril, franja, repisa, cuadros,
        ...(zs.some((z) => z !== 0) ? { z: zs } : {}), ...(ocultos.length ? { ocultos } : {}),
      };
      return { mias, misGolpes, reparos, propias, bolita, misTramos, misObjetos, murosLista, usos, misGrandes };
    };
    // Varios intentos con azar distinto (determinista): se queda el primero sin reparos o el que tenga menos.
    let elegido: ReturnType<typeof intentarBolita> | null = null;
    for (let intento = 0; intento < 6; intento++) {
      const r = intentarBolita(crearAzar((semilla ^ Math.imul(b + 1, 0x9e3779b1) ^ Math.imul(intento + 1, 0x85ebca6b)) >>> 0));
      if (!elegido || r.reparos.length < elegido.reparos.length) elegido = r;
      if (r.reparos.length === 0) break;
    }
    const e = elegido!;
    for (const msg of e.reparos) console.warn(`aviso: ${msg}`);
    avisos += e.reparos.length;
    const base = clavijas.length;
    clavijas.push(...e.mias);
    for (const c of e.mias) pegsGlobal.agregar(c);
    for (const w of e.murosLista) murosGlobal.agregar(w);
    for (const g of e.misGolpes) golpes.push({ ...g, clavija: g.clavija + base });
    bolitas.push(e.bolita);
    tramosSim.push(...e.misTramos);
    objetos.push(...e.misObjetos);
    for (const m of e.propias) otras.agregar(m);
    // Todo lo visible de esta bolita pasa a la ocupación común (las siguientes deben quedar a ≥ SEP).
    e.propias.forEach((m, k) => { if (!m.oculto && k % 2 === 0) ocup.ocupar(inst(m.x, m.y, m.r, m.t)); });
    for (const c of e.mias) for (const h of huellaClavija(c)) ocup.ocupar(h);
    for (const o of e.misObjetos) for (const h of huellaObjeto(o, cfg.r)) ocup.ocupar(h);
    grandes.push(...e.misGrandes);
    resumen.push(`${cfg.pista}: ${[...e.usos.entries()].sort((a, z) => z[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
  });

  const camara: number[] = [];
  for (let f = 0; f < duracionFrames; f++) camara.push(0, camY[Math.min(f, finalFrame)]);
  golpes.sort((a, z) => a.frame - z.frame || a.bolita - z.bolita);
  console.log(`nivel: ${golpes.length} golpes, ${clavijas.length} clavijas, ${objetos.length} objetos, ${avisos} con reparos, semilla ${semilla}`);
  for (const l of resumen) console.log(`  ${l}`);
  return {
    version: 3, estilo, id: props.id, fps: FPS, duracionFrames, finalFrame, lentoClimax: LENTO_CLIMAX, mundo: { ancho: ANCHO_MUNDO, gravedad: G },
    camara, bolitas, clavijas, golpes, tramos: tramosSim, objetos, semillaUsada: semilla,
  };
};

/** Evalúa un candidato: el choque con la clavija, y que el camino nuevo no atraviese nada ni a nadie. */
const evaluar = (
  cand: Candidato, ctx: Contexto, ultimo: boolean, primero: boolean, pegs: IndiceCaps<ClavijaSim>[], muros: IndiceCaps<Solido>[],
  otras: Indice, propiasIdx: Indice, camEn: (t: number) => number, xMax: number, cfg: Config,
  ocup: Ocupacion, pila: { huellas: Huella[] }[], reservado: (h: Huella) => boolean, cota = 99,
) => {
  const { P, vIn, ti, dt } = ctx;
  const vOut = cand.vOut;
  const d = sub(vOut, vIn);
  const ld = len(d);
  if (ld < 1e-6) return null;
  const n = { x: d.x / ld, y: d.y / ld };
  const vin_n = dot(vIn, n), vout_n = dot(vOut, n);
  const e = -vout_n / vin_n;
  let viol = cand.motivos.length;
  const motivos = [...cand.motivos];
  let costo = cand.costo;
  // Peso del defecto: dos bolitas que se montan se ve muchísimo; un roce o salir un poco del cuadro, poco.
  // Un choque que no rebota de verdad (restitución absurda o rasante) rompe la sincronía visible: casi prohibido.
  const PESOS: Record<string, number> = { 'bolita-bolita': 4, atraviesa: 2, 'clavija-en-otra': 2, 'pared-en-otra': 2, 'sep-bolita': 2, 'sep-objeto': 2, 'sep-clavija': 2, e: 20, 'rasante-in': 20, 'rasante-out': 20 };
  const malo = (m: string) => { viol += PESOS[m.replace(/=.*/, '')] ?? 1; motivos.push(m); };
  const rasanteIn = -vin_n / Math.max(1e-6, len(vIn));
  const rasanteOut = vout_n / Math.max(1e-6, len(vOut));
  if (rasanteIn < 0.25) malo('rasante-in');
  if (rasanteOut < 0.2) malo('rasante-out');
  const [eMin, eMax] = cand.eRango ?? [0.25, 1.9];
  if (!ultimo && !(e > eMin && e < eMax)) malo(`e=${e.toFixed(2)}`);
  if (len(vOut) > 3000) malo('veloz');
  const subida = vOut.y < 0 ? (vOut.y * vOut.y) / (2 * G) : 0;
  if (subida > (cand.subidaMax ?? 1000)) malo('subida');
  if (cand.estilo === 'trampolin' && n.y > -0.75) malo('trampolin-inclinado');
  // el golpe siguiente no puede quedar casi encima de este: su clavija nacería dentro de la bolita
  if (!ultimo && Math.hypot(cand.Pj.x - P.x, cand.Pj.y - P.y) < 1.2 * cfg.r) malo('golpe-encima');
  costo += 3 * (e - 0.62) ** 2 * (cand.estilo ? 0.2 : 1) + 0.6 * Math.max(0, 0.5 - rasanteIn) + Math.max(0, n.y + 0.35) * 2
    - 0.25 * Math.min(Math.abs(cand.Pj.x - P.x), 90) / 90 + subida / 3000;
  const off = cfg.r + cfg.radio;
  const peg: ClavijaSim = { bolita: ctx.bolita, x: P.x - n.x * off, y: P.y - n.y * off, nx: n.x, ny: n.y, largo: cand.estilo === 'trampolin' ? cfg.largo + 40 : cfg.largo, radio: cfg.radio, golpe: Math.round(ti * FPS) };
  if (ctx.tPrev !== undefined) { const a = Math.round(ctx.tPrev * FPS); if (a > peg.golpe - FRAMES_APARECE) peg.aparece = a; }
  const vidaPeg = finVida(peg), nacePeg = iniVida(peg);
  if (viol > cota) return null;
  // (0) separación dura de la clavija nueva con todo lo visible de las bolitas ya generadas (rejilla de ocupación)
  for (const h of huellaClavija(peg)) if (ocup.choca(h)) { malo('sep-clavija'); break; }
  if (viol > cota) return null;
  // (1) clavija contra clavijas y paredes vivas PROPIAS (lo ajeno lo cubre la rejilla)
  // Con la clavija propia anterior (que se disuelve mientras la nueva nace) se compara cuadro a cuadro con sus escalas
  // reales de dibujo (Ritmo.tsx): nace en 12 frames, se disuelve en 18.
  for (const ix of pegs) for (const c of ix.cerca(peg.y, 300)) {
    if (!(iniVida(peg) < finVida(c) && iniVida(c) < finVida(peg))) continue;
    let pisa = false;
    for (let f = Math.round(iniVida(peg) * FPS); f <= Math.min(peg.golpe, c.golpe + FRAMES_DISOLVER) && !pisa; f += 2) {
      const sn = escalaClavija(peg, f), sv = escalaClavija(c, f);
      if (sn < 0.02 || sv < 0.02) continue;
      if (distClavijas({ ...peg, largo: peg.largo * sn, radio: peg.radio * sn }, { ...c, largo: c.largo * sv, radio: c.radio * sv }) < 6) pisa = true;
    }
    if (pisa) { malo('clavija-clavija'); break; }
  }
  for (const ix of muros) for (const w of ix.cerca(peg.y, 300)) if (w.desde < vidaPeg && w.hasta > nacePeg && distClavijas(peg, w) < 8) { malo('clavija-pared'); break; }
  for (const w of cand.paredes) if (distClavijas(peg, w) < 4) { malo('clavija-pared-propia'); break; }
  // (2) clavija contra la trayectoria propia anterior mientras la clavija ya se ve (la llegada reciente solo cuenta si
  // de verdad penetra la clavija: con llegadas lentas el último tramo pasa legítimamente a pocas unidades de ella)
  // (la clavija nace chica y crece en 12 frames: los primeros 6 no estorban)
  if (!primero) fuera2: for (let q = Math.ceil((nacePeg + 0.1) * FPS * SUB); q < (ti - 0.02) * FPS * SUB; q++) {
    for (const m of propiasIdx.enInstante(q / (FPS * SUB))) {
      if (m.oculto) continue;
      if (distClavija(m, peg) < (m.t > ti - 0.5 ? m.r - 2 : m.r + 5)) { malo('clavija-en-propia'); if (process.env.RITMO_DBG && Math.abs(ti - 30.8) < 0.01) console.log('CP', (ti - m.t).toFixed(3), distClavija(m, peg).toFixed(1), m.r, peg.aparece, peg.golpe); break fuera2; }
    }
  }
  if (viol > cota) return null;
  // (3) el camino nuevo (muestreado a 240 Hz) no atraviesa (roces de < 8 u contra clavijas ajenas se toleran: no se ven) clavijas, paredes ni bolitas, y no sale de cuadro
  const muestras: Muestra[] = [];
  const nS = Math.round(dt * FPS * SUB);
  let k = 0, choca = false, fuera = false, salida = false;
  // Fuera de la franja: la parábola nunca; las figuras chicas un poco (40 u) y las grandes hasta 110 u, siempre que
  // la separación con lo ajeno se cumpla.
  const fr = franjaDe(cfg), tolFr = cand.grande ? 110 : cand.figura === 'parabola' ? 3 : 40;
  for (let s = 1; s <= nS; s++) {
    const tt = (s / nS) * dt;
    while (k < cand.tramos.length - 1 && tt > cand.tramos[k].t0 + cand.tramos[k].dur + 1e-9) k++;
    const tr = cand.tramos[k];
    const p = tr.pos(Math.min(tr.dur, tt - tr.t0));
    const m: Muestra = { t: ti + tt, x: p[0], y: p[1], r: cfg.r, b: ctx.bolita, ...(tr.oculto ? { oculto: true } : {}) };
    muestras.push(m);
    if (viol > cota) return null;
    if (m.oculto) continue;
    if (!fuera && !ultimo && (Math.abs(m.x) > xMax || m.y - camEn(m.t) < -ARRIBA_MAX + m.r || m.y - camEn(m.t) > ABAJO_MAX - m.r / 2)) { fuera = true; malo('fuera-de-cuadro'); }
    if (!salida && (m.x < fr[0] - tolFr || m.x > fr[1] + tolFr)) { salida = true; malo('fuera-franja'); }
    if (!choca && tt >= 0.03) {
      for (const ix of pegs) { for (const c of ix.cerca(m.y, 200)) if (m.t < finVida(c) && m.t > iniVida(c) && distClavija(m, c) < cfg.r - 1) { choca = true; break; } if (choca) break; }
      if (!choca) for (const ix of muros) { for (const w of ix.cerca(m.y, 200)) if (m.t >= w.desde && m.t <= w.hasta && distClavija(m, w) < cfg.r + 3) { choca = true; break; } if (choca) break; }
      // la clavija del golpe de salida sigue sólida 0,3 s: la bolita no puede volver a caerle encima
      if (!choca && m.t < vidaPeg && distClavija(m, peg) < cfg.r - 1) choca = true;
      if (choca) malo('atraviesa');
    }
  }
  // (4) paredes nuevas contra la trayectoria propia anterior y las clavijas propias vivas (lo ajeno: rejilla)
  for (const w of cand.paredes) {
    fuera4: for (let q = Math.ceil(w.desde * FPS * SUB); q < (ti - 0.02) * FPS * SUB; q++) {
      for (const m of propiasIdx.enInstante(q / (FPS * SUB))) if (distClavija(m, w) < m.r + 4) { malo('pared-en-propia'); break fuera4; }
    }
    for (const ix of pegs) for (const c of ix.cerca(w.y, 300 + w.largo)) if (w.desde < finVida(c) && w.hasta > iniVida(c) && distClavijas(w, c) < 8) { malo('pared-clavija'); break; }
  }
  // (5) separación dura (≥ SEP) con todo lo visible de las bolitas ya generadas: su camino, clavijas y objetos.
  const huellas = cand.objetos.flatMap((o) => huellaObjeto(o, cfg.r));
  if (viol <= cota) for (let q = 0; q < muestras.length; q += 2) {
    const m = muestras[q];
    if (!m.oculto && ocup.choca(inst(m.x, m.y, m.r, m.t))) { malo('sep-bolita'); break; }
  }
  if (viol <= cota) for (const h of huellas) if (ocup.choca(h)) { malo('sep-objeto'); break; }
  // (5b) lo que sale de la franja propia no invade la banda reservada de una bolita posterior
  if (viol <= cota) {
    const fr = franjaDe(cfg);
    const sale = (h: Huella, tol = 1) => h.x - h.rad < fr[0] - cfg.r - tol || h.x + h.rad > fr[1] + cfg.r + tol;
    // (una clavija puede asomar SEP/2 de la franja: la vecina igual queda a ≥ SEP/2 de ella)
    for (const h of huellaClavija(peg)) if (sale(h, SEP / 2) && reservado(h)) { malo('reserva'); break; }
    const todas = [...huellas, ...muestras.filter((m, q) => !m.oculto && q % 2 === 0).map((m) => inst(m.x, m.y, m.r, m.t))];
    for (const h of todas) if (sale(h) && reservado(h)) { malo('reserva'); if (process.env.RITMO_DBG) console.log('RES', cfg.pista, ti.toFixed(2), h.x.toFixed(0), h.y.toFixed(0), h.rad, h.t0.toFixed(2), h.t1.toFixed(2), (h.y - camEn(ti)).toFixed(0)); break; }
  }
  // (6) un objeto nuevo no pisa uno propio que todavía se ve (fuera de la unión, cerca del golpe P): el siguiente
  // aparece cuando el anterior ya se desvaneció en esa zona.
  if (viol <= cota && pila.length) {
    const exc = 2 * cfg.r + 40;
    const lejos = (h: Huella) => Math.hypot(h.x - P.x, h.y - P.y) > exc;
    const t0n = Math.min(ti - 1, ...huellas.map((h) => h.t0));
    const viejas: Huella[] = [];
    for (let q = pila.length - 1; q >= Math.max(0, pila.length - 6); q--) for (const h of pila[q].huellas) if (h.t1 > t0n && lejos(h)) viejas.push(h);
    if (viejas.length) {
      const nuevas = [...huellas.filter(lejos), ...muestras.filter((m, q) => !m.oculto && q % 4 === 0).map((m) => inst(m.x, m.y, m.r, m.t)).filter(lejos)];
      fuera: for (const h of nuevas) for (const o of viejas) {
        if (h.t0 < o.t1 && o.t0 < h.t1 && Math.hypot(h.x - o.x, h.y - o.y) < h.rad + o.rad + 6) { malo('pisa-propio'); break fuera; }
      }
    }
  }
  if (DIAG) { const k = cand.figura; const d = DIAG.get(k) ?? new Map<string, number>(); DIAG.set(k, d); d.set('_n', (d.get('_n') ?? 0) + 1); if (!viol) d.set('_ok', (d.get('_ok') ?? 0) + 1); for (const m of new Set(motivos.map((x) => x.replace(/=.*/, '')))) d.set(m, (d.get(m) ?? 0) + 1); }
  return { viol, motivos, costo, n, e, peg, muestras, huellas };
};
/** RITMO_DIAG=1: cuenta por figura los motivos de rechazo (para afinar el catálogo). */
const DIAG = process.env.RITMO_DIAG ? new Map<string, Map<string, number>>() : null;
export const diagnostico = () => DIAG && [...DIAG.entries()].map(([f, d]) => `${f}: ${[...d.entries()].sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('\n');
