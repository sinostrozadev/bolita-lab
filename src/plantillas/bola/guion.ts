/**
 * Contrato de la plantilla "bola": props del guion (zod) y forma del archivo
 * de simulación precalculada (`public/sim/<id>.json`). Lo comparten el script
 * de Node (`scripts/simular-bola.mts`) y el componente de Remotion.
 * Sin React ni Node aquí: solo tipos y zod.
 */
import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';
import { semillaDesde } from '../../lib/azar';

/** Palabras "de verdad" (con letras o cifras): los emoji no cuentan. */
const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Melodías disponibles (deben existir en `MELODIAS` de scripts/lib/wav.mts). */
export const MELODIAS_BOLA = ['furelise', 'marchaturca', 'odaalegria', 'canon', 'cisnes'] as const;

/** Timbres de la melodía (deben existir en `Instrumento` de scripts/lib/wav.mts). */
export const TIMBRES_BOLA = ['pluck', 'piano', 'campana'] as const;

/**
 * Melodía propia del guion: misma forma que `MELODIAS` de wav.mts. Pulso = negra; midi 0 = silencio
 * (no gasta rebote). `compas`/`anacrusa`/`tonica`/`menor` solo afinan el acompañamiento.
 */
export const MelodiaNotas = z.object({
  bpm: z.number().min(40).max(240),
  notas: z.array(z.tuple([z.number().int().min(0).max(127), z.number().positive().max(16)])).min(4)
    .refine((n) => n.filter(([m]) => m > 0).length >= 4, 'melodiaNotas: al menos 4 notas sonoras'),
  /** Pulsos por compás (por defecto 4). */
  compas: z.number().positive().max(12).optional(),
  /** Pulsos de levare antes del primer compás (por defecto 0). */
  anacrusa: z.number().min(0).max(12).optional(),
  /** Tónica como clase de altura (Do = 0 … Si = 11); si falta, la última nota sonora. */
  tonica: z.number().int().min(0).max(11).optional(),
  menor: z.boolean().optional(),
  /** Acordes del acompañamiento escritos a mano, uno por compás (en bucle): [raíz 0–11, menor]. Si faltan, se deducen. */
  acordes: z.array(z.tuple([z.number().int().min(0).max(11), z.boolean()])).min(1).optional(),
});
export type MelodiaNotas = z.infer<typeof MelodiaNotas>;

/** Texto corto de juego: ≤ `max` palabras de verdad (los emoji no cuentan). */
const textoCorto = (chars: number, max: number, campo: string) =>
  z.string().min(1).max(chars).refine((t) => palabras(t) <= max, `${campo}: máximo ${max} palabras`);

/**
 * Juego "adivina la canción": arriba "¿Qué canción es? 🎵" (o `ganchoArriba`), abajo el CTA (o `cta`); las pistas
 * entran en el segundo `t` del VIDEO (cold open incluido) en una tarjeta bajo el bloque de arriba y SE ACUMULAN
 * (la nueva grande y brillante, las anteriores más chicas): quien llega tarde las ve todas. El texto de cada pista
 * va SIN el prefijo "Pista n:" (lo pone la tarjeta). El clímax NO nombra la canción: muestra `cierre`.
 * Ojo: el título, la descripción y los hashtags del guion tampoco deben nombrarla.
 */
export const JuegoAdivina = z.object({
  tipo: z.literal('adivina'),
  pistas: z.array(z.object({ t: z.number().min(0).max(58), texto: textoCorto(40, 6, 'pista') })).min(1).max(3),
  cta: textoCorto(40, 7, 'cta').optional(),
  cierre: textoCorto(48, 7, 'cierre').optional(),
});
/**
 * Juego "apuesta": arriba la `pregunta`, abajo el CTA; a los 3 s un rótulo "⏳ apuesta ya" durante 1,5 s; el clímax
 * muestra el resultado real (escape: rebote; crecer: rebotes hasta llenar) y debajo `acierto`.
 */
export const JuegoApuesta = z.object({
  tipo: z.literal('apuesta'),
  pregunta: textoCorto(64, 9, 'pregunta'),
  cta: textoCorto(48, 7, 'cta').optional(),
  acierto: textoCorto(32, 4, 'acierto').optional(),
});
export const JuegoBola = z.discriminatedUnion('tipo', [JuegoAdivina, JuegoApuesta]);
export type JuegoBola = z.infer<typeof JuegoBola>;

/** Textos por defecto de los juegos. */
export const TEXTOS_JUEGO = {
  adivinaArriba: '¿Qué canción es? 🎵',
  adivinaCta: 'Escríbela en los comentarios 👇',
  adivinaCierre: '¿La reconociste? Escríbela abajo 👇',
  apuestaCta: 'Comenta tu número antes del final 👇',
  apuestaYa: '⏳ apuesta ya',
  acierto: '¿Acertaste? 👇',
} as const;

