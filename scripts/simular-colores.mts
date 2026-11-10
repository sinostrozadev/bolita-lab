/**
 * Simulación determinista de la plantilla "colores" (Batalla de colores) + síntesis de su audio.
 *
 *   npx tsx scripts/simular-colores.mts contenido/guiones/<guion>.json
 *
 * Física 2D vista desde arriba (sin gravedad), paso fijo: 60 fps × 4 sub-pasos (1/240 s). Escribe
 *   public/sim/<id>.json            (trayectorias por bolita, eventos, áreas, mapa video→sim)
 *   public/audio/generado/<id>.wav  (fusiones, divisiones, muertes, cama rítmica, fanfarria)
 * Busca semilla (y daño) hasta que la partida dure lo pedido y tenga ≥ 2 vuelcos de liderazgo.
 * Mismo guion → mismo sim → mismo audio → mismo video.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import { FORMATO } from '../src/marca/tokens';
import {
  GuionColores, equiposDe, type BolitaSim, type EventoColores, type SimColores,
} from '../src/plantillas/colores/guion';
import { crearPista, escribirWav, golpe, barrido, midiAHz, nota, normalizar, SR } from './lib/wav.mjs';

// ---------- Escena (debe coincidir con Colores.tsx) ----------
const FPS = FORMATO.fps;
const SUB = 4;
const DT = 1 / (FPS * SUB);
export const ARENA = { cx: FORMATO.ancho / 2, cy: 985, r: 430 } as const;
const RADIO_CAJA = 405;
const R0 = Number(process.env.CR0 ?? 36); // radio inicial de cada bolita
const A0 = Math.PI * R0 * R0;
const AMIN = Math.PI * 12 * 12; // por debajo: muere
/** Tope de la fusión: si el resultado pasaría de este radio, rebotan en vez de fusionarse (así no se forma una mancha única). */
const AMAX = Math.PI * Math.pow(Number(process.env.CRMAX ?? 58), 2);
const APARTIR = 3 * AMIN; // desde aquí, tras un golpe se parte en 2
const V0 = Number(process.env.CV0 ?? 200); // px/s para r = R0
/** Caza: aceleración hacia el rival más cercano; crece con el tiempo (tranquilo al inicio, encarnizado al final). */
const ACC_CAZA = Number(process.env.CACC ?? 450);
const cazaEn = (t: number) => 40 + ACC_CAZA * Math.min(1.5, (t / CAZA_T) ** 3);
const CAZA_T = Number(process.env.CCT ?? 34);
const INMUNE = 0.3; // s sin fusionar ni dañar tras nacer o recibir un golpe
/**
 * ESCUDO del que va perdiendo (da partidas largas y con vuelcos): el daño que recibe una bolita se multiplica
 * por (área de su equipo / área media de los equipos vivos)^ESCUDO, acotado a [0,35, 1,6]. El que va primero
 * se desgasta más rápido; el último resiste.
 */
const ESCUDO = Number(process.env.CESC ?? 2);
// Arena que se cierra: desde CIERRE_DESDE s de partida, CIERRE_VEL px/s hasta CIERRE_MIN.
export const CIERRE_DESDE = Number(process.env.CCD ?? 26);
const CIERRE_VEL = 20;
const CIERRE_MIN = 210;
/**
 * El daño crece con la partida: `dano` × (0,3 + 1,7·(t/DANO_T)²), tope 2,5×. Al inicio casi solo hay
 * fusiones y divisiones (la arena se llena de trozos); al final los golpes matan y caen los equipos.
 */
const DANO_T = Number(process.env.CDT ?? 32);
const danoEn = (base: number, t: number) => base * Math.min(2.5, 0.3 + 1.7 * (t / DANO_T) ** 2);
// Final: cámara lenta S1 frames antes y S2 después de la victoria, a VEL_LENTA×; después POST frames de video.
export const S1 = 36, S2 = 6, VEL_LENTA = 0.3;
export const FRAMES_POST = 150, FRAMES_CIERRE = 72;
// Duración del video (s) y búsqueda.
const DUR_MIN = 35, DUR_MAX = 50;
const VUELCOS_MIN = 2;
const PRIMER_CHOQUE_MAX = Math.round(0.3 * FPS);
const MAX_PARTIDA_S = 46;
/**
 * Fase 2, CONQUISTA (desde T_CONQUISTA s): la bolita que cae bajo el mínimo ya no muere, se PASA al color que la
 * golpeó (renace con AREA_CONQUISTA). Así la arena sigue llena hasta el final, el que va ganando arrastra a los
 * demás en cascada y el desenlace es una pelea grande. En esta fase el escudo se invierte (ESCUDO_2): el grande
 * resiste, para que la partida se decida.
 */
