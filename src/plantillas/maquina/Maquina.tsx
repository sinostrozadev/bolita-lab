/**
 * Plantilla "maquina": máquina de canicas musical en 3D (Three.js vía @remotion/three). No calcula física: lee
 * `public/sim/<id>.json` (scripts/preparar-maquina.mts: compuertas, trayectorias de cada canica, cámara) y dibuja.
 * Render con `--gl=swangle` (SwiftShader: en WSL el Chromium headless no tiene GPU).
 *
 * Capas: ThreeCanvas (taller: pared, piso, lámparas con bokeh; máquina: bastidor de madera, noria, ascensor de
 * cangilones, rieles de latón, espiral, cargadores de vidrio con compuertas, vibráfono, bajo de madera, bombo,
 * platillo, bandeja, embudo, depósito; canicas; destellos aditivos) → textos HTML (bloques fijos, llamado, marca, cierre).
 * Iluminación de taller: principal cálida con sombras suaves + relleno + contraluz frío + entorno (RoomEnvironment)
 * para los reflejos del latón y el metal. "Bloom" con sprites aditivos (sin posprocesado).
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill, Audio, Sequence, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame,
  useVideoConfig, type CalculateMetadataFunction,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FORMATO, PALETA } from '../../marca/tokens';
import { cargarFuentes } from '../../marca/fuentes';
import { MarcaDeAgua } from '../../marca/MarcaDeAgua';
import { Cierre } from '../../marca/Cierre';
import { Llamado, textoLlamado } from '../../marca/Llamado';
import { BloqueTexto } from '../../marca/BloqueTexto';
import {
  ASCENSOR, BAJO, BANDEJA, BASTIDOR, BOMBO, CANALETA, COLORES_VIBRA, DEPOSITO, EMBUDO, ESPIRAL, FLUJO, NORIA, NOTAS_BAJO,
  NOTAS_VIBRA, PLATILLO, RIEL_BAJO, RIEL_REPARTO, RIEL_SUPERIOR, R_CANICA, TUBO_BAJO, TUBO_EMBUDO, VIBRA, circuito, contacto,
  largoBajo, largoLamina, puntosEspiral, xBajo, xLamina, yBandeja, type P3, type Pieza,
} from './geometria';
import { TEXTOS_MAQUINA, type GuionMaquina, type SimMaquina } from './guion';
import { hash, texturaBokeh, texturaBrillo, texturaMadera, texturaParche, texturaPlatillo } from './texturas';

const ARRIBA_TOP = FORMATO.seguro.arriba + 58;
/** Banderas de prueba de rendimiento (prop `prueba`). */
let PRUEBA = new Set<string>();
const ABAJO_CENTRO_Y = 1518;
const LLAMADO_CENTRO_Y = 520;

const rutaSim = (id: string) => staticFile(`sim/${id}.json`);
const rutaAudio = (id: string) => staticFile(`audio/generado/${id}.wav`);

export const calcularMetadataMaquina: CalculateMetadataFunction<GuionMaquina> = async ({ props }) => {
  const fps = props.fps ?? 60;
  if (props.duracionFrames) return { durationInFrames: props.duracionFrames, fps };
  const res = await fetch(rutaSim(props.id));
  if (!res.ok) throw new Error(`no existe el sim de "${props.id}": corre scripts/preparar-maquina.mts primero`);
  const sim = (await res.json()) as SimMaquina;
  return { durationInFrames: sim.duracionFrames, fps: sim.fps, props: { ...props, duracionFrames: sim.duracionFrames } };
};

const useSim = (id: string) => {
  const [sim, setSim] = useState<SimMaquina | null>(null);
  const [handle] = useState(() => delayRender(`cargar sim ${id}`));
  useEffect(() => {
    let vivo = true;
    fetch(rutaSim(id))
      .then((r) => { if (!r.ok) throw new Error(`sim no encontrado: ${id}`); return r.json(); })
      .then((s: SimMaquina) => { if (vivo) { setSim(s); continueRender(handle); } })
      .catch((e) => cancelRender(e));
    return () => { vivo = false; };
  }, [id, handle]);
  return sim;
};

// ---------- Materiales compartidos ----------

type Mats = ReturnType<typeof crearMateriales>;
const crearMateriales = () => {
  const madera = texturaMadera([168, 112, 62], [96, 56, 26], 3);
  const maderaB = texturaMadera([150, 96, 52], [84, 48, 22], 11);
  const palisandro = texturaMadera([112, 52, 34], [52, 20, 12], 5);
  const pared = texturaMadera([58, 38, 26], [30, 18, 12], 7, 9, 512, 512);
  pared.repeat.set(3, 2);
  const piso = texturaMadera([86, 58, 38], [44, 28, 18], 13, 6, 512, 512);
  piso.repeat.set(4, 6);
  piso.rotation = Math.PI / 2;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  return {
    madera: std({ map: madera, roughness: 0.62, metalness: 0 }),
    maderaB: std({ map: maderaB, roughness: 0.66, metalness: 0 }),
    palisandro: std({ map: palisandro, roughness: 0.42, metalness: 0 }),
    pared: new THREE.MeshBasicMaterial({ map: pared, color: '#6E5E54' }),
    piso: new THREE.MeshLambertMaterial({ map: piso, color: '#B0A090' }),
    laton: std({ color: '#D2A04A', metalness: 1, roughness: 0.3 }),
    latonOscuro: std({ color: '#9C7432', metalness: 1, roughness: 0.42 }),
    acero: std({ color: '#C9CED6', metalness: 1, roughness: 0.22 }),
    hierro: std({ color: '#3A3A40', metalness: 0.8, roughness: 0.5 }),
    vidrio: new THREE.MeshPhysicalMaterial({ color: '#E8F4FF', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 }),
    fieltro: std({ color: '#5A2230', roughness: 1 }),
    lacaRoja: new THREE.MeshPhysicalMaterial({ color: '#A3161D', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
    parche: std({ map: texturaParche('Bolita Lab'), roughness: 0.55 }),
    platillo: std({ map: texturaPlatillo(), metalness: 1, roughness: 0.42, color: '#A87A2A' }),
    canica: new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }),
    canicaPila: new THREE.MeshLambertMaterial({ color: '#FFFFFF' }),
    lamparaFoco: std({ color: '#FFE2A8', emissive: '#FFC56B', emissiveIntensity: 3 }),
    cable: std({ color: '#151210', roughness: 0.8 }),
    brillo: texturaBrillo(),
    bokeh: texturaBokeh(),
  };
};

/** Colores de las canicas decorativas (vidrio de colores, como canicas de verdad). */
const COLORES_CANICA = ['#E5483C', '#F2832B', '#F4C434', '#83C44A', '#2DB5A2', '#3189E0', '#7062E8', '#C54FCC', '#E8E8EE', '#2E9E5B'];
const colorCanica = (n: number) => COLORES_CANICA[Math.floor(hash(n * 7 + 3) * COLORES_CANICA.length)];

