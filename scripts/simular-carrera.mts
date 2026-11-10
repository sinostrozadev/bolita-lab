/**
 * Simulador determinista de la plantilla `carrera` ("¿Cuál llega primero?").
 *
 * Uso: npx tsx scripts/simular-carrera.mts <guion.json>
 *   (acepta el envoltorio `{plantilla, id, ..., props}` o los props sueltos).
 *
 * Qué hace:
 *  1. Construye un tablero vertical tipo Plinko (~3 pantallas de alto) con clavijas,
 *     2 rampas y 2 embudos, colocados con `crearAzar(semilla)`.
 *  2. Integra la física a paso fijo 1/600 s (10 subpasos por frame a 60 fps):
 *     gravedad, choques bola–clavija, bola–segmento, bola–bola y paredes.
 *  3. Exige que la ganadora cruce la meta entre 25 y 45 s (si no, ajusta la gravedad)
 *     y que la carrera sea REÑIDA: 1.º y 2.º separados por < 1,5 s. Si no, deriva otra
 *     semilla (máx. 20 carreras válidas; si ninguna cumple, se queda con la más ajustada).
 *  4. Re-muestrea la física al tiempo del video aplicando 0,4 s de cámara lenta (×0,25)
 *     justo en la llegada; calcula la cámara (sigue a la líder, nunca la deja fuera de la
 *     zona segura) y el ranking por frame (con histéresis).
 *  5. Escribe `public/sim/<id>.json` (posiciones por frame, cámara, clavijas, eventos)
 *     y sintetiza `public/audio/generado/<id>.wav` (golpes afinados por bola, notas
 *     en choques bola–bola, riser en el último 15 % y fanfarria en la meta).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import { GuionCarrera } from '../src/plantillas/carrera/guion';
import {
  AVISO_SEPARACION, CELEBRACION_SEG, CIERRE_FRAMES,
  type AvisoCarrera, type Bloque, type Clavija, type EventoCarrera, type Segmento, type SimulacionCarrera, type Tubo,
} from '../src/plantillas/carrera/tipos';
import { midiAHz } from './lib/wav.mjs';
import { sintetizarCarrera } from './lib/sonido-carrera.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Parámetros del mundo ----------
const FPS = 60;
const SUBPASOS = 10; // 1/600 s
const DT = 1 / (FPS * SUBPASOS);
const ANCHO = 1080;
const PANTALLA = 1920;
/** Altura del tablero en pantallas. Medido: con 5 pantallas y g≈1100 la carrera dura ~30 s (el
 *  tiempo depende casi solo de la altura: entre clavijas la bola va a velocidad terminal). */
const PANTALLAS = 5;
const META_Y = PANTALLA * PANTALLAS - 300;
/** Bajo la meta queda espacio: así la cámara puede dejar la meta en el centro de la pantalla. */
const ALTO = META_Y + 700;
/** Zona segura (ver tokens): la líder siempre queda entre estas dos alturas de pantalla. */
/** Arriba: bajo el gancho fijo (≈ 270–400) y el marcador (≈ 420–600). Abajo: sobre el podio (≈ 1340) y el
 * bloque de intriga (≈ 1470–1570), que quedan fijos todo el video. */
const BANDA_LIDER = { arriba: 720, abajo: 1290 };
/** La meta queda a esta altura de pantalla cuando la cámara llega al fondo. */
const META_EN_PANTALLA = 1180;
const CAM_MAX = META_Y - META_EN_PANTALLA;
/** Cámara lenta de la llegada: factor y tramo (en frames de física relativos al cruce). */
const LENTA = { factor: 0.25, antes: 4, despues: 2, rampaIn: 6, rampaOut: 8 };
const VENTAJA_MAX_SEG = 1.5;
const CARRERAS_VALIDAS_MAX = 20;
/** Histéresis del marcador: una bola adelanta a otra solo si la supera por estos píxeles. */
const HISTERESIS_PX = 24;
/** 58 (antes 32, y antes 27): bola ≥ 6 % del alto del video (116 px) para que el icono (≥ 90 px) se lea en
 * el celular. El tablero se abrió en proporción (clavijas cada 200 × 165 px, bocas de embudo 250 px). */
const RADIO_BOLA = 58;
const RADIO_CLAVIJA = 13;
const REST_CLAVIJA = 0.6;
const REST_PARED = 0.55;
const REST_BOLA = 0.85;
const REST_SEGMENTO = 0.45;
const DURACION_MIN = 25;
const DURACION_MAX = 45;
const DURACION_OBJETIVO = 34;
const TOPE_SEG = 70; // corte duro si nadie llega

/** Escala pentatónica (Do mayor) para afinar el golpe de cada bola. */
const ESCALA_MIDI = [64, 67, 69, 72, 74, 76];

// ---------- Extras v2: bloques con vida y tubos ----------
/** Bloque: 112 × 68 px con esquinas de 14 px. Medido contra la rejilla (200 × 165, bola de 116 px): con un
 * bloque en el lugar de una clavija quedan ≥ 125 px a las clavijas vecinas (la bola pasa). Dos bloques
 * vecinos (en fila o en diagonal) sí cerrarían el paso: se exigen ≥ 260 px entre centros. */
const BLOQUE = { w: 112, h: 68, esquina: 14, separacion: 260, prob: 0.62, rest: 0.5, golpeMin: 110, enfriamiento: 9 };
/** Tubo: franja lateral de 380 px con pared; la bola (116 px) viaja dentro de un tubo de 136 px. */
const TUBO = { franja: 380, ancho: 136, boca: 110, velAtajo: 1300, velVueltas: 480, salidaMax: 760 };

interface TuboDef extends Omit<Tubo, 'usos'> { cx: number; velocidad: number; paso: number; largo: number }
interface Mundo { clavijas: Clavija[]; segmentos: Segmento[]; bloques: Bloque[]; tubos: TuboDef[] }

type P = [number, number];

