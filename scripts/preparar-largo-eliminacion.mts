/**
 * LARGO "Carrera de eliminación" (16:9, 50 participantes): simula las 15 carreras de las fases, arma el plan del video
 * y el audio completo.
 *
 * Uso: npx tsx scripts/preparar-largo-eliminacion.mts contenido/largos/<id>.json [--solo-plan] [--prueba]
 *   (≈ 2–3 min: 15 carreras)
 *   → public/sim/<id>-rNN.json (sims de carrera, lienzo 1520 × 1080, 60 fps) · public/sim/<id>.json (PlanEliminacion)
 *   → public/audio/generado/<id>.wav · salida/trabajo/<id>.props.json
 *   --prueba: carreras cortas (para el render de prueba de 60–90 s; NO publicar).
 *
 * Determinista: misma semilla → mismo torneo. Física de `carrera` v2 (secciones de obstáculos); nada se decide a mano:
 * el buscador de semillas del simulador solo exige duración en rango y corte reñido. Variedad entre rondas: cada
 * carrera trae su propia secuencia de secciones (sin repetir vecinas ni combinaciones), alto de pista distinto por
 * fase y tinte de tablero por fase. Cortes apretados (< 0,9 s) → repetición en cámara lenta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import type { TipoSeccion, SimulacionCarrera } from '../src/plantillas/carrera/tipos';
import type { GuionCarrera } from '../src/plantillas/carrera/guion';
import { GuionEliminacion, T_ELIM, type CarreraElim, type FaseElim, type PlanEliminacion, type SegmentoElim } from '../src/plantillas/eliminacion/guion';
import { prepararSimulacion, type Lienzo } from './simular-carrera.mjs';
import { sintetizarCarrera, bombo, metal } from './lib/sonido-carrera.mjs';
import { SR, barrido, escribirWav, golpe, masterizar, midiAHz, nota } from './lib/wav.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const PRUEBA = process.argv.includes('--prueba');

const LIENZO_BASE: Partial<Lienzo> = {
  ancho: 1520, pantalla: 1080, banda: { arriba: 330, abajo: 760 }, metaEnPantalla: 700, primerChoqueMax: 0.7,
};
/** Alto de pista y duración por fase (el tiempo depende casi solo de la altura: 12000 px ≈ 44 s, medido en el torneo). */
const PISTA: { metaY: number; duracion: { min: number; max: number; objetivo: number } }[] = [
  // Tope duro del simulador: 70 s de física (TOPE_SEG) → ninguna carrera pasa de ~69 s.
  { metaY: 21500, duracion: { min: 56, max: 69, objetivo: 64 } }, // clasificación (10 bolas)
  { metaY: 15500, duracion: { min: 44, max: 68, objetivo: 54 } }, // repechaje (5)
  { metaY: 20500, duracion: { min: 54, max: 69, objetivo: 62 } }, // ronda de 32 (8)
  { metaY: 21000, duracion: { min: 56, max: 69, objetivo: 64 } }, // octavos (8)
  { metaY: 21500, duracion: { min: 56, max: 69, objetivo: 64 } }, // semifinales (4)
  { metaY: 22500, duracion: { min: 58, max: 69, objetivo: 66 } }, // final (4)
];
const PISTA_PRUEBA = { metaY: 9000, duracion: { min: 26, max: 44, objetivo: 32 } };

const FASES_BASE: Omit<FaseElim, 'quedanAntes' | 'quedanDespues'>[] = [
  { nombre: 'CLASIFICACIÓN', texto: '5 carreras de 10 · pasan las 6 primeras', color: '#2EE6FF' },
  { nombre: 'REPECHAJE', texto: 'Los 5 séptimos · solo 2 se salvan', color: '#FF8A2E' },
  { nombre: 'RONDA DE 32', texto: '4 carreras de 8 · pasan 4', color: '#C8FF3D' },
  { nombre: 'OCTAVOS', texto: '2 carreras de 8 · pasan 4', color: '#B26BFF' },
  { nombre: 'SEMIFINALES', texto: '2 carreras de 4 · pasan 2 a la final', color: '#FF4DD8' },
  { nombre: 'LA GRAN FINAL', texto: '4 bolitas · 1 campeón', color: '#FFD34D' },
];

