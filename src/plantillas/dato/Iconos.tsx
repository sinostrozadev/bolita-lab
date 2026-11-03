import React from 'react';
import { PALETA } from '../../marca/tokens';
import type { FORMAS } from './guion';

type Forma = (typeof FORMAS)[number];
type Props = { forma: Forma; frame: number; color: string; tam: number };

/** Iconos SVG/CSS dibujados a mano (viewBox 100×100), cada uno con su micro-movimiento permanente. */
export const Icono: React.FC<Props> = ({ forma, frame, color, tam }) => {
  const f = frame;
  const brillo = { filter: `drop-shadow(0 0 ${tam * 0.05}px ${color}) drop-shadow(0 0 ${tam * 0.14}px ${color}88)` };
  const caja = (hijos: React.ReactNode) => (
    <svg width={tam} height={tam} viewBox="0 0 100 100" style={{ overflow: 'visible', ...brillo }}>{hijos}</svg>
  );
  switch (forma) {
    case 'tierra': {
      const desp = (f * 0.25) % 100;
      const continentes = (
        <g fill="#3DDC84">
          <path d="M10 30 C18 20 32 22 36 32 C40 42 30 50 24 58 C18 52 8 42 10 30Z" />
          <path d="M44 14 C56 8 70 14 66 26 C62 34 52 30 48 36 C42 30 40 20 44 14Z" />
          <path d="M52 52 C62 46 78 52 76 66 C74 80 60 88 54 76 C50 68 48 58 52 52Z" />
          <path d="M82 28 C90 26 98 32 94 42 C90 48 82 44 82 28Z" />
        </g>
      );
      return caja(
        <>
          <defs>
            <radialGradient id="mar" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#58B8FF" /><stop offset="1" stopColor="#0B3D91" /></radialGradient>
            <clipPath id="discoT"><circle cx="50" cy="50" r="42" /></clipPath>
          </defs>
          <circle cx="50" cy="50" r="42" fill="url(#mar)" />
          <g clipPath="url(#discoT)">
            <g transform={`translate(${-desp} 0)`}>{continentes}</g>
            <g transform={`translate(${100 - desp} 0)`}>{continentes}</g>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="14" />
          </g>
          <ellipse cx="36" cy="30" rx="14" ry="8" fill="#fff" opacity="0.18" transform="rotate(-30 36 30)" />
        </>,
      );
    }
    case 'luna':
      return caja(
        <>
          <defs><radialGradient id="lu" cx="35%" cy="30%" r="85%"><stop offset="0" stopColor="#F2F2EA" /><stop offset="1" stopColor="#8C8C99" /></radialGradient></defs>
          <circle cx="50" cy="50" r="42" fill="url(#lu)" />
          <circle cx="36" cy="38" r="8" fill="#6F6F7D" opacity="0.55" />
          <circle cx="62" cy="58" r="11" fill="#6F6F7D" opacity="0.5" />
          <circle cx="46" cy="70" r="5" fill="#6F6F7D" opacity="0.55" />
          <circle cx="68" cy="34" r="4" fill="#6F6F7D" opacity="0.5" />
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="10" opacity="0.5" />
        </>,
      );
    case 'sol':
      return caja(
        <>
          <defs><radialGradient id="so" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFF3A0" /><stop offset="0.7" stopColor={PALETA.neon.amarillo} /><stop offset="1" stopColor={PALETA.neon.naranja} /></radialGradient></defs>
          <g transform={`rotate(${f * 0.4} 50 50)`}>
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x="48" y="2" width="4" height={i % 2 ? 9 : 14} rx="2" fill={PALETA.neon.amarillo} transform={`rotate(${i * 30} 50 50)`} />
            ))}
          </g>
          <circle cx="50" cy="50" r={30 + Math.sin(f / 18) * 1.2} fill="url(#so)" />
        </>,
      );
    case 'corazon': {
      const c = (f % 70) / 70; // doble latido
      const latido = 1 + 0.12 * Math.exp(-Math.pow((c - 0.08) * 14, 2)) + 0.08 * Math.exp(-Math.pow((c - 0.28) * 14, 2));
      return caja(
        <g transform={`translate(50 52) scale(${latido}) translate(-50 -52)`}>
          <defs><linearGradient id="co" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF7A8A" /><stop offset="1" stopColor={PALETA.rojo} /></linearGradient></defs>
          <path d="M50 90 C8 60 4 30 22 17 C37 7 50 19 50 27 C50 19 63 7 78 17 C96 30 92 60 50 90Z" fill="url(#co)" />
          <path d="M26 28 C30 22 38 21 42 25" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.4" />
        </g>,
      );
    }
    case 'rayo': {
      const parpadeo = 0.85 + 0.15 * Math.sin(f / 5);
      return caja(
        <polygon points="58,2 18,56 45,56 36,98 82,38 55,38" fill={PALETA.neon.amarillo} stroke="#FFF7B0" strokeWidth="3" strokeLinejoin="round" opacity={parpadeo} />,
      );
    }
    case 'reloj':
      return caja(
        <>
          <circle cx="50" cy="50" r="42" fill={PALETA.fondo2} stroke={color} strokeWidth="5" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x="48.5" y="12" width="3" height={i % 3 === 0 ? 8 : 4} rx="1.5" fill={PALETA.tinta} opacity="0.8" transform={`rotate(${i * 30} 50 50)`} />
          ))}
          <line x1="50" y1="50" x2="50" y2="26" stroke={PALETA.tinta} strokeWidth="5" strokeLinecap="round" transform={`rotate(${f * 0.5} 50 50)`} />
          <line x1="50" y1="54" x2="50" y2="17" stroke={color} strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${f * 6} 50 50)`} />
          <circle cx="50" cy="50" r="4" fill={color} />
        </>,
      );
    case 'persona': {
      const resp = 1 + Math.sin(f / 20) * 0.015;
      return caja(
        <g transform={`translate(50 100) scale(${resp}) translate(-50 -100)`}>
          <defs><linearGradient id="pe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} /><stop offset="1" stopColor={PALETA.neon.violeta} /></linearGradient></defs>
          <circle cx="50" cy="24" r="16" fill="url(#pe)" />
          <path d="M20 94 C20 60 30 46 50 46 C70 46 80 60 80 94 Z" fill="url(#pe)" />
        </g>,
      );
    }
    case 'bola':
      return caja(
        <>
          <defs><radialGradient id="bo" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="0.25" stopColor={color} /><stop offset="1" stopColor={color} stopOpacity="0.75" /></radialGradient></defs>
          <circle cx="50" cy="50" r="40" fill="url(#bo)" />
          <circle cx="38" cy="36" r="8" fill="#fff" opacity="0.55" />
          <circle cx="36" cy="46" r="5" fill={PALETA.fondo} /><circle cx="60" cy="46" r="5" fill={PALETA.fondo} />
          <path d="M38 60 Q48 68 60 60" stroke={PALETA.fondo} strokeWidth="4" strokeLinecap="round" fill="none" />
        </>,
      );
  }
};
