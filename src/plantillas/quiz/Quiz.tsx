/**
 * LARGO "¿Cuántas adivinas?" (1920 × 1080, 30 fps, versión simple). Una bolita salta sobre un teclado de pads y cada
 * salto cae en el instante exacto de una nota (los saltos se calculan desde la partitura: parábola entre la nota i y la
 * i+1, más alta cuanto más larga la nota). Tras cada canción, 3 s de cuenta regresiva y la respuesta. Sin física ni
 * Three.js: barato de rendir.
 */
import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { MARCA, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { FUENTE_EMOJI } from '../carrera/Icono';
import { T_QUIZ, type GuionQuiz, type PlanQuiz } from './guion';

const W = 1920, H = 1080, FPS = 30;
const PAD_Y = 860, BOLA_R = 34;

export const calcularMetadataQuiz: CalculateMetadataFunction<GuionQuiz> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const plan = (await (await fetch(staticFile(`sim/${props.id}.json`))).json()) as PlanQuiz;
  return { durationInFrames: plan.duracionFrames, props: { ...props, duracionFrames: plan.duracionFrames } };
};

const usarPlan = (id: string) => {
  const [plan, setPlan] = useState<PlanQuiz | null>(null);
  const [h] = useState(() => delayRender(`quiz: plan ${id}`));
  useEffect(() => { fetch(staticFile(`sim/${id}.json`)).then((r) => r.json()).then((p) => { setPlan(p); continueRender(h); }).catch((e) => cancelRender(e)); }, [id, h]);
  return plan;
};

const Estrellas: React.FC<{ n: number; tam: number }> = ({ n, tam }) => (
  <span style={{ fontFamily: FUENTE_EMOJI, fontSize: tam, letterSpacing: 4 }}>{'⭐'.repeat(n)}<span style={{ opacity: 0.25 }}>{'⭐'.repeat(3 - n)}</span></span>
);
const NIVEL = ['', 'FÁCIL', 'MEDIA', 'DIFÍCIL'];

type Cancion = PlanQuiz['canciones'][number];

const Teclado: React.FC<{ c: Cancion; k: number; tono: number }> = ({ c, k, tono }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const n = c.pads.length;
  const ancho = Math.min(150, 1500 / n);
  const x0 = W / 2 - ((n - 1) * ancho) / 2;
  const xDe = (m: number) => x0 + c.pads.indexOf(m) * ancho;
  // nota actual (la última que ya sonó) y la siguiente
  let i = -1;
  for (let j = 0; j < c.notas.length; j++) if (c.notas[j][0] <= t) i = j; else break;
  let bx: number, by: number;
  if (i < 0) { bx = xDe(c.notas[0][1]); by = PAD_Y - BOLA_R - 260 * (1 - t / Math.max(0.01, c.notas[0][0])); }
  else if (i >= c.notas.length - 1) { bx = xDe(c.notas[i][1]); by = PAD_Y - BOLA_R - 40 * Math.abs(Math.sin((t - c.notas[i][0]) * 4)); }
  else {
    const [ta, ma] = c.notas[i], [tb, mb] = c.notas[i + 1];
    const u = (t - ta) / (tb - ta);
    const alto = Math.min(330, 60 + 260 * (tb - ta));
    bx = xDe(ma) + (xDe(mb) - xDe(ma)) * u;
    by = PAD_Y - BOLA_R - 4 * alto * u * (1 - u);
  }
  const hue = (m: number) => tono + ((m - c.pads[0]) / Math.max(1, c.pads[c.pads.length - 1] - c.pads[0])) * 200;
  return (
    <AbsoluteFill>
      {c.pads.map((m) => {
        // brillo del pad: la última vez que sonó
        let ult = -99;
        for (const [tn, mn] of c.notas) { if (tn > t) break; if (mn === m) ult = tn; }
        const b = Math.max(0, 1 - (t - ult) / 0.45);
        const x = xDe(m);
        return (
          <React.Fragment key={m}>
            <div style={{
              position: 'absolute', left: x - ancho * 0.42, top: PAD_Y, width: ancho * 0.84, height: 120 - 40 * (c.pads.indexOf(m) % 2), borderRadius: 18,
              background: `linear-gradient(180deg, hsl(${hue(m)},90%,${55 + 25 * b}%), hsl(${hue(m)},70%,22%))`,
              boxShadow: `0 0 ${10 + 50 * b}px hsl(${hue(m)},95%,60%)`, transform: `translateY(${6 * b}px)`,
            }} />
            {b > 0 && <div style={{ position: 'absolute', left: x - 70 * (1.6 - b), top: PAD_Y - 18 - 30 * (1.6 - b), width: 140 * (1.6 - b), height: 60 * (1.6 - b), borderRadius: '50%', border: `4px solid hsla(${hue(m)},95%,70%,${b})` }} />}
          </React.Fragment>
        );
      })}
      {/* estela y bolita */}
      {[6, 4, 2].map((d) => {
        const f2 = Math.max(0, frame - d);
        return <div key={d} style={{ position: 'absolute', left: bx - BOLA_R, top: by - BOLA_R, width: BOLA_R * 2, height: BOLA_R * 2, borderRadius: '50%', background: '#FFFFFF', opacity: 0.05 * (8 - d), transform: `translateY(${(frame - f2) * 0}px)` }} />;
      })}
      <div style={{ position: 'absolute', left: bx - BOLA_R * 3, top: by - BOLA_R * 3, width: BOLA_R * 6, height: BOLA_R * 6, borderRadius: '50%', background: `radial-gradient(circle, ${PALETA.neon.amarillo}55 0%, transparent 65%)` }} />
      <div style={{ position: 'absolute', left: bx - BOLA_R, top: by - BOLA_R, width: BOLA_R * 2, height: BOLA_R * 2, borderRadius: '50%', background: `radial-gradient(circle at 34% 30%, #FFFFFF 0, ${PALETA.neon.amarillo} 45%, #C9A800 100%)`, boxShadow: `0 0 30px ${PALETA.neon.amarillo}` }} />
      <div style={{ position: 'absolute', top: 40, width: W, textAlign: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
        <div style={{ fontSize: 88, color: PALETA.tinta }}>¿QUÉ CANCIÓN ES? <span style={{ fontFamily: FUENTE_EMOJI }}>🎵</span></div>
      </div>
      <div style={{ position: 'absolute', left: 50, top: 50, fontFamily: TIPO.display, fontWeight: 800, fontSize: 54, color: PALETA.neon.amarillo }}>{k + 1}/10</div>
      <div style={{ position: 'absolute', right: 50, top: 56 }}><Estrellas n={c.dificultad} tam={40} /></div>
    </AbsoluteFill>
  );
};

const Intro: React.FC<{ c: Cancion; k: number }> = ({ c, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800 }}>
      <div style={{ fontSize: 150, color: PALETA.tinta, transform: `scale(${0.6 + 0.4 * e})` }}>CANCIÓN {k + 1}</div>
      <div style={{ fontSize: 50, color: PALETA.tintaSuave, marginTop: 10 }}>dificultad {NIVEL[c.dificultad]} <Estrellas n={c.dificultad} tam={44} /></div>
    </AbsoluteFill>
  );
};

