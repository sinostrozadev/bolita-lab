/**
 * Música del LARGO "Bolitas relajantes" (2026-11-12): pad + bajo + melodía lenta + campanitas en los rebotes, con
 * reverberación. Piezas de DOMINIO PÚBLICO (arreglos propios) y dos composiciones propias generativas (deterministas).
 * Todo en Node, determinista. Pulso = negra.
 */
import { SR, campana, midiAHz, nota, piano } from './wav.mjs';

type N = [number, number, number]; // [midi, pulso, duración]
export interface Pieza {
  nombre: string;
  fuente: string;
  bpm: number;
  compas: number;
  /** Largo de una vuelta en pulsos. */
  largo: number;
  melodia: N[];
  /** Acordes: [pulso de inicio, [bajo, ...notas del pad]]. Cada uno dura hasta el siguiente (o hasta `largo`). */
  acordes: [number, number[]][];
}

/** Secuencia [midi, duración] → [midi, pulso, duración] (midi 0 = silencio). */
const seguir = (desde: number, notas: [number, number][], escala = 1): N[] => {
  const out: N[] = [];
  let t = desde;
  for (const [m, d] of notas) { if (m > 0) out.push([m, t, d * escala]); t += d * escala; }
  return out;
};

// Notas MIDI
const C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, A3 = 57, B3 = 59;
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, Gs4 = 68, A4 = 69, B4 = 71;
const C5 = 72, Cs5 = 73, D5 = 74, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79, A5 = 81;

/** Gymnopédie n.º 1 (Erik Satie, 1888, dominio público). Arreglo propio: Sol maj7 / Re maj7 alternados, 3/4. */
const GYMNOPEDIE: Pieza = (() => {
  const mel: N[] = [
    [Fs5, 13, 1], [A5, 14, 1], [G5, 15, 1], [Fs5, 16, 1], [Cs5, 17, 1], [B4, 18, 1], [Cs5, 19, 1], [D5, 20, 1], [A4, 21, 3], [Fs4, 24, 9],
    [Fs5, 37, 1], [A5, 38, 1], [G5, 39, 1], [Fs5, 40, 1], [Cs5, 41, 1], [B4, 42, 1], [Cs5, 43, 1], [D5, 44, 1], [A4, 45, 3], [Cs5, 48, 3], [Fs5, 51, 3], [E5, 54, 6],
  ];
  const acordes: [number, number[]][] = [];
  for (let b = 0; b < 20; b++) acordes.push([b * 3, b % 2 === 0 ? [43, B3, D4, Fs4] : [38, A3, Cs5 - 12, Fs4]]);
  return { nombre: 'Gymnopédie n.º 1', fuente: 'Erik Satie, 1888 (dominio público)', bpm: 64, compas: 3, largo: 60, melodia: mel, acordes };
})();

/** Canción de cuna (Wiegenlied, Op. 49 n.º 4, Johannes Brahms, 1868, dominio público). Do mayor, 3/4. */
const BRAHMS: Pieza = (() => {
  const o = 12; // una octava arriba: brilla más sobre el pad
  const mel = seguir(0, [
    [E4, 0.5], [E4, 0.5],
    [G4, 2], [E4, 0.5], [E4, 0.5], [G4, 2], [E4, 0.5], [G4, 0.5], [C5, 1], [B4, 1.5], [A4, 0.5], [A4, 1], [G4, 1], [D4, 0.5], [E4, 0.5],
    [F4, 2], [D4, 0.5], [E4, 0.5], [F4, 2], [D4, 0.5], [F4, 0.5], [B4, 0.5], [A4, 0.5], [G4, 1], [B4, 1], [C5, 2], [C4, 0.5], [C4, 0.5],
    [C5, 2], [A4, 0.5], [F4, 0.5], [G4, 2], [E4, 0.5], [C4, 0.5], [F4, 1], [G4, 1], [A4, 1], [G4, 2], [C4, 0.5], [C4, 0.5],
    [C5, 2], [A4, 0.5], [F4, 0.5], [G4, 2], [E4, 0.5], [C4, 0.5], [F4, 1], [E4, 1], [D4, 1], [C4, 3],
  ]).map(([m, t, d]) => [m + o, t, d] as N);
  const C = [36, C4, E4, G4], F = [41, C4, F4, A4], G7 = [43, B3, D4, F4];
  const porCompas = [C, C, F, C, G7, G7, G7, C, F, C, F, C, F, C, G7, C];
  const acordes: [number, number[]][] = [[0, C], ...porCompas.map((a, k): [number, number[]] => [1 + 3 * k, a])];
  return { nombre: 'Canción de cuna', fuente: 'Johannes Brahms, 1868 (dominio público)', bpm: 60, compas: 3, largo: 49, melodia: mel, acordes };
})();

