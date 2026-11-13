/**
 * LARGO "Torneo de bolitas" (16:9): simula las 10 carreras de la llave, arma el plan del video y el audio completo.
 *
 * Uso: npx tsx scripts/preparar-largo-torneo.mts contenido/largos/<id>.json [--solo-plan]
 *   → public/sim/<id>-rNN.json (10 sims de carrera, lienzo 1520 × 1080, 60 fps)
 *   → public/sim/<id>.json (PlanTorneo: carreras, resultados, segmentos, capítulos, mid-rolls)
 *   → public/audio/generado/<id>.wav (audio de TODO el video: carreras + interludios)
 *   → salida/trabajo/<id>.props.json
 *
 * Determinista: misma semilla → mismo torneo. Las carreras se simulan en orden porque cada ronda depende de la
 * anterior. Cada carrera usa la física de `carrera` v2 (bloques, tubos) con `configurarLienzo` (tablero ancho de
 * 1520 px a la vista en 1080 de alto) y `pasan` (la cámara lenta va en el cruce de la última que clasifica).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semillaDesde } from '../src/lib/azar';
import type { TipoSeccion } from '../src/plantillas/carrera/tipos';
import { GuionTorneo, NOMBRE_RONDA, T_TORNEO, type CarreraTorneo, type PlanTorneo, type Ronda, type SegmentoTorneo } from '../src/plantillas/torneo/guion';
import type { GuionCarrera } from '../src/plantillas/carrera/guion';
import type { SimulacionCarrera } from '../src/plantillas/carrera/tipos';
import { prepararSimulacion, type Lienzo } from './simular-carrera.mjs';
import { sintetizarCarrera, bombo, metal } from './lib/sonido-carrera.mjs';
import { SR, barrido, escribirWav, golpe, masterizar, midiAHz, nota } from './lib/wav.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;

/** Tablero del torneo: 1520 px de ancho (a la derecha del panel de 400 px), vista de 1080 de alto. */
export const ANCHO_TABLERO = 1520;
const LIENZO: Partial<Lienzo> = {
  ancho: ANCHO_TABLERO,
  pantalla: 1080,
  // ~45 s por carrera (el tiempo depende casi solo de la altura): 9 carreras + interludios ≈ 10 min.
  metaY: 12000,
  banda: { arriba: 330, abajo: 760 },
  metaEnPantalla: 700,
  duracion: { min: 36, max: 56, objetivo: 44 },
  // En el largo la carrera arranca tras la presentación: no hace falta el choque a los 0,3 s del Short.
  primerChoqueMax: 0.7,
};

/** Colores de los 16: dentro de cada grupo de octavos, tonos a 90° (inconfundibles); grupos desfasados 22,5°. */
const colorDe = (i: number) => {
  const g = Math.floor(i / 4), j = i % 4;
  const h = (12 + g * 22.5 + j * 90) % 360;
  return hslAHex(h, 100, 60);
};
const hslAHex = (h: number, s: number, l: number) => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};

/** Color de neón de carrera más parecido (solo para el schema; el torneo dibuja con el hex propio). */
/** Secciones de obstáculos por carrera (de arriba a abajo): ninguna combinación se repite; la final las trae todas. */
const SECCIONES_POR_CARRERA: TipoSeccion[][] = [
  ['bloques', 'bumpers', 'molinos', 'tuneles', 'trampolines'],
  ['portales', 'trampolines', 'bloques', 'plataformas', 'bumpers'],
  ['molinos', 'tuneles', 'portales', 'bumpers', 'plataformas'],
  ['plataformas', 'bloques', 'trampolines', 'portales', 'molinos'],
  ['bumpers', 'portales', 'tuneles', 'molinos', 'bloques'],
  ['trampolines', 'molinos', 'plataformas', 'tuneles', 'portales'],
  ['tuneles', 'bumpers', 'plataformas', 'bloques', 'trampolines'],
  ['bloques', 'portales', 'molinos', 'trampolines', 'tuneles'],
  ['plataformas', 'bumpers', 'portales', 'tuneles', 'molinos'],
  ['bloques', 'molinos', 'portales', 'bumpers', 'trampolines', 'tuneles', 'plataformas'],
];
/** La final es más larga (7 secciones). */
const LIENZO_FINAL: Partial<Lienzo> = { metaY: 15000, duracion: { min: 44, max: 70, objetivo: 54 } };

