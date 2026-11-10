/**
 * Contrato de la plantilla "maquina": una MÁQUINA DE CANICAS MUSICAL en 3D (estilo Wintergatan "Marble Machine").
 * La partitura manda: cada nota es una canica que sale de su compuerta en el instante calculado hacia atrás desde
 * el golpe (caída libre) y toca su lámina, el bajo de madera, el bombo o el platillo en el frame exacto.
 * Lo comparten scripts/preparar-maquina.mts (Node) y el componente de Remotion. Sin React ni Node aquí.
 */
import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';
import type { Pieza } from './geometria';

const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const Midi = z.number().int().min(24).max(108);
/** [midi, pulso de inicio, duración en pulsos]. Pulso = negra. La melodía puede ser polifónica (cada nota es una canica). */
const NotaPartitura = z.tuple([Midi, z.number().min(0), z.number().positive().max(16)]);

/** Partitura de `contenido/partituras/<nombre>.json`. Solo dominio público u obra propia. */
export const PartituraMaquina = z.object({
  nombre: z.string().min(1),
  nota: z.string().optional(),
  bpm: z.number().min(40).max(200),
  compas: z.number().int().min(2).max(12),
  pistas: z.object({
    /** Notas del vibráfono: deben existir en NOTAS_VIBRA (Sol4 … Sol5). */
    melodia: z.array(NotaPartitura).min(8),
    /** Notas del bajo de madera: deben existir en NOTAS_BAJO (Sol2, Do3, Re3, Mi3). */
    bajo: z.array(NotaPartitura).min(4),
    ritmo: z.array(z.object({
      tipo: z.enum(['bombo', 'platillo']),
      pulso: z.number().min(0),
      /** Platillo abierto (cola larga): inicio de frase y final. */
      abierto: z.boolean().optional(),
      /** Golpe fuerte. */
      acento: z.boolean().optional(),
    })).min(4),
  }),
});
export type PartituraMaquina = z.infer<typeof PartituraMaquina>;

export const TEXTOS_MAQUINA = {
  arriba: 'Esta máquina toca una canción 🎶',
  abajo: '¿La reconoces? 👇',
} as const;

export const GuionMaquina = z.object({
  /** Id del guion: nombra el sim, el wav y el mp4. */
  id: z.string().min(1),
  /** Partitura de contenido/partituras/<partitura>.json (melodía en Sol4–Sol5, bajo en Sol2/Do3/Re3/Mi3). */
  partitura: z.string().regex(/^[a-z0-9-]+$/),
  /** Bloque fijo de ARRIBA (frame 0 → cierre), ≤ 8 palabras. */
  arriba: z.string().min(1).max(48).refine((t) => palabras(t) <= 8, 'arriba: máximo 8 palabras').optional(),
  /** Bloque fijo de ABAJO (frame 0 → cierre), ≤ 6 palabras. */
  abajo: z.string().min(1).max(40).refine((t) => palabras(t) <= 6, 'abajo: máximo 6 palabras').optional(),
  /** Cuadros por segundo del video (60 por defecto; 30 si el render no cabe en el tiempo). */
  fps: z.union([z.literal(30), z.literal(60)]).optional(),
  /** Semilla de los detalles (rebotes, carriles); si falta, se deriva del id. */
  semilla: z.number().int().nonnegative().optional(),
  /** Lo fija preparar-maquina desde el sim. */
  duracionFrames: z.number().int().positive().optional(),
  llamado: CampoLlamado,
});
export type GuionMaquina = z.infer<typeof GuionMaquina>;

/** Envoltorio del backlog (contenido/backlog/<x>.json). */
export const EnvoltorioMaquina = z.object({
  plantilla: z.literal('maquina'),
  id: z.string().min(1),
  titulo: z.string().min(10).max(100),
  descripcion: z.string().min(20).max(4000),
  hashtags: z.array(z.string().regex(/^#\S+$/)).min(1).max(15),
  props: GuionMaquina,
  derechos: z.boolean().optional(),
  nota: z.string().optional(),
});

// ---------- Simulación (public/sim/<id>.json) ----------

export const PISTAS_MAQUINA = ['melodia', 'bajo', 'bombo', 'platillo'] as const;
export type PistaMaquina = (typeof PISTAS_MAQUINA)[number];

/** Un golpe de la partitura: qué pieza, en qué frame, con qué canica. */
export type GolpeMaquina = {
  pista: PistaMaquina; pieza: Pieza; idx: number; frame: number; canica: number;
  nota?: number; dur?: number; acento?: boolean; abierto?: boolean;
};

/** Una canica con trayectoria propia (de la compuerta al depósito). `pos` = [x,y,z] por frame desde `desde`. */
export type CanicaMaquina = {
  pieza: Pieza; idx: number; color: string;
  /** Instante (s) en que se abre la compuerta; frame del golpe (null si es una canica "de antes" del video). */
  suelta: number; golpe: number | null;
  desde: number; pos: number[];
  /** Compuerta de la que sale (índice en `compuertas`). */
  compuerta: number;
};

export type CompuertaMaquina = { pieza: Pieza; idx: number; x: number; y: number; z: number; yTope: number; color: string; sueltas: number[] };

/** Efecto de sonido mecánico (no musical). */
export type SonidoMaquina = { t: number; tipo: 'compuerta' | 'bandeja' | 'deposito' | 'embudo' | 'noria'; x: number; vol: number };

export type SimMaquina = {
  version: 1; id: string; fps: number; duracionFrames: number; finalFrame: number; bpm: number;
  /** Instante (s) del pulso 0 de la partitura. */
  entrada: number;
  golpes: GolpeMaquina[]; canicas: CanicaMaquina[]; compuertas: CompuertaMaquina[]; sonidos: SonidoMaquina[];
  /** Cámara por frame: [px, py, pz, tx, ty, tz, fov]. */
  camara: number[];
  /** Plano activo por frame (para depurar y para la hoja de contacto). */
  planos: { desde: number; nombre: string }[];
  /** Pares de canicas que se tocan sin querer (frames con solapamiento): debe ser bajo. */
  solapes: number;
};