/** Greensleeves (tradicional inglés, s. XVI, dominio público). La menor, 6/8 (aquí en corcheas → pulsos /2). */
const GREENSLEEVES: Pieza = (() => {
  const v1: [number, number][] = [[C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 2], [A4, 1], [A4, 1.5], [Gs4, 0.5], [A4, 1], [B4, 2], [Gs4, 1], [E4, 2], [A4, 1]];
  const v2: [number, number][] = [[C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 1.5], [B4, 0.5], [A4, 1], [Gs4, 1.5], [Fs4, 0.5], [Gs4, 1], [A4, 6]];
  const c1: [number, number][] = [[G5, 3], [G5, 1.5], [Fs5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 2], [A4, 1], [A4, 1.5], [Gs4, 0.5], [A4, 1], [B4, 2], [Gs4, 1], [E4, 3]];
  const c2: [number, number][] = [[G5, 3], [G5, 1.5], [Fs5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 1.5], [B4, 0.5], [A4, 1], [Gs4, 1.5], [Fs4, 0.5], [Gs4, 1], [A4, 6]];
  const mel = seguir(0, [[A4, 1], ...v1, ...v2, ...c1, ...c2], 0.5);
  const Am = [45, C4, E4, A4], G = [43, B3, D4, G4], E = [40, B3, E4, Gs4], Cm = [48, C4, E4, G4];
  const compases = [Am, G, Am, E, Am, G, [Am, E], Am, Cm, G, Am, E, Cm, G, [Am, E], Am] as (number[] | number[][])[];
  const acordes: [number, number[]][] = [[0, Am]];
  compases.forEach((a, k) => {
    const t = 0.5 + 3 * k;
    if (Array.isArray(a[0])) { acordes.push([t, (a as number[][])[0]]); acordes.push([t + 1.5, (a as number[][])[1]]); } else acordes.push([t, a as number[]]);
  });
  return { nombre: 'Greensleeves', fuente: 'Tradicional inglés, s. XVI (dominio público)', bpm: 54, compas: 3, largo: 48.5, melodia: mel, acordes };
})();

/** Canon en Re (Pachelbel, c. 1680, dominio público): la melodía de la partitura del canal, lenta. */
const canonDesde = (p: { pistas: { melodia: N[]; bajo: N[] } }): Pieza => {
  const triada = (raiz: number) => {
    const pc = raiz % 12;
    const menor = pc === 11 || pc === 6; // Si m, Fa# m
    const cerca = (x: number) => 57 + ((((x - 57) % 12) + 12) % 12); // cada nota del pad entre La3 y Sol#4
    return [raiz < 40 ? raiz + 12 : raiz, cerca(pc), cerca(pc + (menor ? 3 : 4)), cerca(pc + 7)];
  };
  const largo = 48;
  const acordes = p.pistas.bajo.filter(([, t]) => t < largo).map(([m, t]): [number, number[]] => [t, triada(m)]);
  return { nombre: 'Canon en Re', fuente: 'Johann Pachelbel, c. 1680 (dominio público)', bpm: 52, compas: 4, largo, melodia: p.pistas.melodia.filter(([, t]) => t < largo), acordes };
};

/** Composición propia generativa: progresión fija y melodía pentatónica de paseo aleatorio (determinista). */
const generativa = (nombre: string, semilla: number, bpm: number, progresion: number[][], escala: number[]): Pieza => {
  let s = semilla >>> 0;
  const az = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const compases = progresion.length * 2; // 2 compases de 4/4 por acorde
  const largo = compases * 4;
  const acordes = progresion.map((a, k): [number, number[]] => [k * 8, a]);
  const mel: N[] = [];
  let i = Math.floor(escala.length / 2);
  for (let t = 2; t < largo - 4;) {
    const d = [1, 1.5, 2, 2, 3, 4][Math.floor(az() * 6)];
    if (az() < 0.18) { t += d; continue; } // respiros
    i = Math.max(0, Math.min(escala.length - 1, i + [-2, -1, -1, 0, 1, 1, 2][Math.floor(az() * 7)]));
    mel.push([escala[i], t, Math.min(d, largo - t)]);
    t += d;
  }
  return { nombre, fuente: 'Composición propia de Bolita Lab', bpm, compas: 4, largo, melodia: mel, acordes };
};

