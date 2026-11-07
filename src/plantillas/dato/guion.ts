import { z } from 'zod';
import { CampoLlamado } from '../../marca/llamado-texto';

/** Voces de msedge-tts permitidas. La elegida por defecto se documenta en README.md. */
export const VOCES = ['es-MX-JorgeNeural', 'es-CL-LorenzoNeural', 'es-ES-AlvaroNeural', 'es-MX-DaliaNeural'] as const;
export const VOZ_POR_DEFECTO: (typeof VOCES)[number] = 'es-MX-JorgeNeural';
export const COLORES = ['lima', 'cian', 'magenta', 'naranja', 'violeta', 'amarillo'] as const;
export const FORMAS = ['tierra', 'luna', 'sol', 'corazon', 'rayo', 'reloj', 'persona', 'bola'] as const;

export const VisualDato = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('cifra'), valor: z.number(), prefijo: z.string().optional(), sufijo: z.string().optional(), etiqueta: z.string(),
    /** Palabra hablada en la que "cae" la cifra (por defecto, el primer número que dice la voz). */
    dice: z.string().optional(),
  }),
  z.object({ tipo: z.literal('comparar'), sufijo: z.string().optional(), items: z.array(z.object({ etiqueta: z.string(), valor: z.number().nonnegative(), color: z.string().optional() })).min(2).max(6) }),
  z.object({ tipo: z.literal('escala'), items: z.array(z.object({ etiqueta: z.string(), radio: z.number().positive() })).min(2).max(5) }),
  z.object({ tipo: z.literal('lista'), items: z.array(z.string()).min(2).max(6) }),
  z.object({ tipo: z.literal('frase'), texto: z.string(), enfasis: z.array(z.string()).optional() }),
  z.object({ tipo: z.literal('icono'), forma: z.enum(FORMAS), etiqueta: z.string().optional() }),
]);
export type VisualDato = z.infer<typeof VisualDato>;

/**
 * Imagen de archivo para una escena (opcional). `scripts/imagenes-dato.mts` la busca en Wikimedia
 * Commons y solo acepta dominio público, CC0, CC BY o CC BY-SA. Si no encuentra una válida, la
 * escena se queda con su visual de siempre (icono/tipografía): nunca rompe el render.
 */
export const ImagenEscena = z.object({
  /** Búsqueda en Commons, en inglés, 2–4 palabras, como sus títulos ("Cleopatra bust", "Great Pyramid of Giza"). */
  buscar: z.string().min(2).max(60),
  /** Título exacto de un archivo de Commons ("File:...jpg") para fijar la elección (se valida igual la licencia). */
  archivo: z.string().optional(),
  /** marco = tarjeta redondeada arriba (por defecto en escenas); circulo = medallón; completa = de fondo, oscurecida (por defecto en gancho/remate). */
  forma: z.enum(['marco', 'circulo', 'completa']).optional(),
  /** Qué parte de la foto conservar al recortar (útil en retratos: "arriba" deja la cara). */
  encuadre: z.enum(['arriba', 'centro', 'abajo']).optional(),
});
export type ImagenEscena = z.infer<typeof ImagenEscena>;

/** Imagen ya descargada (la escribe el script de imágenes en el json de props; no va en los guiones). */
export const ImagenResuelta = z.object({
  src: z.string(), // relativa a public/, ej. imagenes/<id>/1.jpg
  ancho: z.number(),
  alto: z.number(),
  titulo: z.string(),
  pagina: z.string(),
  autor: z.string(),
  licencia: z.string(),
  licenciaUrl: z.string().optional(),
  forma: z.enum(['marco', 'circulo', 'completa']),
  encuadre: z.enum(['arriba', 'centro', 'abajo']).optional(),
});
export type ImagenResuelta = z.infer<typeof ImagenResuelta>;

/** Imágenes por línea, con el mismo índice que la voz: 0 = gancho, 1..n = escenas, n+1 = remate. */
export const ImagenesDato = z.record(z.string(), ImagenResuelta);
export type ImagenesDato = z.infer<typeof ImagenesDato>;

export const EscenaDato = z.object({ texto: z.string().min(1), visual: VisualDato, imagen: ImagenEscena.optional() });
export type EscenaDato = z.infer<typeof EscenaDato>;

/** Guion de un Short de "dato sorprendente". Es lo que viaja en `props` del envoltorio. */
export const GuionDato = z.object({
  id: z.string().min(1),
  voz: z.enum(VOCES).optional(),
  color: z.enum(COLORES),
  gancho: z.string().min(1),
  /** Imagen detrás del gancho (forma "completa" por defecto): lo primero que se ve. */
  imagenGancho: ImagenEscena.optional(),
  escenas: z.array(EscenaDato).min(3).max(6),
  remate: z.string().min(1),
  imagenRemate: ImagenEscena.optional(),
  fuentes: z.array(z.string()),
  /** Llamado a suscribirse en el clímax (opcional; ausente = activado con variante por id; false = apagado; texto = ese texto). */
  llamado: CampoLlamado,
});
export type GuionDato = z.infer<typeof GuionDato>;

/** Envoltorio de `contenido/guiones/*.json`. */
export const EnvoltorioDato = z.object({
  plantilla: z.literal('dato'),
  id: z.string().min(1),
  titulo: z.string().max(70),
  descripcion: z.string(),
  hashtags: z.array(z.string()),
  props: GuionDato,
});
export type EnvoltorioDato = z.infer<typeof EnvoltorioDato>;
