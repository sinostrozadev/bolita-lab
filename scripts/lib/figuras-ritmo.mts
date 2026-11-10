/**
 * Catálogo de FIGURAS de movimiento de la plantilla "ritmo". Una figura lleva a la bolita desde el golpe i
 * (punto P, instante ti) hasta el golpe i+1 (punto Pj, instante tj = ti + dt) y dura EXACTAMENTE dt: el choque sigue
 * cayendo en el frame de su nota. Cada figura devuelve:
 *   - vOut: velocidad con que sale del golpe i (la clavija se orienta con ella; ver simular-ritmo.mts),
 *   - tramos: piezas continuas posición(s) que suman dt (la velocidad empata en cada unión: C1),
 *   - vFin: velocidad con que llega al golpe i+1,
 *   - objetos que la justifican (riel, rizo, paredes, columpio, hélice, trampolín, portales) y paredes sólidas.
 * Todo es determinista: el azar llega desde la semilla. Unidades de mundo (y hacia abajo), segundos.
 */
import type { FiguraRitmo, ObjetoSim } from '../../src/plantillas/ritmo/guion';

export type V = { x: number; y: number };
export type V3 = [number, number, number];
export type Tramo = { t0: number; dur: number; pos: (s: number) => V3; oculto?: boolean };
/** Cápsula sólida con vida [desde, hasta] (s): las paredes del zigzag. */
export type Solido = { x: number; y: number; nx: number; ny: number; largo: number; radio: number; desde: number; hasta: number; bolita: number };

export type Candidato = {
  figura: FiguraRitmo;
  vOut: V;
  tramos: Tramo[];
  Pj: V;
  vFin: V;
  objetos: ObjetoSim[];
  paredes: Solido[];
  estilo?: 'trampolin';
  /** Restitución permitida en la clavija de salida. */
  eRango?: [number, number];
  /** Subida máxima tolerada sobre el punto de salida. */
  subidaMax?: number;
  costo: number;
  motivos: string[];
  /** Figura grande (cuenta para el tope de figuras grandes a la vista). Falta = según la figura. */
  grande?: boolean;
};

export type Contexto = {
  P: V; vIn: V; ti: number; dt: number; tj: number; r: number; carril: number; bolita: number;
  G: number; semiCarril: number; azar: () => number;
  /** Punto objetivo del golpe i+1 (en el carril, cerca de la línea de descenso). lado: ±1 fuerza el costado. */
  objetivo: (lado?: number) => V;
  objetivoY: (t: number) => number;
  /** Carriles de bolitas ya generadas (para el cruce). */
  vecinos: number[];
  /** |x| máximo del centro de la bolita (entera dentro del cuadro). */
  xMax: number;
  /** Franja [xmin, xmax] del centro de la bolita (v3: las franjas de bolitas distintas no se tocan). */
  franja: [number, number];
  /** Instante del golpe anterior de la bolita (falta en el primero). */
  tPrev?: number;
};

/** Δt mínimo con que cabe cada figura (s). */
export const DT_MIN: Record<FiguraRitmo, number> = {
  parabola: 0, riel: 0.24, zigzag: 0.24, portal: 0.24, cruce: 0.6, pendulo: 0.62, trampolin: 0.9, espiral: 0.95, loop: 1.0,
};
/** Preferencia base (se divide por los usos de la bolita para repartir). */
export const PESO: Record<FiguraRitmo, number> = {
  parabola: 0.8, riel: 1.2, zigzag: 1.15, portal: 0.9, cruce: 1.0, pendulo: 1.4, trampolin: 1.1, espiral: 1.5, loop: 1.5,
};

/** Franja en que cabe el centro de un tubo de vidrio (radio r + 12) sin asomar de la franja de la bolita. */
const franjaTubo = (c: Contexto): [number, number] => [c.franja[0] + 12, c.franja[1] - 12];
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const esc = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k });
const len = (a: V) => Math.hypot(a.x, a.y);
const suave = (u: number) => u * u * (3 - 2 * u);

export const parab = (P: V, v: V, s: number, G: number): V => ({ x: P.x + v.x * s, y: P.y + v.y * s + 0.5 * G * s * s });
export const vParab = (P: V, Q: V, T: number, G: number): V => ({ x: (Q.x - P.x) / T, y: (Q.y - P.y - 0.5 * G * T * T) / T });
const tParab = (t0: number, dur: number, P: V, v: V, G: number): Tramo => ({ t0, dur, pos: (s) => { const p = parab(P, v, s, G); return [p.x, p.y, 0]; } });

