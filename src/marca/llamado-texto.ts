/**
 * Parte PURA del llamado a suscribirse (sin Remotion): la importan los schemas `guion.ts`
 * de las plantillas, que también corren en Node (preparar-*, generar-guiones).
 * El componente vive en `Llamado.tsx`.
 */
import { z } from 'zod';
import { semillaDesde } from '../lib/azar';

/**
 * Llamado a suscribirse DENTRO del video (no solo en el cartel final, que en un Short en bucle
 * casi nadie ve). Rótulo pequeño en una píldora oscura, centrado, dentro de la zona segura;
 * entra en el clímax de cada plantilla y se queda hasta el <Cierre/>.
 *
 * Campo de props compartido por las tres plantillas (`llamado`):
 * - ausente o `true`: rótulo con una variante elegida por el id del guion (determinista);
 * - `false`: sin rótulo;
 * - texto: ese texto tal cual (máx. 40 caracteres).
 */
export const CampoLlamado = z
  .union([z.boolean(), z.string().min(1).max(40)])
  .optional()
  .describe('Llamado a suscribirse en el clímax. Por defecto activado (variante por id); false lo apaga; un texto lo reemplaza.');
export type CampoLlamado = z.infer<typeof CampoLlamado>;

export type PlantillaLlamado = 'bola' | 'carrera' | 'dato' | 'colores' | 'ritmo';

/**
 * Variantes por plantilla. El botón "Suscribirse" de los Shorts está ABAJO (junto al nombre del
 * canal), por eso la mano apunta hacia abajo.
 */
export const VARIANTES_LLAMADO: Record<PlantillaLlamado, readonly string[]> = {
  bola: [
    // Sin "¿Acertaste?": el cartel del escape ya lo pregunta.
    'Suscríbete y adivina la próxima 👇',
    'Suscríbete y elige la próxima 🎵',
    'Sigue a Bolita Lab para la próxima',
    'Suscríbete: mañana, otra bolita 👇',
  ],
  carrera: [
    '¿Acertaste? Suscríbete 👇',
    'Suscríbete y elige la próxima carrera 🏁',
    'Sigue a Bolita Lab para la revancha',
    'Suscríbete: mañana, otra carrera 👇',
  ],
  colores: [
    'Suscríbete y elige el color de mañana 🎨',
    'Suscríbete: mañana, otra batalla 👇',
    'Sigue a Bolita Lab para la revancha',
    'Suscríbete y defiende tu color 👇',
  ],
  ritmo: [
    'Suscríbete y elige la próxima canción 🎵',
    'Suscríbete: mañana, otra canción 👇',
    'Sigue a Bolita Lab para la próxima',
  ],
  dato: [
    '¿Lo sabías? Suscríbete 👇',
    'Suscríbete para el próximo dato 🧠',
    'Sigue a Bolita Lab para más datos',
    'Suscríbete: mañana, otro dato 👇',
  ],
};

/** Texto del llamado para un guion, o null si está apagado. Mismo id → mismo texto. */
export const textoLlamado = (plantilla: PlantillaLlamado, id: string, campo: CampoLlamado): string | null => {
  if (campo === false) return null;
  if (typeof campo === 'string') return campo;
  const variantes = VARIANTES_LLAMADO[plantilla];
  return variantes[semillaDesde(`llamado:${id}`) % variantes.length];
};
