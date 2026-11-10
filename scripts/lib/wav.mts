/**
 * Síntesis de audio en Node sin dependencias: buffers Float32, mezcla y WAV 48 kHz 16-bit.
 * Lo comparten todas las plantillas. No hagas síntesis dentro de Remotion.
 */
import fs from 'node:fs';

export const SR = 48000;

export const crearPista = (segundos: number) => new Float32Array(Math.ceil(segundos * SR));

/** Frecuencia de una nota MIDI (69 = La4 = 440 Hz). */
export const midiAHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export type Timbre = 'seno' | 'triangulo' | 'cuadrada' | 'sierra' | 'pluck';

const onda = (timbre: Timbre, fase: number, t: number) => {
  const x = fase % 1;
  switch (timbre) {
    case 'seno': return Math.sin(2 * Math.PI * x);
    case 'triangulo': return 4 * Math.abs(x - 0.5) - 1;
    case 'cuadrada': return x < 0.5 ? 1 : -1;
    case 'sierra': return 2 * x - 1;
    case 'pluck': // seno con armónicos que se apagan rápido: suena a marimba/pluck
      return Math.sin(2 * Math.PI * x) + 0.5 * Math.exp(-6 * t) * Math.sin(4 * Math.PI * x) + 0.25 * Math.exp(-10 * t) * Math.sin(6 * Math.PI * x);
  }
};

/** Mezcla una nota en `pista` en el instante `inicio` (s). Envolvente ADSR en segundos. */
export const nota = (
  pista: Float32Array,
  opciones: { inicio: number; hz: number; duracion: number; volumen?: number; timbre?: Timbre; ataque?: number; caida?: number; sostenido?: number; liberacion?: number },
) => {
  const { inicio, hz, duracion, volumen = 0.5, timbre = 'pluck', ataque = 0.005, caida = 0.08, sostenido = 0.6, liberacion = 0.12 } = opciones;
  const desde = Math.floor(inicio * SR);
  const total = Math.floor((duracion + liberacion) * SR);
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    const t = i / SR;
    let env: number;
    if (t < ataque) env = t / ataque;
    else if (t < ataque + caida) env = 1 - (1 - sostenido) * ((t - ataque) / caida);
    else if (t < duracion) env = sostenido;
    else env = sostenido * Math.max(0, 1 - (t - duracion) / liberacion);
    if (timbre === 'pluck') env *= Math.exp(-2.5 * t);
    pista[idx] += onda(timbre, hz * t, t) * env * volumen;
  }
};

/** Golpe de ruido filtrado: útil para choques, "tic" de pared, caja. */
export const golpe = (pista: Float32Array, inicio: number, opciones: { duracion?: number; volumen?: number; tono?: number; semilla?: number } = {}) => {
  const { duracion = 0.05, volumen = 0.4, tono = 0.5, semilla = 1 } = opciones;
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(duracion * SR);
  let s = semilla >>> 0 || 1;
  let prev = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= pista.length) break;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const ruido = (s / 4294967296) * 2 - 1;
    prev = prev + tono * (ruido - prev); // filtro paso bajo de 1 polo: tono 0..1
    const env = Math.exp(-(i / total) * 8);
    pista[idx] += prev * env * volumen;
  }
};

/** Barrido ("whoosh"/"riser"): de hz0 a hz1 en `duracion` s. */
export const barrido = (pista: Float32Array, inicio: number, hz0: number, hz1: number, duracion: number, volumen = 0.3, timbre: Timbre = 'seno') => {
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(duracion * SR);
  let fase = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx >= pista.length) break;
    const t = i / SR;
    const hz = hz0 * Math.pow(hz1 / hz0, t / duracion);
    fase += hz / SR;
    const env = Math.sin(Math.PI * (t / duracion));
    pista[idx] += onda(timbre, fase, t) * env * volumen;
  }
};

/** Normaliza a pico objetivo (dBFS) y aplica un limitador suave. */
export const normalizar = (pista: Float32Array, picoDb = -1) => {
  let pico = 0;
  for (const v of pista) pico = Math.max(pico, Math.abs(v));
  if (pico === 0) return pista;
  const objetivo = Math.pow(10, picoDb / 20);
  const g = objetivo / pico;
  for (let i = 0; i < pista.length; i++) pista[i] = Math.tanh(pista[i] * g * 1.2) / Math.tanh(1.2) * objetivo;
  return pista;
};

