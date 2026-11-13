/**
 * Las 10 melodías del LARGO "¿Cuántas adivinas?" (2026-11-12). Todas de DOMINIO PÚBLICO (compositores muertos hace
 * más de 100 años o tradicionales); arreglo y síntesis propios. Formato `Melodia` de wav.mts: [midi, pulsos]
 * (pulso = negra, midi 0 = silencio). Las 5 del catálogo de Shorts ya se escucharon y validaron en el canal.
 * Ninguna con letra en pantalla. Cumpleaños feliz queda FUERA (regla del canal, ver plantillas-remotion).
 */
import { MELODIAS, type Melodia } from './wav.mjs';

export interface CancionQuiz { nombre: string; autor: string; dificultad: 1 | 2 | 3; melodia: Melodia }

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, Gs4 = 68, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, Fs5 = 78, G5 = 79, A5 = 81;

/** Jingle Bells (James Lord Pierpont, 1857): estribillo. */
const JINGLE: Melodia = {
  nombre: 'Jingle Bells', bpm: 132, tonica: 0, menor: false,
  notas: [
    [E5, 1], [E5, 1], [E5, 2], [E5, 1], [E5, 1], [E5, 2], [E5, 1], [G5, 1], [C5, 1.5], [D5, 0.5], [E5, 4],
    [F5, 1], [F5, 1], [F5, 1.5], [F5, 0.5], [F5, 1], [E5, 1], [E5, 1], [E5, 0.5], [E5, 0.5], [E5, 1], [D5, 1], [D5, 1], [E5, 1], [D5, 2], [G5, 2],
    [E5, 1], [E5, 1], [E5, 2], [E5, 1], [E5, 1], [E5, 2], [E5, 1], [G5, 1], [C5, 1.5], [D5, 0.5], [E5, 4],
    [F5, 1], [F5, 1], [F5, 1.5], [F5, 0.5], [F5, 1], [E5, 1], [E5, 1], [E5, 0.5], [E5, 0.5], [G5, 1], [G5, 1], [F5, 1], [D5, 1], [C5, 4],
  ],
};

/** La cucaracha (tradicional mexicana, s. XIX). */
const CUCARACHA: Melodia = {
  nombre: 'La cucaracha', bpm: 150, tonica: 0, menor: false,
  notas: [
    [G4, 0.5], [G4, 0.5], [G4, 0.5], [C5, 1.5], [E5, 1], [0, 1],
    [G4, 0.5], [G4, 0.5], [G4, 0.5], [C5, 1.5], [E5, 1], [0, 1],
    [C5, 1], [C5, 0.5], [B4, 0.5], [B4, 0.5], [A4, 0.5], [A4, 0.5], [G4, 2.5], [0, 1],
    [G4, 0.5], [G4, 0.5], [G4, 0.5], [B4, 1.5], [D5, 1], [0, 1],
    [G4, 0.5], [G4, 0.5], [G4, 0.5], [B4, 1.5], [D5, 1], [0, 1],
    [G5, 1], [A5, 0.5], [G5, 0.5], [F5, 0.5], [E5, 0.5], [D5, 0.5], [C5, 2.5], [0, 1],
  ],
};

/** Galop infernal / "Cancán" (Jacques Offenbach, 1858). */
const CANCAN: Melodia = {
  nombre: 'Cancán', bpm: 150, compas: 2, tonica: 0, menor: false,
  notas: [
    [C4, 1], [D4, 0.5], [F4, 0.5], [E4, 0.5], [D4, 0.5], [G4, 1], [G4, 1], [G4, 0.5], [A4, 0.5], [E4, 0.5], [F4, 0.5],
    [D4, 1], [D4, 1], [D4, 0.5], [F4, 0.5], [E4, 0.5], [D4, 0.5], [C4, 0.5], [C5, 0.5], [B4, 0.5], [A4, 0.5], [G4, 0.5], [F4, 0.5], [E4, 0.5], [D4, 0.5],
    [C4, 1], [D4, 0.5], [F4, 0.5], [E4, 0.5], [D4, 0.5], [G4, 1], [G4, 1], [G4, 0.5], [A4, 0.5], [E4, 0.5], [F4, 0.5],
    [D4, 1], [D4, 1], [D4, 0.5], [F4, 0.5], [E4, 0.5], [D4, 0.5], [C4, 2], [0, 1],
  ].map(([m, d]) => [m ? m + 12 : 0, d] as [number, number]),
};

