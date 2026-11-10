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
  FIGURAS_RITMO, GuionRitmo, PartituraRitmo, type BolitaSim, type ClavijaSim, type FiguraRitmo, type GolpeSim, type ObjetoSim,
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

const G = 2800; // unidades/s² (la vista mide 1100 unidades de ancho)
/** Ancho de la vista en unidades de mundo (debe coincidir con ANCHO_VISTA de Ritmo.tsx): cámara cerca del grupo. */
const ANCHO_MUNDO = 1100;
/** |x| + r ≤ BORDE: la bolita entera dentro del cuadro. */
const BORDE = 540;
/** Semiancho útil del carril para el centro de la bolita. */
const SEMI_CARRIL = 95;
/** Muestreo para detectar choques no deseados (240 Hz: < 13 unidades entre muestras a 3000 u/s). */
const SUB = 4;

type Config = { pista: PistaRitmo; carril: number; r: number; color: string; brillo: number; largo: number; radio: number; desfase: number };
const CONFIG: Config[] = [
  // Orden de generación = orden de prioridad (la melodía elige primero su camino). Bolitas grandes (diámetro ≥ 7 % del
  // alto del cuadro) y escalonadas en altura (desfase) para que las figuras tengan lugar sin chocar con la vecina.
  { pista: 'melodia', carril: 0, r: 78, color: PALETA.neon.amarillo, brillo: 1.0, largo: 56, radio: 15, desfase: 0 },
  { pista: 'bajo', carril: -190, r: 76, color: PALETA.neon.violeta, brillo: 0.55, largo: 60, radio: 16, desfase: -170 },
  { pista: 'kick', carril: -380, r: 72, color: PALETA.neon.naranja, brillo: 0.85, largo: 0, radio: 22, desfase: 160 },
  { pista: 'snare', carril: 190, r: 71, color: PALETA.rojo, brillo: 0.85, largo: 0, radio: 19, desfase: 170 },
  { pista: 'hat', carril: 380, r: 70, color: PALETA.neon.cian, brillo: 0.85, largo: 0, radio: 16, desfase: -150 },
];

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
/** Las clavijas aparecen (crecen) 1 s antes de su golpe, como los rieles: el circuito se arma por delante de las
 * bolitas. Así solo estorban en su ventana de vida y no durante todo el video. Debe coincidir con Ritmo.tsx. */