export const mezclar = (destino: Float32Array, fuente: Float32Array, ganancia = 1, desplazamientoSeg = 0) => {
  const off = Math.floor(desplazamientoSeg * SR);
  for (let i = 0; i < fuente.length; i++) {
    const idx = i + off;
    if (idx >= 0 && idx < destino.length) destino[idx] += fuente[i] * ganancia;
  }
};

/** Escribe WAV mono o estéreo (mismo buffer a ambos canales si se pasa uno). */
export const escribirWav = (ruta: string, canales: Float32Array[]) => {
  const n = canales[0].length;
  const nc = canales.length;
  const datos = Buffer.alloc(n * nc * 2);
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
    const v = Math.max(-1, Math.min(1, canales[c][i]));
    datos.writeInt16LE(Math.round(v * 32767), (i * nc + c) * 2);
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8);
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(nc, 22);
  cab.writeUInt32LE(SR, 24); cab.writeUInt32LE(SR * nc * 2, 28); cab.writeUInt16LE(nc * 2, 32); cab.writeUInt16LE(16, 34);
  cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
  fs.mkdirSync(ruta.substring(0, ruta.lastIndexOf('/')), { recursive: true });
  fs.writeFileSync(ruta, Buffer.concat([cab, datos]));
};

/**
 * Melodía como partitura mínima: secuencia [midi, duración en pulsos] (pulso = negra; midi 0 = silencio).
 * `compas` (pulsos por compás, por defecto 4) y `anacrusa` (pulsos de levare antes del primer compás,
 * por defecto 0) solo sirven para el acompañamiento. `tonica` (clase de altura 0–11, Do = 0) y `menor`
 * fijan la tonalidad para armonizar; si faltan, se deducen (tónica = última nota sonora).
 */
export type Melodia = {
  nombre?: string;
  bpm: number;
  notas: [number, number][];
  compas?: number;
  anacrusa?: number;
  tonica?: number;
  menor?: boolean;
  /** Acordes explícitos, uno por compás (en bucle): [raíz 0–11, menor]. Si faltan, se armoniza solo (`armonizar`). */
  acordes?: [number, boolean][];
};

/** Melodías de dominio público del catálogo. */
export const MELODIAS: Record<string, Melodia> = {
  furelise: { nombre: 'Para Elisa (Beethoven)', bpm: 140, compas: 3, anacrusa: 1, tonica: 9, menor: true, notas: [[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],[0,.5],[60,.5],[64,.5],[69,.5],[71,1],[0,.5],[64,.5],[68,.5],[71,.5],[72,1],[0,.5],[64,.5],[76,.5],[75,.5],[76,.5],[75,.5],[76,.5],[71,.5],[74,.5],[72,.5],[69,1],[0,.5],[60,.5],[64,.5],[69,.5],[71,1],[0,.5],[64,.5],[72,.5],[71,.5],[69,1]] },
  odaalegria: { nombre: 'Oda a la Alegría (Beethoven)', bpm: 120, tonica: 0, menor: false, notas: [[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[64,1.5],[62,.5],[62,2],[64,1],[64,1],[65,1],[67,1],[67,1],[65,1],[64,1],[62,1],[60,1],[60,1],[62,1],[64,1],[62,1.5],[60,.5],[60,2]] },
  marchaturca: { nombre: 'Marcha Turca (Mozart)', bpm: 130, compas: 2, anacrusa: 2, tonica: 9, menor: true, notas: [[71,.5],[69,.5],[68,.5],[69,.5],[72,1],[0,.5],[74,.5],[72,.5],[71,.5],[72,.5],[76,1],[0,.5],[77,.5],[76,.5],[75,.5],[76,.5],[83,.5],[81,.5],[80,.5],[81,.5],[83,.5],[81,.5],[80,.5],[81,.5],[84,1],[81,.5],[84,.5],[0,.5],[83,.5],[81,.5],[79,.5],[81,.5],[83,.5],[81,.5],[79,.5],[81,.5],[83,.5],[81,.5],[79,.5],[78,.5],[76,1]] },
  canon: { nombre: 'Canon en Re (Pachelbel)', bpm: 100, tonica: 2, menor: false, notas: [[78,2],[76,2],[74,2],[73,2],[71,2],[69,2],[71,2],[73,2],[74,2],[73,2],[71,2],[69,2],[67,2],[66,2],[67,2],[61,2]] },
  cisnes: { nombre: 'Lago de los Cisnes (Chaikovski)', bpm: 110, tonica: 11, menor: true, notas: [[78,1.5],[79,.5],[81,1],[83,1],[84,1],[86,1],[83,1],[79,1],[78,1.5],[79,.5],[81,1],[83,1],[84,1],[86,1],[83,1],[79,1]] },
};

// ---------- Instrumentos de melodía (además de `nota` con timbre 'pluck') ----------

/** Timbres de la melodía que se pueden pedir desde un guion. */
export type Instrumento = 'pluck' | 'piano' | 'campana';

/** Ruido determinista para el "martillo" del piano y el golpe de la campana. */
const ruidoLcg = (semilla: number) => {
  let s = semilla >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
};

/**
 * Suma parciales senoidales con decaimiento exponencial propio. Cada parcial: [razón, amplitud, tau (s), desafine en Hz].
 * `largo`: segundos a escribir. `apagar`: instante (s) en que se suelta la tecla (fundido de `soltar` s); null = suena libre.
 */
const parciales = (
  pista: Float32Array, inicio: number, hz: number, volumen: number,
  lista: [number, number, number, number][], largo: number, ataque: number, apagar: number | null, soltar: number,
) => {
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(largo * SR);
  const nyquist = SR / 2 - 500;
  const activos = lista.filter(([razon]) => hz * razon < nyquist);
  const suma = activos.reduce((a, [, amp]) => a + amp, 0) || 1;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    const t = i / SR;
    let v = 0;
    for (const [razon, amp, tau, des] of activos) v += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * (hz * razon + des) * t);
    let env = t < ataque ? t / ataque : 1;
    if (apagar !== null && t > apagar) env *= Math.max(0, 1 - (t - apagar) / soltar);
    pista[idx] += (v / suma) * env * volumen;
  }
};