const TIPOS: TipoSeccion[] = ['bloques', 'bumpers', 'molinos', 'tuneles', 'trampolines', 'portales', 'plataformas'];
const NEON_CERCANO = ['lima', 'cian', 'magenta', 'naranja', 'violeta', 'amarillo'] as const;

const hslAHex = (h: number, s: number, l: number) => {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
};
/** 50 colores: ángulo dorado + dos luminosidades (vecinos de lista nunca se parecen). */
const colorDe = (i: number) => hslAHex((i * 137.508) % 360, 100, i % 2 ? 66 : 56);

/** Barajado determinista. */
const barajar = <T,>(xs: T[], az: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(az() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Secuencia de secciones de una carrera: ~1 cada 2000 px, sin repetir vecinas, todos los tipos antes de repetir. */
const secuenciaSecciones = (metaY: number, az: () => number, usadas: Set<string>): TipoSeccion[] => {
  const n = Math.max(4, Math.min(11, Math.round((metaY - 1950) / 2000)));
  for (let intento = 0; intento < 50; intento++) {
    const out: TipoSeccion[] = [];
    let bolsa: TipoSeccion[] = [];
    while (out.length < n) {
      if (!bolsa.length) bolsa = barajar(TIPOS, az);
      const k = bolsa.findIndex((t) => t !== out[out.length - 1]);
      out.push(bolsa.splice(k < 0 ? 0 : k, 1)[0]);
    }
    const clave = out.join(',');
    if (!usadas.has(clave)) { usadas.add(clave); return out; }
  }
  return barajar(TIPOS, az).slice(0, n);
};

/**
 * Cámara (frames de VIDEO): prioriza la PELEA DEL CORTE (la última que clasificaría y la primera que quedaría fuera,
 * entre las que siguen corriendo) y suma a la líder si cabe; alto visible 1080–1750 px de mundo. Desde que la líder
 * entra a los últimos 1500 px, va a un plano fijo de la meta y no vuelve. Aleja rápido, acerca lento.
 */
const ALTO_MAX = 1750;
const camaraCorte = (sim: SimulacionCarrera, frames: number, pasan: number) => {
  const meta = sim.tablero.metaY, n = sim.posiciones.length;
  const top: number[] = [], alto: number[] = [];
  let cTop = 0, cAlto = 1080, m = 0;
  for (let k = 0; k < frames; k++) {
    const f = Math.min(2 * k, sim.duracionFrames - 1);
    const llegaron = [...Array(n).keys()].filter((b) => sim.llegadas[b] >= 0 && sim.llegadas[b] <= f).length;
    const vivas = [...Array(n).keys()].filter((b) => sim.llegadas[b] < 0 || sim.llegadas[b] > f);
    const ys = (vivas.length ? vivas : [...Array(n).keys()]).map((b) => sim.posiciones[b][f][1]).sort((a, b) => b - a);
    // en la pista, la que pelea el último cupo es la (pasan - llegaron)-ésima viva
    const kc = Math.max(0, Math.min(ys.length - 1, pasan - llegaron - 1));
    const yCorteA = ys[kc], yCorteB = ys[Math.min(ys.length - 1, kc + 1)];
    let y0 = Math.min(yCorteA, yCorteB) - 190, y1 = Math.max(yCorteA, yCorteB) + 250;
    const yl = ys[0] + 250;
    if (yl - y0 <= ALTO_MAX) y1 = Math.max(y1, yl);
    const yu = ys[ys.length - 1] - 190;
    if (y1 - yu <= ALTO_MAX) y0 = Math.min(y0, yu);
    let V = Math.max(1080, Math.min(ALTO_MAX, y1 - y0));
    let T = y1 - y0 > ALTO_MAX ? y1 - ALTO_MAX : (y0 + y1) / 2 - V / 2;
    const lider = Math.max(...sim.posiciones.map((p) => Math.min(p[f][1], meta + 120)));
    m = Math.max(m, Math.min(1, Math.max(0, (lider - (meta - 1500)) / 900)));
    const mm = m * m * (3 - 2 * m);
    V = V + (1080 - V) * mm;
    T = T + (meta - 1080 * 0.68 - T) * mm;
    T = Math.max(0, Math.min(sim.tablero.alto - V, T));
    if (k === 0) { cTop = T; cAlto = V; }
    cAlto += (V - cAlto) * (V > cAlto ? 0.12 : 0.05);
    const centro = cTop + cAlto / 2, objetivo = T + V / 2;
    cTop = centro + (objetivo - centro) * 0.12 - cAlto / 2;
    top.push(Math.round(cTop * 10) / 10); alto.push(Math.round(cAlto * 10) / 10);
  }
  return { top, alto };
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const prepararEliminacion = (g: GuionEliminacion, { soloPlan = false } = {}) => {
  const base = g.semilla ?? semillaDesde(g.id);
  const az = crearAzar(base ^ 0x5eed);
  const colores = g.participantes.map((_, i) => colorDe(i));
  const carreras: CarreraElim[] = [];
  const canales: Float32Array[][] = [];
  const usadas = new Set<string>();
  const eliminadoEn = g.participantes.map(() => -1);
  let quedan = g.participantes.length;

  const correr = (fase: number, nombre: string, corredores: number[], pasan: number) => {
    const k = carreras.length + 1;
    const simId = `${g.id}-r${String(k).padStart(2, '0')}`;
    const pista = PRUEBA ? PISTA_PRUEBA : PISTA[fase];
    const guionCarrera = {
      id: simId, gancho: nombre,
      participantes: corredores.map((i, j) => ({ etiqueta: g.participantes[i].etiqueta, color: NEON_CERCANO[j % 6], icono: g.participantes[i].icono })),
      semilla: (base + k * 0x9e3779b1) >>> 0, extras: true,
    } as GuionCarrera;
    const secciones = secuenciaSecciones(pista.metaY, az, usadas);
    const t0 = Date.now();
    const sim = prepararSimulacion(guionCarrera, { lienzo: { ...LIENZO_BASE, ...pista }, pasan, sinWav: true, secciones });
    canales.push(soloPlan ? [] : sintetizarCarrera(sim, null));
    const frames = Math.ceil(sim.duracionFrames / 2);
    const cam = camaraCorte(sim, frames, pasan);
    const orden = sim.orden.map((b) => corredores[b]);
    const fuera = orden.slice(pasan);
    const fDec = sim.frameDecisivo ?? sim.frameGanadora;
    const ventaja = Number.isFinite(sim.ventajaSeg) ? sim.ventajaSeg : null;
    const c: CarreraElim = {
      simId, fase, nombre, corredores, pasan, orden, camTop: cam.top, camAlto: cam.alto, ventajaSeg: ventaja, frames,
      frameDecisivo: Math.round(fDec / 2), quedanAntes: quedan, quedanDespues: quedan - (fase === 5 ? 0 : fuera.length),
      ...(ventaja !== null && ventaja < 0.9 ? { repe: { desde: Math.max(0, fDec - 150), hasta: Math.min(sim.duracionFrames - 1, fDec + 30) } } : {}),
    };
    if (fase !== 5) for (const i of fuera) eliminadoEn[i] = fase;
    quedan = c.quedanDespues;
    carreras.push(c);
    console.log(`  [${(Date.now() - t0) / 1000 | 0} s] ${FASES_BASE[fase].nombre} · ${nombre}: ${secciones.length} secciones · ${(frames / FPS).toFixed(1)} s · corte ${ventaja === null ? '—' : ventaja.toFixed(2) + ' s'}${c.repe ? ' · REPE' : ''}`);
    return c;
  };

  // ---------- Fases ----------
  const todos = barajar([...Array(50).keys()], az);
  const clas = [0, 1, 2, 3, 4].map((h) => correr(0, `CARRERA ${h + 1} DE 5`, todos.slice(h * 10, h * 10 + 10), 6));
  const septimos = clas.map((c) => c.orden[6]);
  // Los 5 séptimos estaban marcados como eliminados en clasificación; los 2 que se salvan vuelven.
  for (const i of septimos) eliminadoEn[i] = -1;
  quedan += 5; // los 7.º siguen vivos: 30 clasificados + 5 en el repechaje
  const rep = correr(1, 'REPECHAJE', septimos, 2);
  for (const i of rep.orden.slice(0, 2)) eliminadoEn[i] = -1;
  // ajusta los contadores: antes del repechaje quedan 30 clasificados + 5 en repechaje = 35; después 32
  rep.quedanAntes = 35; rep.quedanDespues = 32; quedan = 32;
  const r32 = barajar([...clas.flatMap((c) => c.orden.slice(0, 6)), ...rep.orden.slice(0, 2)], az);
  const ron = [0, 1, 2, 3].map((h) => correr(2, `CARRERA ${h + 1} DE 4`, r32.slice(h * 8, h * 8 + 8), 4));
  const oct16 = barajar(ron.flatMap((c) => c.orden.slice(0, 4)), az);
  const oct = [0, 1].map((h) => correr(3, `CARRERA ${h + 1} DE 2`, oct16.slice(h * 8, h * 8 + 8), 4));
  const ocho = barajar(oct.flatMap((c) => c.orden.slice(0, 4)), az);
  const semis = [0, 1].map((h) => correr(4, `SEMIFINAL ${h + 1} DE 2`, ocho.slice(h * 4, h * 4 + 4), 2));
  const cuatro = barajar(semis.flatMap((c) => c.orden.slice(0, 2)), az);
  const fin = correr(5, 'POR EL TÍTULO', cuatro, 1);
  const podio = fin.orden.slice(0, 4) as [number, number, number, number];
  const votacion = cuatro;
  // En clasificación el 7.º va al repechaje (sigue vivo): el contador baja 3 por carrera (50 → 35).
  clas.forEach((c, h) => { c.quedanAntes = 50 - 3 * h; c.quedanDespues = 50 - 3 * (h + 1); });

  const fases: FaseElim[] = FASES_BASE.map((f, k) => {
    const cs = carreras.filter((c) => c.fase === k);
    return { ...f, quedanAntes: cs[0].quedanAntes, quedanDespues: cs[cs.length - 1].quedanDespues };
  });

  // ---------- Segmentos ----------
  const segmentos: SegmentoElim[] = [];
  let t = 0;
  const poner = (s: Omit<SegmentoElim, 'desde'>) => { segmentos.push({ ...s, desde: t }); t += s.dur; };
  const capitulos: { seg: number; titulo: string }[] = [];
  const limites: number[] = [];
  poner({ tipo: 'portada', dur: T_ELIM.portada });
  capitulos.push({ seg: 0, titulo: `Clasificación: 50 ${g.tema}, 5 carreras de 10` });
  let faseActual = -1;
  carreras.forEach((c, k) => {
    if (c.fase !== faseActual) {
      faseActual = c.fase;
      if (k > 0) {
        limites.push(t / FPS);
        capitulos.push({ seg: t / FPS, titulo: `${fases[c.fase].nombre.charAt(0)}${fases[c.fase].nombre.slice(1).toLowerCase()}: quedan ${c.quedanAntes}` });
        if (c.fase === 5) poner({ tipo: 'votacion', dur: T_ELIM.votacion });
        poner({ tipo: 'fase', dur: T_ELIM.fase, fase: c.fase });
      }
    } else if (c.fase === 0 || c.fase === 2) {
      capitulos.push({ seg: t / FPS, titulo: `${c.fase === 0 ? 'Clasificación' : 'Ronda de 32'} · ${c.nombre.toLowerCase()} (quedan ${c.quedanAntes})` });
    }
    // La 1.ª carrera arranca de inmediato tras la portada (gancho en 5 s): sin presentación.
    if (k > 0) poner({ tipo: 'presenta', dur: T_ELIM.presenta, carrera: k });
    poner({ tipo: 'carrera', dur: c.frames, carrera: k });
    if (c.repe) poner({ tipo: 'repeticion', dur: c.repe.hasta - c.repe.desde, carrera: k });
    poner({ tipo: 'resultado', dur: T_ELIM.resultado, carrera: k });
  });
  capitulos.push({ seg: t / FPS, titulo: 'El campeón y el podio' });
  poner({ tipo: 'campeon', dur: T_ELIM.campeon });
  poner({ tipo: 'cierre', dur: T_ELIM.cierre });
  const duracionFrames = t;

  // Mid-rolls: límites de fase y de carrera, ≥ 2:30 del inicio, ≥ 2 min entre sí, no en el último minuto.
  const candidatos = [...limites, ...segmentos.filter((s) => s.tipo === 'presenta').map((s) => s.desde / FPS)].sort((a, b) => a - b);
  const cortes: number[] = [];
  for (const m of candidatos) if (m >= 150 && (cortes.length === 0 || m - cortes[cortes.length - 1] >= 150) && m < duracionFrames / FPS - 60) cortes.push(Math.round(m));

  const plan: PlanEliminacion = {
    version: 1, id: g.id, fps: 30, duracionFrames, colores, fases, carreras, segmentos, eliminadoEn, podio, votacion,
    capitulos: capitulos.map((c) => ({ seg: Math.round(c.seg), titulo: c.titulo })), midrollsSeg: cortes,
  };
  fs.writeFileSync(path.join(RAIZ, 'public/sim', `${g.id}.json`), JSON.stringify(plan));

  // ---------- Audio de todo el video ----------
  if (!soloPlan) {
    const total = duracionFrames / FPS + 1;
    const L = new Float32Array(Math.ceil(total * SR)), R = new Float32Array(Math.ceil(total * SR));
    const ambos = (f: (p: Float32Array, d: number) => void) => { f(L, 0); f(R, 0.004); };
    const sumar = (src: Float32Array[], t0: number, gan: number, hasta?: number) => {
      const off = Math.floor(t0 * SR);
      const n = hasta !== undefined ? Math.min(src[0].length, Math.floor(hasta * SR)) : src[0].length;
      for (let i = 0; i < n; i++) {
        const idx = off + i; if (idx >= L.length) break;
        const fade = hasta !== undefined ? Math.min(1, (n - i) / (0.25 * SR)) : 1;
        L[idx] += src[0][i] * gan * fade; R[idx] += src[1][i] * gan * fade;
      }
    };
    /** Repetición: el tramo del audio de la carrera a media velocidad (una octava abajo: suena a cámara lenta). */
    const sumarLento = (src: Float32Array[], desdeSeg: number, durSalida: number, t0: number, gan: number) => {
      const off = Math.floor(t0 * SR), n = Math.floor(durSalida * SR);
      for (let i = 0; i < n; i++) {
        const x = desdeSeg * SR + i * 0.5, a = Math.floor(x), u = x - a;
        if (a + 1 >= src[0].length) break;
        const idx = off + i; if (idx >= L.length) break;
        const fade = Math.min(1, i / (0.15 * SR), (n - i) / (0.3 * SR));
        L[idx] += (src[0][a] * (1 - u) + src[0][a + 1] * u) * gan * fade;
        R[idx] += (src[1][a] * (1 - u) + src[1][a + 1] * u) * gan * fade;
      }
    };
    const ACORDES = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 55, 59, 62]];
    const pad = (t0: number, dur: number, vol = 0.05) => {
      const paso = 2;
      for (let s = 0; s < dur - 0.2; s += paso) {
        const ac = ACORDES[(Math.floor((t0 + s) / paso)) % 4];
        const d = Math.min(paso, dur - s);
        for (const m of ac) ambos((p, dd) => nota(p, { inicio: t0 + s + dd, hz: midiAHz(m), duracion: d, volumen: m < 50 ? vol * 1.6 : vol, timbre: 'triangulo', ataque: 0.25, caida: 0.3, sostenido: 0.8, liberacion: 0.5 }));
      }
    };
    const redoble = (t0: number, dur: number) => {
      for (let s = 0, k = 0; s < dur; s += 1 / 16, k++) {
        const v = 0.05 + 0.18 * (s / dur);
        golpe(L, t0 + s, { duracion: 0.05, volumen: v, tono: 0.55, semilla: 900 + k });
        golpe(R, t0 + s + 0.01, { duracion: 0.05, volumen: v, tono: 0.55, semilla: 1900 + k });
      }
    };
    const whoosh = (t0: number, inverso = false) => ambos((p, d) => { barrido(p, t0 + d, inverso ? 1500 : 180, inverso ? 180 : 1500, 0.45, 0.09, 'sierra'); barrido(p, t0 + d, 90, 400, 0.45, 0.12, 'seno'); });
    const impacto = (t0: number, vol = 0.5) => ambos((p) => { bombo(p, t0, vol); });
    const fanfarria = (t0: number, grande = false) => {
      const notas = grande ? [60, 64, 67, 72, 76, 79, 84] : [67, 72, 76];
      notas.forEach((m, k) => ambos((p) => metal(p, t0 + k * 0.11, midiAHz(m), 0.1, 0.26)));
      const acorde = grande ? [60, 64, 67, 72, 76] : [72, 76, 79];
      for (const m of acorde) ambos((p) => metal(p, t0 + notas.length * 0.11, midiAHz(m), grande ? 2.2 : 0.9, 0.14));
      impacto(t0 + notas.length * 0.11, 0.5);
    };
    const eliminado = (t0: number) => [64, 61, 57].forEach((m, k) => ambos((p, d) => nota(p, { inicio: t0 + k * 0.16 + d, hz: midiAHz(m), duracion: 0.14, volumen: 0.16, timbre: 'cuadrada', liberacion: 0.1 })));
    const tic = (t0: number, hz = 1800) => ambos((p, d) => nota(p, { inicio: t0 + d, hz, duracion: 0.02, volumen: 0.1, timbre: 'seno', liberacion: 0.05 }));

    for (const s of segmentos) {
      const t0 = s.desde / FPS, dur = s.dur / FPS;
      switch (s.tipo) {
        case 'portada':
          // golpe en el frame 0 + tic por bandera que entra (0,1–1,6 s) + redoble hacia la largada
          impacto(t0, 0.6); fanfarria(t0 + 0.05);
          for (let i = 0; i < 50; i++) tic(t0 + 0.1 + i * 0.03, 1300 + (i % 10) * 60);
          redoble(t0 + 2.6, dur - 2.7);
          break;
        case 'fase': whoosh(t0); impacto(t0 + 0.4, 0.6); pad(t0 + 0.4, dur - 0.4, 0.045); break;
        case 'presenta': pad(t0, dur, 0.04); redoble(t0 + 0.6, dur - 0.9); break;
        case 'carrera': sumar(canales[s.carrera!], t0, 0.9, dur); break;
        case 'repeticion': {
          const c = carreras[s.carrera!];
          whoosh(t0, true);
          sumarLento(canales[s.carrera!], c.repe!.desde / 60, dur, t0 + 0.1, 0.85);
          break;
        }
        case 'resultado': {
          pad(t0, dur, 0.045);
          const c = carreras[s.carrera!];
          if (c.orden.length > c.pasan) eliminado(t0 + 2.2);
          // un tic por cada uno que cae del contador
          for (let j = 0; j < c.quedanAntes - c.quedanDespues; j++) tic(t0 + 2.2 + j * 0.12, 900);
          whoosh(t0 + 0.1);
          break;
        }
        case 'votacion': pad(t0, dur, 0.05); for (let b = 0; b < dur; b += 1) tic(t0 + b, 1200); break;
        case 'campeon':
          impacto(t0, 0.6); fanfarria(t0 + 0.1, true); fanfarria(t0 + 3.2, true);
          for (let b = 0; b < 8.5; b += 0.5) ambos((p) => bombo(p, t0 + 0.8 + b, b % 1 < 0.01 ? 0.25 : 0.12));
          redoble(t0 + 7.4, 1.6); fanfarria(t0 + 9, false);
          pad(t0 + 1, dur - 1, 0.055);
          break;
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
  console.log(`[eliminacion] ${g.id}: ${mmss(duracionFrames / FPS)} (${duracionFrames} frames) · ${carreras.length} carreras · ${carreras.filter((c) => c.repe).length} repeticiones`);
  console.log(`  podio: 1.º ${nom(podio[0])} · 2.º ${nom(podio[1])} · 3.º ${nom(podio[2])} · 4.º ${nom(podio[3])}`);
  console.log(`  capítulos:\n${plan.capitulos.map((c) => `    ${mmss(c.seg)} ${c.titulo}`).join('\n')}`);
  console.log(`  mid-rolls sugeridos: ${cortes.map(mmss).join(', ')}`);
  return plan;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!ruta) { console.error('Uso: npx tsx scripts/preparar-largo-eliminacion.mts contenido/largos/<id>.json [--solo-plan] [--prueba]'); process.exit(2); }
  const crudo = JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8'));
  const g = GuionEliminacion.parse(crudo.props ?? crudo);
  prepararEliminacion(PRUEBA ? { ...g, id: `${g.id}-prueba` } : g, { soloPlan: process.argv.includes('--solo-plan') });
}
