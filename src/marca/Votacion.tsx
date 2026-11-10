import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PALETA, TIPO } from './tokens';
import { cargarFuentes } from './fuentes';
import { IconoAccion } from './IconosVoto';
import { TEXTO_ACCION, TEXTOS_VOTACION, type Accion } from './votacion-texto';

/**
 * Panel de VOTACIÓN con acciones del público, compartido por `carrera` y `colores` (formato aprobado 2026-11-10).
 * - GRANDE (primeros 4 s y, si `grandeAntes`, los 3 s antes del final): placa "VOTA POR TU FAVORITO 👇" y una fila
 *   por competidor: "[ícono] ME GUSTA → ● NOMBRE" (la acción primero; el punto/bolita pegado a su nombre, en su color).
 * - COMPACTA (el resto): franja 2×2 "[ícono] → ● NOMBRE".
 * - FINAL (40 frames después de `frameFinal`): "GANÓ NOMBRE →" / "si le diste [ícono] ME GUSTA, ¡acertaste! 🎉".
 * Zona inferior segura, sin pisar la columna de botones de YouTube (derecha). Frames de VIDEO.
 */
export const VOTO = { izq: 56, der: 940, fondo: 1580 } as const;
const ANCHO = VOTO.der - VOTO.izq;
const T_TRANSICION = 18;