const v3 = (p: P3) => new THREE.Vector3(p.x, p.y, p.z);
const suave = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
/** Último frame ≤ f de una lista ordenada (o −1e9). */
const ultimoHasta = (lista: number[], f: number) => {
  let lo = 0, hi = lista.length - 1, r = -1e9;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (lista[m] <= f) { r = lista[m]; lo = m + 1; } else hi = m - 1; }
  return r;
};

/** Barra recta entre dos puntos (cilindro orientado). */
const Barra: React.FC<{ a: P3; b: P3; r: number; mat: THREE.Material; sombra?: boolean; seg?: number }> = ({ a, b, r, mat, sombra = true, seg = 10 }) => {
  const { pos, quat, largo } = useMemo(() => {
    const va = v3(a), vb = v3(b);
    const d = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return { pos: va.add(vb).multiplyScalar(0.5), quat: q, largo: d.length() };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} material={mat} castShadow={sombra} receiveShadow>
      <cylinderGeometry args={[r, r, largo, seg]} />
    </mesh>
  );
};

/** Caja de madera entre dos esquinas (bastidor). */
const Tabla: React.FC<{ c: [number, number, number]; t: [number, number, number]; mat: THREE.Material; rot?: [number, number, number] }> = ({ c, t, mat, rot }) => (
  <mesh position={c} rotation={rot ?? [0, 0, 0]} material={mat} castShadow receiveShadow>
    <boxGeometry args={t} />
  </mesh>
);

/** Par de rieles de latón bajo una polilínea de centros de canica (la canica rueda apoyada en los dos). */
const Rieles: React.FC<{ pts: P3[]; mats: Mats; sep?: number }> = ({ pts, mats, sep = 1.15 }) => {
  const geos = useMemo(() => {
    const vs = pts.map(v3);
    return [-1, 1].map((s) => {
      const lado = vs.map((p, i) => {
        const a = vs[Math.max(0, i - 1)], b = vs[Math.min(vs.length - 1, i + 1)];
        const t = b.clone().sub(a).normalize();
        // lateral horizontal perpendicular a la tangente; los rieles van algo por debajo del centro
        const lat = new THREE.Vector3(-t.z, 0, t.x);
        if (lat.lengthSq() < 1e-6) lat.set(1, 0, 0);
        lat.normalize();
        return p.clone().addScaledVector(lat, s * sep).add(new THREE.Vector3(0, -R_CANICA * 0.75, 0));
      });
      const curva = new THREE.CatmullRomCurve3(lado, false, 'centripetal');
      return new THREE.TubeGeometry(curva, Math.max(8, pts.length * 2), 0.32, 6, false);
    });
  }, [pts, sep]);
  return <>{geos.map((g, i) => <mesh key={i} geometry={g} material={mats.laton} castShadow />)}</>;
};

// ---------- Escena estática (se memoriza: no cambia por frame) ----------

const Taller: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.piso} receiveShadow>
      <planeGeometry args={[1400, 1400]} />
    </mesh>
    <mesh position={[0, 300, -95]} material={mats.pared} receiveShadow>
      <planeGeometry args={[1400, 700]} />
    </mesh>
    {/* repisa con frascos de canicas al fondo */}
    <Tabla c={[-150, 150, -86]} t={[120, 3, 16]} mat={mats.maderaB} />
    {[-195, -175, -152, -128, -108].map((x, i) => (
      <group key={i} position={[x, 151.5 + 9, -86]}>
        <mesh material={mats.vidrio}><cylinderGeometry args={[6, 6, 18, 16, 1, true]} /></mesh>
        <mesh position={[0, -3, 0]}>
          <cylinderGeometry args={[5.4, 5.4, 11, 16]} />
          <meshStandardMaterial color={COLORES_CANICA[(i * 3) % COLORES_CANICA.length]} roughness={0.4} />
        </mesh>
      </group>
    ))}
    <Tabla c={[160, 120, -86]} t={[110, 3, 16]} mat={mats.maderaB} />
    {[118, 140, 166, 192].map((x, i) => (
      <mesh key={i} position={[x, 128, -86]} material={i % 2 ? mats.latonOscuro : mats.hierro} castShadow>
        <cylinderGeometry args={[4 + i, 5 + i, 14, 14]} />
      </mesh>
    ))}
  </>
));

const Lamparas: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    {[{ x: -120, y: 250, z: -40 }, { x: 105, y: 262, z: -55 }, { x: 0, y: 285, z: -75 }].map((l, i) => (
      <group key={i}>
        <Barra a={{ x: l.x, y: l.y + 6, z: l.z }} b={{ x: l.x, y: 420, z: l.z }} r={0.5} mat={mats.cable} sombra={false} />
        <mesh position={[l.x, l.y + 6, l.z]} material={mats.latonOscuro}><cylinderGeometry args={[4, 9, 7, 18, 1, true]} /></mesh>
        <mesh position={[l.x, l.y, l.z]} material={mats.lamparaFoco}><sphereGeometry args={[3.6, 16, 12]} /></mesh>
        <sprite position={[l.x, l.y, l.z + 1]} scale={[70, 70, 1]}>
          <spriteMaterial map={mats.brillo} color="#FFB45C" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      </group>
    ))}
    {/* bokeh de luces del taller, lejos y desenfocadas (profundidad de campo simulada) */}
    {Array.from({ length: 16 }, (_, i) => {
      const x = (hash(i * 3 + 1) - 0.5) * 900, y = 40 + hash(i * 3 + 2) * 330, tam = 30 + 50 * hash(i * 3 + 3);
      return (
        <sprite key={i} position={[x, y, -92]} scale={[tam, tam, 1]}>
          <spriteMaterial map={mats.bokeh} color={i % 3 ? '#FFB860' : '#FFD9A0'} transparent opacity={0.1 + 0.12 * hash(i * 9)} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
      );
    })}
  </>
));

const Bastidor: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const { x, alto, zPost, grueso } = BASTIDOR;
  return (
    <>
      {[-x, x].map((px) => <Tabla key={px} c={[px, alto / 2, zPost]} t={[grueso, alto, grueso]} mat={mats.madera} />)}
      {[-x, x].map((px) => <Tabla key={`b${px}`} c={[px, alto / 2, -34]} t={[grueso, alto, grueso]} mat={mats.madera} />)}
      <Tabla c={[0, alto - 3, zPost]} t={[x * 2 + grueso, grueso, grueso]} mat={mats.madera} />
      <Tabla c={[0, alto - 3, -34]} t={[x * 2 + grueso, grueso, grueso]} mat={mats.madera} />
      {[-x, x].map((px) => <Tabla key={`t${px}`} c={[px, alto - 3, -20]} t={[grueso, grueso, 28]} mat={mats.madera} />)}
      {/* travesaño que sostiene el vibráfono y los cargadores */}
      <Tabla c={[0, 112, -14]} t={[x * 2, 5, 5]} mat={mats.maderaB} />
      <Tabla c={[0, 172, -4]} t={[x * 2, 4, 4]} mat={mats.maderaB} />
      {/* colgantes del riel de reparto */}
      {[-40, -10, 20].map((px) => <Barra key={px} a={{ x: px, y: 170, z: -4 }} b={{ x: px, y: 166, z: VIBRA.zGolpe }} r={0.35} mat={mats.laton} />)}
    </>
  );
});

