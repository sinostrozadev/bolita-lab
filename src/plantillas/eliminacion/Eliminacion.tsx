/**
 * LARGO "Carrera de eliminación" (1920 × 1080, 30 fps): 50 competidores, 15 carreras por fases. Lee el plan
 * `public/sim/<id>.json` (scripts/preparar-largo-eliminacion.mts) y los sims de carrera (60 fps: se leen cada 2 cuadros).
 *
 * Pantallas: portada de 5 s (los 50 + lo que está en juego, y arranca) → por fase: cartel → por carrera: presentación,
 * carrera (tablero ancho + panel en vivo con "QUEDAN N" fijo y la línea de corte), repetición en cámara lenta si el corte
 * fue apretado, resultado sobre la PARRILLA de los 50 (tachados los que caen, el contador baja) → votación antes de la
 * final → campeón + podio + parrilla final → cierre. Las piezas de pista/bolas son las del `torneo`.
 */
import React, { useMemo } from 'react';
import {
  AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
  type CalculateMetadataFunction,
} from 'remotion';
import { FORMATO_LARGO, MARCA, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { FUENTE_EMOJI, Icono } from '../carrera/Icono';
import { Bloques, TubosFondo, TubosFrente } from '../carrera/Extras';
import { AVISO_FRAMES, type SimulacionCarrera } from '../carrera/tipos';
import { PanelVotacion } from '../../marca/Votacion';
import { ACCIONES } from '../../marca/votacion-texto';
import { Bolas, Bolita, Confeti, Fondo, Marca, Nombre, Tablero, lista, usarJson } from '../torneo/Torneo';
import type { CarreraElim, GuionEliminacion, PlanEliminacion } from './guion';

const W = FORMATO_LARGO.ancho, H = FORMATO_LARGO.alto;
const PANEL = 400;
const ZOOM_META = 1.3;
const ORO = '#FFD34D';

export const calcularMetadataEliminacion: CalculateMetadataFunction<GuionEliminacion> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(staticFile(`sim/${props.id}.json`));
  if (!res.ok) throw new Error(`no existe el plan de "${props.id}": corre scripts/preparar-largo-eliminacion.mts`);
  const plan = (await res.json()) as PlanEliminacion;
  return { durationInFrames: plan.duracionFrames, props: { ...props, duracionFrames: plan.duracionFrames } };
};

type Ctx = { g: GuionEliminacion; plan: PlanEliminacion };

/** Índice de la carrera en que cae cada participante (−1: nunca). En clasificación el 7.º no cae: va al repechaje. */
const caidas = (plan: PlanEliminacion) => {
  const cae = plan.colores.map(() => -1);
  plan.carreras.forEach((c, k) => {
    if (c.fase === 5) return;
    const desde = c.fase === 0 ? c.pasan + 1 : c.pasan;
    for (const i of c.orden.slice(desde)) cae[i] = k;
  });
  return cae;
};

/** Contador grande "QUEDAN N" (anima de `de` a `a` entre los frames k0 y k1). */
const Quedan: React.FC<{ de: number; a?: number; k?: number; k0?: number; k1?: number; tam?: number; color?: string }> = ({ de, a = de, k = 0, k0 = 0, k1 = 1, tam = 72, color = ORO }) => {
  // Si no cae nadie (la final: 4 → 4), k0 = k1 y interpolate exige rango creciente: no se anima.
  const n = de === a || k1 <= k0 ? a : Math.round(interpolate(k, [k0, k1], [de, a], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const golpe = de !== a && k >= k0 && k <= k1 + 8 ? 1 + 0.08 * Math.sin(((k - k0) / 3) * Math.PI) : 1;
  return (
    <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: tam, color: PALETA.tinta, lineHeight: 1, whiteSpace: 'nowrap' }}>
      QUEDAN <span style={{ color, display: 'inline-block', transform: `scale(${golpe})`, textShadow: `0 0 30px ${color}AA` }}>{n}</span>
    </div>
  );
};

// ---------------------------------------------------------------- LA PARRILLA DE LOS 50

const COLS = 10;
const CELDA_W = 178, CELDA_H = 162;
const PAR_X = (W - COLS * CELDA_W) / 2, PAR_Y = 178;

/**
 * Los 50 en una grilla 10 × 5. `hecha`: última carrera ya corrida (−1 = ninguna). Si `anima` = hecha, los que caen en
 * ella se tachan con animación (k = frame del segmento). `foco`: corredores resaltados (la carrera que viene).
 */
