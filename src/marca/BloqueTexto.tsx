import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from './tokens';
import { cargarFuentes } from './fuentes';

const alfa = (hex: string, a: number) => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

/**
 * Bloque de texto FIJO para bola y carrera (arriba: la mecánica o la pregunta; abajo: la intriga),
 * visible desde el frame 0 hasta el cierre, como satisfying.ba11s. Placa oscura semitransparente para
 * leerse sobre trazas o clavijas. Las palabras entran casi en su tamaño final (0,88 + 0,12·spring):
 * se leen enteras en el frame 0. Posición: `top` (borde superior) o `centroY` (centro vertical).
 */
export const BloqueTexto: React.FC<{ texto: string; color: string; top?: number; centroY?: number; tam: number; opacidad?: number }> = ({ texto, color, top, centroY, tam, opacidad = 1 }) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras = texto.split(/\s+/).filter(Boolean);
  const deriva = Math.sin(frame / 40) * 3;
  const posicion = top !== undefined
    ? { top, transform: `translateY(${deriva}px)` }
    : { top: centroY, transform: `translateY(-50%) translateY(${deriva}px)` };
  return (
    <div style={{
      position: 'absolute', left: FORMATO.seguro.lados - 20, right: FORMATO.seguro.lados - 20, ...posicion,
      display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: opacidad, pointerEvents: 'none',
    }}>
      <div style={{
        padding: '12px 26px 16px', borderRadius: 30, background: alfa(PALETA.fondo, 0.74),
        boxShadow: `0 0 22px 6px ${alfa(PALETA.fondo, 0.55)}`,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${tam * 0.04}px ${tam * 0.24}px`,
        fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize: tam, lineHeight: 1.06, letterSpacing: -1.5, textAlign: 'center', color: PALETA.tinta,
      }}>
        {palabras.map((p, i) => {
          const brinco = spring({ frame: frame - i * 2, fps, config: { damping: 12, stiffness: 240 } });
          const entrada = 0.88 + 0.12 * brinco; // nunca parte de cero: se lee en el frame 0
          return (
            <span key={i} style={{
              display: 'inline-block', transform: `translateY(${(1 - entrada) * 30}px) scale(${0.6 + 0.4 * entrada})`,
              textShadow: `0 0 22px ${alfa(color, 0.8)}, 0 3px 10px rgba(0,0,0,0.85)`,
            }}>{p}</span>
          );
        })}
      </div>
    </div>
  );
};