const Vibrafono: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    {/* rieles de fieltro bajo las láminas, sobre dos largueros de madera */}
    {[-8.5, 8.5].map((z) => (
      <group key={z}>
        <Tabla c={[0, VIBRA.yTop - VIBRA.grosor - 2.2, z]} t={[104, 3.4, 3.2]} mat={mats.madera} />
        <mesh position={[0, VIBRA.yTop - VIBRA.grosor - 0.25, z]} rotation={[0, 0, Math.PI / 2]} material={mats.fieltro}>
          <cylinderGeometry args={[0.5, 0.5, 100, 6]} />
        </mesh>
      </group>
    ))}
    {[-50, 50].map((x) => <Tabla key={x} c={[x, (VIBRA.yTop - 8 + 112) / 2, -2]} t={[3, VIBRA.yTop - 8 - 112 + 4, 3]} mat={mats.madera} />)}
    {/* resonadores de latón bajo cada lámina */}
    {NOTAS_VIBRA.map((_, i) => {
      const largo = 30 - 2.4 * i;
      return (
        <group key={i} position={[xLamina(i), VIBRA.yTop - VIBRA.grosor - 4 - largo / 2, 0]}>
          <mesh material={mats.laton} castShadow><cylinderGeometry args={[3.2, 3.2, largo, 20, 1, true]} /></mesh>
          <mesh position={[0, -largo / 2, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.latonOscuro}><circleGeometry args={[3.2, 20]} /></mesh>
        </group>
      );
    })}
  </>
));

const Bandeja: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const ang = Math.atan(BANDEJA.pendiente);
  const largo = (BANDEJA.x1 - BANDEJA.x0) / Math.cos(ang);
  const cx = (BANDEJA.x0 + BANDEJA.x1) / 2;
  const cy = yBandeja(cx);
  return (
    <group position={[cx, cy, BANDEJA.z]} rotation={[0, 0, -ang]}>
      <Tabla c={[0, -0.8, 0]} t={[largo, 1.6, BANDEJA.ancho]} mat={mats.maderaB} />
      <Tabla c={[0, 0.6, BANDEJA.ancho / 2 + 0.4]} t={[largo, 2.8, 0.8]} mat={mats.madera} />
      <Tabla c={[0, 0.9, -BANDEJA.ancho / 2 - 0.4]} t={[largo, 3.4, 0.8]} mat={mats.madera} />
      {[-0.4, 0, 0.4].map((u) => <Barra key={u} a={{ x: u * largo, y: -1.6, z: 0 }} b={{ x: u * largo, y: -14, z: -10 }} r={0.45} mat={mats.laton} />)}
    </group>
  );
});

const Embudo: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const alto = EMBUDO.yBoca - EMBUDO.yFondo;
  const borde = useMemo(() => new THREE.MeshStandardMaterial({ color: '#D2A04A', metalness: 1, roughness: 0.28, side: THREE.DoubleSide }), []);
  return (
    <>
      <mesh position={[EMBUDO.x, EMBUDO.yFondo + alto / 2, EMBUDO.z]} material={borde} castShadow receiveShadow>
        <cylinderGeometry args={[EMBUDO.rBoca, EMBUDO.rFondo, alto, 40, 1, true]} />
      </mesh>
      <mesh position={[EMBUDO.x, EMBUDO.yBoca, EMBUDO.z]} rotation={[Math.PI / 2, 0, 0]} material={mats.laton}>
        <torusGeometry args={[EMBUDO.rBoca, 0.6, 8, 40]} />
      </mesh>
      <mesh position={[EMBUDO.x, (TUBO_EMBUDO.y0 + TUBO_EMBUDO.y1) / 2, EMBUDO.z]} material={mats.vidrio}>
        <cylinderGeometry args={[TUBO_EMBUDO.r, TUBO_EMBUDO.r, TUBO_EMBUDO.y0 - TUBO_EMBUDO.y1, 16, 1, true]} />
      </mesh>
      {[TUBO_EMBUDO.y0, (TUBO_EMBUDO.y0 + TUBO_EMBUDO.y1) / 2, TUBO_EMBUDO.y1 + 1].map((y) => (
        <mesh key={y} position={[EMBUDO.x, y, EMBUDO.z]} rotation={[Math.PI / 2, 0, 0]} material={mats.laton}><torusGeometry args={[TUBO_EMBUDO.r + 0.2, 0.45, 6, 20]} /></mesh>
      ))}
      <Barra a={{ x: EMBUDO.x + EMBUDO.rBoca, y: EMBUDO.yBoca - 3, z: EMBUDO.z }} b={{ x: BASTIDOR.x, y: EMBUDO.yBoca - 6, z: BASTIDOR.zPost }} r={0.6} mat={mats.laton} />
    </>
  );
});

const Deposito: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const { x0, x1, z0, z1, yFondo, yPila } = DEPOSITO;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pila = useRef<THREE.InstancedMesh>(null);
  const N = PRUEBA.has('sinpila') ? 1 : 1100;
  useLayoutEffect(() => {
    const m = pila.current!;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const x = x0 + 2 + hash(i * 5 + 1) * (W - 4), z = z0 + 2 + hash(i * 5 + 2) * (D - 4);
      const capa = i < 700 ? 0 : 1;
      o.position.set(x, yPila - R_CANICA - (capa ? 0 : 2.2) + hash(i * 5 + 3) * 0.6, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(colorCanica(i + 9000)));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [W, D, x0, z0, yPila]);
  return (
    <>
      <Tabla c={[cx, yFondo / 2, cz]} t={[W + 4, yFondo, D + 4]} mat={mats.maderaB} />
      <Tabla c={[cx, 8, z1 + 1]} t={[W + 4, 16, 2]} mat={mats.madera} />
      <Tabla c={[cx, 8, z0 - 1]} t={[W + 4, 16, 2]} mat={mats.madera} />
      <Tabla c={[x0 - 1, 8, cz]} t={[2, 16, D]} mat={mats.madera} />
      <Tabla c={[x1 + 1, 8, cz]} t={[2, 16, D]} mat={mats.madera} />
      <mesh position={[cx, yPila - 2.4, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#3B2A22" roughness={0.6} />
      </mesh>
      <instancedMesh ref={pila} args={[undefined, undefined, N]} material={mats.canicaPila} frustumCulled={false} receiveShadow>
        <icosahedronGeometry args={[R_CANICA, 1]} />
      </instancedMesh>
    </>
  );
});

const BajoMadera: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    {[-1, 1].map((s) => (
      <Tabla key={s} c={[-35, BAJO.yTop - BAJO.grosor - 1.8, BAJO.z + s * 11]} t={[46, 3.2, 3]} mat={mats.madera} />
    ))}
    {NOTAS_BAJO.map((_, i) => {
      const largo = 34 - 3 * i;
      return (
        <group key={i} position={[xBajo(i), BAJO.yTop - BAJO.grosor - 4 - largo / 2, BAJO.z]}>
          <mesh material={mats.latonOscuro} castShadow><cylinderGeometry args={[3.4, 3.4, largo, 18, 1, true]} /></mesh>
        </group>
      );
    })}
    {[-58, -12].map((x) => <Tabla key={x} c={[x, (BAJO.yTop - 5) / 2 + 8, BAJO.z]} t={[3, BAJO.yTop - 5 - 8, 3]} mat={mats.madera} />)}
  </>
));

