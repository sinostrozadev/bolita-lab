import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useVideoConfig } from 'remotion';
import { FORMATO, PALETA } from '../../marca/tokens';
import type { ImagenResuelta } from './guion';

/**
 * Geometría de la imagen por forma. Todo dentro de la zona segura: la tarjeta empieza debajo de
 * la marca de agua (y ≈ 220–262) y termina antes de la franja del visual compacto y de los
 * subtítulos (y = 1290–1550).
 */
export const CAJA_IMAGEN = {
  marco: { left: FORMATO.seguro.lados, top: 290, ancho: FORMATO.ancho - FORMATO.seguro.lados * 2, alto: 600, radio: 48 },
  circulo: { left: (FORMATO.ancho - 600) / 2, top: 290, ancho: 600, alto: 600, radio: 300 },
} as const;
/** Franja del visual cuando la escena tiene imagen en marco/círculo (bajo la imagen, sobre los subtítulos). */
export const ZONA_BAJO_IMAGEN = { top: 915, alto: 365 };

const POSICION = { arriba: 'center 22%', centro: 'center center', abajo: 'center 78%' } as const;

type Props = {
  imagen: ImagenResuelta;
  frame: number;
  frames: number;
  color: string;
  /** Distinto por escena: cambia el sentido del paneo para que no todas se muevan igual. */
  variante: number;
  /** El gancho debe leerse en el frame 0: la imagen ya está casi entera desde el principio. */
  inmediata?: boolean;
};

/**
 * Foto de archivo con estilo Bolita Lab: Ken Burns (zoom 1 → 1,08 + paneo leve), viñeta oscura,
 * tinte del neón de la escena y borde con glow. Entra con un resorte (escala + opacidad) y sale
 * con corte limpio (la escena siguiente la reemplaza de golpe, sin fundido).
 * <Img> de Remotion ya espera a que cargue (delayRender interno): nada de fetch en render.
 */
export const Imagen: React.FC<Props> = ({ imagen, frame, frames, color, variante, inmediata }) => {
  const { fps } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, frames)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const zoom = 1 + 0.08 * p;
  const sentido = variante % 2 === 0 ? 1 : -1;
  // El paneo crece con el zoom: nunca se asoma el borde de la foto (margen = (zoom-1)/2 ≈ 4 %).
  const tx = sentido * 2.2 * p;
  const ty = (variante % 3 === 0 ? -1 : 1) * 1.2 * p;
  const resorte = spring({ frame, fps, config: { damping: 15, stiffness: 140 } });
  const e = inmediata ? 0.75 + 0.25 * resorte : resorte;
  const posicion = POSICION[imagen.encuadre ?? (imagen.alto > imagen.ancho * 1.1 ? 'arriba' : 'centro')];
  const respira = 0.85 + 0.15 * Math.sin(frame / 22);

  const foto = (
    <Img
      src={staticFile(imagen.src)}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: posicion,
        transform: `scale(${zoom}) translate(${tx}%, ${ty}%)`, filter: 'saturate(0.88) contrast(1.06)',
      }}
    />
  );

  if (imagen.forma === 'completa') {
    // De fondo, oscurecida: el texto gigante va encima y tiene que leerse como siempre.
    return (
      <AbsoluteFill style={{ opacity: Math.min(1, e) * 0.95, overflow: 'hidden' }}>
        {/* Las fotos nocturnas (cielo, estrellas) se perdían bajo el oscurecido: se aclaran un poco. */}
        <AbsoluteFill style={{ filter: 'brightness(1.25)' }}>{foto}</AbsoluteFill>
        <AbsoluteFill style={{ background: color, mixBlendMode: 'soft-light', opacity: 0.35 }} />
        <AbsoluteFill style={{ background: 'rgba(11,11,18,0.32)' }} />
        <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PALETA.fondo} 0%, rgba(11,11,18,0.25) 22%, rgba(11,11,18,0.25) 60%, ${PALETA.fondo} 100%)` }} />
        <AbsoluteFill style={{ background: 'radial-gradient(75% 55% at 50% 45%, transparent 35%, rgba(11,11,18,0.85) 100%)' }} />
      </AbsoluteFill>
    );
  }

  const c = CAJA_IMAGEN[imagen.forma];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: c.left, top: c.top, width: c.ancho, height: c.alto, borderRadius: c.radio,
        opacity: Math.min(1, e * 1.4), transform: `scale(${0.86 + 0.14 * e}) translateY(${(1 - e) * 40}px)`,
        // Doble glow del neón: la foto se siente parte del estilo, no un stock pegado.
        boxShadow: `0 0 ${34 * respira}px ${color}AA, 0 0 ${110 * respira}px ${color}44, 0 30px 80px rgba(0,0,0,0.7)`,
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: c.radio, overflow: 'hidden', background: PALETA.fondo2 }}>
          {foto}
          <div style={{ position: 'absolute', inset: 0, background: color, mixBlendMode: 'soft-light', opacity: 0.28 }} />
          {/* Viñeta: bordes oscuros hacia el fondo de la paleta. */}
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(${imagen.forma === 'circulo' ? '50% 50%' : '70% 75%'} at 50% 45%, transparent 50%, rgba(11,11,18,0.78) 100%)` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', background: 'linear-gradient(180deg, transparent, rgba(11,11,18,0.6))' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, borderRadius: c.radio, border: `5px solid ${color}`, opacity: 0.9 }} />
        <div style={{ position: 'absolute', inset: 12, borderRadius: Math.max(0, c.radio - 12), border: `2px solid ${color}44` }} />
      </div>
    </AbsoluteFill>
  );
};
