import React, { useMemo } from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FORMATO, PALETA, TIPO } from '../../marca/tokens';
import { crearAzar } from '../../lib/azar';
import { AVISO_FRAMES, type Bloque, type SimulacionCarrera, type Tubo } from './tipos';

/**
 * Capas de los extras v2 de la carrera (bloques con vida, tubos y avisos). Todo se lee de la simulación
 * precalculada: el componente no decide nada, solo dibuja el estado del frame.
 */

const ANCHO = FORMATO.ancho;
const ALTO_PANTALLA = FORMATO.alto;

/** Color del bloque según la vida que le queda: 3 rojo, 2 naranja, 1 amarillo. */
const COLOR_VIDA = ['#FFFFFF', PALETA.neon.amarillo, PALETA.neon.naranja, PALETA.rojo];
const GOLPE_FRAMES = 12;
const ROTURA_FRAMES = 46;

const camino = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** SVG del tamaño del tubo (no del tablero entero: los filtros de brillo sobre 10.000 px de alto son carísimos). */
const cajaSvg = (t: Tubo) => {
  const left = t.x0 - 40, top = t.yBoca - 30, width = t.x1 - t.x0 + 80, height = t.ySalida - t.yBoca + 140;
  return { width, height, viewBox: `${left} ${top} ${width} ${height}`, style: { position: 'absolute' as const, left, top, overflow: 'visible' as const } };
};

/** Bola dentro del tubo en este frame (o -1). */
const ocupante = (t: Tubo, frame: number) => {
  for (const u of t.usos) if (frame >= u.desde && frame <= u.hasta) return u.bola;
  return -1;
};