const Ascensor: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    {[-3.6, 3.6].map((dx) => <Barra key={dx} a={{ x: ASCENSOR.x + dx, y: ASCENSOR.y0 - 4, z: 0 }} b={{ x: ASCENSOR.x + dx, y: ASCENSOR.y1 + 4, z: 0 }} r={0.7} mat={mats.laton} />)}
    <Barra a={{ x: ASCENSOR.x - 6, y: ASCENSOR.y1 + 4, z: 0 }} b={{ x: -BASTIDOR.x, y: ASCENSOR.y1 + 4, z: 0 }} r={0.6} mat={mats.laton} />
    <Barra a={{ x: ASCENSOR.x - 6, y: ASCENSOR.y0 - 2, z: 0 }} b={{ x: -BASTIDOR.x, y: ASCENSOR.y0 - 2, z: 0 }} r={0.6} mat={mats.laton} />
  </>
));

/** Rieles estáticos del circuito: canaleta, riel superior, espiral (con poste), reparto, tubo del bajo. */
const Circuito: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const espiral = useMemo(() => puntosEspiral(), []);
  const canaleta = useMemo(() => {
    const a = v3(CANALETA.desde), b = v3(CANALETA.hasta);
    const d = b.clone().sub(a);
    return { pos: a.clone().add(b).multiplyScalar(0.5), largo: d.length(), rotY: Math.atan2(-d.z, d.x), rotZ: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }, []);
  const tubo = useMemo(() => {
    const a = v3(TUBO_BAJO.desde), b = v3(TUBO_BAJO.hasta);
    const d = b.clone().sub(a);
    return { pos: a.clone().add(b).multiplyScalar(0.5), largo: d.length(), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) };
  }, []);
  return (
    <>
      <group position={canaleta.pos} rotation={[0, canaleta.rotY, canaleta.rotZ]}>
        <Tabla c={[0, -R_CANICA - 0.5, 0]} t={[canaleta.largo, 1, 4]} mat={mats.maderaB} />
        <Tabla c={[0, 0, 2.4]} t={[canaleta.largo, 3, 0.8]} mat={mats.madera} />
        <Tabla c={[0, 0, -2.4]} t={[canaleta.largo, 3, 0.8]} mat={mats.madera} />
      </group>
      <Rieles pts={[RIEL_SUPERIOR.desde, RIEL_SUPERIOR.hasta]} mats={mats} />
      <Rieles pts={espiral} mats={mats} sep={1.25} />
      <Barra a={{ x: ESPIRAL.x, y: ESPIRAL.y1 - 6, z: ESPIRAL.z }} b={{ x: ESPIRAL.x, y: ESPIRAL.y0 + 8, z: ESPIRAL.z }} r={1.1} mat={mats.acero} />
      {[0.15, 0.5, 0.85].map((u) => {
        const p = espiral[Math.round(u * (espiral.length - 1))];
        return <Barra key={u} a={{ x: ESPIRAL.x, y: p.y - 1, z: ESPIRAL.z }} b={{ x: p.x, y: p.y - 1, z: p.z }} r={0.3} mat={mats.laton} />;
      })}
      <Rieles pts={[espiral[espiral.length - 1], RIEL_REPARTO.desde]} mats={mats} />
      <Rieles pts={[RIEL_REPARTO.desde, RIEL_REPARTO.hasta]} mats={mats} />
      <mesh position={tubo.pos} quaternion={tubo.q} material={mats.vidrio}><cylinderGeometry args={[2.1, 2.1, tubo.largo, 14, 1, true]} /></mesh>
      <Rieles pts={[RIEL_BAJO.desde, RIEL_BAJO.hasta]} mats={mats} />
      {/* soportes del riel superior */}
      {[-30, 0, 30].map((x) => <Barra key={x} a={{ x, y: 214, z: -4 }} b={{ x, y: 208, z: 0 }} r={0.35} mat={mats.laton} />)}
    </>
  );
});

/** Soportes fijos de bombo y platillo. */
const Percusion: React.FC<{ mats: Mats }> = React.memo(({ mats }) => (
  <>
    {/* casco del bombo con aros y tensores */}
    <group position={[BOMBO.x, BOMBO.yParche - BOMBO.alto / 2, BOMBO.z]}>
      <mesh material={mats.lacaRoja} castShadow receiveShadow><cylinderGeometry args={[BOMBO.rParche + 0.6, BOMBO.rParche + 0.6, BOMBO.alto, 40, 1, true]} /></mesh>
      {[BOMBO.alto / 2, -BOMBO.alto / 2].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.laton}><torusGeometry args={[BOMBO.rParche + 0.7, 0.75, 8, 40]} /></mesh>)}
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return <mesh key={k} position={[Math.cos(a) * (BOMBO.rParche + 1.2), 0, Math.sin(a) * (BOMBO.rParche + 1.2)]} material={mats.acero}><boxGeometry args={[1.2, BOMBO.alto * 0.8, 1.2]} /></mesh>;
      })}
    </group>
    {/* pie del platillo */}
    <Barra a={{ x: PLATILLO.x, y: DEPOSITO.yPila - 1, z: PLATILLO.z }} b={{ x: PLATILLO.x, y: PLATILLO.y - 1, z: PLATILLO.z }} r={0.7} mat={mats.acero} />
  </>
));

/** Cargadores de vidrio de cada compuerta (tubo con aros de latón). */
const Cargadores: React.FC<{ sim: SimMaquina; mats: Mats }> = React.memo(({ sim, mats }) => (
  <>
    {sim.compuertas.map((c, i) => {
      const y0 = c.y - R_CANICA - 0.4, alto = c.yTope - y0;
      return (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh position={[0, y0 + alto / 2, 0]} material={mats.vidrio}><cylinderGeometry args={[R_CANICA + 0.45, R_CANICA + 0.45, alto, 14, 1, true]} /></mesh>
          {[y0 + 0.3, c.yTope].map((y) => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.laton} castShadow><torusGeometry args={[R_CANICA + 0.6, 0.4, 6, 16]} /></mesh>)}
          {/* pivote de la compuerta */}
          <mesh position={[-R_CANICA - 0.9, y0 - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.acero}><cylinderGeometry args={[0.35, 0.35, 3.4, 8]} /></mesh>
        </group>
      );
    })}
  </>
));

// ---------- Partes animadas ----------