const NEON_CERCANO = ['lima', 'cian', 'magenta', 'naranja', 'violeta', 'amarillo'] as const;

/**
 * Cámara inteligente (frames de VIDEO, 30 fps). Objetivo por frame: encuadrar a todas las que siguen corriendo
 * (alto visible entre 1080 y ALTO_MAX: se aleja cuando se separan); desde que la líder entra a los últimos 1500 px,
 * mezcla hacia un plano fijo de la meta (meta al 68 % del alto, alto 1080) y ya no vuelve (m solo crece): se ve
 * llegar a cada una. Suavizado exponencial: aleja rápido (nunca pierde a nadie), acerca lento.
 */
const ALTO_MAX = 1750;
const camaraInteligente = (sim: SimulacionCarrera, frames: number) => {
  const meta = sim.tablero.metaY, n = sim.posiciones.length;
  const top: number[] = [], alto: number[] = [];
  let cTop = 0, cAlto = 1080, m = 0;
  for (let k = 0; k < frames; k++) {
    const f = Math.min(2 * k, sim.duracionFrames - 1);
    const vivas = [...Array(n).keys()].filter((b) => sim.llegadas[b] < 0 || sim.llegadas[b] > f);
    const ys = (vivas.length ? vivas : [...Array(n).keys()]).map((b) => sim.posiciones[b][f][1]);
    const lider = Math.max(...sim.posiciones.map((p) => Math.min(p[f][1], meta + 120)));
    const y0 = Math.min(...ys) - 190, y1 = Math.max(...ys) + 250;
    let V = Math.max(1080, Math.min(ALTO_MAX, y1 - y0));
    let T = y1 - y0 > ALTO_MAX ? y1 - ALTO_MAX : (y0 + y1) / 2 - V / 2;
    m = Math.max(m, Math.min(1, Math.max(0, (lider - (meta - 1500)) / 900)));
    const mm = m * m * (3 - 2 * m);
    V = V + (1080 - V) * mm;
    T = T + (meta - 1080 * 0.68 - T) * mm;
    T = Math.max(0, Math.min(sim.tablero.alto - V, T));
    if (k === 0) { cTop = T; cAlto = V; }
    cAlto += (V - cAlto) * (V > cAlto ? 0.12 : 0.05);
    const centro = cTop + cAlto / 2, objetivo = T + V / 2;
    const nc = centro + (objetivo - centro) * 0.14;
    cTop = nc - cAlto / 2;
    top.push(Math.round(cTop * 10) / 10); alto.push(Math.round(cAlto * 10) / 10);
  }
  return { top, alto };
};

