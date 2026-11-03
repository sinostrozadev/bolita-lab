import { z } from 'zod';

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

export const EscenaDato = z.object({ texto: z.string().min(1), visual: VisualDato });
export type EscenaDato = z.infer<typeof EscenaDato>;

/** Guion de un Short de "dato sorprendente". Es lo que viaja en `props` del envoltorio. */
export const GuionDato = z.object({
  id: z.string().min(1),
  voz: z.enum(VOCES).optional(),
  color: z.enum(COLORES),
  gancho: z.string().min(1),
  escenas: z.array(EscenaDato).min(3).max(6),
  remate: z.string().min(1),
  fuentes: z.array(z.string()),
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