export const PIEZAS = {
  gymnopedie: () => GYMNOPEDIE,
  brahms: () => BRAHMS,
  greensleeves: () => GREENSLEEVES,
  canon: (partitura: { pistas: { melodia: N[]; bajo: N[] } }) => canonDesde(partitura),
  bruma: () => generativa('Bruma (propia)', 0xB1, 58, [[41, A3, C4, E4], [40, G3, B3, D4], [38, F3, A3, C4], [36, E3, G3, B3]], [C5, D5, E5, G5, A5, C5 + 12]),
  marea: () => generativa('Marea (propia)', 0x3A7, 54, [[45, C4, E4, B4], [41, A3, C4, E4], [48, E4, G4, D5], [43, D4, G4, B4]], [A4, C5, D5, E5, G5, A5]),
};

// ---------------------------------------------------------------- síntesis

/** Reverberación de Schroeder (4 peines + 2 pasa-todo) en el lugar, mezcla `humedo`. */
const reverb = (x: Float32Array, humedo: number, semillaRetardo = 0) => {
  const peines = [1557, 1617, 1491, 1422].map((d) => Math.floor((d + semillaRetardo) * SR / 44100));
  const pasa = [225, 556].map((d) => Math.floor(d * SR / 44100));
  const salida = new Float32Array(x.length);
  for (const d of peines) {
    const buf = new Float32Array(d); let k = 0, lp = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[k];
      lp = y * 0.75 + lp * 0.25; // amortiguación de agudos
      buf[k] = x[i] + lp * 0.84;
      salida[i] += y * 0.25;
      k = (k + 1) % d;
    }
  }
  for (const d of pasa) {
    const buf = new Float32Array(d); let k = 0;
    for (let i = 0; i < salida.length; i++) {
      const b = buf[k], v = salida[i];
      const y = -v * 0.5 + b;
      buf[k] = v + b * 0.5;
      salida[i] = y; k = (k + 1) % d;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - humedo * 0.5) + salida[i] * humedo;
};

export interface OpcionesMusica {
  segundos: number;
  pieza: Pieza;
  /** Instrumento de cada vuelta de la melodía (en ciclo). */
  instrumentos: ('piano' | 'campana')[];
  /** Instantes (s) de los rebotes/golpes de la escena: suenan como campanitas del acorde del momento. */
  golpes: number[];
  semilla: number;
  /** Fundido de entrada y salida (s). */
  fundido: number;
}

