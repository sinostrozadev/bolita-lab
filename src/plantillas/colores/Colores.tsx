/**
 * Plantilla "colores" (Batalla de colores): 2–4 equipos de bolitas en una arena. No calcula física: lee
 * `public/sim/<id>.json` (precalculado por scripts/simular-colores.mts) y dibuja cada frame. El video tiene
 * cámara lenta en la victoria: `sim.mapa[frameVideo]` da el frame de simulación (fraccionario) que se muestra
 * y las posiciones se interpolan. El audio viene de `public/audio/generado/<id>.wav`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate,
  spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { EQUIPOS, FORMATO, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { Llamado, textoLlamado } from '../../marca/Llamado';
import { BloqueTexto } from '../../marca/BloqueTexto';
import {
  ACCIONES_VOTO, TEXTOS_COLORES, accionesDe, remateDe, textoAccion,
  type BolitaSim, type EventoColores, type GuionColores, type SimColores,
} from './guion';

/** Deben coincidir con scripts/simular-colores.mts. */
const FRAMES_CIERRE = 72;
const CIERRE_DESDE_S = 26;
/** Maquetación (px de 1080×1920). */
const ARRIBA_TOP = FORMATO.seguro.arriba + 58; // pregunta: 278 → ~382
const BARRA_TOP = 396;
const BARRA_ALTO = 56;
const AVISO_CENTRO_Y = 514; // "¡Cae el VERDE!" entre la barra y la arena (arena: 555 → 1415)
const GRILLA_TOP = 1430; // votación 2×2: 1430 → 1566 (UI de YouTube desde 1580)
const LLAMADO_CENTRO_Y = 1330;
const LLAMADO_ANTES = 6 * 60;
const FRAMES_AVISO = 84;
/** Final: "GANA: X" sobre la arena, la bola ganadora al centro y el remate de la votación debajo. */
const GANA_CENTRO_Y = 610;
const REMATE_CENTRO_Y = 1228;

const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

export const calcularMetadataColores: CalculateMetadataFunction<GuionColores> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(rutaSim(props.id));
  if (!res.ok) throw new Error(`no existe el sim de "${props.id}": corre scripts/preparar-colores.mts primero`);
  const sim = (await res.json()) as SimColores;
  return { durationInFrames: sim.duracionFrames, props: { ...props, duracionFrames: sim.duracionFrames } };
};

