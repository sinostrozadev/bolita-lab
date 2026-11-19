import React from 'react';
import { Composition } from 'remotion';
import { FORMATO_LARGO } from '../../marca/tokens';
import { Eliminacion, MiniaturaEliminacion, calcularMetadataEliminacion } from './Eliminacion';
import { GuionEliminacion } from './guion';

export { GuionEliminacion } from './guion';

const EJEMPLO = {
  id: '2026-11-21-eliminacion-50-paises', titulo: '50 PAÍSES', subtitulo: 'SOLO 1 GANA', tema: 'países',
  participantes: Array.from({ length: 50 }, (_, i) => ({ etiqueta: `P${i + 1}`, icono: { tipo: 'texto' as const, valor: String(i + 1) } })),
};

/** LARGO 16:9 "Carrera de eliminación" (50 participantes) + su miniatura 1280 × 720 (props reales por --props). */
export const registrar = (): React.ReactNode => (
  <>
    <Composition id="Eliminacion" component={Eliminacion} schema={GuionEliminacion} calculateMetadata={calcularMetadataEliminacion}
      width={FORMATO_LARGO.ancho} height={FORMATO_LARGO.alto} fps={FORMATO_LARGO.fps} durationInFrames={1200 * FORMATO_LARGO.fps} defaultProps={EJEMPLO} />
    <Composition id="MiniaturaEliminacion" component={MiniaturaEliminacion} schema={GuionEliminacion}
      width={1280} height={720} fps={FORMATO_LARGO.fps} durationInFrames={1} defaultProps={EJEMPLO} />
  </>
);