/** Curva de Hermite cúbica de A (velocidad vA) a B (vB) en T segundos: posición y velocidad empatan en los extremos. */
export const hermite = (A: V, vA: V, B: V, vB: V, T: number, zA = 0, zB = 0) => (s: number): V3 => {
  const u = Math.max(0, Math.min(1, s / T)), u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return [h00 * A.x + h10 * T * vA.x + h01 * B.x + h11 * T * vB.x, h00 * A.y + h10 * T * vA.y + h01 * B.y + h11 * T * vB.y, zA + (zB - zA) * suave(u)];
};

/** Revisa que un tramo de riel sea "andable": sin frenazos, sin velocidades absurdas y sin codos más cerrados que la bolita. */
/** Conteo de rechazos internos (diagnóstico). */
export const RECHAZOS = new Map<string, number>();
const no = (m: string) => { RECHAZOS.set(m, (RECHAZOS.get(m) ?? 0) + 1); return null; };
export const calidadCurva = (pos: (s: number) => V3, T: number, r: number): string | null => {
  const m = calidadCurva_(pos, T, r);
  if (m) no(m);
  return m;
};
const calidadCurva_ = (pos: (s: number) => V3, T: number, r: number): string | null => {
  const N = Math.max(12, Math.ceil(T * 120));
  const h = T / N;
  let vmin = Infinity, vmax = 0, suma = 0;
  let prev: V | null = null;
  for (let i = 0; i < N; i++) {
    const a = pos(i * h), b = pos((i + 1) * h);
    const v = { x: (b[0] - a[0]) / h, y: (b[1] - a[1]) / h };
    const sp = len(v);
    vmin = Math.min(vmin, sp); vmax = Math.max(vmax, sp); suma += sp;
    if (prev && sp > 1 && len(prev) > 1) {
      const cos = (prev.x * v.x + prev.y * v.y) / (len(prev) * sp);
      const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      // giro máximo por cuadro de 1/120 s (≈ 48 rad/s): curvas cerradas solo si va lenta, nunca un codo
      if (ang > 0.4 * (h * 120)) return 'curva-cerrada';
    }
    prev = v;
  }
  const media = suma / N;
  if (vmin < Math.max(170, 0.22 * media)) return 'curva-lenta';
  if (vmax > 3400) return 'curva-veloz';
  return null;
};

/** Puntos del riel (centro de la bolita) cada 1/120 s, con su instante absoluto. */
const puntosRiel = (tramos: Tramo[], ti: number, paso = 1 / 120) => {
  const puntos: number[] = [], tiempos: number[] = [];
  for (const tr of tramos) {
    const n = Math.max(2, Math.ceil(tr.dur / paso));
    for (let k = puntos.length ? 1 : 0; k <= n; k++) {
      const p = tr.pos((k / n) * tr.dur);
      puntos.push(Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 10) / 10);
      tiempos.push(Math.round((ti + tr.t0 + (k / n) * tr.dur) * 10000) / 10000);
    }
  }
  return { puntos, tiempos };
};

const base = (c: Contexto, figura: FiguraRitmo, vOut: V, tramos: Tramo[], Pj: V, vFin: V): Candidato =>
  ({ figura, vOut, tramos, Pj, vFin, objetos: [], paredes: [], costo: 0, motivos: [] });

/** Velocidad aleatoria de salida: ángulo desde "hacia abajo" en ±maxAng y rapidez en [a, b]. */
const vAzar = (azar: () => number, maxAng: number, a: number, b: number): V => {
  const ang = (azar() * 2 - 1) * maxAng, sp = a + azar() * (b - a);
  return { x: Math.sin(ang) * sp, y: Math.cos(ang) * sp };
};
/** Velocidad de llegada a una clavija: hacia abajo y hacia donde viaja. */
const vLlegada = (azar: () => number, dirX: number): V => {
  const ang = dirX * (0.1 + azar() * 0.9), sp = 700 + azar() * 900;
  return { x: Math.sin(ang) * sp, y: Math.cos(ang) * sp };
};

// ---------------------------------------------------------------- (i) parábola simple

export const parabola = (c: Contexto): Candidato => {
  const Pj = c.objetivo();
  const v = vParab(c.P, Pj, c.dt, c.G);
  return base(c, 'parabola', v, [tParab(0, c.dt, c.P, v, c.G)], Pj, { x: v.x, y: v.y + c.G * c.dt });
};

// ---------------------------------------------------------------- (f) trampolín

/** La clavija de salida es un trampolín: la lanza alto y cae largo. */
export const trampolin = (c: Contexto): Candidato | null => {
  const Pj = c.objetivo();
  const v = vParab(c.P, Pj, c.dt, c.G);
  const subida = v.y < 0 ? (v.y * v.y) / (2 * c.G) : 0;
  if (subida < 260) return null;
  const cand = base(c, 'trampolin', v, [tParab(0, c.dt, c.P, v, c.G)], Pj, { x: v.x, y: v.y + c.G * c.dt });
  cand.estilo = 'trampolin';
  cand.eRango = [0.5, 2.8];
  cand.subidaMax = 1250;
  cand.costo = -0.3;
  return cand;
};