export const FRAMES_APARECE = 60;
const iniVida = (c: { golpe: number }) => (c.golpe - FRAMES_APARECE) / FPS;
const conviven = (a: { golpe: number }, b: { golpe: number }) => iniVida(a) < finVida(b) && iniVida(b) < finVida(a);

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
  const ev = eventosDe(partitura);
  const finalFrame = Math.max(...Object.values(ev).map((l) => l[l.length - 1].frame));
  const duracionFrames = finalFrame + FRAMES_CLIMAX + FRAMES_CIERRE;
  const linea = crearLinea(duracionFrames / FPS + 2);
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

  CONFIG.slice(0, Number(process.env.RITMO_BOLITAS ?? CONFIG.length)).forEach((cfg, b) => {
    const lista = ev[cfg.pista];
    const vecinos = CONFIG.slice(0, b).map((c) => c.carril);
    const xMax = BORDE - cfg.r;
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
      const objetivoY = (t: number) => linea(t) + cfg.desfase;
      let P: V = { x: cfg.carril + (azar() * 2 - 1) * SEMI_CARRIL * 0.6, y: objetivoY(t0) };
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

      // Pila de pasos aceptados: si un golpe no encuentra camino limpio, se deshace el anterior y se rehace con otro
      // azar (retroceso acotado). Lo deshecho se marca muerto en los índices propios.
      type Paso = { peg: ClavijaSim; muestras: Muestra[]; paredes: Solido[]; nSeg: number; nObj: number; figura: FiguraRitmo | null;
        anterior: FiguraRitmo | null; P: V; vIn: V; reparo?: string };
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
          P, vIn, ti, dt, tj, r: cfg.r, carril: cfg.carril, bolita: b, G, semiCarril: SEMI_CARRIL, azar, objetivoY, vecinos, xMax,
          objetivo: (ladoForzado?: number) => {
            const lado = ladoForzado ?? (P.x > cfg.carril ? -1 : 1);
            const x = cfg.carril + lado * azar() * SEMI_CARRIL * (ladoForzado || azar() < 0.75 ? 1 : -0.6);
            return { x: Math.max(-xMax, Math.min(xMax, x)), y: objetivoY(tj) + (azar() * 2 - 1) * 110 };
          },
        };
        // Orden de figuras a probar: las que caben en Δt, nunca la anterior, las menos usadas primero (con azar).
        let orden: FiguraRitmo[];
        if (ultimo) orden = ['parabola'];
        else {
          orden = FIGURAS_RITMO.filter((f) => f !== anterior && dt >= DT_MIN[f] && (f !== 'cruce' || vecinos.length > 0))
            .map((f) => ({ f, p: (PESO[f] / (1 + 1.4 * (usos.get(f) ?? 0))) * (0.4 + azar()) }))
            .sort((a, z) => z.p - a.p).map((o) => o.f).slice(0, 3);
          if (!orden.includes('parabola') && anterior !== 'parabola') orden.push('parabola');
        }
        type Mejor = { costo: number; viol: number; cand: Candidato; n: V; e: number; peg: ClavijaSim; muestras: Muestra[]; motivos: string[] };
        let mejor: Mejor | null = null;
        const vigentesPegs = [pegsGlobal, misPegs];
        const vigentesMuros = [murosGlobal, misMuros];
        for (const figura of orden) {
          let mejorFig: Mejor | null = null;
          const intentos = ultimo ? 40 : figura === 'parabola' ? 90 : 45;
          for (let k = 0; k < intentos; k++) {
            let cand: Candidato | null;
            if (ultimo) {
              const Pj = { x: Math.max(-xMax, Math.min(xMax, P.x + (azar() * 2 - 1) * 60)), y: P.y - 150 - azar() * 120 };
              const v = vParab(P, Pj, dt, G);
              cand = { figura: 'parabola', vOut: v, tramos: [{ t0: 0, dur: dt, pos: (s) => [P.x + v.x * s, P.y + v.y * s + 0.5 * G * s * s, 0] }], Pj, vFin: { x: v.x, y: v.y + G * dt }, objetos: [], paredes: [], costo: 0, motivos: [] };
            } else cand = CONSTRUCTORES[figura](ctx);
            if (!cand) continue;
            const cota = DIAG ? 99 : Math.min(mejorFig?.viol ?? 99, mejor?.viol ?? 99);
            const r = evaluar(cand, ctx, ultimo, i === 0, vigentesPegs, vigentesMuros, otras, propiasIdx, linea, xMax, cfg, cota);
            if (!r) continue;
            if (!mejorFig || r.viol < mejorFig.viol || (r.viol === mejorFig.viol && r.costo < mejorFig.costo)) mejorFig = { ...r, cand };
            if (mejorFig.viol === 0 && k > 5) break;
          }
          if (mejorFig && (!mejor || mejorFig.viol < mejor.viol)) mejor = mejorFig;
          if (mejor && mejor.viol === 0) break;
        }
        if (!mejor) for (let k = 0; k < 60; k++) { // último recurso: parábola aunque repita figura
          const cand = CONSTRUCTORES.parabola(ctx)!;
          const r = evaluar(cand, ctx, ultimo, i === 0, vigentesPegs, vigentesMuros, otras, propiasIdx, linea, xMax, cfg);
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
          figura: ultimo ? null : cand.figura, anterior, P, vIn,
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
          misTramos.push({ bolita: b, figura: cand.figura, desde: lista[i].frame, hasta: lista[i + 1].frame });
          usos.set(cand.figura, (usos.get(cand.figura) ?? 0) + 1);
          if (anterior === cand.figura) paso.reparo = `${paso.reparo ?? `${cfg.pista} golpe ${i}:`} figura repetida (${cand.figura})`;
          anterior = cand.figura;
        }
        pila.push(paso);
        vIn = cand.vFin;
        P = cand.Pj;
        i++;
      }
      for (const ps of pila) if (ps.reparo) reparos.push(ps.reparo);

      if (usos.size < 4) reparos.push(`${cfg.pista}: solo ${usos.size} figuras distintas`);
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
        pista: cfg.pista, color: cfg.color, r: cfg.r, brillo: cfg.brillo, carril: cfg.carril, repisa, cuadros,
        ...(zs.some((z) => z !== 0) ? { z: zs } : {}), ...(ocultos.length ? { ocultos } : {}),
      };
      return { mias, misGolpes, reparos, propias, bolita, misTramos, misObjetos, murosLista, usos };
    };
    // Varios intentos con azar distinto (determinista): se queda el primero sin reparos o el que tenga menos.
    let elegido: ReturnType<typeof intentarBolita> | null = null;
    for (let intento = 0; intento < 2; intento++) {
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
    resumen.push(`${cfg.pista}: ${[...e.usos.entries()].sort((a, z) => z[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`);
  });

  // Cámara: sigue al centroide con dos pasadas de suavizado exponencial (≈ 0,25 s de retraso); se congela en el clímax.
  const camara: number[] = [];
  const tau = 0.14, alfa = 1 - Math.exp(-1 / (FPS * tau));
  let y1 = NaN, y2 = NaN, x1 = NaN;
  for (let f = 0; f < duracionFrames; f++) {
    const ff = Math.min(f, finalFrame);
    let cx = 0, cy = 0;
    for (const bo of bolitas) { cx += bo.cuadros[ff * 2]; cy += bo.cuadros[ff * 2 + 1]; }
    cx /= bolitas.length; cy /= bolitas.length;
    const objetivo = cy + 90; // mira por delante (abajo): el grupo queda algo sobre el centro, se ve adónde va
    if (Number.isNaN(y1)) { y1 = y2 = objetivo; x1 = cx * 0.15; }
    y1 += alfa * (objetivo - y1);
    y2 += alfa * (y1 - y2);
    x1 += alfa * 0.3 * (cx * 0.15 - x1);
    camara.push(Math.round(x1 * 100) / 100, Math.round(y2 * 100) / 100);
  }
  golpes.sort((a, z) => a.frame - z.frame || a.bolita - z.bolita);
  console.log(`nivel: ${golpes.length} golpes, ${clavijas.length} clavijas, ${objetos.length} objetos, ${avisos} con reparos, semilla ${semilla}`);
  for (const l of resumen) console.log(`  ${l}`);
  return {
    version: 2, id: props.id, fps: FPS, duracionFrames, finalFrame, lentoClimax: LENTO_CLIMAX, mundo: { ancho: ANCHO_MUNDO, gravedad: G },
    camara, bolitas, clavijas, golpes, tramos: tramosSim, objetos, semillaUsada: semilla,
  };
};

