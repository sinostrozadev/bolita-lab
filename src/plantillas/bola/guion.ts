/**
 * Contrato de la plantilla "bola": props del guion (zod) y forma del archivo
 * de simulación precalculada (`public/sim/<id>.json`). Lo comparten el script
 * de Node (`scripts/simular-bola.mts`) y el componente de Remotion.
 * Sin React ni Node aquí: solo tipos y zod.
 */
import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';

/** Melodías disponibles (deben existir en `MELODIAS` de scripts/lib/wav.mts). */
export const MELODIAS_BOLA = ['furelise', 'marchaturca', 'odaalegria', 'canon', 'cisnes'] as const;

export const GuionBola = z.object({
  /** Id del guion: nombra el sim, el wav y el mp4. */
  id: z.string().min(1),
  /** Gancho textual de los primeros 1,5 s. */
  gancho: z.string().min(1).max(90),
  melodia: z.enum(MELODIAS_BOLA),
  /** escape: el hueco gira y la bola termina escapando. crecer: sin hueco, la bola llena el anillo. */
  modo: z.enum(['escape', 'crecer']),
  bolas: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  /** Semilla explícita; si falta, se deriva del id. */
  semilla: z.number().int().nonnegative().optional(),
  /** Velocidad de giro del hueco en grados por segundo (solo escape). */
  velocidadHueco: z.number().optional(),
  /** Ancho del hueco en grados (solo escape). */
  anchoHueco: z.number().min(10).max(120).optional(),
  /** Lo fija `preparar-bola` desde el sim; evita leer el JSON para calcular la duración. */
  duracionFrames: z.number().int().positive().optional(),
  /** Llamado a suscribirse en el clímax (opcional; ausente = activado con variante por id; false = apagado; texto = ese texto). */
  llamado: CampoLlamado,
});
export type GuionBola = z.infer<typeof GuionBola>;

export type TipoEvento = 'rebote' | 'choque' | 'escape' | 'lleno';

export type EventoSim = {
  frame: number;
  /** Instante en el video, en segundos (ya considera la cámara lenta). */
  t: number;
  tipo: TipoEvento;
  /** Índice de la bola protagonista. */
  bola: number;
  /** Nota MIDI que sonó (solo rebote). */
  nota?: number;
  /** Punto de contacto y ángulo de la normal (grados, apuntando hacia dentro del anillo). */
  x: number;
  y: number;
  ang: number;
  /** Índice de color (NEONES) de la bola tras el evento. */
  color: number;
  /** Intensidad 0..1 (para volumen y tamaño del flash). */
  fuerza: number;
};

/** Cantidad de números por bola en cada cuadro: x, y, r, colorIdx. */
export const CAMPOS_POR_BOLA = 4;

export type SimBola = {
  version: 1;
  id: string;
  fps: number;
  modo: 'escape' | 'crecer';
  bolas: number;
  duracionFrames: number;
  /** Frame del clímax (escape o llenado). */
  climaxFrame: number;
  /** Rebotes contados hasta el clímax. */
  rebotesTotales: number;
  anillo: { cx: number; cy: number; r: number; anchoHueco: number; grosor: number };
  /** Ángulo (grados) del centro del hueco por frame; vacío en modo crecer. */
  hueco: number[];
  /** Semi-ancho del hueco (grados) por frame (se abre si tarda demasiado). */
  huecoSemi: number[];
  /** Por frame: [x,y,r,color] × bolas. */
  cuadros: number[][];
  eventos: EventoSim[];
  semillaUsada: number;
  velocidadHuecoUsada: number;
};