/**
 * Piano sintético: 4 parciales armónicos levemente estirados (inharmonicidad de cuerda, B = 0,0004), los agudos
 * se apagan antes que la fundamental (cuerpo cálido: la nota "se oscurece" al sostenerse), decaimiento en dos
 * etapas (golpe que cae rápido + resonancia larga), segunda cuerda desafinada +1,1 cents (batido lento) y un
 * clic de martillo de 4 ms. Las notas agudas decaen más rápido, como en un piano real. Se suelta la tecla a los
 * `duracion` s (apagador de 0,25 s).
 */
export const piano = (pista: Float32Array, o: { inicio: number; hz: number; duracion: number; volumen?: number; semilla?: number }) => {
  const { inicio, hz, duracion, volumen = 0.5, semilla = 3 } = o;
  const k = Math.sqrt(Math.max(0.5, hz / 261.6)); // > 1 en notas agudas
  const B = 0.0004;
  const est = (n: number) => n * Math.sqrt(1 + B * n * n);
  const des = hz * (Math.pow(2, 1.1 / 1200) - 1); // +1,1 cents
  const lista: [number, number, number, number][] = [
    // resonancia larga
    [est(1), 0.62, 2.2 / k, 0], [est(1), 0.34, 2.0 / k, des],
    [est(2), 0.30, 1.1 / k, 0], [est(3), 0.13, 0.6 / k, 0], [est(4), 0.07, 0.35 / k, 0],
    // golpe inicial que cae rápido (las dos etapas)
    [est(1), 0.30, 0.12, 0], [est(2), 0.22, 0.08, 0], [est(3), 0.12, 0.05, 0],
  ];
  const soltar = 0.25;
  parciales(pista, inicio, hz, volumen * 1.25, lista, duracion + soltar, 0.003, duracion, soltar);
  // Martillo: ruido grave muy corto.
  const azar = ruidoLcg(semilla);
  const desde = Math.floor(inicio * SR);
  let prev = 0;
  for (let i = 0; i < Math.floor(0.004 * SR); i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    prev += 0.25 * (azar() - prev);
    pista[idx] += prev * (1 - i / (0.004 * SR)) * volumen * 0.35;
  }
};

