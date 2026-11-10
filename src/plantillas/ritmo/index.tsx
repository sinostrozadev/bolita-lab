import React from 'react';
import { Composition } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Ritmo, calcularMetadataRitmo } from './Ritmo';
import { GuionRitmo } from './guion';

export { GuionRitmo } from './guion';
export type { SimRitmo, GolpeSim } from './guion';

/**
 * Registra la composición "Ritmo". Las props reales llegan por --props desde salida/trabajo/<id>.props.json.
 * Renderizar SIEMPRE con --gl=swangle (Three.js; ver Ritmo.tsx).
 */
export const registrar = (): React.ReactNode => (
  <Composition
    id="Ritmo"
    component={Ritmo}
    schema={GuionRitmo}
    calculateMetadata={calcularMetadataRitmo}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={40 * FORMATO.fps}
    defaultProps={{ id: 'pendiente-ritmo-canon', partitura: 'canon' }}
  />
);
