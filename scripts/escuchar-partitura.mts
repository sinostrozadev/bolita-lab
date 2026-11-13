/**
 * Sintetiza una partitura completa (formato partitura_notas.json: compases con mano_derecha / mano_izquierda, bpm por compás)
 * a un wav: piano en la mano derecha, piano suave en la izquierda. Salta los compases vacíos (silencio en ambas manos)
 * salvo el último de cada tramo, para que se escuche la canción sin huecos largos.
 *   npx tsx scripts/escuchar-partitura.mts <notas.json> <salida.wav> [--bemoles 13-15]
 * --bemoles A-B: aplica la armadura de Mi♭ (Si, Mi, La bemol) a la mano derecha en esos compases.
 */
import fs from 'node:fs';
import { crearPista, escribirWav, masterizar, midiAHz, piano, SR } from './lib/wav.mjs';

const [entrada, salida, ...resto] = process.argv.slice(2);
const bem = resto[0] === '--bemoles' ? resto[1].split('-').map(Number) : null;
const d = JSON.parse(fs.readFileSync(entrada, 'utf8')) as { compases: { numero: number; bpm?: number; mano_derecha: { notas: string | string[] | null; duracion_negras: number }[]; mano_izquierda: { notas: string | string[] | null; duracion_negras: number }[] }[] };
const L: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (s: string, compas: number) => {
  const m = s.match(/^([A-G])(#|b)?(-?\d)$/); if (!m) throw new Error('nota rara ' + s);
  let v = L[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1);
  if (bem && compas >= bem[0] && compas <= bem[1] && !m[2] && 'BEA'.includes(m[1])) v -= 1;
  return v;
};
const vacio = (c: (typeof d.compases)[number]) => [...c.mano_derecha, ...c.mano_izquierda].every((x) => !x.notas);
const eventos: { t: number; midi: number; dur: number; mano: 'd' | 'i' }[] = [];
let t = 0.3, bpm = 80;
for (let i = 0; i < d.compases.length; i++) {
  const c = d.compases[i];
  if (c.bpm) bpm = c.bpm;
  if (vacio(c) && (i + 1 < d.compases.length && vacio(d.compases[i + 1]))) continue; // huecos largos: se quedan en 1 compás
  if (vacio(c) && i > 0 && vacio(d.compases[i - 1])) continue;
  const seg = 60 / bpm;
  for (const [mano, voces] of [['d', c.mano_derecha], ['i', c.mano_izquierda]] as const) {
    let u = t;
    for (const x of voces) {
      const dur = x.duracion_negras * seg;
      if (x.notas) for (const n of Array.isArray(x.notas) ? x.notas : [x.notas]) eventos.push({ t: u, midi: midi(n, c.numero), dur, mano });
      u += dur;
    }
  }
  t += 4 * seg;
}
const total = t + 2;
const L1 = crearPista(total), R1 = crearPista(total);
for (const e of eventos) {
  const vol = e.mano === 'd' ? 0.42 : 0.2;
  for (const p of [L1, R1]) piano(p, { inicio: e.t, hz: midiAHz(e.mano === 'd' ? e.midi + 12 : e.midi), duracion: Math.max(0.25, e.dur), volumen: vol, semilla: Math.round(e.t * 1000) });
}
const [a, b] = masterizar([L1, R1]);
escribirWav(salida, [a, b]);
console.log(`${salida} · ${total.toFixed(1)} s · ${eventos.length} notas · ${SR} Hz`);