// ---------------------------------------------------------------- (c) zigzag entre dos paredes

const plegar = (X: number, a: number, L: number) => {
  let z = (X - a) % (2 * L);
  if (z < 0) z += 2 * L;
  return z <= L ? a + z : a + 2 * L - z;
};

export const zigzag = (c: Contexto): Candidato | null => {
  const { P, r, azar, dt, G } = c;
  const h = 25 + azar() * 70; // semiancho del pasillo para el CENTRO de la bolita
  const centro = P.x + (azar() * 2 - 1) * h * 0.7;
  const a = Math.max(c.franja[0], centro - h), b = Math.min(c.franja[1], centro + h), L = b - a;
  if (L < 40) return null;
  if (P.x < a + 3 || P.x > b - 3) return null;
  const m = 1 + Math.floor(azar() * (dt > 1.0 ? 5 : dt > 0.6 ? 3 : 2));
  const signo = azar() < 0.5 ? -1 : 1;
  const u = a + azar() * L;
  const primera = signo > 0 ? b - P.x : P.x - a;
  const resto = m % 2 === 1 ? (signo > 0 ? b - u : u - a) : (signo > 0 ? u - a : b - u);
  const dist = primera + (m - 1) * L + resto;
  const vx = signo * dist / dt;
  if (Math.abs(vx) > 2100 || Math.abs(vx) < 200) return null;
  const Pj = { x: u, y: c.objetivoY(c.tj) + (azar() * 2 - 1) * 110 };
  const vy = (Pj.y - P.y - 0.5 * G * dt * dt) / dt;
  const pos = (s: number): V3 => [plegar(P.x + vx * s, a, L), P.y + vy * s + 0.5 * G * s * s, 0];
  // Rebotes: el desplegado cruza a + kL.
  const toques: { s: number; lado: -1 | 1; y: number }[] = [];
  const k0 = Math.floor((P.x - a) / L);
  for (let j = 1; j <= m + 1; j++) {
    const k = signo > 0 ? k0 + j : k0 + 1 - j;
    const s = (a + k * L - P.x) / vx;
    if (s > 1e-6 && s < dt - 1e-6) toques.push({ s, lado: ((k % 2) + 2) % 2 === 0 ? -1 : 1, y: P.y + vy * s + 0.5 * G * s * s });
  }
  if (toques.length !== m) return null;
  const vFinX = m % 2 === 1 ? -vx : vx;
  const cand = base(c, 'zigzag', { x: vx, y: vy }, [{ t0: 0, dur: dt, pos }], Pj, { x: vFinX, y: vy + G * dt });
  for (const lado of [-1, 1] as const) {
    const mios = toques.filter((t) => t.lado === lado);
    if (!mios.length) continue;
    const y0 = Math.min(...mios.map((t) => t.y)) - (r + 28), y1 = Math.max(...mios.map((t) => t.y)) + (r + 28);
    // v3: nada de paredes larguísimas (se ven como palos sueltos) ni que asomen del cuadro
    if (y1 - y0 > 2 * r + 56 + 180) return no('zigzag-pared-larga');
    const x = lado < 0 ? a - r - 8 : b + r + 8;
    if (Math.abs(x) + 8 > 546) return no('zigzag-pared-fuera');
    const desde = c.ti - 0.25, hasta = c.tj + 0.3;
    cand.objetos.push({ tipo: 'pared', bolita: c.bolita, x, y0, y1, lado, desde, hasta, toques: mios.map((t) => c.ti + t.s) });
    cand.paredes.push({ x, y: (y0 + y1) / 2, nx: -lado, ny: 0, largo: (y1 - y0) / 2, radio: 8, desde, hasta, bolita: c.bolita });
  }
  cand.costo = -0.2;
  return cand;
};

// ---------------------------------------------------------------- conector de riel (serpentina)

/**
 * Riel de A (vA) a B (vB) en exactamente T segundos. Si T sobra para la distancia (Δt largos), el riel serpentea por
 * puntos de paso alternados a los lados del carril (o por los `paso` que se le den) para que la bolita vaya a una
 * rapidez creíble (≈ 700–1500 u/s) en vez de arrastrarse. Tangentes interiores Catmull-Rom; cada pieza es Hermite.
 */
