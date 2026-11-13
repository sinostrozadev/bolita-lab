/**
 * Forma del archivo `public/sim/<id>.json` que escribe `scripts/simular-carrera.mts`
 * y que lee el componente `Carrera`. Todo en píxeles del tablero (ancho 1080).
 *
 * IMPORTANTE: todos los "frame" de este archivo son frames del VIDEO (60 fps), no de la
 * física. El simulador ya aplicó la cámara lenta de la llegada (re-muestreó posiciones,
 * eventos y llegadas), así que el componente y el audio solo leen por frame.
 */
/** `bloque`: golpe a un bloque con vida (le resta 1); `rompe`: el bloque llega a 0 y desaparece de la física;
 * `tubo`: la bola entra a un tubo; `tuboSale`: sale por la boca de abajo. */
export type TipoEvento = 'clavija' | 'rampa' | 'bola' | 'meta' | 'bloque' | 'rompe' | 'tubo' | 'tuboSale'
  /** Secciones del torneo (largo 16:9): */
  | 'bumper' | 'trampolin' | 'molino' | 'portal';

export interface EventoCarrera {
  frame: number;
  tipo: TipoEvento;
  /** Índice de la bola protagonista. */
  bola: number;
  /** Otra bola (solo en choques bola–bola). */
  otra?: number;
  /** Índice de la clavija golpeada (solo tipo 'clavija'): se ilumina del color de la bola. */
  clavija?: number;
  /** Frecuencia del sonido asociado (Hz). */
  hz?: number;
  /** Intensidad 0..1 (velocidad normal relativa del choque). */
  fuerza?: number;
  /** Índice del bloque (tipos 'bloque' y 'rompe'). */
  bloque?: number;
  /** Vida que le queda al bloque tras el golpe (tipo 'bloque'). */
  vida?: number;
  /** Índice del tubo (tipos 'tubo' y 'tuboSale'). */
  tubo?: number;
}

/**
 * Bloque con vida (extras): rectángulo redondeado con un número (1–3). Cada golpe le resta 1; al llegar
 * a 0 se rompe y DESAPARECE de la física (la que pase después tiene camino libre).
 */
export interface Bloque {
  /** Centro y tamaño (px del tablero). */
  x: number; y: number; w: number; h: number;
  /** Vida inicial (el número que se ve al comienzo). */
  vida: number;
  /** Frames (de video) de cada golpe que le restó vida, en orden. */
  golpes: number[];
  /** Frame (de video) en que se rompió; -1 si sobrevive. */
  roto: number;
  /** Bola que dio el último golpe (la que lo rompió); -1 si sobrevive. */
  rompio: number;
}

/**
 * Tubo transparente (extras): boca ancha arriba (un embudo que ocupa una franja lateral del tablero),
 * recorrido con rizos/serpentina y salida más abajo. La bola que entra sigue la curva a la velocidad del
 * tubo (`atajo`: rápido y directo, gana tiempo; `vueltas`: lento con muchos rizos, pierde tiempo).
 */
export interface Tubo {
  tipo: 'atajo' | 'vueltas';
  /** Franja lateral ocupada [x0, x1] y alturas de la boca y de la salida. */
  x0: number; x1: number; yBoca: number; ySalida: number;
  /** Línea central desde el fondo de la boca hasta la salida (px del tablero, cada ~8 px). */
  puntos: [number, number][];
  /** Ancho del tubo (px). */
  ancho: number;
  /** Usos: bola y frames (de video) de entrada y salida. */
  usos: { bola: number; desde: number; hasta: number }[];
}

/** Aviso narrativo del marcador (máx. 1 cada 3 s): `camino` = `bola` rompió un bloque y por ahí pasó `otra`. */
export interface AvisoCarrera {
  frame: number;
  tipo: 'camino' | 'tubo';
  bola: number;
  otra?: number;
  /** Índice del tubo (aviso 'tubo'). */
  tubo?: number;
}

/** Cuánto dura un aviso en pantalla (frames) y separación mínima entre dos (frames). */
export const AVISO_FRAMES = 144;
export const AVISO_SEPARACION = 180;

export interface Clavija { x: number; y: number; r: number; /** Torneo: bumper de pinball (devuelve con fuerza). */ tipo?: 'bumper' }
/** Segmento sólido (rampa, pared de embudo). */
export interface Segmento { x1: number; y1: number; x2: number; y2: number; grosor: number; /** Torneo: trampolín (rebota con impulso). */ tipo?: 'trampolin' }

