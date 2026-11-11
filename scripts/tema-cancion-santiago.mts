/**
 * Arreglo único de la canción que transcribió Santiago (contenido/partituras/cancion-santiago-notas.json), para
 * probar la MISMA canción en todos los formatos. Arreglo v2 (2026-11-10, tras escucharla Santiago): solo sirven la
 * melodía de los compases 1–8 y su acompañamiento; el resto de la transcripción no se usa.
 *
 *   - 80 bpm, 4/4, Do mayor. Melodía = voz más aguda de la mano derecha de los compases 1–8, una octava arriba,
 *     DOS vueltas (16 compases); al final de la 2.ª vuelta el Si resuelve en un Do largo (2 pulsos, pulso 64).
 *   - Bajo (blancas, raíz por compás): Do · Sol/Si · Lam · Sol · Fa · Do · Rem · Sol; cierre en Do (pulso 64).
 *   - Arpegio de acompañamiento (corcheas raíz-quinta-octava-quinta, como la mano izquierda original): para las
 *     camas musicales de carrera/colores.
 *   - Percusión desde la 2.ª vuelta (compás 9): bombo 1 y 3, caja 2 y 4, platillo en corcheas; golpe final en 64.
 *
 * Escribe:
 *   contenido/partituras/cancion-santiago-tema.json     (formato de `ritmo` + `arpegio` + `bola` para reutilizar)
 *   contenido/partituras/cancion-santiago-maquina.json  (formato de `maquina`: bombo/platillo, bajo en Fa2–Mi3)
 * Uso: npx tsx scripts/tema-cancion-santiago.mts
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const fuente = JSON.parse(fs.readFileSync(path.join(RAIZ, 'contenido/partituras/cancion-santiago-notas.json'), 'utf8'));

const NOMBRES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const aMidi = (n: string) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`nota rara: ${n}`);
  return 12 * (Number(m[3]) + 1) + NOMBRES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const OCTAVA = 12;
const BPM = 80;
const VUELTA = 32; // pulsos por vuelta (8 compases)
const FINAL = 64;  // pulso del Do de cierre

// ---- Melodía: compases 1–8 tal cual, voz más aguda ----
type Nota = [number, number, number];
const vuelta: Nota[] = [];
let pulso = 0;
for (const c of fuente.compases.filter((c: { numero: number }) => c.numero >= 1 && c.numero <= 8)) {
  let suma = 0;
  for (const it of c.mano_derecha) {
    if (it.notas) {
      const ns = (Array.isArray(it.notas) ? it.notas : [it.notas]).map(aMidi);
      vuelta.push([Math.max(...ns) + OCTAVA, pulso, it.duracion_negras]);
    }
    pulso += it.duracion_negras; suma += it.duracion_negras;
  }
  if (Math.abs(suma - 4) > 1e-9) throw new Error(`compás ${c.numero} suma ${suma}`);
}
const melodia: Nota[] = [...vuelta, ...vuelta.map(([m, p, d]) => [m, p + VUELTA, d] as Nota), [60 + OCTAVA, FINAL, 2]];

// ---- Armonía por compás (8) ----
// [bajo midi, raíz 0–11, menor, quinta sobre el bajo para el arpegio]
const ACORDES: [number, number, boolean, number][] = [
  [48, 0, false, 7],  // Do
  [47, 7, false, 3],  // Sol con bajo Si (Si–Re–Sol)
  [45, 9, true, 7],   // Lam
  [43, 7, false, 7],  // Sol
  [41, 5, false, 7],  // Fa
  [48, 0, false, 7],  // Do
  [50, 2, true, 7],   // Rem
  [43, 7, false, 7],  // Sol
];
const bajo: Nota[] = [];
const arpegio: Nota[] = [];
for (let c = 0; c < 16; c++) {
  const [b, , , q] = ACORDES[c % 8];
  bajo.push([b, c * 4, 2], [b, c * 4 + 2, 2]);
  const fig = [b, b + q, b + 12, b + q];
  for (let k = 0; k < 8; k++) arpegio.push([fig[k % 4], c * 4 + k / 2, 0.5]);
}
bajo.push([48, FINAL, 2]);
arpegio.push([48, FINAL, 2]); // monofónica: el Do del cierre

// ---- Percusión desde la 2.ª vuelta ----
const ritmo: { tipo: string; pulso: number; abierto?: boolean; acento?: boolean }[] = [];
for (let p = VUELTA; p < FINAL; p += 0.5) {
  const tiempo = p % 4;
  if (tiempo === 0 || tiempo === 2) ritmo.push({ tipo: 'kick', pulso: p, ...(p === VUELTA ? { acento: true } : {}) });
  if (tiempo === 1 || tiempo === 3) ritmo.push({ tipo: 'snare', pulso: p });
  ritmo.push({ tipo: 'hat', pulso: p, ...(p === VUELTA ? { abierto: true } : {}) });
}
ritmo.push({ tipo: 'kick', pulso: FINAL, acento: true }, { tipo: 'snare', pulso: FINAL, acento: true }, { tipo: 'hat', pulso: FINAL, abierto: true, acento: true });
ritmo.sort((a, b) => a.pulso - b.pulso);

const NOTA = 'Obra transcrita por Santiago (cancion-santiago-notas.json), compases 1–8. Arreglo v2 de Bolita Lab: 80 bpm, Do mayor, '
  + 'melodía (voz aguda de la mano derecha, una octava arriba) dos vueltas con Do final de 2 pulsos; bajo en blancas '
  + 'Do · Sol/Si · Lam · Sol · Fa · Do · Rem · Sol, cierre en Do; percusión desde el compás 9 (bombo 1 y 3, caja 2 y 4, '
  + 'platillo en corcheas). Generado por scripts/tema-cancion-santiago.mts.';

const notasBola: [number, number][] = [];
{ // bola: [midi, pulsos] con silencios (midi 0)
  let t = 0;
  for (const [m, p, d] of melodia) {
    if (p > t + 1e-9) notasBola.push([0, p - t]);
    notasBola.push([m, d]); t = p + d;
  }
}
const tema = {
  nombre: 'Canción de Santiago (compases 1–8, arreglo v2)',
  nota: NOTA,
  bpm: BPM,
  compas: 4,
  pistas: { melodia, bajo, ritmo },
  /** Acompañamiento en corcheas (raíz-quinta-octava-quinta) para las camas musicales. */
  arpegio,
  /** `melodiaNotas` para la plantilla bola (un acorde por compás, 16 + cierre). */
  bola: {
    bpm: BPM, compas: 4, tonica: 0, menor: false,
    acordes: [...ACORDES, ...ACORDES, [48, 0, false, 7]].map(([, r, menor]) => [r, menor]),
    notas: notasBola,
  },
};
fs.writeFileSync(path.join(RAIZ, 'contenido/partituras/cancion-santiago-tema.json'), JSON.stringify(tema, null, 1) + '\n');

