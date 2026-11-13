/**
 * LARGO "Torneo de bolitas" (1920 × 1080, 30 fps). Lee el plan `public/sim/<id>.json` (scripts/preparar-largo-torneo.mts)
 * y los 10 sims de carrera (60 fps: se leen cada 2 cuadros). Un solo wav para todo el video.
 *
 * Pantallas: portada (16 competidores + pregunta) → por ronda: cartel → por carrera: presentación, carrera (tablero
 * ancho a la derecha + panel en vivo con la línea de clasificación a la izquierda), resultado sobre la LLAVE →
 * votación antes de las semis (panel compartido src/marca/Votacion.tsx) → campeón (podio + confeti + votación) → cierre.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, Audio, Easing, Sequence, cancelRender, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { FORMATO_LARGO, MARCA, NEONES, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { crearAzar } from '../../lib/azar';
import { FUENTE_EMOJI, Icono } from '../carrera/Icono';
import { Bloques, TubosFondo, TubosFrente } from '../carrera/Extras';
import { AVISO_FRAMES, barrasMovil, type SimulacionCarrera } from '../carrera/tipos';
import { PanelVotacion } from '../../marca/Votacion';
import { ACCIONES } from '../../marca/votacion-texto';
import { NOMBRE_RONDA, type CarreraTorneo, type GuionTorneo, type PlanTorneo, type Ronda } from './guion';

const W = FORMATO_LARGO.ancho, H = FORMATO_LARGO.alto;
/** Panel en vivo a la izquierda; el tablero (1520 px de mundo) ocupa el resto a escala 1. */
const PANEL = 400;
const ZOOM_META = 1.3;

const usarJson = <T,>(ruta: string, etiqueta: string): T | null => {
  const [dato, setDato] = useState<T | null>(null);
  const [handle] = useState(() => delayRender(`torneo: ${etiqueta}`));
  useEffect(() => {
    let vivo = true;
    fetch(staticFile(ruta))
      .then((r) => { if (!r.ok) throw new Error(`No existe public/${ruta} (corre scripts/preparar-largo-torneo.mts)`); return r.json(); })
      .then((d: T) => { if (vivo) { setDato(d); continueRender(handle); } })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [ruta, handle]);
  return dato;
};

export const calcularMetadataTorneo: CalculateMetadataFunction<GuionTorneo> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(staticFile(`sim/${props.id}.json`));
  if (!res.ok) throw new Error(`no existe el plan de "${props.id}": corre scripts/preparar-largo-torneo.mts`);
  const plan = (await res.json()) as PlanTorneo;
  return { durationInFrames: plan.duracionFrames, props: { ...props, duracionFrames: plan.duracionFrames } };
};

// ---------------------------------------------------------------- piezas comunes

type Ctx = { g: GuionTorneo; plan: PlanTorneo };
const Fondo: React.FC<{ tinte?: string }> = ({ tinte = PALETA.neon.violeta }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, ${tinte}33 0%, ${PALETA.fondo2} 45%, ${PALETA.fondo} 100%)` }} />
);

/** Bolita con la identidad del competidor (color + bandera/emoji). */
const Bolita: React.FC<{ ctx: Ctx; i: number; tam: number; style?: React.CSSProperties; apagada?: boolean }> = ({ ctx, i, tam, style, apagada }) => {
  const color = ctx.plan.colores[i];
  return (
    <div style={{ position: 'relative', width: tam, height: tam, flex: 'none', ...style }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `radial-gradient(circle at 26% 20%, #FFFFFFCC 0, #FFFFFF55 6%, ${color} 18%, ${color} 82%)`,
        boxShadow: apagada ? 'none' : `0 0 ${tam * 0.18}px ${color}, 0 0 ${tam * 0.45}px ${color}88`,
        filter: apagada ? 'grayscale(0.85) brightness(0.55)' : undefined,
      }} />
      <Icono icono={ctx.g.participantes[i].icono} tam={tam * 0.74} fondo={color}
        style={{ position: 'absolute', left: tam * 0.13, top: tam * 0.13, filter: apagada ? 'grayscale(0.85) brightness(0.6)' : undefined }} />
    </div>
  );
};

const Nombre: React.FC<{ ctx: Ctx; i: number }> = ({ ctx, i }) => (
  <span style={{ color: ctx.plan.colores[i], textShadow: `0 0 18px ${ctx.plan.colores[i]}AA` }}>{ctx.g.participantes[i].etiqueta}</span>
);

const Marca: React.FC = () => (
  <div style={{
    position: 'absolute', right: 34, bottom: 26, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.6,
    fontFamily: TIPO.display, fontWeight: 800, fontSize: 30, color: PALETA.tinta,
  }}>
    <span style={{ width: 20, height: 20, borderRadius: '50%', background: PALETA.neon.lima, boxShadow: `0 0 12px ${PALETA.neon.lima}` }} />
    {MARCA.nombre}
  </div>
);

const lista = (nombres: React.ReactNode[]) => nombres.flatMap((n, k) => (k === 0 ? [n] : [k === nombres.length - 1 ? ' y ' : ', ', n]));

// ---------------------------------------------------------------- LA LLAVE

/** Columnas de la llave: octavos (4 grupos de 4), cuartos (2 de 4), semis (2 duelos), final + bronce. */
const COL_X = [70, 540, 1010, 1480];
const COL_W = 380;
const FILA_LLAVE = 44;
type Caja = { carrera: number; x: number; y: number; filas: number; titulo: string };
const cajasLlave = (): Caja[] => {
  const cajas: Caja[] = [];
  const top = 150;
  // octavos: 4 cajas de 4 filas
  for (let k = 0; k < 4; k++) cajas.push({ carrera: k, x: COL_X[0], y: top + k * 228, filas: 4, titulo: `GRUPO ${'ABCD'[k]}` });
  for (let k = 0; k < 2; k++) cajas.push({ carrera: 4 + k, x: COL_X[1], y: top + 114 + k * 456, filas: 4, titulo: `CUARTOS ${k + 1}` });
  for (let k = 0; k < 2; k++) cajas.push({ carrera: 6 + k, x: COL_X[2], y: top + 210 + k * 456, filas: 2, titulo: `SEMI ${k + 1}` });
  cajas.push({ carrera: 9, x: COL_X[3], y: top + 330, filas: 2, titulo: 'FINAL' });
  cajas.push({ carrera: 8, x: COL_X[3], y: top + 620, filas: 2, titulo: '3.er PUESTO' });
  return cajas;
};
const altoCaja = (c: Caja) => 40 + c.filas * FILA_LLAVE + 10;

/**
 * La llave vista DESPUÉS de la carrera `hecha` (−1 = nada corrido). Si `anima` es la carrera recién corrida, sus
 * filas se reordenan y marcan con animación (k = frame del segmento).
 */