/** Grande ↔ compacta: 1 = grande. Grande los primeros 4 s (y los 3 s antes del final si `grandeAntes`). */
export const tamVotacion = (frame: number, frameFinal: number, grandeAntes = true) => {
  const inicio = interpolate(frame, [240, 240 + T_TRANSICION], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const final = grandeAntes ? interpolate(frame, [frameFinal - 180, frameFinal - 180 + T_TRANSICION], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const apaga = interpolate(frame, [frameFinal + 10, frameFinal + 22], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.max(inicio, final) * apaga;
};

/** Bolita del competidor (color + ícono opcional), pegada a su nombre. */
const BolaVoto: React.FC<{ color: string; icono?: React.ReactNode; tam: number }> = ({ color, icono, tam }) => (
  <span style={{
    width: tam, height: tam, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `radial-gradient(circle at 30% 26%, #FFFFFFAA 0, ${color} 34%)`, boxShadow: `0 0 12px ${color}, 0 0 26px ${color}66`,
  }}>{icono}</span>
);

const sombra = '0 2px 0 #000, 0 0 10px #000';
const fuenteQueCabe = (t: string, max: number, px: number) => Math.min(px, max / (t.length * 0.6));

export const PanelVotacion: React.FC<{
  /** Color y nombre de cada competidor (mismo orden que `acciones`). */
  colores: string[];
  etiquetas: string[];
  acciones: Accion[];
  /** Íconos dentro de la bolita de cada competidor (carrera); ausente = bolita lisa (colores). */
  iconos?: (tam: number) => React.ReactNode[];
  /** Frame de VIDEO en que se decide el ganador. */
  frameFinal: number;
  ganador: number;
  grandeAntes?: boolean;
  /** Competidores ya eliminados (se atenúan en la franja compacta). */
  eliminados?: boolean[];
  opacidad: number;
}> = ({ colores, etiquetas, acciones, iconos, frameFinal, ganador, grandeAntes = true, eliminados, opacidad }) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = tamVotacion(frame, frameFinal, grandeAntes);
  const k = frame - frameFinal;
  const placa = { background: `${PALETA.fondo}E8`, borderRadius: 28, boxShadow: `0 0 30px 10px ${PALETA.fondo}B0` } as const;
  const icGrande = iconos?.(42), icChico = iconos?.(30);
  const n = acciones.length;

  // --- Grande ---
  const FILA = 70, GAP = 6, CAB = 60, PAD = 12;
  const altoGrande = PAD + CAB + n * FILA + (n - 1) * GAP + PAD;
  const ANCHO_ACCION = 336;
  const grande = b > 0.01 && k < 22 && (
    <div style={{
      position: 'absolute', left: VOTO.izq, top: VOTO.fondo - altoGrande, width: ANCHO, height: altoGrande, ...placa,
      border: `3px solid ${PALETA.neon.amarillo}AA`, opacity: b, transform: `scale(${0.92 + 0.08 * b})`, transformOrigin: '50% 100%',
      fontFamily: TIPO.display, fontWeight: 800, color: PALETA.tinta, boxSizing: 'border-box', padding: `${PAD}px 22px`,
    }}>
      <div style={{ height: CAB, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, letterSpacing: 1, color: PALETA.neon.amarillo, textShadow: `0 0 16px ${PALETA.neon.amarillo}88` }}>
        {TEXTOS_VOTACION.cabecera}
      </div>
      {acciones.map((a, i) => (
        <div key={i} style={{ height: FILA, marginTop: i ? GAP : 0, display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <span style={{ width: ANCHO_ACCION, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconoAccion accion={a} tam={50} />
            <span style={{ fontSize: 42, textShadow: sombra }}>{TEXTO_ACCION[a]}</span>
          </span>
          <span style={{ fontSize: 44 }}>→</span>
          <BolaVoto color={colores[i]} icono={icGrande?.[i]} tam={iconos ? 64 : 38} />
          <span style={{ flex: 1, overflow: 'hidden', fontSize: fuenteQueCabe(etiquetas[i], 340, 46), color: colores[i], textShadow: sombra }}>{etiquetas[i]}</span>
        </div>
      ))}
    </div>
  );

  // --- Compacta (2×2) ---
  const FC = 52, GC = 6, filas = Math.ceil(n / 2), altoC = filas * FC + (filas - 1) * GC;
  const celda = (ANCHO - GC) / 2;
  const compacta = b < 0.99 && k < 22 && (
    <div style={{ position: 'absolute', left: VOTO.izq, top: VOTO.fondo - altoC, width: ANCHO, height: altoC, opacity: (1 - b) * interpolate(k, [10, 22], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
      {acciones.map((a, i) => {
        const fuera = eliminados?.[i] ?? false;
        const solo = n % 2 === 1 && i === n - 1; // impar: la última va centrada
        return (
          <div key={i} style={{
            position: 'absolute', left: solo ? (ANCHO - celda) / 2 : (i % 2) * (celda + GC), top: Math.floor(i / 2) * (FC + GC), width: celda, height: FC, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 999, whiteSpace: 'nowrap', overflow: 'hidden',
            background: `${PALETA.fondo}E8`, border: `3px solid ${colores[i]}`, boxShadow: `0 0 12px ${colores[i]}55`,
            fontFamily: TIPO.display, fontWeight: 800, opacity: fuera ? 0.4 : 1,
          }}>
            <IconoAccion accion={a} tam={40} />
            <span style={{ fontSize: 32, color: PALETA.tinta }}>→</span>
            <BolaVoto color={colores[i]} icono={icChico?.[i]} tam={iconos ? 44 : 26} />
            <span style={{ flex: 1, overflow: 'hidden', fontSize: fuenteQueCabe(etiquetas[i], 250, 36), color: colores[i], textShadow: sombra, textDecoration: fuera ? 'line-through' : 'none' }}>{etiquetas[i]}</span>
          </div>
        );
      })}
    </div>
  );

  // --- Final ---
  const g = ganador;
  const f = spring({ frame: k - 40, fps, config: { damping: 12, stiffness: 150 } });
  const largo2 = `${TEXTOS_VOTACION.siLeDiste} ## ${TEXTO_ACCION[acciones[g]]}${TEXTOS_VOTACION.acertaste}`.length;
  const tam2 = Math.min(42, (ANCHO - 40) / (largo2 * 0.56));
  const final = k >= 40 && (
    <div style={{
      position: 'absolute', left: VOTO.izq, top: VOTO.fondo - 124, width: ANCHO, height: 124, ...placa, boxSizing: 'border-box',
      border: `3px solid ${colores[g]}`, boxShadow: `0 0 26px ${colores[g]}88`, opacity: Math.min(1, f), transform: `scale(${0.8 + 0.2 * f})`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      fontFamily: TIPO.display, fontWeight: 800, color: PALETA.tinta, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 44 }}>{TEXTOS_VOTACION.gano} <span style={{ color: colores[g], textShadow: `0 0 14px ${colores[g]}AA` }}>{etiquetas[g]}</span> →</span>
      <span style={{ fontSize: tam2, display: 'flex', alignItems: 'center', gap: tam2 * 0.25 }}>
        {TEXTOS_VOTACION.siLeDiste}
        <IconoAccion accion={acciones[g]} tam={tam2 * 1.1} color={colores[g]} />
        <span style={{ color: colores[g] }}>{TEXTO_ACCION[acciones[g]]}</span>
        <span style={{ marginLeft: -tam2 * 0.25 }}>{TEXTOS_VOTACION.acertaste}</span>
      </span>
    </div>
  );

  return <div style={{ position: 'absolute', inset: 0, opacity: opacidad, pointerEvents: 'none' }}>{compacta}{grande}{final}</div>;
};
