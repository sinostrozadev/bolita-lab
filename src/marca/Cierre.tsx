import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { MARCA, PALETA, TIPO } from './tokens';
import { cargarFuentes } from './fuentes';

/**
 * Cartel de cierre (1,2 s): la bolita entra con spring, el nombre y el handle.
 * Se monta en una <Sequence> al final de cada video. Transparente al inicio para
 * que la escena de abajo siga viéndose.
 */
export const Cierre: React.FC<{ color?: string }> = ({ color = PALETA.neon.lima }) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrada = spring({ frame, fps, config: { damping: 12, stiffness: 160 } });
  const fondo = interpolate(frame, [0, 10], [0, 0.85], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: `rgba(11,11,18,${fondo})`, justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display }}>
      <div style={{ transform: `scale(${entrada})`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 160, height: 160, borderRadius: '50%', background: color, boxShadow: `0 0 60px ${color}, 0 0 120px ${color}66` }} />
        <div style={{ fontSize: 92, fontWeight: 800, color: PALETA.tinta, letterSpacing: -2 }}>{MARCA.nombre}</div>
        <div style={{ fontSize: 40, fontWeight: 700, color: PALETA.tintaSuave, fontFamily: TIPO.texto }}>{MARCA.handle} · suscríbete</div>
      </div>
    </AbsoluteFill>
  );
};