export const conector = (
  c: Contexto, A: V, vA: V, B: V, vB: V, T: number, t0: number, zA = 0, zB = 0, paso: V[] = [],
): Tramo[] | null => {
  const { azar, r, carril } = c;
  const pts: V[] = [A];
  if (paso.length) pts.push(...paso);
  else {
    const cuerda = Math.hypot(B.x - A.x, B.y - A.y);
    const vObj = Math.max(600, Math.min(1400, (len(vA) + len(vB)) / 2));
    // v3: a lo más 2 puntos de paso (rieles menos enredados); el resto del tiempo lo absorbe una rapidez menor.
    const n = cuerda > 0.6 * vObj * T ? 0 : Math.min(2, Math.max(1, Math.round((vObj * T - cuerda) / 420)));
    // Puntos de paso en una caja alrededor del carril (el riel puede bajar de más y volver a subir a la clavija).
    const yLo = Math.min(A.y, B.y) - 120, yHi = Math.max(A.y, B.y) + 240;
    let lado = azar() < 0.5 ? -1 : 1;
    for (let k = 1; k <= n; k++) {
      pts.push({ x: Math.max(franjaTubo(c)[0], Math.min(franjaTubo(c)[1], carril + lado * (20 + azar() * Math.max(10, c.semiCarril - 20)))), y: yLo + azar() * (yHi - yLo) });
      lado = -lado;
    }
  }
  pts.push(B);
  const largos = pts.slice(1).map((p, k) => Math.hypot(p.x - pts[k].x, p.y - pts[k].y) + 1);
  const total = largos.reduce((a, b) => a + b, 0);
  const ts = [0];
  for (const l of largos) ts.push(ts[ts.length - 1] + (T * l) / total);
  const vs: V[] = pts.map((p, k) => {
    if (k === 0) return vA;
    if (k === pts.length - 1) return vB;
    // tangente con la dirección de Catmull-Rom y la rapidez media del riel (curvas redondas, sin frenazos)
    const d = { x: pts[k + 1].x - pts[k - 1].x, y: pts[k + 1].y - pts[k - 1].y }, l = len(d) || 1;
    return { x: (d.x / l) * (total / T), y: (d.y / l) * (total / T) };
  });
  const zEn = (k: number) => zA + (zB - zA) * suave(ts[k] / T);
  const tramos: Tramo[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const dur = ts[k + 1] - ts[k];
    const pos = hermite(pts[k], vs[k], pts[k + 1], vs[k + 1], dur, zEn(k), zEn(k + 1));
    if (calidadCurva(pos, dur, r)) return null;
    tramos.push({ t0: t0 + ts[k], dur, pos });
  }
  if (!rielLimpio(tramos, r)) return null;
  return tramos;
};

/** Largo de un camino (u), muestreado a 120 Hz. */
export const largoCamino = (tramos: Tramo[]) => {
  let L = 0;
  for (const tr of tramos) {
    const n = Math.max(2, Math.ceil(tr.dur * 120));
    let a = tr.pos(0);
    for (let k = 1; k <= n; k++) { const b = tr.pos((k / n) * tr.dur); L += Math.hypot(b[0] - a[0], b[1] - a[1]); a = b; }
  }
  return L;
};

/**
 * v3: un riel "limpio" no tiene curvas más cerradas que 1,25 radios de la bolita (se ve como un codo) ni se cruza
 * consigo mismo (dos tramos del tubo que se tocan se leen como un nudo).
 */
export const rielLimpio = (tramos: Tramo[], r: number) => {
  const p: V[] = [];
  for (const tr of tramos) {
    const n = Math.max(2, Math.ceil(tr.dur / (1 / 120)));
    for (let k = p.length ? 1 : 0; k <= n; k++) { const q = tr.pos((k / n) * tr.dur); p.push({ x: q[0], y: q[1] }); }
  }
  const arco = [0];
  for (let k = 1; k < p.length; k++) arco.push(arco[k - 1] + Math.hypot(p[k].x - p[k - 1].x, p[k].y - p[k - 1].y));
  const rMin = 1.25 * r, tubo = r + 12;
  // radio de curvatura con puntos separados ~ r/2 de arco
  for (let k = 0, j = 0, l = 0; k < p.length; k++) {
    while (j < p.length - 1 && arco[j] < arco[k] + r * 0.5) j++;
    while (l < p.length - 1 && arco[l] < arco[j] + r * 0.5) l++;
    if (l === j || j === k) break;
    const a = p[k], b = p[j], c = p[l];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (area2 > 1e-6 && (ab * bc * ca) / (2 * area2) < rMin) { no('riel-codo'); return false; }
  }
  for (let i = 0; i < p.length; i += 2) for (let j = i + 2; j < p.length; j += 2) {
    if (arco[j] - arco[i] < 3.2 * tubo) continue;
    if (Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y) < 2 * tubo + 4) { no('riel-nudo'); return false; }
  }
  return true;
};

/** Velocidad de llegada a una clavija para un riel de duración T: hacia abajo y hacia donde viaja. */
const vLlegadaRiel = (azar: () => number, dirX: number) => {
  const ang = dirX * (0.15 + azar() * 0.85), sp = 750 + azar() * 650;
  return { x: Math.sin(ang) * sp, y: Math.cos(ang) * sp };
};