// ---- Versión máquina: bajo dentro de Fa2–Mi3 (ya lo está), bombo 1 y 3, platillo 2 y 4 ----
const ritmoMaquina: { tipo: string; pulso: number; abierto?: boolean; acento?: boolean }[] = [];
for (let p = VUELTA; p < FINAL; p += 1) {
  const tiempo = p % 4;
  if (tiempo === 0 || tiempo === 2) ritmoMaquina.push({ tipo: 'bombo', pulso: p, ...(p === VUELTA ? { acento: true } : {}) });
  else ritmoMaquina.push({ tipo: 'platillo', pulso: p });
}
ritmoMaquina.push({ tipo: 'platillo', pulso: VUELTA, abierto: true });
ritmoMaquina.push({ tipo: 'bombo', pulso: FINAL, acento: true }, { tipo: 'platillo', pulso: FINAL, abierto: true, acento: true });
ritmoMaquina.sort((a, b) => a.pulso - b.pulso);
const maquina = {
  nombre: 'Canción de Santiago (compases 1–8, arreglo v2, máquina)',
  nota: NOTA + ' Versión máquina: platillo en 2 y 4 (la máquina no tiene caja), abierto al entrar la percusión y al final.',
  bpm: BPM, compas: 4,
  pistas: { melodia, bajo, ritmo: ritmoMaquina },
};
fs.writeFileSync(path.join(RAIZ, 'contenido/partituras/cancion-santiago-maquina.json'), JSON.stringify(maquina, null, 1) + '\n');
const seg = (FINAL + 2) * 60 / BPM;
console.log(`tema: ${melodia.length} notas de melodía, ${bajo.length} de bajo, ${ritmo.length} golpes de percusión · ${seg.toFixed(1)} s`);
console.log(`melodía ${Math.min(...melodia.map((n) => n[0]))}–${Math.max(...melodia.map((n) => n[0]))} · bajo ${[...new Set(bajo.map((n) => n[0]))].sort().join(',')}`);
