/**
 * Plantilla "ritmo": 5 bolitas caen por un nivel de clavijas y cada choque es una nota de la canción.
 * No calcula física: lee `public/sim/<id>.json` (scripts/preparar-ritmo.mts) y dibuja con Three.js
 * (@remotion/three). Se renderiza con `--gl=swangle` (SwiftShader: WebGL por CPU; en WSL no hay GPU para el
 * Chromium headless y `angle` falla con "Error creating WebGL context"). El audio sale del mismo sim.
 *
 * Capas: fondo CSS (degradado) → ThreeCanvas (paralaje de puntos, rieles, clavijas metálicas, bolitas con luz
 * propia, brillos aditivos, ondas y chispas) → textos HTML (bloques fijos, llamado, revelado, marca, cierre).
 * "Bloom" sin posprocesado: sprites aditivos con textura radial (barato y estable en SwiftShader).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FORMATO, PALETA, TIPO } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { Llamado, textoLlamado } from '../../marca/Llamado';
import { BloqueTexto } from '../../marca/BloqueTexto';
import { NOMBRE_PISTA, TEXTOS_RITMO, type ClavijaSim, type GolpeSim, type GuionRitmo, type SimRitmo } from './guion';

const FRAMES_CIERRE = 72;
/** Debe coincidir con FRAMES_DISOLVER de scripts/simular-ritmo.mts. */
const FRAMES_DISOLVER = 18;
const ARRIBA_TOP = FORMATO.seguro.arriba + 58;
const ABAJO_CENTRO_Y = 1518;
const LLAMADO_ANTES = 6 * 60;
const LLAMADO_CENTRO_Y = 520;
/** Distancia de la cámara al plano de juego y campo visual: a z = 0 se ven 1500 unidades de ancho. */
const DIST = 2400;
const ANCHO_VISTA = 1500;
const ALTO_VISTA = (ANCHO_VISTA * FORMATO.alto) / FORMATO.ancho;
const FOV = (2 * Math.atan(ALTO_VISTA / 2 / DIST) * 180) / Math.PI;
const PX = FORMATO.ancho / ANCHO_VISTA;
const CHISPAS = 12;
const VIDA_CHISPA = 30;
const VIDA_ONDA = 26;

const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

export const calcularMetadataRitmo: CalculateMetadataFunction<GuionRitmo> = async ({ props }) => {
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames };
  const res = await fetch(rutaSim(props.id));
  if (!res.ok) throw new Error(`no existe el sim de "${props.id}": corre scripts/preparar-ritmo.mts primero`);
  const sim = (await res.json()) as SimRitmo;
  return { durationInFrames: sim.duracionFrames, props: { ...props, duracionFrames: sim.duracionFrames } };
};

