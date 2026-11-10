/**
 * Geometría FIJA de la máquina de canicas (centímetros, ejes de Three: y hacia arriba, z hacia la cámara).
 * La comparten el simulador (Node: dónde cae cada canica, cuándo se suelta) y el componente (dónde se dibuja cada
 * pieza): si una medida cambia aquí, el golpe sigue cayendo sobre la lámina. Sin React, sin Three, sin Node.
 *
 * Recorrido de una canica (el ciclo completo se ve):
 *   depósito (abajo) → NORIA (rueda grande del fondo) → canaleta → ASCENSOR (izquierda) → riel superior →
 *   ESPIRAL (arriba a la derecha) → riel de reparto → cargadores de vidrio → COMPUERTA (se abre en el instante
 *   calculado hacia atrás desde el golpe) → caída libre → LÁMINA / bajo / bombo / platillo → rebote hacia la
 *   cámara → bandeja → EMBUDO (gira en espiral) → tubo → depósito.
 */

export const G = 981; // cm/s²
export const R_CANICA = 1.3;

// ---------- Vibráfono (melodía): 8 láminas Sol4 … Sol5 ----------
export const NOTAS_VIBRA = [67, 69, 71, 72, 74, 76, 77, 79] as const;
/** Colores de las láminas (graves → agudas): arcoíris cálido de aluminio anodizado. */
export const COLORES_VIBRA = ['#E5483C', '#F2832B', '#F4C434', '#83C44A', '#2DB5A2', '#3189E0', '#7062E8', '#C54FCC'] as const;
export const VIBRA = {
  /** Cara superior de las láminas. */
  yTop: 120,
  grosor: 2.2,
  ancho: 9,
  /** z del punto de golpe (todas las láminas se golpean a 7 cm delante de su centro, cerca del nodo). */
  zGolpe: 7,
  /** Centro de la canica que espera en la compuerta (cae 18,7 cm: 0,195 s). */
  yCompuerta: 140,
  /** Tope de los cargadores (ahí pasa el riel de reparto). */
  yCargador: 163,
} as const;
export const xLamina = (i: number) => -42 + 12 * i;
export const largoLamina = (i: number) => 30 - 1.1 * i;

// ---------- Bandeja delantera del vibráfono → embudo ----------
/** La bandeja corre a lo largo de x por delante de las láminas, bajando hacia el embudo (a la derecha). */
export const BANDEJA = { x0: -50, x1: 50, z: 22, ancho: 11, y0: 111, pendiente: 0.07 } as const;
export const yBandeja = (x: number) => BANDEJA.y0 - BANDEJA.pendiente * (x - BANDEJA.x0);
/** Carriles de la bandeja (z): dos canicas que ruedan a la vez van por carriles distintos. */
export const CARRILES_BANDEJA = [18.5, 22, 25.5] as const;
/** Embudo: la bandeja entra tangente a su boca por el frente. */
export const EMBUDO = { x: 50, z: 10.5, yBoca: 101, rBoca: 13, yFondo: 86, rFondo: 2.4 } as const;
/** Tubo de vidrio del embudo al depósito. */
export const TUBO_EMBUDO = { x: EMBUDO.x, z: EMBUDO.z, y0: EMBUDO.yFondo, y1: 15, r: 2.6 } as const;

// ---------- Bajo de madera: 4 láminas grandes Sol2 Do3 Re3 Mi3 ----------
export const NOTAS_BAJO = [43, 48, 50, 52] as const;
export const BAJO = { yTop: 62, grosor: 3.2, ancho: 8, z: 8, zGolpe: 21, yCompuerta: 82, yCargador: 96 } as const;
export const xBajo = (i: number) => -50 + 10 * i;
export const largoBajo = (i: number) => 36 - 2 * i;

// ---------- Bombo (membrana horizontal) ----------
export const BOMBO = { x: 26, z: 10, yParche: 38, rParche: 13, alto: 22, xGolpe: 27, zGolpe: 14, yCompuerta: 82, yCargador: 100 } as const;

// ---------- Platillo (inclinado hacia la cámara) ----------
const nP = { x: 0, y: 0.97, z: 0.24 };
const lP = Math.hypot(nP.x, nP.y, nP.z);
export const PLATILLO = {
  x: 2, y: 55, z: 8, radio: 12,
  /** Normal de la cara superior (inclinado ~14° hacia la cámara: la canica sale despedida hacia adelante). */
  n: { x: nP.x / lP, y: nP.y / lP, z: nP.z / lP },
  xGolpe: 2, zGolpe: 11, yCompuerta: 76, yCargador: 92,
} as const;
/** y de la superficie del platillo en (x, z). */
export const yPlatillo = (x: number, z: number) => PLATILLO.y - (PLATILLO.n.x * (x - PLATILLO.x) + PLATILLO.n.z * (z - PLATILLO.z)) / PLATILLO.n.y;

// ---------- Depósito (abajo, de lado a lado) ----------
export const DEPOSITO = { x0: -62, x1: 62, z0: -32, z1: 48, yFondo: 2, yPila: 13 } as const;

