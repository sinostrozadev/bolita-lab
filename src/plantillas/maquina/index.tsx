import React from 'react';
import { Composition } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Maquina, calcularMetadataMaquina } from './Maquina';
import { GuionMaquina } from './guion';

export { GuionMaquina } from './guion';
export type { SimMaquina, GolpeMaquina } from './guion';

/**
 * Registra la composición "Maquina" (máquina de canicas musical en 3D). Las props reales llegan por --props desde
 * salida/trabajo/<id>.props.json; fps y duración salen del sim (calculateMetadata). Renderizar SIEMPRE con --gl=swangle.
 */
export const registrar = (): React.ReactNode => (
  <Composition
    id="Maquina"
    component={Maquina}
    schema={GuionMaquina}
    calculateMetadata={calcularMetadataMaquina}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={44 * FORMATO.fps}
    defaultProps={{ id: 'pendiente-maquina-oda', partitura: 'oda-alegria' }}
  />
);