export const T_CONQUISTA = Number(process.env.CTQ ?? 18);
const AREA_CONQUISTA = 1.8;
const ESCUDO_2 = Number(process.env.CESC2 ?? -0.5);
/** En la conquista solo se fusionan las chicas (resultado ≤ r RMAX_2): así no se apelotonan y siguen siendo muchas. */
const AMAX_2 = Math.PI * Math.pow(Number(process.env.CRM2 ?? 58), 2);

type Bolita = {
  id: number; eq: number; x: number; y: number; vx: number; vy: number; a: number; r: number;
  inmune: number; nace: number; muere: number | null; fin?: 'muerte' | 'fusion' | 'conquista'; en?: number; p: number[];
};
const radio = (a: number) => Math.sqrt(a / Math.PI);
const velObjetivo = (r: number) => Math.max(210, Math.min(640, V0 * Math.pow(R0 / r, 0.4)));

type Resultado = {
  ok: boolean; motivo: string; bolitas: Bolita[]; eventos: EventoColores[]; areas: number[][]; arenaR: number[];
  victoria: number; ganador: number; vuelcos: number; framesSim: number; primerChoque: number; eliminaciones: number[];
  /** Bolitas vivas por frame (para exigir arena poblada) y por equipo. */
  cuenta: number[];
  porEq: number[][];
};

