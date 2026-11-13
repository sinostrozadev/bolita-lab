/**
 * LARGO "Bolitas relajantes" (1920 × 1080, 30 fps, ~30 min). Lee el plan `public/sim/<id>.json`
 * (scripts/preparar-largo-relajante.mts) y un solo wav. Cada escena dibuja en <canvas>:
 *  - capa PERSISTENTE (trazas) incremental: si el frame avanza de a 1 se dibuja solo lo nuevo; si salta (inicio de
 *    tramo, still), se rehace desde el inicio de la escena. Las trazas se desvanecen lento (destination-out).
 *  - capa VIVA (bolas, anillo, hexágono, péndulos, gotas) que se redibuja entera cada frame.
 * Barato de rendir: 2 canvas por escena, sin DOM pesado. Fundidos de 6 s entre escenas; paletas que derivan lento.
 * Renderizar con --concurrency=1 (la capa incremental supone frames en orden).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame,
  type CalculateMetadataFunction,
} from 'remotion';
import { MARCA, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import type { EscenaPlan, GuionRelajante, PlanRelajante } from './guion';

const W = 1920, H = 1080, FPS = 30;

export const calcularMetadataRelajante: CalculateMetadataFunction<GuionRelajante> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(staticFile(`sim/${props.id}.json`));
  if (!res.ok) throw new Error(`no existe el plan de "${props.id}": corre scripts/preparar-largo-relajante.mts`);
  const plan = (await res.json()) as PlanRelajante;
  return { durationInFrames: plan.duracionFrames, props: { ...props, duracionFrames: plan.duracionFrames } };
};

const usarPlan = (id: string) => {
  const [plan, setPlan] = useState<PlanRelajante | null>(null);
  const [h] = useState(() => delayRender(`relajante: plan ${id}`));
  useEffect(() => {
    fetch(staticFile(`sim/${id}.json`)).then((r) => r.json()).then((p) => { setPlan(p); continueRender(h); }).catch((e) => cancelRender(e));
  }, [id, h]);
  return plan;
};

/** Tono de la escena en el frame g: deriva lento (±28° en ~3 min) más un avance suave. */
const tonoEn = (e: EscenaPlan, g: number) => e.tono + 28 * Math.sin(g / (FPS * 30)) + g * 0.004;
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

// ---------------------------------------------------------------- capa persistente (trazas)

