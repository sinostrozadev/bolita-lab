import React from 'react';
import { AbsoluteFill, Composition, Html5Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATO, MARCA, NEONES, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { crearAzar } from '../../lib/azar';

/**
 * Identidad visual de Bolita Lab: Logo (800×800), Banner (2560×1440), Intro (1080×1920, 90 frames)
 * y Miniatura (1280×720, props { titulo }) para los videos largos.
 * `scripts/marca.mts` las renderiza a `salida/marca/`.
 */

const FONDO = `radial-gradient(ellipse at 50% 40%, ${PALETA.fondo2} 0%, ${PALETA.fondo} 70%)`;

/** Bolita con glow y estela. La estela se dibuja como copias decrecientes en dirección (dx, dy). */
const Bolita: React.FC<{ x: number; y: number; r: number; color: string; dx?: number; dy?: number; copias?: number; cuerpo?: boolean }> = ({ x, y, r, color, dx = 0, dy = 0, copias = 5, cuerpo = true }) => (
  <>
    {Array.from({ length: copias }, (_, i) => {
      const k = copias - i; // la más lejana primero
      const rr = r * (1 - k * 0.1);
      return (
        <div key={i} style={{
          position: 'absolute', left: x + dx * k - rr, top: y + dy * k - rr, width: rr * 2, height: rr * 2, borderRadius: '50%',
          background: color, opacity: 0.5 * (1 - k / (copias + 1)), filter: `blur(${r * 0.06 * k}px)`,
        }} />
      );
    })}
    {cuerpo && <>
    <div style={{ position: 'absolute', left: x - r * 2.2, top: y - r * 2.2, width: r * 4.4, height: r * 4.4, borderRadius: '50%', background: `radial-gradient(circle, ${color}88 0%, ${color}00 65%)` }} />
    <div style={{
      position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, #ffffffcc 0%, ${color} 38%, ${color} 100%)`,
      boxShadow: `0 0 ${r * 0.5}px ${color}, 0 0 ${r * 1.1}px ${color}88`,
    }} />
    </>}
  </>
);

/**
 * Logo / avatar 800×800. YouTube lo recorta en CÍRCULO y lo muestra a ~48 px: por eso no lleva
 * texto (ilegible a ese tamaño) y todo vive dentro del círculo inscrito (radio 400) con margen.
 * Halos en SVG (degradados radiales reales: sin bordes cuadrados).
 */
const Logo: React.FC = () => {
  cargarFuentes();
  const cx = 430, cy = 430, r = 200;
  // Estela: copias hacia arriba-izquierda, como si la bolita viniera cayendo en diagonal.
  const estela = [5, 4, 3, 2, 1].map((k) => ({ x: cx - k * 34, y: cy - k * 30, r: r * (1 - k * 0.11), op: 0.55 - k * 0.09 }));
  return (
    <AbsoluteFill style={{ background: FONDO }}>
      <svg width={800} height={800} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="halo"><stop offset="0%" stopColor={PALETA.neon.lima} stopOpacity={0.55} /><stop offset="45%" stopColor={PALETA.neon.lima} stopOpacity={0.16} /><stop offset="100%" stopColor={PALETA.neon.lima} stopOpacity={0} /></radialGradient>
          <radialGradient id="cuerpo" cx="34%" cy="30%" r="75%"><stop offset="0%" stopColor="#FFFFFF" /><stop offset="14%" stopColor="#F4FFD6" /><stop offset="50%" stopColor={PALETA.neon.lima} /><stop offset="100%" stopColor="#8FCC1A" /></radialGradient>
          <filter id="b6" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="b14" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
          <clipPath id="frente"><rect x={0} y={410} width={800} height={400} /></clipPath>
        </defs>
        {/* Órbita de "laboratorio": anillo cian inclinado detrás de la bolita */}
        <ellipse cx={400} cy={410} rx={318} ry={120} transform="rotate(-24 400 410)" fill="none" stroke={PALETA.neon.cian} strokeWidth={14} opacity={0.5} filter="url(#b14)" />
        <ellipse cx={400} cy={410} rx={318} ry={120} transform="rotate(-24 400 410)" fill="none" stroke={PALETA.neon.cian} strokeWidth={6} opacity={0.9} />
        {estela.map((e, i) => <circle key={i} cx={e.x} cy={e.y} r={e.r} fill={PALETA.neon.lima} opacity={e.op} filter="url(#b6)" />)}
        <circle cx={cx} cy={cy} r={r * 1.9} fill="url(#halo)" />
        <circle cx={cx} cy={cy} r={r} fill="url(#cuerpo)" />
        {/* Mitad delantera del anillo: pasa por delante de la bolita */}
        <g transform="rotate(-24 400 410)" clipPath="url(#frente)">
          <ellipse cx={400} cy={410} rx={318} ry={120} fill="none" stroke={PALETA.neon.cian} strokeWidth={14} opacity={0.5} filter="url(#b14)" />
          <ellipse cx={400} cy={410} rx={318} ry={120} fill="none" stroke={PALETA.neon.cian} strokeWidth={6} />
        </g>
        {/* Satélite magenta en la órbita */}
        <circle cx={694} cy={262} r={30} fill={PALETA.neon.magenta} filter="url(#b14)" opacity={0.9} />
        <circle cx={694} cy={262} r={24} fill={PALETA.neon.magenta} />
        <circle cx={687} cy={255} r={8} fill="#fff" opacity={0.8} />
      </svg>
    </AbsoluteFill>
  );
};

/** Banner 2560×1440. Todo el texto/logo vive en el área segura central de 1546×423. */
const SEGURA = { ancho: 1546, alto: 423 };
const Banner: React.FC = () => {
  cargarFuentes();
  const az = crearAzar(7);
  // Bolitas decorativas con estela por fuera del área segura (y algunas detrás, tenues).
  const bolitas = Array.from({ length: 16 }, (_, i) => {
    const lado = i % 2 === 0 ? -1 : 1;
    const x = 1280 + lado * (880 + az() * 330);
    const y = 120 + az() * 1200;
    return { x, y, r: 22 + az() * 44, color: NEONES[i % NEONES.length], dx: lado * -(14 + az() * 14), dy: -(18 + az() * 20) };
  });
  return (
    <AbsoluteFill style={{ background: FONDO, fontFamily: TIPO.display }}>
      <svg width={2560} height={1440} style={{ position: 'absolute', inset: 0 }}>
        <defs><filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10" /></filter></defs>
        <ellipse cx={1280} cy={720} rx={1180} ry={560} fill="none" stroke={PALETA.neon.violeta} strokeWidth={10} opacity={0.7} filter="url(#g)" />
        <ellipse cx={1280} cy={720} rx={1180} ry={560} fill="none" stroke={PALETA.neon.violeta} strokeWidth={4} opacity={0.9} />
        <ellipse cx={1280} cy={720} rx={1010} ry={440} fill="none" stroke={PALETA.neon.cian} strokeWidth={3} opacity={0.35} />
      </svg>
      {bolitas.map((b, i) => <Bolita key={i} {...b} copias={4} />)}
      <div style={{ position: 'absolute', left: (2560 - SEGURA.ancho) / 2, top: (1440 - SEGURA.alto) / 2, width: SEGURA.ancho, height: SEGURA.alto, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ position: 'relative', width: 150, height: 150 }}>
            <Bolita x={75} y={75} r={62} color={PALETA.neon.lima} dx={-12} dy={-14} copias={4} />
          </div>
          <div style={{ fontSize: 190, fontWeight: TIPO.pesoDisplay, color: PALETA.tinta, letterSpacing: -4, lineHeight: 1 }}>
            Bolita <span style={{ color: PALETA.neon.lima, textShadow: `0 0 40px ${PALETA.neon.lima}88` }}>Lab</span>
          </div>
        </div>
        <div style={{ fontSize: 70, fontWeight: 700, color: PALETA.tinta }}>{MARCA.lema}</div>
        <div style={{ fontSize: 56, fontFamily: TIPO.texto, fontWeight: 700, color: PALETA.neon.cian }}>Shorts nuevos todos los días</div>
      </div>
    </AbsoluteFill>
  );
};

/** Intro 3 s: la bola cae, rebota dos veces (notas) y aparece el nombre. Audio: intro.wav. */
const SUELO = 980;
const T0 = 22; // frame del primer impacto
const REBOTES = [{ alto: 330, dur: 24 }, { alto: 110, dur: 14 }];
const yBola = (f: number) => {
  if (f < T0) return SUELO - (SUELO + 160) * (1 - (f / T0) ** 2);
  let t = f - T0;
  for (const rb of REBOTES) {
    if (t < rb.dur) { const u = t / rb.dur; return SUELO - rb.alto * 4 * u * (1 - u); }
    t -= rb.dur;
  }
  return SUELO;
};
export const FRAME_IMPACTOS = [T0, T0 + REBOTES[0].dur, T0 + REBOTES[0].dur + REBOTES[1].dur];

const Intro: React.FC = () => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const y = yBola(frame);
  const cae = frame < T0;
  // Squash en cada impacto: aplasta y se recupera con spring.
  const deltas = FRAME_IMPACTOS.map((f) => frame - f).filter((d) => d >= 0);
  const imp = deltas.length ? Math.min(...deltas) : 99;
  const aplaste = imp < 12 ? Math.max(0, 1 - spring({ frame: imp, fps, config: { damping: 14, stiffness: 220 } })) * 0.3 : 0;
  const nombre = spring({ frame: frame - T0, fps, config: { damping: 11, stiffness: 150 } });
  const lema = spring({ frame: frame - (T0 + 24), fps, config: { damping: 14, stiffness: 120 } });
  const pulso = 1 + 0.03 * Math.sin(frame / 5);
  const vel = cae ? 30 + frame * 1.2 : 12;
  return (
    <AbsoluteFill style={{ background: FONDO, fontFamily: TIPO.display }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(0,0)` }}>
        <div style={{ position: 'absolute', left: 540 - 130, top: y - 130, width: 260, height: 260, transform: `scale(${1 + aplaste}, ${1 - aplaste})`, transformOrigin: '50% 100%' }}>
          <Bolita x={130} y={130} r={70} color={PALETA.neon.lima} dy={-vel * 0.5} dx={0} copias={cae ? 6 : y < SUELO - 2 ? 3 : 0} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 1120, textAlign: 'center', opacity: Math.min(1, nombre), transform: `scale(${0.6 + 0.4 * nombre * pulso})`, fontSize: 150, fontWeight: TIPO.pesoDisplay, color: PALETA.tinta, letterSpacing: -4, lineHeight: 1 }}>
        Bolita <span style={{ color: PALETA.neon.lima, textShadow: `0 0 40px ${PALETA.neon.lima}99` }}>Lab</span>
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 1310, textAlign: 'center', opacity: interpolate(lema, [0, 1], [0, 1]), transform: `translateY(${(1 - lema) * 30}px)`, fontSize: 44, fontFamily: TIPO.texto, fontWeight: 700, color: PALETA.tintaSuave }}>
        {MARCA.lema}
      </div>
      <Html5Audio src={staticFile('audio/generado/intro.wav')} />
    </AbsoluteFill>
  );
};

/** Parte un título en ≤3 líneas lo más parejas posible (minimiza la línea más larga). */
const partirTitulo = (titulo: string, maxLineas = 3): string[] => {
  const pal = titulo.trim().split(/\s+/);
  let mejor: string[] = [titulo];
  let mejorLargo = Infinity;
  const probar = (desde: number, lineas: string[]) => {
    if (desde === pal.length) {
      const largo = Math.max(...lineas.map((l) => l.length));
      if (largo < mejorLargo || (largo === mejorLargo && lineas.length < mejor.length)) { mejor = lineas; mejorLargo = largo; }
      return;
    }
    if (lineas.length === maxLineas) return;
    for (let h = desde + 1; h <= pal.length; h++) probar(h, [...lineas, pal.slice(desde, h).join(' ')]);
  };
  probar(0, []);
  return mejor;
};

/**
 * Miniatura 1280×720 para los videos largos (compilaciones). Texto gigante en ≤3 líneas con
 * neón (la palabra más larga va en lima) y bolitas con estela de fondo. Props: { titulo }.
 */
export const Miniatura: React.FC<{ titulo: string }> = ({ titulo }) => {
  cargarFuentes();
  const lineas = partirTitulo(titulo.toUpperCase());
  const maxCar = Math.max(...lineas.map((l) => l.length));
  const ANCHO_TEXTO = 860;
  const fuente = Math.min(150, ANCHO_TEXTO / (maxCar * 0.6), 560 / (lineas.length * 0.98));
  const destacada = [...titulo.toUpperCase().split(/\s+/)].sort((a, b) => b.length - a.length)[0];
  const az = crearAzar(11);
  const fondo = Array.from({ length: 9 }, (_, i) => ({
    x: 900 + az() * 360, y: 60 + az() * 600, r: 16 + az() * 30, color: NEONES[(i + 1) % NEONES.length], dx: -(10 + az() * 10), dy: -(12 + az() * 12),
  }));
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 75% 50%, #1D1D3A 0%, ${PALETA.fondo} 70%)`, fontFamily: TIPO.display, overflow: 'hidden' }}>
      {/* Rejilla de clavijas tenue: guiño a la carrera */}
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(circle, #9A9AC433 5px, transparent 6px)`, backgroundSize: '80px 70px', opacity: 0.7 }} />
      {fondo.map((b, i) => <Bolita key={i} {...b} copias={4} />)}
      <Bolita x={1080} y={430} r={120} color={PALETA.neon.lima} dx={-38} dy={-34} copias={5} />
      <div style={{ position: 'absolute', left: 56, top: 0, bottom: 0, width: ANCHO_TEXTO + 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {lineas.map((l, i) => (
          <div key={i} style={{ fontSize: fuente, fontWeight: TIPO.pesoDisplay, lineHeight: 0.98, letterSpacing: -2, color: PALETA.tinta, whiteSpace: 'nowrap', textShadow: `0 6px 0 ${PALETA.fondo}, 0 0 28px ${PALETA.neon.cian}AA` }}>
            {l.split(' ').map((p, k) => (
              <span key={k} style={p === destacada ? { color: PALETA.neon.lima, textShadow: `0 6px 0 ${PALETA.fondo}, 0 0 30px ${PALETA.neon.lima}, 0 0 70px ${PALETA.neon.lima}88` } : undefined}>{k > 0 ? ' ' : ''}{p}</span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 60, bottom: 34, display: 'flex', alignItems: 'center', gap: 12, fontSize: 34, fontWeight: TIPO.pesoDisplay, color: PALETA.tinta, opacity: 0.9 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: PALETA.neon.lima, boxShadow: `0 0 16px ${PALETA.neon.lima}` }} />
        {MARCA.nombre}
      </div>
    </AbsoluteFill>
  );
};

export const registrar = (): React.ReactNode => (
  <>
    <Composition id="Logo" component={Logo} width={800} height={800} fps={FORMATO.fps} durationInFrames={1} />
    <Composition id="Banner" component={Banner} width={2560} height={1440} fps={FORMATO.fps} durationInFrames={1} />
    <Composition id="Miniatura" component={Miniatura} width={1280} height={720} fps={FORMATO.fps} durationInFrames={1} defaultProps={{ titulo: 'Los rebotes más satisfactorios de la semana' }} />
    <Composition id="Intro" component={Intro} width={FORMATO.ancho} height={FORMATO.alto} fps={FORMATO.fps} durationInFrames={90} />
  </>
);
