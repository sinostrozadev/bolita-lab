import React from 'react';
import { Composition } from 'remotion';
import { FORMATO_LARGO } from '../../marca/tokens';
import { MiniaturaTorneo, Torneo, calcularMetadataTorneo } from './Torneo';
import { GuionTorneo } from './guion';

export { GuionTorneo } from './guion';

const EJEMPLO = {
  id: '2026-11-16-torneo-paises', titulo: 'TORNEO DE BOLITAS', subtitulo: '16 países · 1 campeón', tema: 'países',
  participantes: Array.from({ length: 16 }, (_, i) => ({ etiqueta: `P${i + 1}`, icono: { tipo: 'texto' as const, valor: String(i + 1) } })),
};

/** LARGO 16:9 "Torneo de bolitas" + su miniatura 1280 × 720 (props reales por --props). */
export const registrar = (): React.ReactNode => (
  <>
    <Composition id="Torneo" component={Torneo} schema={GuionTorneo} calculateMetadata={calcularMetadataTorneo}
      width={FORMATO_LARGO.ancho} height={FORMATO_LARGO.alto} fps={FORMATO_LARGO.fps} durationInFrames={600 * FORMATO_LARGO.fps} defaultProps={EJEMPLO} />
    <Composition id="MiniaturaTorneo" component={MiniaturaTorneo} schema={GuionTorneo}
      width={1280} height={720} fps={FORMATO_LARGO.fps} durationInFrames={1} defaultProps={EJEMPLO} />
  </>
);