/** Dibuja lo nuevo del frame g en la capa persistente. */
const pasoTrazas = (ctx: CanvasRenderingContext2D, e: EscenaPlan, g: number) => {
  // Desvanecer cada 6 frames (más estable que cada frame en 8 bits).
  if (g % 6 === 0) {
    ctx.globalCompositeOperation = 'destination-out';
    const k = e.tipo === 'llenar' ? 0.022 : e.tipo === 'espirografo' ? 0.016 : 0.05;
    ctx.fillStyle = `rgba(0,0,0,${k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const h = tonoEn(e, g);
  if (e.bolas && (e.tipo === 'llenar' || e.tipo === 'tres')) {
    e.bolas.forEach((b, j) => {
      const x = b.xy[g * 2], y = b.xy[g * 2 + 1];
      if (x === undefined) return;
      const hh = h + j * 120 + g * 0.05;
      ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = hsl(hh, 70, 58, 0.95); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = hsl(hh, 60, 18, 0.9); ctx.stroke();
    });
  }
  if (e.bolas && e.tipo === 'hexagono' && g > 0) {
    e.bolas.forEach((b, j) => {
      const x0 = b.xy[(g - 1) * 2], y0 = b.xy[(g - 1) * 2 + 1], x = b.xy[g * 2], y = b.xy[g * 2 + 1];
      if (x === undefined) return;
      ctx.lineCap = 'round';
      ctx.strokeStyle = hsl(h + j * 50 + g * 0.08, 80, 62, 0.85); ctx.lineWidth = b.r * 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
    });
  }
  if (e.plumas && g > 0) {
    e.plumas.forEach((p, j) => {
      const a = plumaEn(p, g - 1), b = plumaEn(p, g);
      ctx.strokeStyle = hsl(h + j * 40, 90, 65, 0.9); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
  }
};

const plumaEn = (p: NonNullable<EscenaPlan['plumas']>[number], g: number): [number, number] => {
  const th = (g / FPS) * p.vel * 2 * Math.PI + p.fase, k = (p.R - p.r) / p.r;
  // El rodillo cambia de tamaño muy despacio: la figura se transforma (no se repite igual).
  const d = p.d * (1 + 0.25 * Math.sin(g / (FPS * 50) + p.fase));
  return [W / 2 + (p.R - p.r) * Math.cos(th) + d * Math.cos(k * th), H / 2 + (p.R - p.r) * Math.sin(th) - d * Math.sin(k * th)];
};

// ---------------------------------------------------------------- capa viva

const brillo = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
};
const bolaViva = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, h: number) => {
  ctx.globalCompositeOperation = 'lighter';
  brillo(ctx, x, y, r * 3.2, hsl(h, 90, 60, 0.35));
  ctx.globalCompositeOperation = 'source-over';
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.3, hsl(h, 85, 75)); gr.addColorStop(1, hsl(h, 80, 50));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
};

const dibujarVivo = (ctx: CanvasRenderingContext2D, e: EscenaPlan, g: number) => {
  ctx.clearRect(0, 0, W, H);
  const h = tonoEn(e, g);
  const t = g / FPS;
  if (e.anillo) {
    ctx.lineWidth = 6; ctx.strokeStyle = hsl(h, 80, 70, 0.75);
    ctx.shadowColor = hsl(h, 90, 60, 0.9); ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(e.anillo.cx, e.anillo.cy, e.anillo.R + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (e.hex) {
    const ang = e.hex.ang0 + e.hex.omega * t;
    ctx.lineWidth = 7; ctx.strokeStyle = hsl(h + 30, 70, 72, 0.8); ctx.lineJoin = 'round';
    ctx.shadowColor = hsl(h + 30, 90, 60, 0.9); ctx.shadowBlur = 22;
    ctx.beginPath();
    for (let k = 0; k <= 6; k++) { const a = ang + (k * Math.PI) / 3; const R = e.hex.R + 4; const x = W / 2 + R * Math.cos(a), y = H / 2 + R * Math.sin(a); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
  }
  if (e.bolas) e.bolas.forEach((b, j) => { const x = b.xy[g * 2], y = b.xy[g * 2 + 1]; if (x !== undefined) bolaViva(ctx, x, y, b.r, h + j * (e.tipo === 'tres' ? 120 : 50)); });
  if (e.plumas) {
    // guías tenues y las plumas como bolitas de luz
    ctx.lineWidth = 2; ctx.strokeStyle = hsl(h, 40, 70, 0.12);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, e.plumas[0].R, 0, Math.PI * 2); ctx.stroke();
    e.plumas.forEach((p, j) => { const [x, y] = plumaEn(p, g); bolaViva(ctx, x, y, 13, h + j * 40); });
  }
  if (e.pendulos) {
    const { n, ciclo, amp } = e.pendulos;
    const N = n.length, x0 = 260, x1 = W - 260;
    ctx.lineWidth = 6; ctx.strokeStyle = hsl(h, 30, 75, 0.5);
    ctx.beginPath(); ctx.moveTo(x0 - 60, 110); ctx.lineTo(x1 + 60, 110); ctx.stroke();
    n.forEach((nj, j) => {
      const px = x0 + ((x1 - x0) * j) / (N - 1);
      const L = 380 + (N - 1 - j) * 34; // los lentos (menos oscilaciones) más largos
      const posEn = (tt: number) => { const th = amp * Math.cos((2 * Math.PI * nj * tt) / ciclo); return [px + L * Math.sin(th), 110 + L * Math.cos(th)] as const; };
      const [bx, by] = posEn(t);
      const hj = h + j * 9;
      ctx.lineWidth = 2; ctx.strokeStyle = hsl(hj, 30, 80, 0.35);
      ctx.beginPath(); ctx.moveTo(px, 110); ctx.lineTo(bx, by); ctx.stroke();
      for (let k = 10; k >= 1; k--) { const [tx, ty] = posEn(t - k * 0.03); ctx.globalAlpha = 0.05 * (11 - k); ctx.fillStyle = hsl(hj, 85, 60); ctx.beginPath(); ctx.arc(tx, ty, 20, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      bolaViva(ctx, bx, by, 22, hj);
    });
  }
  if (e.gotas) {
    for (const d of e.gotas) {
      const dt = t - d.t;
      if (dt < -0.9 || dt > 7) continue;
      const hj = h + (d.x / W) * 60;
      if (dt < 0) {
        // la gota cae (se acerca: crece) hasta tocar el agua
        const u = 1 + dt / 0.9;
        const r = 6 + 16 * u * d.s;
        bolaViva(ctx, d.x, d.y - 120 * (1 - u), r, hj);
      } else {
        for (let k = 0; k < 3; k++) {
          const tt = dt - k * 0.45;
          if (tt < 0) continue;
          const R = 30 + 150 * tt * d.s;
          const a = Math.max(0, 0.75 * (1 - tt / 6.5)) * (1 - k * 0.22);
          ctx.lineWidth = 3.5 - k; ctx.strokeStyle = hsl(hj, 80, 72, a);
          ctx.beginPath(); ctx.ellipse(d.x, d.y, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (dt < 0.5) { ctx.globalCompositeOperation = 'lighter'; brillo(ctx, d.x, d.y, 60 * (1 - dt / 0.5) + 10, hsl(hj, 90, 70, 0.6)); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
  }
};

// ---------------------------------------------------------------- escena

const Escena: React.FC<{ e: EscenaPlan; fundido: number }> = ({ e, fundido }) => {
  const frame = useCurrentFrame();
  const g = Math.max(0, Math.min(frame, e.dur - 1));
  const trazas = useRef<HTMLCanvasElement>(null);
  const vivo = useRef<HTMLCanvasElement>(null);
  const ultimo = useRef(-1);
  useLayoutEffect(() => {
    const cv = trazas.current, cvv = vivo.current;
    if (!cv || !cvv) return;
    const ctx = cv.getContext('2d')!;
    if (g !== ultimo.current + 1) { ctx.clearRect(0, 0, W, H); for (let k = 0; k < g; k++) pasoTrazas(ctx, e, k); }
    if (g !== ultimo.current) pasoTrazas(ctx, e, g);
    ultimo.current = g;
    dibujarVivo(cvv.getContext('2d')!, e, g);
  }, [g, e]);
  const X = fundido * FPS;
  const op = interpolate(frame, [0, X, e.dur - X, e.dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const h = tonoEn(e, g);
  const fondo = e.tipo === 'gotas'
    ? `radial-gradient(ellipse at 50% 60%, ${hsl(h, 55, 16)} 0%, ${hsl(h + 20, 60, 7)} 70%, #04040A 100%)`
    : `radial-gradient(ellipse at 50% 50%, ${hsl(h, 45, 13)} 0%, ${hsl(h + 25, 50, 6)} 65%, #050508 100%)`;
  return (
    <AbsoluteFill style={{ opacity: op, background: fondo }}>
      <canvas ref={trazas} width={W} height={H} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={vivo} width={W} height={H} style={{ position: 'absolute', inset: 0 }} />
    </AbsoluteFill>
  );
};

export const Relajante: React.FC<GuionRelajante> = (g) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const plan = usarPlan(g.id);
  if (!plan) return null;
  const tit = interpolate(frame, [0, 45, 240, 330], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#050508' }}>
      <Audio src={staticFile(`audio/generado/${g.id}.wav`)} />
      {plan.escenas.map((e, k) => (
        <Sequence key={k} from={e.desde} durationInFrames={e.dur} name={`${k + 1} ${e.tipo}`}><Escena e={e} fundido={g.fundido} /></Sequence>
      ))}
      {tit > 0 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: tit, background: `rgba(5,5,8,${0.45 * tit})` }}>
          <div style={{ fontFamily: TIPO.display, fontWeight: 700, fontSize: 92, color: PALETA.tinta, letterSpacing: 1, textShadow: '0 0 40px rgba(120,160,255,0.5)' }}>{g.titulo}</div>
          {g.subtitulo && <div style={{ fontFamily: TIPO.texto, fontWeight: 500, fontSize: 44, color: PALETA.tintaSuave, marginTop: 14 }}>{g.subtitulo}</div>}
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', right: 36, bottom: 28, display: 'flex', alignItems: 'center', gap: 10, opacity: 0.32, fontFamily: TIPO.display, fontWeight: 700, fontSize: 26, color: PALETA.tinta }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: PALETA.neon.lima }} />{MARCA.nombre}
      </div>
    </AbsoluteFill>
  );
};

