import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';
import { semillaDesde } from '../../lib/azar';

/** Palabras "de verdad" (con letras o cifras): los emoji no cuentan. */
const palabras = (t: string) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Colores de neón permitidos para cada participante (claves de PALETA.neon). */
export const ColorNeon = z.enum(['lima', 'cian', 'magenta', 'naranja', 'violeta', 'amarillo']);
export type ColorNeon = z.infer<typeof ColorNeon>;

/**
 * Identidad visual de un competidor (va dentro de la bolita, en el marcador y en el final).
 * - `marca`: logo de simple-icons (CC0). `slug` = nombre de archivo en simple-icons
 *   (apple, samsung, xiaomi, google, playstation, tiktok, youtube...). OJO: simple-icons NO trae
 *   xbox, nintendo, microsoft ni windows (los retiraron a pedido de las marcas): para esos usa
 *   `emoji` o `texto`. `svg` lo rellena `scripts/preparar-carrera.mts` (no lo escribas a mano);
 *   si el slug no existe, preparar lo cambia por `texto` con las iniciales y avisa.
 * - `emoji`: un solo emoji para competidores sin marca (meses, sabores, mascotas, países 🇨🇱).
 *   Nunca caras de personas reales: para futbolistas, bandera de su país o iniciales.
 * - `texto`: 1–3 caracteres (p. ej. "PC", "CR7") cuando no hay ni logo ni emoji claro.
 */
export const IconoCompetidor = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('marca'),
    slug: z.string().min(1),
    /** Lo rellena preparar-carrera: trazado SVG (viewBox 0 0 24 24), color oficial (#RRGGBB) y caja. */
    svg: z
      .object({
        path: z.string(),
        hex: z.string(),
        titulo: z.string(),
        /** Caja real del logo dentro del 24×24 [x, y, ancho, alto]: recorta márgenes y detecta logotipos anchos. */
        caja: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      })
      .optional(),
  }),
  z.object({ tipo: z.literal('emoji'), valor: z.string().min(1).max(16) }),
  z.object({ tipo: z.literal('texto'), valor: z.string().min(1).max(3) }),
]);
export type IconoCompetidor = z.infer<typeof IconoCompetidor>;

/**
 * Props de la composición `Carrera` ("¿Cuál llega primero?").
 * El pipeline escribe estos props en `salida/trabajo/<id>.props.json`
 * tras simular la física (`scripts/preparar-carrera.mts`).
 */
export const GuionCarrera = z.object({
  /** Identificador del video: nombra `public/sim/<id>.json` y `public/audio/generado/<id>.wav`. */
  id: z.string().min(1),
  /** La pregunta. Ej.: "¿Qué mes gana la carrera?". Si no hay `ganchoArriba`, va en el bloque de arriba (fijo todo el video). */
  gancho: z.string().min(1).max(60),
  /** Bloque de ARRIBA, fijo desde el frame 0 hasta el cierre (≤ 9 palabras). Ej.: "¿Qué estación gana?". Si falta, se usa `gancho`. */
  ganchoArriba: z.string().min(1).max(50).refine((t) => palabras(t) <= 9, 'ganchoArriba: máximo 9 palabras').optional(),
  /** Bloque de ABAJO, fijo desde el frame 0 hasta el cierre: intriga en ≤ 5 palabras (+ emoji). Ej.: "El último te sorprende 💀". Si falta, variante por id. */
  ganchoAbajo: z.string().min(1).max(32).refine((t) => palabras(t) <= 5, 'ganchoAbajo: máximo 5 palabras').optional(),
  participantes: z
    .array(z.object({ etiqueta: z.string().min(1).max(18), color: ColorNeon, icono: IconoCompetidor.optional() }))
    .min(4)
    .max(6),
  /** Semilla opcional; si falta se deriva del id. */
  semilla: z.number().int().optional(),
  /** Tema libre, solo informativo (p. ej. "meses", "mascotas"). */
  tema: z.string().optional(),
  /** Llamado a suscribirse en el clímax (opcional; ausente = activado con variante por id; false = apagado; texto = ese texto). */
  llamado: CampoLlamado,
});
export type GuionCarrera = z.infer<typeof GuionCarrera>;

/** Intriga por defecto del bloque de abajo (determinista por id) para guiones sin `ganchoAbajo`. */
export const VARIANTES_GANCHO_ABAJO_CARRERA = ['El último te sorprende 💀', '¿Cuál es el tuyo? 👇', 'El final es de infarto 💀'] as const;
export const ganchoAbajoCarrera = (g: Pick<GuionCarrera, 'id' | 'ganchoAbajo'>): string =>
  g.ganchoAbajo ?? VARIANTES_GANCHO_ABAJO_CARRERA[semillaDesde(`abajo:${g.id}`) % VARIANTES_GANCHO_ABAJO_CARRERA.length];
