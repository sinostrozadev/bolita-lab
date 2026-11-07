import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from './tokens';
import { cargarFuentes } from './fuentes';

/**
 * Llamado a suscribirse DENTRO del video: píldora oscura pequeña, centrada, en la zona segura;
 * entra en el clímax de cada plantilla y se queda hasta el <Cierre/>. Textos y campo de props
 * en `llamado-texto.ts`.
 */
export { CampoLlamado, textoLlamado, VARIANTES_LLAMADO, type PlantillaLlamado } from './llamado-texto';

/** Frames que tarda en apagarse cuando entra el cierre. */
const FRAMES_SALIDA = 10;

/**
 * Montarlo fuera de cualquier <Sequence> (usa el frame absoluto) y fuera de capas con zoom.
 * `desde`: frame en que entra; `hasta`: frame en que empieza el <Cierre/> (ahí se apaga).
 * `centroY`: centro vertical del rótulo en px de 1080×1920 (se acota a la zona segura).
 */
export const Llamado: React.FC<{ texto: string | null; desde: number; hasta: number; centroY: number; color: string }> = ({ texto, desde, hasta, centroY, color }) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!texto || frame < desde || frame >= hasta + FRAMES_SALIDA) return null;
  const k = frame - desde;
  const entrada = spring({ frame: k, fps, config: { damping: 13, stiffness: 170 } });
  const opacidad = Math.min(1, interpolate(k, [0, 8], [0, 1], { extrapolateRight: 'clamp' }))
    * interpolate(frame, [hasta, hasta + FRAMES_SALIDA], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // La bolita late suave (no hay nada estático > 0,8 s, pero sin distraer del clímax).
  const latido = 1 + 0.12 * Math.max(0, Math.sin((k / fps) * Math.PI * 1.6));
  const alto = 72;
  const { seguro } = FORMATO;
  const top = Math.max(seguro.arriba + 70, Math.min(FORMATO.alto - seguro.abajo - 60 - alto, centroY - alto / 2));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top, left: 0, right: 0, height: alto, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          height: alto, maxWidth: 760, padding: '0 30px 0 22px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 16, whiteSpace: 'nowrap',
          background: `${PALETA.fondo}D9`, border: `3px solid ${color}AA`,
          boxShadow: `0 0 18px ${color}55, 0 6px 22px rgba(0,0,0,0.55)`,
          transform: `scale(${0.82 + 0.18 * entrada})`, opacity: opacidad,
          fontFamily: TIPO.texto, fontWeight: 700, fontSize: 36, color: PALETA.tinta, letterSpacing: -0.3,
        }}>
          <span style={{
            width: 22, height: 22, flex: 'none', borderRadius: '50%', background: color,
            boxShadow: `0 0 12px ${color}`, transform: `scale(${latido})`,
          }} />
          {texto}
        </div>
      </div>
    </AbsoluteFill>
  );
};
