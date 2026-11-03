import React from 'react';
import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from '../../marca/tokens';
import { Icono } from './Iconos';
import { normalizar, type BloqueEscena } from './plan';
import type { VisualDato } from './guion';
import { colorDe, decimalesDe, formatear, neonSecundario, tamanoPorLargo } from './util';

type P<T extends VisualDato['tipo']> = { v: Extract<VisualDato, { tipo: T }>; frame: number; color: string; bloque: BloqueEscena };

const ANCHO = FORMATO.ancho - FORMATO.seguro.lados * 2;
/** Franja del visual: entre la marca de agua y los subtítulos. */
const ZONA = { top: 330, alto: 900 };

const Zona: React.FC<{ children: React.ReactNode; alineacion?: 'center' | 'flex-start' }> = ({ children, alineacion = 'center' }) => (
  <div style={{ position: 'absolute', left: FORMATO.seguro.lados, width: ANCHO, top: ZONA.top, height: ZONA.alto, display: 'flex', flexDirection: 'column', justifyContent: alineacion, alignItems: 'center' }}>{children}</div>
);

const resorte = (frame: number, fps: number, retraso = 0, amortiguacion = 12, rigidez = 170) =>
  spring({ frame: frame - retraso, fps, config: { damping: amortiguacion, stiffness: rigidez } });

/** Entrada en frames de cada item (segundos relativos a la escena). */
const frameEntrada = (b: BloqueEscena, i: number, fps: number) => Math.round((b.entradas[i] ?? i * 0.3) * fps);

const Etiqueta: React.FC<{ texto: string; op?: number; tam?: number; color?: string }> = ({ texto, op = 1, tam = 44, color = PALETA.tintaSuave }) => (
  <div style={{ fontFamily: TIPO.texto, fontWeight: 700, fontSize: tam, color, opacity: op, textAlign: 'center', letterSpacing: 0.5 }}>{texto}</div>
);

