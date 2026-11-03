/**
 * Sistema de marca de BOLITA LAB.
 * Única fuente de verdad para colores, tipografía, formato y ritmo.
 * Toda plantilla importa de aquí; nadie inventa colores sueltos.
 */
export const FORMATO = {
  ancho: 1080,
  alto: 1920,
  fps: 60,
  /** Zona segura vertical para Shorts: UI de YouTube tapa ~200px arriba y ~330px abajo. */
  seguro: { arriba: 220, abajo: 340, lados: 60 },
} as const;

export const PALETA = {
  fondo: '#0B0B12',
  fondo2: '#141426',
  tinta: '#F4F4FF',
  tintaSuave: '#A9A9C7',
  /** Neones de Bolita: cada uno es un “personaje”. */
  neon: {
    lima: '#C8FF3D',
    cian: '#2EF2FF',
    magenta: '#FF3DCA',
    naranja: '#FF8A3D',
    violeta: '#9D5CFF',
    amarillo: '#FFE23D',
  },
  rojo: '#FF4D5B',
  verde: '#3DFF8F',
} as const;

export const NEONES = Object.values(PALETA.neon);

export const TIPO = {
  /** Display para títulos: muy gruesa, legible en teléfono. */
  display: 'Bricolage Grotesque',
  /** Texto de apoyo y cifras. */
  texto: 'Inter',
  pesoDisplay: 800,
} as const;

/** Duraciones en segundos: los Shorts rinden mejor entre 25 y 55 s. */
export const RITMO = {
  ganchoMax: 1.5,
  shortMin: 25,
  shortMax: 58,
} as const;

export const MARCA = {
  nombre: 'Bolita Lab',
  handle: '@bolitalab',
  lema: 'Cosas que rebotan, chocan y explican.',
  /** Marca de agua discreta esquina superior derecha, dentro de la zona segura. */
  marcaDeAgua: { tamano: 34, opacidad: 0.55 },
} as const;
