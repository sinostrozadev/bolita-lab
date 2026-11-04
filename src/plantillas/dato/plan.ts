/**
 * Planificación de tiempos de la plantilla `dato`. Módulo PURO (sin Remotion):
 * lo importan tanto la composición como `scripts/sonido-dato.mts`, así el video y
 * el audio parten de la misma línea de tiempo.
 */
import type { GuionDato } from './guion';

/** Pausa entre líneas de voz, en segundos. */
export const PAUSA = 0.25;
/** Frames del <Cierre/> al final (1,2 s a 60 fps). */
export const FRAMES_CIERRE = 72;

export type Palabra = { texto: string; inicio: number; fin: number }; // relativos a la línea, en segundos
export type TipoLinea = 'gancho' | 'escena' | 'remate';
export type LineaTiempo = {
  indice: number; // 0 = gancho, 1..n = escenas, n+1 = remate
  tipo: TipoLinea;
  texto: string;
  archivo: string; // ruta relativa a public/, ej. voz/<id>/0.mp3
  inicio: number; // absoluto en el video, segundos
  duracionAudio: number; // largo real del mp3
  duracionHablada: number; // hasta el final de la última palabra (+ respiro)
  palabras: Palabra[];
  reales: boolean; // true si los límites de palabra vienen del servicio TTS
};
export type Tiempos = { id: string; voz: string; pausa: number; lineas: LineaTiempo[]; total: number; limitesReales: boolean };

/** Divide un texto en tokens visibles (conserva puntuación para mostrarla). */
export const tokenizar = (texto: string) => texto.split(/\s+/).filter(Boolean);

/** Normaliza para comparar palabras: minúsculas, sin tildes ni puntuación. */
export const normalizar = (p: string) => p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');

/** Estimación de tiempos por longitud de palabra, para cuando no hay voz generada (Studio) o el servicio no da límites. */
export const estimarPalabras = (texto: string, duracion?: number): Palabra[] => {
  const tokens = tokenizar(texto);
  const pesos = tokens.map((t) => 0.12 + 0.055 * normalizar(t).length + (/[,.;:!?…]$/.test(t) ? 0.14 : 0));
  const suma = pesos.reduce((a, b) => a + b, 0);
  const total = duracion ?? suma + 0.1;
  const k = (total - 0.1) / suma;
  let t = 0.1;
  return tokens.map((texto, i) => {
    const d = pesos[i] * k;
    const p = { texto, inicio: t, fin: t + d * 0.9 };
    t += d;
    return p;
  });
};

export const textosDelGuion = (g: GuionDato): { tipo: TipoLinea; texto: string }[] => [
  { tipo: 'gancho', texto: g.gancho },
  ...g.escenas.map((e) => ({ tipo: 'escena' as const, texto: e.texto })),
  { tipo: 'remate', texto: g.remate },
];

/** Arma la línea de tiempo absoluta a partir de líneas ya medidas (o estimadas). */
export const armarTiempos = (
  id: string,
  voz: string,
  medidas: { tipo: TipoLinea; texto: string; archivo: string; duracionAudio: number; palabras: Palabra[]; reales: boolean }[],
): Tiempos => {
  let t = 0;
  const lineas: LineaTiempo[] = medidas.map((m, indice) => {
    const ultima = m.palabras.length ? m.palabras[m.palabras.length - 1].fin : m.duracionAudio;
    const duracionHablada = Math.min(m.duracionAudio, ultima + 0.12);
    const linea: LineaTiempo = { ...m, indice, inicio: t, duracionHablada };
    t += duracionHablada + PAUSA;
    return linea;
  });
  return { id, voz, pausa: PAUSA, lineas, total: t - PAUSA, limitesReales: medidas.every((m) => m.reales) };
};

/** Tiempos de respaldo sin voz: sirve para previsualizar en Studio. */
export const estimarTiempos = (g: GuionDato): Tiempos =>
  armarTiempos(
    g.id,
    g.voz ?? 'estimada',
    textosDelGuion(g).map((l, i) => {
      const palabras = estimarPalabras(l.texto);
      const fin = palabras[palabras.length - 1].fin + 0.2;
      return { ...l, archivo: `voz/${g.id}/${i}.mp3`, duracionAudio: fin, palabras, reales: false };
    }),
  );

export type TipoEvento = 'barrido' | 'tick' | 'pop' | 'riser' | 'golpe' | 'ding';
export type Evento = { t: number; tipo: TipoEvento; fuerza: number };