/** Sintetiza la música de una escena → [L, R] (sin masterizar). */
export const sintetizarEscena = (o: OpcionesMusica): Float32Array[] => {
  const n = Math.ceil(o.segundos * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const spb = 60 / o.pieza.bpm;
  const P = o.pieza;
  // Vueltas: pieza + 1 compás de respiro (solo pad). La 1.ª entra tras 2 compases de pad.
  const intro = 2 * P.compas;
  const vuelta = P.largo + P.compas;
  const acordeEn = (s: number): number[] => {
    // s en segundos → acorde vigente
    const t = s / spb - intro;
    const u = ((t % vuelta) + vuelta) % vuelta;
    let a = P.acordes[0][1];
    for (const [p, ac] of P.acordes) if (p <= Math.min(u, P.largo - 0.001)) a = ac;
    if (t < 0) a = P.acordes[0][1];
    return a;
  };
  // --- Pad y bajo: por tramos de acorde, con ataque lento y cola larga (cuerpo).
  const pasos: { t0: number; t1: number; ac: number[] }[] = [];
  const pushPad = (t0: number, t1: number, ac: number[]) => { if (t1 > t0 + 0.05 && t0 < o.segundos) pasos.push({ t0, t1: Math.min(t1, o.segundos), ac }); };
  pushPad(0, intro * spb, P.acordes[0][1]);
  for (let v = 0; intro * spb + v * vuelta * spb < o.segundos; v++) {
    const base = (intro + v * vuelta) * spb;
    P.acordes.forEach(([p, ac], k) => {
      const fin = k + 1 < P.acordes.length ? P.acordes[k + 1][0] : P.largo;
      pushPad(base + p * spb, base + fin * spb, ac);
    });
    pushPad(base + P.largo * spb, base + vuelta * spb, P.acordes[P.acordes.length - 1][1]);
  }
  for (const { t0, t1, ac } of pasos) {
    const d = t1 - t0;
    const [bajo, ...pad] = ac;
    for (const m of pad) {
      for (const [can, des] of [[L, -0.07], [R, 0.07]] as const) {
        nota(can, { inicio: t0, hz: midiAHz(m) * (1 + des / 100 * 3), duracion: d, volumen: 0.038, timbre: 'triangulo', ataque: Math.min(1.2, d * 0.4), caida: 0.4, sostenido: 0.85, liberacion: 1.6 });
        nota(can, { inicio: t0, hz: midiAHz(m - 12) * (1 - des / 100 * 2), duracion: d, volumen: 0.022, timbre: 'seno', ataque: Math.min(1.5, d * 0.5), caida: 0.4, sostenido: 0.9, liberacion: 1.8 });
      }
    }
    for (const can of [L, R]) {
      nota(can, { inicio: t0, hz: midiAHz(bajo), duracion: d * 0.95, volumen: 0.13, timbre: 'seno', ataque: 0.06, caida: 0.5, sostenido: 0.7, liberacion: 0.9 });
      nota(can, { inicio: t0, hz: midiAHz(bajo) * 2, duracion: d * 0.6, volumen: 0.025, timbre: 'triangulo', ataque: 0.06, caida: 0.3, sostenido: 0.5, liberacion: 0.6 });
    }
  }
  // --- Melodía: vueltas con instrumento rotativo y octava que alterna (variación, sin bucle idéntico audible).
  for (let v = 0; ; v++) {
    const base = (intro + v * vuelta) * spb;
    if (base >= o.segundos - 4) break;
    const inst = o.instrumentos[v % o.instrumentos.length];
    const oct = v % 3 === 2 ? 12 : 0;
    const vol = inst === 'campana' ? 0.14 : 0.2;
    for (const [m, p, d] of P.melodia) {
      const t = base + p * spb;
      if (t > o.segundos - 3) break;
      const hz = midiAHz(m + (inst === 'campana' && m > 76 ? -12 : oct));
      const pan = 0.5 + 0.12 * Math.sin(p * 0.7 + v);
      const tmp = { inicio: t, hz, duracion: d * spb * 0.95, volumen: vol, semilla: Math.floor(p * 97) + v };
      if (inst === 'piano') { piano(L, { ...tmp, volumen: vol * (1.2 - pan) }); piano(R, { ...tmp, volumen: vol * (0.2 + pan) }); }
      else { campana(L, { inicio: t, hz, volumen: vol * (1.2 - pan), largo: 3.5, semilla: tmp.semilla }); campana(R, { inicio: t, hz, volumen: vol * (0.2 + pan), largo: 3.5, semilla: tmp.semilla + 1 }); }
    }
  }
  // --- Campanitas de los rebotes: nota del acorde del momento, octava alta, muy suaves; máx. 1 cada 0,2 s.
  let ultimo = -1, k = 0;
  for (const t of o.golpes) {
    if (t - ultimo < 0.2 || t > o.segundos - 1) continue;
    ultimo = t; k++;
    const ac = acordeEn(t).slice(1);
    const m = ac[k % ac.length] + 24;
    const pan = (k % 5) / 4;
    campana(L, { inicio: t, hz: midiAHz(m), volumen: 0.035 * (1 - pan * 0.6), largo: 2.2, semilla: k });
    campana(R, { inicio: t, hz: midiAHz(m), volumen: 0.035 * (0.4 + pan * 0.6), largo: 2.2, semilla: k + 7 });
  }
  reverb(L, 0.35, 0); reverb(R, 0.35, 23);
  // Fundidos (coseno).
  const fn = Math.floor(o.fundido * SR);
  for (let i = 0; i < fn; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fn);
    L[i] *= g; R[i] *= g; L[n - 1 - i] *= g; R[n - 1 - i] *= g;
  }
  return [L, R];
};