/**
 * Fusiona la geometría estática de sus hijos por material (una malla por material y modo de sombra): SwiftShader paga
 * caro cada llamada de dibujo, y la escena tiene cientos de piezas fijas. Los hijos originales quedan ocultos.
 * Solo para contenido que no cambia (los hijos deben estar memorizados).
 */
const Fusionar: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    const inv = g.matrixWorld.clone().invert();
    const grupos = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[] }>();
    const originales: THREE.Object3D[] = [];
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || o.userData.fusion) return;
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv || !geo.attributes.normal) return;
      geo.applyMatrix4(inv.clone().multiply(m.matrixWorld));
      const mat = m.material as THREE.Material;
      const clave = `${mat.uuid}:${m.castShadow}:${m.receiveShadow}`;
      const e = grupos.get(clave) ?? { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [] };
      e.geos.push(geo);
      grupos.set(clave, e);
      originales.push(m);
    });
    for (const o of originales) o.visible = false;
    const nuevas: THREE.Mesh[] = [];
    for (const e of grupos.values()) {
      const geo = mergeGeometries(e.geos, false);
      if (!geo) continue;
      const malla = new THREE.Mesh(geo, e.mat);
      malla.castShadow = e.cast; malla.receiveShadow = e.recv; malla.userData.fusion = true;
      g.add(malla);
      nuevas.push(malla);
    }
    return () => { for (const n of nuevas) { g.remove(n); n.geometry.dispose(); } for (const o of originales) o.visible = true; };
  }, []);
  return <group ref={ref}>{children}</group>;
};

const Camara: React.FC<{ c: number[] }> = ({ c }) => {
  const { camera } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  cam.position.set(c[0], c[1], c[2]);
  cam.fov = c[6];
  cam.near = 2; cam.far = 4000;
  cam.lookAt(c[3], c[4], c[5]);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return null;
};

/** Entorno para reflejos (una vez). */
const Entorno: React.FC = () => {
  const { gl, scene } = useThree();
  useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }, [gl, scene]);
  return null;
};

const Brillo: React.FC<{ p: P3; tam: number; color: string; op: number; mats: Mats }> = ({ p, tam, color, op, mats }) =>
  op <= 0.004 ? null : (
    <sprite position={[p.x, p.y, p.z]} scale={[tam, tam, 1]}>
      <spriteMaterial map={mats.brillo} color={color} transparent opacity={Math.min(1, op)} blending={THREE.AdditiveBlending} depthWrite={false} />
    </sprite>
  );

/** InstancedMesh que se actualiza en cada frame (antes de que @remotion/three llame a advance). */
const useInstancias = (actualizar: (m: THREE.InstancedMesh) => void, deps: unknown[]) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    actualizar(m);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
};

const OCULTO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Canicas decorativas del circuito superior (flujo continuo) + cangilones del ascensor en fase. */
const Flujo: React.FC<{ t: number; mats: Mats }> = ({ t, mats }) => {
  const rec = useMemo(() => circuito(), []);
  const n = Math.ceil(rec.L / FLUJO.esp) + 1;
  const altoAsc = ASCENSOR.y1 - ASCENSOR.y0;
  const nCang = Math.ceil((altoAsc * 2) / FLUJO.esp);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const avance = t * FLUJO.v;
  const canicas = useInstancias((m) => {
    const base = avance % FLUJO.esp;
    const vuelta = Math.floor(avance / FLUJO.esp);
    for (let i = 0; i < n; i++) {
      const s = base + i * FLUJO.esp;
      if (s > rec.L) { m.setMatrixAt(i, OCULTO); continue; }
      const p = rec.en(s);
      o.position.set(p.x, p.y, p.z); o.scale.setScalar(1); o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(colorCanica(vuelta - i)));
    }
  }, [avance]);
  const cangilones = useInstancias((m) => {
    // cadena cerrada: sube por delante (z +2,4) y baja por detrás (z −2,4), cangilones en fase con las canicas.
    const fase = (((avance - rec.sAscensor) % FLUJO.esp) + FLUJO.esp) % FLUJO.esp;
    for (let k = 0; k < nCang; k++) {
      const s = (fase + k * FLUJO.esp) % (altoAsc * 2);
      const sube = s < altoAsc;
      const y = sube ? ASCENSOR.y0 + s : ASCENSOR.y1 - (s - altoAsc);
      o.position.set(ASCENSOR.x, y - R_CANICA - 0.6, sube ? ASCENSOR.z + 0.4 : ASCENSOR.z - 3.4);
      o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix();
      m.setMatrixAt(k, o.matrix);
    }
  }, [avance]);
  return (
    <>
      <instancedMesh ref={canicas} args={[undefined, undefined, n]} material={mats.canica} frustumCulled={false} castShadow>
        <sphereGeometry args={[R_CANICA, 18, 12]} />
      </instancedMesh>
      <instancedMesh ref={cangilones} args={[undefined, undefined, nCang]} material={mats.laton} frustumCulled={false} castShadow>
        <boxGeometry args={[5.6, 0.7, 4]} />
      </instancedMesh>
      {/* piñones del ascensor */}
      {[ASCENSOR.y0 - 1.5, ASCENSOR.y1 + 1.5].map((y) => (
        <group key={y} position={[ASCENSOR.x, y, -1.5]} rotation={[0, 0, (-avance / 3.2) % (Math.PI * 2)]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.acero} castShadow><cylinderGeometry args={[3.2, 3.2, 1.6, 12]} /></mesh>
          {[0, 1, 2].map((k) => <mesh key={k} rotation={[0, 0, (k * Math.PI) / 3]} material={mats.latonOscuro}><boxGeometry args={[7.4, 0.8, 1.8]} /></mesh>)}
        </group>
      ))}
    </>
  );
};