export type BloqueEscena = {
  indiceEscena: number; // 0-based dentro de guion.escenas
  linea: LineaTiempo;
  desde: number; // frame absoluto
  frames: number; // duración en frames (hasta el inicio de la siguiente línea)
  /** Momentos (segundos relativos al inicio de la escena) en que entra cada item/palabra enfatizada. */
  entradas: number[];
  /** Índices (en linea.palabras) de las palabras enfatizadas: llevan pop en el subtítulo y SFX. */
  enfasis: number[];
  /** Solo `cifra`: segundo (relativo a la escena) en que empieza a contar y cuánto dura el conteo. */
  conteo: { desde: number; dur: number };
};

export type Plan = {
  fps: number;
  tiempos: Tiempos;
  gancho: { linea: LineaTiempo; desde: number; frames: number };
  escenas: BloqueEscena[];
  remate: { linea: LineaTiempo; desde: number; frames: number };
  cierreDesde: number;
  duracionFrames: number;
  duracionSeg: number;
  eventos: Evento[];
};

const VACIAS = new Set(['del', 'los', 'las', 'una', 'uno', 'que', 'con', 'por', 'para', 'the', 'son', 'muy']);

/**
 * Busca, en orden, la primera palabra hablada que coincide con alguna palabra significativa de
 * `objetivo` a partir de `desde` ("7 planetas en fila" → cae en "planetas"; "Tierra–Luna" → "Tierra" o "Luna").
 */
const buscarPalabra = (palabras: Palabra[], objetivo: string, desde: number) => {
  const partes = objetivo.split(/[\s–—\-:/·,]+/).map(normalizar).filter(Boolean);
  const claves = partes.filter((w, k) => k === 0 || (w.length >= 3 && !VACIAS.has(w)));
  if (!claves.length) return -1;
  for (let i = desde; i < palabras.length; i++) {
    const n = normalizar(palabras[i].texto);
    if (claves.some((obj) => n === obj || (obj.length >= 4 && n.startsWith(obj)))) return i;
  }
  return -1;
};

export const entradasDeEscena = (escena: GuionDato['escenas'][number], linea: LineaTiempo): number[] => marcasDeEscena(escena, linea).entradas;

/** Palabras de número en español (para saber cuándo la voz dice la cifra). */
const NUMEROS = /^(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\w+|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|millon|millones)$/;

/** Índice de la palabra donde la voz dice la cifra: la indicada en `dice`, o el primer número hablado. */
export const palabraDeCifra = (palabras: Palabra[], dice?: string): number => {
  if (dice) { const i = buscarPalabra(palabras, dice, 0); if (i >= 0) return i; }
  return palabras.findIndex((p) => NUMEROS.test(normalizar(p.texto)));
};

/**
 * Conteo de una cifra: arranca al inicio de la escena (nunca se queda un "0" quieto en pantalla
 * esperando a la voz) y "aterriza" ~0,35 s después de que la voz empieza a decir el número.
 * Si el número se dice tarde, el conteo es más largo; con el ease-out cúbico igual llega al
 * 87 % a mitad de camino, así que se lee una cifra grande casi desde el principio.
 */
export const conteoDeCifra = (linea: LineaTiempo, dice?: string) => {
  const desde = 0.15;
  const i = palabraDeCifra(linea.palabras, dice);
  const aterriza = i >= 0 ? Math.min(linea.palabras[i].inicio + 0.35, linea.duracionHablada) : desde + duracionConteo(linea.duracionHablada);
  return { desde, dur: Math.max(0.9, aterriza - desde), indice: i };
};