const Llave: React.FC<{ ctx: Ctx; hecha: number; anima?: number; k?: number; foco?: number }> = ({ ctx, hecha, anima, k = 999, foco }) => {
  const { fps } = useVideoConfig();
  const { carreras } = ctx.plan;
  const cajas = cajasLlave();
  // Una carrera tiene corredores conocidos si todas sus alimentadoras ya se corrieron.
  const alimenta: Record<number, number[]> = { 4: [0, 1, 2, 3], 5: [0, 1, 2, 3], 6: [4, 5], 7: [4, 5], 8: [6, 7], 9: [6, 7] };
  const conocida = (j: number) => (alimenta[j] ?? []).every((a) => a < hecha || (a === hecha && (anima !== a || k > 70)));
  const lineas: React.ReactNode[] = [];
  const centro = (c: Caja) => c.y + altoCaja(c) / 2;
  const porCarrera = new Map(cajas.map((c) => [c.carrera, c]));
  for (const [dest, origenes] of Object.entries(alimenta)) {
    const d = porCarrera.get(Number(dest))!;
    for (const o of origenes) {
      const c = porCarrera.get(o)!;
      if (Number(dest) === 8) continue; // el bronce no se dibuja con líneas (son los perdedores)
      const x1 = c.x + COL_W, y1 = centro(c), x2 = d.x, y2 = centro(d), xm = (x1 + x2) / 2;
      const activa = o <= hecha;
      lineas.push(<path key={`${o}-${dest}`} d={`M${x1} ${y1} H${xm} V${y2} H${x2}`} fill="none" stroke={activa ? PALETA.neon.lima : '#3A3A66'} strokeWidth={activa ? 4 : 3} strokeOpacity={activa ? 0.7 : 0.8} />);
    }
  }
  return (
    <AbsoluteFill>
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>{lineas}</svg>
      {cajas.map((c) => {
        const car = carreras[c.carrera];
        const corrida = c.carrera < hecha || (c.carrera === hecha && (anima !== hecha || k >= 24));
        const visible = c.carrera <= hecha || conocida(c.carrera) || c.carrera < 4;
        const esFoco = foco === c.carrera || anima === c.carrera;
        const enAnim = anima === c.carrera;
        // orden de filas: antes de correr, el orden de salida; después, el de llegada
        const filas = corrida ? car.orden : car.corredores;
        const pulso = esFoco ? 0.5 + 0.5 * Math.sin((k / fps) * Math.PI * 2) : 0;
        return (
          <div key={c.carrera} style={{
            position: 'absolute', left: c.x, top: c.y, width: COL_W, height: altoCaja(c), boxSizing: 'border-box',
            borderRadius: 18, background: `${PALETA.fondo}EE`, padding: '6px 12px',
            border: `3px solid ${esFoco ? PALETA.neon.amarillo : c.carrera === 9 ? '#FFD34D88' : '#3A3A66'}`,
            boxShadow: esFoco ? `0 0 ${18 + 16 * pulso}px ${PALETA.neon.amarillo}88` : 'none',
            fontFamily: TIPO.display, fontWeight: 800,
          }}>
            <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 24, color: esFoco ? PALETA.neon.amarillo : PALETA.tintaSuave, letterSpacing: 1 }}>
              <span>{c.titulo}</span>
              <span style={{ fontSize: 20, opacity: 0.8 }}>{car.pasan === 2 ? 'PASAN 2' : c.carrera === 9 ? '🏆' : c.carrera === 8 ? '🥉' : 'PASA 1'}</span>
            </div>
            {Array.from({ length: c.filas }, (_, r) => {
              const i = visible ? filas[r] : undefined;
              if (i === undefined) {
                return <div key={r} style={{ height: FILA_LLAVE, display: 'flex', alignItems: 'center', gap: 12, color: '#55558A', fontSize: 28 }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', border: '3px dashed #55558A', flex: 'none' }} /> ?
                </div>;
              }
              const pasa = corrida && r < car.pasan;
              const fuera = corrida && r >= car.pasan;
              // entrada escalonada de las marcas en la caja que se anima
              const e = enAnim ? spring({ frame: k - 24 - r * 7, fps, config: { damping: 13, stiffness: 160 } }) : 1;
              const final = c.carrera === 9 && corrida && r === 0;
              return (
                <div key={r} style={{
                  height: FILA_LLAVE, display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, whiteSpace: 'nowrap',
                  color: fuera ? '#77779A' : PALETA.tinta, opacity: fuera ? 0.55 + 0.45 * (1 - e) : 1,
                  transform: pasa && enAnim ? `translateX(${8 * (1 - e)}px)` : undefined,
                }}>
                  <Bolita ctx={ctx} i={i} tam={36} apagada={fuera && e > 0.5} />
                  <span style={{ flex: 1, overflow: 'hidden', textDecoration: fuera && e > 0.5 ? 'line-through' : 'none', color: pasa ? ctx.plan.colores[i] : undefined }}>
                    {ctx.g.participantes[i].etiqueta}
                  </span>
                  {pasa && <span style={{ fontSize: 24, fontFamily: FUENTE_EMOJI, opacity: e }}>{final ? '🏆' : '✅'}</span>}
                  {fuera && <span style={{ fontSize: 22, fontFamily: FUENTE_EMOJI, opacity: e }}>❌</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- PORTADA

const Portada: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 11, stiffness: 120 } });
  // 0–6 s: título + los 16 (entran de a uno entre 1,2 y 5,2 s) + pregunta; 6,5 s → la llave vacía.
  const aLlave = interpolate(frame, [195, 215], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const salida = interpolate(frame, [dur - 10, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: salida }}>
      <Fondo tinte={PALETA.neon.amarillo} />
      <AbsoluteFill style={{ opacity: 1 - aLlave }}>
        <div style={{ position: 'absolute', top: 70, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
          <div style={{ fontSize: 132, color: PALETA.tinta, letterSpacing: -2, transform: `scale(${0.85 + 0.15 * t})`, textShadow: `0 0 40px ${PALETA.neon.amarillo}66` }}>
            🏆 {ctx.g.titulo}
          </div>
          <div style={{ fontSize: 58, color: PALETA.neon.amarillo, marginTop: 4 }}>{ctx.g.subtitulo}</div>
        </div>
        <div style={{ position: 'absolute', top: 390, left: 110, width: W - 220, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', rowGap: 34 }}>
          {ctx.g.participantes.map((_, i) => {
            const e = spring({ frame: frame - 36 - i * 7.5, fps, config: { damping: 10, stiffness: 180 } });
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: Math.min(1, e * 1.5), transform: `scale(${0.4 + 0.6 * e})` }}>
                <Bolita ctx={ctx} i={i} tam={118} />
                <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: 26, color: ctx.plan.colores[i], whiteSpace: 'nowrap' }}>{ctx.g.participantes[i].etiqueta}</div>
              </div>
            );
          })}
        </div>
        <div style={{
          position: 'absolute', bottom: 70, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 62, color: PALETA.tinta,
          opacity: interpolate(frame, [160, 175], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}>{ctx.g.pregunta ?? `¿Quién gana? Comenta tu favorito 👇`}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: aLlave }}>
        <div style={{ position: 'absolute', top: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 64, color: PALETA.tinta }}>
          LA LLAVE · <span style={{ color: PALETA.neon.amarillo }}>4 rondas, 10 carreras</span>
        </div>
        <Llave ctx={ctx} hecha={-1} k={frame} />
      </AbsoluteFill>
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CARTEL DE RONDA

const TEXTO_RONDA: Record<Ronda, string> = {
  octavos: '4 carreras de 4 · pasan las 2 primeras',
  cuartos: 'Quedan 8 · 2 carreras · pasan 2',
  semis: 'Quedan 4 · duelos 1 contra 1',
  tercero: 'Los que perdieron las semis, por el bronce',
  final: '2 bolitas · 1 campeón',
};
const Cartel: React.FC<{ ronda: Ronda; dur: number }> = ({ ronda, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 10, stiffness: 140 } });
  const op = interpolate(frame, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const color = ronda === 'final' ? '#FFD34D' : ronda === 'tercero' ? PALETA.neon.naranja : PALETA.neon.cian;
  return (
    <AbsoluteFill style={{ opacity: op, justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo tinte={color} />
      <div style={{ fontSize: 150, color, transform: `scale(${0.6 + 0.4 * e})`, letterSpacing: 2, textShadow: `0 0 50px ${color}88`, textAlign: 'center' }}>
        {ronda === 'final' ? '🏆 ' : ''}{NOMBRE_RONDA[ronda]}
      </div>
      <div style={{ fontSize: 52, color: PALETA.tinta, marginTop: 24, opacity: interpolate(frame, [12, 24], [0, 1], { extrapolateRight: 'clamp' }) }}>{TEXTO_RONDA[ronda]}</div>
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- PRESENTACIÓN DE UNA CARRERA

const Presenta: React.FC<{ ctx: Ctx; c: CarreraTorneo; dur: number }> = ({ ctx, c, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = c.corredores.length;
  const tam = n === 2 ? 300 : 220;
  const op = interpolate(frame, [dur - 6, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op, fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo />
      <div style={{ position: 'absolute', top: 60, width: W, textAlign: 'center' }}>
        <div style={{ fontSize: 44, color: PALETA.tintaSuave, letterSpacing: 3 }}>{NOMBRE_RONDA[c.ronda]}</div>
        <div style={{ fontSize: 96, color: PALETA.tinta }}>{c.nombre}</div>
      </div>
      <div style={{ position: 'absolute', top: 340, width: W, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: n === 2 ? 120 : 70 }}>
        {c.corredores.map((i, j) => {
          const e = spring({ frame: frame - 6 - j * 6, fps, config: { damping: 10, stiffness: 170 } });
          return (
            <React.Fragment key={i}>
              {n === 2 && j === 1 && <div style={{ fontSize: 110, color: PALETA.neon.amarillo, transform: `scale(${e})` }}>VS</div>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, transform: `scale(${0.3 + 0.7 * e}) translateY(${(1 - e) * 60}px)`, opacity: Math.min(1, e * 1.4) }}>
                <Bolita ctx={ctx} i={i} tam={tam} />
                <div style={{ fontSize: n === 2 ? 64 : 48, color: ctx.plan.colores[i], whiteSpace: 'nowrap', textShadow: `0 0 20px ${ctx.plan.colores[i]}88` }}>{ctx.g.participantes[i].etiqueta}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{
        position: 'absolute', bottom: 80, width: W, textAlign: 'center', fontSize: 56, color: PALETA.neon.amarillo,
        opacity: interpolate(frame, [30, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>{c.pasan === 2 ? 'Pasan las 2 primeras · ¿cuál queda fuera?' : c.ronda === 'final' ? '¿Quién se lleva la copa? 🏆' : 'Solo pasa 1 · comenta tu favorito 👇'}</div>
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- LA CARRERA (16:9)

const DESTELLO = 7;
const Tablero: React.FC<{ sim: SimulacionCarrera; cam: number; alto: number; f: number; colores: string[] }> = ({ sim, cam, alto, f, colores }) => {
  const desde = cam - 160, hasta = cam + alto + 160;
  const ancho = sim.tablero.ancho;
  const destellos = useMemo(() => {
    const m = new Map<number, { color: string; edad: number }>();
    for (let k = sim.eventos.length - 1; k >= 0; k--) {
      const ev = sim.eventos[k];
      if (ev.frame > f) continue;
      if (f - ev.frame >= DESTELLO) break;
      if ((ev.tipo !== 'clavija' && ev.tipo !== 'bumper') || ev.clavija === undefined || m.has(ev.clavija)) continue;
      m.set(ev.clavija, { color: colores[ev.bola], edad: f - ev.frame });
    }
    return m;
  }, [sim, f, colores]);
  const { metaY } = sim.tablero;
  const T = sim.tiempo?.[f] ?? f / 60;
  const cuadro = 40;
  return (
    <>
      {[0, ancho - 6].map((x) => (
        <div key={x} style={{ position: 'absolute', left: x, top: desde, width: 6, height: hasta - desde, background: `${PALETA.neon.cian}40`, boxShadow: `0 0 22px ${PALETA.neon.cian}55` }} />
      ))}
      {sim.clavijas.map((c, i) => {
        if (c.y < desde || c.y > hasta) return null;
        const d = destellos.get(i);
        if (c.tipo === 'bumper') {
          const b = d ? interpolate(f - (f - d.edad), [0, 14], [1, 0], { extrapolateRight: 'clamp' }) : 0;
          const rr = c.r * (1 + 0.25 * b);
          const col = d ? d.color : PALETA.neon.magenta;
          return <div key={i} style={{
            position: 'absolute', left: c.x - rr, top: c.y - rr, width: rr * 2, height: rr * 2, borderRadius: '50%', boxSizing: 'border-box',
            background: `radial-gradient(circle at 40% 35%, #FFFFFF 0, ${col} 30%, #3A0F3A 75%)`, border: `6px solid ${b > 0 ? '#FFFFFF' : PALETA.neon.amarillo}`,
            boxShadow: `0 0 ${18 + 40 * b}px ${col}, inset 0 0 12px #00000088`,
          }} />;
        }
        if (!d) return <div key={i} style={{ position: 'absolute', left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 2, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #C9C9F0 0, #7C7CAE 60%)', boxShadow: '0 0 12px rgba(157,92,255,0.45)' }} />;
        const b = interpolate(d.edad, [0, DESTELLO], [1, 0]);
        const r = c.r * (1 + 0.45 * b);
        return <div key={i} style={{ position: 'absolute', left: c.x - r, top: c.y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, #FFFFFF 0, ${d.color} 55%)`, boxShadow: `0 0 ${14 + b * 26}px ${d.color}` }} />;
      })}
      {sim.segmentos.map((s, i) => {
        if (Math.max(s.y1, s.y2) < desde || Math.min(s.y1, s.y2) > hasta) return null;
        const largo = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const ang = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
        if (s.tipo === 'trampolin') return (
          <div key={i} style={{ position: 'absolute', left: s.x1, top: s.y1 - s.grosor / 2, width: largo, height: 44, transformOrigin: `0 ${s.grosor / 2}px`, transform: `rotate(${ang}deg)` }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: largo, height: s.grosor, borderRadius: 8, background: PALETA.neon.lima, boxShadow: `0 0 20px ${PALETA.neon.lima}` }} />
            <svg width={largo} height={30} style={{ position: 'absolute', top: s.grosor }}><polyline points={Array.from({ length: 9 }, (_, k) => `${largo * (0.15 + 0.7 * k / 8)},${k % 2 ? 26 : 2}`).join(' ')} fill="none" stroke={PALETA.neon.lima} strokeOpacity={0.7} strokeWidth={4} /></svg>
          </div>
        );
        return <div key={i} style={{
          position: 'absolute', left: s.x1, top: s.y1 - s.grosor / 2, width: largo, height: s.grosor, borderRadius: s.grosor, transformOrigin: '0 50%', transform: `rotate(${ang}deg)`,
          background: `linear-gradient(90deg, ${PALETA.fondo2}, #2B2B52)`, border: `2px solid ${PALETA.neon.violeta}AA`, boxShadow: `0 0 24px ${PALETA.neon.violeta}77`,
        }} />;
      })}
      {(sim.secciones ?? []).map((sc, k) => sc.y0 > desde - 200 && sc.y0 < hasta + 200 && (
        <div key={`sc${k}`} style={{ position: 'absolute', left: 0, top: sc.y0 - 70, width: sim.tablero.ancho, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 92, letterSpacing: 6, color: `${PALETA.tinta}30`, whiteSpace: 'nowrap' }}>{sc.titulo}</div>
      ))}
      {(sim.portales ?? []).map((p, k) => [[p.ax, p.ay, 1], [p.bx, p.by, -1]].map(([x, y, sentido], j) => (y < desde - 100 || y > hasta + 100) ? null : (
        <div key={`p${k}${j}`} style={{ position: 'absolute', left: x - p.r - 10, top: y - p.r - 10, width: 2 * p.r + 20, height: 2 * p.r + 20 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: `radial-gradient(circle, #000 0, #000 35%, ${p.color}66 60%, transparent 72%)` }} />
          <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: `6px dashed ${p.color}`, boxShadow: `0 0 26px ${p.color}`, transform: `rotate(${sentido * f * 3}deg)` }} />
          <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', border: `3px solid ${p.color}AA`, transform: `rotate(${-sentido * f * 5}deg)` }} />
          <div style={{ position: 'absolute', top: -46, width: '100%', textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 26, color: p.color, whiteSpace: 'nowrap' }}>{j === 0 ? 'ENTRA' : 'SALE'}</div>
        </div>
      )))}
      {(sim.moviles ?? []).map((m, k) => (m.cy < desde - 300 || m.cy > hasta + 300) ? null : (
        <React.Fragment key={`m${k}`}>
          {barrasMovil(m, T).map(([x1, y1, x2, y2], j) => {
            const largo = Math.hypot(x2 - x1, y2 - y1), ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
            const col = m.tipo === 'molino' ? PALETA.neon.naranja : PALETA.neon.cian;
            return <div key={j} style={{
              position: 'absolute', left: x1, top: y1 - m.grosor / 2, width: largo, height: m.grosor, borderRadius: m.grosor, transformOrigin: `0 ${m.grosor / 2}px`, transform: `rotate(${ang}deg)`,
              background: `linear-gradient(180deg, #FFFFFF, ${col} 40%, ${col}AA)`, boxShadow: `0 0 22px ${col}`,
            }} />;
          })}
          {m.tipo === 'molino' && <div style={{ position: 'absolute', left: m.cx - 22, top: m.cy - 22, width: 44, height: 44, borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, #FFFFFF, ${PALETA.neon.naranja})`, boxShadow: `0 0 18px ${PALETA.neon.naranja}` }} />}
        </React.Fragment>
      ))}
      {metaY > desde - 300 && metaY < hasta + 300 && (
        <>
          <div style={{ position: 'absolute', left: 0, top: metaY - 170, width: ancho, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 120, letterSpacing: 22, color: `${PALETA.tinta}38` }}>META</div>
          <div style={{
            position: 'absolute', left: 0, top: metaY - cuadro / 2, width: ancho, height: cuadro, opacity: 0.92,
            backgroundImage: `conic-gradient(${PALETA.tinta} 25%, ${PALETA.fondo} 0 50%, ${PALETA.tinta} 0 75%, ${PALETA.fondo} 0)`, backgroundSize: `${cuadro}px ${cuadro}px`,
            boxShadow: `0 0 30px ${PALETA.tinta}88`,
          }} />
          <div style={{ position: 'absolute', left: 0, top: metaY + cuadro / 2, width: ancho, height: 700, background: `linear-gradient(180deg, ${PALETA.neon.lima}26, transparent 60%)` }} />
        </>
      )}
    </>
  );
};

const ESTELA = [2, 4, 6, 8];
const Bolas: React.FC<{ ctx: Ctx; c: CarreraTorneo; sim: SimulacionCarrera; cam: number; alto: number; esc: number; f: number; etiquetas: number }> = ({ ctx, c, sim, cam, alto, esc, f, etiquetas }) => {
  const r = sim.tablero.radioBola;
  /** Las etiquetas mantienen su tamaño en pantalla aunque la cámara se aleje. */
  const ke = Math.min(1.7, 1 / esc);
  return (
    <>
      {sim.posiciones.map((pos, b) => {
        const [x, y] = pos[f];
        const sy = y - cam;
        if (sy < -260 || sy > alto + 260) return null;
        const i = c.corredores[b];
        const color = ctx.plan.colores[i];
        let cerca = Infinity;
        sim.posiciones.forEach((o, j) => { if (j !== b) cerca = Math.min(cerca, Math.hypot(o[f][0] - x, o[f][1] - y)); });
        const opEt = etiquetas * interpolate(cerca / (2 * r), [1.5, 1.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <React.Fragment key={b}>
            {ESTELA.map((k, j) => {
              const p = pos[Math.max(0, f - k)];
              const rr = r * (0.9 - j * 0.12);
              return <div key={j} style={{ position: 'absolute', left: p[0] - rr, top: p[1] - rr, width: rr * 2, height: rr * 2, borderRadius: '50%', background: color, opacity: 0.45 - j * 0.1, filter: `blur(${1 + j}px)` }} />;
            })}
            <div style={{ position: 'absolute', left: x - r * 3, top: y - r * 3, width: r * 6, height: r * 6, borderRadius: '50%', background: `radial-gradient(circle, ${color}55 0%, ${color}1A 35%, transparent 68%)` }} />
            <Bolita ctx={ctx} i={i} tam={r * 2} style={{ position: 'absolute', left: x - r, top: y - r }} />
            {opEt > 0.01 && (
              <div style={{
                position: 'absolute', left: x, top: y - r - 46 * ke, transform: `translateX(-50%) scale(${ke})`, transformOrigin: '50% 0', height: 40, padding: '0 16px', borderRadius: 999, whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 28, color: PALETA.fondo, background: color, opacity: opEt,
                boxShadow: `0 0 14px ${color}AA`,
              }}>{ctx.g.participantes[i].etiqueta}</div>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** Panel en vivo: posiciones que se deslizan y la línea de clasificación. */
const PanelVivo: React.FC<{ ctx: Ctx; c: CarreraTorneo; sim: SimulacionCarrera; f: number }> = ({ ctx, c, sim, f }) => {
  const n = c.corredores.length;
  const FILA = 92, TOP = 250;
  const puesto = (b: number) => {
    let s = 0, k = 0;
    for (let d = 0; d <= 12; d += 2) { const ff = Math.max(0, f - d); s += sim.ranking[ff].indexOf(b); k++; }
    return s / k;
  };
  const corte = TOP + c.pasan * FILA + 4;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: PANEL, height: H, background: `linear-gradient(90deg, ${PALETA.fondo}, ${PALETA.fondo2})`, borderRight: `3px solid #2B2B52`, fontFamily: TIPO.display, fontWeight: 800 }}>
      <div style={{ position: 'absolute', top: 44, left: 30, right: 20 }}>
        <div style={{ fontSize: 28, color: PALETA.tintaSuave, letterSpacing: 2 }}>{NOMBRE_RONDA[c.ronda]}</div>
        <div style={{ fontSize: 38, color: PALETA.tinta, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.nombre}</div>
        <div style={{ fontSize: 30, color: PALETA.neon.amarillo, marginTop: 10 }}>{c.pasan === 2 ? 'PASAN 2' : c.ronda === 'final' ? 'POR LA COPA 🏆' : 'PASA 1'}</div>
      </div>
      {n > c.pasan && c.ronda !== 'final' && (
        <>
          <div style={{ position: 'absolute', left: 24, right: 24, top: corte, height: 0, borderTop: `4px dashed ${PALETA.rojo}` }} />
          <div style={{ position: 'absolute', left: 24, top: corte + 6, fontSize: 20, color: PALETA.rojo, letterSpacing: 1 }}>FUERA ↓</div>
        </>
      )}
      {sim.posiciones.map((_, b) => {
        const i = c.corredores[b];
        const p = puesto(b);
        const llego = sim.llegadas[b] >= 0 && sim.llegadas[b] <= f;
        const lugar = sim.ranking[f].indexOf(b);
        const pasa = llego && lugar < c.pasan;
        return (
          <div key={b} style={{ position: 'absolute', left: 24, right: 20, top: TOP + p * FILA + (p >= c.pasan - 0.001 && n > c.pasan ? 26 : 0), height: FILA - 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 44, fontSize: 36, color: PALETA.tintaSuave }}>{lugar + 1}.º</span>
            <Bolita ctx={ctx} i={i} tam={62} />
            <span style={{ flex: 1, fontSize: ctx.g.participantes[i].etiqueta.length > 10 ? 26 : 32, color: ctx.plan.colores[i], whiteSpace: 'nowrap', overflow: 'hidden' }}>{ctx.g.participantes[i].etiqueta}</span>
            {llego && <span style={{ fontSize: 30, fontFamily: FUENTE_EMOJI }}>{pasa ? '✅' : '❌'}</span>}
          </div>
        );
      })}
    </div>
  );
};

const Carrera169: React.FC<{ ctx: Ctx; c: CarreraTorneo }> = ({ ctx, c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sim = usarJson<SimulacionCarrera>(`sim/${c.simId}.json`, c.simId);
  const colores = useMemo(() => c.corredores.map((i) => ctx.plan.colores[i]), [c, ctx.plan.colores]);
  if (!sim) return null;
  const f = Math.min(frame * 2, sim.duracionFrames - 1);
  const kc = Math.min(frame, c.camTop.length - 1);
  const cam = c.camTop[kc], altoVis = c.camAlto[kc];
  /** Escala del mundo: 1080 px de pantalla muestran `altoVis` px de mundo (se aleja si se separan). */
  const esc = H / altoVis;
  const ANCHO_AREA = W - PANEL;
  const izq = PANEL + (ANCHO_AREA - sim.tablero.ancho * esc) / 2;
  const decisiva = sim.orden[c.pasan - 1];
  const fDec = sim.frameDecisivo ?? sim.frameGanadora;
  // Zoom a la meta en la cámara lenta, anclado en la x de la que decide.
  const z = interpolate(f, [sim.camaraLenta.desde, sim.camaraLenta.desde + 26], [1, ZOOM_META], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const ax = izq + sim.posiciones[decisiva][Math.min(fDec, sim.duracionFrames - 1)][0] * esc;
  const ay = (sim.tablero.metaY - cam) * esc;
  // Sección en la que va la líder: su rótulo arriba (2,5 s al entrar).
  const liderY = Math.max(...sim.posiciones.map((p) => p[f][1]));
  const secs = sim.secciones ?? [];
  const sec = secs.findIndex((x) => liderY >= x.y0 + 60 && liderY < x.y1);
  const entraSec = sec >= 0 ? (() => { for (let g = f; g >= 0; g -= 2) { const ly = Math.max(...sim.posiciones.map((p) => p[g][1])); if (ly < secs[sec].y0 + 60) return g; } return 0; })() : -1;
  const lenta = f >= sim.camaraLenta.desde && f <= sim.camaraLenta.hasta;
  const etiquetas = interpolate(frame, [20, 30], [0, 1], { extrapolateRight: 'clamp' }) * (lenta ? 0 : 1);
  // Aviso narrativo (frames de 60 fps).
  const aviso = (sim.avisos ?? []).filter((a) => f >= a.frame && f < a.frame + AVISO_FRAMES && a.frame < sim.camaraLenta.desde - 60).pop();
  const fin = f - fDec; // 60 fps
  const banner = spring({ frame: Math.floor((fin - 20) / 2), fps, config: { damping: 12, stiffness: 140 } });
  const clasif = c.orden.slice(0, c.pasan);
  const fuera = c.orden.slice(c.pasan);
  const textoFin = c.pasan === 2
    ? <>¡{lista(clasif.map((i) => <Nombre key={i} ctx={ctx} i={i} />))} pasan!</>
    : c.ronda === 'final' ? <>¡<Nombre ctx={ctx} i={clasif[0]} /> es campeón! 🏆</>
    : c.ronda === 'tercero' ? <>¡<Nombre ctx={ctx} i={clasif[0]} /> se queda el bronce! 🥉</>
    : <>¡<Nombre ctx={ctx} i={clasif[0]} /> elimina a <Nombre ctx={ctx} i={fuera[0]} />!</>;
  const ventaja = c.ventajaSeg !== null && c.ventajaSeg < 1.5 ? `por ${c.ventajaSeg.toFixed(2).replace('.', ',')} s` : '';
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: `${ax}px ${ay}px` }}>
        <div style={{ position: 'absolute', left: PANEL, top: 0, width: ANCHO_AREA, height: H, overflow: 'hidden', background: `radial-gradient(ellipse at 50% 30%, ${PALETA.fondo2}, #07070C)` }}>
          <div style={{ position: 'absolute', left: izq - PANEL, top: 0, width: sim.tablero.ancho, height: sim.tablero.alto, transform: `scale(${esc}) translateY(${-cam}px)`, transformOrigin: '0 0', background: `${PALETA.fondo}` }}>
            <Tablero sim={sim} cam={cam} alto={altoVis} f={f} colores={colores} />
            <TubosFondo sim={sim} cam={cam} frame={f} colores={colores} />
            <Bloques sim={sim} cam={cam} frame={f} colores={colores} />
            <Bolas ctx={ctx} c={c} sim={sim} cam={cam} alto={altoVis} esc={esc} f={f} etiquetas={etiquetas} />
            <TubosFrente sim={sim} cam={cam} />
          </div>
        </div>
      </AbsoluteFill>
      {/* Fuera de cuadro: flecha con su bandera al borde (arriba o abajo) */}
      {!lenta && sim.posiciones.map((pos, b) => {
        const [x, y] = pos[f];
        const sy = (y - cam) * esc;
        const llegada = sim.llegadas[b] >= 0 && sim.llegadas[b] <= f;
        if (llegada || (sy > -20 && sy < H + 20)) return null;
        const i = c.corredores[b];
        const arriba = sy <= -20;
        return (
          <div key={`fc${b}`} style={{ position: 'absolute', left: izq + x * esc - 40, top: arriba ? 12 : H - 92, width: 80, display: 'flex', flexDirection: arriba ? 'column' : 'column-reverse', alignItems: 'center', opacity: 0.9 }}>
            <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: 26, color: ctx.plan.colores[i] }}>{arriba ? '▲' : '▼'}</div>
            <Bolita ctx={ctx} i={i} tam={52} />
          </div>
        );
      })}
      {lenta && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 60%, transparent 40%, ${ctx.plan.colores[c.corredores[decisiva]]}44 100%)` }} />}
      <PanelVivo ctx={ctx} c={c} sim={sim} f={f} />
      {aviso && (() => {
        const k = f - aviso.frame;
        const e = spring({ frame: Math.floor(k / 2), fps, config: { damping: 12, stiffness: 190 } });
        const op = interpolate(k, [0, 8, AVISO_FRAMES - 16, AVISO_FRAMES], [0, 1, 1, 0]);
        const tubo = aviso.tubo !== undefined ? sim.tubos?.[aviso.tubo] : undefined;
        const quien = c.corredores[aviso.bola];
        const texto = aviso.tipo === 'camino'
          ? <>💥 ¡<Nombre ctx={ctx} i={quien} /> le abrió el camino a <Nombre ctx={ctx} i={c.corredores[aviso.otra!]} />!</>
          : <>{tubo?.tipo === 'atajo' ? '⚡' : '🌀'} ¡<Nombre ctx={ctx} i={quien} /> {tubo?.tipo === 'atajo' ? 'tomó el ATAJO' : 'cayó en las VUELTAS'}!</>;
        return (
          <div style={{ position: 'absolute', left: PANEL, width: W - PANEL, top: 30, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              padding: '12px 30px', borderRadius: 999, background: `${PALETA.fondo}EE`, border: `3px solid ${aviso.tipo === 'camino' ? PALETA.neon.amarillo : PALETA.neon.cian}`,
              fontFamily: TIPO.display, fontWeight: 800, fontSize: 40, color: PALETA.tinta, whiteSpace: 'nowrap', opacity: op, transform: `scale(${0.8 + 0.2 * e})`,
            }}>{texto}</div>
          </div>
        );
      })()}
      {sec >= 0 && f - entraSec < 150 && !aviso && (() => {
        const k = f - entraSec;
        const e = spring({ frame: Math.floor(k / 2), fps, config: { damping: 12, stiffness: 180 } });
        const op = interpolate(k, [0, 8, 130, 150], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div style={{ position: 'absolute', left: PANEL, width: W - PANEL, top: 30, display: 'flex', justifyContent: 'center' }}>
            <div style={{ padding: '10px 34px', borderRadius: 999, background: `${PALETA.fondo}EE`, border: `3px solid ${PALETA.neon.lima}`, fontFamily: TIPO.display, fontWeight: 800, fontSize: 44, color: PALETA.tinta, opacity: op, transform: `scale(${0.7 + 0.3 * e})`, whiteSpace: 'nowrap' }}>
              {secs[sec].titulo} <span style={{ color: PALETA.tintaSuave, fontSize: 30 }}>· sección {sec + 1} de {secs.length}</span>
            </div>
          </div>
        );
      })()}
      {fin > 20 && (
        <div style={{ position: 'absolute', left: PANEL, width: W - PANEL, top: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: Math.min(1, banner * 1.3) }}>
          <div style={{
            padding: '20px 44px', borderRadius: 30, background: `${PALETA.fondo}F0`, border: `4px solid ${PALETA.neon.amarillo}`, boxShadow: `0 0 40px ${PALETA.neon.amarillo}66`,
            fontFamily: TIPO.display, fontWeight: 800, fontSize: 64, color: PALETA.tinta, whiteSpace: 'nowrap', transform: `scale(${0.6 + 0.4 * banner})`, textAlign: 'center',
          }}>
            {textoFin}
            {ventaja && <div style={{ fontSize: 36, color: PALETA.tintaSuave, marginTop: 4 }}>{c.pasan === 2 ? `el corte se decidió ${ventaja}` : ventaja}</div>}
          </div>
        </div>
      )}
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- RESULTADO SOBRE LA LLAVE

const Resultado: React.FC<{ ctx: Ctx; k: number; dur: number }> = ({ ctx, k, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = ctx.plan.carreras[k];
  const fuera = c.orden.slice(c.pasan);
  const pasan = c.orden.slice(0, c.pasan);
  const e = spring({ frame: frame - 90, fps, config: { damping: 12, stiffness: 150 } });
  const op = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const texto = c.ronda === 'final' ? null
    : c.ronda === 'tercero' ? <>🥉 <Nombre ctx={ctx} i={pasan[0]} /> termina 3.º · <Nombre ctx={ctx} i={fuera[0]} /> 4.º</>
    : <>Eliminado{fuera.length > 1 ? 's' : ''}: {lista(fuera.map((i) => <Nombre key={i} ctx={ctx} i={i} />))}</>;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo />
      <div style={{ position: 'absolute', top: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 58, color: PALETA.tinta }}>
        {NOMBRE_RONDA[c.ronda]} · <span style={{ color: PALETA.neon.amarillo }}>{c.nombre}</span>
      </div>
      <Llave ctx={ctx} hecha={k} anima={k} k={frame} />
      {texto && (
        <div style={{ position: 'absolute', bottom: 34, width: W, display: 'flex', justifyContent: 'center', opacity: Math.min(1, e * 1.3) }}>
          <div style={{ padding: '10px 34px', borderRadius: 999, background: `${PALETA.fondo}F0`, border: `3px solid ${PALETA.rojo}`, fontFamily: TIPO.display, fontWeight: 800, fontSize: 44, color: PALETA.tinta, transform: `scale(${0.7 + 0.3 * e})`, whiteSpace: 'nowrap' }}>{texto}</div>
        </div>
      )}
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- VOTACIÓN (antes de las semis)

/** El panel compartido está dibujado en coordenadas del Short (1080 × 1920): se monta escalado en el centro. */
const PanelEscalado: React.FC<{ ctx: Ctx; frameFinal: number; ganador: number }> = ({ ctx, frameFinal, ganador }) => {
  const ids = ctx.plan.votacion;
  const ESC = 1.25;
  // centro del panel grande en coordenadas del Short ≈ (498, 1389)
  return (
    <div style={{ position: 'absolute', left: W / 2 - 498 * ESC, top: 640 - 1389 * ESC, width: 1080, height: 1920, transform: `scale(${ESC})`, transformOrigin: '0 0' }}>
      <PanelVotacion
        colores={ids.map((i) => ctx.plan.colores[i])}
        etiquetas={ids.map((i) => ctx.g.participantes[i].etiqueta)}
        acciones={[...ACCIONES]}
        iconos={(tam) => ids.map((i) => <Icono key={i} icono={ctx.g.participantes[i].icono} tam={tam * 0.8} fondo={ctx.plan.colores[i]} />)}
        frameFinal={frameFinal}
        ganador={ganador}
        grandeAntes={false}
        opacidad={1}
      />
    </div>
  );
};

const Votacion: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo tinte={PALETA.neon.magenta} />
      <div style={{ position: 'absolute', top: 70, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
        <div style={{ fontSize: 96, color: PALETA.tinta }}>QUEDAN 4</div>
        <div style={{ fontSize: 44, color: PALETA.tintaSuave }}>¿Quién gana el torneo? Vota con un botón 👇</div>
      </div>
      <PanelEscalado ctx={ctx} frameFinal={100000} ganador={0} />
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CAMPEÓN

/** Fase 1 (0–9 s): el campeón GIGANTE con su bandera, trofeo, rayos y confeti. */
const CampeonGigante: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p1 = ctx.plan.podio[0];
  const color = ctx.plan.colores[p1];
  const e = spring({ frame: frame - 4, fps, config: { damping: 9, stiffness: 70 } });
  const t = spring({ frame: frame - 30, fps, config: { damping: 10, stiffness: 120 } });
  const op = interpolate(frame, [dur - 12, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op, overflow: 'hidden' }}>
      <Fondo tinte={color} />
      {/* rayos que giran */}
      <AbsoluteFill style={{ transform: `rotate(${frame * 0.4}deg) scale(1.6)`, opacity: 0.35 * e,
        background: `repeating-conic-gradient(from 0deg at 50% 55%, ${color}55 0deg 9deg, transparent 9deg 22.5deg)` }} />
      <div style={{ position: 'absolute', left: W / 2 - 260, top: 600 - 260, transform: `scale(${0.2 + 0.8 * e}) rotate(${(1 - e) * -40}deg)` }}>
        <Bolita ctx={ctx} i={p1} tam={520} />
      </div>
      <div style={{ position: 'absolute', left: W / 2 - 110, top: 40, fontSize: 200, lineHeight: 1, transform: `translateY(${(1 - t) * -300}px) rotate(${Math.sin(frame / 9) * 6}deg)` }}>🏆</div>
      <div style={{ position: 'absolute', bottom: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, opacity: t }}>
        <div style={{ fontSize: 56, color: '#FFD34D', letterSpacing: 4 }}>CAMPEÓN DEL TORNEO</div>
        <div style={{ fontSize: 130, color, textShadow: `0 0 50px ${color}, 0 6px 0 #000`, lineHeight: 1 }}>{ctx.g.participantes[p1].etiqueta}</div>
      </div>
      <Confeti frame={frame} semilla={11} />
      <Marca />
    </AbsoluteFill>
  );
};

const Confeti: React.FC<{ frame: number; semilla: number; n?: number }> = ({ frame, semilla, n = 160 }) => {
  const piezas = useMemo(() => {
    const az = crearAzar(0xC0FFEE ^ semilla);
    return Array.from({ length: n }, (_, j) => ({
      x0: j % 2 ? -40 : W + 40, y0: 950 - az() * 200, vx: (j % 2 ? 1 : -1) * (8 + az() * 24), vy: -(20 + az() * 24),
      color: NEONES[Math.floor(az() * NEONES.length)], w: 16 + az() * 16, giro: (az() - 0.5) * 24, retraso: Math.floor(az() * 90), fase: az() * 6,
    }));
  }, [semilla, n]);
  return (
    <>
      {piezas.map((p, j) => {
        const t = frame - p.retraso;
        if (t < 0) return null;
        const x = p.x0 + p.vx * t * 0.99 ** t, y = p.y0 + p.vy * t + 0.4 * t * t;
        if (y > H + 50) return null;
        return <div key={j} style={{ position: 'absolute', left: x, top: y, width: p.w, height: p.w * 0.55, background: p.color, borderRadius: 3, transform: `rotate(${p.giro * t}deg) scaleY(${Math.cos(t * 0.25 + p.fase)})` }} />;
      })}
    </>
  );
};

/** Fase 2 (9–17 s): podio 1.º–2.º–3.º y, si el campeón estaba en la votación, "si le diste … ¡acertaste!". */
const Podio: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [p1, p2, p3] = ctx.plan.podio;
  const op = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pod = (i: number, x: number, alto: number, lugar: string, d: number) => {
    const s = spring({ frame: frame - d, fps, config: { damping: 12, stiffness: 120 } });
    return (
      <div style={{ position: 'absolute', left: x - 160, bottom: 0, width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${(1 - s) * 500}px)` }}>
        <Bolita ctx={ctx} i={i} tam={lugar === '1' ? 220 : 160} />
        <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: 40, color: ctx.plan.colores[i], margin: '10px 0', whiteSpace: 'nowrap' }}>{ctx.g.participantes[i].etiqueta}</div>
        <div style={{ width: 300, height: alto, borderRadius: '16px 16px 0 0', background: `linear-gradient(180deg, ${['#FFD34D', '#D8D8E8', '#D08A4A'][Number(lugar) - 1]}, ${PALETA.fondo2})`, display: 'flex', justifyContent: 'center', paddingTop: 10, fontFamily: TIPO.display, fontWeight: 800, fontSize: 96, color: PALETA.fondo }}>{lugar}</div>
      </div>
    );
  };
  const enVoto = ctx.plan.votacion.includes(p1);
  return (
    <AbsoluteFill style={{ opacity: op, overflow: 'hidden' }}>
      <Fondo tinte={ctx.plan.colores[p1]} />
      <div style={{ position: 'absolute', top: 30, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 72, color: PALETA.tinta }}>EL PODIO</div>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        {pod(p3, 1440, 170, '3', 10)}
        {pod(p2, 480, 240, '2', 22)}
        {pod(p1, 960, 330, '1', 36)}
      </div>
      {enVoto && frame > 60 && (
        <div style={{ position: 'absolute', inset: 0, transform: 'translateY(-380px)' }}>
          <Sequence from={60} layout="none"><PanelEscalado ctx={ctx} frameFinal={-40} ganador={ctx.plan.votacion.indexOf(p1)} /></Sequence>
        </div>
      )}
      <Confeti frame={frame + 200} semilla={23} n={80} />
      <Marca />
    </AbsoluteFill>
  );
};

/** Fase 3 (17–24 s): repaso de la llave completa. */
const Repaso: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo tinte="#FFD34D" />
      <div style={{ position: 'absolute', top: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 60, color: PALETA.tinta }}>
        ASÍ FUE EL TORNEO · <Nombre ctx={ctx} i={ctx.plan.podio[0]} /> 🏆
      </div>
      <Llave ctx={ctx} hecha={9} k={frame} foco={9} />
      <Marca />
    </AbsoluteFill>
  );
};

const Campeon: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const f1 = 270, f2 = 240;
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={f1} name="campeón gigante"><CampeonGigante ctx={ctx} dur={f1} /></Sequence>
      <Sequence from={f1} durationInFrames={f2} name="podio"><Podio ctx={ctx} dur={f2} /></Sequence>
      <Sequence from={f1 + f2} durationInFrames={dur - f1 - f2} name="repaso"><Repaso ctx={ctx} dur={dur - f1 - f2} /></Sequence>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CIERRE

const CierreTorneo: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const op = interpolate(frame, [0, 10, dur - 12, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op, fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo tinte={PALETA.neon.lima} />
      <div style={{ position: 'absolute', top: 90, left: 120, width: 900, transform: `translateX(${(1 - e) * -60}px)` }}>
        <div style={{ fontSize: 76, color: PALETA.tinta, lineHeight: 1.05 }}>¿Qué torneo hacemos ahora?</div>
        <div style={{ fontSize: 44, color: PALETA.neon.amarillo, marginTop: 24, lineHeight: 1.3 }}>Comenta: comidas, animales, equipos de fútbol, marcas… 👇</div>
        <div style={{ fontSize: 40, color: PALETA.tintaSuave, marginTop: 40, lineHeight: 1.3 }}>¿Tu {ctx.g.tema === 'países' ? 'país' : 'favorito'} llegó lejos? Cuéntanos en qué ronda quedó.</div>
      </div>
      {/* Zona libre a la derecha para la pantalla final de YouTube (video sugerido + suscribirse). */}
      <div style={{ position: 'absolute', right: 120, top: 330, width: 620, height: 350, borderRadius: 24, border: `3px dashed ${PALETA.tinta}22` }} />
      <div style={{ position: 'absolute', left: 120, bottom: 120, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 90, height: 90, borderRadius: '50%', background: PALETA.neon.lima, boxShadow: `0 0 40px ${PALETA.neon.lima}` }} />
        <div>
          <div style={{ fontSize: 60, color: PALETA.tinta }}>{MARCA.nombre}</div>
          <div style={{ fontSize: 32, color: PALETA.tintaSuave, fontFamily: TIPO.texto, fontWeight: 700 }}>{MARCA.handle} · suscríbete para el próximo torneo</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- COMPOSICIÓN

export const Torneo: React.FC<GuionTorneo> = (g) => {
  cargarFuentes();
  const plan = usarJson<PlanTorneo>(`sim/${g.id}.json`, `plan ${g.id}`);
  if (!plan) return null;
  const ctx: Ctx = { g, plan };
  return (
    <AbsoluteFill style={{ background: PALETA.fondo }}>
      <Audio src={staticFile(`audio/generado/${g.id}.wav`)} />
      {plan.segmentos.map((s, j) => (
        <Sequence key={j} from={s.desde} durationInFrames={s.dur} name={`${s.tipo}${s.carrera !== undefined ? ' ' + (s.carrera + 1) : ''}`}>
          {s.tipo === 'portada' && <Portada ctx={ctx} dur={s.dur} />}
          {s.tipo === 'ronda' && <Cartel ronda={s.ronda!} dur={s.dur} />}
          {s.tipo === 'presenta' && <Presenta ctx={ctx} c={plan.carreras[s.carrera!]} dur={s.dur} />}
          {s.tipo === 'carrera' && <Carrera169 ctx={ctx} c={plan.carreras[s.carrera!]} />}
          {s.tipo === 'resultado' && <Resultado ctx={ctx} k={s.carrera!} dur={s.dur} />}
          {s.tipo === 'votacion' && <Votacion ctx={ctx} dur={s.dur} />}
          {s.tipo === 'campeon' && <Campeon ctx={ctx} dur={s.dur} />}
          {s.tipo === 'cierre' && <CierreTorneo ctx={ctx} dur={s.dur} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- MINIATURA 1280 × 720

export const MiniaturaTorneo: React.FC<GuionTorneo> = (g) => {
  cargarFuentes();
  const plan = usarJson<PlanTorneo>(`sim/${g.id}.json`, `plan ${g.id}`);
  if (!plan) return null;
  const ctx: Ctx = { g, plan };
  // 8 bolitas de bandera cayendo por clavijas a la derecha + texto enorme a la izquierda; sin revelar al campeón.
  const muestra = [0, 4, 8, 12, 1, 5, 9, 13];
  const az = crearAzar(7);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 70% 50%, #2B2060 0%, ${PALETA.fondo} 75%)`, overflow: 'hidden' }}>
      {Array.from({ length: 40 }, (_, k) => (
        <div key={k} style={{ position: 'absolute', left: 560 + (k % 8) * 92 + (Math.floor(k / 8) % 2) * 46, top: 40 + Math.floor(k / 8) * 150, width: 18, height: 18, borderRadius: '50%', background: '#9C9CD0', boxShadow: '0 0 12px #9D5CFF88' }} />
      ))}
      {muestra.map((i, k) => (
        <Bolita key={i} ctx={ctx} i={i} tam={k < 4 ? 150 : 120} style={{ position: 'absolute', left: 600 + (k % 4) * 165 + az() * 30, top: (k < 4 ? 110 : 400) + az() * 60 }} />
      ))}
      <div style={{ position: 'absolute', left: 40, top: 60, width: 560, fontFamily: TIPO.display, fontWeight: 800, lineHeight: 0.95 }}>
        <div style={{ fontSize: 150, color: '#FFD34D', textShadow: '0 6px 0 #000, 0 0 40px #FFD34D88' }}>TORNEO</div>
        <div style={{ fontSize: 96, color: PALETA.tinta, textShadow: '0 5px 0 #000' }}>16 {g.tema.toUpperCase()}</div>
        <div style={{ display: 'inline-block', marginTop: 26, padding: '10px 22px', background: PALETA.rojo, borderRadius: 14, fontSize: 70, color: '#FFFFFF', transform: 'rotate(-3deg)' }}>¿QUIÉN GANA?</div>
      </div>
      <div style={{ position: 'absolute', right: 30, bottom: 20, fontSize: 130 }}>🏆</div>
    </AbsoluteFill>
  );
};