// ---------- Noria (rueda grande del fondo) ----------
/** Gira en sentido horario visto de frente: los bolsillos suben por la izquierda y vuelcan arriba en la canaleta. */
export const NORIA = { x: 0, y: 54, z: -18, radio: 38, bolsillos: 16, ancho: 7 } as const;
/** Canaleta de la cima de la noria al pie del ascensor. */
export const CANALETA = { desde: { x: -4, y: 94, z: -14 }, hasta: { x: -54, y: 86, z: -2 } } as const;

// ---------- Ascensor (izquierda): cadena de cangilones ----------
export const ASCENSOR = { x: -56, z: 0, y0: 84, y1: 210, paso: 6 } as const;

// ---------- Circuito superior ----------
/** Riel superior: del cabezal del ascensor hacia la derecha, bajando suave. */
export const RIEL_SUPERIOR = { desde: { x: -52, y: 211, z: 0 }, hasta: { x: 36, y: 205, z: 0 } } as const;
/** Espiral (hélice) arriba a la derecha. */
export const ESPIRAL = { x: 44, z: 0, y0: 204, y1: 172, radio: 8, vueltas: 3 } as const;
/** Riel de reparto: pasa sobre los cargadores del vibráfono de derecha a izquierda. */
export const RIEL_REPARTO = { desde: { x: 46, y: 167, z: VIBRA.zGolpe }, hasta: { x: -52, y: 165, z: VIBRA.zGolpe } } as const;
/** Tubo de bajada al bajo y riel corto sobre sus cargadores. */
export const TUBO_BAJO = { desde: { x: -54, y: 164, z: VIBRA.zGolpe }, hasta: { x: -54, y: 99, z: BAJO.zGolpe } } as const;
export const RIEL_BAJO = { desde: { x: -54, y: 98.5, z: BAJO.zGolpe }, hasta: { x: -16, y: 97, z: BAJO.zGolpe } } as const;

/** Rapidez del flujo de canicas decorativas por el circuito (cm/s) y separación entre ellas (cm). */
export const FLUJO = { v: 34, esp: 6.5 } as const;

/** Bastidor de madera: postes y travesaños. */
export const BASTIDOR = { x: 66, alto: 222, zPost: -6, grueso: 6 } as const;

export type Pieza = 'lamina' | 'bajo' | 'bombo' | 'platillo';

/** Punto de contacto (centro de la canica) y normal de la superficie golpeada, para cada pieza. */
export const contacto = (pieza: Pieza, i = 0): { x: number; y: number; z: number; n: { x: number; y: number; z: number }; yCompuerta: number } => {
  if (pieza === 'lamina') return { x: xLamina(i), y: VIBRA.yTop + R_CANICA, z: VIBRA.zGolpe, n: { x: 0, y: 1, z: 0 }, yCompuerta: VIBRA.yCompuerta };
  if (pieza === 'bajo') return { x: xBajo(i), y: BAJO.yTop + R_CANICA, z: BAJO.zGolpe, n: { x: 0, y: 1, z: 0 }, yCompuerta: BAJO.yCompuerta };
  if (pieza === 'bombo') return { x: BOMBO.xGolpe, y: BOMBO.yParche + R_CANICA, z: BOMBO.zGolpe, n: { x: 0, y: 1, z: 0 }, yCompuerta: BOMBO.yCompuerta };
  const { n } = PLATILLO;
  const ys = yPlatillo(PLATILLO.xGolpe, PLATILLO.zGolpe);
  return { x: PLATILLO.xGolpe + n.x * R_CANICA, y: ys + n.y * R_CANICA, z: PLATILLO.zGolpe + n.z * R_CANICA, n, yCompuerta: PLATILLO.yCompuerta };
};

/**
 * Distancia (con signo) del centro de una canica a la superficie de la pieza, menos el radio de la canica: 0 = toca.
 * `dentro` dice si el punto cae sobre la huella de la pieza (lámina, parche, platillo). La usa el verificador.
 */
export const holgura = (pieza: Pieza, i: number, p: { x: number; y: number; z: number }) => {
  if (pieza === 'lamina') {
    const dentro = Math.abs(p.x - xLamina(i)) <= VIBRA.ancho / 2 && Math.abs(p.z) <= largoLamina(i) / 2;
    return { h: p.y - VIBRA.yTop - R_CANICA, dentro };
  }
  if (pieza === 'bajo') {
    const dentro = Math.abs(p.x - xBajo(i)) <= BAJO.ancho / 2 && Math.abs(p.z - BAJO.z) <= largoBajo(i) / 2;
    return { h: p.y - BAJO.yTop - R_CANICA, dentro };
  }
  if (pieza === 'bombo') {
    const dentro = Math.hypot(p.x - BOMBO.x, p.z - BOMBO.z) <= BOMBO.rParche;
    return { h: p.y - BOMBO.yParche - R_CANICA, dentro };
  }
  const { n } = PLATILLO;
  const d = n.x * (p.x - PLATILLO.x) + n.y * (p.y - PLATILLO.y) + n.z * (p.z - PLATILLO.z);
  const dentro = Math.hypot(p.x - PLATILLO.x, p.z - PLATILLO.z) <= PLATILLO.radio;
  return { h: d - R_CANICA, dentro };
};
