import React from 'react';
import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from '../../marca/tokens';
import type { LineaTiempo } from './plan';
import { indicePalabraActual } from './Subtitulos';
import { tamanoPorLargo } from './util';

/**
 * Gancho y remate: la frase se ve gigante desde el primer frame y cada palabra se enciende
 * en neón cuando la voz la dice. El remate entra "de golpe" (slam) con un anillo de impacto.
 */
export const TextoGigante: React.FC<{ linea: LineaTiempo; frameLocal: number; frames: number; color: string; modo: 'gancho' | 'remate'; bajar?: number }> = ({ linea, frameLocal, frames, color, modo, bajar = 0 }) => {
  const { fps } = useVideoConfig();
  const t = frameLocal / fps;
  const actual = indicePalabraActual(linea.palabras, t);
  const fontSize = tamanoPorLargo(linea.texto, modo === 'gancho' ? 118 : 108, 76, 34);
  const salida = interpolate(frameLocal, [frames - 9, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const deriva = Math.sin(frameLocal / 45) * 6;
  const slam = modo === 'remate' ? spring({ frame: frameLocal, fps, config: { damping: 11, stiffness: 190 } }) : 1;
  const anillo = modo === 'remate' ? interpolate(frameLocal, [0, 28], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: modo === 'gancho' ? salida : 1 }}>
      {modo === 'remate' && (
        <>
          <AbsoluteFill style={{ background: color, opacity: interpolate(frameLocal, [0, 2, 14], [0, 0.35, 0], { extrapolateRight: 'clamp' }) }} />
          <div style={{ position: 'absolute', width: 300 + anillo * 1500, height: 300 + anillo * 1500, borderRadius: '50%', border: `6px solid ${color}`, opacity: (1 - anillo) * 0.8, boxShadow: `0 0 40px ${color}` }} />
        </>
      )}
      <div style={{
        width: FORMATO.ancho - FORMATO.seguro.lados * 2 - 40, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: `${fontSize * 0.08}px ${fontSize * 0.26}px`,
        transform: `translateY(${deriva - 60 + bajar}px) scale(${modo === 'remate' ? 1.5 - 0.5 * slam : 1})`,
        fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, lineHeight: 1.05, letterSpacing: -2, textAlign: 'center',
      }}>
        {linea.palabras.map((p, i) => {
          const brinco = spring({ frame: frameLocal - i * (modo === 'gancho' ? 3 : 2), fps, config: { damping: 12, stiffness: 240 } });
          // El gancho ya se lee en el primer frame: nunca parte de cero.
          const entrada = modo === 'gancho' ? 0.88 + 0.12 * brinco : brinco;
          const esActual = i === actual;
          // Pulso de la palabra que se dice; limitado por largo para no pisar a la vecina.
          const pulso = esActual ? 1 + Math.min(0.07, 0.36 / Math.max(1, p.texto.length)) * Math.sin(frameLocal / 2.5) : 1;
          return (
            <span key={i} style={{
              display: 'inline-block', transform: `translateY(${(1 - entrada) * 40}px) scale(${(0.6 + 0.4 * entrada) * pulso})`, opacity: entrada,
              color: esActual ? color : i < actual ? PALETA.tinta : PALETA.tinta,
              textShadow: esActual ? `0 0 24px ${color}, 0 0 70px ${color}99` : `0 0 30px ${color}22, 0 4px 12px rgba(0,0,0,0.7)`,
            }}>{p.texto}</span>
          );
        })}
      </div>
      {/* Línea neón de apoyo que crece bajo el texto */}
      <div style={{ position: 'absolute', top: '50%', marginTop: fontSize * 1.6 + bajar, width: interpolate(frameLocal, [4, 30], [0, 320], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }), height: 8, borderRadius: 4, background: color, boxShadow: `0 0 24px ${color}`, opacity: 0.9 }} />
    </AbsoluteFill>
  );
};