/** Tubos, DETRÁS de las bolas: vidrio oscuro con borde de neón, boca en embudo y cartel. */
export const TubosFondo: React.FC<{ sim: SimulacionCarrera; cam: number; frame: number; colores: string[] }> = ({ sim, cam, frame, colores }) => {
  const tubos = sim.tubos ?? [];
  return (
    <>
      {tubos.map((t, k) => {
        if (t.ySalida + 200 < cam || t.yBoca - 300 > cam + ALTO_PANTALLA) return null;
        const cx = (t.x0 + t.x1) / 2;
        const dentro = ocupante(t, frame);
        const borde = dentro >= 0 ? colores[dentro] : t.tipo === 'atajo' ? PALETA.neon.lima : PALETA.neon.cian;
        const pulso = dentro >= 0 ? 0.6 + 0.4 * Math.sin(frame * 0.5) : 0;
        const d = camino(t.puntos);
        const bocaY = t.yBoca, fondoY = t.yBoca + 110, w2 = t.ancho / 2;
        const embudo = `M${t.x0 + 14} ${bocaY} L${t.x1 - 14} ${bocaY} L${cx + w2} ${fondoY} L${cx - w2} ${fondoY} Z`;
        return (
          <svg key={k} {...cajaSvg(t)}>
            {/* Boca en embudo */}
            <path d={embudo} fill={`${PALETA.fondo2}CC`} stroke={borde} strokeWidth={5} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 10px ${borde})` }} />
            {/* Borde del tubo (trazo ancho) y relleno de vidrio (trazo un poco más angosto) */}
            <path d={d} fill="none" stroke={borde} strokeOpacity={0.85} strokeWidth={t.ancho + 10} strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: `drop-shadow(0 0 ${10 + 14 * pulso}px ${borde})` }} />
            <path d={d} fill="none" stroke="#151530" strokeOpacity={0.93} strokeWidth={t.ancho - 4} strokeLinecap="round" strokeLinejoin="round" />
            {/* Raya central tenue: se ve el recorrido aunque el tubo se cruce consigo mismo */}
            <path d={d} fill="none" stroke={borde} strokeOpacity={0.22} strokeWidth={6} strokeLinecap="round" strokeDasharray="18 22" />
          </svg>
        );
      })}
      {tubos.map((t, k) => {
        if (t.yBoca - 300 > cam + ALTO_PANTALLA || t.yBoca + 100 < cam) return null;
        const cx = (t.x0 + t.x1) / 2;
        const color = t.tipo === 'atajo' ? PALETA.neon.lima : PALETA.neon.cian;
        const latido = 1 + 0.05 * Math.sin(frame * 0.18 + k);
        return (
          <div key={`c${k}`} style={{
            position: 'absolute', left: cx - 170, width: 340, top: t.yBoca - 92, height: 66, display: 'flex', justifyContent: 'center', alignItems: 'center',
          }}>
            <div style={{
              padding: '6px 22px', borderRadius: 999, background: `${PALETA.fondo}EE`, border: `3px solid ${color}`,
              boxShadow: `0 0 18px ${color}88`, fontFamily: TIPO.display, fontWeight: 800, fontSize: 40, color, whiteSpace: 'nowrap',
              transform: `scale(${latido})`,
            }}>{t.tipo === 'atajo' ? '⚡ ATAJO' : '🌀 VUELTAS'}</div>
          </div>
        );
      })}
    </>
  );
};

/** Brillo del vidrio, DELANTE de las bolas: así la bola se ve "dentro" del tubo. */
export const TubosFrente: React.FC<{ sim: SimulacionCarrera; cam: number }> = ({ sim, cam }) => (
  <>
    {(sim.tubos ?? []).map((t, k) => {
      if (t.ySalida + 200 < cam || t.yBoca - 300 > cam + ALTO_PANTALLA) return null;
      const d = camino(t.puntos);
      return (
        <svg key={k} {...cajaSvg(t)}>
          <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.1} strokeWidth={t.ancho - 10} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.28} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" transform="translate(-26 -14)" />
        </svg>
      );
    })}
  </>
);

interface Fragmento { vx: number; vy: number; w: number; h: number; giro: number; fase: number }

const fragmentosDe = (k: number): Fragmento[] => {
  const az = crearAzar(0xb10c + k * 7919);
  return Array.from({ length: 14 }, (_, j) => {
    const ang = (j / 14) * Math.PI * 2 + (az() - 0.5) * 0.6;
    const v = 7 + az() * 9;
    return { vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 6, w: 16 + az() * 22, h: 12 + az() * 16, giro: (az() - 0.5) * 30, fase: az() * 360 };
  });
};

/** Grietas por daño (deterministas por bloque): 1 golpe = 1 grieta, 2 = 2… */
const grietasDe = (k: number, b: Bloque) => {
  const az = crearAzar(0x6e1e + k * 104729);
  return Array.from({ length: 3 }, () => {
    const x0 = (az() - 0.5) * b.w * 0.5, y0 = -b.h / 2;
    const pts: [number, number][] = [[x0, y0]];
    let x = x0, y = y0;
    for (let s = 0; s < 4; s++) { x += (az() - 0.5) * 30; y += b.h / 4; pts.push([x, y]); }
    return pts;
  });
};

/** Bloques con vida: número grande, destello + salto del número al golpe, grietas, y estallido al romperse. */
export const Bloques: React.FC<{ sim: SimulacionCarrera; cam: number; frame: number; colores: string[] }> = ({ sim, cam, frame, colores }) => {
  const bloques = sim.bloques ?? [];
  const frag = useMemo(() => bloques.map((_, k) => fragmentosDe(k)), [bloques]);
  const grietas = useMemo(() => bloques.map((b, k) => grietasDe(k, b)), [bloques]);
  return (
    <>
      {bloques.map((b, k) => {
        const sy = b.y - cam;
        if (sy < -260 || sy > ALTO_PANTALLA + 260) return null;
        // Roto: fragmentos + anillo, y luego nada (ya no existe).
        if (b.roto >= 0 && frame >= b.roto) {
          const e = frame - b.roto;
          if (e > ROTURA_FRAMES) return null;
          const color = COLOR_VIDA[1];
          const quien = colores[b.rompio] ?? PALETA.tinta;
          const op = interpolate(e, [0, ROTURA_FRAMES * 0.6, ROTURA_FRAMES], [1, 0.9, 0]);
          const anillo = interpolate(e, [0, 18], [0.3, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          return (
            <React.Fragment key={k}>
              <div style={{
                position: 'absolute', left: b.x - 130 * anillo, top: b.y - 130 * anillo, width: 260 * anillo, height: 260 * anillo, borderRadius: '50%',
                border: `${8 * (1 - anillo) + 2}px solid ${quien}`, opacity: interpolate(e, [0, 18], [1, 0], { extrapolateRight: 'clamp' }),
                boxShadow: `0 0 30px ${quien}`,
              }} />
              <div style={{
                position: 'absolute', left: b.x - 90, top: b.y - 90, width: 180, height: 180, borderRadius: '50%',
                background: `radial-gradient(circle, #FFFFFF 0, ${quien}AA 35%, transparent 70%)`, opacity: interpolate(e, [0, 3, 12], [0.4, 1, 0], { extrapolateRight: 'clamp' }),
              }} />
              {frag[k].map((f, j) => {
                const x = b.x + f.vx * e, y = b.y + f.vy * e + 0.45 * e * e;
                return <div key={j} style={{
                  position: 'absolute', left: x - f.w / 2, top: y - f.h / 2, width: f.w, height: f.h, borderRadius: 4,
                  background: j % 3 === 0 ? '#FFFFFF' : color, opacity: op, transform: `rotate(${f.fase + f.giro * e}deg)`,
                  boxShadow: `0 0 10px ${color}`,
                }} />;
              })}
            </React.Fragment>
          );
        }
        let hechos = 0, ultimo = -999;
        for (const g of b.golpes) if (g <= frame) { hechos++; ultimo = g; }
        const vida = Math.max(1, b.vida - hechos);
        const e = frame - ultimo;
        const golpe = e >= 0 && e < GOLPE_FRAMES ? 1 - e / GOLPE_FRAMES : 0;
        const temblor = golpe > 0 ? Math.sin(e * 2.6) * 6 * golpe : 0;
        const salto = golpe > 0 ? spring({ frame: e, fps: 60, config: { damping: 8, stiffness: 260 } }) : 1;
        const color = COLOR_VIDA[Math.min(3, vida)];
        return (
          <div key={k} style={{
            position: 'absolute', left: b.x - b.w / 2 + temblor, top: b.y - b.h / 2, width: b.w, height: b.h, borderRadius: 14,
            background: `linear-gradient(180deg, ${color} 0%, ${color}DD 60%, ${color}99 100%)`,
            border: `3px solid #FFFFFF${golpe > 0 ? 'FF' : '88'}`,
            boxShadow: `0 0 ${14 + 30 * golpe}px ${color}, inset 0 -6px 0 rgba(0,0,0,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {/* Grietas: una por golpe recibido */}
            <svg width={b.w} height={b.h} style={{ position: 'absolute', left: 0, top: 0 }} viewBox={`${-b.w / 2} ${-b.h / 2} ${b.w} ${b.h}`}>
              {grietas[k].slice(0, hechos).map((g, j) => (
                <polyline key={j} points={g.map((p) => p.join(',')).join(' ')} fill="none" stroke="#0B0B12" strokeOpacity={0.55} strokeWidth={3.5} strokeLinejoin="round" />
              ))}
            </svg>
            <div style={{
              position: 'relative', fontFamily: TIPO.display, fontWeight: 800, fontSize: 58, lineHeight: 1, color: '#0B0B12',
              transform: `scale(${golpe > 0 ? 1.35 - 0.35 * salto : 1})`, textShadow: '0 2px 0 rgba(255,255,255,0.45)',
            }}>{vida}</div>
            {/* Destello blanco del golpe */}
            <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', opacity: 0.75 * golpe * golpe }} />
          </div>
        );
      })}
    </>
  );
};

/** Aviso narrativo (zona segura, bajo el marcador, hasta que entra el llamado). */
export const Aviso: React.FC<{ sim: SimulacionCarrera; colores: string[]; etiquetas: string[]; hasta: number; centroY: number }> = ({ sim, colores, etiquetas, hasta, centroY }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const avisos = sim.avisos ?? [];
  let a = null as (typeof avisos)[number] | null;
  for (const x of avisos) if (frame >= x.frame && frame < x.frame + AVISO_FRAMES && x.frame < hasta - 20) a = x;
  if (!a) return null;
  const k = frame - a.frame;
  const fin = Math.min(a.frame + AVISO_FRAMES, hasta);
  const entrada = spring({ frame: k, fps, config: { damping: 12, stiffness: 190 } });
  const op = Math.min(interpolate(k, [0, 6], [0, 1], { extrapolateRight: 'clamp' }), interpolate(frame, [fin - 10, fin], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const Nombre: React.FC<{ i: number }> = ({ i }) => <span style={{ color: colores[i], textShadow: `0 0 14px ${colores[i]}AA` }}>{etiquetas[i]}</span>;
  const tubo = a.tubo !== undefined ? sim.tubos?.[a.tubo] : undefined;
  const contenido = a.tipo === 'camino'
    ? <>💥 ¡<Nombre i={a.bola} /> le abrió el camino a <Nombre i={a.otra!} />!</>
    : <>{tubo?.tipo === 'atajo' ? '⚡' : '🌀'} ¡<Nombre i={a.bola} /> se metió al tubo!</>;
  const largo = a.tipo === 'camino' ? 30 + etiquetas[a.bola].length + etiquetas[a.otra!].length : 22 + etiquetas[a.bola].length;
  const tam = Math.min(40, (ANCHO - 2 * FORMATO.seguro.lados - 70) / (largo * 0.56));
  const borde = a.tipo === 'camino' ? PALETA.neon.amarillo : PALETA.neon.cian;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: centroY - 36, height: 72, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        height: 72, padding: '0 28px', borderRadius: 999, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
        background: `${PALETA.fondo}EE`, border: `3px solid ${borde}`, boxShadow: `0 0 20px ${borde}66, 0 6px 22px rgba(0,0,0,0.55)`,
        transform: `scale(${0.8 + 0.2 * entrada})`, opacity: op,
        fontFamily: TIPO.display, fontWeight: 800, fontSize: tam, color: PALETA.tinta, letterSpacing: 0.2,
      }}><span>{contenido}</span></div>
    </div>
  );
};

/** Grande ↔ compacta del panel de votación: 1 = grande. Grande los primeros 4 s y en los 3 s antes de la meta. */
export const tamVotacion = (sim: SimulacionCarrera, frame: number) => {
  const t = 18;
  const inicio = interpolate(frame, [240, 240 + t], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const final = interpolate(frame, [sim.frameGanadora - 180, sim.frameGanadora - 180 + t], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const apaga = interpolate(frame, [sim.frameGanadora + 10, sim.frameGanadora + 22], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return Math.max(inicio, final) * apaga;
};

/** Votación: zona inferior segura, sin pisar la columna de botones de YouTube (derecha). */
const VOTO = { izq: 56, der: 940, fondo: 1580 };
const BOLA_VOTO = 64;

const BolaVoto: React.FC<{ color: string; icono: React.ReactNode; tam: number }> = ({ color, icono, tam }) => (
  <span style={{
    width: tam, height: tam, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: `radial-gradient(circle at 30% 26%, #FFFFFFAA 0, ${color} 34%)`, boxShadow: `0 0 12px ${color}, 0 0 26px ${color}66`,
  }}>{icono}</span>
);

/**
 * Votación con acciones del público (4 competidores). GRANDE: placa con "VOTA POR TU FAVORITO 👇" y 4 filas
 * "● NOMBRE → ❤️ ME GUSTA" (texto ≥ 40 px). COMPACTA (entre los 4 s y los 3 s antes de la meta): franja 2×2
 * "● NOMBRE → ❤️" en el lugar del viejo `ganchoAbajo`, con el podio encima. En el final: "GANÓ X → si le diste
 * <acción>, ¡acertaste! 🎉".
 */
export const Votacion: React.FC<{
  sim: SimulacionCarrera; colores: string[]; etiquetas: string[]; iconos: (tam: number) => React.ReactNode[];
  acciones: { emoji: string; texto: string }[]; opacidad: number;
}> = ({ sim, colores, etiquetas, iconos, acciones, opacidad }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = tamVotacion(sim, frame);
  const k = frame - sim.frameGanadora;
  const ancho = VOTO.der - VOTO.izq;
  const placa = { background: `${PALETA.fondo}E8`, borderRadius: 28, boxShadow: `0 0 30px 10px ${PALETA.fondo}B0` } as const;
  const sombra = '0 2px 0 #000, 0 0 10px #000';
  const fuenteNombre = (t: string, max: number, px: number) => Math.min(px, max / (t.length * 0.6));
  const icGrande = iconos(42), icChico = iconos(30);

  // --- Grande ---
  const FILA = 70, GAP = 6, CAB = 60, PAD = 12;
  const altoGrande = PAD + CAB + 4 * FILA + 3 * GAP + PAD;
  const grande = b > 0.01 && k < 22 && (
    <div style={{
      position: 'absolute', left: VOTO.izq, top: VOTO.fondo - altoGrande, width: ancho, height: altoGrande, ...placa,
      border: `3px solid ${PALETA.neon.amarillo}AA`, opacity: b, transform: `scale(${0.92 + 0.08 * b})`, transformOrigin: '50% 100%',
      fontFamily: TIPO.display, fontWeight: 800, color: PALETA.tinta, boxSizing: 'border-box', padding: `${PAD}px 22px`,
    }}>
      <div style={{ height: CAB, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, letterSpacing: 1, color: PALETA.neon.amarillo, textShadow: `0 0 16px ${PALETA.neon.amarillo}88` }}>
        VOTA POR TU FAVORITO 👇
      </div>
      {acciones.map((a, i) => (
        <div key={i} style={{ height: FILA, marginTop: i ? GAP : 0, display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <BolaVoto color={colores[i]} icono={icGrande[i]} tam={BOLA_VOTO} />
          <span style={{ width: 360, flex: 'none', overflow: 'hidden', fontSize: fuenteNombre(etiquetas[i], 360, 46), color: colores[i], textShadow: sombra }}>{etiquetas[i]}</span>
          <span style={{ fontSize: 44, color: PALETA.tinta }}>→</span>
          <span style={{ fontSize: 46 }}>{a.emoji}</span>
          <span style={{ fontSize: 42, color: PALETA.tinta, textShadow: sombra }}>{a.texto}</span>
        </div>
      ))}
    </div>
  );

  // --- Compacta (2×2) ---
  const FC = 52, GC = 6, altoC = 2 * FC + GC;
  const celda = (ancho - GC) / 2;
  const compacta = b < 0.99 && k < 22 && (
    <div style={{ position: 'absolute', left: VOTO.izq, top: VOTO.fondo - altoC, width: ancho, height: altoC, opacity: (1 - b) * interpolate(k, [10, 22], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
      {acciones.map((a, i) => (
        <div key={i} style={{
          position: 'absolute', left: (i % 2) * (celda + GC), top: Math.floor(i / 2) * (FC + GC), width: celda, height: FC, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 4px', borderRadius: 999, whiteSpace: 'nowrap', overflow: 'hidden',
          background: `${PALETA.fondo}E8`, border: `3px solid ${colores[i]}`, boxShadow: `0 0 12px ${colores[i]}55`,
          fontFamily: TIPO.display, fontWeight: 800,
        }}>
          <BolaVoto color={colores[i]} icono={icChico[i]} tam={44} />
          <span style={{ flex: 1, overflow: 'hidden', fontSize: fuenteNombre(etiquetas[i], 250, 36), color: colores[i], textShadow: sombra }}>{etiquetas[i]}</span>
          <span style={{ fontSize: 32, color: PALETA.tinta }}>→</span>
          <span style={{ fontSize: 38 }}>{a.emoji}</span>
        </div>
      ))}
    </div>
  );

  // --- Final ---
  const g = sim.ganadora;
  const f = spring({ frame: k - 40, fps, config: { damping: 12, stiffness: 150 } });
  const linea2 = `si le diste ${acciones[g].emoji} ${acciones[g].texto}, ¡acertaste! 🎉`;
  const final = k >= 40 && (
    <div style={{
      position: 'absolute', left: VOTO.izq, top: VOTO.fondo - 124, width: ancho, height: 124, ...placa, boxSizing: 'border-box',
      border: `3px solid ${colores[g]}`, boxShadow: `0 0 26px ${colores[g]}88`, opacity: Math.min(1, f), transform: `scale(${0.8 + 0.2 * f})`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
      fontFamily: TIPO.display, fontWeight: 800, color: PALETA.tinta, whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 44 }}>GANÓ <span style={{ color: colores[g], textShadow: `0 0 14px ${colores[g]}AA` }}>{etiquetas[g]}</span> →</span>
      <span style={{ fontSize: Math.min(42, (ancho - 40) / (linea2.length * 0.56)) }}>si le diste <span style={{ color: colores[g] }}>{acciones[g].emoji} {acciones[g].texto}</span>, ¡acertaste! 🎉</span>
    </div>
  );

  return <div style={{ position: 'absolute', inset: 0, opacity: opacidad, pointerEvents: 'none' }}>{compacta}{grande}{final}</div>;
};
