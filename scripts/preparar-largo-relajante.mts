/**
 * LARGO "Bolitas relajantes" (16:9, 30 fps): simula las escenas, sintetiza la música de cada una y arma el plan.
 *
 * Uso: npx tsx scripts/preparar-largo-relajante.mts contenido/largos/<id>.json [--preview-audio <salida.wav>] [--sin-audio]
 *   → public/sim/<id>.json (PlanRelajante) · public/audio/generado/<id>.wav (todo el video) · salida/trabajo/<id>.props.json
 *   --preview-audio: además escribe 30 s de muestra (5 s de cada escena… en realidad 30 s del cruce de escenas 1→2).
 *
 * Física en Node a paso fijo (1/1200 s), sin azar suelto: todo nace de la semilla. Los rebotes conservan la energía
 * (la bola no se apaga en 5 min) y se tuercen ±4° para que el recorrido no se vuelva periódico (las trazas llenan).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import { GuionRelajante, type EscenaPlan, type PlanRelajante } from '../src/plantillas/relajante/guion';
import { PIEZAS, sintetizarEscena, type Pieza } from './lib/musica-relajante.mjs';
import { SR, masterizar } from './lib/wav.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30, SUB = 40; // 1/1200 s
const CX = 960, CY = 540;

type Bola = { x: number; y: number; vx: number; vy: number; r: number };

/** Bolas dentro de un anillo (o de un hexágono que gira), con gravedad, choques elásticos y energía conservada. */
const simularContenedor = (o: { segundos: number; bolas: Bola[]; g: number; anillo?: number; hex?: { R: number; omega: number; ang0: number }; semilla: number }) => {
  const az = crearAzar(o.semilla);
  const frames = Math.ceil(o.segundos * FPS);
  const dt = 1 / (FPS * SUB);
  const bolas = o.bolas.map((b) => ({ ...b }));
  // Energía por bola: E = ½v² − g·y (y hacia abajo).
  const E = bolas.map((b) => 0.5 * (b.vx * b.vx + b.vy * b.vy) - o.g * b.y);
  const xy = bolas.map(() => [] as number[]);
  const golpes: number[] = [];
  const renorm = (i: number) => {
    const b = bolas[i];
    const v = Math.sqrt(Math.max(200 * 200, 2 * (E[i] + o.g * b.y)));
    const m = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= v / m; b.vy *= v / m;
  };
  const torcer = (i: number) => {
    const b = bolas[i];
    const a = (az() - 0.5) * (8 * Math.PI / 180);
    const c = Math.cos(a), s = Math.sin(a);
    [b.vx, b.vy] = [b.vx * c - b.vy * s, b.vx * s + b.vy * c];
  };
  let ultimo = -1;
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < SUB; s++) {
      const t = (f * SUB + s) * dt;
      for (const b of bolas) { b.vy += o.g * dt; b.x += b.vx * dt; b.y += b.vy * dt; }
      bolas.forEach((b, i) => {
        let choco = false;
        if (o.anillo) {
          const dx = b.x - CX, dy = b.y - CY, d = Math.hypot(dx, dy), lim = o.anillo - b.r;
          if (d > lim) {
            const nx = dx / d, ny = dy / d;
            b.x = CX + nx * lim; b.y = CY + ny * lim;
            const vn = b.vx * nx + b.vy * ny;
            if (vn > 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; choco = true; }
          }
        }
        if (o.hex) {
          // Hexágono regular (circunradio R) que gira: lados como planos; velocidad de la pared = ω × r.
          const ang = o.hex.ang0 + o.hex.omega * t;
          const apotema = o.hex.R * Math.cos(Math.PI / 6);
          for (let k = 0; k < 6; k++) {
            const a = ang + Math.PI / 6 + (k * Math.PI) / 3;
            const nx = Math.cos(a), ny = Math.sin(a);
            const dist = (b.x - CX) * nx + (b.y - CY) * ny;
            if (dist > apotema - b.r) {
              b.x -= (dist - (apotema - b.r)) * nx; b.y -= (dist - (apotema - b.r)) * ny;
              const px = b.x - CX, py = b.y - CY;
              const wx = -o.hex.omega * py, wy = o.hex.omega * px;
              const rel = (b.vx - wx) * nx + (b.vy - wy) * ny;
              if (rel > 0) { b.vx -= 2 * rel * nx; b.vy -= 2 * rel * ny; choco = true; }
            }
          }
        }
        if (choco) { torcer(i); renorm(i); if (t - ultimo > 0.06) { golpes.push(t); ultimo = t; } }
      });
      for (let i = 0; i < bolas.length; i++) for (let j = i + 1; j < bolas.length; j++) {
        const a = bolas[i], b = bolas[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), rr = a.r + b.r;
        if (d >= rr || d === 0) continue;
        const nx = dx / d, ny = dy / d, sol = (rr - d) / 2;
        a.x -= nx * sol; a.y -= ny * sol; b.x += nx * sol; b.y += ny * sol;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; renorm(i); renorm(j); }
      }
    }
    bolas.forEach((b, i) => xy[i].push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10));
  }
  return { bolas: bolas.map((b, i) => ({ r: b.r, xy: xy[i] })), golpes };
};

