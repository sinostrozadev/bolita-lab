import React from 'react';
import { Composition } from 'remotion';
import { FORMATO } from '../../marca/tokens';
import { Dato, PropsDato, calcularMetadataDato } from './Dato';

export { GuionDato } from './guion';

/** Registra la composición "Dato". Las props reales llegan por --props desde salida/trabajo/<id>.props.json. */
export const registrar = (): React.ReactNode => (
  <Composition
    id="Dato"
    component={Dato}
    schema={PropsDato}
    calculateMetadata={calcularMetadataDato}
    width={FORMATO.ancho}
    height={FORMATO.alto}
    fps={FORMATO.fps}
    durationInFrames={30 * FORMATO.fps}
    defaultProps={{
      id: '2026-11-03-dato-tierra-luna',
      color: 'cian' as const,
      gancho: 'Si la Tierra fuera una pelota de básquet…',
      escenas: [
        { texto: 'La Luna sería una pelota de tenis.', visual: { tipo: 'escala' as const, items: [{ etiqueta: 'Tierra', radio: 12742 }, { etiqueta: 'Luna', radio: 3474 }] } },
        { texto: 'Y estaría a más de siete metros de distancia. Mucho más lejos de lo que casi todos dibujan.', visual: { tipo: 'cifra' as const, valor: 7.2, sufijo: ' m', etiqueta: 'distancia a escala básquet–tenis' } },
        { texto: 'En la realidad son trescientos ochenta y cuatro mil kilómetros, en promedio.', visual: { tipo: 'cifra' as const, valor: 384400, sufijo: ' km', etiqueta: 'distancia Tierra–Luna' } },
      ],
      remate: 'Y todavía sobran cuatro mil kilómetros.',
      fuentes: [],
    }}
  />
);
