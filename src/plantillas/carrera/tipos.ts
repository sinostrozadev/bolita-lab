/**
 * Forma del archivo `public/sim/<id>.json` que escribe `scripts/simular-carrera.mts`
 * y que lee el componente `Carrera`. Todo en píxeles del tablero (ancho 1080).
 *
 * IMPORTANTE: todos los "frame" de este archivo son frames del VIDEO (60 fps), no de la
 * física. El simulador ya aplicó la cámara lenta de la llegada (re-muestreó posiciones,
 * eventos y llegadas), así que el componente y el audio solo leen por frame.
 */
export type TipoEvento = 'clavija' | 'rampa' | 'bola' | 'meta';

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
}

export interface Clavija { x: number; y: number; r: number }
/** Segmento sólido (rampa, pared de embudo). */
export interface Segmento { x1: number; y1: number; x2: number; y2: number; grosor: number }

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
  /** Ventaja de la ganadora sobre la 2.ª, en segundos de carrera (tiempo real, sin cámara lenta). */
  ventajaSeg: number;
  /** Tramo del video en cámara lenta alrededor de la llegada (frames del video). */
  camaraLenta: { desde: number; hasta: number; factor: number };
  /** Frames totales (llegada ganadora + celebración), sin contar el cierre. */
  duracionFrames: number;
  /** Frame en que la líder entra al último 15 % (arranca el riser). */
  frameRiser: number;
}

/** Celebración tras cruzar la ganadora (s) y duración del cartel de cierre (frames). */
export const CELEBRACION_SEG = 2.5;
export const CIERRE_FRAMES = 72;