export const marcasDeEscena = (escena: GuionDato['escenas'][number], linea: LineaTiempo): { entradas: number[]; enfasis: number[] } => {
  const v = escena.visual;
  const dur = linea.duracionHablada;
  const etiquetas: string[] =
    v.tipo === 'lista' ? v.items
    : v.tipo === 'comparar' ? v.items.map((i) => i.etiqueta)
    : v.tipo === 'escala' ? v.items.map((i) => i.etiqueta)
    : v.tipo === 'frase' ? (v.enfasis ?? [])
    : [];
  if (v.tipo === 'cifra') {
    const { indice } = conteoDeCifra(linea, v.dice);
    return { entradas: [], enfasis: indice >= 0 ? [indice] : [] };
  }
  if (etiquetas.length === 0) return { entradas: [], enfasis: [] };
  const n = etiquetas.length;
  const repartido = (i: number) => 0.25 + (i * Math.min(0.55, dur * 0.65)) / Math.max(1, n - 1 || 1);
  const salida: number[] = [];
  const enfasis: number[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const idx = buscarPalabra(linea.palabras, etiquetas[i], cursor);
    if (idx >= 0) { salida.push(linea.palabras[idx].inicio); enfasis.push(idx); cursor = idx + 1; }
    else salida.push(Math.min(dur - 0.2, repartido(i)));
  }
  // Nunca retroceder: la entrada i+1 va al menos 0,12 s después de la i.
  for (let i = 1; i < n; i++) salida[i] = Math.max(salida[i], salida[i - 1] + 0.12);
  return { entradas: salida, enfasis };
};

export const planificar = (guion: GuionDato, tiempos: Tiempos, fps: number): Plan => {
  const f = (seg: number) => Math.round(seg * fps);
  const L = tiempos.lineas;
  const n = guion.escenas.length;
  const finDe = (i: number) => (i + 1 < L.length ? L[i + 1].inicio : tiempos.total);
  const eventos: Evento[] = [];
  const gancho = { linea: L[0], desde: 0, frames: f(finDe(0)) };
  eventos.push({ t: 0, tipo: 'golpe', fuerza: 1 });
  const escenas: BloqueEscena[] = guion.escenas.map((escena, i) => {
    const linea = L[i + 1];
    const desde = f(linea.inicio);
    const frames = f(finDe(i + 1)) - desde;
    const { entradas, enfasis } = marcasDeEscena(escena, linea);
    eventos.push({ t: linea.inicio - 0.08, tipo: 'barrido', fuerza: 1 });
    const v = escena.visual;
    let conteo = { desde: 0.15, dur: duracionConteo(linea.duracionHablada) };
    if (v.tipo === 'cifra') {
      const c = conteoDeCifra(linea, v.dice);
      conteo = { desde: c.desde, dur: c.dur };
      // Tick fuerte cuando la voz dice el número (coincide con el pop del subtítulo).
      if (c.indice >= 0) eventos.push({ t: linea.inicio + linea.palabras[c.indice].inicio, tipo: 'tick', fuerza: 1 });
      // Ticks del conteo: siguen la curva ease-out (rápidos al principio, espaciados al final).
      const pasos = 6;
      for (let k = 1; k < pasos; k++) {
        const p = k / pasos;
        const tt = 1 - Math.cbrt(1 - p); // inversa de 1-(1-x)^3: momento en que el número cruza p
        eventos.push({ t: linea.inicio + c.desde + c.dur * tt, tipo: 'tick', fuerza: 0.3 + 0.35 * p });
      }
      eventos.push({ t: linea.inicio + c.desde + c.dur, tipo: 'pop', fuerza: 1 });
    } else if (v.tipo === 'icono') {
      eventos.push({ t: linea.inicio + 0.1, tipo: 'pop', fuerza: 0.9 });
    } else {
      entradas.forEach((e, k) => eventos.push({ t: linea.inicio + e, tipo: v.tipo === 'frase' ? 'tick' : 'pop', fuerza: 0.7 + 0.3 * (k / Math.max(1, entradas.length - 1)) }));
    }
    return { indiceEscena: i, linea, desde, frames, entradas, enfasis, conteo };
  });
  const lr = L[n + 1];
  const remate = { linea: lr, desde: f(lr.inicio), frames: f(tiempos.total) - f(lr.inicio) };
  eventos.push({ t: Math.max(0, lr.inicio - 0.8), tipo: 'riser', fuerza: 1 });
  eventos.push({ t: lr.inicio, tipo: 'golpe', fuerza: 1 });
  const cierreDesde = f(tiempos.total);
  eventos.push({ t: tiempos.total, tipo: 'ding', fuerza: 1 });
  const duracionFrames = cierreDesde + FRAMES_CIERRE;
  eventos.sort((a, b) => a.t - b.t);
  return { fps, tiempos, gancho, escenas, remate, cierreDesde, duracionFrames, duracionSeg: duracionFrames / fps, eventos };
};

/** Cuánto dura el conteo de una cifra: rápido pero que se alcance a ver crecer. */
export const duracionConteo = (duracionHablada: number) => Math.max(0.9, Math.min(1.8, duracionHablada * 0.6));
