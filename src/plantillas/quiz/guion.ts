/**
 * Contrato del LARGO "¿Cuántas adivinas?" (16:9, 30 fps, versión simple, 2026-11-12). Las 10 melodías viven en
 * scripts/lib/canciones-quiz.mts (dominio público); el guion solo trae textos. Sin React ni Node aquí.
 */
import { z } from 'zod';

export const GuionQuiz = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1).max(40),
  subtitulo: z.string().min(1).max(60),
  duracionFrames: z.number().int().positive().optional(),
});
export type GuionQuiz = z.infer<typeof GuionQuiz>;

/** Frames (30 fps): portada, presentación de cada canción, la canción, tarjeta (3 s de cuenta + respuesta), cierre. */
export const T_QUIZ = { portada: 300, intro: 60, toca: 1050, tarjeta: 270, final: 660 } as const;

export interface PlanQuiz {
  version: 1;
  id: string;
  fps: 30;
  duracionFrames: number;
  canciones: {
    nombre: string; autor: string; dificultad: 1 | 2 | 3;
    /** Frame en que empieza el bloque de la canción (intro). */
    desde: number;
    /** [segundo desde que empieza a sonar, midi] de cada nota. */
    notas: [number, number][];
    /** Alturas distintas (de grave a agudo): un pad por cada una. */
    pads: number[];
  }[];
  capitulos: { seg: number; titulo: string }[];
}
