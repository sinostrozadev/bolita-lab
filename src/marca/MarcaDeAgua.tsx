import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FORMATO, MARCA, PALETA, TIPO } from './tokens';
import { cargarFuentes } from './fuentes';

/** Marca de agua discreta: siempre presente, dentro de la zona segura. */
export const MarcaDeAgua: React.FC = () => {
  cargarFuentes();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: FORMATO.seguro.arriba, right: FORMATO.seguro.lados,
        display: 'flex', alignItems: 'center', gap: 10, opacity: MARCA.marcaDeAgua.opacidad,
        fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize: MARCA.marcaDeAgua.tamano, color: PALETA.tinta, letterSpacing: 1,
      }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: PALETA.neon.lima, boxShadow: `0 0 14px ${PALETA.neon.lima}` }} />
        {MARCA.nombre}
      </div>
    </AbsoluteFill>
  );
};
