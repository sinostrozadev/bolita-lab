/**
 * Parte PURA de la votación con acciones del público (sin React): la importan los schemas de las plantillas
 * (corren en Node). El componente vive en `Votacion.tsx`; los íconos en `IconosVoto.tsx`.
 *
 * Cada acción vota por un competidor/color. Los íconos imitan los botones de YouTube Shorts (pulgar, burbuja,
 * flecha de compartir, campana) para que se reconozcan al instante; en pantalla NO se usan emoji.
 */
export const ACCIONES = ['megusta', 'comenta', 'comparte', 'suscribete'] as const;
export type Accion = (typeof ACCIONES)[number];

export const TEXTO_ACCION: Record<Accion, string> = {
  megusta: 'ME GUSTA',
  comenta: 'COMENTA',
  comparte: 'COMPARTE',
  suscribete: 'SUSCRÍBETE',
};

export const TEXTOS_VOTACION = {
  cabecera: 'VOTA POR TU FAVORITO 👇',
  gano: 'GANÓ',
  siLeDiste: 'si le diste',
  acertaste: ', ¡acertaste! 🎉',
} as const;