/** Re-muestrea una polilínea a paso uniforme (arco): así la posición en el tubo sale de un índice. */
const remuestrear = (pts: P[], paso: number): P[] => {
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acum[acum.length - 1];
  const out: P[] = [];
  let j = 0;
  for (let d = 0; d <= total; d += paso) {
    while (j < acum.length - 2 && acum[j + 1] < d) j++;
    const u = (d - acum[j]) / Math.max(1e-9, acum[j + 1] - acum[j]);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  out.push(pts[pts.length - 1]);
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
};

/**
 * Línea central de un tubo, desde el fondo de la boca (cx, y0) hasta la salida (cx, ySalida), con
 * tangente final hacia abajo. `vueltas`: 3–4 rizos (trocoide: la bola sube y baja en cada vuelta).
 * `atajo`: serpentina rápida + 1 rizo. Todo cabe en cx ± 100 (la franja mide 380 y el tubo 136).
 */
const caminoTubo = (tipo: Tubo['tipo'], cx: number, y0: number, ySalida: number, nRizos: number): P[] => {
  const pts: P[] = [[cx, y0]];
  const fin = () => pts[pts.length - 1];
  /** Rizos: x = cx + R sen θ, y = yc + bθ + R(1 − cos θ). Con R > b la curva retrocede: cada vuelta es un rizo. */
  const rizos = (n: number, R: number, b: number) => {
    const yc = fin()[1];
    for (let th = 0.05; th <= 2 * Math.PI * n + 1e-9; th += 0.05) pts.push([cx + R * Math.sin(th), yc + b * th + R * (1 - Math.cos(th))]);
  };
  const serpentina = (H: number, A: number, k: number) => {
    const yc = fin()[1];
    for (let u = 0.01; u <= 1 + 1e-9; u += 0.01) pts.push([cx + A * Math.sin(2 * Math.PI * k * u), yc + H * u]);
  };
  /** Bézier cúbica desde el final actual (con su tangente) hasta `destino`, llegando en vertical. */
  const bajarA = (destino: P) => {
    const [x0, yy0] = fin();
    const [xa, ya] = pts[pts.length - 2];
    const tl = Math.hypot(x0 - xa, yy0 - ya) || 1;
    const h = Math.max(40, (destino[1] - yy0) / 2.5);
    const c1: P = [x0 + ((x0 - xa) / tl) * h, yy0 + ((yy0 - ya) / tl) * h];
    const c2: P = [destino[0], destino[1] - h];
    for (let t = 0.04; t <= 1 + 1e-9; t += 0.04) {
      const a = (1 - t) ** 3, bb = 3 * (1 - t) ** 2 * t, c = 3 * (1 - t) * t * t, d = t ** 3;
      pts.push([a * x0 + bb * c1[0] + c * c2[0] + d * destino[0], a * yy0 + bb * c1[1] + c * c2[1] + d * destino[1]]);
    }
  };
  if (tipo === 'vueltas') {
    const R = 100;
    // El fondo del último rizo queda 2R − πb bajo su final: la salida va 40 px más abajo que ese fondo.
    const b = (ySalida - 40 - 2 * R - y0) / (2 * Math.PI * nRizos - Math.PI);
    rizos(nRizos, R, b);
  } else {
    const R = 90, b = 40;
    const H = ySalida - y0 - (b * Math.PI + 2 * R) - 60;
    serpentina(H, 85, 1);
    rizos(1, R, b);
  }
  bajarA([cx, ySalida]);
  return pts;
};

/**
 * Coloca clavijas (con jitter y huecos), 3 rampas y 2 embudos. Todo nace de la semilla.
 * Con `extras`, además 2–3 tubos en franjas laterales libres y ~25 % de las clavijas interiores pasan a
 * ser bloques con vida. Los extras usan su PROPIO azar: con `extras: false` el tablero es idéntico al v1.
 */
const construirTablero = (azar: () => number, extras: boolean, semilla: number): Mundo => {
  const clavijas: Clavija[] = [];
  const segmentos: Segmento[] = [];
  const azarX = crearAzar((semilla ^ 0x7b10c5) >>> 0);

  // Embudos: paredes en V que se cierran a una boca de ~250 px, ligeramente descentrada.
  const embudos = [0.36, 0.70].map((f) => {
    const y = Math.round(META_Y * f + (azar() - 0.5) * 120);
    const boca = 250;
    const centro = ANCHO / 2 + (azar() - 0.5) * 220;
    const caida = 230; // alto del embudo
    segmentos.push({ x1: 0, y1: y - caida, x2: centro - boca / 2, y2: y, grosor: 16 });
    segmentos.push({ x1: ANCHO, y1: y - caida, x2: centro + boca / 2, y2: y, grosor: 16 });
    return { y, caida };
  });

  // Rampas: un plano inclinado que sale de una pared y empuja hacia el otro lado.
  const rampas = [0.18, 0.54, 0.86].map((f, i) => {
    const y = Math.round(META_Y * f + (azar() - 0.5) * 100);
    const desdeIzq = (i + Math.floor(azar() * 2)) % 2 === 0;
    const largo = 380 + azar() * 160;
    const caida = 90 + azar() * 50;
    if (desdeIzq) segmentos.push({ x1: 0, y1: y, x2: largo, y2: y + caida, grosor: 14 });
    else segmentos.push({ x1: ANCHO, y1: y, x2: ANCHO - largo, y2: y + caida, grosor: 14 });
    return { y, caida };
  });

  // Tubos (extras): cada uno en una franja lateral entre obstáculos de pared a pared (embudos, rampas).
  const tubos: TuboDef[] = [];
  if (extras) {
    const ocupado: [number, number][] = [
      [0, 1750] as [number, number], // la salida y la primera pantalla quedan clásicas (1.er choque ≤ 0,3 s)
      [META_Y - 750, ALTO] as [number, number],
      ...embudos.map((e): [number, number] => [e.y - e.caida - 60, e.y + 80]),
      ...rampas.map((r): [number, number] => [r.y - 60, r.y + r.caida + 60]),
    ].sort((a, b) => a[0] - b[0]);
    // Franjas libres (con el margen que el tubo limpia arriba de la boca y bajo la salida).
    const libres: [number, number][] = [];
    let cursor = 0;
    for (const [a, b] of ocupado) { if (a - cursor > 0) libres.push([cursor + 150, a - 170]); cursor = Math.max(cursor, b); }
    const n = azarX() < 0.5 ? 3 : 2;
    const tipos: Tubo['tipo'][] = ['atajo', 'vueltas', azarX() < 0.5 ? 'atajo' : 'vueltas'];
    // Orden aleatorio de las franjas (determinista) y un tubo por franja.
    const candidatas = libres.filter(([a, b]) => b - a >= 760).sort(() => azarX() - 0.5);
    let ladoIzq = azarX() < 0.5;
    for (const tipo of tipos.slice(0, n)) {
      const alto = tipo === 'atajo' ? 900 + azarX() * 200 : 760 + azarX() * 140;
      const k = candidatas.findIndex(([a, b]) => b - a >= alto);
      if (k < 0) continue;
      const [a, b] = candidatas.splice(k, 1)[0];
      const yBoca = Math.round(a + azarX() * (b - a - alto));
      const ySalida = Math.round(yBoca + alto);
      const x0 = ladoIzq ? 0 : ANCHO - TUBO.franja, x1 = ladoIzq ? TUBO.franja : ANCHO;
      const cx = ladoIzq ? TUBO.franja / 2 : ANCHO - TUBO.franja / 2;
      const puntos = remuestrear(caminoTubo(tipo, cx, yBoca + TUBO.boca, ySalida, alto > 850 ? 4 : 3), 8);
      let largo = 0;
      for (let i = 1; i < puntos.length; i++) largo += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
      tubos.push({ tipo, x0, x1, yBoca, ySalida, puntos, ancho: TUBO.ancho, cx, velocidad: tipo === 'atajo' ? TUBO.velAtajo : TUBO.velVueltas, paso: 8, largo });
      // Pared del lado de la cancha: las demás bolas no se cuelan al tubo por el costado.
      const xp = ladoIzq ? TUBO.franja : ANCHO - TUBO.franja;
      segmentos.push({ x1: xp, y1: yBoca, x2: xp, y2: ySalida - 20, grosor: 12 });
      ladoIzq = !ladoIzq;
    }
    tubos.sort((p, q) => p.yBoca - q.yBoca);
  }
  const enTubo = (x: number, y: number) => tubos.some((t) => x > t.x0 - 70 && x < t.x1 + 70 && y > t.yBoca - 150 && y < t.ySalida + 170);

  // Zonas donde NO van clavijas (embudos y rampas, con margen).
  const prohibido = (y: number) =>
    embudos.some((e) => y > e.y - e.caida - 140 && y < e.y + 160) ||
    rampas.some((r) => y > r.y - 130 && y < r.y + r.caida + 130);

  // Con bolas de 116 px: hueco horizontal 200 − 26 = 174 px y diagonal ≈ 193 − 26 = 167 px (> 116 holgado).
  const sepX = 200;
  const sepY = 165;
  let fila = 0;
  // La 1.ª fila queda a ~130 px bajo la salida: el primer choque con una clavija llega en ≤ 0,3 s.
  for (let y = 840; y < META_Y - 320; y += sepY, fila++) {
    if (prohibido(y)) continue;
    const desfase = fila % 2 === 0 ? sepX / 2 : 0;
    // Columnas simétricas y a > 1 diámetro de la pared (140 − 13 = 127 px): ninguna bola queda presa en un bolsillo pared–clavija.
    for (let x = 140 + desfase; x <= ANCHO - 140; x += sepX) {
      if (fila > 0 && azar() < 0.14) continue; // huecos para que el camino no sea uniforme (la 1.ª fila, completa)
      const c = { x: Math.round(x + (azar() - 0.5) * 12), y: Math.round(y + (azar() - 0.5) * 12), r: RADIO_CLAVIJA };
      if (extras && enTubo(c.x, c.y)) continue;
      clavijas.push(c);
    }
  }

  // Bloques con vida (extras): clavijas interiores (lejos de las paredes: un bloque junto a la pared haría
  // bolsillo) pasan a ser bloques, nunca vecinos entre sí.
  const bloques: Bloque[] = [];
  if (extras) {
    const quedan: Clavija[] = [];
    for (const c of clavijas) {
      const elegible = c.x >= 230 && c.x <= ANCHO - 230 && c.y >= 1150 && c.y <= META_Y - 420 &&
        bloques.every((b) => Math.hypot(b.x - c.x, b.y - c.y) >= BLOQUE.separacion);
      if (elegible && azarX() < BLOQUE.prob) {
        const u = azarX();
        bloques.push({ x: c.x, y: c.y, w: BLOQUE.w, h: BLOQUE.h, vida: u < 0.35 ? 1 : u < 0.75 ? 2 : 3, golpes: [], roto: -1, rompio: -1 });
      } else quedan.push(c);
    }
    clavijas.length = 0;
    clavijas.push(...quedan);
  }
  return { clavijas, segmentos, bloques, tubos };
};

/** Punto del rectángulo interior de un bloque (sin esquinas) más cercano a (x, y): la colisión es con un rectángulo redondeado. */
const cercanoBloque = (b: Bloque, x: number, y: number): P => {
  const hx = b.w / 2 - BLOQUE.esquina, hy = b.h / 2 - BLOQUE.esquina;
  return [Math.max(b.x - hx, Math.min(b.x + hx, x)), Math.max(b.y - hy, Math.min(b.y + hy, y))];
};

/** Posición en un tubo a `s` px del fondo de la boca (interpolada sobre la línea central re-muestreada). */
const puntoTubo = (t: TuboDef, s: number): P => {
  const u = Math.max(0, Math.min(t.puntos.length - 1.000001, s / t.paso));
  const i = Math.floor(u), f = u - i;
  const a = t.puntos[i], b = t.puntos[Math.min(i + 1, t.puntos.length - 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};

interface Bola {
  x: number; y: number; vx: number; vy: number; llego: number; quieto: number;
  /** Tubo en el que viaja (-1 = en la cancha), distancia recorrida, velocidad y punto de entrada. */
  tubo: number; s: number; v: number; ex: number; ey: number; desde: number;
}

/** Resultado crudo de la física: todo en frames de FÍSICA (1/60 s de carrera real). */
interface Resultado {
  mundo: Mundo;
  posiciones: [number, number][][];
  eventos: EventoCarrera[];
  /** Instante (en frames de física, fraccionario) en que cada bola cruza; -1 si no llega. */
  llegadas: number[];
  tGanadora: number;
  /** Ventaja 1.º–2.º en s (Infinity si la 2.ª no llega en la ventana de celebración). */
  ventaja: number;
  /** Usos de tubo (frames de física). */
  usos: { tubo: number; bola: number; desde: number; hasta: number }[];
  /** "X le abrió el camino a Y" (frames de física: cuando Y pasa por donde estaba el bloque). */
  caminos: { frame: number; bola: number; otra: number; bloque: number }[];
}

/** Corre la carrera completa para una semilla y gravedad dadas. */
const correr = (n: number, semilla: number, gravedad: number, extras: boolean): Resultado | null => {
  const azar = crearAzar(semilla);
  const mundo = construirTablero(azar, extras, semilla);
  const { clavijas, segmentos, bloques, tubos } = mundo;
  // Estado de los bloques en esta carrera (el mundo es nuevo en cada corrida).
  const vida = bloques.map((b) => b.vida);
  const rotoFisica = bloques.map(() => -1);
  const ultimoGolpeBloque = bloques.map(() => new Array(n).fill(-999));

  // Orden de salida y posiciones iniciales: ya en movimiento en el frame 0.
  const orden = [...Array(n).keys()].sort(() => azar() - 0.5);
  const paso = (ANCHO - 2 * 110) / (n - 1);
  const bolas: Bola[] = orden.map((idx, k) => ({
    x: 110 + k * paso + (azar() - 0.5) * 20,
    y: 640 + azar() * 40, // nacen bajo el gancho y el marcador fijos, ya cayendo
    vx: (azar() - 0.5) * 120,
    vy: 420 + azar() * 80,
    llego: -1,
    quieto: 0,
    tubo: -1, s: 0, v: 0, ex: 0, ey: 0, desde: 0,
  }));
  // `bolas[k]` corresponde al participante orden[k]; reordenamos para indexar por participante.
  const porParticipante: Bola[] = new Array(n);
  orden.forEach((idx, k) => { porParticipante[idx] = bolas[k]; });

  // Rejilla espacial para clavijas (celdas de 150 px por fila).
  const celda = 150;
  const porCelda = new Map<number, number[]>();
  clavijas.forEach((c, ci) => {
    const k = Math.floor(c.y / celda);
    for (const kk of [k - 1, k, k + 1]) {
      if (!porCelda.has(kk)) porCelda.set(kk, []);
      porCelda.get(kk)!.push(ci);
    }
  });

  const posiciones: [number, number][][] = porParticipante.map(() => []);
  const eventos: EventoCarrera[] = [];
  const llegadas: number[] = new Array(n).fill(-1);
  const usos: Resultado['usos'] = [];
  let tGanadora = -1;
  const topeFrames = TOPE_SEG * FPS;
  const ultimoGolpe = new Array(n).fill(-999); // frame del último evento por bola (anti-spam)
  const RR_BLOQUE = RADIO_BOLA + BLOQUE.esquina;

  for (let frame = 0; frame < topeFrames; frame++) {
    for (let s = 0; s < SUBPASOS; s++) {
      // Integración (en la cancha) y avance por el tubo (las que van dentro)
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
        if (b.tubo >= 0) {
          const t = tubos[b.tubo];
          // La velocidad converge a la del tubo en ~0,3 s: entra con su impulso, sale con la del tubo.
          b.v += (t.velocidad - b.v) * (DT / 0.3);
          const embudo = Math.hypot(t.cx - b.ex, t.yBoca + TUBO.boca - b.ey);
          // Fila india: dentro del tubo ninguna bola se acerca a menos de un diámetro (+8 px) de la de adelante.
          let tope = Infinity;
          for (let j = 0; j < n; j++) {
            const o = porParticipante[j];
            if (j === i || o.tubo !== b.tubo) continue;
            const so = o.s - Math.hypot(t.cx - o.ex, t.yBoca + TUBO.boca - o.ey), sb = b.s - embudo;
            if (so > sb || (so === sb && j < i)) tope = Math.min(tope, so - 2 * RADIO_BOLA - 8);
          }
          b.s = Math.min(b.s + b.v * DT, Math.max(b.s, tope + embudo));
          if (b.s < embudo) {
            const u = b.s / embudo;
            b.x = b.ex + (t.cx - b.ex) * u; b.y = b.ey + (t.yBoca + TUBO.boca - b.ey) * u;
          } else if (b.s - embudo < t.largo) {
            [b.x, b.y] = puntoTubo(t, b.s - embudo);
          } else {
            // Sale por abajo, en vertical, con la velocidad del tubo (acotada: la física no explota).
            const fin = t.puntos[t.puntos.length - 1];
            b.x = fin[0]; b.y = fin[1];
            b.vx = 0; b.vy = Math.min(TUBO.salidaMax, b.v);
            usos.push({ tubo: b.tubo, bola: i, desde: b.desde, hasta: frame + (s + 1) / SUBPASOS });
            eventos.push({ frame, tipo: 'tuboSale', bola: i, tubo: b.tubo });
            b.tubo = -1; b.quieto = 0;
          }
          continue;
        }
        b.vy += gravedad * DT;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
        // ¿Entró a la boca de un tubo? (franja lateral, primeros 60 px bajo la boca)
        for (let k = 0; k < tubos.length; k++) {
          const t = tubos[k];
          if (b.y >= t.yBoca && b.y <= t.yBoca + 60 && b.x > t.x0 && b.x < t.x1 && b.vy > 0) {
            b.tubo = k; b.s = 0; b.v = Math.max(250, Math.hypot(b.vx, b.vy)); b.ex = b.x; b.ey = b.y; b.desde = frame + s / SUBPASOS;
            eventos.push({ frame, tipo: 'tubo', bola: i, tubo: k });
            break;
          }
        }
      }
      // Choques
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
        if (b.tubo >= 0) continue;
        // Paredes
        if (b.x < RADIO_BOLA) { b.x = RADIO_BOLA; if (b.vx < 0) b.vx = -b.vx * REST_PARED; }
        if (b.x > ANCHO - RADIO_BOLA) { b.x = ANCHO - RADIO_BOLA; if (b.vx > 0) b.vx = -b.vx * REST_PARED; }
        if (b.y > ALTO - RADIO_BOLA) { b.y = ALTO - RADIO_BOLA; if (b.vy > 0) b.vy = -b.vy * 0.3; b.vx *= 0.9; }
        // Clavijas
        const vecinas = porCelda.get(Math.floor(b.y / celda));
        if (vecinas) for (const ci of vecinas) {
          const c = clavijas[ci];
          const dx = b.x - c.x, dy = b.y - c.y;
          const d2 = dx * dx + dy * dy;
          const rr = RADIO_BOLA + c.r;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          b.x = c.x + nx * rr; b.y = c.y + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + REST_CLAVIJA) * vn * nx;
            b.vy -= (1 + REST_CLAVIJA) * vn * ny;
            if (-vn > 70 && frame - ultimoGolpe[i] >= 2) {
              ultimoGolpe[i] = frame;
              eventos.push({ frame, tipo: 'clavija', bola: i, clavija: ci, hz: midiAHz(ESCALA_MIDI[i]), fuerza: Math.min(1, -vn / 1000) });
            }
          }
        }
        // Bloques con vida (rectángulo redondeado). Uno roto ya no existe para la física.
        for (let k = 0; k < bloques.length; k++) {
          if (vida[k] <= 0) continue;
          const bl = bloques[k];
          if (Math.abs(b.y - bl.y) > bl.h / 2 + RADIO_BOLA || Math.abs(b.x - bl.x) > bl.w / 2 + RADIO_BOLA) continue;
          const [qx, qy] = cercanoBloque(bl, b.x, b.y);
          const dx = b.x - qx, dy = b.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= RR_BLOQUE * RR_BLOQUE) continue;
          let nx: number, ny: number, d: number;
          if (d2 === 0) { nx = 0; ny = -1; d = 0; } else { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
          b.x = qx + nx * RR_BLOQUE; b.y = qy + ny * RR_BLOQUE;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + BLOQUE.rest) * vn * nx;
            b.vy -= (1 + BLOQUE.rest) * vn * ny;
            // Golpe sobre la cara plana: un empujoncito lateral para que no se quede posada encima.
            if (Math.abs(ny) > 0.9) b.vx += (b.x >= bl.x ? 1 : -1) * 55;
            if (-vn > BLOQUE.golpeMin && frame - ultimoGolpeBloque[k][i] >= BLOQUE.enfriamiento) {
              ultimoGolpeBloque[k][i] = frame;
              ultimoGolpe[i] = frame;
              vida[k]--;
              eventos.push({ frame, tipo: 'bloque', bola: i, bloque: k, vida: vida[k], fuerza: Math.min(1, -vn / 1000) });
              if (vida[k] === 0) {
                rotoFisica[k] = frame;
                eventos.push({ frame, tipo: 'rompe', bola: i, bloque: k });
              }
            }
          }
        }
        // Segmentos (rampas, embudos, paredes de tubo)
        for (const sg of segmentos) {
          const ex = sg.x2 - sg.x1, ey = sg.y2 - sg.y1;
          const l2 = ex * ex + ey * ey;
          let t = ((b.x - sg.x1) * ex + (b.y - sg.y1) * ey) / l2;
          t = Math.max(0, Math.min(1, t));
          const px = sg.x1 + ex * t, py = sg.y1 + ey * t;
          const dx = b.x - px, dy = b.y - py;
          const d2 = dx * dx + dy * dy;
          const rr = RADIO_BOLA + sg.grosor / 2;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          b.x = px + nx * rr; b.y = py + ny * rr;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + REST_SEGMENTO) * vn * nx;
            b.vy -= (1 + REST_SEGMENTO) * vn * ny;
            // Fricción tangencial leve para que deslice sin frenarse del todo.
            const tx = -ny, ty = nx;
            const vt = b.vx * tx + b.vy * ty;
            b.vx -= vt * 0.0015 * tx; b.vy -= vt * 0.0015 * ty;
            if (-vn > 140 && frame - ultimoGolpe[i] >= 3) {
              ultimoGolpe[i] = frame;
              eventos.push({ frame, tipo: 'rampa', bola: i, hz: midiAHz(ESCALA_MIDI[i]), fuerza: Math.min(1, -vn / 1000) });
            }
          }
        }
      }
      // Bola–bola (las que van dentro de un tubo no chocan con nadie)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = porParticipante[i], b = porParticipante[j];
        if (a.tubo >= 0 || b.tubo >= 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const rr = RADIO_BOLA * 2;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const sol = (rr - d) / 2;
        a.x -= nx * sol; a.y -= ny * sol; b.x += nx * sol; b.y += ny * sol;
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel < 0) {
          const imp = -(1 + REST_BOLA) * vrel / 2;
          a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
          if (-vrel > 90 && frame - ultimoGolpe[i] >= 2) {
            ultimoGolpe[i] = frame; ultimoGolpe[j] = frame;
            eventos.push({ frame, tipo: 'bola', bola: i, otra: j, hz: midiAHz((ESCALA_MIDI[i] + ESCALA_MIDI[j]) / 2 + 12), fuerza: Math.min(1, -vrel / 900) });
          }
        }
      }
      // Anti-atasco: una bola casi quieta durante 0,35 s recibe un empujón determinista.
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
        if (b.llego >= 0 || b.tubo >= 0) continue;
        const v = Math.hypot(b.vx, b.vy);
        b.quieto = v < 25 ? b.quieto + 1 : 0;
        if (b.quieto > 0.35 / DT) {
          // Salto hacia el centro del tablero (lejos de la pared más cercana).
          const haciaCentro = b.x < ANCHO / 2 ? 1 : -1;
          b.vx = haciaCentro * (180 + azar() * 120);
          b.vy = -(260 + azar() * 120);
          b.quieto = 0;
        }
      }
      // Meta
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
        if (b.llego < 0 && b.y >= META_Y) {
          // Instante exacto (con precisión de subpaso): ahí debe sonar la fanfarria.
          // Ojo: posiciones[k] es el estado al FINAL del frame k, así que el subpaso s del
          // frame `frame` cae entre posiciones[frame-1] y posiciones[frame].
          const t = frame - 1 + (s + 1) / SUBPASOS;
          b.llego = t; llegadas[i] = t;
          eventos.push({ frame, tipo: 'meta', bola: i });
          if (tGanadora < 0) tGanadora = t;
        }
      }
    }

    // Registro por frame
    for (let i = 0; i < n; i++) {
      const b = porParticipante[i];
      posiciones[i].push([Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]);
    }
    if (tGanadora >= 0 && frame >= tGanadora + CELEBRACION_SEG * FPS) {
      const tiempos = llegadas.filter((t) => t >= 0).sort((a, b) => a - b);
      const ventaja = tiempos.length >= 2 ? (tiempos[1] - tiempos[0]) / FPS : Infinity;
      // Bolas que siguen dentro de un tubo al cortar: su uso termina aquí.
      porParticipante.forEach((b, i) => { if (b.tubo >= 0) usos.push({ tubo: b.tubo, bola: i, desde: b.desde, hasta: frame }); });
      // ¿A quién le abrió el camino cada bloque roto? A la primera OTRA bola que pase (en ≤ 8 s) por donde
      // estaba: con el bloque ahí habría chocado.
      const caminos: Resultado['caminos'] = [];
      bloques.forEach((bl, k) => {
        if (rotoFisica[k] < 0) return;
        const quien = eventos.find((e) => e.tipo === 'rompe' && e.bloque === k)!.bola;
        let mejor: { frame: number; otra: number } | null = null;
        for (let j = 0; j < n; j++) {
          if (j === quien) continue;
          for (let f = rotoFisica[k] + 1; f < Math.min(posiciones[j].length, rotoFisica[k] + 8 * FPS); f++) {
            const [x, y] = posiciones[j][f];
            const [qx, qy] = cercanoBloque(bl, x, y);
            if (Math.hypot(x - qx, y - qy) < RR_BLOQUE - 4) { if (!mejor || f < mejor.frame) mejor = { frame: f, otra: j }; break; }
          }
        }
        if (mejor) caminos.push({ frame: mejor.frame, bola: quien, otra: mejor.otra, bloque: k });
      });
      return { mundo, posiciones, eventos, llegadas, tGanadora, ventaja, usos, caminos };
    }
  }
  return null; // nadie llegó dentro del tope
};

