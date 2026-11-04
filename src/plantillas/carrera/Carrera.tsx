import React, { useEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Easing, Html5Audio, Sequence, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATO, NEONES, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { crearAzar } from '../../lib/azar';
import type { GuionCarrera, IconoCompetidor } from './guion';
import { Icono, iconoAportaJuntoAlNombre } from './Icono';
import { CIERRE_FRAMES, type SimulacionCarrera } from './tipos';

/** Ruta pública del JSON de simulación de un guion. */
export const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
export const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

const { seguro } = FORMATO;
const ANCHO = FORMATO.ancho;
const ALTO_PANTALLA = FORMATO.alto;

/** Destello de una clavija golpeada: 7 frames ≈ 120 ms. */
const DESTELLO_FRAMES = 7;
/** Copias de la estela (frames hacia atrás). */
const ESTELA = [2, 4, 6, 8, 10];
/** Zoom máximo de la llegada en cámara lenta. */
const ZOOM_META = 1.38;
/** Marcador: alto de fila y cuántas posiciones se muestran. */
const FILA = 60;
const PUESTOS = 3;
const MARCADOR_TOP = seguro.arriba;
/** Las etiquetas viven entre el marcador y la UI inferior de YouTube. */
const ETIQ_MIN = MARCADOR_TOP + PUESTOS * FILA + 50;
const ETIQ_MAX = ALTO_PANTALLA - seguro.abajo - 30;
const ETIQ_FUENTE = 32;
const ETIQ_ALTO = 48;
/** El gancho (la pregunta) se ve desde el frame 0 y se va con un corte limpio a los 1,8 s. */
const GANCHO_FRAMES = 108;
/** Etiquetas: se apagan si la bola tiene otra a menos de 1,5 diámetros (si no, se montan). */
const ETIQ_SEPARACION = [1.6, 1.9];
/** Icono dentro de la bolita: fracción del diámetro. */
const ICONO_EN_BOLA = 0.55;
/** Icono dentro de la etiqueta (px). */
const ETIQ_ICONO = 30;

/** Hook: carga la simulación precalculada con delayRender. */
const useSimulacion = (id: string) => {
  const [sim, setSim] = useState<SimulacionCarrera | null>(null);
  const [handle] = useState(() => delayRender(`carrera: cargando sim/${id}.json`));
  useEffect(() => {
    let vivo = true;
    fetch(rutaSim(id))
      .then((r) => { if (!r.ok) throw new Error(`No existe public/sim/${id}.json (corre scripts/preparar-carrera.mts)`); return r.json(); })
      .then((s: SimulacionCarrera) => {
        if (s.version !== 2) throw new Error(`public/sim/${id}.json es de una versión vieja: vuelve a correr scripts/preparar-carrera.mts`);
        if (vivo) { setSim(s); continueRender(handle); }
      })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [id, handle]);
  return sim;
};

const ORDINAL = ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º'];
/** Fila con el resto del resultado, bajo "GANA" y sobre la UI inferior de YouTube. */
const RESULTADO_TOP = 1330;
const fr = (sim: SimulacionCarrera, frame: number) => Math.max(0, Math.min(frame, sim.duracionFrames - 1));

/** Zoom de la llegada: punto fijo (en pantalla) y factor para un frame. */
const zoomEn = (sim: SimulacionCarrera, frame: number) => {
  const { desde } = sim.camaraLenta;
  const z = interpolate(frame, [desde, desde + 26], [1, ZOOM_META], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const xg = sim.posiciones[sim.ganadora][fr(sim, sim.frameGanadora)][0];
  // Anclado en la x de la ganadora: el zoom la deja quieta (nunca la empuja fuera del cuadro).
  const ax = xg;
  const ay = sim.tablero.metaY - sim.camara[fr(sim, frame)];
  return { z, ax, ay };
};

// ---------------- Capas ----------------

const Tablero: React.FC<{ sim: SimulacionCarrera; cam: number; frame: number; colores: string[] }> = ({ sim, cam, frame, colores }) => {
  const desde = cam - 120, hasta = cam + ALTO_PANTALLA + 120;
  // Clavijas golpeadas en los últimos 120 ms → se iluminan del color de la bola.
  const destellos = useMemo(() => {
    const m = new Map<number, { color: string; edad: number }>();
    for (let k = sim.eventos.length - 1; k >= 0; k--) {
      const ev = sim.eventos[k];
      if (ev.frame > frame) continue;
      if (frame - ev.frame >= DESTELLO_FRAMES) break; // eventos ordenados por frame
      if (ev.tipo !== 'clavija' || ev.clavija === undefined || m.has(ev.clavija)) continue;
      m.set(ev.clavija, { color: colores[ev.bola], edad: frame - ev.frame });
    }
    return m;
  }, [sim, frame, colores]);
  const { metaY } = sim.tablero;
  const cuadro = 40;

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: ANCHO, height: sim.tablero.alto, transform: `translateY(${-cam}px)` }}>
      {/* Paredes laterales */}
      {[0, ANCHO - 6].map((x) => (
        <div key={x} style={{ position: 'absolute', left: x, top: desde, width: 6, height: hasta - desde, background: `${PALETA.neon.cian}40`, boxShadow: `0 0 22px ${PALETA.neon.cian}55` }} />
      ))}
      {/* Clavijas visibles: glow suave en reposo, destello del color de la bola al golpe */}
      {sim.clavijas.map((c, i) => {
        if (c.y < desde || c.y > hasta) return null;
        const d = destellos.get(i);
        if (!d) {
          return <div key={i} style={{
            position: 'absolute', left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 2, borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #C9C9F0 0, #7C7CAE 60%)', boxShadow: '0 0 12px rgba(157,92,255,0.45)',
          }} />;
        }
        const brillo = interpolate(d.edad, [0, DESTELLO_FRAMES], [1, 0], { easing: Easing.out(Easing.quad) });
        const r = c.r * (1 + 0.45 * brillo);
        return <div key={i} style={{
          position: 'absolute', left: c.x - r, top: c.y - r, width: r * 2, height: r * 2, borderRadius: '50%',
          background: `radial-gradient(circle at 40% 35%, #FFFFFF 0, ${d.color} 55%)`,
          boxShadow: `0 0 ${14 + brillo * 26}px ${d.color}, 0 0 ${30 + brillo * 50}px ${d.color}99`,
        }} />;
      })}
      {/* Rampas y embudos */}
      {sim.segmentos.map((s, i) => {
        if (Math.max(s.y1, s.y2) < desde || Math.min(s.y1, s.y2) > hasta) return null;
        const largo = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
        const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
        return (
          <div key={i} style={{
            position: 'absolute', left: s.x1, top: s.y1 - s.grosor / 2, width: largo, height: s.grosor, borderRadius: s.grosor,
            transformOrigin: '0 50%', transform: `rotate(${ang}deg)`,
            background: `linear-gradient(90deg, ${PALETA.fondo2}, #2B2B52)`, border: `2px solid ${PALETA.neon.violeta}AA`,
            boxShadow: `0 0 24px ${PALETA.neon.violeta}77, inset 0 0 10px ${PALETA.neon.violeta}33`,
          }} />
        );
      })}
      {/* Meta: bandera a cuadros de dos filas + rótulo */}
      {metaY > desde - 300 && metaY < hasta + 300 && (
        <>
          <div style={{
            position: 'absolute', left: 0, top: metaY - 170, width: ANCHO, textAlign: 'center',
            fontFamily: TIPO.display, fontWeight: 800, fontSize: 120, letterSpacing: 22, color: `${PALETA.tinta}38`,
            textShadow: `0 0 30px ${PALETA.neon.lima}33`,
          }}>META</div>
          <div style={{
            position: 'absolute', left: 0, top: metaY - cuadro / 2, width: ANCHO, height: cuadro,
            backgroundImage: `conic-gradient(${PALETA.tinta} 25%, ${PALETA.fondo} 0 50%, ${PALETA.tinta} 0 75%, ${PALETA.fondo} 0)`,
            backgroundSize: `${cuadro}px ${cuadro}px`, boxShadow: `0 0 30px ${PALETA.tinta}88, 0 0 60px ${PALETA.neon.lima}44`, opacity: 0.92,
          }} />
          <div style={{ position: 'absolute', left: 0, top: metaY + cuadro / 2, width: ANCHO, height: 700, background: `linear-gradient(180deg, ${PALETA.neon.lima}26, transparent 60%)` }} />
        </>
      )}
    </div>
  );
};

