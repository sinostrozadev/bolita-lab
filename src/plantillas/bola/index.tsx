import React from 'react';
import { Composition } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Bola, calcularMetadataBola } from './Bola';
import { GuionBola } from './guion';

export { GuionBola } from './guion';
export type { SimBola, EventoSim } from './guion';

/** Registra la composición "Bola". Las props reales llegan por --props desde salida/trabajo/<id>.props.json. */
export const registrar = (): React.ReactNode => (
  <Composition
    id="Bola"
    component={Bola}
    schema={GuionBola}
    calculateMetadata={calcularMetadataBola}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={30 * FORMATO.fps}
    defaultProps={{
      id: '2026-11-03-bola-furelise',
      gancho: '¿Cuántos rebotes antes de escapar?',
      melodia: 'furelise',
      modo: 'escape',
      bolas: 1,
    }}
  />
);
