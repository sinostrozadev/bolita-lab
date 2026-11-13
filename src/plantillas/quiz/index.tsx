import React from 'react';
import { Composition } from 'remotion';
import { FORMATO_LARGO } from '../../marca/tokens';
import { MiniaturaQuiz, Quiz, calcularMetadataQuiz } from './Quiz';
import { GuionQuiz } from './guion';

export { GuionQuiz } from './guion';
const EJEMPLO = { id: '2026-11-18-quiz', titulo: '¿CUÁNTAS ADIVINAS?', subtitulo: '10 canciones tocadas por una bolita' };

/** LARGO 16:9 "¿Cuántas adivinas?" (versión simple) + miniatura 1280 × 720. */
export const registrar = (): React.ReactNode => (
  <>
    <Composition id="Quiz" component={Quiz} schema={GuionQuiz} calculateMetadata={calcularMetadataQuiz}
      width={FORMATO_LARGO.ancho} height={FORMATO_LARGO.alto} fps={FORMATO_LARGO.fps} durationInFrames={500 * FORMATO_LARGO.fps} defaultProps={EJEMPLO} />
    <Composition id="MiniaturaQuiz" component={MiniaturaQuiz} schema={GuionQuiz} width={1280} height={720} fps={FORMATO_LARGO.fps} durationInFrames={1} defaultProps={EJEMPLO} />
  </>
);