/** Instantes (s) de las notas de la melodía tal como las toca sintetizarEscena (intro de 2 compases + vueltas). */
const notasMelodia = (p: Pieza, segundos: number) => {
  const spb = 60 / p.bpm, intro = 2 * p.compas, vuelta = p.largo + p.compas;
  const out: number[] = [];
  for (let v = 0; (intro + v * vuelta) * spb < segundos - 4; v++) for (const [, t] of p.melodia) { const s = (intro + v * vuelta + t) * spb; if (s < segundos - 3) out.push(s); }
  return out;
};

const leerGuion = (ruta: string) => {
  const crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  return GuionRelajante.parse(crudo.props ?? crudo);
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const prepararRelajante = (g: GuionRelajante, opciones: { previewAudio?: string; sinAudio?: boolean } = {}) => {
  const base = g.semilla ?? semillaDesde(g.id);
  const D = g.segundosEscena, X = g.fundido;
  const paso = D - X;
  const total = paso * (g.escenas.length - 1) + D;
  const canon = JSON.parse(fs.readFileSync(path.join(RAIZ, 'contenido/partituras/canon.json'), 'utf8'));
  const escenas: EscenaPlan[] = [];
  const musica: Float32Array[][] = [];
  g.escenas.forEach((e, k) => {
    const sem = (base + k * 7919) >>> 0;
    const az = crearAzar(sem);
    const pieza = e.pieza === 'canon' ? PIEZAS.canon(canon) : PIEZAS[e.pieza]();
    const ep: EscenaPlan = { tipo: e.tipo, tono: e.tono, desde: Math.round(k * paso * FPS), dur: Math.round(D * FPS) };
    let golpes: number[] = [];
    switch (e.tipo) {
      case 'llenar': {
        const R = 470;
        const s = simularContenedor({ segundos: D, g: 1000, anillo: R, semilla: sem, bolas: [{ x: CX - 60, y: CY - 200, vx: 420, vy: -620, r: 34 }] });
        ep.bolas = s.bolas; ep.anillo = { cx: CX, cy: CY, R }; golpes = s.golpes;
        break;
      }
      case 'tres': {
        const R = 470;
        const s = simularContenedor({ segundos: D, g: 850, anillo: R, semilla: sem, bolas: [0, 1, 2].map((j) => ({ x: CX - 200 + j * 200, y: CY - 150 + j * 40, vx: (j - 1) * 300 + 90, vy: -380 - 120 * j, r: 26 })) });
        ep.bolas = s.bolas; ep.anillo = { cx: CX, cy: CY, R }; golpes = s.golpes;
        break;
      }
      case 'hexagono': {
        const hex = { R: 470, omega: 0.18, ang0: az() * Math.PI };
        const s = simularContenedor({ segundos: D, g: 900, hex, semilla: sem, bolas: [{ x: CX + 40, y: CY - 150, vx: -300, vy: 0, r: 30 }, { x: CX - 120, y: CY + 60, vx: 250, vy: -200, r: 22 }] });
        ep.bolas = s.bolas; ep.hex = hex; golpes = s.golpes;
        break;
      }
      case 'pendulos': {
        const ciclo = 75, n = Array.from({ length: 16 }, (_, j) => 24 + j);
        ep.pendulos = { n, ciclo, amp: 0.42 };
        // golpe = cada pendulo en su extremo derecho (cos = 1): t = m·ciclo/n
        for (const nj of n) for (let m = 1; (m * ciclo) / nj < D; m++) golpes.push((m * ciclo) / nj);
        golpes.sort((a, b) => a - b);
        break;
      }
      case 'espirografo': {
        ep.plumas = [0, 1, 2].map((j) => ({ R: 430, r: [165, 113, 251][j], d: [120, 150, 90][j], vel: [0.33, 0.27, 0.21][j], fase: j * 2.1 }));
        // golpe cuando la pluma 0 pasa por su radio máximo (≈ cada vuelta del rodillo)
        const p0 = ep.plumas[0];
        let prev = 0, subiendo = false;
        for (let t = 0; t < D; t += 1 / FPS) {
          const th = t * p0.vel * 2 * Math.PI + p0.fase, k2 = (p0.R - p0.r) / p0.r;
          const x = (p0.R - p0.r) * Math.cos(th) + p0.d * Math.cos(k2 * th), y = (p0.R - p0.r) * Math.sin(th) - p0.d * Math.sin(k2 * th);
          const rad = Math.hypot(x, y);
          if (subiendo && rad < prev) golpes.push(t);
          subiendo = rad > prev; prev = rad;
        }
        break;
      }
      case 'gotas': {
        // Una gota por nota de la melodía: cae en el instante de la nota (la imagen sigue a la música).
        const notas = notasMelodia(pieza, D);
        // + llovizna: gotas chicas cada ~0,8 s (solo imagen) para que la superficie nunca quede quieta.
        const llovizna: number[] = [];
        for (let t = 1; t < D - 2; t += 0.5 + az() * 0.6) llovizna.push(t);
        ep.gotas = [...notas.map((t) => ({ t, x: Math.round(260 + az() * 1400), y: Math.round(260 + az() * 600), s: 0.7 + az() * 0.6 })),
          ...llovizna.map((t) => ({ t, x: Math.round(160 + az() * 1600), y: Math.round(200 + az() * 700), s: 0.3 + az() * 0.25 }))].sort((a, b) => a.t - b.t);
        golpes = []; // la melodía ya suena en cada gota
        break;
      }
    }
    escenas.push(ep);
    if (!opciones.sinAudio || opciones.previewAudio) {
      const inst: ('piano' | 'campana')[] = k % 2 === 0 ? ['piano', 'campana', 'piano'] : ['campana', 'piano', 'piano'];
      const m = sintetizarEscena({ segundos: D, pieza, instrumentos: inst, golpes, semilla: sem, fundido: X });
      masterizar(m, { rmsDb: -21, techoDb: -3 });
      musica.push(m);
      console.log(`[relajante] escena ${k + 1} (${e.tipo}, ${pieza.nombre}): ${golpes.length} golpes`);
    }
  });
  const duracionFrames = Math.round(total * FPS);
  const capitulos = g.escenas.map((e, k) => ({ seg: Math.round(k * paso), titulo: e.nombre }));
  const plan: PlanRelajante = { version: 1, id: g.id, fps: 30, duracionFrames, escenas, capitulos };
  fs.writeFileSync(path.join(RAIZ, 'public/sim', `${g.id}.json`), JSON.stringify(plan));

  // Audio completo: escenas superpuestas en los fundidos, en 16 bits (30 min en float no caben cómodos en RAM).
  const escribir = (ruta: string, desdeSeg: number, hastaSeg: number) => {
    const n = Math.ceil((hastaSeg - desdeSeg) * SR);
    const datos = Buffer.alloc(n * 4);
    const acum = new Float32Array(Math.min(n, 30 * SR)); // por bloques de 30 s
    for (let b0 = 0; b0 < n; b0 += acum.length) {
      const len = Math.min(acum.length, n - b0);
      for (const c of [0, 1]) {
        acum.fill(0);
        musica.forEach((m, k) => {
          const off = Math.round((k * paso - desdeSeg) * SR) ; // muestra global donde empieza la escena k
          for (let i = 0; i < len; i++) { const j = b0 + i - off; if (j >= 0 && j < m[c].length) acum[i] += m[c][j]; }
        });
        for (let i = 0; i < len; i++) datos.writeInt16LE(Math.round(Math.max(-1, Math.min(1, acum[i])) * 32767), ((b0 + i) * 2 + c) * 2);
      }
    }
    const cab = Buffer.alloc(44);
    cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8); cab.write('fmt ', 12); cab.writeUInt32LE(16, 16);
    cab.writeUInt16LE(1, 20); cab.writeUInt16LE(2, 22); cab.writeUInt32LE(SR, 24); cab.writeUInt32LE(SR * 4, 28); cab.writeUInt16LE(4, 32); cab.writeUInt16LE(16, 34);
    cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, Buffer.concat([cab, datos]));
    console.log(`[relajante] → ${ruta} (${((hastaSeg - desdeSeg) / 60).toFixed(1)} min)`);
  };
  if (opciones.previewAudio) escribir(opciones.previewAudio, paso - 18, paso + 12); // 30 s: final de la escena 1 + cruce + escena 2
  if (!opciones.sinAudio) escribir(path.join(RAIZ, 'public/audio/generado', `${g.id}.wav`), 0, total);

  const rutaProps = path.join(RAIZ, 'salida/trabajo', `${g.id}.props.json`);
  fs.mkdirSync(path.dirname(rutaProps), { recursive: true });
  fs.writeFileSync(rutaProps, JSON.stringify({ ...g, duracionFrames }, null, 2));
  console.log(`[relajante] ${g.id}: ${mmss(total)} (${duracionFrames} frames) · capítulos: ${capitulos.map((c) => `${mmss(c.seg)} ${c.titulo}`).join(' | ')}`);
  return plan;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('Uso: npx tsx scripts/preparar-largo-relajante.mts contenido/largos/<id>.json [--preview-audio x.wav] [--sin-audio]'); process.exit(2); }
  const i = process.argv.indexOf('--preview-audio');
  prepararRelajante(leerGuion(path.resolve(ruta)), { previewAudio: i > 0 ? path.resolve(process.argv[i + 1]) : undefined, sinAudio: process.argv.includes('--sin-audio') });
}
