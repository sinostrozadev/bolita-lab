/**
 * Contrato del LARGO "Bolitas relajantes" (16:9, 30 fps, ~30 min, 2026-11-12): 6 escenas de ~5 min, cada una una
 * simulación distinta con su paleta y su pieza musical lenta (dominio público o propia), unidas por fundidos lentos.
 * Sin texto salvo el título inicial y la marca. Lo comparten scripts/preparar-largo-relajante.mts y `Relajante`.
 */
import { z } from 'zod';

export const TIPOS_ESCENA = ['llenar', 'pendulos', 'tres', 'espirografo', 'hexagono', 'gotas'] as const;
export type TipoEscena = (typeof TIPOS_ESCENA)[number];

export const GuionRelajante = z.object({
  id: z.string().min(1),
  /** Título inicial (se ve ~8 s y se va con un fundido lento). */
  titulo: z.string().min(1).max(60),
  subtitulo: z.string().max(80).optional(),
  /** Escenas en orden. Cada una: tipo, pieza musical y tono base de la paleta (0–360). */
  escenas: z.array(z.object({
    tipo: z.enum(TIPOS_ESCENA),
    pieza: z.enum(['gymnopedie', 'canon', 'brahms', 'greensleeves', 'bruma', 'marea']),
    tono: z.number().min(0).max(360),
    /** Nombre para el capítulo de la descripción. */
    nombre: z.string().min(1).max(60),
  })).min(2).max(8),
  /** Duración de cada escena (s) y del fundido entre escenas (s). */
  segundosEscena: z.number().min(30).max(600).default(305),
  fundido: z.number().min(1).max(15).default(6),
  semilla: z.number().int().nonnegative().optional(),
  duracionFrames: z.number().int().positive().optional(),
});
export type GuionRelajante = z.infer<typeof GuionRelajante>;

/** public/sim/<id>.json */
export interface PlanRelajante {
  version: 1;
  id: string;
  fps: 30;
  duracionFrames: number;
  escenas: EscenaPlan[];
  capitulos: { seg: number; titulo: string }[];
}
export interface EscenaPlan {
  tipo: TipoEscena;
  tono: number;
  desde: number;
  dur: number;
  /** Escenas con física: posiciones por frame (30 fps) de cada bola, aplanadas [x, y, x, y…] (px de pantalla). */
  bolas?: { r: number; xy: number[] }[];
  /** Hexágono: velocidad angular (rad/s), radio y ángulo inicial. */
  hex?: { R: number; omega: number; ang0: number };
  /** Anillo (llenar, tres): centro y radio. */
  anillo?: { cx: number; cy: number; R: number };
  /** Gotas: instante (s, relativo a la escena), posición y tamaño de cada gota. */
  gotas?: { t: number; x: number; y: number; s: number }[];
  /** Péndulos: oscilaciones por ciclo de cada uno y duración del ciclo (s). */
  pendulos?: { n: number[]; ciclo: number; amp: number };
  /** Espirógrafo: plumas (hipotrocoides). */
  plumas?: { R: number; r: number; d: number; vel: number; fase: number }[];
}
