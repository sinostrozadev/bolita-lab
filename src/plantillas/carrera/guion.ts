import { z } from 'zod';

/** Colores de neón permitidos para cada participante (claves de PALETA.neon). */
export const ColorNeon = z.enum(['lima', 'cian', 'magenta', 'naranja', 'violeta', 'amarillo']);
export type ColorNeon = z.infer<typeof ColorNeon>;

/**
 * Props de la composición `Carrera` ("¿Cuál llega primero?").
 * El pipeline escribe estos props en `salida/trabajo/<id>.props.json`
 * tras simular la física (`scripts/preparar-carrera.mts`).
 */
export const GuionCarrera = z.object({
  /** Identificador del video: nombra `public/sim/<id>.json` y `public/audio/generado/<id>.wav`. */
  id: z.string().min(1),
  /** Gancho textual de los primeros 1,5 s. Ej.: "¿Qué mes gana la carrera?" */
  gancho: z.string().min(1).max(60),
  participantes: z
    .array(z.object({ etiqueta: z.string().min(1).max(18), color: ColorNeon }))
    .min(4)
    .max(6),
  /** Semilla opcional; si falta se deriva del id. */
  semilla: z.number().int().optional(),
  /** Tema libre, solo informativo (p. ej. "meses", "mascotas"). */
  tema: z.string().optional(),
});
export type GuionCarrera = z.infer<typeof GuionCarrera>;