interface CajaEtiqueta { i: number; x: number; y: number; w: number; op: number }

/** Coloca las etiquetas junto a su bola, sin salirse de la zona segura ni pisarse entre sí. */
const colocarEtiquetas = (sim: SimulacionCarrera, f: number, cam: number, etiquetas: string[], conIcono: boolean[]): CajaEtiqueta[] => {
  const r = sim.tablero.radioBola;
  const cajas: CajaEtiqueta[] = [];
  sim.posiciones.forEach((pos, i) => {
    const [x, y] = pos[f];
    const sy = y - cam;
    const w = etiquetas[i].length * ETIQ_FUENTE * 0.72 + 34 + (conIcono[i] ? ETIQ_ICONO + 8 : 0);
    const derecha = x + r + 14;
    const izquierda = x - r - 14 - w;
    let lx: number;
    if (derecha + w <= ANCHO - seguro.lados) lx = derecha;
    else if (izquierda >= seguro.lados) lx = izquierda;
    else lx = Math.max(seguro.lados, Math.min(ANCHO - seguro.lados - w, x - w / 2));
    // Bolas rezagadas (bajo el marcador o fuera de cuadro): sin etiqueta; el marcador ya las nombra.
    if (sy < ETIQ_MIN - 2 * r || sy > ALTO_PANTALLA) return;
    // Bolas apiñadas (p. ej. la salida): sin etiqueta; el icono dentro de la bola ya las identifica.
    let cerca = Infinity;
    sim.posiciones.forEach((otra, j) => { if (j !== i) cerca = Math.min(cerca, Math.hypot(otra[f][0] - x, otra[f][1] - y)); });
    const op = interpolate(cerca / (2 * r), ETIQ_SEPARACION, [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (op <= 0) return;
    cajas.push({ i, x: lx, y: Math.max(ETIQ_MIN, Math.min(ETIQ_MAX, sy)), w, op });
  });
  // Separación vertical de las que se solapan en horizontal.
  const orden = [...cajas].sort((a, b) => a.y - b.y || a.i - b.i);
  for (let k = 0; k < orden.length; k++) {
    for (let j = 0; j < k; j++) {
      const a = orden[j], b = orden[k];
      const solapaX = a.x < b.x + b.w && b.x < a.x + a.w;
      if (solapaX && b.y - a.y < ETIQ_ALTO) b.y = a.y + ETIQ_ALTO;
    }
  }
  return cajas;
};

const Bolas: React.FC<{ sim: SimulacionCarrera; cam: number; frame: number; colores: string[]; etiquetas: string[]; iconos: (IconoCompetidor | undefined)[]; mostrarEtiquetas: number }> = ({ sim, cam, frame, colores, etiquetas, iconos, mostrarEtiquetas }) => {
  const f = fr(sim, frame);
  const r = sim.tablero.radioBola;
  const cajas = mostrarEtiquetas > 0 ? colocarEtiquetas(sim, f, cam, etiquetas, iconos.map(iconoAportaJuntoAlNombre)) : [];
  const tamIcono = r * 2 * ICONO_EN_BOLA;
  return (
    <AbsoluteFill>
      {sim.posiciones.map((pos, i) => {
        const [x, y] = pos[f];
        const sy = y - cam;
        if (sy < -260 || sy > ALTO_PANTALLA + 260) return null;
        const color = colores[i];
        return (
          <React.Fragment key={i}>
            {/* Estela: motion blur falso con copias que se achican y apagan */}
            {ESTELA.map((k, j) => {
              const p = pos[Math.max(0, f - k)];
              const rr = r * (0.9 - j * 0.11);
              return <div key={j} style={{
                position: 'absolute', left: p[0] - rr, top: p[1] - cam - rr, width: rr * 2, height: rr * 2, borderRadius: '50%',
                background: color, opacity: 0.5 - j * 0.09, filter: `blur(${1 + j}px)`,
              }} />;
            })}
            {/* Halo */}
            <div style={{ position: 'absolute', left: x - r * 3.2, top: sy - r * 3.2, width: r * 6.4, height: r * 6.4, borderRadius: '50%', background: `radial-gradient(circle, ${color}66 0%, ${color}22 35%, transparent 68%)` }} />
            {/* Cuerpo: degradado radial con brillo especular */}
            <div style={{
              position: 'absolute', left: x - r, top: sy - r, width: r * 2, height: r * 2, borderRadius: '50%',
              // Con icono, el brillo especular se achica para no lavar el logo.
              background: iconos[i]
                ? `radial-gradient(circle at 26% 20%, #FFFFFFCC 0, #FFFFFF55 6%, ${color} 18%, ${color} 80%, ${color}BB 100%)`
                : `radial-gradient(circle at 34% 30%, #FFFFFF 0, #FFFFFFCC 12%, ${color} 45%, ${color} 78%, ${color}AA 100%)`,
              boxShadow: `0 0 16px ${color}, 0 0 40px ${color}, 0 0 80px ${color}88`,
            }} />
            {/* Identidad: logo / emoji / iniciales, centrado y sin rotar (siempre legible) */}
            <Icono icono={iconos[i]} tam={tamIcono} fondo={color} style={{ position: 'absolute', left: x - tamIcono / 2, top: sy - tamIcono / 2 }} />
          </React.Fragment>
        );
      })}
      {cajas.map((c) => (
        <div key={`e${c.i}`} style={{
          position: 'absolute', top: c.y, left: c.x, transform: 'translateY(-50%)', height: ETIQ_ALTO - 8, padding: '0 17px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: mostrarEtiquetas * c.op,
          fontFamily: TIPO.display, fontWeight: 800, fontSize: ETIQ_FUENTE, letterSpacing: 0.5, color: PALETA.fondo,
          background: colores[c.i], boxShadow: `0 0 16px ${colores[c.i]}AA`,
        }}>{iconoAportaJuntoAlNombre(iconos[c.i]) && <Icono icono={iconos[c.i]} tam={ETIQ_ICONO} fondo={colores[c.i]} style={{ marginLeft: -6 }} />}{etiquetas[c.i]}</div>
      ))}
    </AbsoluteFill>
  );
};

/** Marcador en vivo: las posiciones se DESLIZAN (media móvil del puesto) y la que sube "salta". */
const Marcador: React.FC<{ sim: SimulacionCarrera; frame: number; colores: string[]; etiquetas: string[]; iconos: (IconoCompetidor | undefined)[]; opacidad: number }> = ({ sim, frame, colores, etiquetas, iconos, opacidad }) => {
  const VENTANA = 14;
  const n = sim.posiciones.length;
  const puestoEn = (i: number, f: number) => sim.ranking[fr(sim, f)].indexOf(i);
  const filas = [...Array(n).keys()].map((i) => {
    let suma = 0, peso = 0;
    for (let k = 0; k < VENTANA; k++) {
      const w = 1 - k / VENTANA; // más peso a lo reciente; el deslizamiento dura ~14 frames
      suma += puestoEn(i, frame - k) * w; peso += w;
    }
    const pos = suma / peso;
    // ¿Subió de puesto hace poco? → pulso.
    let pulso = 0;
    for (let k = 1; k < 16; k++) {
      if (puestoEn(i, frame - k) > puestoEn(i, frame - k + 1)) { pulso = 1 - (k - 1) / 15; break; }
    }
    return { i, pos, pulso, actual: puestoEn(i, frame) };
  });
  // Panel oscuro detrás: el tablero (clavijas, rampas) nunca se ve a través del marcador.
  const anchoPanel = 66 + 42 + 12 + Math.max(...etiquetas.map((e) => e.length)) * 22 + 52;
  return (
    <div style={{ position: 'absolute', top: MARCADOR_TOP, left: seguro.lados, width: 560, height: PUESTOS * FILA + 10, opacity: opacidad, fontFamily: TIPO.display }}>
      <div style={{
        position: 'absolute', left: -20, top: -12, width: anchoPanel + 20, height: PUESTOS * FILA + 16, borderRadius: 30,
        background: `${PALETA.fondo}E6`, boxShadow: `0 0 28px 14px ${PALETA.fondo}CC`,
      }} />
      {Array.from({ length: PUESTOS }, (_, k) => (
        <div key={`o${k}`} style={{
          position: 'absolute', left: 0, top: k * FILA, height: FILA - 8, width: 62, display: 'flex', alignItems: 'center',
          fontFamily: TIPO.texto, fontWeight: 700, fontSize: 26, color: k === 0 ? PALETA.neon.amarillo : PALETA.tintaSuave,
          textShadow: k === 0 ? `0 0 12px ${PALETA.neon.amarillo}` : 'none',
        }}>{ORDINAL[k]}</div>
      ))}
      {filas.map(({ i, pos, pulso, actual }) => {
        const op = interpolate(pos, [PUESTOS - 1, PUESTOS - 0.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        if (op <= 0) return null;
        const lider = actual === 0;
        return (
          <div key={i} style={{
            position: 'absolute', left: 66, top: pos * FILA, height: FILA - 8, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 20px 0 12px', borderRadius: 999, opacity: op, whiteSpace: 'nowrap',
            transform: `scale(${1 + 0.12 * pulso})`, transformOrigin: '0 50%',
            background: `linear-gradient(90deg, ${colores[i]}${lider ? '40' : '22'}, ${PALETA.fondo2} 70%), ${PALETA.fondo2}`,
            border: `2px solid ${colores[i]}`, boxShadow: `0 0 ${12 + pulso * 24}px ${colores[i]}${lider ? 'AA' : '66'}`,
            fontSize: 30, fontWeight: 800, color: PALETA.tinta,
          }}>
            {/* Mini bolita con el icono del competidor */}
            <span style={{ width: 42, height: 42, marginLeft: -6, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: `radial-gradient(circle at 34% 30%, #FFFFFFAA 0, ${colores[i]} 40%)`, boxShadow: `0 0 12px ${colores[i]}` }}>
              <Icono icono={iconos[i]} tam={26} fondo={colores[i]} />
            </span>
            {etiquetas[i]}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Gancho: la pregunta del guion en texto gigante, legible YA en el frame 0 (como el gancho de
 * `dato`: las palabras parten casi en su tamaño final y solo "brincan" un poco), arriba en la
 * zona segura mientras la carrera arranca debajo. Se va con un corte limpio en GANCHO_FRAMES.
 */
const Gancho: React.FC<{ texto: string }> = ({ texto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palabras = texto.split(/\s+/).filter(Boolean);
  const largo = texto.length;
  const fontSize = largo <= 22 ? 118 : largo <= 32 ? 104 : largo <= 46 ? 90 : 78;
  const deriva = Math.sin(frame / 40) * 4;
  const linea = interpolate(frame, [2, 26], [0, 300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const color = PALETA.neon.cian;
  return (
    <div style={{
      position: 'absolute', left: seguro.lados, right: seguro.lados, top: seguro.arriba + 64, display: 'flex', flexDirection: 'column', alignItems: 'center',
      transform: `translateY(${deriva}px)`,
    }}>
      <div style={{
        padding: '26px 34px 30px', borderRadius: 40, background: `${PALETA.fondo}E0`, boxShadow: `0 0 40px 18px ${PALETA.fondo}C0, 0 0 50px ${color}33`,
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${fontSize * 0.04}px ${fontSize * 0.24}px`,
        fontFamily: TIPO.display, fontWeight: TIPO.pesoDisplay, fontSize, lineHeight: 1.04, letterSpacing: -2, textAlign: 'center', color: PALETA.tinta,
      }}>
        {palabras.map((p, i) => {
          const brinco = spring({ frame: frame - i * 3, fps, config: { damping: 12, stiffness: 240 } });
          const entrada = 0.88 + 0.12 * brinco; // nunca parte de cero: se lee en el frame 0
          return (
            <span key={i} style={{
              display: 'inline-block', transform: `translateY(${(1 - entrada) * 40}px) scale(${0.6 + 0.4 * entrada})`,
              textShadow: `0 0 26px ${color}, 0 0 64px ${color}88, 0 4px 12px rgba(0,0,0,0.7)`,
            }}>{p}</span>
          );
        })}
      </div>
      <div style={{ marginTop: 18, width: linea, height: 8, borderRadius: 4, background: color, boxShadow: `0 0 24px ${color}` }} />
    </div>
  );
};

const Celebracion: React.FC<{ sim: SimulacionCarrera; color: string; etiqueta: string; icono?: IconoCompetidor; colores: string[]; iconos: (IconoCompetidor | undefined)[]; origen: { x: number; y: number; tam: number } }> = ({ sim, color, etiqueta, icono, colores, iconos, origen }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = frame - sim.frameGanadora;
  // Confeti determinista: 90 papelitos desde dos cañones (esquinas inferiores), con gravedad.
  const particulas = useMemo(() => {
    const azar = crearAzar(sim.semilla ^ 0xC0FFEE);
    return Array.from({ length: 90 }, (_, j) => {
      const lado = j % 2 === 0 ? -1 : 1;
      return {
        x0: ANCHO / 2 + lado * (ANCHO / 2 - 40), y0: 1480,
        vx: -lado * (5 + azar() * 13), vy: -(24 + azar() * 20),
        color: NEONES[Math.floor(azar() * NEONES.length)], ancho: 14 + azar() * 14, giro: (azar() - 0.5) * 24,
        vaiven: 0.08 + azar() * 0.1, fase: azar() * 6.28, retraso: Math.floor(azar() * 8),
      };
    });
  }, [sim.semilla]);
  if (k < 0) return null;
  const velo = interpolate(k, [6, 30, sim.duracionFrames - sim.frameGanadora], [0, 0.88, 0.94], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = interpolate(k, [0, 2, 12], [0, 0.32, 0], { extrapolateRight: 'clamp' });
  // La ganadora viaja desde donde cruzó hasta el centro y crece.
  const viaje = spring({ frame: k - 10, fps, config: { damping: 14, stiffness: 70 } });
  const cx = interpolate(viaje, [0, 1], [origen.x, ANCHO / 2]);
  const cy = interpolate(viaje, [0, 1], [origen.y, 800]);
  const tam = interpolate(viaje, [0, 1], [origen.tam, 300]);
  const textoIn = spring({ frame: k - 26, fps, config: { damping: 12, stiffness: 120 } });
  // El logo de la ganadora "salta" dentro de la bola grande cuando llega al centro.
  const iconoIn = spring({ frame: k - 18, fps, config: { damping: 9, stiffness: 140 } });
  const tamIcono = tam * ICONO_EN_BOLA * (0.85 + 0.15 * iconoIn);
  const salida = interpolate(frame, [sim.duracionFrames - 14, sim.duracionFrames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fuente = Math.min(132, (ANCHO - 2 * seguro.lados) / (etiqueta.length * 0.68));
  const ventaja = sim.ventajaSeg < 1.5 ? `por ${sim.ventajaSeg.toFixed(2).replace('.', ',')} s` : '';
  const G = 0.75; // gravedad del confeti (px/frame²)
  return (
    <AbsoluteFill>
      {/* El velo NO se desvanece: el cierre aparece sobre fondo limpio, sin la meta asomando */}
      <AbsoluteFill style={{ background: `rgba(11,11,18,${velo})` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 60%, ${PALETA.tinta}, ${color})`, opacity: flash }} />
      <AbsoluteFill style={{ opacity: salida }}>
      <div style={{ position: 'absolute', left: cx - tam * 1.6, top: cy - tam * 1.6, width: tam * 3.2, height: tam * 3.2, borderRadius: '50%', background: `radial-gradient(circle, ${color}55 0%, ${color}18 40%, transparent 70%)` }} />
      <div style={{
        position: 'absolute', left: cx - tam / 2, top: cy - tam / 2, width: tam, height: tam, borderRadius: '50%',
        background: icono
          ? `radial-gradient(circle at 26% 20%, #FFFFFFCC 0, #FFFFFF55 6%, ${color} 18%, ${color} 82%)`
          : `radial-gradient(circle at 34% 30%, #FFFFFF 0, #FFFFFFCC 12%, ${color} 45%, ${color} 80%)`,
        boxShadow: `0 0 40px ${color}, 0 0 120px ${color}, 0 0 220px ${color}66`,
      }} />
      <Icono icono={icono} tam={tamIcono} fondo={color} style={{
        position: 'absolute', left: cx - tamIcono / 2, top: cy - tamIcono / 2,
        transform: `scale(${Math.max(0, iconoIn)}) rotate(${(1 - iconoIn) * -25}deg)`,
      }} />
      {particulas.map((p, i) => {
        const t = k - 4 - p.retraso;
        if (t < 0) return null;
        const x = p.x0 + p.vx * t * 0.985 ** t + Math.sin(t * p.vaiven + p.fase) * 18;
        const y = p.y0 + p.vy * t + 0.5 * G * t * t;
        const op = interpolate(t, [0, 4, 120, 150], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
        return <div key={i} style={{
          position: 'absolute', left: x, top: y, width: p.ancho, height: p.ancho * 0.55, background: p.color, opacity: op, borderRadius: 3,
          transform: `rotate(${p.giro * t}deg) scaleY(${Math.cos(t * 0.25 + p.fase)})`, boxShadow: `0 0 10px ${p.color}`,
        }} />;
      })}
      <div style={{ position: 'absolute', left: seguro.lados, right: seguro.lados, top: 1010, textAlign: 'center', transform: `scale(${textoIn})`, opacity: Math.min(1, textoIn) }}>
        <div style={{ fontFamily: TIPO.texto, fontWeight: 700, fontSize: 50, letterSpacing: 12, color: PALETA.tinta, opacity: 0.85 }}>GANA:</div>
        <div style={{ fontFamily: TIPO.display, fontWeight: 800, fontSize: fuente, lineHeight: 1.05, color, whiteSpace: 'nowrap', textShadow: `0 0 30px ${color}, 0 0 80px ${color}99` }}>{etiqueta}</div>
        {ventaja && <div style={{ marginTop: 18, fontFamily: TIPO.texto, fontWeight: 700, fontSize: 44, color: PALETA.tintaSuave }}>{ventaja}</div>}
      </div>
      {/* Resultado: el resto en orden de llegada (y, las que no llegaron, por posición en pista) */}
      <div style={{ position: 'absolute', left: seguro.lados, right: seguro.lados, top: RESULTADO_TOP, display: 'flex', justifyContent: 'center', gap: 26 }}>
        {sim.orden.slice(1).map((b, j) => {
          const e = spring({ frame: k - 44 - j * 5, fps, config: { damping: 11, stiffness: 160 } });
          return (
            <div key={b} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: Math.min(1, e), transform: `translateY(${(1 - e) * 40}px) scale(${0.5 + 0.5 * e})` }}>
              <div style={{
                width: 92, height: 92, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(circle at 26% 20%, #FFFFFFCC 0, #FFFFFF55 6%, ${colores[b]} 18%, ${colores[b]} 82%)`,
                boxShadow: `0 0 14px ${colores[b]}, 0 0 34px ${colores[b]}88`,
              }}>
                <Icono icono={iconos[b]} tam={52} fondo={colores[b]} />
              </div>
              <div style={{ fontFamily: TIPO.texto, fontWeight: 700, fontSize: 32, color: PALETA.tinta }}>{ORDINAL[j + 1]}</div>
            </div>
          );
        })}
      </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------- Composición ----------------

export const Carrera: React.FC<GuionCarrera> = (props) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const sim = useSimulacion(props.id);
  const colores = useMemo(() => props.participantes.map((p) => PALETA.neon[p.color]), [props.participantes]);
  const etiquetas = useMemo(() => props.participantes.map((p) => p.etiqueta), [props.participantes]);
  const iconos = useMemo(() => props.participantes.map((p) => p.icono), [props.participantes]);

  if (!sim) return <AbsoluteFill style={{ background: PALETA.fondo }} />;

  const cam = sim.camara[fr(sim, frame)];
  const celebrando = frame >= sim.frameGanadora;
  const ganadora = sim.ganadora;
  const { z, ax, ay } = zoomEn(sim, frame);
  // Etiquetas y marcador se apagan durante la cámara lenta: el foco es la meta.
  const hud = interpolate(frame, [sim.camaraLenta.desde, sim.frameGanadora], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // El marcador entra cuando se va el gancho (mientras, el gancho ocupa ese espacio).
  const marcadorIn = interpolate(frame, [GANCHO_FRAMES, GANCHO_FRAMES + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Las etiquetas entran cuando se va el gancho (al inicio las bolas están juntas).
  const etiquetasIn = interpolate(frame, [GANCHO_FRAMES, GANCHO_FRAMES + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Dónde está la ganadora en pantalla al cruzar (con zoom): de ahí parte hacia el centro.
  const zg = zoomEn(sim, sim.frameGanadora);
  const pg = sim.posiciones[ganadora][fr(sim, sim.frameGanadora)];
  const origen = {
    x: zg.ax + (pg[0] - zg.ax) * zg.z,
    y: zg.ay + (pg[1] - sim.camara[fr(sim, sim.frameGanadora)] - zg.ay) * zg.z,
    tam: sim.tablero.radioBola * 2 * zg.z,
  };
  const lenta = frame >= sim.camaraLenta.desde && frame <= sim.camaraLenta.hasta;

  return (
    <AbsoluteFill style={{ background: PALETA.fondo, overflow: 'hidden' }}>
      {/* Fondo con parallax suave */}
      <AbsoluteFill style={{
        backgroundImage: `radial-gradient(circle, ${PALETA.fondo2} 2px, transparent 2.5px)`, backgroundSize: '90px 90px',
        backgroundPositionY: -cam * 0.35, opacity: 0.9,
      }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 50%, ${PALETA.fondo} 100%)` }} />

      {/* Mundo (tablero + bolas), con zoom hacia la meta en la cámara lenta */}
      <AbsoluteFill style={{ transformOrigin: '0 0', transform: `translate(${ax}px, ${ay}px) scale(${z}) translate(${-ax}px, ${-ay}px)` }}>
        <Tablero sim={sim} cam={cam} frame={frame} colores={colores} />
        <Bolas sim={sim} cam={cam} frame={frame} colores={colores} etiquetas={etiquetas} iconos={iconos} mostrarEtiquetas={celebrando ? 0 : hud * etiquetasIn} />
      </AbsoluteFill>
      {/* Viñeta de cámara lenta */}
      {lenta && <AbsoluteFill style={{ boxShadow: `inset 0 0 240px ${colores[ganadora]}30` }} />}

      {!celebrando && <Marcador sim={sim} frame={frame} colores={colores} etiquetas={etiquetas} iconos={iconos} opacidad={hud * marcadorIn} />}
      {frame < GANCHO_FRAMES && <Gancho texto={props.gancho} />}

      {celebrando && <Celebracion sim={sim} color={colores[ganadora]} etiqueta={etiquetas[ganadora]} icono={iconos[ganadora]} colores={colores} iconos={iconos} origen={origen} />}

      <Sequence from={sim.duracionFrames} durationInFrames={CIERRE_FRAMES} layout="none">
        <Cierre color={colores[ganadora]} />
      </Sequence>

      {/* Placa oscura detrás de la marca de agua: las clavijas no la atraviesan */}
      <div style={{
        position: 'absolute', top: seguro.arriba - 8, right: seguro.lados - 14, width: 262, height: 56, borderRadius: 999,
        background: `${PALETA.fondo}E0`, boxShadow: `0 0 22px 12px ${PALETA.fondo}C0`,
      }} />
      <MarcaDeAgua />
      <Html5Audio src={rutaAudio(props.id)} />
    </AbsoluteFill>
  );
};