/** Cuerpo de la noria (aros, rayos, cubo, bolsillos): estático en su propio marco, gira el grupo que lo contiene. */
const RuedaNoria: React.FC<{ mats: Mats }> = React.memo(({ mats }) => {
  const tope = Math.PI / 2 + 0.12;
  const rB = NORIA.radio - 2.2;
  return (
    <>
        {[-NORIA.ancho / 2, NORIA.ancho / 2].map((z) => (
        <group key={z}>
          <mesh position={[0, 0, z]} material={mats.madera} castShadow receiveShadow><torusGeometry args={[NORIA.radio, 1.5, 10, 72]} /></mesh>
          <mesh position={[0, 0, z]} material={mats.laton}><torusGeometry args={[NORIA.radio - 2.2, 0.4, 6, 72]} /></mesh>
          {Array.from({ length: 8 }, (_, k) => (
            <mesh key={k} position={[0, 0, z]} rotation={[0, 0, (k * Math.PI) / 8]} material={mats.maderaB} castShadow>
              <boxGeometry args={[NORIA.radio * 2 - 1, 2.2, 1.6]} />
            </mesh>
          ))}
        </group>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.laton} castShadow><cylinderGeometry args={[5.5, 5.5, NORIA.ancho + 4, 24]} /></mesh>
        <mesh position={[0, 0, NORIA.ancho / 2 + 2.1]} material={mats.latonOscuro}><circleGeometry args={[5.5, 24]} /></mesh>
        {Array.from({ length: NORIA.bolsillos }, (_, k) => {
          const phi = tope + (2 * Math.PI * k) / NORIA.bolsillos;
          return (
            <group key={k} position={[Math.cos(phi) * rB, Math.sin(phi) * rB, 0]} rotation={[0, 0, phi]}>
              <mesh position={[0, 0, 0]} material={mats.laton} castShadow><boxGeometry args={[0.7, 4.6, NORIA.ancho]} /></mesh>
              <mesh position={[1.8, -2.1, 0]} material={mats.laton}><boxGeometry args={[3.6, 0.6, NORIA.ancho]} /></mesh>
            </group>
          );
        })}
        </>
  );
});

/** Noria: rueda de madera con bolsillos de latón; gira un bolsillo por pulso (el trinquete hace clac en cada negra). */
const Noria: React.FC<{ t: number; sim: SimMaquina; mats: Mats }> = ({ t, sim, mats }) => {
  const beat = 60 / sim.bpm;
  const w = (2 * Math.PI) / NORIA.bolsillos / beat;
  const tope = Math.PI / 2 + 0.12;
  // en cada pulso un bolsillo pasa por el punto de vuelco (arriba, algo a la izquierda)
  const giro = -w * (t - sim.entrada);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const rB = NORIA.radio - 2.2;
  const canicas = useInstancias((m) => {
    for (let k = 0; k < NORIA.bolsillos; k++) {
      const phi = tope + (2 * Math.PI * k) / NORIA.bolsillos + giro;
      const a = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const cargado = a > tope + 0.03 && a < (3 * Math.PI) / 2 - 0.08;
      const vuelta = Math.floor((-giro - (2 * Math.PI * k) / NORIA.bolsillos) / (2 * Math.PI));
      for (let j = 0; j < 2; j++) {
        const i = k * 2 + j;
        if (!cargado) { m.setMatrixAt(i, OCULTO); continue; }
        o.position.set(NORIA.x + Math.cos(phi) * rB, NORIA.y + Math.sin(phi) * rB + R_CANICA + 0.5, NORIA.z + (j ? 1.6 : -1.6));
        o.scale.setScalar(1); o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, col.set(colorCanica(vuelta * 40 + i + 500)));
      }
    }
  }, [giro]);
  // trinquete: se alza 45 ms antes del clac y cae en el pulso
  const desdePulso = ((t - sim.entrada) % beat + beat) % beat;
  const alza = desdePulso > beat - 0.06 ? (desdePulso - (beat - 0.06)) / 0.06 : Math.max(0, 1 - desdePulso / 0.03);
  return (
    <>
      <group position={[NORIA.x, NORIA.y, NORIA.z]} rotation={[0, 0, giro]}>
        <Fusionar><RuedaNoria mats={mats} /></Fusionar>
      </group>
      <instancedMesh ref={canicas} args={[undefined, undefined, NORIA.bolsillos * 2]} material={mats.canica} frustumCulled={false} castShadow>
        <sphereGeometry args={[R_CANICA, 18, 12]} />
      </instancedMesh>
      {/* eje y caballete trasero */}
      <Barra a={{ x: NORIA.x, y: NORIA.y, z: NORIA.z - 6 }} b={{ x: NORIA.x, y: NORIA.y, z: -33 }} r={1.6} mat={mats.acero} />
      <Barra a={{ x: -26, y: 2, z: -33 }} b={{ x: 0, y: NORIA.y + 4, z: -33 }} r={2.2} mat={mats.madera} />
      <Barra a={{ x: 26, y: 2, z: -33 }} b={{ x: 0, y: NORIA.y + 4, z: -33 }} r={2.2} mat={mats.madera} />
      {/* trinquete */}
      <group position={[NORIA.x + 8.5, NORIA.y + 3.5, NORIA.z + NORIA.ancho / 2 + 2.6]} rotation={[0, 0, 0.35 * suave(alza)]}>
        <mesh position={[-3, 0, 0]} material={mats.laton} castShadow><boxGeometry args={[6.5, 1, 1]} /></mesh>
      </group>
    </>
  );
};

/** Piezas que suenan: láminas, barras de bajo, parche del bombo y platillo (vibran y se encienden al golpe). */
const Instrumentos: React.FC<{ sim: SimMaquina; f: number; mats: Mats; golpesPor: Map<string, number[]> }> = ({ sim, f, mats, golpesPor }) => {
  const fps = sim.fps;
  const dt = (pieza: Pieza, i: number) => (f - ultimoHasta(golpesPor.get(`${pieza}:${i}`) ?? [], f)) / fps;
  const matsLam = useMemo(() => COLORES_VIBRA.map((c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.65, roughness: 0.26, emissive: c, emissiveIntensity: 0 })), []);
  const matsBajo = useMemo(() => NOTAS_BAJO.map(() => new THREE.MeshStandardMaterial({ map: mats.palisandro.map, roughness: 0.4, emissive: '#FF9A40', emissiveIntensity: 0 })), [mats]);
  const tPla = dt('platillo', 0);
  const abierto = sim.golpes.some((g) => g.pista === 'platillo' && g.abierto && Math.abs(g.frame - (f - tPla * fps)) < 1);
  const ampPla = (abierto ? 0.11 : 0.06) * Math.exp(-tPla / (abierto ? 0.9 : 0.45));
  const tBo = dt('bombo', 0);
  const hundir = tBo < 0.4 ? 0.9 * Math.exp(-tBo / 0.05) * Math.cos(2 * Math.PI * 14 * tBo) : 0;
  return (
    <>
      {NOTAS_VIBRA.map((_, i) => {
        const d = dt('lamina', i);
        const flash = d >= 0 && d < 2 ? Math.exp(-d / 0.32) : 0;
        matsLam[i].emissiveIntensity = 0.06 + 1.5 * flash;
        const wob = d < 1.2 ? 0.02 * Math.exp(-d / 0.22) * Math.sin(2 * Math.PI * 11 * d) : 0;
        const c = contacto('lamina', i);
        return (
          <group key={i}>
            <mesh position={[xLamina(i), VIBRA.yTop - VIBRA.grosor / 2, 0]} rotation={[wob, 0, wob * 0.4]} material={matsLam[i]} castShadow receiveShadow>
              <boxGeometry args={[VIBRA.ancho, VIBRA.grosor, largoLamina(i)]} />
            </mesh>
            {[-1, 1].map((s) => <mesh key={s} position={[xLamina(i), VIBRA.yTop - VIBRA.grosor / 2, s * 8.5]} rotation={[0, 0, Math.PI / 2]} material={mats.acero}><cylinderGeometry args={[0.35, 0.35, VIBRA.ancho + 1.4, 6]} /></mesh>)}
            <Brillo p={{ x: c.x, y: VIBRA.yTop + 0.5, z: c.z }} tam={26 + 18 * flash} color={COLORES_VIBRA[i]} op={0.95 * flash} mats={mats} />
            <Brillo p={{ x: xLamina(i), y: VIBRA.yTop - 8, z: 0 }} tam={30} color={COLORES_VIBRA[i]} op={0.35 * flash} mats={mats} />
          </group>
        );
      })}
      {NOTAS_BAJO.map((_, i) => {
        const d = dt('bajo', i);
        const flash = d >= 0 && d < 2 ? Math.exp(-d / 0.4) : 0;
        matsBajo[i].emissiveIntensity = 0.5 * flash;
        const wob = d < 1.2 ? 0.016 * Math.exp(-d / 0.25) * Math.sin(2 * Math.PI * 7 * d) : 0;
        const c = contacto('bajo', i);
        return (
          <group key={i}>
            <mesh position={[xBajo(i), BAJO.yTop - BAJO.grosor / 2, BAJO.z]} rotation={[wob, 0, 0]} material={matsBajo[i]} castShadow receiveShadow>
              <boxGeometry args={[BAJO.ancho, BAJO.grosor, largoBajo(i)]} />
            </mesh>
            <Brillo p={{ x: c.x, y: BAJO.yTop + 0.5, z: c.z }} tam={24 + 16 * flash} color="#FFB060" op={0.8 * flash} mats={mats} />
          </group>
        );
      })}
      {/* parche del bombo (se hunde y rebota) */}
      <mesh position={[BOMBO.x, BOMBO.yParche - 0.15 - hundir, BOMBO.z]} material={mats.parche} receiveShadow castShadow scale={[1, 1 + hundir * 0.6, 1]}>
        <cylinderGeometry args={[BOMBO.rParche, BOMBO.rParche, 0.3, 40]} />
      </mesh>
      <Brillo p={{ x: BOMBO.xGolpe, y: BOMBO.yParche + 1, z: BOMBO.zGolpe }} tam={40} color="#FF6A4A" op={tBo < 1 ? 0.8 * Math.exp(-tBo / 0.12) : 0} mats={mats} />
      {/* platillo: inclinado hacia la cámara, oscila tras cada golpe */}
      <group position={[PLATILLO.x, PLATILLO.y, PLATILLO.z]} rotation={[Math.atan2(PLATILLO.n.z, PLATILLO.n.y) + ampPla * Math.sin(2 * Math.PI * 2.4 * tPla), 0, ampPla * 0.4 * Math.cos(2 * Math.PI * 1.9 * tPla)]}>
        <mesh material={mats.platillo} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[PLATILLO.radio, 48]} />
        </mesh>
        <mesh position={[0, 0.6, 0]} material={mats.laton}><sphereGeometry args={[2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.latonOscuro}><torusGeometry args={[PLATILLO.radio, 0.18, 4, 48]} /></mesh>
      </group>
      <Brillo p={{ x: PLATILLO.xGolpe, y: PLATILLO.y + 1, z: PLATILLO.zGolpe }} tam={46} color="#FFE08A" op={tPla < 1 ? 0.85 * Math.exp(-tPla / 0.1) : 0} mats={mats} />
    </>
  );
};