/**
 * Obstáculo con movimiento (torneo): `molino` = aspas (1–2 barras cruzadas) que giran en torno a (cx, cy) a `omega`
 * rad/s; `plataforma` = barra que sube y baja `amp` px con período `periodo` s. Posición = función del tiempo de FÍSICA
 * (s): el componente la lee con `sim.tiempo[frame]`.
 */
export interface Movil {
  tipo: 'molino' | 'plataforma';
  cx: number; cy: number;
  /** Semilargo de cada barra y grosor (px). */
  largo: number; grosor: number;
  ang0: number; omega: number; brazos: 1 | 2;
  amp: number; periodo: number; fase: number;
}
/** Portal (torneo): la bola que entra en A sale por B con la misma velocidad. */
export interface Portal { ax: number; ay: number; bx: number; by: number; r: number; color: string }
/** Sección del tablero (torneo): tramo [y0, y1] con un tipo de obstáculo y su rótulo. */
export type TipoSeccion = 'bloques' | 'bumpers' | 'trampolines' | 'molinos' | 'plataformas' | 'portales' | 'tuneles';
export interface Seccion { tipo: TipoSeccion; y0: number; y1: number; titulo: string }

/** Barras de un móvil en el instante t (s de física): extremos [x1, y1, x2, y2] y su centro de giro / desplazamiento. */
export const barrasMovil = (m: Movil, t: number): [number, number, number, number][] => {
  const dy = m.tipo === 'plataforma' ? m.amp * Math.sin((2 * Math.PI * t) / m.periodo + m.fase) : 0;
  const a = m.ang0 + m.omega * t;
  const out: [number, number, number, number][] = [];
  for (let k = 0; k < m.brazos; k++) {
    const ang = a + (k * Math.PI) / 2;
    const ux = Math.cos(ang) * m.largo, uy = Math.sin(ang) * m.largo;
    out.push([m.cx - ux, m.cy + dy - uy, m.cx + ux, m.cy + dy + uy]);
  }
  return out;
};

export interface SimulacionCarrera {
  version: 2;
  id: string;
  semilla: number;
  fps: number;
  /** Dimensiones del tablero (mundo). */
  tablero: { ancho: number; alto: number; metaY: number; radioBola: number };
  clavijas: Clavija[];
  segmentos: Segmento[];
  /** posiciones[bola][frame] = [x, y] */
  posiciones: [number, number][][];
  /** camara[frame] = y del mundo que se ve en el borde superior de la pantalla. */
  camara: number[];
  /** ranking[frame] = índices de bola de 1.º a último (con histéresis: no parpadea en empates). */
  ranking: number[][];
  eventos: EventoCarrera[];
  /** Frame en que cada bola cruza la meta (-1 si no llega). */
  llegadas: number[];
  /** Orden de llegada (índices de bola), primero la ganadora. */
  orden: number[];
  ganadora: number;
  /** Frame en que cruza la ganadora (aquí suena la fanfarria). */
  frameGanadora: number;
  /** Torneo: cuántas clasifican y frame en que cruza la última que clasifica (ahí van la cámara lenta y el corte). */
  pasan?: number;
  frameDecisivo?: number;
  /** Ventaja de la ganadora sobre la 2.ª, en segundos de carrera (tiempo real, sin cámara lenta). */
  ventajaSeg: number;
  /** Tramo del video en cámara lenta alrededor de la llegada (frames del video). */
  camaraLenta: { desde: number; hasta: number; factor: number };
  /** Frames totales (llegada ganadora + celebración), sin contar el cierre. */
  duracionFrames: number;
  /** Frame en que la líder entra al último 15 % (arranca el riser). */
  frameRiser: number;
  /** Extras (ausentes en guiones con `extras: false` y en simulaciones viejas). */
  bloques?: Bloque[];
  tubos?: Tubo[];
  avisos?: AvisoCarrera[];
  /** Torneo (secciones): móviles, portales, secciones y el tiempo de física (s) que muestra cada frame de video. */
  moviles?: Movil[];
  portales?: Portal[];
  secciones?: Seccion[];
  tiempo?: number[];
}

/** Celebración tras cruzar la ganadora (s) y duración del cartel de cierre (frames). */
export const CELEBRACION_SEG = 2.5;
export const CIERRE_FRAMES = 72;