const Tarjeta: React.FC<{ c: Cancion; k: number }> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cuenta = 3 - Math.floor(frame / fps);
  const rev = frame - 3 * fps;
  const e = spring({ frame: rev, fps, config: { damping: 10, stiffness: 150 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800, background: 'rgba(8,8,16,0.82)' }}>
      {rev < 0 ? (
        <>
          <div style={{ fontSize: 64, color: PALETA.tintaSuave }}>¿La reconociste? La respuesta en…</div>
          <div style={{ fontSize: 300, color: PALETA.neon.amarillo, transform: `scale(${1.2 - 0.2 * ((frame % fps) / fps)})` }}>{cuenta}</div>
        </>
      ) : (
        <div style={{ textAlign: 'center', transform: `scale(${0.6 + 0.4 * e})` }}>
          <div style={{ fontSize: 60, color: PALETA.tintaSuave }}>Era…</div>
          <div style={{ fontSize: 140, color: PALETA.neon.amarillo, textShadow: `0 0 40px ${PALETA.neon.amarillo}88` }}>{c.nombre}</div>
          <div style={{ fontSize: 46, color: PALETA.tinta, fontFamily: TIPO.texto, fontWeight: 700, marginTop: 8 }}>{c.autor}</div>
          <div style={{ fontSize: 44, color: PALETA.neon.lima, marginTop: 30 }}>¿La sacaste? Suma 1 punto <span style={{ fontFamily: FUENTE_EMOJI }}>✅</span></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const Portada: React.FC<{ g: GuionQuiz }> = ({ g }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame, fps, config: { damping: 11, stiffness: 110 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: TIPO.display, fontWeight: 800, textAlign: 'center' }}>
      <div style={{ fontSize: 150, color: PALETA.tinta, transform: `scale(${0.7 + 0.3 * e})` }}>{g.titulo}</div>
      <div style={{ fontSize: 58, color: PALETA.neon.amarillo, marginTop: 10 }}>{g.subtitulo}</div>
      <div style={{ fontSize: 42, color: PALETA.tintaSuave, marginTop: 50, opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        Cuenta tus aciertos con los dedos · de fácil a difícil · al final comenta tu puntaje
      </div>
    </AbsoluteFill>
  );
};

const Final: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const filas: [string, string][] = [['0–3', 'Calentando motores 🎧'], ['4–6', 'Buen oído 👂'], ['7–9', 'Melómano de verdad 🎼'], ['10', 'Oído absoluto 🏆']];
  return (
    <AbsoluteFill style={{ fontFamily: TIPO.display, fontWeight: 800, alignItems: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 96, color: PALETA.tinta }}>¿Cuántas adivinaste?</div>
      <div style={{ fontSize: 52, color: PALETA.neon.amarillo, marginBottom: 40 }}>Comenta tu puntaje 👇</div>
      {filas.map(([p, t], j) => {
        const e = spring({ frame: frame - 20 - j * 10, fps, config: { damping: 12, stiffness: 150 } });
        return (
          <div key={p} style={{ display: 'flex', gap: 40, fontSize: 56, margin: '8px 0', opacity: e, transform: `translateX(${(1 - e) * -80}px)`, width: 1000 }}>
            <span style={{ width: 200, color: PALETA.neon.lima }}>{p}</span><span style={{ color: PALETA.tinta, fontFamily: `${TIPO.display}, ${FUENTE_EMOJI}` }}>{t}</span>
          </div>
        );
      })}
      <div style={{ position: 'absolute', bottom: 80, fontSize: 40, color: PALETA.tintaSuave }}>{MARCA.nombre} · {MARCA.handle} · suscríbete para el próximo desafío</div>
    </AbsoluteFill>
  );
};

export const Quiz: React.FC<GuionQuiz> = (g) => {
  cargarFuentes();
  const plan = usarPlan(g.id);
  if (!plan) return null;
  const { portada, intro, toca, tarjeta, final } = T_QUIZ;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 35%, #2A2556 0%, ${PALETA.fondo2} 50%, ${PALETA.fondo} 100%)` }}>
      <Audio src={staticFile(`audio/generado/${g.id}.wav`)} />
      <Sequence durationInFrames={portada}><Portada g={g} /></Sequence>
      {plan.canciones.map((c, k) => (
        <React.Fragment key={k}>
          <Sequence from={c.desde} durationInFrames={intro}><Intro c={c} k={k} /></Sequence>
          <Sequence from={c.desde + intro} durationInFrames={toca}><Teclado c={c} k={k} tono={(k * 47) % 360} /></Sequence>
          <Sequence from={c.desde + intro + toca} durationInFrames={tarjeta}><Tarjeta c={c} k={k} /></Sequence>
        </React.Fragment>
      ))}
      <Sequence from={plan.duracionFrames - final} durationInFrames={final}><Final /></Sequence>
      <div style={{ position: 'absolute', right: 34, bottom: 24, opacity: 0.5, fontFamily: TIPO.display, fontWeight: 800, fontSize: 28, color: PALETA.tinta }}>● {MARCA.nombre}</div>
    </AbsoluteFill>
  );
};

/** Miniatura 1280 × 720: teclado de colores + "10 CANCIONES" + "¿CUÁNTAS ADIVINAS?". */
export const MiniaturaQuiz: React.FC<GuionQuiz> = () => {
  cargarFuentes();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 60% 40%, #3A2E80 0%, ${PALETA.fondo} 80%)`, fontFamily: TIPO.display, fontWeight: 800 }}>
      {Array.from({ length: 9 }, (_, j) => (
        <div key={j} style={{ position: 'absolute', left: 90 + j * 125, top: 520 - (j % 2) * 30, width: 105, height: 160, borderRadius: 16, background: `linear-gradient(180deg, hsl(${j * 32},90%,62%), hsl(${j * 32},70%,25%))`, boxShadow: `0 0 26px hsl(${j * 32},95%,60%)` }} />
      ))}
      <div style={{ position: 'absolute', left: 620, top: 330, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle at 34% 30%, #FFF 0, ${PALETA.neon.amarillo} 50%)`, boxShadow: `0 0 40px ${PALETA.neon.amarillo}` }} />
      <div style={{ position: 'absolute', left: 50, top: 40, fontSize: 120, color: PALETA.tinta, textShadow: '0 6px 0 #000' }}>¿CUÁNTAS</div>
      <div style={{ position: 'absolute', left: 50, top: 170, fontSize: 120, color: PALETA.neon.amarillo, textShadow: '0 6px 0 #000' }}>ADIVINAS?</div>
      <div style={{ position: 'absolute', right: 40, top: 70, padding: '8px 22px', background: PALETA.rojo, borderRadius: 14, fontSize: 64, color: '#FFF', transform: 'rotate(4deg)' }}>10 🎵</div>
    </AbsoluteFill>
  );
};
