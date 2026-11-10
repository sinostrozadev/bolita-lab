import React from 'react';
import type { Accion } from './votacion-texto';

/**
 * Íconos de las acciones, dibujados como los botones de YouTube Shorts: trazo blanco grueso, sin relleno,
 * mismo estilo los cuatro (viewBox 24×24). Me gusta = pulgar arriba · Comenta = burbuja cuadrada con colita y
 * líneas · Comparte = flecha curva hacia la derecha · Suscríbete = campana.
 */
const TRAZOS: Record<Accion, React.ReactNode> = {
  megusta: (
    <>
      <path d="M3 10.2h3.6v10.3H3z" />
      <path d="M6.6 10.2 10.9 3.4c1.4-.3 2.6.9 2.3 2.3l-.8 3.9h5.9c1.4 0 2.4 1.3 2.1 2.6l-1.6 6.6c-.2 1-1.1 1.7-2.1 1.7H6.6" />
    </>
  ),
  comenta: (
    <>
      <path d="M5.2 3.5h13.6c1.2 0 2.2 1 2.2 2.2v8.6c0 1.2-1 2.2-2.2 2.2H10.4L5.6 20.6v-4.1h-.4C4 16.5 3 15.5 3 14.3V5.7c0-1.2 1-2.2 2.2-2.2z" />
      <path d="M7.4 8.2h9.2M7.4 11.8h6.2" />
    </>
  ),
  comparte: (
    <path d="M13.6 4.2 21 11.4l-7.4 7.2v-4.1c-4.6-.1-8 1.3-10.6 4.9.7-5.4 3.9-9.6 10.6-10.5V4.2z" />
  ),
  suscribete: (
    <>
      <path d="M12 3.2c-3.3 0-5.9 2.6-5.9 5.9v4.2L4 16.6v.8h16v-.8l-2.1-3.3V9.1c0-3.3-2.6-5.9-5.9-5.9z" />
      <path d="M9.8 19.6c.4 1 1.2 1.6 2.2 1.6s1.8-.6 2.2-1.6" />
    </>
  ),
};

export const IconoAccion: React.FC<{ accion: Accion; tam: number; color?: string; style?: React.CSSProperties }> = ({ accion, tam, color = '#FFFFFF', style }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round"
    style={{ flex: 'none', overflow: 'visible', filter: 'drop-shadow(0 2px 3px #000)', ...style }}>
    {TRAZOS[accion]}
  </svg>
);