/** ¿La carrera luce los extras? Al menos un tubo usado y un bloque roto (y, si se puede, un "le abrió el camino"). */
const puntajeExtras = (r: Resultado) =>
  (r.usos.length > 0 ? 1 : 0) + (r.eventos.some((e) => e.tipo === 'rompe') ? 1 : 0) + (r.caminos.length > 0 ? 1 : 0);

/**
 * Busca semilla/gravedad hasta que la ganadora cruce entre 25 y 45 s y la carrera sea
 * reñida (1.º–2.º < 1,5 s). Con extras, además: algún tubo usado, algún bloque roto y algún
 * "le abrió el camino" (puntaje 3). Tras N carreras de duración válida sin cumplir, se queda con
 * la mejor (más extras, luego más ajustada).
 */
const simular = (guion: GuionCarrera) => {
  const n = guion.participantes.length;
  const extras = guion.extras !== false;
  const base = guion.semilla ?? semillaDesde(guion.id);
  const meta = extras ? 3 : 0;
  const maxValidas = extras ? 60 : CARRERAS_VALIDAS_MAX;
  let gravedad = 1100;
  let semilla = base;
  let validas = 0;
  let mejor: { r: Resultado; semilla: number; gravedad: number; p: number } | null = null;
  for (let intento = 0; intento < 240; intento++) {
    const r = correr(n, semilla, gravedad, extras);
    const dur = r ? r.tGanadora / FPS : Infinity;
    if (r && dur >= DURACION_MIN && dur <= DURACION_MAX) {
      validas++;
      const p = extras ? puntajeExtras(r) : 0;
      const reñida = r.ventaja < VENTAJA_MAX_SEG;
      // Primero los extras completos y reñida; luego más extras; luego menos ventaja.
      const clave = (x: { r: Resultado; p: number }) => (x.r.ventaja < VENTAJA_MAX_SEG ? 0 : 1) * 10 + (meta - x.p) + Math.min(0.99, x.r.ventaja / 100);
      if (!mejor || clave({ r, p }) < clave(mejor)) mejor = { r, semilla, gravedad, p };
      if ((reñida && p >= meta) || validas >= maxValidas) return { ...mejor, intentos: intento + 1 };
    } else {
      // Duración fuera de rango: acerca la gravedad al objetivo.
      if (r) gravedad = Math.max(700, Math.min(2500, gravedad * Math.pow(dur / DURACION_OBJETIVO, 1.2)));
      else gravedad = Math.min(2500, gravedad * 1.3);
    }
    semilla = (semilla + 0x9e3779b9) >>> 0;
  }
  if (mejor) return { ...mejor, intentos: 240 };
  throw new Error(`carrera ${guion.id}: no se logró una duración de 25–45 s en 240 intentos`);
};