// ---------- cifra ----------
export const VisualCifra: React.FC<P<'cifra'>> = ({ v, frame, color, bloque }) => {
  const { fps } = useVideoConfig();
  const dur = bloque.conteo.dur;
  // El conteo arranca justo antes de que la voz diga el número y "aterriza" con un pop.
  const ini = Math.round(bloque.conteo.desde * fps);
  const p = interpolate(frame, [ini, ini + dur * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const eased = 1 - Math.pow(1 - p, 3);
  const dec = decimalesDe(v.valor);
  const actual = v.valor * eased;
  const esAnio = Number.isInteger(v.valor) && v.valor >= 1000 && v.valor <= 3000 && /^(a\. ?C\.|d\. ?C\.)?$/.test((v.sufijo ?? '').trim()); // años: sin punto de miles
  const numero = esAnio ? String(Math.round(actual)) : formatear(dec ? Math.round(actual * 10 ** dec) / 10 ** dec : Math.round(actual), dec);
  const texto = `${v.prefijo ?? ''}${numero}`;
  // Aterrizaje: oscilación amortiguada 1 → 1,08 → 0,98 → 1 (rebote mínimo, vuelve a 1).
  const tAterriza = (frame - (ini + dur * fps)) / fps;
  const rebote = tAterriza > 0 ? 1 + 0.08 * Math.exp(-7 * tAterriza) * Math.sin(2 * Math.PI * 2.4 * tAterriza) : 1;
  const destello = tAterriza > 0 ? Math.exp(-6 * tAterriza) : 0;
  const entrada = resorte(frame, fps, 0);
  const numeroFinal = `${v.prefijo ?? ''}${esAnio ? String(v.valor) : formatear(v.valor, dec)}`;
  const fontSize = Math.min(210, 600 / (numeroFinal.length * 0.6));
  const unidad = (v.sufijo ?? '').trim();
  const R = 330;
  const circ = 2 * Math.PI * R;
  return (
    <Zona>
      <div style={{ position: 'relative', width: 760, height: 760, display: 'flex', justifyContent: 'center', alignItems: 'center', transform: `scale(${entrada})` }}>
        <svg width="760" height="760" viewBox="-380 -380 760 760" style={{ position: 'absolute', filter: `drop-shadow(0 0 18px ${color})` }}>
          <circle r={R} fill="none" stroke={`${color}22`} strokeWidth="16" />
          <circle r={R} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${circ * eased} ${circ}`} transform={`rotate(${-90 + frame * 0.3})`} />
          <circle r={R - 40} fill="none" stroke={`${color}18`} strokeWidth="2" strokeDasharray="6 14" transform={`rotate(${frame * -0.6})`} />
        </svg>
        <div style={{ fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, color: PALETA.tinta, letterSpacing: -4, transform: `scale(${rebote}) translateY(${Math.sin(frame / 30) * 5}px)`, textShadow: `0 0 ${30 + 40 * destello}px ${color}, 0 0 ${80 + 80 * destello}px ${color}77`, whiteSpace: 'nowrap', textAlign: 'center', lineHeight: 1 }}>
          {texto}
          {unidad && <div style={{ fontSize: Math.max(64, fontSize * 0.4), color, marginTop: 8, letterSpacing: 0 }}>{unidad}</div>}
        </div>
      </div>
      <div style={{ marginTop: 10, maxWidth: 900 }}><Etiqueta texto={v.etiqueta} op={interpolate(frame, [6, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} /></div>
    </Zona>
  );
};

// ---------- comparar ----------
export const VisualComparar: React.FC<P<'comparar'>> = ({ v, frame, color, bloque }) => {
  const { fps } = useVideoConfig();
  const max = Math.max(...v.items.map((i) => i.valor), 1e-9);
  const n = v.items.length;
  const altoBarra = n <= 3 ? 120 : n === 4 ? 100 : 84;
  return (
    <Zona>
      <div style={{ width: ANCHO - 20, display: 'flex', flexDirection: 'column', gap: n <= 3 ? 56 : 36 }}>
        {v.items.map((it, i) => {
          const c = it.color ? colorDe(it.color, color) : i === 0 ? color : neonSecundario(color, i - 1);
          const ini = frameEntrada(bloque, i, fps);
          const e = resorte(frame, fps, ini, 18, 90);
          const frac = (it.valor / max) * e;
          // Las filas entran en cascada (80 ms entre una y otra); la barra crece cuando la voz nombra el item.
          const aparece = Math.min(1, resorte(frame, fps, Math.round(i * 0.08 * fps), 14, 200));
          const dec = decimalesDe(it.valor);
          const valor = formatear(dec ? Math.round(it.valor * Math.min(1, e) * 10 ** dec) / 10 ** dec : Math.round(it.valor * Math.min(1, e)), dec);
          return (
            <div key={i} style={{ opacity: aparece, transform: `translateX(${(1 - aparece) * -60}px)` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, marginBottom: 10 }}>
                <span style={{ fontSize: 52, color: PALETA.tinta }}>{it.etiqueta}</span>
                <span style={{ fontSize: 56, color: c, textShadow: `0 0 20px ${c}88` }}>{valor}{v.sufijo ?? ''}</span>
              </div>
              <div style={{ height: altoBarra, borderRadius: altoBarra / 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${Math.max(frac, 0.015) * 100}%`, height: '100%', borderRadius: altoBarra / 2, background: `linear-gradient(90deg, ${c}99, ${c})`, boxShadow: `0 0 36px ${c}99` }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${((frame * 1.4) % 140) - 20}%`, width: '12%', background: 'rgba(255,255,255,0.18)', transform: 'skewX(-20deg)', display: frac > 0.1 ? 'block' : 'none', mixBlendMode: 'overlay' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Zona>
  );
};

// ---------- escala ----------
export const VisualEscala: React.FC<P<'escala'>> = ({ v, frame, color, bloque }) => {
  const { fps } = useVideoConfig();
  const n = v.items.length;
  const gap = 56;
  const maxR = Math.max(...v.items.map((i) => i.radio));
  const suma = v.items.reduce((a, i) => a + i.radio * 2, 0);
  const k = Math.min(660 / (maxR * 2), (ANCHO - 20 - gap * (n - 1)) / suma);
  return (
    <Zona>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap, width: ANCHO }}>
        {v.items.map((it, i) => {
          const c = i === 0 ? color : neonSecundario(color, i - 1);
          const d = Math.max(34, it.radio * 2 * k);
          const e = resorte(frame, fps, frameEntrada(bloque, i, fps) || i * 12, 11, 150);
          const flota = Math.sin(frame / 28 + i * 1.7) * 10;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, transform: `translateY(${flota}px)` }}>
              <div style={{ width: d, height: d, borderRadius: '50%', transform: `scale(${e})`, background: `radial-gradient(circle at 34% 30%, ${c}FF 0%, ${c}CC 35%, ${c}55 100%)`, boxShadow: `0 0 ${d * 0.18}px ${c}, inset -${d * 0.08}px -${d * 0.08}px ${d * 0.2}px rgba(0,0,0,0.4)` }} />
              <div style={{ opacity: Math.min(1, e), fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize: n > 3 ? 40 : 54, color: PALETA.tinta, textAlign: 'center', whiteSpace: 'nowrap' }}>{it.etiqueta}</div>
            </div>
          );
        })}
      </div>
    </Zona>
  );
};

// ---------- lista ----------
export const VisualLista: React.FC<P<'lista'>> = ({ v, frame, color, bloque }) => {
  const { fps } = useVideoConfig();
  const n = v.items.length;
  const fontSize = n <= 4 ? 58 : 48;
  return (
    <Zona>
      <div style={{ width: ANCHO - 20, display: 'flex', flexDirection: 'column', gap: n <= 4 ? 34 : 24 }}>
        {v.items.map((it, i) => {
          const c = i === 0 ? color : neonSecundario(color, i - 1);
          const ini = frameEntrada(bloque, i, fps);
          const e = resorte(frame, fps, ini, 10, 210);
          return (
            <div key={i} style={{ opacity: Math.min(1, e * 1.5), transform: `scale(${0.6 + 0.4 * e}) translateX(${(1 - e) * 120}px) translateY(${Math.sin(frame / 30 + i) * 3}px)`, transformOrigin: 'left center', display: 'flex', alignItems: 'center', gap: 28, padding: '22px 34px', borderRadius: 36, background: 'rgba(20,20,38,0.9)', border: `3px solid ${c}`, boxShadow: `0 0 28px ${c}55` }}>
              <div style={{ minWidth: 76, height: 76, borderRadius: '50%', background: c, color: PALETA.fondo, fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize: 46, display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: `0 0 24px ${c}` }}>{i + 1}</div>
              <div style={{ fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, color: PALETA.tinta, lineHeight: 1.1 }}>{it}</div>
            </div>
          );
        })}
      </div>
    </Zona>
  );
};

// ---------- frase ----------
export const VisualFrase: React.FC<P<'frase'>> = ({ v, frame, color, bloque }) => {
  const { fps } = useVideoConfig();
  const palabras = v.texto.split(/\s+/).filter(Boolean);
  const claves = new Set((v.enfasis ?? []).flatMap((e) => e.split(/\s+/).map(normalizar)).filter(Boolean));
  const fontSize = tamanoPorLargo(v.texto, 120, 72, 30);
  // Momento en que se "enciende" cada énfasis (cuando la voz lo dice).
  const encendido = (w: string) => {
    const idx = (v.enfasis ?? []).findIndex((e) => e.split(/\s+/).map(normalizar).includes(normalizar(w)));
    return idx >= 0 ? frameEntrada(bloque, idx, fps) : 0;
  };
  return (
    <Zona>
      <div style={{ width: ANCHO - 20, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${fontSize * 0.12}px ${fontSize * 0.28}px`, fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, lineHeight: 1.05, letterSpacing: -2, textAlign: 'center' }}>
        {palabras.map((w, i) => {
          const enf = claves.has(normalizar(w));
          const e = resorte(frame, fps, i * 3, 12, 230);
          const on = enf ? resorte(frame, fps, encendido(w), 7, 300) : 0;
          const pulso = enf ? 1 + 0.12 * Math.max(0, 1 - Math.abs(1 - on)) * 1.5 : 1;
          return (
            <span key={i} style={{ display: 'inline-block', opacity: e, margin: enf ? `0 ${w.length * fontSize * 0.06}px` : 0, transform: `translateY(${(1 - e) * 50 + Math.sin(frame / 25 + i) * 3}px) scale(${(0.7 + 0.3 * e) * pulso * (enf ? 1.12 : 1)})`, color: enf && on > 0.05 ? color : PALETA.tinta, textShadow: enf && on > 0.05 ? `0 0 26px ${color}, 0 0 70px ${color}88` : '0 4px 14px rgba(0,0,0,0.7)' }}>{w}</span>
          );
        })}
      </div>
    </Zona>
  );
};