/**
 * Campana tubular: parciales INARMÓNICOS (barra libre: razones estiradas 2,0 · 3,01 · 4,17 · 5,43 · 6,79 sobre la
 * nota de golpe, más un "hum" una octava abajo y una tercera menor débil, típica de campana), con decaimiento largo
 * (la fundamental resuena ~2,6 s de tau) y pares desafinados de 0,6–0,9 Hz que dan el batido metálico.
 * No se apaga al soltar: suena libre hasta `largo` s.
 */
export const campana = (pista: Float32Array, o: { inicio: number; hz: number; volumen?: number; largo?: number; semilla?: number }) => {
  const { inicio, hz, volumen = 0.5, largo = 3.2, semilla = 5 } = o;
  const lista: [number, number, number, number][] = [
    [0.5, 0.16, 3.4, 0],
    [1, 1.0, 2.6, 0], [1, 0.45, 2.4, 0.7],
    [1.19, 0.10, 1.2, 0],
    [2.0, 0.55, 1.7, 0], [2.0, 0.2, 1.5, 0.9],
    [3.01, 0.38, 1.1, 0], [4.17, 0.26, 0.7, 0], [5.43, 0.16, 0.42, 0], [6.79, 0.09, 0.25, 0],
  ];
  parciales(pista, inicio, hz, volumen * 1.4, lista, largo, 0.0015, null, 0);
  // Golpe del mazo: chasquido brillante de 6 ms.
  const azar = ruidoLcg(semilla);
  const desde = Math.floor(inicio * SR);
  let prev = 0;
  for (let i = 0; i < Math.floor(0.006 * SR); i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    const r = azar();
    prev = r - prev * 0.6; // paso alto suave
    pista[idx] += prev * (1 - i / (0.006 * SR)) * volumen * 0.12;
  }
};

/** Toca una nota de melodía con el instrumento pedido. `duracion` = tiempo que se sostiene la tecla. */
export const tocar = (pista: Float32Array, instrumento: Instrumento, o: { inicio: number; hz: number; duracion: number; volumen: number; semilla?: number }) => {
  if (instrumento === 'piano') piano(pista, o);
  else if (instrumento === 'campana') campana(pista, { ...o, volumen: o.volumen * 0.8 });
  else nota(pista, { inicio: o.inicio, hz: o.hz, duracion: o.duracion, volumen: o.volumen, timbre: 'pluck', liberacion: 0.15 });
};

// ---------- Acompañamiento: bajo o acorde por compás, derivado de la melodía ----------

export type Acompanamiento = 'bajo' | 'acorde';

/** Nota sonora de la melodía con el compás al que pertenece (−1 = anacrusa). */
export type NotaCompas = { midi: number; pulsos: number; compas: number };
export type Acorde = { raiz: number; menor: boolean };

/** Deduce la tonalidad: tónica explícita o la última nota sonora; menor si pesa más la 3.ª menor que la mayor. */
export const tonalidadDe = (m: Melodia): { tonica: number; menor: boolean } => {
  const sonoras = m.notas.filter(([n]) => n > 0);
  const tonica = m.tonica ?? (((sonoras.at(-1)?.[0] ?? 60) % 12) + 12) % 12;
  if (m.menor !== undefined) return { tonica, menor: m.menor };
  let menor = 0, mayor = 0;
  for (const [n, p] of sonoras) {
    const pc = (n - tonica + 120) % 12;
    if (pc === 3) menor += p;
    if (pc === 4) mayor += p;
  }
  return { tonica, menor: menor > mayor };
};

/**
 * Prepara la melodía para el acompañamiento: notas sonoras con su compás y un acorde por compás.
 * El acorde se elige entre los grados básicos de la tonalidad (mayor: I IV V vi ii; menor: i iv V VI III VII)
 * como el que contiene más "tiempo" de las notas del compás (la primera nota pesa 1,5×; la raíz 1,2×);
 * empate → el grado que va antes en la lista (la tónica gana). Así "Bella Ciao" da Lam/Rem/Mi y "Jingle Bells" Do/Fa/Sol.
 */