/** Compuertas (aleta que se abre) y canicas apiladas en los cargadores. */
const Compuertas: React.FC<{ sim: SimMaquina; t: number; mats: Mats }> = ({ sim, t, mats }) => {
  const d = R_CANICA * 2 * 1.02;
  const cupo = sim.compuertas.map((c) => Math.floor((c.yTope - c.y) / d) + 1);
  const total = cupo.reduce((a, b) => a + b, 0);
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const ultimas = sim.compuertas.map((c) => ultimoHasta(c.sueltas, t + 1e-6));
  const pila = useInstancias((m) => {
    let i = 0;
    sim.compuertas.forEach((c, ci) => {
      const ult = ultimas[ci];
      const u = suave((t - ult - 0.05) / 0.16);
      const nSueltas = c.sueltas.filter((s) => s <= t + 1e-6).length;
      for (let j = 1; j <= cupo[ci]; j++) {
        const y = c.y + j * d - d * u;
        if (y > c.yTope - R_CANICA * 0.5) { m.setMatrixAt(i++, OCULTO); continue; }
        o.position.set(c.x, y, c.z); o.scale.setScalar(1); o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        m.setColorAt(i, col.set(c.pieza === 'lamina' ? c.color : colorCanica(ci * 100 + nSueltas + j)));
        i++;
      }
    });
    for (; i < total; i++) m.setMatrixAt(i, OCULTO);
  }, [t]);
  return (
    <>
      <instancedMesh ref={pila} args={[undefined, undefined, total]} material={mats.canica} frustumCulled={false} castShadow>
        <sphereGeometry args={[R_CANICA, 18, 12]} />
      </instancedMesh>
      {sim.compuertas.map((c, ci) => {
        const s = t - ultimas[ci];
        const abre = s < 0.03 ? suave(s / 0.03) : s < 0.12 ? 1 : 1 - suave((s - 0.12) / 0.12);
        const y = c.y - R_CANICA - 0.55;
        return (
          <group key={ci} position={[c.x - R_CANICA - 0.9, y, c.z]} rotation={[0, 0, -1.3 * abre]}>
            <mesh position={[R_CANICA + 0.9, 0, 0]} material={mats.laton} castShadow><boxGeometry args={[R_CANICA * 2 + 1.8, 0.45, 3]} /></mesh>
          </group>
        );
      })}
    </>
  );
};

