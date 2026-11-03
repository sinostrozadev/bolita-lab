/**
 * Cama musical + SFX de la plantilla `dato`, sintetizados en Node con scripts/lib/wav.mts.
 *   npx tsx scripts/sonido-dato.mts <id> <ruta-guion.json>
 * Lee public/voz/<id>/tiempos.json, planifica los eventos (mismo módulo que usa la
 * composición) y escribe public/audio/generado/<id>.wav normalizado. La voz NO va
 * aquí: la composición la reproduce aparte para controlar volúmenes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, barrido, crearPista, escribirWav, golpe, midiAHz, mezclar, nota, normalizar } from './lib/wav.mjs';
import { FORMATO } from '../src/marca/tokens';
import { semillaDesde } from '../src/lib/azar';
import { GuionDato } from '../src/plantillas/dato/guion';
import { planificar, type Evento, type Plan, type Tiempos } from '../src/plantillas/dato/plan';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BPM = 96;
/** Cama a ~0,09 y SFX a 0,5: la voz (que va aparte en <Audio>) manda siempre. No se normaliza a pico: eso subiría los SFX. */
const VOL_CAMA = 0.09;
const VOL_SFX = 0.5;

/** Ruido blanco filtrado con envolvente seno y "tono" que sube: whoosh de cambio de escena. */
const whoosh = (pista: Float32Array, inicio: number, duracion: number, volumen: number, semilla: number, subiendo = true) => {
  const desde = Math.floor(inicio * SR);
  const total = Math.floor(duracion * SR);
  let s = semilla >>> 0 || 1;
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0 || idx >= pista.length) continue;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const ruido = (s / 4294967296) * 2 - 1;
    const x = i / total;
    const tono = subiendo ? 0.04 + 0.5 * x * x : 0.5 - 0.46 * x; // apertura del filtro
    lp += tono * (ruido - lp);
    lp2 += tono * (lp - lp2); // 2 polos: más suave
    const env = Math.pow(Math.sin(Math.PI * x), 1.6);
    pista[idx] += lp2 * env * volumen * 2.2;
  }
};

/** Campanita final: dos senos con armónico, liberación larga. */
const ding = (pista: Float32Array, inicio: number, midi: number, volumen: number) => {
  nota(pista, { inicio, hz: midiAHz(midi), duracion: 0.05, volumen, timbre: 'seno', ataque: 0.002, caida: 0.2, sostenido: 0.5, liberacion: 1.4 });
  nota(pista, { inicio, hz: midiAHz(midi + 12), duracion: 0.03, volumen: volumen * 0.45, timbre: 'seno', ataque: 0.002, caida: 0.15, sostenido: 0.4, liberacion: 1.0 });
  nota(pista, { inicio, hz: midiAHz(midi + 19), duracion: 0.02, volumen: volumen * 0.2, timbre: 'seno', ataque: 0.002, caida: 0.1, sostenido: 0.3, liberacion: 0.6 });
};

/** "Pop" de aparición: seno corto con glissando descendente + un poco de ruido. */
const pop = (pista: Float32Array, inicio: number, volumen: number, semilla: number) => {
  barrido(pista, inicio, 900, 380, 0.08, volumen * 0.9, 'seno');
  golpe(pista, inicio, { duracion: 0.03, volumen: volumen * 0.5, tono: 0.7, semilla });
};