export const armonizar = (m: Melodia): { notas: NotaCompas[]; acordes: Map<number, Acorde> } => {
  const compas = m.compas ?? 4;
  const anacrusa = m.anacrusa ?? 0;
  const { tonica, menor } = tonalidadDe(m);
  const grados: [number, boolean][] = menor
    ? [[0, true], [5, true], [7, false], [8, false], [3, false], [10, false]]
    : [[0, false], [5, false], [7, false], [9, true], [2, true]];
  const notas: NotaCompas[] = [];
  const porCompas = new Map<number, { midi: number; pulsos: number; primera: boolean }[]>();
  let pos = 0;
  for (const [midi, pulsos] of m.notas) {
    const c = pos < anacrusa ? -1 : Math.floor((pos - anacrusa) / compas);
    if (midi > 0) {
      notas.push({ midi, pulsos, compas: c });
      const lista = porCompas.get(c) ?? [];
      lista.push({ midi, pulsos, primera: lista.length === 0 });
      porCompas.set(c, lista);
    }
    pos += pulsos;
  }
  const acordes = new Map<number, Acorde>();
  for (const [c, lista] of porCompas) {
    if (c < 0) continue; // la anacrusa no lleva acorde: suena sola (y en el bucle, sobre el acorde anterior)
    if (m.acordes?.length) { const [raiz, men] = m.acordes[c % m.acordes.length]; acordes.set(c, { raiz, menor: men }); continue; }
    let mejor: Acorde = { raiz: tonica, menor }, puntaje = -1;
    for (const [g, men] of grados) {
      const raiz = (tonica + g) % 12;
      const tonos = [raiz, (raiz + (men ? 3 : 4)) % 12, (raiz + 7) % 12];
      let s = 0;
      for (const n of lista) {
        const pc = n.midi % 12;
        if (tonos.includes(pc)) s += n.pulsos * (n.primera ? 1.5 : 1) * (pc === raiz ? 1.2 : 1);
      }
      if (s > puntaje + 1e-9) { puntaje = s; mejor = { raiz, menor: men }; }
    }
    acordes.set(c, mejor);
  }
  return { notas, acordes };
};

/** Nota MIDI de la raíz del acorde ubicada una octava bajo la melodía (la más alta ≤ nota más grave − 5). */
export const raizBajo = (raiz: number, notaMasGrave: number) => {
  const techo = notaMasGrave - 5;
  let n = techo - ((techo - raiz) % 12 + 12) % 12;
  if (n < 36) n += 12;
  return n;
};

/**
 * Timbre suave del acompañamiento (seno + 2.º y 3.er armónicos débiles, ataque de 15 ms, se apaga solo):
 * acompaña sin pelear con la melodía y el 2.º armónico deja oír el bajo en el parlante de un teléfono.
 */
const suave = (pista: Float32Array, inicio: number, hz: number, duracion: number, volumen: number) => {
  parciales(pista, inicio, hz, volumen, [[1, 1, 1.1, 0], [2, 0.35, 0.6, 0], [3, 0.1, 0.35, 0]], duracion + 0.3, 0.015, duracion, 0.3);
};

/** Toca el acompañamiento de un compás: la raíz (bajo, + su octava grave muy suave) o la tríada cerrada (acorde). */
export const tocarAcompanamiento = (
  pista: Float32Array, modo: Acompanamiento, o: { inicio: number; duracion: number; acorde: Acorde; notaMasGrave: number; volumen?: number },
) => {
  const { inicio, duracion, acorde, notaMasGrave, volumen = 0.2 } = o;
  const r = raizBajo(acorde.raiz, notaMasGrave);
  if (modo === 'bajo') {
    suave(pista, inicio, midiAHz(r), duracion, volumen);
    if (r - 12 >= 28) suave(pista, inicio, midiAHz(r - 12), duracion, volumen * 0.45);
  } else {
    const tercera = r + (acorde.menor ? 3 : 4), quinta = r + 7;
    // Tríada cerrada en la octava de la raíz, con la quinta bajada si se acerca a la melodía.
    const notasAcorde = [r, tercera, quinta > notaMasGrave - 2 ? quinta - 12 : quinta];
    for (const n of notasAcorde) suave(pista, inicio, midiAHz(n), duracion, volumen * 0.5);
  }
};

/**
 * Melodía "a tempo" (según bpm, sin rebotes) con su instrumento y acompañamiento: para escuchar si la melodía
 * está bien escrita antes de renderizar (scripts/escuchar-melodia.mts). En el video el ritmo lo ponen los rebotes.
 */
