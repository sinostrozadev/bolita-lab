import React from 'react';
import { Composition } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Colores, calcularMetadataColores } from './Colores';
import { GuionColores } from './guion';

export { GuionColores } from './guion';
export type { SimColores, EventoColores } from './guion';

/** Registra la composición "Colores". Las props reales llegan por --props desde salida/trabajo/<id>.props.json. */
export const registrar = (): React.ReactNode => (
  <Composition
    id="Colores"
    component={Colores}
    schema={GuionColores}
    calculateMetadata={calcularMetadataColores}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={40 * FORMATO.fps}
    defaultProps={{ id: 'pendiente-colores-batalla-4' }}
  />
);