export const simular = (equipos: number, porEquipo: number, forma: 'circulo' | 'caja', semilla: number, dano: number): Resultado => {
  const azar = crearAzar(semilla);
  // La caja es un poco más chica que el círculo: sus esquinas llegarían a la grilla de votación.
  const RA = forma === 'caja' ? RADIO_CAJA : ARENA.r;
  const bolitas: Bolita[] = [];
  const vivas: Bolita[] = [];
  const eventos: EventoColores[] = [];
  const areas: number[][] = [];
  const cuenta: number[] = [];
  const porEq: number[][] = [];
  const arenaR: number[] = [];
  let sigId = 0;
  const nueva = (eq: number, x: number, y: number, vx: number, vy: number, a: number, nace: number, t: number): Bolita => {
    const b: Bolita = { id: sigId++, eq, x, y, vx, vy, a, r: radio(a), inmune: t + INMUNE, nace, muere: null, p: [] };
    bolitas.push(b); vivas.push(b); return b;
  };
  // Siembra: posiciones sin solaparse, colores mezclados, direcciones al azar.
  const total = equipos * porEquipo;
  const orden = Array.from({ length: total }, (_, i) => i % equipos);
  for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
  for (const eq of orden) {
    for (let intento = 0; intento < 500; intento++) {
      const ang = azar() * Math.PI * 2, d = Math.sqrt(azar()) * (RA - R0 - 14);
      const x = ARENA.cx + Math.cos(ang) * d, y = ARENA.cy + Math.sin(ang) * d;
      if (forma === 'caja' && (Math.abs(x - ARENA.cx) > RA - R0 - 10 || Math.abs(y - ARENA.cy) > RA - R0 - 10)) continue;
      if (vivas.some((o) => Math.hypot(o.x - x, o.y - y) < 2 * R0 + 8)) continue;
      const dir = azar() * Math.PI * 2;
      const b = nueva(eq, x, y, Math.cos(dir) * V0, Math.sin(dir) * V0, A0, 0, -1);
      b.inmune = 0;
      break;
    }
  }
  const eliminado = new Array(equipos).fill(false);
  const eliminaciones: number[] = [];
  let victoria = -1, ganador = -1, primerChoque = -1;
  let lider = -1, candidato = -1, desdeCand = 0, vuelcos = 0;
  const maxFrames = Math.round(MAX_PARTIDA_S * FPS);
  let framesSim = 0;
  const finVideoSim = () => victoria + S2 + FRAMES_POST + FRAMES_CIERRE; // frames de sim necesarios tras la victoria
  for (let f = 0; ; f++) {
    // --- registrar el estado del frame f
    const t0 = f / FPS;
    const Rf = t0 < CIERRE_DESDE || victoria >= 0 && f > victoria ? (arenaR.at(-1) ?? RA) : Math.max(CIERRE_MIN, RA - CIERRE_VEL * (t0 - CIERRE_DESDE));
    arenaR.push(Math.round(Rf * 10) / 10);
    const ar = new Array(equipos).fill(0);
    for (const b of vivas) { b.p.push(Math.round(b.x), Math.round(b.y), Math.round(b.r * 10) / 10); ar[b.eq] += b.a; }
    areas.push(ar.map((v) => Math.round(v)));
    cuenta.push(vivas.length);
    { const n = new Array(equipos).fill(0); for (const b of vivas) n[b.eq]++; porEq.push(n); }
    framesSim = f + 1;
    // Liderazgo (con histéresis: 4 % de ventaja sostenida 0,5 s).
    if (victoria < 0) {
      let c = 0; for (let e = 1; e < equipos; e++) if (ar[e] > ar[c]) c = e;
      const ref = lider >= 0 ? ar[lider] : Math.max(...ar.filter((_, e) => e !== c));
      if (c !== lider && ar[c] > ref * 1.03) {
        if (candidato !== c) { candidato = c; desdeCand = f; }
        else if (f - desdeCand >= 30) {
          if (lider >= 0) { vuelcos++; eventos.push({ f, tipo: 'lider', equipo: c, otro: lider, x: 0, y: 0, r: 0 }); }
          else eventos.push({ f, tipo: 'lider', equipo: c, x: 0, y: 0, r: 0 });
          lider = c; candidato = -1;
        }
      } else candidato = -1;
    }
    if (victoria >= 0 && f >= finVideoSim()) break;
    if (victoria < 0 && f >= maxFrames) return { ok: false, motivo: `sin ganador a los ${MAX_PARTIDA_S} s`, bolitas, eventos, areas, arenaR, victoria, ganador, vuelcos, framesSim, primerChoque, eliminaciones, cuenta, porEq };

    // --- avanzar SUB sub-pasos; lo que pase aquí se ve desde el frame f+1
    const fv = f + 1;
    for (let s = 0; s < SUB; s++) {
      const t = t0 + s * DT;
      const R = Rf;
      // Caza: cada una acelera hacia el rival más cercano (tras la victoria: hacia el centro de su equipo, para fusionarse).
      let gx = 0, gy = 0, ga = 0;
      if (victoria >= 0) for (const b of vivas) { gx += b.x * b.a; gy += b.y * b.a; ga += b.a; }
      for (const b of vivas) {
        let tx = 0, ty = 0, mejor = Infinity;
        if (victoria >= 0) { tx = gx / ga - b.x; ty = gy / ga - b.y; mejor = 1; }
        else for (const o of vivas) {
          if (o.eq === b.eq) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < mejor) { mejor = d2; tx = dx; ty = dy; }
        }
        if (mejor < Infinity) {
          const n = Math.hypot(tx, ty) || 1;
          const acc = victoria >= 0 ? ACC_CAZA : cazaEn(t);
          b.vx += (tx / n) * acc * DT; b.vy += (ty / n) * acc * DT;
        }
        // Rapidez hacia la objetivo (chicas rápidas, grandes lentas): nadie se queda quieto.
        const v = Math.hypot(b.vx, b.vy) || 1, vt = velObjetivo(b.r);
        const k = 1 + ((vt - v) / v) * 0.02;
        b.vx *= k; b.vy *= k;
        b.x += b.vx * DT; b.y += b.vy * DT;
        // Paredes
        if (forma === 'circulo') {
          const dx = b.x - ARENA.cx, dy = b.y - ARENA.cy, d = Math.hypot(dx, dy) || 1, lim = Math.max(1, R - b.r);
          if (d > lim) {
            const nx = dx / d, ny = dy / d;
            b.x = ARENA.cx + nx * lim; b.y = ARENA.cy + ny * lim;
            const vn = b.vx * nx + b.vy * ny;
            if (vn > 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
          }
        } else {
          const lim = Math.max(1, R - b.r);
          if (b.x - ARENA.cx > lim) { b.x = ARENA.cx + lim; b.vx = -Math.abs(b.vx); }
          if (ARENA.cx - b.x > lim) { b.x = ARENA.cx - lim; b.vx = Math.abs(b.vx); }
          if (b.y - ARENA.cy > lim) { b.y = ARENA.cy + lim; b.vy = -Math.abs(b.vy); }
          if (ARENA.cy - b.y > lim) { b.y = ARENA.cy - lim; b.vy = Math.abs(b.vy); }
        }
      }
      // Contactos (factor de escudo por equipo, con las áreas de este sub-paso)
      const areaEq = new Array(equipos).fill(0);
      for (const b of vivas) areaEq[b.eq] += b.a;
      const vivosEq = areaEq.filter((v) => v > 0);
      const media = vivosEq.reduce((x, y) => x + y, 0) / Math.max(1, vivosEq.length);
      const conquista = t >= T_CONQUISTA && victoria < 0;
      const factor = areaEq.map((v) => Math.max(0.35, Math.min(1.6, Math.pow(v / media, conquista ? ESCUDO_2 : ESCUDO))));
      const tocadas = new Set<Bolita>();
      const muertas = new Set<Bolita>();
      const n0 = vivas.length;
      for (let i = 0; i < n0; i++) for (let j = i + 1; j < n0; j++) {
        const A = vivas[i], B = vivas[j];
        if (muertas.has(A) || muertas.has(B)) continue;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.001, solape = A.r + B.r - d;
        if (solape <= 0) continue;
        const nx = dx / d, ny = dy / d;
        const libres = A.inmune <= t && B.inmune <= t && !tocadas.has(A) && !tocadas.has(B);
        if (primerChoque < 0 && libres) primerChoque = fv;
        if (A.eq === B.eq && libres && (A.a + B.a <= (t >= T_CONQUISTA ? AMAX_2 : AMAX) || victoria >= 0)) {
          // FUSIÓN: la grande absorbe a la chica (se queda en su lugar; momento conservado).
          const [G, C] = A.a >= B.a ? [A, B] : [B, A];
          const a = G.a + C.a;
          G.vx = (G.vx * G.a + C.vx * C.a) / a; G.vy = (G.vy * G.a + C.vy * C.a) / a;
          G.a = a; G.r = radio(a);
          C.muere = fv; C.fin = 'fusion'; C.en = G.id; muertas.add(C); tocadas.add(G);
          eventos.push({ f: fv, tipo: 'fusion', equipo: G.eq, x: Math.round(G.x), y: Math.round(G.y), r: Math.round(G.r) });
          continue;
        }
        // Rebote elástico (masa = área) + separación.
        const mA = A.a, mB = B.a;
        const vrel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (vrel < 0) {
          const jimp = (2 * vrel) / (mA + mB);
          A.vx += jimp * mB * nx; A.vy += jimp * mB * ny;
          B.vx -= jimp * mA * nx; B.vy -= jimp * mA * ny;
        }
        A.x -= nx * solape * (mB / (mA + mB)); A.y -= ny * solape * (mB / (mA + mB));
        B.x += nx * solape * (mA / (mA + mB)); B.y += ny * solape * (mA / (mA + mB));
        if (A.eq === B.eq || !libres) continue;
        // DIVISIÓN: las dos pierden la misma área (dano × la más chica); la grande se parte, la chica puede morir.
        const perdida = danoEn(dano, t) * Math.min(A.a, B.a);
        const cx = Math.round((A.x + B.x) / 2), cy = Math.round((A.y + B.y) / 2);
        eventos.push({ f: fv, tipo: 'division', equipo: A.a >= B.a ? A.eq : B.eq, otro: A.a >= B.a ? B.eq : A.eq, x: cx, y: cy, r: Math.round(Math.min(A.r, B.r)) });
        // Si las dos quedarían bajo el mínimo, la más grande aguanta en el mínimo (no hay empates).
        const quedaA = A.a - perdida * factor[A.eq], quedaB = B.a - perdida * factor[B.eq];
        const aguanta = quedaA < AMIN && quedaB < AMIN ? (A.a >= B.a ? A : B) : null;
        for (const X of [A, B]) {
          X.a -= perdida * factor[X.eq];
          if (X === aguanta) X.a = AMIN * 1.02; X.r = radio(Math.max(X.a, 1));
          tocadas.add(X); X.inmune = t + INMUNE;
          if (X.a < AMIN && conquista) {
            // CONQUISTA: renace del color de la que la golpeó.
            const Y = X === A ? B : A;
            X.muere = fv; X.fin = 'conquista'; muertas.add(X);
            const N = nueva(Y.eq, X.x, X.y, X.vx, X.vy, AMIN * AREA_CONQUISTA, fv, t);
            N.inmune = t + INMUNE * 1.5; X.en = N.id;
            eventos.push({ f: fv, tipo: 'conquista', equipo: Y.eq, otro: X.eq, x: Math.round(X.x), y: Math.round(X.y), r: Math.round(N.r) });
          } else if (X.a < AMIN) {
            X.muere = fv; X.fin = 'muerte'; muertas.add(X);
            eventos.push({ f: fv, tipo: 'muerte', equipo: X.eq, x: Math.round(X.x), y: Math.round(X.y), r: Math.round(X.r) });
          } else if (X.a >= APARTIR) {
            const fr = 0.42 + azar() * 0.16;
            const a1 = X.a * fr, a2 = X.a - a1, r1 = radio(a1), r2 = radio(a2);
            const px = -ny, py = nx; // perpendicular al choque
            const ox = X.x, oy = X.y, vx = X.vx, vy = X.vy;
            const rot = (ang: number) => [vx * Math.cos(ang) - vy * Math.sin(ang), vx * Math.sin(ang) + vy * Math.cos(ang)];
            X.a = a1; X.r = r1; X.x = ox + px * r2 * 0.9; X.y = oy + py * r2 * 0.9;
            [X.vx, X.vy] = rot(0.6);
            const [wx, wy] = rot(-0.6);
            const H = nueva(X.eq, ox - px * r1 * 0.9, oy - py * r1 * 0.9, wx, wy, a2, fv, t);
            tocadas.add(H);
          }
        }
      }
      if (muertas.size) {
        for (let k = vivas.length - 1; k >= 0; k--) if (muertas.has(vivas[k])) vivas.splice(k, 1);
        if (victoria < 0) {
          for (let e = 0; e < equipos; e++) {
            if (eliminado[e] || vivas.some((b) => b.eq === e)) continue;
            eliminado[e] = true; eliminaciones.push(fv);
            const ult = [...muertas].filter((b) => b.eq === e).at(-1);
            eventos.push({ f: fv, tipo: 'eliminado', equipo: e, x: Math.round(ult?.x ?? ARENA.cx), y: Math.round(ult?.y ?? ARENA.cy), r: 0 });
          }
          const restantes = [...new Set(vivas.map((b) => b.eq))];
          if (restantes.length === 1) {
            victoria = fv; ganador = restantes[0];
            eventos.push({ f: fv, tipo: 'victoria', equipo: ganador, x: ARENA.cx, y: ARENA.cy, r: 0 });
            for (const b of vivas) b.inmune = 0;
          } else if (restantes.length === 0) {
            return { ok: false, motivo: 'empate (murieron todas a la vez)', bolitas, eventos, areas, arenaR, victoria, ganador, vuelcos, framesSim, primerChoque, eliminaciones, cuenta, porEq };
          }
        }
      }
    }
  }
  return { ok: true, motivo: '', bolitas, eventos, areas, arenaR, victoria, ganador, vuelcos, framesSim, primerChoque, eliminaciones, cuenta, porEq };
};

