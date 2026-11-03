import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion';
import { z } from 'zod';
import { PALETA } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { semillaDesde } from '../../lib/azar';
import { GuionDato } from './guion';
import { FRAMES_CIERRE, estimarTiempos, planificar, type Tiempos } from './plan';
import { Fondo } from './Fondo';
import { Subtitulos } from './Subtitulos';
import { TextoGigante } from './TextoGigante';
import { VisualDe } from './Visuales';
import { colorDe } from './util';

/** Props de la composición: el guion + lo que calcula `calculateMetadata`. */
export const PropsDato = GuionDato.extend({
  duracionFrames: z.number().optional(),
  tiempos: z.any().optional(),
});
export type PropsDato = z.infer<typeof PropsDato>;

const FPS = 60;

/** Lee tiempos.json de la voz (fetch) y fija la duración = voz + pausas + cierre. Sin voz generada usa tiempos estimados (Studio). */
export const calcularMetadataDato: CalculateMetadataFunction<PropsDato> = async ({ props }) => {
  let tiempos: Tiempos;
  try {
    const res = await fetch(staticFile(`voz/${props.id}/tiempos.json`));
    if (!res.ok) throw new Error(String(res.status));
    tiempos = (await res.json()) as Tiempos;
  } catch {
    tiempos = estimarTiempos(props);
  }
  const plan = planificar(props, tiempos, FPS);
  return { durationInFrames: plan.duracionFrames, props: { ...props, tiempos, duracionFrames: plan.duracionFrames } };
};

export const Dato: React.FC<PropsDato> = (props) => {
  cargarFuentes();
  const color = colorDe(props.color, PALETA.neon.lima);
  const tiempos: Tiempos = props.tiempos ?? estimarTiempos(props);
  const plan = useMemo(() => planificar(props, tiempos, FPS), [props, tiempos]);
  const hayVoz = !!props.tiempos;
  return (
    <AbsoluteFill style={{ background: PALETA.fondo }}>
      <Fondo color={color} semilla={semillaDesde(props.id)} />
      {hayVoz && <Audio src={staticFile(`audio/generado/${props.id}.wav`)} volume={0.9} />}
      {hayVoz && tiempos.lineas.map((l) => (
        <Sequence key={l.indice} from={Math.round(l.inicio * FPS)} durationInFrames={Math.ceil(l.duracionAudio * FPS) + 2}>
          <Audio src={staticFile(l.archivo)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={plan.gancho.desde} durationInFrames={plan.gancho.frames}>
        <GanchoRemate linea={plan.gancho.linea} frames={plan.gancho.frames} color={color} modo="gancho" />
      </Sequence>
      {plan.escenas.map((b) => (
        <Sequence key={b.indiceEscena} from={b.desde} durationInFrames={b.frames}>
          <Escena bloque={b} visual={props.escenas[b.indiceEscena].visual} color={color} />
        </Sequence>
      ))}
      <Sequence from={plan.remate.desde} durationInFrames={plan.remate.frames}>
        <GanchoRemate linea={plan.remate.linea} frames={plan.remate.frames} color={color} modo="remate" />
      </Sequence>
      <MarcaDeAgua />
      <Sequence from={plan.cierreDesde} durationInFrames={FRAMES_CIERRE}>
        <Cierre color={color} />
      </Sequence>
    </AbsoluteFill>
  );
};

import { useCurrentFrame } from 'remotion';
import type { BloqueEscena } from './plan';
import type { VisualDato } from './guion';

const GanchoRemate: React.FC<{ linea: BloqueEscena['linea']; frames: number; color: string; modo: 'gancho' | 'remate' }> = ({ linea, frames, color, modo }) => {
  const frame = useCurrentFrame();
  return <TextoGigante linea={linea} frameLocal={frame} frames={frames} color={color} modo={modo} />;
};

const Escena: React.FC<{ bloque: BloqueEscena; visual: VisualDato; color: string }> = ({ bloque, visual, color }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <VisualDe v={visual} frame={frame} frames={bloque.frames} color={color} bloque={bloque} />
      <Subtitulos linea={bloque.linea} frameLocal={frame} color={color} enfasis={bloque.enfasis} />
    </AbsoluteFill>
  );
};
