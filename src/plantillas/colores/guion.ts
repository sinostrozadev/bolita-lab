/**
 * Contrato de la plantilla "colores" (Batalla de colores): props del guion (zod) y forma del archivo de
 * simulación precalculada (`public/sim/<id>.json`). Lo comparten `scripts/simular-colores.mts` y el
 * componente de Remotion. Sin React ni Node aquí: solo tipos y zod.
 *
 * Reglas del juego (las aplica el simulador, ver README):
 * - mismo color al tocarse → se FUSIONAN (área = suma; se conserva el momento);
 * - distinto color al tocarse → las dos pierden la misma área (`dano` × área de la más chica) y cada una
 *   que siga siendo grande se PARTE en 2;
 * - por debajo del área mínima → MUERE (estallido de partículas);
 * - gana el último color con bolitas. Desde los ~26 s de partida la arena se cierra.
 */
import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';
import { semillaDesde } from '../../lib/azar';

/** Palabras "de verdad" (con letras o cifras): los emoji no cuentan. */
const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Colores de equipo disponibles (deben existir en `EQUIPOS` de src/marca/tokens.ts). */
export const EQUIPOS_COLORES = ['rojo', 'azul', 'amarillo', 'verde', 'violeta', 'naranja', 'cian', 'rosa'] as const;
export type EquipoColores = (typeof EQUIPOS_COLORES)[number];

/** Acciones del público para la votación (una por color; el orden de asignación lo sortea la semilla). */
export const ACCIONES_VOTO = {
  megusta: { icono: '❤️', texto: 'Me gusta' },
  comenta: { icono: '💬', texto: 'Comenta' },
  comparte: { icono: '🔁', texto: 'Comparte' },
  suscribete: { icono: '🔔', texto: 'Suscríbete' },
} as const;
export type AccionVoto = keyof typeof ACCIONES_VOTO;
export const ORDEN_ACCIONES: AccionVoto[] = ['megusta', 'comenta', 'comparte', 'suscribete'];

/**
 * Votación con acciones del público: desde el frame 0 y toda la partida, una grilla 2×2 abajo asigna una
 * ACCIÓN a cada color ("❤️ Me gusta = ROJO"). En el final, bajo "GANA: X", el `remate` con la acción del
 * ganador. `true`/ausente = activada con textos por defecto; `false` = apagada (vuelve el `cta` de abajo).
 */
export const Votacion = z.union([
  z.boolean(),
  z.object({
    /** Textos de las acciones (≤ 12 caracteres c/u); el ícono queda. */
    textos: z.object({
      megusta: z.string().min(1).max(12).optional(),
      comenta: z.string().min(1).max(12).optional(),
      comparte: z.string().min(1).max(12).optional(),
      suscribete: z.string().min(1).max(12).optional(),
    }).optional(),
    /** Orden fijo de las acciones para los equipos (en el orden de `equipos`); si falta, lo sortea la semilla. */
    orden: z.array(z.enum(['megusta', 'comenta', 'comparte', 'suscribete'])).min(2).max(4).optional(),
    /** Remate del final; `{accion}` se reemplaza por "❤️ Me gusta" (la del ganador). */
    remate: z.string().min(1).max(70).optional(),
  }),
]).optional();
export type Votacion = z.infer<typeof Votacion>;

export const TEXTOS_COLORES = {
  pregunta: '¿Qué color gana? 🎨',
  cta: 'Comenta tu color 👇',
  remate: '¿Acertaste? Si votaste con {accion}, ¡ganaste! 🎉',
  cae: '¡Cae el {color}!',
  gana: 'GANA: {color}',
} as const;

export const GuionColores = z.object({
  /** Id del guion: nombra el sim, el wav y el mp4. */
  id: z.string().min(1),
  /** Bloque de ARRIBA, fijo desde el frame 0 hasta el cierre (≤ 6 palabras). */
  pregunta: z.string().min(1).max(40).refine((t) => palabras(t) <= 6, 'pregunta: máximo 6 palabras').optional(),
  /** Bloque de ABAJO cuando la votación está apagada (≤ 5 palabras). */
  cta: z.string().min(1).max(32).refine((t) => palabras(t) <= 5, 'cta: máximo 5 palabras').optional(),
  /** Equipos en juego, 2–4 colores distintos (por defecto rojo, azul, amarillo, verde). */
  equipos: z.array(z.enum(EQUIPOS_COLORES)).min(2).max(4)
    .refine((e) => new Set(e).size === e.length, 'equipos: colores repetidos').optional(),
  /** Bolitas por equipo al empezar (8–12; por defecto 10). */
  bolasPorEquipo: z.number().int().min(8).max(12).optional(),
  /** Forma de la arena: círculo (por defecto) o caja de esquinas redondeadas. */
  arena: z.enum(['circulo', 'caja']).optional(),
  /** Votación con acciones del público (por defecto activada). */
  votacion: Votacion,
  /** Semilla de partida para la búsqueda; si falta, se deriva del id. La que se usó queda en el sim. */
  semilla: z.number().int().nonnegative().optional(),
  /** Lo fija `preparar-colores` desde el sim. */
  duracionFrames: z.number().int().positive().optional(),
  /** Llamado a suscribirse en el clímax (ausente = variante por id; false = apagado; texto = ese texto). */
  llamado: CampoLlamado,
});
export type GuionColores = z.infer<typeof GuionColores>;

