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
import { CELEBRACION_SEG, CIERRE_FRAMES, type Clavija, type EventoCarrera, type Segmento, type SimulacionCarrera } from '../src/plantillas/carrera/tipos';
import { SR, barrido, escribirWav, golpe, midiAHz, nota } from './lib/wav.mjs';

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

interface Mundo { clavijas: Clavija[]; segmentos: Segmento[] }

/** Coloca clavijas (con jitter y huecos), 2 rampas y 2 embudos. Todo nace de la semilla. */
const construirTablero = (azar: () => number): Mundo => {
  const clavijas: Clavija[] = [];
  const segmentos: Segmento[] = [];

  // Embudos: paredes en V que se cierran a una boca de ~170 px, ligeramente descentrada.
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
      clavijas.push({
        x: Math.round(x + (azar() - 0.5) * 12),
        y: Math.round(y + (azar() - 0.5) * 12),
        r: RADIO_CLAVIJA,
      });
    }
  }
  return { clavijas, segmentos };
};

interface Bola { x: number; y: number; vx: number; vy: number; llego: number; quieto: number }

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
}

/** Corre la carrera completa para una semilla y gravedad dadas. */
const correr = (n: number, semilla: number, gravedad: number): Resultado | null => {
  const azar = crearAzar(semilla);
  const mundo = construirTablero(azar);
  const { clavijas, segmentos } = mundo;

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
  let tGanadora = -1;
  const topeFrames = TOPE_SEG * FPS;
  const ultimoGolpe = new Array(n).fill(-999); // frame del último evento por bola (anti-spam)

  for (let frame = 0; frame < topeFrames; frame++) {
    for (let s = 0; s < SUBPASOS; s++) {
      // Integración
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
        b.vy += gravedad * DT;
        b.x += b.vx * DT;
        b.y += b.vy * DT;
      }
      // Choques
      for (let i = 0; i < n; i++) {
        const b = porParticipante[i];
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
        // Segmentos (rampas, embudos)
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
      // Bola–bola
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = porParticipante[i], b = porParticipante[j];
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
        if (b.llego >= 0) continue;
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
      return { mundo, posiciones, eventos, llegadas, tGanadora, ventaja };
    }
  }
  return null; // nadie llegó dentro del tope
};

/**
 * Busca semilla/gravedad hasta que la ganadora cruce entre 25 y 45 s y la carrera sea
 * reñida (1.º–2.º < 1,5 s). Tras 20 carreras de duración válida sin cumplir, se queda
 * con la más ajustada.
 */
const simular = (guion: GuionCarrera) => {
  const n = guion.participantes.length;
  const base = guion.semilla ?? semillaDesde(guion.id);
  let gravedad = 1100;
  let semilla = base;
  let validas = 0;
  let mejor: { r: Resultado; semilla: number; gravedad: number } | null = null;
  for (let intento = 0; intento < 120; intento++) {
    const r = correr(n, semilla, gravedad);
    const dur = r ? r.tGanadora / FPS : Infinity;
    if (r && dur >= DURACION_MIN && dur <= DURACION_MAX) {
      validas++;
      if (!mejor || r.ventaja < mejor.r.ventaja) mejor = { r, semilla, gravedad };
      if (r.ventaja < VENTAJA_MAX_SEG || validas >= CARRERAS_VALIDAS_MAX) {
        return { ...mejor, intentos: intento + 1 };
      }
    } else {
      // Duración fuera de rango: acerca la gravedad al objetivo.
      if (r) gravedad = Math.max(700, Math.min(2500, gravedad * Math.pow(dur / DURACION_OBJETIVO, 1.2)));
      else gravedad = Math.min(2500, gravedad * 1.3);
    }
    semilla = (semilla + 0x9e3779b9) >>> 0;
  }
  if (mejor) return { ...mejor, intentos: 120 };
  throw new Error(`carrera ${guion.id}: no se logró una duración de 25–45 s en 120 intentos`);
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
  return { posiciones, eventos, llegadas, frameGanadora, camaraLenta, camara, ranking, frameRiser, duracionFrames: t.length };
};

