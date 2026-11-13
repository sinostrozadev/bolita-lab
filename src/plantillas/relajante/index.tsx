import React from 'react';
import { Composition } from 'remotion';
import { FORMATO_LARGO } from '../../marca/tokens';
import { MiniaturaRelajante, Relajante, calcularMetadataRelajante } from './Relajante';
import { GuionRelajante } from './guion';

export { GuionRelajante } from './guion';

const EJEMPLO = {
  id: '2026-11-21-relajante', titulo: '30 minutos de bolitas relajantes', segundosEscena: 305, fundido: 6,
  escenas: [{ tipo: 'llenar' as const, pieza: 'gymnopedie' as const, tono: 205, nombre: 'x' }, { tipo: 'gotas' as const, pieza: 'marea' as const, tono: 215, nombre: 'y' }],
};

/** LARGO 16:9 "Bolitas relajantes" (render --concurrency=1: las trazas se dibujan en orden) + miniatura 1280 × 720. */
export const registrar = (): React.ReactNode => (
  <>
    <Composition id="Relajante" component={Relajante} schema={GuionRelajante} calculateMetadata={calcularMetadataRelajante}
      width={FORMATO_LARGO.ancho} height={FORMATO_LARGO.alto} fps={FORMATO_LARGO.fps} durationInFrames={1800 * FORMATO_LARGO.fps} defaultProps={EJEMPLO} />
    <Composition id="MiniaturaRelajante" component={MiniaturaRelajante} schema={GuionRelajante}
      width={1280} height={720} fps={FORMATO_LARGO.fps} durationInFrames={1} defaultProps={EJEMPLO} />
  </>
);