/** Salida de un golpe hacia un riel: rebota hacia arriba y al costado (choque creíble) y el riel la recoge pasado el
 * ápice, ya bajando, para que no tenga que dar una vuelta en U. Devuelve vOut, el vuelo ta y el punto/velocidad de entrada. */
const salidaRiel = (c: Contexto, dirX: number, maxFrac = 0.45, vyMax = 900) => {
  const { P, azar, G, dt } = c;
  const vy = -(100 + azar() * Math.min(vyMax, 2400 * dt));
  const vx = dirX * (150 + azar() * 550);
  const vOut = { x: vx, y: vy };
  const ta = Math.max(0.04, Math.min(maxFrac * dt, -vy / G + 0.02 + azar() * 0.08));
  const E = parab(P, vOut, ta, G), vE = { x: vOut.x, y: vOut.y + G * ta };
  return { vOut, ta, E, vE };
};

// ---------------------------------------------------------------- (a) riel curvo

export const riel = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti } = c;
  const Pj = c.objetivo();
  const { vOut, ta, E, vE } = salidaRiel(c, Math.sign(Pj.x - P.x) || 1);
  const vA = vLlegadaRiel(azar, Math.sign(Pj.x - E.x) || 1);
  const resto = conector(c, E, vE, Pj, vA, dt - ta, ta);
  if (!resto) return null;
  const tramos: Tramo[] = [tParab(0, ta, P, vOut, G), ...resto];
  const cand = base(c, 'riel', vOut, tramos, Pj, vA);
  cand.grande = largoCamino(resto) > 520; // el riel serpenteante largo cuenta como figura grande
  cand.objetos.push({ tipo: 'riel', bolita: c.bolita, figura: 'riel', ...puntosRiel(resto, ti) });
  return cand;
};

// ---------------------------------------------------------------- (h) cruce con otra bolita

/** Riel que se desvía por el carril de una vecina ya generada y vuelve: los caminos se cruzan sin chocar. */
export const cruce = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti } = c;
  const vecinos = c.vecinos.filter((x) => Math.abs(x - c.carril) < 260 && x !== c.carril);
  if (!vecinos.length) return null;
  const vx = vecinos[Math.floor(azar() * vecinos.length)];
  const { vOut, ta, E, vE } = salidaRiel(c, Math.sign(vx - c.carril), 0.35);
  const Pj = c.objetivo(Math.sign(c.carril - vx));
  const W = { x: vx + (azar() * 2 - 1) * 60, y: E.y + (Pj.y - E.y) * (0.3 + azar() * 0.4) + (azar() * 2 - 1) * 90 };
  const vA = vLlegadaRiel(azar, Math.sign(c.carril - vx));
  const resto = conector(c, E, vE, Pj, vA, dt - ta, ta, 0, 0, [W]);
  if (!resto) return null;
  const tramos: Tramo[] = [tParab(0, ta, P, vOut, G), ...resto];
  const cand = base(c, 'cruce', vOut, tramos, Pj, vA);
  cand.objetos.push({ tipo: 'riel', bolita: c.bolita, figura: 'cruce', ...puntosRiel(resto, ti) });
  return cand;
};

// ---------------------------------------------------------------- (b) loop (rizo completo)

/** Tabla φ(s) del rizo con rapidez física v² = vL² − 2·g·R·(1 − cos φ) (tubo: puede ir lento arriba). */
const tablaRizo = (R: number, vL: number, G: number) => {
  const h = 1 / 1200;
  const fs: number[] = [0];
  let phi = 0;
  const w = (p: number) => Math.sqrt(Math.max(1e-6, vL * vL - 2 * G * R * (1 - Math.cos(p)))) / R;
  while (phi < 2 * Math.PI) {
    const k1 = w(phi), k2 = w(phi + 0.5 * h * k1), k3 = w(phi + 0.5 * h * k2), k4 = w(phi + h * k3);
    phi += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    fs.push(Math.min(phi, 2 * Math.PI));
    if (fs.length > 20000) return null;
  }
  // tiempo exacto al cerrar el círculo (interpolando el último paso)
  const n = fs.length - 1;
  const T = (n - 1) * h + h * ((2 * Math.PI - fs[n - 1]) / Math.max(1e-9, phi - fs[n - 1]));
  const phiDe = (s: number) => { const x = Math.max(0, Math.min(T, s)) / h; const i = Math.min(n - 1, Math.floor(x)); return fs[i] + (fs[i + 1] - fs[i]) * (x - i); };
  return { T, phiDe };
};