const useSim = (id: string) => {
  const [sim, setSim] = useState<SimRitmo | null>(null);
  const [handle] = useState(() => delayRender(`cargar sim ${id}`));
  useEffect(() => {
    let vivo = true;
    fetch(rutaSim(id))
      .then((r) => { if (!r.ok) throw new Error(`sim no encontrado: ${id}`); return r.json(); })
      .then((s: SimRitmo) => { if (vivo) { setSim(s); continueRender(handle); } })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [id, handle]);
  return sim;
};

/** Hash determinista 0..1 (nada de Math.random). */
const hash = (n: number) => {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Textura radial blanca → transparente para los brillos aditivos. */
const crearTexturaBrillo = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** Mundo (y hacia abajo) → Three (y hacia arriba). */
const Y = (y: number) => -y;

/** Tiempo de simulación en segundos para un frame del video (respeta la cámara lenta del clímax). */
const tiempoSim = (sim: SimRitmo, f: number) => (f <= sim.finalFrame ? f : sim.finalFrame + (f - sim.finalFrame) * sim.lentoClimax) / sim.fps;

const Brillo: React.FC<{ x: number; y: number; z?: number; tam: number; color: string; opacidad: number; textura: THREE.Texture }> = ({ x, y, z = 2, tam, color, opacidad, textura }) =>
  opacidad <= 0.003 || tam <= 0 ? null : (
    <sprite position={[x, Y(y), z]} scale={[tam, tam, 1]}>
      <spriteMaterial map={textura} color={color} transparent opacity={Math.min(1, opacidad)} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
    </sprite>
  );

const Camara: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const { camera } = useThree();
  camera.position.set(x, Y(y), DIST);
  camera.updateMatrixWorld();
  return null;
};

/** Puntos de fondo en dos planos (paralaje por perspectiva) + rieles tenues entre carriles. */
const Fondo: React.FC<{ sim: SimRitmo }> = ({ sim }) => {
  const capas = useMemo(() => {
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 1; i < sim.camara.length; i += 2) { yMin = Math.min(yMin, sim.camara[i]); yMax = Math.max(yMax, sim.camara[i]); }
    return [
      { z: -900, n: 900, ancho: 3600, tam: 7, op: 0.55, semilla: 1 },
      { z: -2600, n: 1100, ancho: 6000, tam: 11, op: 0.35, semilla: 2 },
    ].map((c) => {
      const escala = (DIST - c.z) / DIST; // lo lejano necesita más mundo para cubrir la vista
      const alto = (yMax - yMin) * 1 + ALTO_VISTA * escala * 1.4;
      const pos = new Float32Array(c.n * 3);
      for (let i = 0; i < c.n; i++) {
        pos[i * 3] = (hash(c.semilla * 100000 + i * 3) - 0.5) * c.ancho;
        pos[i * 3 + 1] = Y(yMin - ALTO_VISTA * escala * 0.7 + hash(c.semilla * 100000 + i * 3 + 1) * alto);
        pos[i * 3 + 2] = c.z;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return { ...c, geo };
    });
  }, [sim]);
  return (
    <>
      {capas.map((c) => (
        <points key={c.z} geometry={c.geo}>
          <pointsMaterial color={PALETA.tintaSuave} size={c.tam} sizeAttenuation transparent opacity={c.op} depthWrite={false} />
        </points>
      ))}
    </>
  );
};

const Rieles: React.FC<{ camY: number }> = ({ camY }) => (
  <>
    {[-750, -450, -150, 150, 450, 750].map((x) => (
      <mesh key={x} position={[x, Y(camY), -120]}>
        <planeGeometry args={[Math.abs(x) === 750 ? 10 : 4, ALTO_VISTA * 1.6]} />
        <meshBasicMaterial color={PALETA.fondo2} transparent opacity={Math.abs(x) === 750 ? 0.9 : 0.55} depthWrite={false} />
      </mesh>
    ))}
  </>
);

/** Clavija o pad metálico: se enciende al golpe y se disuelve en chispas; deja una huella tenue. */
const Clavija: React.FC<{ c: ClavijaSim; f: number; color: string; textura: THREE.Texture }> = ({ c, f, color, textura }) => {
  const tras = f - c.golpe;
  const flash = tras >= 0 ? Math.exp(-tras / 7) : 0;
  const disuelta = tras >= 0 ? Math.min(1, tras / FRAMES_DISOLVER) : 0;
  const escala = tras < 0 ? 1 : (1 + 0.35 * Math.exp(-tras / 3)) * (1 - disuelta * disuelta);
  // Normal en coordenadas de Three y ángulo del eje (perpendicular a la normal).
  const ang = Math.atan2(-c.ny, c.nx) - Math.PI; // eje Y local → tangente
  const contactoX = c.x + c.nx * c.radio, contactoY = c.y + c.ny * c.radio;
  return (
    <>
      {escala > 0.01 && (
        <group position={[c.x, Y(c.y), 0]} rotation={[0, 0, ang]} scale={[escala, escala, escala]}>
          {c.largo > 0 ? (
            <mesh>
              <capsuleGeometry args={[c.radio, c.largo * 2, 6, 14]} />
              <meshStandardMaterial color="#3A3A5C" metalness={0.75} roughness={0.28} emissive={color} emissiveIntensity={0.18 + 2.4 * flash} />
            </mesh>
          ) : (
            <group rotation={[Math.PI / 2, 0, 0]}>
              <mesh>
                <cylinderGeometry args={[c.radio, c.radio, 34, 22]} />
                <meshStandardMaterial color="#3A3A5C" metalness={0.8} roughness={0.25} emissive={color} emissiveIntensity={0.15 + 2.4 * flash} />
              </mesh>
              <mesh position={[0, 17.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[c.radio * 0.55, c.radio * 0.95, 22]} />
                <meshBasicMaterial color={color} transparent opacity={0.45 + 0.55 * flash} />
              </mesh>
            </group>
          )}
        </group>
      )}
      {/* destello del golpe y huella que queda */}
      <Brillo x={contactoX} y={contactoY} tam={(c.largo > 0 ? 260 : 170) * (0.4 + flash)} color={color} opacidad={1.1 * flash} textura={textura} />
      {tras >= FRAMES_DISOLVER * 0.5 && <Brillo x={c.x} y={c.y} z={-10} tam={c.largo > 0 ? 70 : 44} color={color} opacidad={0.22 * Math.min(1, (tras - 9) / 10)} textura={textura} />}
    </>
  );
};

/** Onda expansiva y chispas de un golpe (deterministas; viven ~0,5 s). */
const Impacto: React.FC<{ g: GolpeSim; idx: number; f: number; sim: SimRitmo; color: string; r: number; textura: THREE.Texture }> = ({ g, idx, f, sim, color, r, textura }) => {
  const tras = (tiempoSim(sim, f) - g.frame / sim.fps) * sim.fps; // frames de simulación desde el golpe
  if (tras < 0 || tras > VIDA_CHISPA) return null;
  const cx = g.x - g.nx * r, cy = g.y - g.ny * r; // punto de contacto
  const k = tras / VIDA_ONDA;
  const fuerza = 0.6 + 0.6 * g.fuerza;
  const chispas = [];
  for (let s = 0; s < CHISPAS; s++) {
    const h1 = hash(idx * 131 + s * 7), h2 = hash(idx * 131 + s * 7 + 3), h3 = hash(idx * 131 + s * 7 + 5);
    const base = Math.atan2(g.ny, g.nx);
    const a = base + (h1 - 0.5) * 2.4;
    const v = (350 + 650 * h2) * fuerza;
    const t = tras / sim.fps;
    const x = cx + Math.cos(a) * v * t;
    const y = cy + Math.sin(a) * v * t + 0.5 * sim.mundo.gravedad * 0.6 * t * t;
    const vida = 1 - tras / (VIDA_CHISPA * (0.6 + 0.4 * h3));
    if (vida > 0) chispas.push(<Brillo key={s} x={x} y={y} z={4} tam={(14 + 16 * h3) * (0.5 + vida)} color={s % 3 === 0 ? PALETA.tinta : color} opacidad={vida} textura={textura} />);
  }
  return (
    <>
      {k < 1 && (
        <mesh position={[cx, Y(cy), 1]} scale={[20 + 110 * fuerza * (1 - (1 - k) ** 3), 20 + 110 * fuerza * (1 - (1 - k) ** 3), 1]}>
          <ringGeometry args={[0.86, 1, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.7 * (1 - k) * (1 - k)} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {chispas}
    </>
  );
};

const Escena: React.FC<{ sim: SimRitmo; f: number; camX: number; camY: number }> = ({ sim, f, camX, camY }) => {
  const textura = useMemo(crearTexturaBrillo, []);
  const rango = ALTO_VISTA * 0.75;
  const visibles = sim.clavijas.map((c, i) => [c, i] as const).filter(([c]) => Math.abs(c.y - camY) < rango);
  // Último golpe de cada bolita (para su destello) y golpes recientes (impactos).
  const ultimo = sim.bolitas.map(() => -1e9);
  const recientes: [GolpeSim, number][] = [];
  sim.golpes.forEach((g, i) => {
    if (g.frame <= f) { if (g.frame > ultimo[g.bolita]) ultimo[g.bolita] = g.frame; }
    if (g.frame <= f && tiempoSim(sim, f) * sim.fps - g.frame <= VIDA_CHISPA) recientes.push([g, i]);
  });
  return (
    <>
      <Camara x={camX} y={camY} />
      <fog attach="fog" args={[PALETA.fondo, DIST + 200, DIST + 3800]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[-900, 1400, 2200]} intensity={1.6} color="#ffffff" />
      <directionalLight position={[1200, -600, 900]} intensity={0.5} color={PALETA.neon.cian} />
      <Fondo sim={sim} />
      <Rieles camY={camY} />
      {visibles.map(([c, i]) => <Clavija key={i} c={c} f={f} color={sim.bolitas[c.bolita].color} textura={textura} />)}
      {/* repisas: se abren (giran y se apagan) cuando suelta su bolita */}
      {sim.bolitas.map((b, i) => {
        const k = Math.max(0, Math.min(1, (f - b.repisa.abre) / 14));
        if (k >= 1) return null;
        const ancho = b.r * 2 + 50;
        return (
          <group key={`rep-${i}`} position={[b.repisa.x - ancho / 2, Y(b.repisa.y + b.r + 7), 0]} rotation={[0, 0, -k * 1.2]}>
            <mesh position={[ancho / 2, 0, 0]}>
              <boxGeometry args={[ancho, 14, 40]} />
              <meshStandardMaterial color="#3A3A5C" metalness={0.7} roughness={0.3} emissive={b.color} emissiveIntensity={0.35} transparent opacity={1 - k} />
            </mesh>
          </group>
        );
      })}
      {recientes.map(([g, i]) => <Impacto key={`imp-${i}`} g={g} idx={i} f={f} sim={sim} color={sim.bolitas[g.bolita].color} r={sim.bolitas[g.bolita].r} textura={textura} />)}
      {sim.bolitas.map((b, i) => {
        const x = b.cuadros[f * 2], y = b.cuadros[f * 2 + 1];
        const tras = f - ultimo[i];
        const flash = tras >= 0 ? Math.exp(-tras / 6) : 0;
        const estela = [];
        for (let k = 1; k <= 9; k++) {
          const fa = Math.max(0, f - k * 2);
          estela.push(<Brillo key={k} x={b.cuadros[fa * 2]} y={b.cuadros[fa * 2 + 1]} z={-2} tam={b.r * (2.6 - 0.18 * k)} color={b.color} opacidad={0.3 * (1 - k / 10) * (0.5 + 0.5 * b.brillo)} textura={textura} />);
        }
        return (
          <group key={`b-${i}`}>
            {estela}
            <pointLight position={[x, Y(y), b.r * 2.2]} color={b.color} intensity={(260 + 900 * flash) * (0.5 + 0.5 * b.brillo)} distance={650} decay={1} />
            <mesh position={[x, Y(y), 0]} scale={[1 + 0.12 * flash, 1 - 0.08 * flash, 1]}>
              <sphereGeometry args={[b.r, 48, 32]} />
              <meshPhysicalMaterial color={b.color} emissive={b.color} emissiveIntensity={0.12 + 0.38 * b.brillo + 1.3 * flash} roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.08} />
            </mesh>
            <Brillo x={x} y={y} z={b.r + 4} tam={b.r * 3.2} color={b.color} opacidad={0.35 * b.brillo + 0.5 * flash} textura={textura} />
            <Brillo x={x} y={y} z={-4} tam={b.r * (7 + 4 * flash)} color={b.color} opacidad={0.16 + 0.12 * b.brillo + 0.35 * flash} textura={textura} />
          </group>
        );
      })}
    </>
  );
};

export const Ritmo: React.FC<GuionRitmo> = (props) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sim = useSim(props.id);
  if (!sim) return null;
  const f = Math.min(frame, sim.duracionFrames - 1);
  const tras = f - sim.finalFrame;
  // Sacudida de cámara en el golpe final (determinista).
  const sacude = tras >= 0 && tras < 30 ? 22 * Math.exp(-tras / 7) : 0;
  const camX = sim.camara[f * 2] + sacude * Math.sin(tras * 1.9);
  const camY = sim.camara[f * 2 + 1] + sacude * Math.cos(tras * 2.3);
  const flashFinal = tras >= 0 ? 0.55 * Math.exp(-tras / 6) : 0;
  const inicioCierre = durationInFrames - FRAMES_CIERRE;
  const fadeCierre = interpolate(frame, [inicioCierre - 8, inicioCierre + 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const arriba = props.arriba ?? TEXTOS_RITMO.arriba;
  const abajo = props.abajo ?? TEXTOS_RITMO.abajo;
  const revelar = props.revelar !== false && tras >= 10;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${PALETA.fondo2} 0%, ${PALETA.fondo} 55%, #06060B 100%)`, overflow: 'hidden' }}>
      <Audio src={rutaAudio(props.id)} />
      <ThreeCanvas width={FORMATO.ancho} height={FORMATO.alto} flat camera={{ fov: FOV, near: 50, far: DIST + 6000, position: [0, 0, DIST] }}>
        <Escena sim={sim} f={f} camX={camX} camY={camY} />
      </ThreeCanvas>
      {/* viñeta */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, #00000000 55%, #000000a0 100%)', pointerEvents: 'none' }} />
      {flashFinal > 0 && <AbsoluteFill style={{ background: PALETA.tinta, opacity: flashFinal, mixBlendMode: 'screen' }} />}

      {/* Revelado: qué instrumento era cada bolita (sigue a la bolita en pantalla). */}
      {revelar && sim.bolitas.map((b, i) => {
        const x = (b.cuadros[f * 2] - camX) * PX + FORMATO.ancho / 2;
        // Alternan arriba/abajo de la bolita según el carril (de izquierda a derecha) para no pisarse.
        const orden = [...sim.bolitas].sort((p, q) => p.carril - q.carril).indexOf(b);
        const lado = orden % 2 === 0 ? -1 : 1;
        const y = (b.cuadros[f * 2 + 1] - camY) * PX + FORMATO.alto / 2 + lado * (b.r * PX + 34);
        const ent = spring({ frame: tras - 10 - i * 3, fps, config: { damping: 12, stiffness: 200 } });
        const yy = Math.max(FORMATO.seguro.arriba + 230, Math.min(FORMATO.alto - FORMATO.seguro.abajo - 120, y));
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: yy, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * ent})`, opacity: ent * fadeCierre,
            padding: '6px 16px', borderRadius: 999, background: `${PALETA.fondo}E6`, border: `3px solid ${b.color}`,
            boxShadow: `0 0 16px ${b.color}88`, whiteSpace: 'nowrap',
            fontFamily: TIPO.texto, fontWeight: 700, fontSize: b.pista === 'melodia' ? 34 : 28, color: b.pista === 'melodia' ? b.color : PALETA.tinta,
          }}>{NOMBRE_PISTA[b.pista]}</div>
        );
      })}

      <Llamado texto={textoLlamado('ritmo', props.id, props.llamado)} desde={Math.max(120, sim.finalFrame - LLAMADO_ANTES)}
        hasta={inicioCierre} centroY={LLAMADO_CENTRO_Y} color={PALETA.neon.lima} />
      <BloqueTexto texto={arriba} color={PALETA.neon.amarillo} top={ARRIBA_TOP} tam={arriba.length > 24 ? 66 : 74} opacidad={fadeCierre} />
      <BloqueTexto texto={abajo} color={PALETA.neon.magenta} centroY={ABAJO_CENTRO_Y} tam={abajo.length > 26 ? 52 : 58} opacidad={fadeCierre} />
      <MarcaDeAgua />
      <Sequence from={inicioCierre} durationInFrames={FRAMES_CIERRE} name="Cierre">
        <Cierre color={PALETA.neon.amarillo} />
      </Sequence>
    </AbsoluteFill>
  );
};
