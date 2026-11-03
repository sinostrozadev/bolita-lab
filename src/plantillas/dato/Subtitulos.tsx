import React, { useMemo } from 'react';
import { spring, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from '../../marca/tokens';
import { normalizar, type LineaTiempo, type Palabra } from './plan';

/** Agrupa palabras en "páginas" cortas (≤4 palabras / ≤24 letras) para que quepan grandes. */
const paginar = (palabras: Palabra[]) => {
  const paginas: { desde: number; hasta: number }[] = [];
  let desde = 0;
  let letras = 0;
  for (let i = 0; i < palabras.length; i++) {
    const l = palabras[i].texto.length;
    const n = i - desde;
    const termino = /[.!?…;:]$/.test(palabras[i - 1]?.texto ?? '');
    if (n > 0 && (n >= 4 || letras + l > 24 || termino)) { paginas.push({ desde, hasta: i }); desde = i; letras = 0; }
    letras += l + 1;
  }
  paginas.push({ desde, hasta: palabras.length });
  return paginas;
};

export const indicePalabraActual = (palabras: Palabra[], t: number) => {
  let actual = -1;
  for (let i = 0; i < palabras.length; i++) if (palabras[i].inicio <= t) actual = i;
  return actual;
};

/** Subtítulos palabra a palabra en el tercio inferior, dentro de la zona segura. */
export const Subtitulos: React.FC<{ linea: LineaTiempo; frameLocal: number; color: string; enfasis?: number[] }> = ({ linea, frameLocal, color, enfasis = [] }) => {
  const { fps } = useVideoConfig();
  const t = frameLocal / fps;
  const paginas = useMemo(() => paginar(linea.palabras), [linea]);
  const actual = indicePalabraActual(linea.palabras, t);
  const idxPagina = Math.max(0, paginas.findIndex((p) => actual < p.hasta));
  const pagina = paginas[idxPagina === -1 ? paginas.length - 1 : idxPagina];
  const inicioPagina = Math.round(linea.palabras[pagina.desde].inicio * fps);
  const entrada = spring({ frame: frameLocal - Math.min(inicioPagina, frameLocal), fps, config: { damping: 14, stiffness: 220 } });
  const deriva = Math.sin(frameLocal / 38) * 4;
  const fontSize = 64;
  return (
    <div style={{ position: 'absolute', left: FORMATO.seguro.lados, right: FORMATO.seguro.lados, top: 1290, height: 260, display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{
        transform: `translateY(${deriva}px) scale(${0.94 + 0.06 * entrada})`, opacity: Math.min(1, 0.3 + entrada),
        background: 'rgba(11,11,18,0.82)', border: `2px solid ${color}44`, borderRadius: 30, padding: '20px 38px', maxWidth: 960,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 28px', boxShadow: `0 0 40px rgba(0,0,0,0.6), inset 0 0 40px ${color}10`,
        fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, lineHeight: 1.15, letterSpacing: -0.5,
      }}>
        {linea.palabras.slice(pagina.desde, pagina.hasta).map((p, k) => {
          const i = pagina.desde + k;
          const esActual = i === actual;
          const dicha = i < actual;
          const desdePalabra = frameLocal - Math.round(p.inicio * fps);
          const enf = enfasis.includes(i);
          // Pop de escala al decirse la palabra (más fuerte si es la enfatizada, que además suena con un tick).
          // El crecimiento se limita para no invadir el hueco con la palabra vecina (≈24 px).
          const anchoAprox = p.texto.length * 0.56 * fontSize;
          const amp = Math.min(enf ? 0.16 : 0.1, 26 / anchoAprox);
          const tau = desdePalabra / fps;
          // Golpe corto: sube y vuelve a 1 en 0,28 s (no se queda agrandada).
          const golpe = tau >= 0 && tau < 0.28 && (esActual || enf) ? Math.sin((Math.PI * tau) / 0.28) : 0;
          const escala = 1 + amp * golpe;
          const encendida = esActual || (enf && dicha);
          return (
            <span key={`${i}-${normalizar(p.texto)}`} style={{
              display: 'inline-block', transform: `scale(${escala}) translateY(${esActual ? -2 : 0}px)`,
              color: encendida ? color : dicha ? PALETA.tinta : PALETA.tintaSuave,
              opacity: esActual || dicha ? 1 : 0.75,
              textShadow: encendida ? `0 0 18px ${color}, 0 0 46px ${color}88` : '0 2px 8px rgba(0,0,0,0.6)',
            }}>{p.texto}</span>
          );
        })}
      </div>
    </div>
  );
};