const Parrilla: React.FC<{ ctx: Ctx; hecha: number; anima?: number; k?: number; foco?: number[]; entrada?: number; campeon?: number }> = ({ ctx, hecha, anima, k = 999, foco, entrada, campeon }) => {
  const { fps } = useVideoConfig();
  const cae = useMemo(() => caidas(ctx.plan), [ctx.plan]);
  const repechaje = useMemo(() => new Set(ctx.plan.carreras.find((c) => c.fase === 1)?.corredores ?? []), [ctx.plan]);
  const repK = ctx.plan.carreras.findIndex((c) => c.fase === 1);
  return (
    <AbsoluteFill>
      {ctx.g.participantes.map((p, i) => {
        const col = i % COLS, fila = Math.floor(i / COLS);
        const x = PAR_X + col * CELDA_W, y = PAR_Y + fila * CELDA_H;
        const cayo = cae[i] >= 0 && cae[i] <= hecha;
        const enAnim = cayo && anima !== undefined && cae[i] === anima;
        const e = enAnim ? spring({ frame: k - 66 - (ctx.plan.carreras[anima!].orden.indexOf(i) % 10) * 4, fps, config: { damping: 14, stiffness: 170 } }) : 1;
        const fuera = cayo && e > 0.5;
        const enFoco = foco?.includes(i);
        const alRepe = repechaje.has(i) && hecha >= 0 && hecha < repK && ctx.plan.carreras.slice(0, hecha + 1).some((c) => c.fase === 0 && c.orden[c.pasan] === i);
        const esCampeon = campeon === i;
        const ent = entrada !== undefined ? spring({ frame: entrada - i * 0.9, fps, config: { damping: 12, stiffness: 220 } }) : 1;
        const pulso = enFoco ? 0.5 + 0.5 * Math.sin((k / fps) * Math.PI * 2) : 0;
        return (
          <div key={i} style={{
            position: 'absolute', left: x + 6, top: y + 6, width: CELDA_W - 12, height: CELDA_H - 12, borderRadius: 18, boxSizing: 'border-box',
            background: esCampeon ? `${ORO}33` : enFoco ? `${PALETA.neon.amarillo}1F` : `${PALETA.fondo}CC`,
            border: `3px solid ${esCampeon ? ORO : enFoco ? PALETA.neon.amarillo : fuera ? '#2A2A48' : '#3A3A66'}`,
            boxShadow: enFoco ? `0 0 ${10 + 14 * pulso}px ${PALETA.neon.amarillo}88` : esCampeon ? `0 0 40px ${ORO}` : 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: Math.min(1, ent * 1.4), transform: `scale(${0.5 + 0.5 * ent})`,
          }}>
            <Bolita ctx={ctx} i={i} tam={86} apagada={fuera} />
            <div style={{
              fontFamily: TIPO.display, fontWeight: 800, fontSize: p.etiqueta.length > 11 ? 17 : p.etiqueta.length > 8 ? 20 : 23, whiteSpace: 'nowrap',
              color: fuera ? '#6A6A8A' : ctx.plan.colores[i], textDecoration: fuera ? 'line-through' : 'none',
            }}>{p.etiqueta}</div>
            {cayo && (
              <svg width={CELDA_W - 12} height={CELDA_H - 12} style={{ position: 'absolute', inset: 0, opacity: Math.min(1, e * 1.2) }}>
                <path d={`M30 24 L${CELDA_W - 42} ${CELDA_H - 36} M${CELDA_W - 42} 24 L30 ${CELDA_H - 36}`} stroke={PALETA.rojo} strokeWidth={8} strokeLinecap="round"
                  strokeDasharray={260} strokeDashoffset={260 * (1 - Math.min(1, e))} opacity={0.85} />
              </svg>
            )}
            {alRepe && !cayo && <div style={{ position: 'absolute', top: -12, padding: '2px 10px', borderRadius: 999, background: PALETA.neon.naranja, color: PALETA.fondo, fontFamily: TIPO.display, fontWeight: 800, fontSize: 16 }}>REPECHAJE</div>}
            {esCampeon && <div style={{ position: 'absolute', top: -30, fontSize: 44, fontFamily: FUENTE_EMOJI }}>🏆</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- PORTADA (5 s: gancho y arranque)

const Portada: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 11, stiffness: 150 } });
  const ya = spring({ frame: frame - 96, fps, config: { damping: 9, stiffness: 200 } });
  const salida = interpolate(frame, [dur - 6, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: salida }}>
      <Fondo tinte={ORO} />
      <Parrilla ctx={ctx} hecha={-1} entrada={frame - 2} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PALETA.fondo}F2 0%, ${PALETA.fondo}00 15%, ${PALETA.fondo}00 60%, ${PALETA.fondo}E6 100%)` }} />
      <div style={{ position: 'absolute', top: 22, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, transform: `scale(${0.8 + 0.2 * t})` }}>
        <span style={{ fontSize: 120, color: PALETA.tinta, textShadow: '0 6px 0 #000' }}>{ctx.g.titulo} · </span>
        <span style={{ fontSize: 120, color: ORO, textShadow: `0 6px 0 #000, 0 0 40px ${ORO}88` }}>{ctx.g.subtitulo}</span>
      </div>
      <div style={{ position: 'absolute', bottom: 40, width: W, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 60 }}>
        <Quedan de={ctx.g.participantes.length} tam={70} />
        <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: 50, color: PALETA.tinta, opacity: interpolate(frame, [30, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          {ctx.g.pregunta ?? '¿Hasta dónde llega tu país? 👇'}
        </div>
      </div>
      {frame >= 96 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ padding: '18px 60px', borderRadius: 30, background: PALETA.rojo, fontFamily: TIPO.display, fontWeight: 800, fontSize: 130, color: '#FFFFFF', transform: `scale(${0.4 + 0.6 * ya}) rotate(-3deg)`, boxShadow: '0 10px 0 #000' }}>
            ¡ARRANCA!
          </div>
        </AbsoluteFill>
      )}
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CARTEL DE FASE

const CartelFase: React.FC<{ ctx: Ctx; fase: number; dur: number }> = ({ ctx, fase, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const F = ctx.plan.fases[fase];
  const e = spring({ frame, fps, config: { damping: 10, stiffness: 140 } });
  const op = interpolate(frame, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op, justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo tinte={F.color} />
      <Quedan de={F.quedanAntes} tam={64} color={F.color} />
      <div style={{ fontSize: 160, color: F.color, transform: `scale(${0.6 + 0.4 * e})`, letterSpacing: 2, textShadow: `0 0 50px ${F.color}88`, textAlign: 'center', marginTop: 20 }}>
        {fase === 5 ? '🏆 ' : ''}{F.nombre}
      </div>
      <div style={{ fontSize: 54, color: PALETA.tinta, marginTop: 20, opacity: interpolate(frame, [12, 24], [0, 1], { extrapolateRight: 'clamp' }) }}>{F.texto}</div>
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- PRESENTACIÓN

const Presenta: React.FC<{ ctx: Ctx; c: CarreraElim; dur: number }> = ({ ctx, c, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = c.corredores.length;
  const F = ctx.plan.fases[c.fase];
  const porFila = n > 5 ? Math.ceil(n / 2) : n;
  const tam = n > 5 ? 150 : 210;
  const op = interpolate(frame, [dur - 6, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fuera = n - c.pasan - (c.fase === 0 ? 1 : 0);
  return (
    <AbsoluteFill style={{ opacity: op, fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo tinte={F.color} />
      <div style={{ position: 'absolute', top: 40, width: W, textAlign: 'center' }}>
        <div style={{ fontSize: 42, color: F.color, letterSpacing: 3 }}>{F.nombre} · QUEDAN {c.quedanAntes}</div>
        <div style={{ fontSize: 92, color: PALETA.tinta }}>{c.nombre}</div>
      </div>
      <div style={{ position: 'absolute', top: n > 5 ? 250 : 340, left: 80, width: W - 160, display: 'grid', gridTemplateColumns: `repeat(${porFila}, 1fr)`, rowGap: 30 }}>
        {c.corredores.map((i, j) => {
          const e = spring({ frame: frame - 4 - j * 3, fps, config: { damping: 10, stiffness: 190 } });
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `scale(${0.3 + 0.7 * e}) translateY(${(1 - e) * 50}px)`, opacity: Math.min(1, e * 1.4) }}>
              <Bolita ctx={ctx} i={i} tam={tam} />
              <div style={{ fontSize: n > 5 ? 34 : 46, color: ctx.plan.colores[i], whiteSpace: 'nowrap', textShadow: `0 0 20px ${ctx.plan.colores[i]}88` }}>{ctx.g.participantes[i].etiqueta}</div>
            </div>
          );
        })}
      </div>
      <div style={{
        position: 'absolute', bottom: 60, width: W, textAlign: 'center', fontSize: 54, color: PALETA.neon.amarillo,
        opacity: interpolate(frame, [24, 36], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>{c.fase === 5 ? '¿Quién se lleva la copa? 🏆' : `Pasan ${c.pasan}${c.fase === 0 ? ' · el 7.º va al repechaje' : ''} · ${fuera} quedan fuera`}</div>
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- LA CARRERA (y su repetición)

const PanelVivo: React.FC<{ ctx: Ctx; c: CarreraElim; sim: SimulacionCarrera; f: number; quedan: React.ReactNode }> = ({ ctx, c, sim, f, quedan }) => {
  const n = c.corredores.length;
  const TOP = 300;
  const FILA = Math.min(92, Math.floor((H - TOP - 40) / (n + 0.4)));
  const F = ctx.plan.fases[c.fase];
  const puesto = (b: number) => {
    let s = 0, k = 0;
    for (let d = 0; d <= 12; d += 2) { const ff = Math.max(0, f - d); s += sim.ranking[ff].indexOf(b); k++; }
    return s / k;
  };
  const corte = TOP + c.pasan * FILA + 4;
  const final = c.fase === 5;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: PANEL, height: H, background: `linear-gradient(90deg, ${PALETA.fondo}, ${PALETA.fondo2})`, borderRight: `3px solid ${F.color}55`, fontFamily: TIPO.display, fontWeight: 800 }}>
      <div style={{ position: 'absolute', top: 30, left: 26, right: 16 }}>
        {quedan}
        <div style={{ fontSize: 26, color: F.color, letterSpacing: 2, marginTop: 14 }}>{F.nombre}</div>
        <div style={{ fontSize: 34, color: PALETA.tinta, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{c.nombre}</div>
        <div style={{ fontSize: 28, color: PALETA.neon.amarillo, marginTop: 6 }}>{final ? 'POR LA COPA 🏆' : `PASAN ${c.pasan} DE ${n}`}</div>
      </div>
      {!final && (
        <>
          <div style={{ position: 'absolute', left: 20, right: 20, top: corte, height: 0, borderTop: `4px dashed ${PALETA.rojo}` }} />
          <div style={{ position: 'absolute', left: 20, top: corte + 4, fontSize: 18, color: PALETA.rojo, letterSpacing: 1 }}>{c.fase === 0 ? '7.º AL REPECHAJE · RESTO FUERA ↓' : 'FUERA ↓'}</div>
        </>
      )}
      {sim.posiciones.map((_, b) => {
        const i = c.corredores[b];
        const p = puesto(b);
        const llego = sim.llegadas[b] >= 0 && sim.llegadas[b] <= f;
        const lugar = sim.ranking[f].indexOf(b);
        const pasa = llego && lugar < c.pasan;
        const et = ctx.g.participantes[i].etiqueta;
        return (
          <div key={b} style={{ position: 'absolute', left: 20, right: 16, top: TOP + p * FILA + (!final && p >= c.pasan - 0.001 ? 26 : 0), height: FILA - 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 46, fontSize: Math.min(34, FILA * 0.42), color: PALETA.tintaSuave }}>{lugar + 1}.º</span>
            <Bolita ctx={ctx} i={i} tam={Math.min(62, FILA * 0.78)} />
            <span style={{ flex: 1, fontSize: Math.min(et.length > 11 ? 20 : et.length > 8 ? 24 : 30, FILA * 0.4), color: ctx.plan.colores[i], whiteSpace: 'nowrap', overflow: 'hidden' }}>{et}</span>
            {llego && <span style={{ fontSize: 26, fontFamily: FUENTE_EMOJI }}>{pasa ? (final && lugar === 0 ? '🏆' : '✅') : ''}</span>}
          </div>
        );
      })}
    </div>
  );
};

const Carrera169: React.FC<{ ctx: Ctx; c: CarreraElim; repe?: boolean }> = ({ ctx, c, repe = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sim = usarJson<SimulacionCarrera>(`sim/${c.simId}.json`, c.simId);
  const colores = useMemo(() => c.corredores.map((i) => ctx.plan.colores[i]), [c, ctx.plan.colores]);
  if (!sim) return null;
  const F = ctx.plan.fases[c.fase];
  // Repetición: 1 cuadro de sim por cuadro de video (media velocidad) desde c.repe.desde.
  const f = repe ? Math.min(c.repe!.desde + frame, sim.duracionFrames - 1) : Math.min(frame * 2, sim.duracionFrames - 1);
  const kc = Math.min(Math.floor(f / 2), c.camTop.length - 1);
  const cam = c.camTop[kc], altoVis = c.camAlto[kc];
  const esc = H / altoVis;
  const ANCHO_AREA = W - PANEL;
  const izq = PANEL + (ANCHO_AREA - sim.tablero.ancho * esc) / 2;
  const decisiva = sim.orden[c.pasan - 1];
  const primeraFuera = sim.orden[c.pasan];
  const fDec = sim.frameDecisivo ?? sim.frameGanadora;
  const zMax = repe ? 1.45 : ZOOM_META;
  const z = repe
    ? interpolate(frame, [0, 40], [1.05, zMax], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
    : interpolate(f, [sim.camaraLenta.desde, sim.camaraLenta.desde + 26], [1, ZOOM_META], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const ax = izq + sim.posiciones[decisiva][Math.min(repe ? f : fDec, sim.duracionFrames - 1)][0] * esc;
  const ay = repe ? Math.min(H * 0.8, Math.max(H * 0.2, (sim.posiciones[decisiva][f][1] - cam) * esc)) : (sim.tablero.metaY - cam) * esc;
  const liderY = Math.max(...sim.posiciones.map((p) => p[f][1]));
  const secs = sim.secciones ?? [];
  const sec = secs.findIndex((x) => liderY >= x.y0 + 60 && liderY < x.y1);
  const entraSec = sec >= 0 ? (() => { for (let g = f; g >= 0; g -= 2) { const ly = Math.max(...sim.posiciones.map((p) => p[g][1])); if (ly < secs[sec].y0 + 60) return g; } return 0; })() : -1;
  const lenta = f >= sim.camaraLenta.desde && f <= sim.camaraLenta.hasta;
  const etiquetas = repe ? 1 : interpolate(frame, [20, 30], [0, 1], { extrapolateRight: 'clamp' }) * (lenta ? 0 : 1);
  const aviso = repe ? undefined : (sim.avisos ?? []).filter((a) => f >= a.frame && f < a.frame + AVISO_FRAMES && a.frame < sim.camaraLenta.desde - 60).pop();
  const fin = f - fDec;
  const banner = spring({ frame: Math.floor((fin - 20) / 2), fps, config: { damping: 12, stiffness: 140 } });
  const final = c.fase === 5;
  const desdeFuera = c.fase === 0 ? c.pasan + 1 : c.pasan;
  const fuera = c.orden.slice(desdeFuera);
  const alRepe = c.fase === 0 ? c.orden[c.pasan] : undefined;
  const ventaja = c.ventajaSeg !== null && c.ventajaSeg < 1.5 ? `${c.ventajaSeg.toFixed(2).replace('.', ',')} s` : '';
  // Contador: baja cuando se decide la carrera (frames de video relativos a la carrera).
  const kDec = Math.round(fDec / 2);
  const quedan = <Quedan de={c.quedanAntes} a={c.quedanDespues} k={repe ? 0 : frame} k0={kDec + 12} k1={kDec + 12 + 4 * (c.quedanAntes - c.quedanDespues)} tam={58} color={F.color} />;
  const anillo = (b: number, color: string, texto: string) => {
    const [x, y] = sim.posiciones[b][f];
    const sx = izq + x * esc, sy = (y - cam) * esc, r = sim.tablero.radioBola * esc * 1.5;
    return (
      <React.Fragment key={`an${b}`}>
        <div style={{ position: 'absolute', left: sx - r, top: sy - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `6px solid ${color}`, boxShadow: `0 0 24px ${color}` }} />
        <div style={{ position: 'absolute', left: sx - 120, top: sy + r + 6, width: 240, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 30, color, textShadow: '0 3px 0 #000' }}>{texto}</div>
      </React.Fragment>
    );
  };
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: `${ax}px ${ay}px`, filter: repe ? 'saturate(0.75) contrast(1.08)' : undefined }}>
        <div style={{ position: 'absolute', left: PANEL, top: 0, width: ANCHO_AREA, height: H, overflow: 'hidden', background: `radial-gradient(ellipse at 50% 30%, ${F.color}22, ${PALETA.fondo2} 45%, #07070C)` }}>
          <div style={{ position: 'absolute', left: izq - PANEL, top: 0, width: sim.tablero.ancho, height: sim.tablero.alto, transform: `scale(${esc}) translateY(${-cam}px)`, transformOrigin: '0 0', background: `${PALETA.fondo}` }}>
            <Tablero sim={sim} cam={cam} alto={altoVis} f={f} colores={colores} tinte={F.color} />
            <TubosFondo sim={sim} cam={cam} frame={f} colores={colores} />
            <Bloques sim={sim} cam={cam} frame={f} colores={colores} />
            <Bolas ctx={ctx} c={c} sim={sim} cam={cam} alto={altoVis} esc={esc} f={f} etiquetas={etiquetas} />
            <TubosFrente sim={sim} cam={cam} />
          </div>
        </div>
        {repe && !final && primeraFuera !== undefined && <>{anillo(decisiva, PALETA.verde, 'SE SALVA')}{anillo(primeraFuera, PALETA.rojo, c.fase === 0 ? 'AL REPECHAJE' : 'FUERA')}</>}
      </AbsoluteFill>
      {!lenta && !repe && sim.posiciones.map((pos, b) => {
        const [x, y] = pos[f];
        const sy = (y - cam) * esc;
        const llegada = sim.llegadas[b] >= 0 && sim.llegadas[b] <= f;
        if (llegada || (sy > -20 && sy < H + 20)) return null;
        const i = c.corredores[b];
        const arriba = sy <= -20;
        return (
          <div key={`fc${b}`} style={{ position: 'absolute', left: izq + x * esc - 34, top: arriba ? 10 : H - 84, width: 68, display: 'flex', flexDirection: arriba ? 'column' : 'column-reverse', alignItems: 'center', opacity: 0.9 }}>
            <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: 24, color: ctx.plan.colores[i] }}>{arriba ? '▲' : '▼'}</div>
            <Bolita ctx={ctx} i={i} tam={44} />
          </div>
        );
      })}
      {(lenta || repe) && <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 60%, transparent 40%, ${repe ? '#000000AA' : ctx.plan.colores[c.corredores[decisiva]] + '44'} 100%)` }} />}
      <PanelVivo ctx={ctx} c={c} sim={sim} f={f} quedan={quedan} />
      {repe && (
        <div style={{ position: 'absolute', left: PANEL + 30, top: 26, display: 'flex', alignItems: 'center', gap: 16, fontFamily: TIPO.display, fontWeight: 800 }}>
          <div style={{ padding: '8px 26px', borderRadius: 12, background: PALETA.rojo, color: '#FFF', fontSize: 44, opacity: 0.6 + 0.4 * Math.abs(Math.sin(frame / 8)) }}>⏪ REPETICIÓN</div>
          {ventaja && <div style={{ fontSize: 38, color: PALETA.tinta, textShadow: '0 3px 0 #000' }}>el corte por {ventaja}</div>}
        </div>
      )}
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
            <div style={{ padding: '12px 30px', borderRadius: 999, background: `${PALETA.fondo}EE`, border: `3px solid ${aviso.tipo === 'camino' ? PALETA.neon.amarillo : PALETA.neon.cian}`, fontFamily: TIPO.display, fontWeight: 800, fontSize: 40, color: PALETA.tinta, whiteSpace: 'nowrap', opacity: op, transform: `scale(${0.8 + 0.2 * e})` }}>{texto}</div>
          </div>
        );
      })()}
      {!repe && sec >= 0 && f - entraSec < 150 && !aviso && (() => {
        const k = f - entraSec;
        const e = spring({ frame: Math.floor(k / 2), fps, config: { damping: 12, stiffness: 180 } });
        const op = interpolate(k, [0, 8, 130, 150], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div style={{ position: 'absolute', left: PANEL, width: W - PANEL, top: 30, display: 'flex', justifyContent: 'center' }}>
            <div style={{ padding: '10px 34px', borderRadius: 999, background: `${PALETA.fondo}EE`, border: `3px solid ${F.color}`, fontFamily: TIPO.display, fontWeight: 800, fontSize: 44, color: PALETA.tinta, opacity: op, transform: `scale(${0.7 + 0.3 * e})`, whiteSpace: 'nowrap' }}>
              {secs[sec].titulo} <span style={{ color: PALETA.tintaSuave, fontSize: 30 }}>· sección {sec + 1} de {secs.length}</span>
            </div>
          </div>
        );
      })()}
      {!repe && fin > 20 && (
        <div style={{ position: 'absolute', left: PANEL, width: W - PANEL, top: 330, display: 'flex', justifyContent: 'center', opacity: Math.min(1, banner * 1.3) }}>
          <div style={{
            padding: '18px 40px', borderRadius: 30, background: `${PALETA.fondo}F0`, border: `4px solid ${final ? ORO : PALETA.neon.amarillo}`, boxShadow: `0 0 40px ${PALETA.neon.amarillo}66`,
            fontFamily: TIPO.display, fontWeight: 800, color: PALETA.tinta, transform: `scale(${0.6 + 0.4 * banner})`, textAlign: 'center', maxWidth: W - PANEL - 80,
          }}>
            <div style={{ fontSize: 64, whiteSpace: 'nowrap' }}>{final ? <>¡<Nombre ctx={ctx} i={c.orden[0]} /> es campeón! 🏆</> : <>✅ ¡Pasan {c.pasan}!</>}</div>
            {!final && fuera.length > 0 && <div style={{ fontSize: 34, marginTop: 6, color: PALETA.tintaSuave }}>❌ Fuera: {lista(fuera.map((i) => <Nombre key={i} ctx={ctx} i={i} />))}</div>}
            {alRepe !== undefined && <div style={{ fontSize: 34, marginTop: 4, color: PALETA.tintaSuave }}>🔁 Al repechaje: <Nombre ctx={ctx} i={alRepe} /></div>}
            {ventaja && !final && <div style={{ fontSize: 30, color: PALETA.tintaSuave, marginTop: 4 }}>el corte se decidió por {ventaja}</div>}
          </div>
        </div>
      )}
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- RESULTADO SOBRE LA PARRILLA

const Resultado: React.FC<{ ctx: Ctx; k: number; dur: number }> = ({ ctx, k, dur }) => {
  const frame = useCurrentFrame();
  const c = ctx.plan.carreras[k];
  const F = ctx.plan.fases[c.fase];
  const op = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sig = ctx.plan.carreras[k + 1];
  const caen = c.quedanAntes - c.quedanDespues;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo tinte={F.color} />
      <div style={{ position: 'absolute', top: 30, width: W, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 50, fontFamily: TIPO.display, fontWeight: 800 }}>
        <span style={{ fontSize: 52, color: PALETA.tintaSuave }}>{F.nombre} · {c.nombre}</span>
        <Quedan de={c.quedanAntes} a={c.quedanDespues} k={frame} k0={66} k1={66 + 4 * caen} tam={86} color={F.color} />
      </div>
      <Parrilla ctx={ctx} hecha={k} anima={k} k={frame} foco={frame > 140 && sig ? sig.corredores : undefined} />
      {frame > 140 && sig && (
        <div style={{ position: 'absolute', bottom: 22, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 44, color: PALETA.neon.amarillo, opacity: interpolate(frame, [140, 150], [0, 1], { extrapolateRight: 'clamp' }) }}>
          Siguiente: {ctx.plan.fases[sig.fase].nombre.toLowerCase()} · {sig.nombre.toLowerCase()}
        </div>
      )}
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- VOTACIÓN (antes de la final)

const PanelEscalado: React.FC<{ ctx: Ctx; frameFinal: number; ganador: number }> = ({ ctx, frameFinal, ganador }) => {
  const ids = ctx.plan.votacion;
  const ESC = 1.25;
  return (
    <div style={{ position: 'absolute', left: W / 2 - 498 * ESC, top: 640 - 1389 * ESC, width: 1080, height: 1920, transform: `scale(${ESC})`, transformOrigin: '0 0' }}>
      <PanelVotacion colores={ids.map((i) => ctx.plan.colores[i])} etiquetas={ids.map((i) => ctx.g.participantes[i].etiqueta)} acciones={[...ACCIONES]}
        iconos={(tam) => ids.map((i) => <Icono key={i} icono={ctx.g.participantes[i].icono} tam={tam * 0.8} fondo={ctx.plan.colores[i]} />)}
        frameFinal={frameFinal} ganador={ganador} grandeAntes={false} opacidad={1} />
    </div>
  );
};

const Votacion: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 8, dur - 8, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo tinte={PALETA.neon.magenta} />
      <div style={{ position: 'absolute', top: 60, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
        <div style={{ fontSize: 96, color: PALETA.tinta }}>DE 50 QUEDAN 4</div>
        <div style={{ fontSize: 44, color: PALETA.tintaSuave }}>¿Quién gana? Vota con un botón 👇</div>
      </div>
      <PanelEscalado ctx={ctx} frameFinal={100000} ganador={0} />
      <Marca />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CAMPEÓN

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
      <AbsoluteFill style={{ transform: `rotate(${frame * 0.4}deg) scale(1.6)`, opacity: 0.35 * e, background: `repeating-conic-gradient(from 0deg at 50% 55%, ${color}55 0deg 9deg, transparent 9deg 22.5deg)` }} />
      <div style={{ position: 'absolute', left: W / 2 - 260, top: 600 - 260, transform: `scale(${0.2 + 0.8 * e}) rotate(${(1 - e) * -40}deg)` }}>
        <Bolita ctx={ctx} i={p1} tam={520} />
      </div>
      <div style={{ position: 'absolute', left: W / 2 - 110, top: 40, fontSize: 200, lineHeight: 1, transform: `translateY(${(1 - t) * -300}px) rotate(${Math.sin(frame / 9) * 6}deg)` }}>🏆</div>
      <div style={{ position: 'absolute', bottom: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, opacity: t }}>
        <div style={{ fontSize: 56, color: ORO, letterSpacing: 4 }}>DE 50 {ctx.g.tema.toUpperCase()}, EL CAMPEÓN ES</div>
        <div style={{ fontSize: 130, color, textShadow: `0 0 50px ${color}, 0 6px 0 #000`, lineHeight: 1 }}>{ctx.g.participantes[p1].etiqueta}</div>
      </div>
      <Confeti frame={frame} semilla={11} />
      <Marca />
    </AbsoluteFill>
  );
};

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
        <div style={{ position: 'absolute', inset: 0, transform: 'translateY(-440px)' }}>
          <Sequence from={60} layout="none"><PanelEscalado ctx={ctx} frameFinal={-40} ganador={ctx.plan.votacion.indexOf(p1)} /></Sequence>
        </div>
      )}
      <Confeti frame={frame + 200} semilla={23} n={80} />
      <Marca />
    </AbsoluteFill>
  );
};

const Repaso: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Fondo tinte={ORO} />
      <div style={{ position: 'absolute', top: 34, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, fontSize: 60, color: PALETA.tinta }}>
        DE 50 QUEDÓ 1 · <Nombre ctx={ctx} i={ctx.plan.podio[0]} /> 🏆
      </div>
      <Parrilla ctx={ctx} hecha={ctx.plan.carreras.length - 1} k={frame} campeon={ctx.plan.podio[0]} />
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

const Cierre: React.FC<{ ctx: Ctx; dur: number }> = ({ ctx, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const op = interpolate(frame, [0, 10, dur - 12, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: op, fontFamily: TIPO.display, fontWeight: 800 }}>
      <Fondo tinte={PALETA.neon.lima} />
      <div style={{ position: 'absolute', top: 90, left: 120, width: 900, transform: `translateX(${(1 - e) * -60}px)` }}>
        <div style={{ fontSize: 76, color: PALETA.tinta, lineHeight: 1.05 }}>¿En qué ronda quedó tu país?</div>
        <div style={{ fontSize: 44, color: PALETA.neon.amarillo, marginTop: 24, lineHeight: 1.3 }}>Coméntalo y pide la próxima carrera: clubes de fútbol, animales, comidas… 👇</div>
        <div style={{ fontSize: 40, color: PALETA.tintaSuave, marginTop: 40, lineHeight: 1.3 }}>Todo sale de una simulación física: nadie está favorecido.</div>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 330, width: 620, height: 350, borderRadius: 24, border: `3px dashed ${PALETA.tinta}22` }} />
      <div style={{ position: 'absolute', left: 120, bottom: 120, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 90, height: 90, borderRadius: '50%', background: PALETA.neon.lima, boxShadow: `0 0 40px ${PALETA.neon.lima}` }} />
        <div>
          <div style={{ fontSize: 60, color: PALETA.tinta }}>{MARCA.nombre}</div>
          <div style={{ fontSize: 32, color: PALETA.tintaSuave, fontFamily: TIPO.texto, fontWeight: 700 }}>{MARCA.handle} · suscríbete para la próxima carrera</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- COMPOSICIÓN

export const Eliminacion: React.FC<GuionEliminacion> = (g) => {
  cargarFuentes();
  const plan = usarJson<PlanEliminacion>(`sim/${g.id}.json`, `plan ${g.id}`);
  if (!plan) return null;
  const ctx: Ctx = { g, plan };
  return (
    <AbsoluteFill style={{ background: PALETA.fondo }}>
      <Audio src={staticFile(`audio/generado/${g.id}.wav`)} />
      {plan.segmentos.map((s, j) => (
        <Sequence key={j} from={s.desde} durationInFrames={s.dur} name={`${s.tipo}${s.carrera !== undefined ? ' ' + (s.carrera + 1) : ''}`}>
          {s.tipo === 'portada' && <Portada ctx={ctx} dur={s.dur} />}
          {s.tipo === 'fase' && <CartelFase ctx={ctx} fase={s.fase!} dur={s.dur} />}
          {s.tipo === 'presenta' && <Presenta ctx={ctx} c={plan.carreras[s.carrera!]} dur={s.dur} />}
          {s.tipo === 'carrera' && <Carrera169 ctx={ctx} c={plan.carreras[s.carrera!]} />}
          {s.tipo === 'repeticion' && <Carrera169 ctx={ctx} c={plan.carreras[s.carrera!]} repe />}
          {s.tipo === 'resultado' && <Resultado ctx={ctx} k={s.carrera!} dur={s.dur} />}
          {s.tipo === 'votacion' && <Votacion ctx={ctx} dur={s.dur} />}
          {s.tipo === 'campeon' && <Campeon ctx={ctx} dur={s.dur} />}
          {s.tipo === 'cierre' && <Cierre ctx={ctx} dur={s.dur} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- MINIATURA 1280 × 720 (fotograma real: la parrilla llena)

export const MiniaturaEliminacion: React.FC<GuionEliminacion> = (g) => {
  cargarFuentes();
  const plan = usarJson<PlanEliminacion>(`sim/${g.id}.json`, `plan ${g.id}`);
  if (!plan) return null;
  const ctx: Ctx = { g, plan };
  // La parrilla de los 50 (la misma pantalla del video) a escala 1280/1920, con texto enorme encima. No revela al campeón.
  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: -40, width: W, height: H, transform: `scale(${1280 / W * 1.06})`, transformOrigin: '0 0' }}>
        <Fondo tinte={ORO} />
        <Parrilla ctx={ctx} hecha={-1} />
      </div>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PALETA.fondo}00 30%, ${PALETA.fondo}CC 62%, ${PALETA.fondo}F5 100%)` }} />
      <div style={{ position: 'absolute', left: 0, bottom: 26, width: 1280, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800, lineHeight: 0.92 }}>
        <div style={{ fontSize: 176, color: PALETA.tinta, textShadow: '0 8px 0 #000' }}>50 PAÍSES</div>
        <div style={{ display: 'inline-block', marginTop: 8, padding: '6px 26px', background: PALETA.rojo, borderRadius: 16, fontSize: 92, color: '#FFFFFF', transform: 'rotate(-2deg)', boxShadow: '0 6px 0 #000' }}>SOLO 1 GANA</div>
      </div>
    </AbsoluteFill>
  );
};