/** Canción de cuna (Johannes Brahms, 1868). */
const BRAHMS: Melodia = {
  nombre: 'Canción de cuna', bpm: 84, compas: 3, anacrusa: 1, tonica: 0, menor: false,
  notas: ([
    [E4, 0.5], [E4, 0.5], [G4, 2], [E4, 0.5], [E4, 0.5], [G4, 2], [E4, 0.5], [G4, 0.5], [C5, 1], [B4, 1.5], [A4, 0.5], [A4, 1], [G4, 1], [D4, 0.5], [E4, 0.5],
    [F4, 2], [D4, 0.5], [E4, 0.5], [F4, 2], [D4, 0.5], [F4, 0.5], [B4, 0.5], [A4, 0.5], [G4, 1], [B4, 1], [C5, 2], [0, 1],
  ] as [number, number][]).map(([m, d]) => [m ? m + 12 : 0, d] as [number, number]),
};

/** Greensleeves (tradicional inglés, s. XVI). En corcheas a 200 → negra con puntillo ≈ 67. */
const GREENSLEEVES: Melodia = {
  nombre: 'Greensleeves', bpm: 200, compas: 6, anacrusa: 1, tonica: 9, menor: true,
  notas: [
    [A4, 1], [C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 2], [A4, 1], [A4, 1.5], [Gs4, 0.5], [A4, 1], [B4, 2], [Gs4, 1], [E4, 2], [A4, 1],
    [C5, 2], [D5, 1], [E5, 1.5], [F5, 0.5], [E5, 1], [D5, 2], [B4, 1], [G4, 1.5], [A4, 0.5], [B4, 1], [C5, 1.5], [B4, 0.5], [A4, 1], [Gs4, 1.5], [Fs5 - 12, 0.5], [Gs4, 1], [A4, 5], [0, 1],
  ],
};

/** Orden de fácil a difícil (la dificultad se muestra con estrellas). */
export const CANCIONES_QUIZ: CancionQuiz[] = [
  { nombre: 'Jingle Bells', autor: 'James Lord Pierpont · 1857', dificultad: 1, melodia: JINGLE },
  { nombre: 'Oda a la alegría', autor: 'Ludwig van Beethoven · 1824', dificultad: 1, melodia: MELODIAS.odaalegria },
  { nombre: 'La cucaracha', autor: 'Tradicional mexicana', dificultad: 1, melodia: CUCARACHA },
  { nombre: 'Para Elisa', autor: 'Ludwig van Beethoven · 1810', dificultad: 2, melodia: MELODIAS.furelise },
  { nombre: 'Cancán', autor: 'Jacques Offenbach · 1858', dificultad: 2, melodia: CANCAN },
  { nombre: 'Marcha turca', autor: 'Wolfgang Amadeus Mozart · 1783', dificultad: 2, melodia: MELODIAS.marchaturca },
  { nombre: 'Canción de cuna', autor: 'Johannes Brahms · 1868', dificultad: 2, melodia: BRAHMS },
  { nombre: 'El lago de los cisnes', autor: 'Piotr Chaikovski · 1876', dificultad: 3, melodia: MELODIAS.cisnes },
  { nombre: 'Greensleeves', autor: 'Tradicional inglés · siglo XVI', dificultad: 3, melodia: GREENSLEEVES },
  { nombre: 'Canon en Re', autor: 'Johann Pachelbel · c. 1680', dificultad: 3, melodia: MELODIAS.canon },
];