/** Velocidad de reproducción (frames de física por frame de video) según la distancia al cruce. */
const velocidad = (t: number, tCruce: number) => {
  const d = t - tCruce;
  const { factor, antes, despues, rampaIn, rampaOut } = LENTA;
  if (d < -antes - rampaIn || d > despues + rampaOut) return 1;
  if (d < -antes) return 1 + (factor - 1) * ((d + antes + rampaIn) / rampaIn);
  if (d <= despues) return factor;
  return factor + (1 - factor) * ((d - despues) / rampaOut);
};

/**
 * Pasa la física (frames de carrera real) al tiempo del video: cámara lenta en la llegada,
 * cámara que sigue a la líder y ranking con histéresis. Devuelve todo en frames de VIDEO.
 */
const alVideo = (r: Resultado) => {
  const n = r.posiciones.length;
  const finFisica = r.posiciones[0].length - 1;
  // t[o] = instante de física que muestra el frame de video o.
  const t: number[] = [];
  for (let x = 0; x <= finFisica; x += velocidad(x, r.tGanadora)) t.push(x);
  const aVideo = (tf: number) => { // primer frame de video que ya muestra el instante tf
    let lo = 0, hi = t.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] >= tf - 1e-9) hi = m; else lo = m + 1; }
    return lo;
  };
  const posiciones = r.posiciones.map((pos) => t.map((x): [number, number] => {
    const a = Math.floor(x), b = Math.min(a + 1, finFisica), u = x - a;
    return [Math.round((pos[a][0] + (pos[b][0] - pos[a][0]) * u) * 10) / 10, Math.round((pos[a][1] + (pos[b][1] - pos[a][1]) * u) * 10) / 10];
  }));
  const eventos = r.eventos.map((ev) => ({ ...ev, frame: aVideo(ev.frame) }));
  const llegadas = r.llegadas.map((x) => (x < 0 ? -1 : aVideo(x)));
  const frameGanadora = aVideo(r.tGanadora);
  const lentos = t.map((x, o) => (velocidad(x, r.tGanadora) < 1 ? o : -1)).filter((o) => o >= 0);
  const camaraLenta = { desde: lentos[0], hasta: lentos[lentos.length - 1], factor: LENTA.factor };

  // Cámara: apunta a la líder (algo por debajo del centro) con suavizado y luego la acota a una
  // banda para que la líder NUNCA quede fuera de la zona segura (ni bajo la UI de YouTube).
  const camara: number[] = [];
  let cam = 0;
  let frameRiser = -1;
  for (let o = 0; o < t.length; o++) {
    let liderY = 0;
    for (let i = 0; i < n; i++) liderY = Math.max(liderY, Math.min(posiciones[i][o][1], META_Y + 120));
    if (frameRiser < 0 && liderY > META_Y * 0.85) frameRiser = o;
    const objetivo = liderY - PANTALLA * 0.56;
    cam = o === 0 ? objetivo : cam + (objetivo - cam) * 0.07;
    cam = Math.max(liderY - BANDA_LIDER.abajo, Math.min(liderY - BANDA_LIDER.arriba, cam));
    cam = Math.max(0, Math.min(CAM_MAX, cam));
    camara.push(Math.round(cam * 10) / 10);
  }

  // Ranking con histéresis: las que llegaron van primero (por orden de llegada); entre las
  // que corren, una adelanta a otra solo si la supera por HISTERESIS_PX (evita parpadeo).
  const ranking: number[][] = [];
  let actual = [...Array(n).keys()].sort((a, b) => posiciones[b][0][1] - posiciones[a][0][1]);
  for (let o = 0; o < t.length; o++) {
    const llego = (i: number) => llegadas[i] >= 0 && llegadas[i] <= o;
    const delante = (a: number, b: number) => { // ¿b debe pasar delante de a?
      if (llego(a) && llego(b)) return llegadas[b] < llegadas[a];
      if (llego(a)) return false;
      if (llego(b)) return true;
      return posiciones[b][o][1] > posiciones[a][o][1] + HISTERESIS_PX;
    };
    actual = [...actual];
    for (let pasada = 0; pasada < n; pasada++) {
      let cambio = false;
      for (let k = 0; k + 1 < n; k++) {
        if (delante(actual[k], actual[k + 1])) { [actual[k], actual[k + 1]] = [actual[k + 1], actual[k]]; cambio = true; }
      }
      if (!cambio) break;
    }
    ranking.push(actual);
  }
  // Extras: golpes y roturas de bloques, usos de tubo y avisos, en frames de VIDEO.
  const bloques: Bloque[] = r.mundo.bloques.map((b, k) => {
    const golpes = eventos.filter((e) => e.tipo === 'bloque' && e.bloque === k).map((e) => e.frame);
    const rompe = eventos.find((e) => e.tipo === 'rompe' && e.bloque === k);
    return { x: b.x, y: b.y, w: b.w, h: b.h, vida: b.vida, golpes, roto: rompe ? rompe.frame : -1, rompio: rompe ? rompe.bola : -1 };
  });
  const tubos: Tubo[] = r.mundo.tubos.map((tb, k) => ({
    tipo: tb.tipo, x0: tb.x0, x1: tb.x1, yBoca: tb.yBoca, ySalida: tb.ySalida, puntos: tb.puntos, ancho: tb.ancho,
    usos: r.usos.filter((u) => u.tubo === k).map((u) => ({ bola: u.bola, desde: aVideo(u.desde), hasta: aVideo(u.hasta) })).sort((a, b) => a.desde - b.desde),
  }));
  // Avisos: "le abrió el camino" y "se metió al tubo", en orden; uno cada AVISO_SEPARACION frames como máximo
  // y nunca desde la cámara lenta (el foco es la meta).
  const candidatos: AvisoCarrera[] = [
    ...r.caminos.map((c): AvisoCarrera => ({ frame: aVideo(c.frame), tipo: 'camino', bola: c.bola, otra: c.otra })),
    ...tubos.flatMap((tb, k) => tb.usos.map((u): AvisoCarrera => ({ frame: u.desde, tipo: 'tubo', bola: u.bola, tubo: k }))),
  ].sort((a, b) => a.frame - b.frame || (a.tipo === 'camino' ? -1 : 1));
  const avisos: AvisoCarrera[] = [];
  for (const a of candidatos) {
    if (a.frame >= camaraLenta.desde - 60) break;
    if (avisos.length && a.frame - avisos[avisos.length - 1].frame < AVISO_SEPARACION) continue;
    avisos.push(a);
  }
  return { posiciones, eventos, llegadas, frameGanadora, camaraLenta, camara, ranking, frameRiser, duracionFrames: t.length, bloques, tubos, avisos };
};

