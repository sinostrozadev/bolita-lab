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
    ritmo: z.array(z.object({
      tipo: z.enum(TIPOS_PERCUSION), pulso: z.number().min(0), abierto: z.boolean().optional(),
      /** Golpe fuerte (más volumen y destello mayor): remates y redobles. */
      acento: z.boolean().optional(),
    })).min(4),
  }),
});
export type PartituraRitmo = z.infer<typeof PartituraRitmo>;

export const TIMBRES_RITMO = ['piano', 'campana', 'pluck'] as const;

/**
 * Estilo del nivel. 'plano' (v1, Canon): solo parábolas entre clavijas que se disuelven. 'figuras' (v2/v3): además
 * rieles, rizos, zigzag, columpios, hélices, trampolines y portales, con a lo más 2 figuras grandes a la vista.
 * Se conservan los dos para comparar cuál tiene mejor aceptación.
 */
export const ESTILOS_RITMO = ['plano', 'figuras'] as const;
export type EstiloRitmo = (typeof ESTILOS_RITMO)[number];

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
  /** Estilo del nivel (por defecto 'figuras'). */
  estilo: z.enum(ESTILOS_RITMO).optional(),
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
  /** Música con derechos (Content ID): solo se publica con el sí de Santiago. */
  derechos: z.boolean().optional(),
  nota: z.string().optional(),
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
  /** Franja [xmin, xmax] del centro de la bolita (v3; las franjas de bolitas distintas no se tocan). */
  franja?: [number, number];
  /** Repisa donde espera antes de soltarse: centro de la bolita en reposo y frame en que se abre. */
  repisa: { x: number; y: number; abre: number };
  /** Por frame: x, y (centro), aplanado. */
  cuadros: number[];
  /** Por frame: profundidad z (la hélice pasa por delante y por detrás). Falta = 0. */
  z?: number[];
  /** Rangos de frames [desde, hasta] (inclusive) en que la bolita va oculta (dentro de un portal). */
  ocultos?: [number, number][];
};

/**
 * Figuras de movimiento entre dos golpes. Cada una dura exactamente Δt y la justifica un objeto visible
 * (riel, rizo, paredes, columpio, hélice, trampolín, portales). "cruce": el camino atraviesa el de otra bolita.
 */
export const FIGURAS_RITMO = ['parabola', 'riel', 'loop', 'zigzag', 'pendulo', 'espiral', 'trampolin', 'portal', 'cruce'] as const;
export type FiguraRitmo = (typeof FIGURAS_RITMO)[number];

/** Qué figura hizo cada bolita entre el golpe `desde` y el siguiente (`hasta`), en frames. */
export type TramoSim = { bolita: number; figura: FiguraRitmo; desde: number; hasta: number; grande?: boolean };

/** Objetos que justifican las figuras. Tiempos en SEGUNDOS de simulación salvo que diga frame. */
export type ObjetoSim =
  /** Riel (tubo de vidrio con dos rieles de neón): puntos x,y,z aplanados del centro de la bolita y su instante. */
  | { tipo: 'riel'; bolita: number; figura: FiguraRitmo; puntos: number[]; tiempos: number[] }
  /** Pared corta del zigzag: segmento vertical en x, de y0 a y1; toques = instantes de rebote. */
  | { tipo: 'pared'; bolita: number; x: number; y0: number; y1: number; lado: -1 | 1; desde: number; hasta: number; toques: number[] }
  /** Columpio: pivote, largo y ángulo (desde la vertical, hacia abajo) por frame a partir de `desdeFrame`. */
  | { tipo: 'pendulo'; bolita: number; px: number; py: number; largo: number; desdeFrame: number; angulos: number[]; agarra: number; suelta: number }
  /** Par de portales: entra por A (dirección aAng) y sale por B (bAng). */
  | { tipo: 'portal'; bolita: number; ax: number; ay: number; aAng: number; bx: number; by: number; bAng: number; entra: number; sale: number };

/** Clavija o pad. Cápsula: eje perpendicular a la normal, de semilargo `largo` (0 = clavija redonda) y radio `radio`. */
export type ClavijaSim = {
  bolita: number; x: number; y: number; nx: number; ny: number; largo: number; radio: number; golpe: number; estilo?: 'trampolin';
  /** Frame en que aparece (v3; falta = golpe − 40). En los redobles aparece recién con el golpe anterior de su bolita. */
  aparece?: number;
};

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
  /** Golpe fuerte de la partitura (remate). */
  acento?: boolean;
};

export type SimRitmo = {
  version: 2 | 3;
  id: string;
  /** Estilo con que se generó (v3; falta = 'figuras'). */
  estilo?: EstiloRitmo;
  fps: number;
  duracionFrames: number;
  /** Frame del golpe final de todas (clímax). */
  finalFrame: number;
  /** Tras finalFrame el tiempo de la simulación corre a este factor (cámara lenta del clímax). */
  lentoClimax: number;
  mundo: { ancho: number; gravedad: number };
  /** Cámara por frame: x, y (centro de la vista en el mundo), aplanado. */
  camara: number[];
  bolitas: BolitaSim[];
  clavijas: ClavijaSim[];
  golpes: GolpeSim[];
  tramos: TramoSim[];
  objetos: ObjetoSim[];
  semillaUsada: number;
};