/** Frames de video totales para una victoria en el frame de sim `v`. */
const duracionVideo = (v: number) => (v - S1) + Math.round((S1 + S2) / VEL_LENTA) + FRAMES_POST + FRAMES_CIERRE;

/** Video → sim. */
export const construirMapa = (victoria: number): number[] => {
  const total = duracionVideo(victoria);
  const lentoDesde = victoria - S1, lentoFrames = Math.round((S1 + S2) / VEL_LENTA);
  return Array.from({ length: total }, (_, v) => {
    if (v <= lentoDesde) return v;
    if (v <= lentoDesde + lentoFrames) return Math.round((lentoDesde + (v - lentoDesde) * VEL_LENTA) * 100) / 100;
    return victoria + S2 + (v - lentoDesde - lentoFrames);
  });
};
const simAVideo = (victoria: number, fs: number) => {
  const lentoDesde = victoria - S1, lentoFrames = Math.round((S1 + S2) / VEL_LENTA);
  if (fs <= lentoDesde) return fs;
  if (fs <= victoria + S2) return lentoDesde + (fs - lentoDesde) / VEL_LENTA;
  return lentoDesde + lentoFrames + (fs - victoria - S2);
};

export const evaluarExport = (r: Resultado) => evaluar(r);
const evaluar = (r: Resultado) => {
  if (!r.ok) return r.motivo;
  const seg = duracionVideo(r.victoria) / FPS;
  if (seg < DUR_MIN || seg > DUR_MAX) return `dura ${seg.toFixed(1)} s`;
  // Arena poblada: no se vacía a mitad de partida.
  const vivasEn = (x: number) => r.cuenta[Math.floor(r.victoria * x)];
  // Final masivo: ≥ 15 bolitas hasta 3 s antes de la victoria y ≥ 2 equipos con ≥ 5 hasta 5 s antes.
  const f3 = r.victoria - 3 * FPS, f5 = r.victoria - 5 * FPS;
  const minVivas = Math.min(...r.cuenta.slice(Math.round(T_CONQUISTA * FPS), f3 + 1));
  if (minVivas < 15) return `final flaco (${minVivas} bolitas a 3 s)`;
  for (let f = Math.round(T_CONQUISTA * FPS); f <= f5; f++) if (r.porEq[f].filter((n) => n >= 5).length < 2) return `final sin pelea (${(f / FPS).toFixed(1)} s)`;
  if (vivasEn(0.5) < 25 || vivasEn(0.75) < 9 || vivasEn(0.85) < 5) return `arena vacía (${vivasEn(0.5)} a la mitad, ${vivasEn(0.75)} al 75 %)`;
  if (r.vuelcos < VUELCOS_MIN) return `${r.vuelcos} vuelcos`;
  if (r.primerChoque < 0 || r.primerChoque > PRIMER_CHOQUE_MAX) return `primer choque a los ${(r.primerChoque / FPS).toFixed(2)} s`;
  const gaps = r.eliminaciones.slice(1).map((e, i) => e - r.eliminaciones[i]);
  if (gaps.some((g) => g < 90)) return 'eliminaciones encimadas';
  // Que no gane el que iba primero cuando cayó el primer equipo.
  const e1 = r.eliminaciones[0];
  const a = r.areas[Math.max(0, e1 - 1)];
  if (a.indexOf(Math.max(...a)) === r.ganador && r.vuelcos < 3) return 'gana el que iba primero';
  return '';
};