export const loop = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti, r } = c;
  const dir = c.P.x > c.carril ? -1 : 1; // el rizo avanza hacia el centro del carril
  const R = r + 12 + azar() * 22; // v3: rizo más compacto, cabe en la franja de la melodía
  const vL = Math.sqrt((5.5 + azar() * 1.5) * G * R); // arriba va a √((1,5..3)·g·R): pasa el rizo con soltura
  const tabla = tablaRizo(R, vL, G);
  if (!tabla) return null;
  // Geometría desde la llegada: clavija Pj, delante la salida del rizo B2, el rizo en B y la rampa de entrada E→B.
  const o = c.objetivo(dir);
  const corrimiento = dir * r * 0.45; // la salida queda al lado de la entrada (como un rizo real visto de frente)
  const [f0, f1] = franjaTubo(c);
  const bMin = dir > 0 ? f0 + R : f0 + R + Math.abs(corrimiento), bMax = dir > 0 ? f1 - R - Math.abs(corrimiento) : f1 - R;
  if (bMin > bMax) return no('loop-no-cabe');
  const B = { x: Math.max(bMin, Math.min(bMax, P.x + dir * (20 + azar() * 60))), y: o.y - 60 - azar() * 80 };
  const B2 = { x: B.x + corrimiento, y: B.y };
  const Pj = { x: Math.max(f0, Math.min(f1, B2.x + dir * (40 + azar() * 80))), y: B2.y + 70 + azar() * 70 };
  const E = { x: Math.max(f0, Math.min(f1, B.x - dir * (60 + azar() * 80))), y: B.y - 150 - azar() * 90 };
  const T1 = 0.26 + azar() * 0.12;
  const T3 = Math.hypot(Pj.x - B2.x, Pj.y - B2.y) / (0.85 * vL);
  const ta = dt - T1 - tabla.T - T3;
  if (ta < 0.06) return no('loop-sin-tiempo');
  // el rebote la lanza para que caiga en la rampa: el vuelo absorbe el tiempo que sobra
  const vOut = vParab(P, E, ta, G);
  const vE = { x: vOut.x, y: vOut.y + G * ta };
  const posRizo = (s: number): V3 => {
    const phi = tabla.phiDe(s);
    return [B.x + dir * R * Math.sin(phi) + corrimiento * (phi / (2 * Math.PI)), B.y - R * (1 - Math.cos(phi)), 0];
  };
  const vB = { x: dir * vL + corrimiento * (vL / R) / (2 * Math.PI), y: 0 };
  const aA = dir * (0.8 + azar() * 0.5), sA = 0.85 * vL;
  const vA = { x: Math.sin(aA) * sA, y: Math.cos(aA) * sA };
  const c1 = hermite(E, vE, B, vB, T1);
  if (calidadCurva(c1, T1, r)) return no('loop-entrada');
  const c3 = hermite(B2, vB, Pj, vA, T3);
  if (calidadCurva(c3, T3, r)) return no('loop-salida');
  const tramos: Tramo[] = [tParab(0, ta, P, vOut, G), { t0: ta, dur: T1, pos: c1 }, { t0: ta + T1, dur: tabla.T, pos: posRizo }, { t0: ta + T1 + tabla.T, dur: T3, pos: c3 }];
  const cand = base(c, 'loop', vOut, tramos, Pj, vA);
  if (Math.abs(Pj.x - c.carril) > c.semiCarril * 1.9) cand.motivos.push('loop-fuera-carril');
  cand.objetos.push({ tipo: 'riel', bolita: c.bolita, figura: 'loop', ...puntosRiel(tramos.slice(1), ti) });
  cand.costo = -0.4;
  return cand;
};

// ---------------------------------------------------------------- (e) rampa en hélice (3D)

