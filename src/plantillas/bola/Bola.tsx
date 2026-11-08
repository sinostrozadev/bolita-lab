/**
 * Plantilla "bola": una bolita de neón rebotando dentro de un anillo con hueco giratorio.
 * No calcula física: lee `public/sim/<id>.json` (precalculado por scripts/simular-bola.mts)
 * y dibuja la posición de cada frame. El audio viene de `public/audio/generado/<id>.wav`.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate,
  spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { FORMATO, NEONES, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { Llamado, textoLlamado } from '../../marca/Llamado';
import { BloqueTexto } from '../../marca/BloqueTexto';
import { CAMPOS_POR_BOLA, ganchoAbajoDe, ganchoArribaDe, type EventoSim, type GuionBola, type SimBola } from './guion';

const FRAMES_CIERRE = 72;
/** Bloque de arriba (mecánica): bajo la marca de agua y sobre el anillo (borde exterior en y ≈ 462). */
const ARRIBA_TOP = FORMATO.seguro.arriba + 58;
/** Bloque de abajo (intriga): bajo el anillo (borde ≈ 1454) y sobre la UI de YouTube (1580). */
const ABAJO_CENTRO_Y = 1518;
/** Flash del anillo: 100 ms. Partículas: 0,3 s. */
const FRAMES_FLASH = 6;
const FRAMES_PARTICULA = 18;
/** Debe coincidir con FRAMES_CAMARA_LENTA de scripts/simular-bola.mts. */
const FRAMES_CAMARA_LENTA = 30;
const NOMBRES_NEON = Object.keys(PALETA.neon);
/** Llamado a suscribirse: entra 6 s antes del escape/llenado, en la parte alta del interior del anillo
 * (bajo el bloque de arriba; el contador va al centro del anillo). */
const LLAMADO_ANTES = 6 * 60;
const LLAMADO_CENTRO_Y = 548;

const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

/** Fija la duración desde las props (las escribe preparar-bola, cold open incluido) o, si faltan, desde el sim. */
export const calcularMetadataBola: CalculateMetadataFunction<GuionBola> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(rutaSim(props.id));
  if (!res.ok) throw new Error(`no existe el sim de "${props.id}": corre scripts/preparar-bola.mts primero`);
  const sim = (await res.json()) as SimBola;
  const total = sim.duracionFrames + (sim.coldOpenFrames ?? 0);
  return { durationInFrames: total, props: { ...props, duracionFrames: total } };
};