const leerGuion = (ruta: string): GuionTorneo => {
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  return GuionTorneo.parse(crudo.props ?? crudo);
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const prepararTorneo = (g: GuionTorneo, { soloPlan = false } = {}) => {
  const base = g.semilla ?? semillaDesde(g.id);
  const colores = g.participantes.map((_, i) => colorDe(i));
  const carreras: CarreraTorneo[] = [];
  const canales: Float32Array[][] = [];

  const correr = (ronda: Ronda, nombre: string, corredores: number[], pasan: number) => {
    const k = carreras.length + 1;
    const simId = `${g.id}-r${String(k).padStart(2, '0')}`;
    const musica = ronda === 'octavos' ? g.musica?.octavos : ronda === 'cuartos' ? g.musica?.cuartos : ronda === 'final' ? g.musica?.final : g.musica?.semis;
    const guionCarrera = {
      id: simId,
      gancho: nombre,
      participantes: corredores.map((i, j) => ({ etiqueta: g.participantes[i].etiqueta, color: NEON_CERCANO[j % 6], icono: g.participantes[i].icono })),
      semilla: (base + k * 0x9e3779b1) >>> 0,
      extras: true,
      ...(musica ? { musica } : {}),
    } as GuionCarrera;
    const secciones = SECCIONES_POR_CARRERA[(k - 1) % SECCIONES_POR_CARRERA.length];
    const lienzo = ronda === 'final' ? { ...LIENZO, ...LIENZO_FINAL } : LIENZO;
    const sim = prepararSimulacion(guionCarrera, { lienzo, pasan, sinWav: true, secciones });
    canales.push(soloPlan ? [] : sintetizarCarrera(sim, null, musica));
    const frames = Math.ceil(sim.duracionFrames / 2);
    const cam = camaraInteligente(sim, frames);
    const c: CarreraTorneo = {
      simId, ronda, nombre, corredores, pasan, camTop: cam.top, camAlto: cam.alto,
      orden: sim.orden.map((b) => corredores[b]),
      ventajaSeg: Number.isFinite(sim.ventajaSeg) ? sim.ventajaSeg : null,
      frames,
      frameDecisivo: Math.round((sim.frameDecisivo ?? sim.frameGanadora) / 2),
    };
    carreras.push(c);
    return c;
  };

  // ---------- La llave ----------
  const grupos = [0, 1, 2, 3].map((gi) => [0, 1, 2, 3].map((j) => gi * 4 + j));
  const oct = grupos.map((gr, gi) => correr('octavos', `CARRERA ${gi + 1} DE 4`, gr, 2));
  const [A, B, C, D] = oct.map((c) => c.orden);
  const q1 = correr('cuartos', 'CARRERA 1 DE 2', [A[0], B[1], C[0], D[1]], 2);
  const q2 = correr('cuartos', 'CARRERA 2 DE 2', [B[0], A[1], D[0], C[1]], 2);
  const s1 = correr('semis', 'DUELO 1 DE 2', [q1.orden[0], q2.orden[1]], 1);
  const s2 = correr('semis', 'DUELO 2 DE 2', [q2.orden[0], q1.orden[1]], 1);
  const t3 = correr('tercero', 'POR EL BRONCE', [s1.orden[1], s2.orden[1]], 1);
  const fin = correr('final', 'POR EL TÍTULO', [s1.orden[0], s2.orden[0]], 1);
  const podio: [number, number, number, number] = [fin.orden[0], fin.orden[1], t3.orden[0], t3.orden[1]];
  const votacion = [q1.orden[0], q1.orden[1], q2.orden[0], q2.orden[1]];

  // ---------- Segmentos ----------
  const segmentos: SegmentoTorneo[] = [];
  let t = 0;
  const poner = (s: Omit<SegmentoTorneo, 'desde'>) => { segmentos.push({ ...s, desde: t }); t += s.dur; };
  const capitulos: { seg: number; titulo: string }[] = [];
  const midrolls: number[] = [];
  const tituloCap: Record<Ronda, string> = {
    octavos: 'Octavos de final: 4 carreras, pasan 2',
    cuartos: 'Cuartos de final: quedan 8',
    semis: 'Semifinales: duelos 1 contra 1',
    tercero: 'Por el tercer puesto',
    final: 'La gran final',
  };
  capitulos.push({ seg: 0, titulo: `Los 16 ${g.tema} y la llave` });
  poner({ tipo: 'portada', dur: T_TORNEO.portada });
  let rondaActual: Ronda | null = null;
  carreras.forEach((c, k) => {
    if (c.ronda !== rondaActual) {
      rondaActual = c.ronda;
      if (k > 0) midrolls.push(t / FPS);
      if (c.ronda === 'semis') poner({ tipo: 'votacion', dur: T_TORNEO.votacion });
      capitulos.push({ seg: t / FPS, titulo: tituloCap[c.ronda] });
      poner({ tipo: 'ronda', dur: T_TORNEO.ronda, ronda: c.ronda });
    }
    poner({ tipo: 'presenta', dur: T_TORNEO.presenta, carrera: k });
    poner({ tipo: 'carrera', dur: c.frames, carrera: k });
    poner({ tipo: 'resultado', dur: T_TORNEO.resultado, carrera: k });
  });
  capitulos.push({ seg: t / FPS, titulo: 'El campeón, el podio y la llave completa' });
  poner({ tipo: 'campeon', dur: T_TORNEO.campeon });
  poner({ tipo: 'cierre', dur: T_TORNEO.cierre });
  const duracionFrames = t;

  // Mid-rolls: límites de ronda a ≥ 2:30 del inicio y ≥ 2 min entre sí (no al final).
  const cortes: number[] = [];
  for (const m of midrolls) if (m >= 150 && (cortes.length === 0 || m - cortes[cortes.length - 1] >= 120) && m < duracionFrames / FPS - 60) cortes.push(Math.round(m));

  const plan: PlanTorneo = {
    version: 1, id: g.id, fps: 30, duracionFrames, colores, carreras, segmentos, podio, votacion,
    capitulos: capitulos.map((c) => ({ seg: Math.round(c.seg), titulo: c.titulo })), midrollsSeg: cortes,
  };
  const rutaPlan = path.join(RAIZ, 'public/sim', `${g.id}.json`);
  fs.writeFileSync(rutaPlan, JSON.stringify(plan));

  // ---------- Audio de todo el video ----------
  if (!soloPlan) {
    const total = duracionFrames / FPS + 1;
    const L = new Float32Array(Math.ceil(total * SR)), R = new Float32Array(Math.ceil(total * SR));
    const ambos = (f: (p: Float32Array, d: number) => void) => { f(L, 0); f(R, 0.004); };
    const sumar = (src: Float32Array[], t0: number, gan: number, hasta?: number) => {
      const off = Math.floor(t0 * SR);
      const n = hasta !== undefined ? Math.min(src[0].length, Math.floor(hasta * SR)) : src[0].length;
      for (let i = 0; i < n; i++) {
        const idx = off + i;
        if (idx >= L.length) break;
        // fundido de 0,25 s al final del tramo usado
        const fade = hasta !== undefined ? Math.min(1, (n - i) / (0.25 * SR)) : 1;
        L[idx] += src[0][i] * gan * fade; R[idx] += src[1][i] * gan * fade;
      }
    };
    /** Cama suave de interludio (Do–La m–Fa–Sol, pad de triángulos + bajo), para que nunca haya silencio. */
    const ACORDES = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]];
    const pad = (t0: number, dur: number, vol = 0.05) => {
      const paso = 2; // un acorde cada 2 s
      for (let s = 0, k = 0; s < dur - 0.2; s += paso, k++) {
        const ac = ACORDES[(Math.floor((t0 + s) / paso)) % 4];
        const d = Math.min(paso, dur - s);
        for (const m of ac) ambos((p, dd) => nota(p, { inicio: t0 + s + dd, hz: midiAHz(m), duracion: d, volumen: m < 50 ? vol * 1.6 : vol, timbre: 'triangulo', ataque: 0.25, caida: 0.3, sostenido: 0.8, liberacion: 0.5 }));
      }
    };
    /** Redoble de caja que crece (ruido en golpes cada 1/16 s). */
    const redoble = (t0: number, dur: number) => {
      for (let s = 0, k = 0; s < dur; s += 1 / 16, k++) {
        const v = 0.05 + 0.18 * (s / dur);
        golpe(L, t0 + s, { duracion: 0.05, volumen: v, tono: 0.55, semilla: 900 + k });
        golpe(R, t0 + s + 0.01, { duracion: 0.05, volumen: v, tono: 0.55, semilla: 1900 + k });
      }
    };
    const whoosh = (t0: number) => ambos((p, d) => { barrido(p, t0 + d, 180, 1500, 0.45, 0.09, 'sierra'); barrido(p, t0 + d, 90, 400, 0.45, 0.12, 'seno'); });
    const impacto = (t0: number, vol = 0.5) => ambos((p) => { bombo(p, t0, vol); });
    const fanfarria = (t0: number, grande = false) => {
      const notas = grande ? [60, 64, 67, 72, 76, 79, 84] : [67, 72, 76];
      notas.forEach((m, k) => ambos((p) => metal(p, t0 + k * 0.11, midiAHz(m), 0.1, 0.26)));
      const acorde = grande ? [60, 64, 67, 72, 76] : [72, 76, 79];
      for (const m of acorde) ambos((p) => metal(p, t0 + notas.length * 0.11, midiAHz(m), grande ? 2.2 : 0.9, 0.14));
      impacto(t0 + notas.length * 0.11, 0.5);
    };
    const eliminado = (t0: number) => {
      [64, 61, 57].forEach((m, k) => ambos((p, d) => nota(p, { inicio: t0 + k * 0.16 + d, hz: midiAHz(m), duracion: 0.14, volumen: 0.16, timbre: 'cuadrada', liberacion: 0.1 })));
    };
    const tic = (t0: number, hz = 1800) => ambos((p, d) => nota(p, { inicio: t0 + d, hz, duracion: 0.02, volumen: 0.12, timbre: 'seno', liberacion: 0.05 }));

    for (const s of segmentos) {
      const t0 = s.desde / FPS, dur = s.dur / FPS;
      switch (s.tipo) {
        case 'portada': {
          // Arranque con golpe y fanfarria corta; luego cama con pulso.
          impacto(t0, 0.55); fanfarria(t0 + 0.05);
          pad(t0 + 0.6, dur - 0.6, 0.05);
          for (let b = 0.6; b < dur - 0.3; b += 0.5) ambos((p) => bombo(p, t0 + b, b % 1 < 0.01 ? 0.22 : 0.12));
          // tic por cada bandera que entra (la portada las presenta de a una entre 1,2 y 5,2 s)
          for (let i = 0; i < 16; i++) tic(t0 + 1.2 + i * 0.25, 1500 + i * 40);
          break;
        }
        case 'ronda': whoosh(t0); impacto(t0 + 0.4, 0.6); pad(t0 + 0.4, dur - 0.4, 0.045); break;
        case 'presenta': pad(t0, dur, 0.04); redoble(t0 + 0.6, dur - 0.9); break;
        case 'carrera': sumar(canales[s.carrera!], t0, 0.9, dur); break;
        case 'resultado': {
          pad(t0, dur, 0.045);
          const c = carreras[s.carrera!];
          if (c.orden.length > c.pasan) eliminado(t0 + 3.2);
          whoosh(t0 + 0.1);
          break;
        }
        case 'votacion': pad(t0, dur, 0.05); for (let b = 0; b < dur; b += 1) tic(t0 + b, 1200); break;
        case 'campeon': {
          // Golpe + fanfarria larga al aparecer el campeón gigante, otra al podio (9 s) y cama hasta el repaso.
          impacto(t0, 0.6); fanfarria(t0 + 0.1, true); fanfarria(t0 + 3.2, true);
          for (let b = 0; b < 8.5; b += 0.5) ambos((p) => bombo(p, t0 + 0.8 + b, b % 1 < 0.01 ? 0.25 : 0.12));
          redoble(t0 + 7.4, 1.6); fanfarria(t0 + 9, false);
          pad(t0 + 1, dur - 1, 0.055);
          break;
        }
        case 'cierre': pad(t0, dur, 0.05); impacto(t0, 0.3); break;
      }
    }
    masterizar([L, R], { rmsDb: -15, techoDb: -1.5 });
    escribirWav(path.join(RAIZ, 'public/audio/generado', `${g.id}.wav`), [L, R]);
  }

  const props = { ...g, duracionFrames };
  const rutaProps = path.join(RAIZ, 'salida/trabajo', `${g.id}.props.json`);
  fs.mkdirSync(path.dirname(rutaProps), { recursive: true });
  fs.writeFileSync(rutaProps, JSON.stringify(props, null, 2));

  const nom = (i: number) => g.participantes[i].etiqueta;
  console.log(`[torneo] ${g.id}: ${mmss(duracionFrames / FPS)} (${duracionFrames} frames a 30 fps)`);
  carreras.forEach((c) => console.log(`  ${NOMBRE_RONDA[c.ronda]} · ${c.nombre}: ${c.orden.map(nom).join(' > ')} · decisiva por ${c.ventajaSeg === null ? '—' : c.ventajaSeg.toFixed(2) + ' s'} · ${(c.frames / FPS).toFixed(1)} s`));
  console.log(`  podio: 1.º ${nom(podio[0])} · 2.º ${nom(podio[1])} · 3.º ${nom(podio[2])}`);
  console.log(`  capítulos: ${plan.capitulos.map((c) => `${mmss(c.seg)} ${c.titulo}`).join(' | ')}`);
  console.log(`  mid-rolls sugeridos: ${cortes.map(mmss).join(', ')}`);
  console.log(`  → ${path.relative(RAIZ, rutaPlan)} · ${path.relative(RAIZ, rutaProps)}`);
  return plan;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('Uso: npx tsx scripts/preparar-largo-torneo.mts contenido/largos/<id>.json [--solo-plan]'); process.exit(2); }
  prepararTorneo(leerGuion(path.resolve(ruta)), { soloPlan: process.argv.includes('--solo-plan') });
}