export const buscarSimulacion = (props: GuionColores) => {
  const equipos = equiposDe(props).length;
  const porEquipo = props.bolasPorEquipo ?? 10;
  const forma = props.arena ?? 'circulo';
  const base = props.semilla ?? semillaDesde(`colores:${props.id}`);
  const danos = [0.12, 0.1, 0.14, 0.11, 0.13];
  const motivos: Record<string, number> = {};
  for (let k = 0; k < 600; k++) {
    const semilla = (base + k * 7919) >>> 0;
    const dano = danos[Math.floor(k / 120) % danos.length];
    const r = simular(equipos, porEquipo, forma, semilla, dano);
    const m = evaluar(r);
    if (!m) return { r, semilla, dano, intentos: k + 1 };
    const clave = m.replace(/[\d.,]+/g, '#'); motivos[clave] = (motivos[clave] ?? 0) + 1;
  }
  throw new Error(`no encontré una partida válida en 600 intentos: ${JSON.stringify(motivos)}`);
};

// ---------------------------------------------------------------- audio

/** Raíz MIDI por equipo (cada color "suena" en su tono). */
const RAICES = [60, 64, 67, 62, 65, 69, 59, 71];

export const sintetizar = (sim: SimColores, ruta: string) => {
  const segundos = sim.duracionFrames / FPS + 0.5;
  const pista = crearPista(segundos);
  const tv = (fs: number) => simAVideo(sim.victoriaFrame, fs) / FPS;
  const tLento = (sim.victoriaFrame - S1) / FPS;
  const tVict = tv(sim.victoriaFrame);
  // Cama rítmica: bombo en cada pulso, platillo a contratiempo; acelera de 96 a 150 bpm hasta la cámara lenta.
  let fase = 0, pulso = 0;
  for (let i = 0; i < Math.floor(tLento * SR); i++) {
    const t = i / SR, x = t / tLento;
    const bpm = 96 + 54 * x * x;
    fase += bpm / 60 / SR;
    if (fase >= pulso) {
      const tp = t;
      barrido(pista, tp, 130, 45, 0.13, 0.42);
      golpe(pista, tp + (30 / bpm), { duracion: 0.03, volumen: 0.07, tono: 0.92, semilla: pulso + 7 });
      if (pulso % 4 === 2) golpe(pista, tp, { duracion: 0.09, volumen: 0.12, tono: 0.5, semilla: pulso + 99 });
      // bajo: raíz que sube por compás
      const raiz = 36 + [0, 0, 5, 7][Math.floor(pulso / 4) % 4];
      nota(pista, { inicio: tp, hz: midiAHz(raiz), duracion: 30 / bpm, volumen: 0.16, timbre: 'triangulo', liberacion: 0.05 });
      pulso++;
    }
  }
  // Cámara lenta: riser grave hasta la victoria.
  barrido(pista, tLento, 70, 420, tVict - tLento + 0.05, 0.2, 'sierra');
  // Eventos (con tope de densidad por tipo).
  const ultimo: Record<string, number> = {};
  for (const e of sim.eventos) {
    const t = tv(e.f);
    const espacio = e.tipo === 'fusion' ? 0.05 : e.tipo === 'division' ? 0.035 : e.tipo === 'conquista' ? 0.06 : 0.03;
    if (e.tipo !== 'eliminado' && e.tipo !== 'victoria' && t - (ultimo[e.tipo] ?? -1) < espacio) continue;
    ultimo[e.tipo] = t;
    const raiz = RAICES[e.equipo % RAICES.length];
    const sem = Math.round(e.f * 31 + e.x);
    switch (e.tipo) {
      case 'fusion': { // acorde ascendente suave; más grave cuanto más grande
        const oct = e.r > 55 ? -12 : e.r > 38 ? 0 : 12;
        [0, 4, 7].forEach((iv, k) => nota(pista, { inicio: t + k * 0.035, hz: midiAHz(raiz + oct + iv), duracion: 0.16, volumen: 0.075, timbre: 'seno', ataque: 0.01, liberacion: 0.2 }));
        break;
      }
      case 'division': // golpe seco + crack + cuerpo grave
        golpe(pista, t, { duracion: 0.06, volumen: 0.34, tono: 0.35, semilla: sem });
        golpe(pista, t + 0.004, { duracion: 0.022, volumen: 0.22, tono: 0.97, semilla: sem + 3 });
        barrido(pista, t, 190, 60, 0.08, 0.2);
        break;
      case 'muerte': // pop agudo
        barrido(pista, t, 700, 2100, 0.06, 0.2);
        nota(pista, { inicio: t + 0.03, hz: midiAHz(raiz + 24), duracion: 0.05, volumen: 0.1, timbre: 'pluck', liberacion: 0.08 });
        break;
      case 'conquista': // "flip": dos notas que suben en el tono del conquistador
        nota(pista, { inicio: t, hz: midiAHz(raiz + 12), duracion: 0.05, volumen: 0.09, timbre: 'pluck', liberacion: 0.06 });
        nota(pista, { inicio: t + 0.05, hz: midiAHz(raiz + 19), duracion: 0.07, volumen: 0.09, timbre: 'pluck', liberacion: 0.1 });
        golpe(pista, t, { duracion: 0.03, volumen: 0.12, tono: 0.8, semilla: sem });
        break;
      case 'eliminado': // boom y tres notas que caen
        barrido(pista, t, 220, 38, 0.45, 0.5);
        golpe(pista, t, { duracion: 0.35, volumen: 0.25, tono: 0.25, semilla: sem });
        [0, -3, -7].forEach((iv, k) => nota(pista, { inicio: t + 0.1 + k * 0.11, hz: midiAHz(raiz + iv), duracion: 0.12, volumen: 0.14, timbre: 'triangulo', liberacion: 0.15 }));
        break;
      case 'lider': if (e.otro !== undefined) nota(pista, { inicio: t, hz: midiAHz(raiz + 24), duracion: 0.08, volumen: 0.09, timbre: 'triangulo', liberacion: 0.3 });
        break;
      case 'victoria': { // fanfarria en el tono del ganador
        const f0 = raiz;
        const mel: [number, number][] = [[0, 0.12], [4, 0.12], [7, 0.12], [12, 0.3], [7, 0.12], [12, 0.9]];
        let tt = t + 0.05;
        for (const [iv, d] of mel) {
          nota(pista, { inicio: tt, hz: midiAHz(f0 + iv), duracion: d, volumen: 0.1, timbre: 'cuadrada', ataque: 0.01, liberacion: 0.12 });
          nota(pista, { inicio: tt, hz: midiAHz(f0 + iv), duracion: d, volumen: 0.14, timbre: 'triangulo', ataque: 0.01, liberacion: 0.15 });
          tt += d + 0.02;
        }
        for (const iv of [-12, 0, 4, 7]) nota(pista, { inicio: tt - 0.92, hz: midiAHz(f0 + iv), duracion: 1.6, volumen: 0.07, timbre: 'seno', ataque: 0.05, liberacion: 0.8 });
        golpe(pista, t, { duracion: 0.5, volumen: 0.3, tono: 0.8, semilla: sem }); // platillo
        barrido(pista, t, 160, 40, 0.3, 0.45);
        break;
      }
    }
  }
  normalizar(pista, -1);
  escribirWav(ruta, [pista, pista]);
};