/** Cama: arpegio de 4 acordes en menor (i – VI – III – VII), bajo en seno, hi-hat muy suave. */
const cama = (duracion: number, semilla: number) => {
  const pista = crearPista(duracion);
  const tonica = 45 + (semilla % 7); // La2..Mi3: cada guion tiene su tono
  const acordes = [
    [0, 3, 7, 12], // i
    [8, 12, 15, 20], // VI
    [3, 7, 10, 15], // III
    [10, 14, 17, 22], // VII
  ];
  const negra = 60 / BPM;
  const corchea = negra / 2;
  const compas = negra * 4;
  const patron = [0, 1, 2, 3, 2, 1, 3, 2]; // orden del arpegio dentro del acorde
  for (let c = 0; c * compas < duracion; c++) {
    const ac = acordes[c % 4];
    const t0 = c * compas;
    nota(pista, { inicio: t0, hz: midiAHz(tonica - 12 + ac[0]), duracion: compas * 0.9, volumen: 0.55, timbre: 'seno', ataque: 0.03, caida: 0.3, sostenido: 0.7, liberacion: 0.25 });
    for (let k = 0; k < 8; k++) {
      const grado = ac[patron[k]];
      const octava = k % 4 === 3 ? 12 : 0;
      nota(pista, { inicio: t0 + k * corchea, hz: midiAHz(tonica + 12 + grado + octava), duracion: corchea * 0.8, volumen: 0.32, timbre: k % 2 ? 'seno' : 'triangulo', ataque: 0.01, caida: 0.12, sostenido: 0.5, liberacion: 0.15 });
    }
    for (let b = 0; b < 4; b++) golpe(pista, t0 + b * negra + corchea, { duracion: 0.025, volumen: 0.09, tono: 0.95, semilla: semilla + c * 4 + b });
  }
  // Fundidos
  const fin = Math.floor(1.0 * SR);
  const fout = Math.floor(1.6 * SR);
  for (let i = 0; i < fin && i < pista.length; i++) pista[i] *= i / fin;
  for (let i = 0; i < fout && i < pista.length; i++) pista[pista.length - 1 - i] *= i / fout;
  return pista;
};

const sfx = (duracion: number, eventos: Evento[], semilla: number) => {
  const pista = crearPista(duracion);
  eventos.forEach((e, i) => {
    const s = semilla + i * 7919;
    switch (e.tipo) {
      case 'barrido': whoosh(pista, e.t, 0.42, 0.55 * e.fuerza, s, true); break;
      case 'tick': golpe(pista, e.t, { duracion: 0.035, volumen: 0.5 * e.fuerza, tono: 0.85, semilla: s }); break;
      case 'pop': pop(pista, e.t, 0.55 * e.fuerza, s); break;
      case 'golpe':
        golpe(pista, e.t, { duracion: 0.12, volumen: 0.8 * e.fuerza, tono: 0.25, semilla: s });
        nota(pista, { inicio: e.t, hz: 70, duracion: 0.12, volumen: 0.6 * e.fuerza, timbre: 'seno', ataque: 0.003, caida: 0.1, sostenido: 0.3, liberacion: 0.2 });
        break;
      case 'riser':
        barrido(pista, e.t, 160, 900, 0.8, 0.22, 'sierra');
        whoosh(pista, e.t, 0.85, 0.5, s, true);
        break;
      case 'ding': ding(pista, e.t, 88, 0.6); break;
    }
  });
  return pista;
};

export const generarSonido = (id: string, guion: GuionDato, tiempos?: Tiempos): Plan => {
  const t: Tiempos = tiempos ?? JSON.parse(fs.readFileSync(path.join(RAIZ, 'public/voz', id, 'tiempos.json'), 'utf8'));
  const plan = planificar(guion, t, FORMATO.fps);
  const duracion = plan.duracionFrames / FORMATO.fps;
  const semilla = semillaDesde(id);
  const mezcla = crearPista(duracion);
  mezclar(mezcla, cama(duracion, semilla), VOL_CAMA);
  mezclar(mezcla, sfx(duracion, plan.eventos, semilla), VOL_SFX);
  let pico = 0;
  for (const x of mezcla) pico = Math.max(pico, Math.abs(x));
  if (pico > 0.9) normalizar(mezcla, -1); // red de seguridad: no debería activarse
  const salida = path.join(RAIZ, 'public/audio/generado', `${id}.wav`);
  escribirWav(salida, [mezcla]);
  console.log(`sonido: ${path.relative(RAIZ, salida)} (${duracion.toFixed(2)}s, ${plan.eventos.length} eventos, tónica ${45 + (semilla % 7)})`);
  return plan;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const [id, rutaGuion] = process.argv.slice(2);
  if (!id || !rutaGuion) { console.error('uso: npx tsx scripts/sonido-dato.mts <id> <ruta-guion.json>'); process.exit(2); }
  const crudo = JSON.parse(fs.readFileSync(path.resolve(rutaGuion), 'utf8'));
  const guion = GuionDato.parse(crudo.plantilla ? crudo.props : crudo);
  try { generarSonido(id, guion); process.exit(0); } catch (e) { console.error(e); process.exit(1); }
}