/** Evalúa un candidato: el choque con la clavija, y que el camino nuevo no atraviese nada ni a nadie. */
const evaluar = (
  cand: Candidato, ctx: Contexto, ultimo: boolean, primero: boolean, pegs: IndiceCaps<ClavijaSim>[], muros: IndiceCaps<Solido>[],
  otras: Indice, propiasIdx: Indice, linea: (t: number) => number, xMax: number, cfg: Config, cota = 99,
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
  const malo = (m: string) => { viol += 1; motivos.push(m); };
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
  costo += 3 * (e - 0.62) ** 2 * (cand.estilo ? 0.2 : 1) + 0.6 * Math.max(0, 0.5 - rasanteIn) + Math.max(0, n.y + 0.35) * 2
    - 0.25 * Math.min(Math.abs(cand.Pj.x - P.x), 90) / 90 + subida / 3000;
  const off = cfg.r + cfg.radio;
  const peg: ClavijaSim = { bolita: ctx.bolita, x: P.x - n.x * off, y: P.y - n.y * off, nx: n.x, ny: n.y, largo: cand.estilo === 'trampolin' ? cfg.largo + 40 : cfg.largo, radio: cfg.radio, golpe: Math.round(ti * FPS) };
  const vidaPeg = finVida(peg), nacePeg = iniVida(peg);
  if (viol > cota) return null;
  // (1) clavija contra clavijas y paredes vivas
  for (const ix of pegs) for (const c of ix.cerca(peg.y, 300)) if (conviven(peg, c) && distClavijas(peg, c) < 8) { malo('clavija-clavija'); break; }
  for (const ix of muros) for (const w of ix.cerca(peg.y, 300)) if (w.desde < vidaPeg && w.hasta > nacePeg && distClavijas(peg, w) < 8) { malo('clavija-pared'); break; }
  for (const w of cand.paredes) if (distClavijas(peg, w) < 4) { malo('clavija-pared-propia'); break; }
  // (2) clavija contra la trayectoria de las demás bolitas y la propia anterior
  for (const m of otras.cerca(peg.y, 220)) if (!m.oculto && m.t < vidaPeg && m.t > nacePeg && distClavija(m, peg) < m.r - 8) { malo('clavija-en-otra'); break; }
  // (la llegada reciente solo cuenta si de verdad penetra la clavija: con bolitas grandes y llegadas lentas el último
  // tramo pasa legítimamente a pocas unidades de ella)
  if (!primero) for (const m of propiasIdx.cerca(peg.y, 220)) {
    if (m.oculto || m.t >= ti - 0.02 || m.t < nacePeg) continue;
    if (distClavija(m, peg) < (m.t > ti - 0.5 ? m.r - 1 : m.r + 5)) { malo('clavija-en-propia'); break; }
  }
  if (viol > cota) return null;
  // (3) el camino nuevo (muestreado a 240 Hz) no atraviesa (roces de < 8 u contra clavijas ajenas se toleran: no se ven) clavijas, paredes ni bolitas, y no sale de cuadro
  const muestras: Muestra[] = [];
  const nS = Math.round(dt * FPS * SUB);
  let k = 0, choca = false, fuera = false, junta = false;
  const margen = cand.figura === 'cruce' ? 30 : 2;
  let cruza = false, mejorCruce = Infinity;
  for (let s = 1; s <= nS; s++) {
    const tt = (s / nS) * dt;
    while (k < cand.tramos.length - 1 && tt > cand.tramos[k].t0 + cand.tramos[k].dur + 1e-9) k++;
    const tr = cand.tramos[k];
    const p = tr.pos(Math.min(tr.dur, tt - tr.t0));
    const m: Muestra = { t: ti + tt, x: p[0], y: p[1], r: cfg.r, b: ctx.bolita, ...(tr.oculto ? { oculto: true } : {}) };
    muestras.push(m);
    if (viol > cota) return null;
    if (m.oculto) continue;
    if (!fuera && !ultimo && (Math.abs(m.x) > xMax + 4 || m.y - linea(m.t) < -700 || m.y - linea(m.t) > 640)) { fuera = true; malo('fuera-de-cuadro'); if (DIAG && Math.random() < 0.001) console.log('FUERA', cand.figura, cfg.pista, m.x.toFixed(0), (m.y - linea(m.t)).toFixed(0), xMax, (m.t - ti).toFixed(2), dt.toFixed(2)); }
    if (!choca && tt >= 0.03) {
      for (const ix of pegs) { for (const c of ix.cerca(m.y, 200)) if (m.t < finVida(c) && m.t > iniVida(c) && distClavija(m, c) < cfg.r - 8) { choca = true; break; } if (choca) break; }
      if (!choca) for (const ix of muros) { for (const w of ix.cerca(m.y, 200)) if (m.t >= w.desde && m.t <= w.hasta && distClavija(m, w) < cfg.r + 3) { choca = true; break; } if (choca) break; }
      if (choca) malo('atraviesa');
    }
    if (!junta) for (const o of otras.enInstante(m.t)) if (!o.oculto && Math.hypot(o.x - m.x, o.y - m.y) < o.r + m.r + margen) { junta = true; malo('bolita-bolita'); break; }
    if (cand.figura === 'cruce' && s % 4 === 0) for (const o of otras.cerca(m.y, cfg.r + 80)) {
      if (o.oculto) continue;
      const dT = Math.abs(o.t - m.t);
      if (dT >= 0.15 && dT < 3 && Math.hypot(o.x - m.x, o.y - m.y) < o.r + m.r) { cruza = true; mejorCruce = Math.min(mejorCruce, dT); }
    }
  }
  if (cand.figura === 'cruce') { if (!cruza) malo('sin-cruce'); else costo += mejorCruce * 0.5 - 0.6; }
  // (4) paredes nuevas contra las otras bolitas, la propia anterior y las clavijas vivas
  for (const w of cand.paredes) {
    for (const m of otras.cerca(w.y, 260 + w.largo)) if (!m.oculto && m.t >= w.desde && m.t <= w.hasta && distClavija(m, w) < m.r + 4) { malo('pared-en-otra'); break; }
    for (const m of propiasIdx.cerca(w.y, 260 + w.largo)) if (m.t >= w.desde && m.t < ti - 0.02 && distClavija(m, w) < m.r + 4) { malo('pared-en-propia'); break; }
    for (const ix of pegs) for (const c of ix.cerca(w.y, 300 + w.largo)) if (w.desde < finVida(c) && w.hasta > iniVida(c) && distClavijas(w, c) < 8) { malo('pared-clavija'); break; }
  }
  if (DIAG) { const k = cand.figura; const d = DIAG.get(k) ?? new Map<string, number>(); DIAG.set(k, d); d.set('_n', (d.get('_n') ?? 0) + 1); if (!viol) d.set('_ok', (d.get('_ok') ?? 0) + 1); for (const m of new Set(motivos.map((x) => x.replace(/=.*/, '')))) d.set(m, (d.get(m) ?? 0) + 1); }
  return { viol, motivos, costo, n, e, peg, muestras };
};
/** RITMO_DIAG=1: cuenta por figura los motivos de rechazo (para afinar el catálogo). */
const DIAG = process.env.RITMO_DIAG ? new Map<string, Map<string, number>>() : null;
export const diagnostico = () => DIAG && [...DIAG.entries()].map(([f, d]) => `${f}: ${[...d.entries()].sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`).join('\n');
