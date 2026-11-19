/**
 * Contrato del LARGO "Carrera de eliminación" (16:9, 2026-11-18): 50 competidores (países con bandera) y fases de
 * eliminación con la física de `carrera` v2 en el tablero ancho del torneo. Lo comparten
 * scripts/preparar-largo-eliminacion.mts (Node) y la composición `Eliminacion`. Sin React ni Node aquí.
 *
 * Fases (para 50; todo determinista por semilla, nada guionado a mano):
 *  - CLASIFICACIÓN: 5 carreras de 10 (grupos sorteados con la semilla), pasan 6 → 30.
 *  - REPECHAJE: los 5 séptimos, pasan 2 → 32.
 *  - RONDA DE 32: 4 carreras de 8, pasan 4 → 16.
 *  - OCTAVOS: 2 carreras de 8, pasan 4 → 8.
 *  - SEMIFINALES: 2 carreras de 4, pasan 2 → 4.
 *  - LA GRAN FINAL: 1 carrera de 4; su orden de llegada es el podio.
 * Modelo: AlgoRaces "50 Countries Tournament" (1,46 M), MarbleSimulations "Stage Elimination" (1,18 M).
 */
import { z } from 'zod';
import { IconoCompetidor } from '../carrera/guion';

export const ParticipanteElim = z.object({
  /** Nombre en pantalla (mayúsculas), ≤ 14 caracteres. */
  etiqueta: z.string().min(1).max(14),
  icono: IconoCompetidor,
});
export type ParticipanteElim = z.infer<typeof ParticipanteElim>;

export const GuionEliminacion = z.object({
  id: z.string().min(1),
  /** Gancho grande de la portada (≤ 28). Ej.: "50 PAÍSES". */
  titulo: z.string().min(1).max(28),
  /** Segunda línea (≤ 32). Ej.: "SOLO 1 GANA". */
  subtitulo: z.string().min(1).max(32),
  /** Plural para textos: "países". */
  tema: z.string().min(1).max(20),
  /** Exactamente 50 (el esquema de fases está hecho para 50). */
  participantes: z.array(ParticipanteElim).length(50),
  /** Pregunta de la portada (comentarios). */
  pregunta: z.string().min(1).max(48).optional(),
  semilla: z.number().int().nonnegative().optional(),
  /** Lo fija preparar desde el plan. */
  duracionFrames: z.number().int().positive().optional(),
});
export type GuionEliminacion = z.infer<typeof GuionEliminacion>;

/** Una fase: nombre en pantalla, texto del cartel y color (cambia el tinte del tablero: variedad entre rondas). */
export interface FaseElim { nombre: string; texto: string; color: string; quedanAntes: number; quedanDespues: number }

export interface CarreraElim {
  simId: string;
  fase: number;
  /** "CARRERA 2 DE 5". */
  nombre: string;
  corredores: number[];
  pasan: number;
  orden: number[];
  ventajaSeg: number | null;
  frames: number;
  frameDecisivo: number;
  camTop: number[];
  camAlto: number[];
  /** Cuántos quedan en el torneo antes y después de esta carrera (el contador "QUEDAN N"). */
  quedanAntes: number;
  quedanDespues: number;
  /** Si el corte fue apretado: repetición en cámara lenta (frames de SIM 60 fps de inicio y fin). */
  repe?: { desde: number; hasta: number };
}

export type TipoSegElim = 'portada' | 'fase' | 'presenta' | 'carrera' | 'repeticion' | 'resultado' | 'votacion' | 'campeon' | 'cierre';
export interface SegmentoElim { tipo: TipoSegElim; desde: number; dur: number; carrera?: number; fase?: number }

export interface PlanEliminacion {
  version: 1;
  id: string;
  fps: 30;
  duracionFrames: number;
  colores: string[];
  fases: FaseElim[];
  carreras: CarreraElim[];
  segmentos: SegmentoElim[];
  /** Fase en la que quedó fuera cada participante (−1 = llegó a la final). */
  eliminadoEn: number[];
  podio: [number, number, number, number];
  votacion: number[];
  capitulos: { seg: number; titulo: string }[];
  midrollsSeg: number[];
}

export const T_ELIM = {
  portada: 150, // 5 s: lo que está en juego y arranca la 1.ª carrera
  fase: 84,
  presenta: 105,
  resultado: 210,
  repeticion: 180,
  votacion: 210,
  campeon: 720,
  cierre: 360,
} as const;
