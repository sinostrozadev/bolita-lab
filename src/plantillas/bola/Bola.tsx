/**
 * Plantilla "bola": una bolita de neón rebotando dentro de un anillo con hueco giratorio.
 * No calcula física: lee `public/sim/<id>.json` (precalculado por scripts/simular-bola.mts)
 * y dibuja la posición de cada frame. El audio viene de `public/audio/generado/<id>.wav`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate,
  spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { FORMATO, NEONES, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { CAMPOS_POR_BOLA, type EventoSim, type GuionBola, type SimBola } from './guion';

const FRAMES_CIERRE = 72;
const FRAMES_GANCHO = 90;
/** Flash del anillo: 100 ms. Partículas: 0,3 s. */
const FRAMES_FLASH = 6;
const FRAMES_PARTICULA = 18;
/** Debe coincidir con FRAMES_CAMARA_LENTA de scripts/simular-bola.mts. */
const FRAMES_CAMARA_LENTA = 30;
const NOMBRES_NEON = Object.keys(PALETA.neon);

const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

/** Fija la duración desde las props (las escribe preparar-bola) o, si faltan, desde el sim. */
export const calcularMetadataBola: CalculateMetadataFunction<GuionBola> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(rutaSim(props.id));
  if (!res.ok) throw new Error(`no existe el sim de "${props.id}": corre scripts/preparar-bola.mts primero`);
  const sim = (await res.json()) as SimBola;
  return { durationInFrames: sim.duracionFrames, props: { ...props, duracionFrames: sim.duracionFrames } };
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
      <div style={{
        position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 32%, #ffffff 0%, ${color} 38%, ${color} 100%)`,
        boxShadow: `0 0 ${Math.min(r * 0.8, 36)}px ${color}`,
        opacity: opacidad,
      }} />
    </>
  );
};

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
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sim = useSim(props.id);

  const datos = useMemo(() => {
    if (!sim) return null;
    const rebotes = sim.eventos.filter((e) => e.tipo === 'rebote');
    const climax = sim.eventos.find((e) => e.tipo === 'escape' || e.tipo === 'lleno') ?? null;
    return { rebotes, climax };
  }, [sim]);

  if (!sim || !datos) return <AbsoluteFill style={{ background: PALETA.fondo }} />;

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

  // Gancho: entra con spring, sale a los 1,5 s.
  const entradaGancho = spring({ frame, fps, config: { damping: 14, stiffness: 140 } });
  const salidaGancho = interpolate(frame, [FRAMES_GANCHO - 14, FRAMES_GANCHO], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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
  const fadeCierre = interpolate(frame, [durationInFrames - FRAMES_CIERRE, durationInFrames - FRAMES_CIERRE + 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
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
        <Anillo sim={sim} frame={f} color={colorFlash} flash={flash} apagado={apagadoAnillo} />
        {/* Estelas: 4 copias de frames anteriores con opacidad decreciente */}
        {bolas.map((b) => [8, 6, 4, 2].map((atras, k) => {
          const fa = Math.max(0, f - atras);
          const filaA = sim.cuadros[fa];
          const r = filaA[b.idx * CAMPOS_POR_BOLA + 2] * (0.75 + 0.06 * k);
          return <Pelota key={`e-${b.idx}-${k}`} x={filaA[b.idx * CAMPOS_POR_BOLA]} y={filaA[b.idx * CAMPOS_POR_BOLA + 1]} r={r} color={b.color} opacidad={0.08 + 0.09 * k} estela />;
        }))}
        <Particulas eventos={recientes} frame={frame} />
        {bolas.map((b) => (
          sim.modo === 'crecer' && enFinal && b.idx === climax?.bola
            ? <Pelota key={b.idx} x={xLleno} y={yLleno} r={radioLleno} color={colorClimax} />
            // En escape con varias bolas, las que quedan dentro se apagan para que la ganadora destaque.
            : <Pelota key={b.idx} x={b.x} y={b.y} r={b.r} color={b.color}
                opacidad={sim.modo === 'escape' && enFinal && b.idx !== climax?.bola ? interpolate(trasClimax, [0, 20], [1, 0.3], { extrapolateRight: 'clamp' }) : 1} />
        ))}
      </AbsoluteFill>

      {/* Flash de pantalla en el clímax */}
      {flashPantalla > 0 && <AbsoluteFill style={{ background: colorClimax, opacity: flashPantalla, mixBlendMode: 'screen' }} />}

      {/* Gancho (primeros 1,5 s) */}
      {frame < FRAMES_GANCHO && (
        <Texto top={280} tam={props.gancho.length > 58 ? 52 : 62} escala={0.8 + 0.2 * entradaGancho} opacidad={entradaGancho * salidaGancho}>{props.gancho}</Texto>
      )}
      {/* Contador */}
      <Texto top={frame < FRAMES_GANCHO ? 430 : 300 + 130 * (1 - interpolate(frame, [FRAMES_GANCHO, FRAMES_GANCHO + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))} tam={76} escala={escalaContador} color={sobreLleno ? PALETA.fondo : PALETA.tinta} opacidad={fadeCierre}
        sombra={sobreLleno ? 'none' : `0 0 30px ${hexA(colorFlash, 0.5 + 0.5 * flash)}, 0 4px 18px rgba(0,0,0,0.6)`}>
        REBOTES: <span style={{ color: sobreLleno ? PALETA.fondo : colorFlash }}>{contador}</span>
      </Texto>

      {/* Cartel del clímax */}
      {enFinal && (
        <>
          <Texto top={sim.modo === 'crecer' ? 760 : 700} tam={100} escala={0.6 + 0.4 * entradaCartel} opacidad={entradaCartel * fadeCierre}
            color={sim.modo === 'crecer' ? PALETA.fondo : colorClimax}
            sombra={sim.modo === 'crecer' ? 'none' : `0 0 40px ${hexA(colorClimax, 0.9)}, 0 0 90px ${hexA(colorClimax, 0.5)}, 0 6px 24px rgba(0,0,0,0.7)`}>
            {textoFinal}
          </Texto>
          <Texto top={sim.modo === 'crecer' ? 900 : 960} tam={56} familia={TIPO.texto} peso={700} escala={1} opacidad={interpolate(trasClimax, [16, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) * fadeCierre}
            color={sim.modo === 'crecer' ? PALETA.fondo : PALETA.tinta} sombra={sim.modo === 'crecer' ? 'none' : undefined}>
            {subFinal}
          </Texto>
        </>
      )}

      <MarcaDeAgua />
      <Sequence from={durationInFrames - FRAMES_CIERRE} durationInFrames={FRAMES_CIERRE} name="Cierre">
        <Cierre color={colorClimax} />
      </Sequence>
    </AbsoluteFill>
  );
};