// ---------- Audio ----------
const sintetizar = (sim: SimulacionCarrera, ruta: string) => {
  const segundos = (sim.duracionFrames + CIERRE_FRAMES) / sim.fps + 0.5;
  const L = new Float32Array(Math.ceil(segundos * SR));
  const R = new Float32Array(L.length);
  const pan = (x: number) => {
    const p = Math.max(0, Math.min(1, x / sim.tablero.ancho)); // 0 = izq, 1 = der
    return { l: Math.cos(p * Math.PI / 2), r: Math.sin(p * Math.PI / 2) };
  };
  const tmp = new Float32Array(Math.ceil(0.6 * SR));
  /** Renderiza un sonido corto en `tmp` y lo mezcla con paneo. */
  const colocar = (inicio: number, x: number, dibujar: (p: Float32Array) => void) => {
    tmp.fill(0);
    dibujar(tmp);
    const { l, r } = pan(x);
    const desde = Math.floor(inicio * SR);
    for (let i = 0; i < tmp.length; i++) {
      const idx = desde + i;
      if (idx < 0 || idx >= L.length) break;
      L[idx] += tmp[i] * l; R[idx] += tmp[i] * r;
    }
  };

  // Salida (frame 0): "¡ya!" corto para que el video no arranque en silencio.
  for (const [k, midi] of [76, 83].entries()) {
    nota(L, { inicio: k * 0.07, hz: midiAHz(midi), duracion: 0.12, volumen: 0.32, timbre: 'triangulo', caida: 0.05, liberacion: 0.08 });
    nota(R, { inicio: k * 0.07, hz: midiAHz(midi), duracion: 0.12, volumen: 0.32, timbre: 'triangulo', caida: 0.05, liberacion: 0.08 });
  }
  golpe(L, 0, { duracion: 0.05, volumen: 0.22, tono: 0.3, semilla: 3 });
  golpe(R, 0, { duracion: 0.05, volumen: 0.22, tono: 0.3, semilla: 4 });

  // Golpes afinados: máx. 12 por segundo en total (ventana deslizante).
  const tiemposGolpe: number[] = [];
  for (const ev of sim.eventos) {
    const t = ev.frame / sim.fps;
    const x = sim.posiciones[ev.bola][Math.min(ev.frame, sim.posiciones[ev.bola].length - 1)][0];
    if (ev.tipo === 'clavija' || ev.tipo === 'rampa') {
      while (tiemposGolpe.length && tiemposGolpe[0] < t - 1) tiemposGolpe.shift();
      if (tiemposGolpe.length >= 12) continue;
      tiemposGolpe.push(t);
      const f = ev.fuerza ?? 0.5;
      colocar(t, x, (p) => {
        nota(p, { inicio: 0, hz: ev.hz!, duracion: 0.04, volumen: 0.3 * (0.55 + 0.45 * f), timbre: 'pluck', caida: 0.03, liberacion: 0.09 });
        golpe(p, 0, { duracion: 0.025, volumen: 0.1 * (0.5 + 0.5 * f), tono: 0.7, semilla: ev.frame + ev.bola });
      });
    } else if (ev.tipo === 'bola') {
      const f = ev.fuerza ?? 0.5;
      colocar(t, x, (p) => {
        nota(p, { inicio: 0, hz: ev.hz!, duracion: 0.07, volumen: 0.26 * (0.6 + 0.4 * f), timbre: 'triangulo', caida: 0.04, liberacion: 0.1 });
        golpe(p, 0, { duracion: 0.03, volumen: 0.12, tono: 0.35, semilla: ev.frame * 7 + ev.bola });
      });
    }
  }

  // Riser: cuando la líder entra al último 15 % del tablero, hasta la meta.
  if (sim.frameRiser >= 0) {
    const t0 = sim.frameRiser / sim.fps;
    const dur = Math.max(0.8, Math.min(5, sim.frameGanadora / sim.fps - t0));
    barrido(L, t0, 160, 1400, dur, 0.22, 'triangulo');
    barrido(R, t0, 160, 1400, dur, 0.22, 'triangulo');
    // Cola de ruido ascendente para dar tensión.
    barrido(L, t0, 800, 3200, dur, 0.06, 'sierra');
    barrido(R, t0 + 0.01, 800, 3200, dur, 0.06, 'sierra');
  }

  // "Golpe" grave al entrar en cámara lenta: el oído siente que el tiempo se estira.
  const tLenta = sim.camaraLenta.desde / sim.fps;
  barrido(L, tLenta, 320, 70, 0.55, 0.2, 'seno');
  barrido(R, tLenta, 320, 70, 0.55, 0.2, 'seno');

  // Fanfarria: acorde mayor arpegiado (Do–Mi–Sol + Do agudo) al cruzar la ganadora.
  const tMeta = sim.frameGanadora / sim.fps;
  const xMeta = sim.posiciones[sim.ganadora][Math.min(sim.frameGanadora, sim.posiciones[sim.ganadora].length - 1)][0];
  const pm = pan(xMeta);
  for (const [k, midi] of [72, 76, 79].entries()) {
    const ti = tMeta + k * 0.11;
    nota(L, { inicio: ti, hz: midiAHz(midi), duracion: 0.3, volumen: 0.5, timbre: 'pluck', liberacion: 0.25 });
    nota(R, { inicio: ti, hz: midiAHz(midi), duracion: 0.3, volumen: 0.5, timbre: 'pluck', liberacion: 0.25 });
  }
  for (const midi of [84, 79, 76, 72]) {
    nota(L, { inicio: tMeta + 0.36, hz: midiAHz(midi), duracion: 0.9, volumen: 0.16, timbre: 'triangulo', ataque: 0.02, liberacion: 0.6 });
    nota(R, { inicio: tMeta + 0.36, hz: midiAHz(midi), duracion: 0.9, volumen: 0.16, timbre: 'triangulo', ataque: 0.02, liberacion: 0.6 });
  }
  golpe(L, tMeta, { duracion: 0.35, volumen: 0.35 * pm.l + 0.15, tono: 0.25, semilla: 99 });
  golpe(R, tMeta, { duracion: 0.35, volumen: 0.35 * pm.r + 0.15, tono: 0.25, semilla: 77 });

  // Normalización conjunta a −1 dBFS con limitador suave (misma ganancia en L y R).
  let pico = 0;
  for (let i = 0; i < L.length; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  if (pico > 0) {
    const objetivo = Math.pow(10, -1 / 20);
    const g = objetivo / pico;
    for (let i = 0; i < L.length; i++) {
      L[i] = Math.tanh(L[i] * g * 1.2) / Math.tanh(1.2) * objetivo;
      R[i] = Math.tanh(R[i] * g * 1.2) / Math.tanh(1.2) * objetivo;
    }
  }
  escribirWav(ruta, [L, R]);
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
  };
  const rutaSim = path.join(RAIZ, 'public/sim', `${guion.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const rutaWav = path.join(RAIZ, 'public/audio/generado', `${guion.id}.wav`);
  sintetizar(sim, rutaWav);
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
