/**
 * Contrato de la plantilla "ritmo": la PARTITURA manda y el nivel se construye para que cada choque caiga en el
 * instante exacto de su nota (la inversa de "bola", donde la física manda y la melodía sigue a los rebotes).
 * Lo comparten scripts/preparar-ritmo.mts (Node) y el componente de Remotion. Sin React ni Node aquí.
 */
import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';

/** Palabras "de verdad" (con letras o cifras): los emoji no cuentan. */
const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const Midi = z.number().int().min(24).max(108);
/** [midi, pulso de inicio, duración en pulsos]. Pulso = negra. Una pista es monofónica (un evento por instante). */
const NotaPartitura = z.tuple([Midi, z.number().min(0), z.number().positive().max(16)]);

export const TIPOS_PERCUSION = ['kick', 'snare', 'hat'] as const;
export type TipoPercusion = (typeof TIPOS_PERCUSION)[number];

/** Partitura de `contenido/partituras/<nombre>.json`. Solo dominio público u obra propia. */
export const PartituraRitmo = z.object({
  nombre: z.string().min(1),
  nota: z.string().optional(),
  bpm: z.number().min(40).max(200),
  compas: z.number().int().min(2).max(12),
  pistas: z.object({
    melodia: z.array(NotaPartitura).min(8),
    bajo: z.array(NotaPartitura).min(4),
    ritmo: z.array(z.object({ tipo: z.enum(TIPOS_PERCUSION), pulso: z.number().min(0), abierto: z.boolean().optional() })).min(4),
  }),
});
export type PartituraRitmo = z.infer<typeof PartituraRitmo>;

export const TIMBRES_RITMO = ['piano', 'campana', 'pluck'] as const;

export const TEXTOS_RITMO = {
  arriba: '5 bolitas, 1 canción 🎵',
  abajo: '¿Cuál lleva la melodía? 👇',
} as const;

export const GuionRitmo = z.object({
  /** Id del guion: nombra el sim, el wav y el mp4. */
  id: z.string().min(1),
  /** Partitura de contenido/partituras/<partitura>.json. */
  partitura: z.string().regex(/^[a-z0-9-]+$/),
  /** Bloque fijo de ARRIBA (frame 0 → cierre), ≤ 8 palabras. */
  arriba: z.string().min(1).max(48).refine((t) => palabras(t) <= 8, 'arriba: máximo 8 palabras').optional(),
  /** Bloque fijo de ABAJO (frame 0 → cierre), ≤ 6 palabras. */
  abajo: z.string().min(1).max(40).refine((t) => palabras(t) <= 6, 'abajo: máximo 6 palabras').optional(),
  /** Timbre de la melodía (por defecto piano). */
  timbre: z.enum(TIMBRES_RITMO).optional(),
  /** Mostrar al final qué instrumento era cada bolita (por defecto sí). */
  revelar: z.boolean().optional(),
  /** Semilla del nivel; si falta, se deriva del id. */
  semilla: z.number().int().nonnegative().optional(),
  /** Lo fija preparar-ritmo desde el sim. */
  duracionFrames: z.number().int().positive().optional(),
  llamado: CampoLlamado,
});
export type GuionRitmo = z.infer<typeof GuionRitmo>;

/** Envoltorio del backlog (contenido/backlog/<x>.json). */
export const EnvoltorioRitmo = z.object({
  plantilla: z.literal('ritmo'),
  id: z.string().min(1),
  titulo: z.string().min(10).max(100),
  descripcion: z.string().min(20).max(4000),
  hashtags: z.array(z.string().regex(/^#\S+$/)).min(1).max(15),
  props: GuionRitmo,
});

// ---------- Simulación (public/sim/<id>.json) ----------

export const PISTAS_RITMO = ['melodia', 'bajo', 'kick', 'snare', 'hat'] as const;
export type PistaRitmo = (typeof PISTAS_RITMO)[number];

/** Nombre corto que se revela al final. */
export const NOMBRE_PISTA: Record<PistaRitmo, string> = {
  melodia: 'melodía 🎹', bajo: 'bajo', kick: 'bombo 🥁', snare: 'caja', hat: 'platillo',
};

export type BolitaSim = {
  pista: PistaRitmo;
  /** Color (hex de PALETA). */
  color: string;
  /** Radio en unidades de mundo. */
  r: number;
  /** Intensidad emisiva base (la del bajo es oscura). */
  brillo: number;
  /** Centro del carril (x). */
  carril: number;
  /** Repisa donde espera antes de soltarse: centro de la bolita en reposo y frame en que se abre. */
  repisa: { x: number; y: number; abre: number };
  /** Por frame: x, y (centro), aplanado. */
  cuadros: number[];
};

/** Clavija o pad. Cápsula: eje perpendicular a la normal, de semilargo `largo` (0 = clavija redonda) y radio `radio`. */
export type ClavijaSim = { bolita: number; x: number; y: number; nx: number; ny: number; largo: number; radio: number; golpe: number };

export type GolpeSim = {
  frame: number;
  t: number;
  pista: PistaRitmo;
  bolita: number;
  clavija: number;
  /** Centro de la bolita en el contacto y normal de la clavija (apunta hacia la bolita). */
  x: number;
  y: number;
  nx: number;
  ny: number;
  /** Nota MIDI (melodía y bajo). */
  nota?: number;
  /** 0..1 para tamaño del destello. */
  fuerza: number;
};

export type SimRitmo = {
  version: 1;
  id: string;
  fps: number;
  duracionFrames: number;
  /** Frame del golpe final de todas (clímax). */
  finalFrame: number;
  mundo: { ancho: number; gravedad: number };
  /** Cámara por frame: x, y (centro de la vista en el mundo), aplanado. */
  camara: number[];
  bolitas: BolitaSim[];
  clavijas: ClavijaSim[];
  golpes: GolpeSim[];
  semillaUsada: number;
};