// ---------- icono ----------
export const VisualIcono: React.FC<P<'icono'>> = ({ v, frame, color }) => {
  const { fps } = useVideoConfig();
  const e = resorte(frame, fps, 0, 9, 160);
  const flota = Math.sin(frame / 32) * 14;
  // Respira: escala 1 → 1,03 → 1 en un ciclo de 2 s, en bucle.
  const respira = 1 + 0.015 * (1 - Math.cos((2 * Math.PI * frame) / (2 * fps)));
  const tam = 560;
  return (
    <Zona>
      <div style={{ position: 'relative', width: tam + 140, height: tam + 140, display: 'flex', justifyContent: 'center', alignItems: 'center', transform: `translateY(${flota}px) scale(${e * respira}) rotate(${(1 - e) * -25}deg)` }}>
        <div style={{ position: 'absolute', width: tam * 0.8, height: tam * 0.8, borderRadius: '50%', background: `radial-gradient(circle, ${color}55 0%, ${color}18 45%, transparent 70%)`, filter: 'blur(20px)', opacity: 0.8 + 0.2 * Math.sin(frame / 20) }} />
        <svg width={tam + 140} height={tam + 140} viewBox="-350 -350 700 700" style={{ position: 'absolute' }}>
          <circle r="320" fill="none" stroke={`${color}55`} strokeWidth="3" strokeDasharray="4 18" transform={`rotate(${frame * 0.5})`} />
          <circle r="270" fill="none" stroke={`${color}33`} strokeWidth="2" transform={`rotate(${-frame * 0.3})`} strokeDasharray="30 26" />
        </svg>
        <Icono forma={v.forma} frame={frame} color={color} tam={tam} />
      </div>
      {v.etiqueta && <div style={{ marginTop: 6, opacity: Math.min(1, e) }}><Etiqueta texto={v.etiqueta} tam={52} color={PALETA.tinta} /></div>}
    </Zona>
  );
};

export const VisualDe: React.FC<{ v: VisualDato; frame: number; frames: number; color: string; bloque: BloqueEscena }> = ({ v, frame, frames, color, bloque }) => {
  const salida = interpolate(frame, [frames - 8, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const comun = { frame, color, bloque };
  let cuerpo: React.ReactNode;
  switch (v.tipo) {
    case 'cifra': cuerpo = <VisualCifra v={v} {...comun} />; break;
    case 'comparar': cuerpo = <VisualComparar v={v} {...comun} />; break;
    case 'escala': cuerpo = <VisualEscala v={v} {...comun} />; break;
    case 'lista': cuerpo = <VisualLista v={v} {...comun} />; break;
    case 'frase': cuerpo = <VisualFrase v={v} {...comun} />; break;
    case 'icono': cuerpo = <VisualIcono v={v} {...comun} />; break;
  }
  return <AbsoluteFill style={{ opacity: salida, transform: `scale(${1 + (1 - salida) * 0.04})` }}>{cuerpo}</AbsoluteFill>;
};