export const melodiaATempo = (m: Melodia, instrumento: Instrumento, acompanamiento: Acompanamiento | null, segundos: number) => {
  const pista = crearPista(segundos + 0.5);
  const pulso = 60 / m.bpm;
  const { notas, acordes } = armonizar(m);
  const grave = Math.min(...notas.map((n) => n.midi));
  const compasSeg = (m.compas ?? 4) * pulso;
  let t = 0, previo = Number.NaN, k = 0;
  while (t < segundos) {
    for (const [midi, pulsos] of m.notas) {
      if (t >= segundos) break;
      if (midi > 0) {
        const nc = notas[k++ % notas.length];
        tocar(pista, instrumento, { inicio: t, hz: midiAHz(midi), duracion: Math.max(0.15, pulsos * pulso * 0.9), volumen: 0.45, semilla: k });
        const ac = acordes.get(nc.compas);
        if (acompanamiento && ac && nc.compas !== previo) tocarAcompanamiento(pista, acompanamiento, { inicio: t, duracion: compasSeg * 0.95, acorde: ac, notaMasGrave: grave });
        previo = nc.compas;
      }
      t += pulsos * pulso;
    }
  }
  normalizar(pista, -1);
  return pista.subarray(0, Math.floor(segundos * SR));
};

/**
 * Masterización estéreo: lleva la mezcla a una sonoridad objetivo aproximada (RMS de bloques de 400 ms con
 * compuerta a −50 dBFS, sin ponderación K: en estas mezclas da ≈ LUFS ± 1) y luego un limitador con
 * anticipación (ventana simétrica de `anticipo` s, liberación exponencial) que deja los picos bajo `techoDb`.
 * La misma ganancia en L y R (la imagen estéreo no se mueve). Modifica los buffers en el lugar.
 */
export const masterizar = (canales: Float32Array[], o: { rmsDb?: number; techoDb?: number; anticipo?: number; liberacion?: number } = {}) => {
  const { rmsDb = -15, techoDb = -1, anticipo = 0.003, liberacion = 0.08 } = o;
  const n = canales[0].length;
  // 1. Sonoridad: energía media de los bloques que superan la compuerta.
  const bloque = Math.floor(0.4 * SR);
  let suma = 0, cuenta = 0;
  for (let i = 0; i + bloque <= n; i += bloque) {
    let e = 0;
    for (let j = i; j < i + bloque; j++) for (const c of canales) e += c[j] * c[j];
    e /= bloque * canales.length;
    if (e > Math.pow(10, -50 / 10)) { suma += e; cuenta++; }
  }
  if (!cuenta) return canales;
  const g0 = Math.pow(10, rmsDb / 20) / Math.sqrt(suma / cuenta);
  for (const c of canales) for (let i = 0; i < n; i++) c[i] *= g0;
  // 2. Limitador: ganancia deseada por muestra → mínimo en ventana simétrica → liberación → promedio
  //    (el promedio de una ventana de mínimos nunca supera la ganancia que pide el pico: no hay clip).
  const techo = Math.pow(10, techoDb / 20);
  const La = Math.max(1, Math.floor(anticipo * SR));
  const deseada = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of canales) p = Math.max(p, Math.abs(c[i]));
    deseada[i] = p > techo ? techo / p : 1;
  }
  // Mínimo deslizante (deque) en [i − La, i + La].
  const minimo = new Float32Array(n);
  const dq = new Int32Array(n + 2 * La + 2);
  let ini = 0, finq = 0;
  for (let j = 0; j < n + La; j++) {
    if (j < n) { while (finq > ini && deseada[dq[finq - 1]] >= deseada[j]) finq--; dq[finq++] = j; }
    const i = j - La;
    if (i < 0) continue;
    while (dq[ini] < i - La) ini++;
    minimo[i] = deseada[dq[ini]];
  }
  const rel = 1 - Math.exp(-1 / (liberacion * SR));
  let g = 1;
  for (let i = 0; i < n; i++) { g = minimo[i] < g ? minimo[i] : g + (minimo[i] - g) * rel; minimo[i] = g; }
  const medio = Math.max(1, Math.floor(La / 2));
  const pref = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + minimo[i];
  const ganancia = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - medio), b = Math.min(n - 1, i + medio);
    ganancia[i] = (pref[b + 1] - pref[a]) / (b - a + 1);
  }
  for (const c of canales) for (let i = 0; i < n; i++) c[i] = Math.max(-techo, Math.min(techo, c[i] * ganancia[i]));
  return canales;
};