export const GuionBola = z.object({
  /** Id del guion: nombra el sim, el wav y el mp4. */
  id: z.string().min(1),
  /** Gancho textual. Guiones viejos: si no hay `ganchoArriba`, este texto va en el bloque de arriba (fijo todo el video). */
  gancho: z.string().min(1).max(90),
  /**
   * Bloque de ARRIBA, fijo desde el frame 0 hasta el cierre: describe la MECÁNICA en ≤ 9 palabras
   * (ej. "Crece con cada rebote hasta llenar el círculo", "Cada rebote gira el hueco: ¿cuándo escapa?").
   * Si falta, se usa `gancho`.
   */
  ganchoArriba: z.string().min(1).max(64).refine((t) => palabras(t) <= 9, 'ganchoArriba: máximo 9 palabras').optional(),
  /**
   * Bloque de ABAJO, fijo desde el frame 0 hasta el cierre: la INTRIGA en ≤ 5 palabras (+ emoji opcional)
   * (ej. "El final no lo esperas 💀", "¿Llega a llenarlo?"). Si falta, una variante por modo elegida por id.
   */
  ganchoAbajo: z.string().min(1).max(32).refine((t) => palabras(t) <= 5, 'ganchoAbajo: máximo 5 palabras').optional(),
  /** Trazas persistentes: cada posición pasada de la bola queda dibujada y el círculo se llena de color. Por defecto sí. */
  trazas: z.boolean().optional(),
  /** Melodía del catálogo. Obligatoria salvo que venga `melodiaNotas` (si vienen ambas, manda `melodiaNotas`). */
  melodia: z.enum(MELODIAS_BOLA).optional(),
  /**
   * Melodía escrita en el propio guion (alternativa a `melodia`): una nota por rebote, en orden y en bucle.
   * Solo dominio público u obra propia (la música con derechos no se publica sin decisión de Santiago).
   */
  melodiaNotas: MelodiaNotas.optional(),
  /** Instrumento de la melodía: pluck (marimba, por defecto), piano o campana (tubular). */
  timbre: z.enum(TIMBRES_BOLA).optional(),
  /**
   * Segundo instrumento: en cada compás de la partitura suena la raíz ('bajo') o la tríada ('acorde') del grado
   * que mejor armoniza las notas de ese compás, una octava bajo la melodía, con timbre suave. Ausente/null = sin.
   */
  acompanamiento: z.enum(['bajo', 'acorde']).nullable().optional(),
  /** Juego con el público (comentarios): `adivina` la canción o `apuesta` el número de rebotes. */
  juego: JuegoBola.optional(),
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

/**
 * Validación completa (la usan preparar/simular): el objeto de arriba es el schema de la composición de Remotion
 * (que exige un z.object), y las reglas entre campos van aquí.
 */
export const GuionBolaValidado = GuionBola.superRefine((g, ctx) => {
  if (!g.melodia && !g.melodiaNotas) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'falta la melodía: pon `melodia` (catálogo) o `melodiaNotas`', path: ['melodia'] });
  if (g.juego?.tipo === 'adivina') {
    const ts = g.juego.pistas.map((p) => p.t);
    if (ts.some((t, i) => i > 0 && t <= ts[i - 1])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pistas: los tiempos deben ir en orden creciente', path: ['juego', 'pistas'] });
  }
});

/** Intriga por defecto del bloque de abajo (determinista por id) para guiones que no traen `ganchoAbajo`. */
export const VARIANTES_GANCHO_ABAJO: Record<GuionBola['modo'], readonly string[]> = {
  crecer: ['¿Llega a llenarlo? 💀', 'El final no lo esperas 💀', 'Mira cómo termina 😳'],
  escape: ['¿En qué rebote escapa? 💀', 'El final no lo esperas 💀', 'Espera el final 😳'],
};
export const ganchoAbajoDe = (g: Pick<GuionBola, 'id' | 'modo' | 'ganchoAbajo' | 'juego'>): string => {
  if (g.juego?.tipo === 'adivina') return g.juego.cta ?? TEXTOS_JUEGO.adivinaCta;
  if (g.juego?.tipo === 'apuesta') return g.juego.cta ?? TEXTOS_JUEGO.apuestaCta;
  if (g.ganchoAbajo) return g.ganchoAbajo;
  const v = VARIANTES_GANCHO_ABAJO[g.modo];
  return v[semillaDesde(`abajo:${g.id}`) % v.length];
};
export const ganchoArribaDe = (g: Pick<GuionBola, 'gancho' | 'ganchoArriba' | 'juego'>): string => {
  if (g.juego?.tipo === 'apuesta') return g.juego.pregunta;
  if (g.juego?.tipo === 'adivina') return g.ganchoArriba ?? TEXTOS_JUEGO.adivinaArriba;
  return g.ganchoArriba ?? g.gancho;
};

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
  /**
   * Frames de cold open que el video antepone a la simulación (0,4 s mostrando el final ya saturado).
   * `cuadros`, `eventos` y `duracionFrames` NO los incluyen (son tiempo de simulación); el wav sí
   * (todo corrido). Sims viejos: ausente = 0. Duración del video = duracionFrames + coldOpenFrames.
   */
  coldOpenFrames?: number;
  /** Frame de la simulación con que arranca el cold open (ausente = climaxFrame − coldOpenFrames). */
  coldOpenDesde?: number;
};