// ---------------------------------------------------------------- envoltorio

export const leerProps = (rutaGuion: string): GuionColores => {
  const crudo = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
  const props = crudo.props ?? crudo;
  if (crudo.plantilla && crudo.plantilla !== 'colores') throw new Error(`el guion es de la plantilla "${crudo.plantilla}", no "colores"`);
  if (crudo.id && !props.id) props.id = crudo.id;
  return GuionColores.parse(props);
};

export const simularYSintetizar = (props: GuionColores, raiz = process.cwd()): SimColores => {
  const { r, semilla, dano, intentos } = buscarSimulacion(props);
  const mapa = construirMapa(r.victoria);
  const sim: SimColores = {
    version: 1, id: props.id, fps: FPS, equipos: equiposDe(props),
    arena: { forma: props.arena ?? 'circulo', cx: ARENA.cx, cy: ARENA.cy, r: (props.arena ?? 'circulo') === 'caja' ? RADIO_CAJA : ARENA.r },
    arenaR: r.arenaR, framesSim: r.framesSim,
    bolitas: r.bolitas.map((b): BolitaSim => ({ id: b.id, equipo: b.eq, nace: b.nace, muere: b.muere, fin: b.fin, en: b.en, p: b.p })),
    eventos: r.eventos, areas: r.areas, victoriaFrame: r.victoria, ganador: r.ganador, mapa,
    victoriaVideo: Math.round(simAVideo(r.victoria, r.victoria)), duracionFrames: mapa.length,
    conquistaDesde: Math.round(T_CONQUISTA * FPS), cierreDesde: Math.round(CIERRE_DESDE * FPS),
    lentoVideo: [r.victoria - S1, r.victoria - S1 + Math.round((S1 + S2) / VEL_LENTA)],
    vuelcos: r.vuelcos, semillaUsada: semilla, danoUsado: dano,
  };
  if (mapa.at(-1)! > r.framesSim - 1) throw new Error('el sim es más corto que el video');
  const rutaWav = path.join(raiz, 'public/audio/generado', `${props.id}.wav`);
  sintetizar(sim, rutaWav);
  const rutaSim = path.join(raiz, 'public/sim', `${props.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const nombres = sim.equipos;
  const elim = r.eventos.filter((e) => e.tipo === 'eliminado').map((e) => `${nombres[e.equipo]} ${(simAVideo(r.victoria, e.f) / FPS).toFixed(1)} s`);
  const lideres = r.eventos.filter((e) => e.tipo === 'lider').map((e) => `${nombres[e.equipo]} ${(simAVideo(r.victoria, e.f) / FPS).toFixed(1)} s`);
  console.log(`sim ${props.id}: gana ${nombres[r.ganador]} a los ${(sim.victoriaVideo / FPS).toFixed(1)} s, video ${(sim.duracionFrames / FPS).toFixed(1)} s · ${r.vuelcos} vuelcos · semilla ${semilla} · daño ${dano} · ${intentos} intentos · ${r.bolitas.length} bolitas en total`);
  console.log(`  primer choque ${(r.primerChoque / FPS * 1000).toFixed(0)} ms · líderes: ${lideres.join(' → ')} · caen: ${elim.join(', ')}`);
  console.log(`  → ${path.relative(raiz, rutaSim)} (${(fs.statSync(rutaSim).size / 1024).toFixed(0)} KB), ${path.relative(raiz, rutaWav)}`);
  return sim;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: npx tsx scripts/simular-colores.mts <guion.json>'); process.exit(2); }
  simularYSintetizar(leerProps(ruta));
}