export const EQUIPOS_POR_DEFECTO: EquipoColores[] = ['rojo', 'azul', 'amarillo', 'verde'];
export const equiposDe = (g: Pick<GuionColores, 'equipos'>): EquipoColores[] => g.equipos ?? EQUIPOS_POR_DEFECTO;

/** Acción asignada a cada equipo (mismo orden que `equipos`), o null si la votación está apagada. */
export const accionesDe = (g: Pick<GuionColores, 'id' | 'equipos' | 'votacion' | 'semilla'>): AccionVoto[] | null => {
  if (g.votacion === false) return null;
  const n = equiposDe(g).length;
  const fijo = typeof g.votacion === 'object' ? g.votacion.orden : undefined;
  if (fijo && fijo.length >= n) return fijo.slice(0, n);
  // Permutación determinista por id: no siempre la misma acción para el mismo color.
  const acc = [...ORDEN_ACCIONES];
  let h = semillaDesde(`votacion:${g.id}`);
  for (let i = acc.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [acc[i], acc[j]] = [acc[j], acc[i]];
  }
  return acc.slice(0, n);
};
export const textoAccion = (g: Pick<GuionColores, 'votacion'>, a: AccionVoto): string => {
  const t = typeof g.votacion === 'object' ? g.votacion.textos?.[a] : undefined;
  return t ?? ACCIONES_VOTO[a].texto;
};
export const remateDe = (g: Pick<GuionColores, 'votacion'>, a: AccionVoto): string => {
  const plantilla = (typeof g.votacion === 'object' ? g.votacion.remate : undefined) ?? TEXTOS_COLORES.remate;
  return plantilla.replace('{accion}', `${ACCIONES_VOTO[a].icono} ${textoAccion(g, a)}`);
};

// ---------------------------------------------------------------- simulación

/**
 * Bolita en el sim: vive entre `nace` y `muere` (frames de SIMULACIÓN, `muere` exclusivo; null = vive al final).
 * `p` = [x, y, r] por frame desde `nace` (enteros ×1 para x,y y r con 1 decimal).
 */
export type BolitaSim = {
  id: number;
  equipo: number;
  nace: number;
  muere: number | null;
  /** Cómo termina: 'muerte' (estalla) o 'fusion' (la absorbe `en`). */
  fin?: 'muerte' | 'fusion';
  en?: number;
  p: number[];
};

export type TipoEventoColores = 'fusion' | 'division' | 'muerte' | 'eliminado' | 'victoria' | 'lider';

export type EventoColores = {
  /** Frame de SIMULACIÓN. */
  f: number;
  tipo: TipoEventoColores;
  equipo: number;
  x: number;
  y: number;
  /** Radio involucrado (para el tamaño del efecto). */
  r: number;
  /** División: equipo rival. Líder: equipo que pierde el primer lugar. */
  otro?: number;
};

export type SimColores = {
  version: 1;
  id: string;
  fps: number;
  equipos: EquipoColores[];
  arena: { forma: 'circulo' | 'caja'; cx: number; cy: number; r: number };
  /** Semi-tamaño de la arena por frame de simulación (se cierra al final). */
  arenaR: number[];
  framesSim: number;
  bolitas: BolitaSim[];
  eventos: EventoColores[];
  /** Área total por equipo por frame de simulación (valores redondeados). */
  areas: number[][];
  /** Frame de simulación de la victoria. */
  victoriaFrame: number;
  ganador: number;
  /** Video → simulación: frame de simulación (fraccionario) que muestra cada frame de VIDEO (cámara lenta incluida). */
  mapa: number[];
  /** Frame de VIDEO de la victoria y de cada eliminación. */
  victoriaVideo: number;
  /** Frames de VIDEO [desde, hasta) de la cámara lenta. */
  lentoVideo: [number, number];
  duracionFrames: number;
  vuelcos: number;
  semillaUsada: number;
  danoUsado: number;
};