/** Miniatura 1280 × 720: el círculo ya lleno de trazas (escena 1, minuto ~1:40) + "30 MIN" enorme. */
export const MiniaturaRelajante: React.FC<GuionRelajante> = (g) => {
  cargarFuentes();
  const plan = usarPlan(g.id);
  if (!plan) return null;
  const e = plan.escenas[0];
  return (
    <AbsoluteFill style={{ background: '#050508', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 1280 - W * 0.62 - 10, top: (720 - H * 0.62) / 2, width: W, height: H, transform: 'scale(0.62)', transformOrigin: '0 0' }}>
        <Sequence from={-3000} layout="none"><Escena e={e} fundido={0.001} /></Sequence>
      </div>
      <div style={{ position: 'absolute', left: 44, top: 120, fontFamily: TIPO.display, fontWeight: 800, lineHeight: 0.92 }}>
        <div style={{ fontSize: 190, color: PALETA.tinta, textShadow: '0 6px 0 #000, 0 0 40px rgba(120,160,255,0.6)' }}>30</div>
        <div style={{ fontSize: 110, color: '#9FD3FF', textShadow: '0 5px 0 #000' }}>MIN</div>
        <div style={{ marginTop: 22, fontSize: 52, color: PALETA.tinta, textShadow: '0 3px 0 #000' }}>para dormir 🌙</div>
      </div>
    </AbsoluteFill>
  );
};
