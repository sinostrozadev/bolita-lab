import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion';
import { z } from 'zod';
import { PALETA } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { Llamado, textoLlamado } from '../../marca/Llamado';
import { semillaDesde } from '../../lib/azar';
import { GuionDato, ImagenesDato, type ImagenResuelta } from './guion';
import { FRAMES_CIERRE, estimarTiempos, planificar, type Tiempos } from './plan';
import { Fondo } from './Fondo';
import { Subtitulos } from './Subtitulos';
import { TextoGigante } from './TextoGigante';
import { DisposicionVisual, VisualDe } from './Visuales';
import { Imagen, ZONA_BAJO_IMAGEN } from './Imagen';
import { colorDe } from './util';

/** Props de la composición: el guion + lo que calcula `calculateMetadata`. */
export const PropsDato = GuionDato.extend({
  duracionFrames: z.number().optional(),
  tiempos: z.any().optional(),
  /** Fotos de Commons ya descargadas, por índice de línea (0 = gancho). Las escribe preparar-dato. */
  imagenes: ImagenesDato.optional(),
  /** Atribución de las fotos para la descripción (no se usa en el render). */
  creditos: z.string().optional(),
});
export type PropsDato = z.infer<typeof PropsDato>;

const FPS = 60;
/** Llamado a suscribirse: entra 0,5 s después del golpe del remate (o a un cuarto de él si es corto). */
const LLAMADO_RETARDO = 30;
/** Bajo el texto gigante del remate y su línea neón (≈ 1330 con foto en tarjeta), sobre la UI de YouTube. */
const LLAMADO_CENTRO_Y = 1440;

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
  const imagenes = props.imagenes ?? {};
  const n = props.escenas.length;
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
        <GanchoRemate linea={plan.gancho.linea} frames={plan.gancho.frames} color={color} modo="gancho" imagen={imagenes['0']} />
      </Sequence>
      {plan.escenas.map((b) => (
        <Sequence key={b.indiceEscena} from={b.desde} durationInFrames={b.frames}>
          <Escena bloque={b} visual={props.escenas[b.indiceEscena].visual} color={color} imagen={imagenes[String(b.indiceEscena + 1)]} />
        </Sequence>
      ))}
      <Sequence from={plan.remate.desde} durationInFrames={plan.remate.frames}>
        <GanchoRemate linea={plan.remate.linea} frames={plan.remate.frames} color={color} modo="remate" imagen={imagenes[String(n + 1)]} />
      </Sequence>
      <Llamado texto={textoLlamado('dato', props.id, props.llamado)}
        desde={plan.remate.desde + Math.min(LLAMADO_RETARDO, Math.floor(plan.remate.frames / 4))}
        hasta={plan.cierreDesde} centroY={LLAMADO_CENTRO_Y} color={color} />
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

/** Si la foto va en tarjeta (marco/círculo), el texto gigante baja para quedar debajo de ella. */
const BAJAR_TEXTO = 200;

const GanchoRemate: React.FC<{ linea: BloqueEscena['linea']; frames: number; color: string; modo: 'gancho' | 'remate'; imagen?: ImagenResuelta }> = ({ linea, frames, color, modo, imagen }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      {imagen && <Imagen imagen={imagen} frame={frame} frames={frames} color={color} variante={modo === 'gancho' ? 0 : 1} inmediata={modo === 'gancho'} />}
      <TextoGigante linea={linea} frameLocal={frame} frames={frames} color={color} modo={modo} bajar={imagen && imagen.forma !== 'completa' ? BAJAR_TEXTO : 0} />
    </AbsoluteFill>
  );
};

const Escena: React.FC<{ bloque: BloqueEscena; visual: VisualDato; color: string; imagen?: ImagenResuelta }> = ({ bloque, visual, color, imagen }) => {
  const frame = useCurrentFrame();
  const enTarjeta = !!imagen && imagen.forma !== 'completa';
  return (
    <AbsoluteFill>
      {imagen && <Imagen imagen={imagen} frame={frame} frames={bloque.frames} color={color} variante={bloque.indiceEscena + 1} />}
      <DisposicionVisual value={enTarjeta ? { ...ZONA_BAJO_IMAGEN, compacto: true } : { top: 330, alto: 900, compacto: false }}>
        <VisualDe v={visual} frame={frame} frames={bloque.frames} color={color} bloque={bloque} />
      </DisposicionVisual>
      <Subtitulos linea={bloque.linea} frameLocal={frame} color={color} enfasis={bloque.enfasis} />
    </AbsoluteFill>
  );
};