const useSim = (id: string) => {
  const [sim, setSim] = useState<SimBola | null>(null);
  const [handle] = useState(() => delayRender(`cargar sim ${id}`));
  useEffect(() => {
    let vivo = true;
    fetch(rutaSim(id))
      .then((r) => { if (!r.ok) throw new Error(`sim no encontrado: ${id}`); return r.json(); })
      .then((s: SimBola) => { if (vivo) { setSim(s); continueRender(handle); } })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [id, handle]);
  return sim;
};

/** Hash determinista para las partículas (no se usa Math.random). */
const hash = (n: number) => {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

const hexA = (hex: string, alfa: number) => {
  const a = Math.round(Math.max(0, Math.min(1, alfa)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
};

/** Arco del anillo (todo menos el hueco) como path SVG. */
const arcoAnillo = (cx: number, cy: number, r: number, centro: number, semi: number) => {
  if (semi <= 0) return null; // sin hueco: se dibuja un círculo
  const a1 = ((centro + semi) * Math.PI) / 180;
  const a2 = ((centro - semi + 360) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  const largo = 360 - 2 * semi > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largo} 1 ${x2} ${y2}`;
};

const Anillo: React.FC<{ sim: SimBola; frame: number; color: string; flash: number; apagado: number }> = ({ sim, frame, color, flash, apagado }) => {
  const { cx, cy, r, grosor } = sim.anillo;
  const centro = sim.hueco[Math.min(frame, sim.hueco.length - 1)] ?? 0;
  const semi = sim.huecoSemi[Math.min(frame, sim.huecoSemi.length - 1)] ?? 0;
  const d = arcoAnillo(cx, cy, r, centro, semi);
  const base = '#3A3A5C';
  const opacidad = 1 - apagado;
  const glow = 10 + 26 * flash;
  const comun = { fill: 'none', strokeLinecap: 'round' as const };
  const trazo = (anchoExtra: number, op: number, blur: number, col: string) =>
    d ? (
      <path d={d} {...comun} stroke={col} strokeWidth={grosor + anchoExtra} opacity={op * opacidad} style={blur ? { filter: `blur(${blur}px)` } : undefined} />
    ) : (
      <circle cx={cx} cy={cy} r={r} {...comun} stroke={col} strokeWidth={grosor + anchoExtra} opacity={op * opacidad} style={blur ? { filter: `blur(${blur}px)` } : undefined} />
    );
  return (
    <svg width={FORMATO.ancho} height={FORMATO.alto} style={{ position: 'absolute', inset: 0 }}>
      {/* halo ancho (glow) */}
      {trazo(18 + glow, 0.35 + 0.45 * flash, 14 + glow, color)}
      {/* trazo base */}
      {trazo(0, 1, 0, base)}
      {/* glow cercano */}
      {trazo(6, 0.55 + 0.45 * flash, 5, color)}
      {/* línea nítida del color de la bola, al máximo durante el flash */}
      {trazo(0, 0.7 + 0.3 * flash, 0, color)}
      {/* brillo interior fino */}
      {trazo(-grosor * 0.65, 0.25 + 0.75 * flash, 0, PALETA.tinta)}
    </svg>
  );
};

/**
 * Trazas persistentes (como satisfying.ba11s): cada posición pasada de cada bola queda dibujada como un
 * disco de su tamaño, con un tono que avanza poco a poco y salta en cada rebote; el círculo se va
 * llenando de color hasta saturarse. Un solo <canvas> (no miles de nodos): se dibuja en
 * useLayoutEffect, incremental si el frame avanza (render secuencial) y desde cero si retrocede o es
 * el primero de la pestaña. Mismas operaciones en el mismo orden → mismos píxeles (determinista).
 * Costo medido: < 15 ms por frame desde cero con ~2.700 frames × 3 bolas.
 */
const Trazas: React.FC<{ sim: SimBola; hasta: number; tonos: Float32Array[] }> = ({ sim, hasta, tonos }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujado = useRef(-1);
  const { cx, cy, r: R, grosor } = sim.anillo;
  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let desde = dibujado.current + 1;
    if (dibujado.current < 0 || hasta < dibujado.current) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      desde = 0;
    }
    if (hasta >= desde) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - grosor / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.lineWidth = 3;
      for (let k = desde; k <= hasta; k++) {
        const fila = sim.cuadros[k];
        if (!fila) break;
        for (let i = 0; i < sim.bolas; i++) {
          const h = tonos[i][k];
          ctx.beginPath();
          ctx.arc(fila[i * CAMPOS_POR_BOLA], fila[i * CAMPOS_POR_BOLA + 1], Math.max(4, fila[i * CAMPOS_POR_BOLA + 2] * 0.97), 0, Math.PI * 2);
          ctx.fillStyle = `hsl(${h.toFixed(1)} 95% 56%)`;
          ctx.fill();
          ctx.strokeStyle = `hsl(${h.toFixed(1)} 100% 22%)`;
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    dibujado.current = hasta;
  }, [hasta, sim, tonos, cx, cy, R, grosor]);
  return <canvas ref={ref} width={FORMATO.ancho} height={FORMATO.alto} style={{ position: 'absolute', left: 0, top: 0, width: FORMATO.ancho, height: FORMATO.alto }} />;
};

/** Tono (0–360) de la traza de cada bola en cada frame: deriva lenta + salto de 31° por rebote propio. */
const calcularTonos = (sim: SimBola): Float32Array[] => {
  const n = sim.cuadros.length;
  return Array.from({ length: sim.bolas }, (_, i) => {
    const tonos = new Float32Array(n);
    const rebotes = sim.eventos.filter((e) => e.tipo === 'rebote' && e.bola === i);
    let j = 0;
    let h = (sim.semillaUsada % 360) + i * 120;
    for (let k = 0; k < n; k++) {
      while (j < rebotes.length && rebotes[j].frame <= k) { h += 31; j++; }
      tonos[k] = (h + 0.35 * k) % 360;
    }
    return tonos;
  });
};

const Particulas: React.FC<{ eventos: EventoSim[]; frame: number }> = ({ eventos, frame }) => (
  <>
    {eventos.map((e, k) => {
      const edad = frame - e.frame;
      if (edad < 0 || edad > FRAMES_PARTICULA) return null;
      const n = 6 + Math.floor(hash(e.frame * 7 + k) * 5); // 6–10 puntos
      const color = NEONES[e.color % NEONES.length];
      return Array.from({ length: n }, (_, i) => {
        const semillaP = e.frame * 131 + i * 17 + k;
        const desvio = (hash(semillaP) - 0.5) * 110; // ±55° alrededor de la normal
        const ang = ((e.ang + desvio) * Math.PI) / 180;
        const vel = 7 + hash(semillaP + 1) * 9;
        const dist = vel * edad * (1 - edad / 45);
        const op = interpolate(edad, [0, 2, FRAMES_PARTICULA], [0, 1, 0]);
        const tam = interpolate(edad, [0, FRAMES_PARTICULA], [10, 2]);
        return (
          <div key={`${k}-${i}`} style={{
            position: 'absolute', left: e.x + Math.cos(ang) * dist - tam / 2, top: e.y + Math.sin(ang) * dist - tam / 2,
            width: tam, height: tam, borderRadius: '50%', background: color, opacity: op * (0.6 + 0.4 * e.fuerza),
            boxShadow: `0 0 ${tam}px ${color}`,
          }} />
        );
      });
    })}
  </>
);

/**
 * Bola: núcleo con degradado radial (brillo arriba-izquierda) + halo como degradado en un div aparte.
 * No usamos box-shadow con blur grande: Chrome lo recorta en un cuadrado visible cuando la bola crece.
 */
const Pelota: React.FC<{ x: number; y: number; r: number; color: string; opacidad?: number; estela?: boolean }> = ({ x, y, r, color, opacidad = 1, estela }) => {
  if (estela) {
    return <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', background: color, opacity: opacidad }} />;
  }
  const rh = r * (r > 200 ? 1.5 : 2.8);
  return (
    <>
      {r < 700 && (
        <div style={{
          position: 'absolute', left: x - rh, top: y - rh, width: rh * 2, height: rh * 2, borderRadius: '50%', opacity: opacidad,
          background: `radial-gradient(circle closest-side, ${hexA(color, 0.6)} 0%, ${hexA(color, 0.32)} ${(r / rh) * 100}%, ${hexA(color, 0.1)} ${(r / rh) * 100 + 18}%, ${hexA(color, 0)} 100%)`,
        }} />
      )}
      {/* Borde blanco: la bola se distingue de sus propias trazas de color. */}
      <div style={{
        position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', boxSizing: 'border-box',
        background: `radial-gradient(circle at 35% 32%, #ffffff 0%, ${color} 38%, ${color} 100%)`,
        border: `${Math.max(4, Math.min(14, r * 0.07))}px solid #FFFFFFEE`,
        boxShadow: `0 0 ${Math.min(r * 0.8, 36)}px ${color}, 0 0 0 3px ${PALETA.fondo}AA`,
        opacity: opacidad,
      }} />
    </>
  );
};

/** Tamaño del bloque de arriba según el largo (≤ 2 líneas en ~960 px; guiones viejos de hasta 90 caracteres, 3). */
const tamArriba = (t: string) => (t.length <= 30 ? 70 : t.length <= 46 ? 62 : t.length <= 64 ? 54 : 46);

const Texto: React.FC<{ children: React.ReactNode; top: number; tam: number; color?: string; escala?: number; opacidad?: number; familia?: string; sombra?: string; peso?: number }> = ({ children, top, tam, color = PALETA.tinta, escala = 1, opacidad = 1, familia = TIPO.display, sombra, peso = TIPO.pesoDisplay }) => (
  <div style={{
    position: 'absolute', top, left: FORMATO.seguro.lados, width: FORMATO.ancho - FORMATO.seguro.lados * 2,
    textAlign: 'center', fontFamily: familia, fontWeight: peso, fontSize: tam, lineHeight: 1.1, color,
    transform: `scale(${escala})`, opacity: opacidad, letterSpacing: -1, textShadow: sombra ?? `0 0 24px ${hexA(color, 0.6)}, 0 4px 18px rgba(0,0,0,0.6)`,
    textWrap: 'balance' as never,
  }}>
    {children}
  </div>
);

export const Bola: React.FC<GuionBola> = (props) => {
  cargarFuentes();
  const F = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sim = useSim(props.id);

  const datos = useMemo(() => {
    if (!sim) return null;
    const rebotes = sim.eventos.filter((e) => e.tipo === 'rebote');
    const climax = sim.eventos.find((e) => e.tipo === 'escape' || e.tipo === 'lleno') ?? null;
    return { rebotes, climax, tonos: calcularTonos(sim) };
  }, [sim]);

  if (!sim || !datos) return <AbsoluteFill style={{ background: PALETA.fondo }} />;

  // Cold open: los primeros `co` frames muestran 0,4 s del final (escape: justo antes de salir;
  // crecer: con la bola a ~2/3 del radio, trazas ya saturadas) con el rótulo "así termina ↓"; luego corte seco al inicio de la simulación.
  // `frame` es el tiempo de SIMULACIÓN (lo que indexa cuadros/eventos); `F` el del video.
  const co = sim.coldOpenFrames ?? 0;
  const enColdOpen = F < co;
  const frame = enColdOpen ? Math.max(0, (sim.coldOpenDesde ?? sim.climaxFrame - co)) + F : F - co;
  const conTrazas = props.trazas !== false;

  const f = Math.min(frame, sim.cuadros.length - 1);
  const fila = sim.cuadros[f];
  const { climax, rebotes } = datos;
  const climaxFrame = climax ? climax.frame : Infinity;
  const trasClimax = Math.max(0, frame - climaxFrame);
  const enFinal = frame >= climaxFrame;

  // Rebotes contados hasta este frame (se congela en el clímax).
  const limite = Math.min(frame, climaxFrame);
  let contador = 0;
  for (const e of rebotes) { if (e.frame <= limite) contador++; else break; }
  const ultimoRebote = rebotes.filter((e) => e.frame <= limite).at(-1) ?? null;

  // Eventos recientes para flash y partículas.
  const recientes = sim.eventos.filter((e) => e.frame <= frame && frame - e.frame <= FRAMES_PARTICULA && (e.tipo === 'rebote' || e.tipo === 'choque'));
  // El anillo toma el color de la última bola que rebotó; el flash dura 100 ms.
  let flash = 0;
  let colorFlash = NEONES[fila[3] % NEONES.length];
  const ultimoEvento = sim.eventos.filter((e) => e.tipo === 'rebote' && e.frame <= frame).at(-1);
  if (ultimoEvento) colorFlash = NEONES[ultimoEvento.color % NEONES.length];
  for (const e of recientes) {
    if (e.tipo !== 'rebote') continue;
    const v = interpolate(frame - e.frame, [0, FRAMES_FLASH], [1, 0], { extrapolateRight: 'clamp' }) * (0.65 + 0.35 * e.fuerza);
    if (v > flash) flash = v;
  }
  const pulso = ultimoRebote ? spring({ frame: frame - ultimoRebote.frame, fps, config: { damping: 9, stiffness: 300 } }) : 1;
  const escalaContador = ultimoRebote ? 1 + 0.18 * (1 - pulso) : 1;

  // El contador (centro del anillo) entra con pop en el corte del cold open y se va en el clímax.
  const entradaContador = enColdOpen ? 0 : spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
  const salidaContador = interpolate(frame, [climaxFrame, climaxFrame + 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const colorGancho = NEONES[sim.cuadros[0][3] % NEONES.length];

  // Final: zoom-out (escape) o expansión (crecer).
  // Escape: zoom 1,15 hacia el punto de fuga durante la cámara lenta (el sim ya trae 0,5 s a 0,12×).
  const zoom = enFinal && sim.modo === 'escape'
    ? 1 + 0.15 * interpolate(trasClimax, [0, 10, FRAMES_CAMARA_LENTA, FRAMES_CAMARA_LENTA + 40], [0, 1, 1, 0.35], { extrapolateRight: 'clamp', easing: (x) => x * x * (3 - 2 * x) })
    : 1;
  const origenZoom = climax && sim.modo === 'escape'
    ? `${(sim.anillo.cx + climax.x) / 2}px ${(sim.anillo.cy + climax.y) / 2}px`
    : `${sim.anillo.cx}px ${sim.anillo.cy}px`;
  const colorClimax = climax ? NEONES[climax.color % NEONES.length] : NEONES[0];
  const expansion = enFinal && sim.modo === 'crecer' ? spring({ frame: trasClimax, fps, config: { damping: 18, stiffness: 50 }, durationInFrames: 70 }) : 0;
  // Crecer: desde el radio/posición reales del clímax hasta tapar la pantalla con su color.
  const filaClimax = climax ? sim.cuadros[Math.min(climax.frame, sim.cuadros.length - 1)] : fila;
  const bc = climax?.bola ?? 0;
  const rClimax = filaClimax[bc * CAMPOS_POR_BOLA + 2];
  const radioLleno = interpolate(expansion, [0, 1], [rClimax, 1500]);
  const xLleno = interpolate(expansion, [0, 1], [filaClimax[bc * CAMPOS_POR_BOLA], FORMATO.ancho / 2]);
  const yLleno = interpolate(expansion, [0, 1], [filaClimax[bc * CAMPOS_POR_BOLA + 1], FORMATO.alto / 2]);
  const flashPantalla = enFinal ? interpolate(trasClimax, [0, 2, 12], [0, 0.7, 0], { extrapolateRight: 'clamp' }) : 0;
  // Los textos se apagan cuando entra el cartel de cierre.
  const fadeCierre = interpolate(F, [durationInFrames - FRAMES_CIERRE, durationInFrames - FRAMES_CIERRE + 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const entradaCartel = enFinal ? spring({ frame: trasClimax - 8, fps, config: { damping: 11, stiffness: 150 } }) : 0;
  const textoFinal = sim.modo === 'escape' ? `¡ESCAPÓ EN EL REBOTE ${sim.rebotesTotales}!` : sim.bolas > 1 ? 'LLENARON EL CÍRCULO' : 'LLENÓ EL CÍRCULO';
  const nombreGanadora = climax ? NOMBRES_NEON[climax.color % NOMBRES_NEON.length] : '';
  const subFinal = sim.modo === 'crecer'
    ? `tras ${sim.rebotesTotales} rebotes`
    : sim.bolas > 1 ? `escapó la ${nombreGanadora} · ¿acertaste?` : '¿acertaste?';
  const apagadoAnillo = sim.modo === 'crecer' ? expansion : 0;
  /** En crecer, cuando el color ya tapó la pantalla los textos pasan a tinta oscura. */
  const sobreLleno = sim.modo === 'crecer' && expansion > 0.3;

  const bolas = Array.from({ length: sim.bolas }, (_, i) => ({
    x: fila[i * CAMPOS_POR_BOLA], y: fila[i * CAMPOS_POR_BOLA + 1], r: fila[i * CAMPOS_POR_BOLA + 2],
    color: NEONES[fila[i * CAMPOS_POR_BOLA + 3] % NEONES.length], idx: i,
  }));

  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      <Audio src={rutaAudio(props.id)} />
      {/* Viñeta radial sutil + un leve tinte del color actual */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 48%, ${hexA(colorFlash, 0.07 + 0.08 * flash)} 0%, ${PALETA.fondo2}00 45%, #000000aa 100%)` }} />

      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: origenZoom }}>
        {conTrazas && <Trazas sim={sim} hasta={Math.min(f, climax && sim.modo === 'escape' ? climax.frame : f)} tonos={datos.tonos} />}
        {/* Escape: velo oscuro sobre las trazas tras la salida, para que el cartel se lea (sobre el arcoíris
            un texto del color de la ganadora desaparece; medido en el render de prueba). */}
        {enFinal && sim.modo === 'escape' && conTrazas && (
          <AbsoluteFill style={{ background: PALETA.fondo, borderRadius: '50%', left: sim.anillo.cx - sim.anillo.r, top: sim.anillo.cy - sim.anillo.r, width: sim.anillo.r * 2, height: sim.anillo.r * 2, opacity: 0.72 * interpolate(trasClimax, [0, 14], [0, 1], { extrapolateRight: 'clamp' }) }} />
        )}
        <Anillo sim={sim} frame={f} color={colorFlash} flash={flash} apagado={apagadoAnillo} />
        {/* Estelas: 4 copias de frames anteriores con opacidad decreciente */}
        {bolas.map((b) => [8, 6, 4, 2].map((atras, k) => {
          const fa = Math.max(0, f - atras);
          const filaA = sim.cuadros[fa];
          const r = filaA[b.idx * CAMPOS_POR_BOLA + 2] * (0.75 + 0.06 * k);
          return <Pelota key={`e-${b.idx}-${k}`} x={filaA[b.idx * CAMPOS_POR_BOLA]} y={filaA[b.idx * CAMPOS_POR_BOLA + 1]} r={r} color={b.color} opacidad={0.08 + 0.09 * k} estela />;
        }))}
        <Particulas eventos={recientes} frame={frame} />
        {bolas.filter((b) => !(sim.modo === 'crecer' && enFinal && b.idx === climax?.bola)).map((b) => (
          // En escape con varias bolas, las que quedan dentro se apagan para que la ganadora destaque.
          // En crecer, las demás desaparecen mientras la ganadora tapa la pantalla.
          <Pelota key={b.idx} x={b.x} y={b.y} r={b.r} color={b.color}
            opacidad={enFinal && b.idx !== climax?.bola
              ? (sim.modo === 'escape' ? interpolate(trasClimax, [0, 20], [1, 0.3], { extrapolateRight: 'clamp' }) : 1 - expansion)
              : 1} />
        ))}
        {/* La bola que llena el círculo se dibuja al final, encima de todas. */}
        {sim.modo === 'crecer' && enFinal && climax && <Pelota x={xLleno} y={yLleno} r={radioLleno} color={colorClimax} />}
      </AbsoluteFill>

      {/* Flash de pantalla en el clímax */}
      {flashPantalla > 0 && <AbsoluteFill style={{ background: colorClimax, opacity: flashPantalla, mixBlendMode: 'screen' }} />}

      {/* Contador al centro del anillo (encima de bola y trazas, con contorno oscuro) */}
      {!enColdOpen && !enFinal && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: sim.anillo.cy - 95, textAlign: 'center', pointerEvents: 'none',
          opacity: Math.min(1, entradaContador) * salidaContador * fadeCierre, transform: `scale(${escalaContador * (0.7 + 0.3 * entradaContador)})`,
          fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, color: PALETA.tinta,
          WebkitTextStroke: `10px ${hexA(PALETA.fondo, 0.85)}`, paintOrder: 'stroke fill',
          textShadow: `0 0 30px ${hexA(colorFlash, 0.5 + 0.5 * flash)}, 0 4px 18px rgba(0,0,0,0.6)`,
        }}>
          <div style={{ fontSize: 40, letterSpacing: 6, WebkitTextStroke: `7px ${hexA(PALETA.fondo, 0.85)}` }}>REBOTES</div>
          <div style={{ fontSize: 140, lineHeight: 1 }}>{contador}</div>
        </div>
      )}
      {/* Cold open: rótulo pequeño "así termina ↓" sobre el estado final */}
      {enColdOpen && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: LLAMADO_CENTRO_Y - 36, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            height: 72, padding: '0 30px', borderRadius: 999, display: 'flex', alignItems: 'center',
            background: hexA(PALETA.fondo, 0.85), border: `3px solid ${hexA(PALETA.tinta, 0.8)}`,
            fontFamily: TIPO.texto, fontWeight: 800, fontSize: 40, color: PALETA.tinta, letterSpacing: 1,
          }}>así termina ↓</div>
        </div>
      )}

      {/* Cartel del clímax */}
      {enFinal && (
        <>
          <Texto top={sim.modo === 'crecer' ? 760 : 700} tam={textoFinal.length > 16 && sim.modo === 'crecer' ? 84 : 100} escala={0.6 + 0.4 * entradaCartel} opacidad={entradaCartel * fadeCierre}
            color={sim.modo === 'crecer' ? PALETA.fondo : colorClimax}
            sombra={sim.modo === 'crecer' ? 'none' : `0 0 40px ${hexA(colorClimax, 0.9)}, 0 0 90px ${hexA(colorClimax, 0.5)}, 0 6px 24px rgba(0,0,0,0.7)`}>
            {textoFinal}
          </Texto>
          <Texto top={sim.modo === 'crecer' ? 930 : 960} tam={56} familia={TIPO.texto} peso={700} escala={1} opacidad={interpolate(trasClimax, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * fadeCierre}
            color={sim.modo === 'crecer' ? PALETA.fondo : PALETA.tinta} sombra={sim.modo === 'crecer' ? 'none' : undefined}>
            {subFinal}
          </Texto>
        </>
      )}

      {/* Llamado a suscribirse en el clímax (fuera del zoom: no se mueve con la cámara). Color de marca:
          el de la bola ganadora delataría cuál escapa. */}
      <Llamado texto={textoLlamado('bola', props.id, props.llamado)}
        desde={Math.max(co + 120, climax ? co + climax.frame - LLAMADO_ANTES : durationInFrames - FRAMES_CIERRE - LLAMADO_ANTES)}
        hasta={durationInFrames - FRAMES_CIERRE} centroY={LLAMADO_CENTRO_Y} color={PALETA.neon.lima} />

      {/* Dos bloques fijos (frame 0 → cierre): mecánica arriba, intriga abajo. */}
      <BloqueTexto texto={ganchoArribaDe(props)} color={colorGancho} top={ARRIBA_TOP} tam={tamArriba(ganchoArribaDe(props))} opacidad={fadeCierre} />
      <BloqueTexto texto={ganchoAbajoDe(props)} color={PALETA.neon.magenta} centroY={ABAJO_CENTRO_Y} tam={60} opacidad={fadeCierre} />

      <MarcaDeAgua />
      <Sequence from={durationInFrames - FRAMES_CIERRE} durationInFrames={FRAMES_CIERRE} name="Cierre">
        <Cierre color={colorClimax} />
      </Sequence>
    </AbsoluteFill>
  );
};
