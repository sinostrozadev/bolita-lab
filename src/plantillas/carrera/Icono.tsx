import React from 'react';
import { PALETA, TIPO } from '../../marca/tokens';
import type { IconoCompetidor } from './guion';

/** Fuente de emoji a color (Linux: Noto Color Emoji en ~/.local/share/fonts o el sistema). */
export const FUENTE_EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// ---------- contraste (WCAG) ----------
const lineal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((k) => lineal(parseInt(h.slice(k, k + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contraste = (a: string, b: string) => {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
};

/**
 * Color del logo sobre un fondo neón: el color oficial de la marca si contrasta (≥ 3:1) y no
 * es negro/blanco puro; si no, tinta oscura o blanca, la que contraste más.
 */
export const colorSobre = (fondo: string, hexMarca?: string) => {
  if (hexMarca && !/^#(000000|ffffff)$/i.test(hexMarca) && contraste(hexMarca, fondo) >= 3) return hexMarca;
  return contraste(PALETA.fondo, fondo) >= contraste('#FFFFFF', fondo) ? PALETA.fondo : '#FFFFFF';
};

/** Más ancho que esto (ancho/alto) es un logotipo de texto; bajo TAM_MIN_LOGOTIPO px se reemplaza por su inicial. */
const ASPECTO_LOGOTIPO = 2.2;
const TAM_MIN_LOGOTIPO = 90;

/**
 * ¿Aporta algo el icono en un espacio chico junto al nombre (etiqueta)? Las iniciales y los
 * logotipos de texto (que en chico se vuelven inicial) solo repiten el nombre: "S SAMSUNG".
 */
export const iconoAportaJuntoAlNombre = (icono?: IconoCompetidor) => {
  if (!icono || icono.tipo === 'texto') return false;
  if (icono.tipo === 'marca') {
    if (!icono.svg) return false;
    const c = icono.svg.caja;
    return !c || c[2] / c[3] <= ASPECTO_LOGOTIPO;
  }
  return true;
};

/**
 * Dibuja el icono de un competidor centrado en una caja cuadrada de `tam` px.
 * `fondo` es el color sobre el que va (el neón de la bolita) para elegir el color del logo.
 */
export const Icono: React.FC<{ icono?: IconoCompetidor; tam: number; fondo: string; style?: React.CSSProperties }> = ({ icono, tam, fondo, style }) => {
  if (!icono) return null;
  const caja: React.CSSProperties = { width: tam, height: tam, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style };
  if (icono.tipo === 'marca') {
    if (!icono.svg) return null; // sin resolver (Studio sin preparar): solo la bolita
    const relleno = colorSobre(fondo, icono.svg.hex);
    const [cx, cy, cw, ch] = icono.svg.caja ?? [0, 0, 24, 24];
    const aspecto = cw / ch;
    // Logotipo de texto (p. ej. Samsung): a tamaño de bolita sería una raya ilegible → inicial.
    // En grande (final) se dibuja el logotipo completo, más ancho que la caja.
    if (aspecto > ASPECTO_LOGOTIPO && tam < TAM_MIN_LOGOTIPO) {
      return <Icono icono={{ tipo: 'texto', valor: [...icono.svg.titulo][0].toUpperCase() }} tam={tam} fondo={fondo} style={style} />;
    }
    const ancho = aspecto > ASPECTO_LOGOTIPO ? tam * 1.55 : tam;
    const sombra = relleno === PALETA.fondo ? 'rgba(255,255,255,0.35)' : 'rgba(11,11,18,0.55)';
    return (
      <div style={{ ...caja, width: ancho, marginLeft: style?.marginLeft, left: typeof style?.left === 'number' ? style.left - (ancho - tam) / 2 : style?.left }}>
        {/* viewBox recortado a la caja real del logo: todos ocupan lo mismo, tengan o no margen */}
        <svg viewBox={`${cx} ${cy} ${cw} ${ch}`} width={ancho} height={tam} style={{ overflow: 'visible', filter: `drop-shadow(0 0 ${Math.max(1, tam * 0.04)}px ${sombra})` }}>
          <path d={icono.svg.path} fill={relleno} />
        </svg>
      </div>
    );
  }
  if (icono.tipo === 'emoji') {
    // El glifo de emoji ocupa ~1 em de ancho; con lineHeight 1 queda centrado en la caja.
    return (
      <div style={{ ...caja, fontFamily: FUENTE_EMOJI, fontSize: tam, lineHeight: 1, filter: `drop-shadow(0 ${tam * 0.03}px ${tam * 0.05}px rgba(11,11,18,0.45))` }}>
        {icono.valor}
      </div>
    );
  }
  const largo = [...icono.valor].length;
  return (
    <div style={{
      ...caja, fontFamily: TIPO.display, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5,
      fontSize: tam * (largo <= 1 ? 1 : largo === 2 ? 0.72 : 0.54), color: colorSobre(fondo),
    }}>{icono.valor}</div>
  );
};
