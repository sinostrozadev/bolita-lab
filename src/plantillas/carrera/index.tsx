import React from 'react';
import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Carrera } from './Carrera';
import { GuionCarrera } from './guion';
import { CIERRE_FRAMES, type SimulacionCarrera } from './tipos';

export { GuionCarrera } from './guion';
export { Carrera } from './Carrera';

/** Duración = llegada de la ganadora + 2,5 s de celebración (ya en la sim) + cierre de 72 frames. */
const calcularMetadata: CalculateMetadataFunction<GuionCarrera> = async ({ props }) => {
  try {
    const r = await fetch(staticFile(`sim/${props.id}.json`));
    if (!r.ok) throw new Error(`sin simulación para ${props.id}`);
    const sim = (await r.json()) as SimulacionCarrera;
    return { durationInFrames: sim.duracionFrames + CIERRE_FRAMES, fps: sim.fps };
  } catch (e) {
    // En Studio sin simulación: duración de relleno (el componente avisará).
    console.warn('[carrera] no se pudo leer la simulación:', (e as Error).message);
    return { durationInFrames: 35 * FORMATO.fps };
  }
};

const EJEMPLO: GuionCarrera = {
  id: '2026-11-03-carrera-meses',
  gancho: '¿Qué mes gana la carrera?',
  tema: 'meses',
  participantes: [
    { etiqueta: 'ENERO', color: 'cian' },
    { etiqueta: 'MARZO', color: 'lima' },
    { etiqueta: 'JUNIO', color: 'amarillo' },
    { etiqueta: 'AGOSTO', color: 'naranja' },
    { etiqueta: 'OCTUBRE', color: 'magenta' },
    { etiqueta: 'DICIEMBRE', color: 'violeta' },
  ],
};

export const registrar = (): React.ReactNode => (
  <Composition
    id="Carrera"
    component={Carrera}
    schema={GuionCarrera}
    defaultProps={EJEMPLO}
    calculateMetadata={calcularMetadata}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={35 * FORMATO.fps}
  />
);