/** Simula, escribe `public/sim/<id>.json` y `public/audio/generado/<id>.wav`. Devuelve la simulación. */
export const prepararSimulacion = (guion: GuionCarrera): SimulacionCarrera => {
  const { r, semilla, gravedad, intentos } = simular(guion);
  const v = alVideo(r);
  // Orden final: por instante de llegada; las que no llegan, por lo avanzadas que van al final.
  const ultimo = r.posiciones[0].length - 1;
  const orden = r.llegadas
    .map((f, i) => ({ f: f < 0 ? Infinity : f, y: r.posiciones[i][ultimo][1], i }))
    .sort((a, b) => a.f - b.f || b.y - a.y || a.i - b.i)
    .map((o) => o.i);
  const sim: SimulacionCarrera = {
    version: 2,
    id: guion.id,
    semilla,
    fps: FPS,
    tablero: { ancho: ANCHO, alto: ALTO, metaY: META_Y, radioBola: RADIO_BOLA },
    clavijas: r.mundo.clavijas,
    segmentos: r.mundo.segmentos,
    posiciones: v.posiciones,
    camara: v.camara,
    ranking: v.ranking,
    eventos: v.eventos,
    llegadas: v.llegadas,
    orden,
    ganadora: orden[0],
    frameGanadora: v.frameGanadora,
    ventajaSeg: Math.round(r.ventaja * 1000) / 1000,
    camaraLenta: v.camaraLenta,
    duracionFrames: v.duracionFrames,
    frameRiser: v.frameRiser,
    ...(guion.extras !== false ? { bloques: v.bloques, tubos: v.tubos, avisos: v.avisos } : {}),
  };
  const rutaSim = path.join(RAIZ, 'public/sim', `${guion.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const rutaWav = path.join(RAIZ, 'public/audio/generado', `${guion.id}.wav`);
  sintetizarCarrera(sim, rutaWav);
  const golpes = sim.eventos.filter((e) => e.tipo === 'clavija' || e.tipo === 'rampa').length;
  const choques = sim.eventos.filter((e) => e.tipo === 'bola').length;
  console.log(
    `[carrera] ${guion.id}: gana "${guion.participantes[sim.ganadora].etiqueta}" a los ${(r.tGanadora / FPS).toFixed(1)} s` +
    ` por ${Number.isFinite(r.ventaja) ? r.ventaja.toFixed(2) + ' s' : 'mucho (2.ª no llega)'}` +
    ` · ${intentos} intento(s), semilla ${semilla}, g=${gravedad.toFixed(0)} · ${golpes} golpes, ${choques} choques` +
    ` · video ${((sim.duracionFrames + CIERRE_FRAMES) / FPS).toFixed(1)} s`,
  );
  const primerGolpe = sim.eventos.find((e) => e.tipo === 'clavija');
  console.log(`[carrera] 1.er choque con clavija: ${primerGolpe ? ((primerGolpe.frame / FPS) * 1000).toFixed(0) + ' ms' : '—'}`);
  if (sim.bloques) {
    const rotos = sim.bloques.filter((b) => b.roto >= 0).length;
    const usosTubo = sim.tubos!.reduce((a, t) => a + t.usos.length, 0);
    console.log(`[carrera] extras: ${sim.bloques.length} bloques (${rotos} rotos) · ${sim.tubos!.length} tubos [${sim.tubos!.map((t) => `${t.tipo}×${t.usos.length}`).join(', ')}] → ${usosTubo} uso(s) · ${sim.avisos!.length} aviso(s): ${sim.avisos!.map((a) => `${(a.frame / FPS).toFixed(1)} s ${a.tipo === 'camino' ? `${guion.participantes[a.bola].etiqueta}→${guion.participantes[a.otra!].etiqueta}` : `${guion.participantes[a.bola].etiqueta} al tubo`}`).join(' · ')}`);
  }
  console.log(`[carrera] orden: ${orden.map((i, k) => `${k + 1}.º ${guion.participantes[i].etiqueta}${sim.llegadas[i] < 0 ? ' (por posición en pista)' : ''}`).join(' · ')}`);
  console.log(`[carrera] → ${path.relative(RAIZ, rutaSim)} · ${path.relative(RAIZ, rutaWav)}`);
  return sim;
};

/** Lee un guion (envoltorio o props sueltos) y devuelve los props validados. */
export const leerProps = (ruta: string): GuionCarrera => {
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  const props = crudo && typeof crudo === 'object' && 'props' in crudo ? { ...crudo.props, id: crudo.props.id ?? crudo.id } : crudo;
  return GuionCarrera.parse(props);
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('Uso: npx tsx scripts/simular-carrera.mts <guion.json>'); process.exit(2); }
  prepararSimulacion(leerProps(path.resolve(ruta)));
}