export const espiral = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti, r } = c;
  const dir = azar() < 0.5 ? -1 : 1;
  const ax = 45 + azar() * 40, az = 200 + azar() * 120, w = 9 + azar() * 4;
  const vy = 260 + azar() * 240;
  const vueltas = [1, 1.5, 2].filter((n) => (2 * Math.PI * n) / w <= dt - 0.45);
  if (!vueltas.length) return no('espiral-sin-tiempo');
  const n = vueltas[Math.floor(azar() * vueltas.length)];
  const Th = (2 * Math.PI * n) / w;
  const o = c.objetivo();
  const H0 = { x: Math.max(franjaTubo(c)[0] + ax, Math.min(franjaTubo(c)[1] - ax, P.x + dir * (10 + azar() * 50))), y: o.y - 110 - vy * Th - azar() * 60 };
  const posH = (s: number): V3 => [H0.x + dir * ax * Math.sin(w * s), H0.y + vy * s, az * Math.cos(w * s)];
  const fin = posH(Th);
  const H1 = { x: fin[0], y: fin[1] };
  const v0 = { x: dir * ax * w, y: vy }, v1 = { x: dir * ax * w * Math.cos(w * Th), y: vy };
  const sx = Math.sign(v1.x) || 1;
  const Pj = { x: Math.max(franjaTubo(c)[0], Math.min(franjaTubo(c)[1], H1.x + sx * (40 + azar() * 70))), y: H1.y + 70 + azar() * 70 };
  const E = { x: Math.max(franjaTubo(c)[0], Math.min(franjaTubo(c)[1], H0.x - dir * (60 + azar() * 70))), y: H0.y - 110 - azar() * 70 };
  const T1 = 0.18 + azar() * 0.1;
  const sp1 = len(v1);
  const T3 = Math.hypot(Pj.x - H1.x, Pj.y - H1.y) / (0.95 * sp1);
  const ta = dt - T1 - Th - T3;
  if (ta < 0.06) return no('espiral-sin-tiempo');
  const vOut = vParab(P, E, ta, G);
  const vE = { x: vOut.x, y: vOut.y + G * ta };
  const aA = sx * (0.5 + azar() * 0.5);
  const vA = { x: Math.sin(aA) * sp1 * 1.05, y: Math.cos(aA) * sp1 * 1.05 };
  const c1 = hermite(E, vE, H0, v0, T1, 0, az);
  if (calidadCurva(c1, T1, r)) return no('espiral-entrada');
  const c3 = hermite(H1, v1, Pj, vA, T3, fin[2], 0);
  if (calidadCurva(c3, T3, r)) return no('espiral-salida');
  const tramos: Tramo[] = [tParab(0, ta, P, vOut, G), { t0: ta, dur: T1, pos: c1 }, { t0: ta + T1, dur: Th, pos: posH }, { t0: ta + T1 + Th, dur: T3, pos: c3 }];
  const cand = base(c, 'espiral', vOut, tramos, Pj, vA);
  if (Math.abs(Pj.x - c.carril) > c.semiCarril * 1.9) cand.motivos.push('espiral-fuera-carril');
  cand.objetos.push({ tipo: 'riel', bolita: c.bolita, figura: 'espiral', ...puntosRiel(tramos.slice(1), ti) });
  cand.costo = -0.4;
  return cand;
};

// ---------------------------------------------------------------- (d) péndulo / columpio

/** RK4 de θ'' = −(g/L)·sin θ (+ amortiguación opcional) con paso h; devuelve θ y ω en cada paso. */
const integrarPendulo = (th: number, om: number, L: number, G: number, T: number, h: number, amort = 0) => {
  const n = Math.max(1, Math.ceil(Math.abs(T / h)));
  const hh = T / n;
  const th_: number[] = [th], om_: number[] = [om];
  const f = (t: number, o: number) => -(G / L) * Math.sin(t) - amort * o;
  for (let i = 0; i < n; i++) {
    const k1t = om, k1o = f(th, om);
    const k2t = om + 0.5 * hh * k1o, k2o = f(th + 0.5 * hh * k1t, om + 0.5 * hh * k1o);
    const k3t = om + 0.5 * hh * k2o, k3o = f(th + 0.5 * hh * k2t, om + 0.5 * hh * k2o);
    const k4t = om + hh * k3o, k4o = f(th + hh * k3t, om + hh * k3o);
    th += (hh / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    om += (hh / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    th_.push(th); om_.push(om);
  }
  const en = (s: number) => { const x = Math.max(0, Math.min(n, s / Math.abs(hh))); const i = Math.min(n - 1, Math.floor(x)); const u = x - i; return th_[i] + (th_[i + 1] - th_[i]) * u; };
  return { th: th_[n], om: om_[n], en, n, hh, th_ };
};

/** La bolita cae en la copa de un columpio que viene oscilando con su misma velocidad; el columpio la lleva y la
 * estrella contra la clavija del golpe siguiente (ahí la suelta y rebota hacia atrás). */
export const pendulo = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti, tj } = c;
  const ta = 0.12 + azar() * Math.min(0.2, dt - 0.45);
  const Ts = dt - ta;
  if (Ts < 0.4) return null;
  // Se elige el columpio para que en Ts recorra ~60–85 % de media oscilación (llega al otro lado con rapidez):
  // media oscilación ≈ π·√(L/g) → L ≈ g·(Ts / (k·π))².
  const k = 0.6 + azar() * 0.25;
  const L = Math.max(140, Math.min(420, G * (Ts / (k * Math.PI)) ** 2));
  const lado = c.P.x > c.carril ? 1 : -1; // empieza del lado donde está y cruza hacia el otro
  const thC = lado * (0.45 + azar() * 0.6);
  const omC = -lado * azar() * 0.5 * Math.sqrt(G / L);
  const vE = { x: L * omC * Math.cos(thC), y: -L * omC * Math.sin(thC) };
  const vOut = { x: vE.x, y: vE.y - G * ta };
  const C = parab(P, vOut, ta, G);
  const Q = { x: C.x - L * Math.sin(thC), y: C.y - L * Math.cos(thC) };
  const ida = integrarPendulo(thC, omC, L, G, Ts, 1 / 960);
  let thMax = 0;
  for (const t of ida.th_) thMax = Math.max(thMax, Math.abs(t));
  if (thMax > 2.2) return null;
  if (Math.abs(ida.th - thC) < 0.5) return null;
  const Pj = { x: Q.x + L * Math.sin(ida.th), y: Q.y + L * Math.cos(ida.th) };
  const vFin = { x: L * ida.om * Math.cos(ida.th), y: -L * ida.om * Math.sin(ida.th) };
  if (len(vFin) < 450) return null;
  const posArco = (s: number): V3 => { const t = ida.en(s); return [Q.x + L * Math.sin(t), Q.y + L * Math.cos(t), 0]; };
  const tramos: Tramo[] = [tParab(0, ta, P, vOut, G), { t0: ta, dur: Ts, pos: posArco }];
  const cand = base(c, 'pendulo', vOut, tramos, Pj, vFin);
  // Lo cerca que quedó del objetivo (el columpio no apunta: se busca entre muchos).
  const objY = c.objetivoY(tj);
  const dy = Pj.y - objY, dx = Math.abs(Pj.x - c.carril);
  if (Math.abs(dy) > 240) cand.motivos.push('pendulo-fuera-linea');
  if (dx > c.semiCarril * 1.7) cand.motivos.push('pendulo-fuera-carril');
  cand.costo = (dy / 160) ** 2 + Math.max(0, dx - c.semiCarril) / 100 - 0.4;
  // Ángulos por frame: antes de agarrarla (viene oscilando: integración hacia atrás), la carga, y al soltarla rebota.
  const FPS = 60;
  const tAgarra = ti + ta;
  const desdeFrame = Math.floor((tAgarra - 0.9) * FPS);
  const hastaFrame = Math.ceil((tj + 1.0) * FPS);
  const atras = integrarPendulo(thC, omC, L, G, -(tAgarra - desdeFrame / FPS) - 0.02, 1 / 960);
  const despues = integrarPendulo(ida.th, -0.45 * ida.om, L, G, (hastaFrame / FPS - tj) + 0.02, 1 / 960, 1.2);
  const angulos: number[] = [];
  for (let f = desdeFrame; f <= hastaFrame; f++) {
    const t = f / FPS;
    let a: number;
    if (t < tAgarra) a = atras.en(tAgarra - t);
    else if (t <= tj) a = ida.en(t - tAgarra);
    else a = despues.en(t - tj);
    angulos.push(Math.round(a * 10000) / 10000);
  }
  cand.objetos.push({ tipo: 'pendulo', bolita: c.bolita, px: Q.x, py: Q.y, largo: L, desdeFrame, angulos, agarra: tAgarra, suelta: tj });
  return cand;
};