const useSim = (id: string) => {
  const [sim, setSim] = useState<SimColores | null>(null);
  const [handle] = useState(() => delayRender(`cargar sim ${id}`));
  useEffect(() => {
    let vivo = true;
    fetch(rutaSim(id))
      .then((r) => { if (!r.ok) throw new Error(`sim no encontrado: ${id}`); return r.json(); })
      .then((s: SimColores) => { if (vivo) { setSim(s); continueRender(handle); } })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [id, handle]);
  return sim;
};

const hash = (n: number) => {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const hexA = (hex: string, a: number) => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
/** Mezcla un color hex con blanco (t > 0) o negro (t < 0). */
const tono = (hex: string, t: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** Posición [x,y,r] de una bolita en el frame fraccionario `fs`, o null si no vive ahí. */
const posicion = (b: BolitaSim, fs: number): [number, number, number] | null => {
  const f0 = Math.floor(fs);
  const fin = b.muere ?? Infinity;
  if (f0 < b.nace || f0 >= fin) return null;
  const i = (f0 - b.nace) * 3;
  const u = fs - f0;
  if (u > 0 && f0 + 1 < fin && i + 5 < b.p.length) {
    return [b.p[i] + (b.p[i + 3] - b.p[i]) * u, b.p[i + 1] + (b.p[i + 4] - b.p[i + 1]) * u, b.p[i + 2] + (b.p[i + 5] - b.p[i + 2]) * u];
  }
  return [b.p[i], b.p[i + 1], b.p[i + 2]];
};

/** Primer frame de VIDEO que muestra el frame de simulación `f`. */
const videoDe = (sim: SimColores, f: number) => {
  let lo = 0, hi = sim.mapa.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sim.mapa[m] >= f) hi = m; else lo = m + 1; }
  return lo;
};

const colorEq = (sim: SimColores, e: number) => EQUIPOS[sim.equipos[e]].color;
const nombreEq = (sim: SimColores, e: number) => EQUIPOS[sim.equipos[e]].nombre;

// ---------------------------------------------------------------- piezas

const Defs: React.FC<{ sim: SimColores }> = ({ sim }) => (
  <defs>
    {sim.equipos.map((_, e) => {
      const c = colorEq(sim, e);
      return (
        <React.Fragment key={e}>
          <radialGradient id={`cuerpo-${e}`} cx="0.36" cy="0.32" r="0.75">
            <stop offset="0" stopColor={tono(c, 0.6)} />
            <stop offset="0.35" stopColor={c} />
            <stop offset="1" stopColor={tono(c, -0.45)} />
          </radialGradient>
          <radialGradient id={`brillo-${e}`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.45" stopColor={c} stopOpacity="0.45" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        </React.Fragment>
      );
    })}
    <radialGradient id="sombra" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.3" stopColor="#000" stopOpacity="0.55" />
      <stop offset="1" stopColor="#000" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="piso" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stopColor="#23233F" />
      <stop offset="0.7" stopColor={PALETA.fondo2} />
      <stop offset="1" stopColor="#07070D" />
    </radialGradient>
  </defs>
);

const Arena: React.FC<{ sim: SimColores; R: number; cerrando: number; colorBorde: string; F: number }> = ({ sim, R, cerrando, colorBorde, F }) => {
  const { cx, cy, forma } = sim.arena;
  const pulso = cerrando > 0 ? 0.5 + 0.5 * Math.sin(F / 6) : 0;
  const borde = cerrando > 0 ? PALETA.rojo : colorBorde;
  const ancho = 10 + 4 * pulso;
  const forma2 = (extra: number, props: React.SVGProps<SVGElement>) => forma === 'circulo'
    ? <circle cx={cx} cy={cy} r={R + extra} {...(props as React.SVGProps<SVGCircleElement>)} />
    : <rect x={cx - R - extra} y={cy - R - extra} width={2 * (R + extra)} height={2 * (R + extra)} rx={48} {...(props as React.SVGProps<SVGRectElement>)} />;
  return (
    <>
      {forma2(0, { fill: 'url(#piso)' })}
      {/* retícula tenue del piso */}
      {forma2(-R * 0.5, { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.035, strokeWidth: 2 })}
      {forma2(ancho * 1.6, { fill: 'none', stroke: borde, strokeOpacity: 0.18 + 0.2 * pulso, strokeWidth: ancho * 3 })}
      {forma2(ancho / 2, { fill: 'none', stroke: borde, strokeOpacity: 0.9, strokeWidth: ancho })}
    </>
  );
};

/**
 * `final` (0..1): tras la victoria las bolitas del ganador se juntan al centro en una sola grande (`rFinal`).
 */
const Bolitas: React.FC<{ sim: SimColores; fs: number; final: number; rFinal: number }> = ({ sim, fs, final, rFinal }) => {
  const vivas: { b: BolitaSim; x: number; y: number; r: number }[] = [];
  for (const b of sim.bolitas) {
    const p = posicion(b, fs);
    if (p) vivas.push({ b, x: p[0], y: p[1], r: p[2] });
  }
  if (final > 0) {
    const suma = Math.sqrt(vivas.reduce((acc, v) => acc + v.r * v.r, 0)) || 1;
    for (const v of vivas) {
      v.x += (sim.arena.cx - v.x) * final; v.y += (sim.arena.cy - v.y) * final;
      v.r += (rFinal * (v.r / suma) ** 0.35 - v.r) * final;
    }
  }
  vivas.sort((a, c) => a.r - c.r); // las grandes encima
  return (
    <>
      {/* sombras */}
      {vivas.map(({ b, x, y, r }) => <ellipse key={`s${b.id}`} cx={x + r * 0.16} cy={y + r * 0.3} rx={r * 1.12} ry={r * 1.02} fill="url(#sombra)" />)}
      {/* estelas cortas: 3 posiciones pasadas */}
      {vivas.map(({ b, r }) => [9, 6, 3].map((atras, k) => {
        const p = posicion(b, fs - atras);
        if (!p) return null;
        return <circle key={`e${b.id}-${k}`} cx={p[0]} cy={p[1]} r={r * (0.55 + 0.12 * k)} fill={colorEq(sim, b.equipo)} opacity={0.07 + 0.06 * k} />;
      }))}
      {/* halo */}
      {vivas.map(({ b, x, y, r }) => <circle key={`h${b.id}`} cx={x} cy={y} r={r * 1.7} fill={`url(#brillo-${b.equipo})`} />)}
      {/* cuerpo + reflejo */}
      {vivas.map(({ b, x, y, r }) => {
        const nueva = fs - b.nace < 6 ? 0.85 + 0.15 * ((fs - b.nace) / 6) : 1;
        const rr = r * nueva;
        return (
          <g key={`c${b.id}`}>
            <circle cx={x} cy={y} r={rr} fill={`url(#cuerpo-${b.equipo})`} stroke={tono(colorEq(sim, b.equipo), 0.35)} strokeOpacity={0.55} strokeWidth={Math.max(1.5, rr * 0.06)} />
            <ellipse cx={x - rr * 0.32} cy={y - rr * 0.38} rx={rr * 0.3} ry={rr * 0.18} fill="#ffffff" opacity={0.5} transform={`rotate(-30 ${x - rr * 0.32} ${y - rr * 0.38})`} />
          </g>
        );
      })}
    </>
  );
};

const VIDA_EFECTO: Record<string, number> = { muerte: 26, division: 16, fusion: 22 };

const Efectos: React.FC<{ sim: SimColores; fs: number; eventos: EventoColores[] }> = ({ sim, fs, eventos }) => {
  const piezas: React.ReactNode[] = [];
  for (let k = eventos.length - 1; k >= 0; k--) {
    const e = eventos[k];
    if (e.f > fs) continue;
    const edad = fs - e.f;
    if (edad > 30) break;
    const vida = VIDA_EFECTO[e.tipo];
    if (!vida || edad > vida) continue;
    const u = edad / vida;
    const c = colorEq(sim, e.equipo);
    if (e.tipo === 'fusion') {
      piezas.push(<circle key={`f${k}`} cx={e.x} cy={e.y} r={e.r * (1 + 0.9 * u)} fill="none" stroke={tono(c, 0.4)} strokeWidth={6 * (1 - u)} opacity={0.8 * (1 - u)} />);
    } else if (e.tipo === 'division') {
      const c2 = e.otro !== undefined ? colorEq(sim, e.otro) : '#ffffff';
      piezas.push(<circle key={`d${k}`} cx={e.x} cy={e.y} r={10 + 50 * u} fill="#ffffff" opacity={0.55 * (1 - u) * (1 - u)} />);
      for (let i = 0; i < 8; i++) {
        const a = hash(k * 97 + i) * Math.PI * 2, v = 60 + 120 * hash(k * 31 + i);
        const d = v * u;
        piezas.push(<line key={`d${k}-${i}`} x1={e.x + Math.cos(a) * d * 0.5} y1={e.y + Math.sin(a) * d * 0.5} x2={e.x + Math.cos(a) * d} y2={e.y + Math.sin(a) * d}
          stroke={i % 2 ? c : c2} strokeWidth={4} strokeLinecap="round" opacity={1 - u} />);
      }
    } else if (e.tipo === 'muerte') {
      piezas.push(<circle key={`m${k}`} cx={e.x} cy={e.y} r={e.r * (1 + 2.2 * u)} fill="none" stroke={c} strokeWidth={5 * (1 - u)} opacity={1 - u} />);
      for (let i = 0; i < 12; i++) {
        const a = hash(k * 13 + i * 7) * Math.PI * 2, v = 70 + 150 * hash(k * 53 + i);
        const d = v * (1 - (1 - u) * (1 - u));
        piezas.push(<circle key={`m${k}-${i}`} cx={e.x + Math.cos(a) * d} cy={e.y + Math.sin(a) * d} r={Math.max(0.5, 7 * (1 - u))} fill={i % 3 ? c : '#ffffff'} opacity={1 - u * 0.8} />);
      }
    }
  }
  return <>{piezas}</>;
};

const Marcador: React.FC<{ sim: SimColores; fs: number; lider: number; desdeLider: number; opacidad: number }> = ({ sim, fs, lider, desdeLider, opacidad }) => {
  const a0 = sim.areas[Math.min(Math.floor(fs), sim.areas.length - 1)];
  const a1 = sim.areas[Math.min(Math.floor(fs) + 1, sim.areas.length - 1)];
  const u = fs - Math.floor(fs);
  const areas = a0.map((v, e) => v + (a1[e] - v) * u);
  const total = areas.reduce((x, y) => x + y, 0) || 1;
  const ancho = FORMATO.ancho - 2 * FORMATO.seguro.lados;
  const pop = desdeLider >= 0 ? 1 + 0.25 * Math.max(0, 1 - desdeLider / 20) : 1;
  let x = 0;
  return (
    <div style={{ position: 'absolute', top: BARRA_TOP, left: FORMATO.seguro.lados, width: ancho, height: BARRA_ALTO, opacity: opacidad,
      borderRadius: 18, overflow: 'hidden', background: '#00000088', boxShadow: '0 0 0 3px #ffffff22, 0 8px 24px #000000aa', display: 'flex' }}>
      {areas.map((v, e) => {
        const w = (v / total) * ancho;
        x += w;
        if (w < 0.5) return null;
        const c = colorEq(sim, e);
        const pct = Math.round((v / total) * 100);
        const esLider = e === lider;
        return (
          <div key={e} style={{
            width: w, height: '100%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(180deg, ${tono(c, 0.25)} 0%, ${c} 55%, ${tono(c, -0.3)} 100%)`,
            borderRight: '3px solid #0B0B12', overflow: 'hidden', whiteSpace: 'nowrap',
            fontFamily: TIPO.display, fontWeight: 800, fontSize: 36, color: '#0B0B12', letterSpacing: -1,
          }}>
            {w > (esLider ? 150 : 84) ? (
              <span style={{ display: 'inline-block', transform: `scale(${esLider ? pop : 1})` }}>{esLider ? '👑 ' : ''}{pct}%</span>
            ) : w > 52 && esLider ? <span>👑</span> : null}
          </div>
        );
      })}
    </div>
  );
};

const Aviso: React.FC<{ texto: string; color: string; edad: number; fps: number; centroY: number; tam?: number }> = ({ texto, color, edad, fps, centroY, tam = 64 }) => {
  if (edad < 0 || edad > FRAMES_AVISO) return null;
  const e = spring({ frame: edad, fps, config: { damping: 10, stiffness: 220 } });
  const op = interpolate(edad, [0, 4, FRAMES_AVISO - 12, FRAMES_AVISO], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: centroY, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', opacity: op, pointerEvents: 'none' }}>
      <div style={{
        transform: `scale(${0.6 + 0.4 * e})`, padding: '8px 34px 12px', borderRadius: 999, background: '#0B0B12E6',
        border: `4px solid ${color}`, boxShadow: `0 0 30px ${hexA(color, 0.7)}`,
        fontFamily: TIPO.display, fontWeight: 800, fontSize: tam, color, letterSpacing: -1.5, whiteSpace: 'nowrap',
        textShadow: '0 3px 10px #000',
      }}>{texto}</div>
    </div>
  );
};

const Votos: React.FC<{ sim: SimColores; props: GuionColores; fs: number; opacidad: number; ganador: number | null; F: number }> = ({ sim, props, fs, opacidad, ganador, F }) => {
  const acciones = accionesDe(props);
  if (!acciones) return null;
  const a = sim.areas[Math.min(Math.floor(fs), sim.areas.length - 1)];
  const celdaW = 474, celdaH = 62, gap = 12;
  return (
    <div style={{
      position: 'absolute', top: GRILLA_TOP, left: (FORMATO.ancho - (2 * celdaW + gap)) / 2, width: 2 * celdaW + gap,
      display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap, opacity: opacidad, pointerEvents: 'none',
    }}>
      {acciones.map((acc, e) => {
        const c = colorEq(sim, e);
        const muerto = a[e] <= 0;
        const gana = ganador === e;
        const latido = gana ? 1 + 0.05 * Math.sin(F / 5) : 1;
        return (
          <div key={e} style={{
            width: celdaW, height: celdaH, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px',
            background: gana ? hexA(c, 0.28) : '#0B0B12DD', border: `3px solid ${hexA(c, muerto ? 0.3 : 0.95)}`,
            boxShadow: gana ? `0 0 28px ${c}` : `0 0 14px ${hexA(c, muerto ? 0 : 0.35)}`,
            opacity: muerto && !gana ? 0.42 : 1, transform: `scale(${latido})`,
            fontFamily: TIPO.texto, fontWeight: 800, fontSize: 30, color: PALETA.tinta, whiteSpace: 'nowrap', letterSpacing: -0.5,
          }}>
            <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', background: c, boxShadow: `0 0 10px ${c}` }} />
            <span style={{ textDecoration: muerto ? 'line-through' : 'none' }}>{ACCIONES_VOTO[acc].icono} {textoAccion(props, acc)}</span>
            <span style={{ color: PALETA.tintaSuave }}>=</span>
            <span style={{ color: c, fontFamily: TIPO.display, fontSize: 32, textDecoration: muerto ? 'line-through' : 'none' }}>{nombreEq(sim, e)}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- composición

export const Colores: React.FC<GuionColores> = (props) => {
  cargarFuentes();
  const F = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sim = useSim(props.id);

  const datos = useMemo(() => {
    if (!sim) return null;
    const efectos = sim.eventos.filter((e) => e.tipo === 'fusion' || e.tipo === 'division' || e.tipo === 'muerte');
    const lideres = sim.eventos.filter((e) => e.tipo === 'lider');
    const elim = sim.eventos.filter((e) => e.tipo === 'eliminado' && e.f < sim.victoriaFrame).map((e) => ({ e, v: videoDe(sim, e.f) }));
    const ultimaMuerte = [...sim.eventos].reverse().find((e) => e.tipo === 'eliminado') ?? null;
    return { efectos, lideres, elim, ultimaMuerte, vCierre: videoDe(sim, CIERRE_DESDE_S * sim.fps) };
  }, [sim]);
  if (!sim || !datos) return <AbsoluteFill style={{ background: PALETA.fondo }} />;

  const fs = sim.mapa[Math.min(F, sim.mapa.length - 1)];
  const f0 = Math.min(Math.floor(fs), sim.arenaR.length - 1);
  const R = sim.arenaR[f0] + (sim.arenaR[Math.min(f0 + 1, sim.arenaR.length - 1)] - sim.arenaR[f0]) * (fs - f0);
  const vV = sim.victoriaVideo;
  const enFinal = F >= vV;
  const trasV = F - vV;
  const juntar = enFinal ? spring({ frame: trasV - 20, fps, config: { damping: 14, stiffness: 60 }, durationInFrames: 60 }) : 0;
  // Cámara: acompaña el cierre de la arena (las bolitas se ven más grandes en el desenlace).
  const empuje = Math.min(1.6, Math.pow(sim.arena.r / R, 0.6));
  const cerrando = !enFinal && R < sim.arena.r - 0.5 ? 1 : 0;
  const ganadorColor = colorEq(sim, sim.ganador);

  let lider = -1, desdeLider = -1;
  for (const e of datos.lideres) if (e.f <= fs) { lider = e.equipo; desdeLider = fs - e.f; }
  {
    // La corona sigue al líder del sim (con histéresis) salvo que otro lo supere claramente ahora mismo.
    const a = sim.areas[f0];
    let max = 0; for (let e = 1; e < a.length; e++) if (a[e] > a[max]) max = e;
    const tot = a.reduce((x, y) => x + y, 0) || 1;
    if (lider >= 0 && max !== lider && (a[max] - a[lider]) / tot > 0.03) lider = max;
  }
  if (enFinal) lider = sim.ganador;

  // Cámara: en la cámara lenta, acercamiento suave hacia la última caída; luego vuelve.
  const [lentoDesde, lentoHasta] = sim.lentoVideo;
  const zoom = empuje * (1 + 0.14 * interpolate(F, [lentoDesde, lentoDesde + 40, lentoHasta, lentoHasta + 40], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => x * x * (3 - 2 * x) }));
  const enfoque = interpolate(F, [lentoDesde, lentoDesde + 40, lentoHasta, lentoHasta + 40], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const foco = datos.ultimaMuerte ? `${sim.arena.cx + (datos.ultimaMuerte.x - sim.arena.cx) * 0.5 * enfoque}px ${sim.arena.cy + (datos.ultimaMuerte.y - sim.arena.cy) * 0.5 * enfoque}px` : `${sim.arena.cx}px ${sim.arena.cy}px`;
  const lento = F >= lentoDesde && F < lentoHasta;

  const fadeCierre = interpolate(F, [durationInFrames - FRAMES_CIERRE, durationInFrames - FRAMES_CIERRE + 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = enFinal ? interpolate(trasV, [0, 3, 16], [0, 0.65, 0], { extrapolateRight: 'clamp' }) : 0;
  const tinte = enFinal ? interpolate(trasV, [0, 30], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  const cartel = enFinal ? spring({ frame: trasV - 6, fps, config: { damping: 11, stiffness: 140 } }) : 0;
  const acciones = accionesDe(props);
  const textoGana = TEXTOS_COLORES.gana.replace('{color}', nombreEq(sim, sim.ganador));
  const remate = acciones ? remateDe(props, acciones[sim.ganador]) : null;

  // Aviso del momento: "¡Cae el VERDE!" o "¡La arena se cierra!".
  let aviso: React.ReactNode = null;
  for (const { e, v } of datos.elim) if (F >= v && F - v <= FRAMES_AVISO) aviso = <Aviso key={`a${e.f}`} texto={TEXTOS_COLORES.cae.replace('{color}', nombreEq(sim, e.equipo))} color={colorEq(sim, e.equipo)} edad={F - v} fps={fps} centroY={AVISO_CENTRO_Y} />;
  if (!aviso && cerrando && F - datos.vCierre <= FRAMES_AVISO) aviso = <Aviso texto="¡La arena se cierra!" color={PALETA.rojo} edad={F - datos.vCierre} fps={fps} centroY={AVISO_CENTRO_Y} tam={54} />;

  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <Audio src={rutaAudio(props.id)} />
      {/* luz cenital + tinte del ganador al final */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 45% at 50% 51%, #2A2A52 0%, ${PALETA.fondo2} 45%, #000000 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 51%, ${hexA(ganadorColor, 0.35 * tinte)} 0%, transparent 65%)` }} />

      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: foco }}>
        <svg width={FORMATO.ancho} height={FORMATO.alto} viewBox={`0 0 ${FORMATO.ancho} ${FORMATO.alto}`}>
          <Defs sim={sim} />
          <Arena sim={sim} R={R} cerrando={cerrando} colorBorde={enFinal ? ganadorColor : '#C9C9F0'} F={F} />
          <Bolitas sim={sim} fs={fs} final={juntar} rFinal={Math.min(110, R * 0.5)} />
          <Efectos sim={sim} fs={fs} eventos={datos.efectos} />
        </svg>
      </AbsoluteFill>
      {/* barras de cine durante la cámara lenta */}
      {lento && <AbsoluteFill style={{ boxShadow: `inset 0 0 160px 40px #000000cc` }} />}
      <AbsoluteFill style={{ background: '#ffffff', opacity: flash }} />

      <Marcador sim={sim} fs={fs} lider={lider} desdeLider={enFinal ? -1 : desdeLider} opacidad={fadeCierre} />
      {aviso}

      {/* Final: GANA + remate de la votación */}
      {enFinal && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: GANA_CENTRO_Y, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', opacity: fadeCierre, pointerEvents: 'none' }}>
            <div style={{
              transform: `scale(${0.5 + 0.5 * cartel})`, padding: '8px 40px 16px', borderRadius: 40, background: '#0B0B12E8',
              border: `6px solid ${ganadorColor}`, boxShadow: `0 0 60px ${ganadorColor}, 0 10px 40px #000`,
              fontFamily: TIPO.display, fontWeight: 800, fontSize: textoGana.length > 11 ? 96 : 118, color: ganadorColor, letterSpacing: -3, whiteSpace: 'nowrap',
              textShadow: `0 0 30px ${hexA(ganadorColor, 0.8)}`,
            }}>{textoGana}</div>
          </div>
          {remate && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: REMATE_CENTRO_Y, transform: 'translateY(-50%)', display: 'flex', justifyContent: 'center', opacity: fadeCierre, pointerEvents: 'none' }}>
              <div style={{
                opacity: interpolate(trasV, [24, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                transform: `translateY(${interpolate(trasV, [24, 40], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
                maxWidth: 900, padding: '12px 30px 16px', borderRadius: 28, background: '#0B0B12E6', textAlign: 'center',
                fontFamily: TIPO.display, fontWeight: 800, fontSize: 46, lineHeight: 1.1, color: PALETA.tinta, letterSpacing: -1,
                boxShadow: '0 8px 30px #000',
              }}>{remate}</div>
            </div>
          )}
        </>
      )}

      <Llamado texto={textoLlamado('colores', props.id, props.llamado)}
        desde={Math.max(120, vV - LLAMADO_ANTES)} hasta={durationInFrames - FRAMES_CIERRE} centroY={LLAMADO_CENTRO_Y} color={PALETA.neon.lima} />

      <BloqueTexto texto={props.pregunta ?? TEXTOS_COLORES.pregunta} color={PALETA.neon.amarillo} top={ARRIBA_TOP} tam={70} opacidad={fadeCierre} />
      {acciones
        ? <Votos sim={sim} props={props} fs={fs} opacidad={fadeCierre} ganador={enFinal ? sim.ganador : null} F={F} />
        : <BloqueTexto texto={props.cta ?? TEXTOS_COLORES.cta} color={PALETA.neon.magenta} centroY={1500} tam={60} opacidad={fadeCierre} />}

      <MarcaDeAgua />
      <Sequence from={durationInFrames - FRAMES_CIERRE} durationInFrames={FRAMES_CIERRE} name="Cierre">
        <Cierre color={ganadorColor} />
      </Sequence>
    </AbsoluteFill>
  );
};