/** Canicas de la partitura (cada una con su trayectoria) + destellos e impactos de cada golpe. */
const CanicasMusicales: React.FC<{ sim: SimMaquina; f: number; mats: Mats }> = ({ sim, f, mats }) => {
  const MAX = 96;
  const o = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const vivas = sim.canicas.filter((c) => f >= c.desde && f < c.desde + c.pos.length / 3);
  const ref = useInstancias((m) => {
    vivas.slice(0, MAX).forEach((c, i) => {
      const k = (f - c.desde) * 3;
      o.position.set(c.pos[k], c.pos[k + 1], c.pos[k + 2]); o.scale.setScalar(1); o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(c.color));
    });
    for (let i = vivas.length; i < MAX; i++) m.setMatrixAt(i, OCULTO);
  }, [f]);
  // impactos de los últimos 0,5 s
  const efectos: React.ReactNode[] = [];
  for (const g of sim.golpes) {
    const d = (f - g.frame) / sim.fps;
    if (d < 0 || d > 0.55) continue;
    const c = contacto(g.pieza, g.idx);
    const color = sim.canicas[g.canica].color;
    const k = d / 0.4;
    const pc = { x: c.x - c.n.x * R_CANICA, y: c.y - c.n.y * R_CANICA + 0.15, z: c.z - c.n.z * R_CANICA };
    if (k < 1) {
      const esc = 1.5 + 4.5 * (1 - (1 - k) ** 3) * (g.acento || g.abierto ? 1.4 : 1);
      efectos.push(
        <mesh key={`o${g.canica}`} position={[pc.x, pc.y, pc.z]} rotation={[-Math.PI / 2 + Math.atan2(c.n.z, c.n.y), 0, 0]} scale={[esc, esc, 1]}>
          <ringGeometry args={[0.82, 1, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.6 * (1 - k) * (1 - k)} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>,
      );
    }
    for (let s = 0; s < 9; s++) {
      const h1 = hash(g.canica * 131 + s * 7), h2 = hash(g.canica * 131 + s * 7 + 3), h3 = hash(g.canica * 131 + s * 7 + 5);
      const a = h1 * Math.PI * 2;
      const v = 40 + 70 * h2;
      const vida = 1 - d / (0.3 + 0.25 * h3);
      if (vida <= 0) continue;
      efectos.push(<Brillo key={`c${g.canica}-${s}`} mats={mats} color={s % 3 === 0 ? '#FFF4DA' : color} tam={(1.2 + 1.6 * h3) * (0.6 + vida)} op={vida}
        p={{ x: pc.x + Math.cos(a) * v * d, y: pc.y + (60 + 50 * h3) * d - 0.5 * 981 * 0.5 * d * d, z: pc.z + Math.sin(a) * v * d * 0.8 }} />);
    }
  }
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, MAX]} material={mats.canica} frustumCulled={false} castShadow>
        <sphereGeometry args={[R_CANICA, 24, 16]} />
      </instancedMesh>
      {vivas.map((c) => {
        const k = (f - c.desde) * 3;
        const tras = c.golpe === null ? 99 : (f - c.golpe) / sim.fps;
        const op = tras >= 0 && tras < 0.6 ? 0.55 * Math.exp(-tras / 0.18) : 0;
        return <Brillo key={c.desde * 1000 + c.compuerta} p={{ x: c.pos[k], y: c.pos[k + 1], z: c.pos[k + 2] + 0.5 }} tam={7} color={c.color} op={op} mats={mats} />;
      })}
      {efectos}
    </>
  );
};

const Luces: React.FC = () => {
  const { scene } = useThree();
  const key = useMemo(() => {
    const l = new THREE.DirectionalLight('#FFD8A6', 2.6);
    l.position.set(-150, 300, 260);
    l.target.position.set(0, 100, 0);
    l.castShadow = !PRUEBA.has('sinsombra');
    l.shadow.mapSize.set(PRUEBA.has('sombra1k') ? 1024 : 2048, PRUEBA.has('sombra1k') ? 1024 : 2048);
    const c = l.shadow.camera as THREE.OrthographicCamera;
    c.left = -130; c.right = 130; c.top = 150; c.bottom = -150; c.near = 100; c.far = 800;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.3;
    l.shadow.radius = 4;
    scene.add(l.target);
    return l;
  }, [scene]);
  return (
    <>
      <primitive object={key} />
      <directionalLight position={[220, 140, 180]} intensity={0.7} color="#FFC48A" />
      <directionalLight position={[60, 260, -300]} intensity={1.7} color="#A9C8FF" />
      <hemisphereLight args={['#FFE6C8', '#3A2416', 0.45]} />
      <ambientLight intensity={0.12} color="#FFDDBB" />
    </>
  );
};

const Escena: React.FC<{ sim: SimMaquina; f: number }> = ({ sim, f }) => {
  const mats = useMemo(crearMateriales, []);
  const t = f / sim.fps;
  const golpesPor = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const g of sim.golpes) { const k = `${g.pieza}:${g.idx}`; const l = m.get(k) ?? []; l.push(g.frame); m.set(k, l); }
    for (const l of m.values()) l.sort((a, b) => a - b);
    return m;
  }, [sim]);
  const cam = sim.camara.slice(f * 7, f * 7 + 7);
  return (
    <>
      <Camara c={cam} />
      <Entorno />
      <Luces />
      {PRUEBA.has('sinestatico') ? null : <Fusionar>
        <Taller mats={mats} />
        <Lamparas mats={mats} />
        <Bastidor mats={mats} />
        <Vibrafono mats={mats} />
        <Bandeja mats={mats} />
        <Embudo mats={mats} />
        <Deposito mats={mats} />
        <BajoMadera mats={mats} />
        <Ascensor mats={mats} />
        <Circuito mats={mats} />
        <Percusion mats={mats} />
        <Cargadores sim={sim} mats={mats} />
      </Fusionar>}
      <Noria t={t} sim={sim} mats={mats} />
      <Flujo t={t} mats={mats} />
      <Instrumentos sim={sim} f={f} mats={mats} golpesPor={golpesPor} />
      <Compuertas sim={sim} t={t} mats={mats} />
      <CanicasMusicales sim={sim} f={f} mats={mats} />
    </>
  );
};

export const Maquina: React.FC<GuionMaquina> = (props) => {
  cargarFuentes();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sim = useSim(props.id);
  PRUEBA = new Set((props.prueba ?? '').split(',').filter(Boolean));
  if (!sim) return null;
  const f = Math.min(frame, sim.duracionFrames - 1);
  const framesCierre = Math.round(1.2 * fps);
  const inicioCierre = durationInFrames - framesCierre;
  const fadeCierre = interpolate(frame, [inicioCierre - 8, inicioCierre + 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const arriba = props.arriba ?? TEXTOS_MAQUINA.arriba;
  const abajo = props.abajo ?? TEXTOS_MAQUINA.abajo;
  return (
    <AbsoluteFill style={{ background: '#140D09', overflow: 'hidden' }}>
      <Audio src={rutaAudio(props.id)} />
      <ThreeCanvas width={FORMATO.ancho} height={FORMATO.alto} shadows={PRUEBA.has('pcf') ? true : 'soft'} gl={{ antialias: !PRUEBA.has('sinaa'), toneMappingExposure: 1.05 }}
        camera={{ fov: 32, near: 2, far: 4000, position: [0, 120, 400] }}>
        {PRUEBA.has('vacio') ? null : <Escena sim={sim} f={f} />}
      </ThreeCanvas>
      {/* viñeta cálida de cine */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 48%, #00000000 55%, #0A050299 100%)', pointerEvents: 'none' }} />
      <Llamado texto={textoLlamado('maquina', props.id, props.llamado)} desde={Math.max(2 * fps, sim.finalFrame - 6 * fps)}
        hasta={inicioCierre} centroY={LLAMADO_CENTRO_Y} color={PALETA.neon.amarillo} />
      <BloqueTexto texto={arriba} color={PALETA.neon.amarillo} top={ARRIBA_TOP} tam={arriba.length > 24 ? 64 : 72} opacidad={fadeCierre} />
      <BloqueTexto texto={abajo} color={PALETA.neon.naranja} centroY={ABAJO_CENTRO_Y} tam={abajo.length > 26 ? 52 : 60} opacidad={fadeCierre} />
      <MarcaDeAgua />
      <Sequence from={inicioCierre} durationInFrames={framesCierre} name="Cierre">
        <Cierre color={PALETA.neon.amarillo} />
      </Sequence>
    </AbsoluteFill>
  );
};