// ---------------------------------------------------------------- (g) tubo / portal

export const portal = (c: Contexto): Candidato | null => {
  const { P, azar, dt, G, ti } = c;
  const ta = 0.07 + azar() * Math.min(0.3, 0.3 * dt);
  const Tp = dt > 0.5 ? 0.04 + azar() * 0.1 : 0;
  const tb = dt - ta - Tp;
  if (tb < 0.08) return null;
  const E = { x: P.x + (azar() < 0.5 ? -1 : 1) * (40 + azar() * 140), y: P.y + 20 + azar() * 140 };
  const vOut = vParab(P, E, ta, G);
  const vE = { x: vOut.x, y: vOut.y + G * ta };
  const Pj = c.objetivo();
  const sp = len(vE) * (0.85 + azar() * 0.3);
  const ang = (azar() * 2 - 1) * 1.2;
  const vX = { x: Math.sin(ang) * sp, y: Math.cos(ang) * sp };
  const X = { x: Pj.x - vX.x * tb, y: Pj.y - vX.y * tb - 0.5 * G * tb * tb };
  const cand = base(c, 'portal', vOut, [
    tParab(0, ta, P, vOut, G),
    { t0: ta, dur: Tp, pos: () => [X.x, X.y, 0], oculto: true },
    tParab(ta + Tp, tb, X, vX, G),
  ], Pj, { x: vX.x, y: vX.y + G * tb });
  if (Math.hypot(X.x - E.x, X.y - E.y) < 220) cand.motivos.push('portal-corto');
  if (X.y > Pj.y - 20) cand.motivos.push('portal-bajo');
  cand.objetos.push({
    tipo: 'portal', bolita: c.bolita, ax: E.x, ay: E.y, aAng: Math.atan2(vE.y, vE.x), bx: X.x, by: X.y, bAng: Math.atan2(vX.y, vX.x),
    entra: ti + ta, sale: ti + ta + Tp,
  });
  return cand;
};

export const CONSTRUCTORES: Record<FiguraRitmo, (c: Contexto) => Candidato | null> = {
  parabola, riel, loop, zigzag, pendulo, espiral, trampolin, portal, cruce,
};

export { add, esc };
