import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { FORMATO, PALETA } from '../../marca/tokens';
import { crearAzar } from '../../lib/azar';

/** Fondo casi negro con un degradado radial del color (muy sutil, a la deriva) y partículas lentas deterministas. */
export const Fondo: React.FC<{ color: string; semilla: number }> = ({ color, semilla }) => {
  const frame = useCurrentFrame();
  const particulas = useMemo(() => {
    const r = crearAzar(semilla);
    return Array.from({ length: 48 }, () => ({
      x: r() * FORMATO.ancho, y: r() * FORMATO.alto, radio: 2 + r() * 4.5, vel: 0.18 + r() * 0.4,
      op: 0.1 + r() * 0.28, fase: r() * Math.PI * 2, amp: 10 + r() * 30, neon: r() < 0.3,
    }));
  }, [semilla]);
  const cx = 50 + Math.sin(frame / 170) * 12;
  const cy = 36 + Math.cos(frame / 240) * 9;
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(62% 46% at ${cx}% ${cy}%, ${color}2E 0%, ${color}10 40%, transparent 72%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(55% 40% at ${100 - cx}% ${110 - cy}%, ${PALETA.fondo2} 0%, transparent 70%)` }} />
      {particulas.map((p, i) => {
        const y = (((p.y - frame * p.vel) % FORMATO.alto) + FORMATO.alto) % FORMATO.alto;
        const x = p.x + Math.sin(frame / 90 + p.fase) * p.amp;
        const op = p.op * (0.7 + 0.3 * Math.sin(frame / 25 + p.fase));
        const c = p.neon ? color : PALETA.tinta;
        return <div key={i} style={{ position: 'absolute', left: x, top: y, width: p.radio * 2, height: p.radio * 2, borderRadius: '50%', background: c, opacity: op, boxShadow: p.neon ? `0 0 ${p.radio * 4}px ${c}` : undefined }} />;
      })}
      {/* Viñeta para que el centro respire y los bordes queden oscuros */}
      <AbsoluteFill style={{ background: 'radial-gradient(70% 60% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};
