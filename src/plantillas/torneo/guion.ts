/**
 * Contrato del LARGO "Torneo de bolitas" (16:9, 2026-11-12): 16 competidores en eliminatorias con la física de
 * `carrera` v2 (bloques con números, tubos, sonido). Lo comparten scripts/preparar-largo-torneo.mts (Node) y la
 * composición `Torneo`. Sin React ni Node aquí.
 *
 * Llave (siempre la misma, determinista por semilla):
 *  - OCTAVOS: 4 carreras de 4 (grupos A–D = participantes 0–3, 4–7, 8–11, 12–15). Pasan 2.
 *  - CUARTOS: 2 carreras de 4: [A1, B2, C1, D2] y [B1, A2, D1, C2]. Pasan 2.
 *  - SEMIFINALES: 2 duelos: [Q1·1.º, Q2·2.º] y [Q2·1.º, Q1·2.º].
 *  - 3.er PUESTO: duelo de los perdedores de las semis. FINAL: duelo de los ganadores.
 */
import { z } from 'zod';
import { IconoCompetidor } from '../carrera/guion';

export const ParticipanteTorneo = z.object({
  /** Nombre en pantalla (mayúsculas), ≤ 14 caracteres para que quepa en la llave. */
  etiqueta: z.string().min(1).max(14),
  /** Identidad dentro de la bolita: bandera (emoji) para países, emoji para comidas, etc. */
  icono: IconoCompetidor,
});
export type ParticipanteTorneo = z.infer<typeof ParticipanteTorneo>;

export const GuionTorneo = z.object({
  /** Id: nombra los sims (`<id>-r01` …), el plan `public/sim/<id>.json` y el wav. */
  id: z.string().min(1),
  /** Título en la portada del video (≤ 40 caracteres). Ej.: "TORNEO DE BOLITAS". */
  titulo: z.string().min(1).max(40),
  /** Subtítulo de la portada. Ej.: "16 países · 1 campeón". */
  subtitulo: z.string().min(1).max(40),
  /** Qué compiten, en plural para los textos: "países", "comidas". */
  tema: z.string().min(1).max(20),
  /** Exactamente 16. El orden arma los grupos de octavos (A = 0–3, B = 4–7, C = 8–11, D = 12–15). */
  participantes: z.array(ParticipanteTorneo).length(16),
  /** Pregunta de la portada (comentarios). */
  pregunta: z.string().min(1).max(48).optional(),
  /** Semilla base; si falta, se deriva del id. */
  semilla: z.number().int().nonnegative().optional(),
  /** Canción de fondo por ronda (partituras de contenido/partituras/; ausente = cama genérica de carrera). */
  musica: z.object({
    octavos: z.string().optional(), cuartos: z.string().optional(), semis: z.string().optional(), final: z.string().optional(),
  }).optional(),
  /** Lo fija preparar desde el plan. */
  duracionFrames: z.number().int().positive().optional(),
});
export type GuionTorneo = z.infer<typeof GuionTorneo>;

export const RONDAS = ['octavos', 'cuartos', 'semis', 'tercero', 'final'] as const;
export type Ronda = (typeof RONDAS)[number];
export const NOMBRE_RONDA: Record<Ronda, string> = {
  octavos: 'OCTAVOS DE FINAL', cuartos: 'CUARTOS DE FINAL', semis: 'SEMIFINALES', tercero: 'TERCER PUESTO', final: 'LA GRAN FINAL',
};

/** Una carrera del torneo (frames de VIDEO a 30 fps salvo que diga lo contrario). */
export interface CarreraTorneo {
  /** Id del sim de carrera (public/sim/<simId>.json, 60 fps). */
  simId: string;
  ronda: Ronda;
  /** "CARRERA 2 DE 4", "DUELO 1 DE 2", "FINAL". */
  nombre: string;
  /** Índices (0–15) de los que corren, en el orden de las bolas del sim. */
  corredores: number[];
  pasan: number;
  /** Índices (0–15) en orden de llegada (los que no cruzaron, por posición en pista). */
  orden: number[];
  /** Diferencia (s) entre la última que pasa y la primera que queda fuera (Infinity → null). */
  ventajaSeg: number | null;
  /** Frames de video (30 fps) que dura la carrera (sim.duracionFrames / 2). */
  frames: number;
  /** Frame de VIDEO (relativo a la carrera) en que cruza la última que clasifica. */
  frameDecisivo: number;
  /**
   * Cámara inteligente por frame de VIDEO: y del mundo en el borde superior y alto visible (px de mundo). Se aleja
   * cuando las bolitas se separan (todas en cuadro) y, cuando la líder se acerca a la meta, va a la meta y se queda.
   */
  camTop: number[];
  camAlto: number[];
}

export type TipoSegmento = 'portada' | 'ronda' | 'presenta' | 'carrera' | 'resultado' | 'votacion' | 'campeon' | 'cierre';
export interface SegmentoTorneo {
  tipo: TipoSegmento;
  /** Frame de VIDEO en que empieza y cuántos dura. */
  desde: number;
  dur: number;
  /** Índice en `carreras` (presenta, carrera, resultado). */
  carrera?: number;
  ronda?: Ronda;
}

export interface Capitulo { seg: number; titulo: string }

/** public/sim/<id>.json: el plan completo del torneo. */
export interface PlanTorneo {
  version: 1;
  id: string;
  fps: 30;
  duracionFrames: number;
  /** Color (hex) de cada participante, fijo todo el torneo. */
  colores: string[];
  carreras: CarreraTorneo[];
  segmentos: SegmentoTorneo[];
  /** Campeón, 2.º, 3.º y 4.º (índices 0–15). */
  podio: [number, number, number, number];
  /** Los 4 semifinalistas en el orden del panel de votación (ME GUSTA, COMENTA, COMPARTE, SUSCRÍBETE). */
  votacion: number[];
  capitulos: Capitulo[];
  /** Segundos sugeridos para las pausas publicitarias (límites de ronda). */
  midrollsSeg: number[];
}

/** Duraciones fijas (frames de video, 30 fps). */
export const T_TORNEO = {
  portada: 300,
  ronda: 90,
  presenta: 105,
  resultado: 195,
  votacion: 240,
  campeon: 720,
  cierre: 360,
} as const;
