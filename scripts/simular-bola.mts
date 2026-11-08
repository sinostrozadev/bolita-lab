/**
 * Simulación determinista de la plantilla "bola" + síntesis de su audio.
 *
 *   npx tsx scripts/simular-bola.mts contenido/guiones/<guion>.json
 *
 * Física en Node con paso fijo (60 fps, 10 sub-pasos de 1/600 s). Escribe
 *   public/sim/<id>.json            (posiciones por frame + eventos)
 *   public/audio/generado/<id>.wav  (una nota de la melodía por rebote, golpes, riser)
 * Mismo guion → mismo sim → mismo audio → mismo video.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAzar, semillaDesde } from '../src/lib/azar';
import { NEONES, FORMATO } from '../src/marca/tokens';
import { GuionBola, type SimBola, type EventoSim } from '../src/plantillas/bola/guion';
import { crearPista, escribirWav, golpe, barrido, midiAHz, nota, normalizar, MELODIAS, SR } from './lib/wav.mjs';

// ---------- Constantes de la escena ----------
const FPS = FORMATO.fps;
const SUBPASOS = 10;
const DT = 1 / (FPS * SUBPASOS);
const CX = FORMATO.ancho / 2;
/** Anillo al ~92 % del ancho (borde exterior 2·(R+GROSOR/2) ≈ 992 px), centrado entre el bloque de texto
 * de arriba (≈ 280–440) y el de abajo (≈ 1470–1570). Antes: R 430 (80 % del ancho), CY 985. */
const CY = 958;
const R = 490;
const GROSOR = 12;
const GRAVEDAD = 5000; // px/s²
const RESTITUCION = 1.01;
const VMAX = 2400; // px/s: tope de energía; así la bola no llega siempre arriba y el hueco tiene que girar hasta ella
/** Cuadros tras el clímax: 150 de final + 72 de cierre. */
const FRAMES_FINAL = 150;
const FRAMES_CIERRE = 72;
const FRAMES_CAMARA_LENTA = 30; // 0,5 s
/** Un rebote solo cuenta (nota, color, contador) si la velocidad normal supera esto (px/s)... */
const VMIN_REBOTE = 260;
/** ...y si pasaron al menos 40 ms desde el anterior de la misma bola: así no hay "micro-rebotes" pegados a la pared. */
const DEDUP_REBOTE = 0.04;
/** Modo crecer: termina cuando la bola ocupa esta fracción del radio; el componente remata llenando la pantalla. */
const LLENO_FRACCION = 0.86;
/** Modo crecer: a medida que la bola crece pierde velocidad máxima, para que el ritmo no se vuelva metralleta. */
const VMAX_CRECER_MIN = 650;
const ESCALA_CAMARA_LENTA = 0.12;
/** Ventana aceptable del clímax (s). */
const CLIMAX_MIN = 25;
const CLIMAX_MAX = 46;
/** Si no escapa a los 55 s, el hueco se empieza a abrir. */
const ABRIR_HUECO_DESDE = 52;
/** Bola inicial: ≥ 8 % del alto del video (diámetro ≈ 156 px). Antes 32–34 px de radio (3 %). */
const RADIO_INICIAL = 78;
/** Escape: radio máximo y ancho mínimo del hueco para que la bola grande quepa (cuerda ≥ 1,15 × diámetro). */
const RADIO_MAX_ESCAPE = 100;
const ANCHO_HUECO_MIN = 30;
/** Arranque: la bola parte ya cayendo rápido, a esta distancia de la pared de abajo → 1.er rebote ≈ 0,12 s. */
const ARRANQUE_DIST = 250;
const ARRANQUE_VY = 1900;
/** Cold open: 0,4 s del final (ya saturado de trazas) antes del corte seco al inicio. */
export const COLD_OPEN_FRAMES = Math.round(0.4 * FPS);

type Bola = {
  x: number; y: number; vx: number; vy: number; r: number; color: number; dentro: boolean;
  ultimoRebote: number; // segundos de video del último rebote contado
};

type Parametros = {
  semilla: number;
  modo: 'escape' | 'crecer';
  bolas: number;
  velocidadHueco: number; // °/s
  anchoHueco: number; // °
  crecimiento: number; // px por rebote
  radioInicial: number;
  radioMax: number;
};

const rad = (g: number) => (g * Math.PI) / 180;
const grados = (r: number) => (r * 180) / Math.PI;
const difAngular = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};
let vmaxDe: (b: Bola) => number = () => VMAX;
const limitarVelocidad = (b: Bola) => {
  const v = Math.hypot(b.vx, b.vy);
  const tope = vmaxDe(b);
  if (v > tope) { b.vx *= tope / v; b.vy *= tope / v; }
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Corre una simulación completa con parámetros fijos. Devuelve el sim (sin id) y el frame del clímax o -1. */
const simular = (p: Parametros) => {
  const azar = crearAzar(p.semilla);
  vmaxDe = p.modo === 'crecer'
    ? (b) => VMAX_CRECER_MIN + (VMAX - VMAX_CRECER_MIN) * Math.max(0, Math.min(1, (R - b.r) / (R - p.radioInicial)))
    : () => VMAX;
  const bolas: Bola[] = [];
  // Arranque en caída rápida (nada de bola quieta): cerca del fondo y bajando a ~1.900–2.200 px/s,
  // así el 1.er rebote y la 1.ª nota llegan en ≤ 0,2 s tras el cold open. Separadas > 2 radios.
  for (let i = 0; i < p.bolas; i++) {
    bolas.push({
      x: CX + (i - (p.bolas - 1) / 2) * (2 * p.radioInicial + 40) + (azar() - 0.5) * 30,
      y: CY + (R - p.radioInicial) - ARRANQUE_DIST - i * 40,
      vx: (azar() - 0.5) * 500,
      vy: ARRANQUE_VY + azar() * 300,
      r: p.radioInicial,
      color: (i * 2 + Math.floor(azar() * NEONES.length)) % NEONES.length,
      dentro: true,
      ultimoRebote: -99,
    });
  }
  // El hueco arranca arriba, un poco "antes" en el sentido de giro, para que tarde en llegar a la zona de rebotes.
  const hueco0 = -90 - Math.sign(p.velocidadHueco || 1) * (10 + azar() * 30);
  const conHueco = p.modo === 'escape';
  const areaAnillo = Math.PI * R * R;
  const umbralArea = p.bolas === 1 ? 1 : p.bolas === 2 ? 0.42 : 0.5;

  const cuadros: number[][] = [];
  const hueco: number[] = [];
  const huecoSemi: number[] = [];
  const eventos: EventoSim[] = [];
  const ultimoChoque = new Map<string, number>();
  let climaxFrame = -1;
  let rebotes = 0;
  let frame = 0;
  const maxFrames = 70 * FPS;

  /** Registra un rebote si es "de verdad": velocidad normal suficiente y sin otro de la misma bola hace < 40 ms. */
  const registrarRebote = (b: Bola, idx: number, nx: number, ny: number, t: number, vn: number) => {
    if (Math.abs(vn) < VMIN_REBOTE || t - b.ultimoRebote < DEDUP_REBOTE) return;
    const fuerza = Math.abs(vn) / VMAX + 0.3;
    // Tras el clímax los colores se congelan: así la ganadora se distingue de las que quedan dentro.
    if (climaxFrame < 0) {
      b.color = (b.color + 1) % NEONES.length;
      b.r = Math.min(p.radioMax, b.r + p.crecimiento);
      rebotes++;
    }
    eventos.push({ frame, t, tipo: 'rebote', bola: idx, x: r1(b.x + nx * b.r), y: r1(b.y + ny * b.r), ang: r1(grados(Math.atan2(-ny, -nx))), color: b.color, fuerza: r1(Math.min(1, fuerza)) });
    b.ultimoRebote = t;
  };

  while (frame < maxFrames) {
    const camaraLenta = climaxFrame >= 0 && p.modo === 'escape' && frame > climaxFrame && frame <= climaxFrame + FRAMES_CAMARA_LENTA;
    const dt = camaraLenta ? DT * ESCALA_CAMARA_LENTA : DT;
    const segVideo = frame / FPS;
    // El hueco gira con el tiempo de video (sigue girando lento durante la cámara lenta).
    const anguloHueco = hueco0 + p.velocidadHueco * segVideo;
    const extra = climaxFrame < 0 && segVideo > ABRIR_HUECO_DESDE ? (segVideo - ABRIR_HUECO_DESDE) * 25 : 0;
    const semi = rad(p.anchoHueco / 2 + extra);
    const hRad = rad(anguloHueco);
    const congelado = climaxFrame >= 0 && p.modo === 'crecer';

    for (let s = 0; s < SUBPASOS && !congelado; s++) {
      const t = segVideo + s / (FPS * SUBPASOS);
      // Integración
      for (const b of bolas) {
        b.vy += GRAVEDAD * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      // Pared del anillo
      bolas.forEach((b, idx) => {
        const dx = b.x - CX, dy = b.y - CY;
        const d = Math.hypot(dx, dy) || 1e-6;
        const nx = dx / d, ny = dy / d; // normal hacia fuera
        if (b.dentro) {
          if (d + b.r <= R) return;
          const ang = Math.atan2(dy, dx);
          if (conHueco) {
            const dif = Math.abs(difAngular(ang, hRad));
            if (dif < semi) {
              // Dentro del hueco: ¿choca con un borde?
              let choco = false;
              for (const signo of [-1, 1]) {
                const ea = hRad + signo * semi;
                const ex = CX + R * Math.cos(ea), ey = CY + R * Math.sin(ea);
                const ddx = b.x - ex, ddy = b.y - ey;
                const dd = Math.hypot(ddx, ddy);
                if (dd < b.r && dd > 0) {
                  const px = ddx / dd, py = ddy / dd;
                  const vn = b.vx * px + b.vy * py;
                  if (vn < 0) { b.vx -= (1 + RESTITUCION) * vn * px; b.vy -= (1 + RESTITUCION) * vn * py; }
                  b.x = ex + px * b.r; b.y = ey + py * b.r;
                  limitarVelocidad(b);
                  registrarRebote(b, idx, -px, -py, t, vn);
                  choco = true;
                }
              }
              if (!choco && d - b.r > R + 4) {
                b.dentro = false;
                if (climaxFrame < 0) {
                  climaxFrame = frame;
                  eventos.push({ frame, t, tipo: 'escape', bola: idx, x: r1(b.x), y: r1(b.y), ang: r1(grados(ang)), color: b.color, fuerza: 1 });
                }
              }
              return;
            }
          }
          const vn = b.vx * nx + b.vy * ny;
          if (vn > 0) { b.vx -= (1 + RESTITUCION) * vn * nx; b.vy -= (1 + RESTITUCION) * vn * ny; }
          limitarVelocidad(b);
          registrarRebote(b, idx, nx, ny, t, vn);
          b.x = CX + nx * (R - b.r); b.y = CY + ny * (R - b.r);
        } else {
          // Fuera del anillo: rebota por fuera (con pérdida) si cae sobre él y no está en el hueco.
          if (d - b.r >= R + GROSOR) return;
          if (conHueco && Math.abs(difAngular(Math.atan2(dy, dx), hRad)) < semi) return;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vy -= 1.5 * vn * ny; b.vx *= 0.9; b.vy *= 0.9; }
          b.x = CX + nx * (R + GROSOR + b.r); b.y = CY + ny * (R + GROSOR + b.r);
        }
      });
      // Choques entre bolas
      for (let i = 0; i < bolas.length; i++) for (let j = i + 1; j < bolas.length; j++) {
        const a = bolas[i], b = bolas[j];
        if (!a.dentro || !b.dentro) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.r + b.r;
        if (d >= minD || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const ma = a.r * a.r, mb = b.r * b.r;
        const sobra = minD - d;
        a.x -= nx * sobra * (mb / (ma + mb)); a.y -= ny * sobra * (mb / (ma + mb));
        b.x += nx * sobra * (ma / (ma + mb)); b.y += ny * sobra * (ma / (ma + mb));
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (vn <= 0) continue; // ya se separan
        const jImp = (1 + 1.0) * vn / (1 / ma + 1 / mb);
        a.vx -= (jImp / ma) * nx; a.vy -= (jImp / ma) * ny;
        b.vx += (jImp / mb) * nx; b.vy += (jImp / mb) * ny;
        limitarVelocidad(a); limitarVelocidad(b);
        const clave = `${i}-${j}`;
        if (vn > 120 && frame - (ultimoChoque.get(clave) ?? -99) > 4 && climaxFrame < 0) {
          ultimoChoque.set(clave, frame);
          eventos.push({ frame, t, tipo: 'choque', bola: a.r >= b.r ? i : j, x: r1(a.x + nx * a.r), y: r1(a.y + ny * a.r), ang: r1(grados(Math.atan2(ny, nx))), color: a.color, fuerza: r1(Math.min(1, vn / 1500)) });
        }
      }
      // Fin por llenado (modo crecer)
      if (p.modo === 'crecer' && climaxFrame < 0) {
        const area = bolas.reduce((acc, b) => acc + Math.PI * b.r * b.r, 0);
        const mayor = bolas.reduce((m, b) => (b.r > m.r ? b : m), bolas[0]);
        if (mayor.r >= R * LLENO_FRACCION || area / areaAnillo >= umbralArea) {
          climaxFrame = frame;
          const idx = bolas.indexOf(mayor);
          eventos.push({ frame, t, tipo: 'lleno', bola: idx, x: r1(mayor.x), y: r1(mayor.y), ang: 0, color: mayor.color, fuerza: 1 });
          break;
        }
      }
    }

    const fila: number[] = [];
    for (const b of bolas) fila.push(r1(b.x), r1(b.y), r1(b.r), b.color);
    cuadros.push(fila);
    hueco.push(conHueco ? r1(anguloHueco) : 0);
    huecoSemi.push(conHueco ? r1(grados(semi)) : 0);
    frame++;
    if (climaxFrame >= 0 && frame >= climaxFrame + FRAMES_FINAL + FRAMES_CIERRE) break;
  }
  // Relleno por si se cortó justo en el clímax (modo crecer): repetir el último cuadro.
  const duracionFrames = climaxFrame >= 0 ? climaxFrame + FRAMES_FINAL + FRAMES_CIERRE : cuadros.length;
  while (cuadros.length < duracionFrames) {
    cuadros.push([...cuadros[cuadros.length - 1]]);
    hueco.push(hueco[hueco.length - 1]);
    huecoSemi.push(huecoSemi[huecoSemi.length - 1]);
  }
  return { cuadros, hueco, huecoSemi, eventos, climaxFrame, rebotes, duracionFrames };
};

type Resultado = ReturnType<typeof simular>;

/**
 * Desde qué frame de la simulación se toma el cold open. Escape: los últimos 0,4 s antes de salir.
 * Crecer: cuando la bola mayor llega a ~2/3 del radio; más tarde la bola tapa sus propias trazas y el
 * "círculo lleno de color" no se ve (medido en el render de prueba del 2026-11-08).
 */
const desdeColdOpen = (res: Resultado, modo: 'escape' | 'crecer') => {
  const tope = Math.max(0, res.climaxFrame - COLD_OPEN_FRAMES);
  if (modo === 'escape') return tope;
  const umbral = R * 0.66;
  for (let k = 0; k < tope; k++) {
    const fila = res.cuadros[k];
    for (let i = 2; i < fila.length; i += 4) if (fila[i] >= umbral) return k;
  }
  return tope;
};

/** Busca parámetros (semilla derivada, giro del hueco, crecimiento) para que el clímax caiga en la ventana. */
export const buscarSimulacion = (props: GuionBola): { res: Resultado; p: Parametros } => {
  const base = props.semilla ?? semillaDesde(props.id);
  let mejor: { res: Resultado; p: Parametros; dist: number } | null = null;
  const evaluar = (p: Parametros) => {
    const res = simular(p);
    const seg = res.climaxFrame / FPS;
    const dist = res.climaxFrame < 0 ? 999 : seg < CLIMAX_MIN ? CLIMAX_MIN - seg : seg > CLIMAX_MAX ? seg - CLIMAX_MAX : 0;
    if (!mejor || dist < mejor.dist) mejor = { res, p, dist };
    if (process.env.BOLA_DEBUG) console.error(`  intento: semilla ${p.semilla} hueco ${p.velocidadHueco.toFixed(2)}°/s ×${p.anchoHueco.toFixed(0)}° crec ${p.crecimiento.toFixed(2)} → clímax ${seg.toFixed(1)} s (${res.rebotes} rebotes)`);
    return { res, seg, dist };
  };
  if (props.modo === 'escape') {
    let factorV = 1;
    let ancho = Math.max(ANCHO_HUECO_MIN, props.anchoHueco ?? 40);
    const velocidadBase = props.velocidadHueco ?? 7;
    for (let intento = 0; intento < 60; intento++) {
      const p: Parametros = {
        semilla: (base + intento * 7919) >>> 0, modo: 'escape', bolas: props.bolas,
        velocidadHueco: velocidadBase * factorV, anchoHueco: ancho,
        crecimiento: 0.5, radioInicial: RADIO_INICIAL, radioMax: RADIO_MAX_ESCAPE,
      };
      const { res, seg, dist } = evaluar(p);
      if (dist === 0) return { res, p };
      if (res.climaxFrame < 0 || seg > CLIMAX_MAX) factorV *= 1.18;
      else if (seg < CLIMAX_MIN) { factorV *= 0.86; if (intento % 3 === 2) ancho = Math.max(ANCHO_HUECO_MIN, ancho - 3); }
    }
  } else {
    // Bisección sobre el crecimiento por rebote; si el caos lo vuelve no monótono, probamos otras semillas.
    for (let semillaIdx = 0; semillaIdx < 8; semillaIdx++) {
      // El techo depende de la semilla: si no, la bisección acierta siempre al primer intento con el
      // mismo crecimiento y todos los videos de 1 bola terminan con el mismo número de rebotes.
      let lo = 0.3, hi = 14 + ((base >>> 3) % 1000) / 40;
      for (let i = 0; i < 16; i++) {
        const g = Math.sqrt(lo * hi);
        const p: Parametros = {
          semilla: (base + semillaIdx * 104729) >>> 0, modo: 'crecer', bolas: props.bolas,
          velocidadHueco: 0, anchoHueco: 0, crecimiento: g, radioInicial: RADIO_INICIAL, radioMax: R,
        };
        const { res, seg, dist } = evaluar(p);
        if (dist === 0) return { res, p };
        if (res.climaxFrame < 0 || seg > CLIMAX_MAX) lo = g; else hi = g;
      }
    }
  }
  if (!mejor) throw new Error('no se pudo simular');
  const m = mejor as { res: Resultado; p: Parametros; dist: number };
  if (m.res.climaxFrame < 0) throw new Error('la simulación nunca llegó al clímax');
  console.warn(`aviso: clímax fuera de la ventana ideal por ${m.dist.toFixed(1)} s; se usa la mejor simulación encontrada`);
  return { res: m.res, p: m.p };
};

// ---------- Audio ----------
export const sintetizar = (sim: SimBola, melodiaId: string, ruta: string) => {
  const melodia = MELODIAS[melodiaId];
  if (!melodia) throw new Error(`melodía desconocida: ${melodiaId}`);
  const notas = melodia.notas.filter(([m]) => m > 0);
  const pulso = 60 / melodia.bpm;
  // Todo el audio de la simulación va corrido por el cold open (el video lo antepone).
  const co = sim.coldOpenFrames ?? 0;
  const t0 = co / sim.fps;
  const total = (sim.duracionFrames + co) / sim.fps;
  const pista = crearPista(total + 0.5);
  const tClimax = t0 + sim.climaxFrame / sim.fps;
  const raiz = notas[0][0] - 12;

  // Cold open (0–0,4 s): sonido desde el frame 0. Acorde corto del clímax (adelanto de "así termina"),
  // barrido descendente de "rebobinar" y un golpe seco en el corte al inicio.
  if (co > 0) {
    for (const [semi, vol] of [[12, 0.32], [19, 0.24], [24, 0.2]] as const) {
      nota(pista, { inicio: 0, hz: midiAHz(raiz + semi), duracion: t0, volumen: vol, timbre: 'pluck', liberacion: 0.08 });
    }
    golpe(pista, 0, { duracion: 0.06, volumen: 0.3, tono: 0.3, semilla: 5 });
    barrido(pista, 0.04, 1800, 260, t0 - 0.04, 0.16, 'triangulo');
    golpe(pista, t0, { duracion: 0.05, volumen: 0.28, tono: 0.2, semilla: 11 });
  }

  // Cama: sub grave con batido lento, muy discreto.
  nota(pista, { inicio: 0, hz: 55, duracion: total, volumen: 0.05, timbre: 'seno', ataque: 1.5, caida: 0.1, sostenido: 1, liberacion: 1.5 });
  nota(pista, { inicio: 0, hz: 55.35, duracion: total, volumen: 0.04, timbre: 'seno', ataque: 1.5, caida: 0.1, sostenido: 1, liberacion: 1.5 });

  // Con varias bolas y mucho tráfico (> 6 rebotes/s) la melodía se amontona: solo la bola 0
  // la toca y el resto suena como golpes suaves. Con poco tráfico, todas tocan la melodía.
  const rebotesAntes = sim.eventos.filter((e) => e.tipo === 'rebote' && e.frame <= sim.climaxFrame);
  const tasa = rebotesAntes.length / Math.max(1, tClimax);
  const soloUna = sim.bolas > 1 && tasa > 6;
  let i = 0;
  let ultimaNota = -1;
  let semillaGolpe = 7;
  for (const e of sim.eventos) {
    if (e.tipo === 'rebote') {
      if (e.frame > sim.climaxFrame && sim.climaxFrame >= 0) continue; // tras el clímax, solo el final
      if (soloUna && e.bola !== 0) {
        semillaGolpe = (semillaGolpe * 31 + 7) >>> 0;
        golpe(pista, t0 + e.t, { duracion: 0.045, volumen: 0.07 + 0.06 * e.fuerza, tono: 0.35, semilla: semillaGolpe });
        continue;
      }
      if (e.t - ultimaNota < 0.07) continue; // anti-ametralladora: nunca dos notas a menos de 70 ms
      ultimaNota = e.t;
      const te = t0 + e.t;
      const [midi, pulsos] = notas[i % notas.length];
      i++;
      e.nota = midi;
      const dur = Math.min(0.6, Math.max(0.18, pulsos * pulso * 0.8));
      nota(pista, { inicio: te, hz: midiAHz(midi), duracion: dur, volumen: 0.45 * (0.8 + 0.2 * e.fuerza), timbre: 'pluck', liberacion: 0.15 });
    } else if (e.tipo === 'choque') {
      semillaGolpe = (semillaGolpe * 31 + 7) >>> 0;
      golpe(pista, t0 + e.t, { duracion: 0.07, volumen: 0.16 + 0.14 * e.fuerza, tono: 0.22, semilla: semillaGolpe });
    }
  }
  // Riser de 2 s que remata en el clímax.
  barrido(pista, Math.max(0, tClimax - 2), 110, 1400, 2, 0.16, 'triangulo');
  barrido(pista, Math.max(0, tClimax - 2), 55, 700, 2, 0.12, 'seno');
  // Clímax: acorde sobre la primera nota de la melodía + golpe.
  const climax = sim.eventos.find((e) => e.tipo === 'escape' || e.tipo === 'lleno');
  if (climax) {
    for (const [semi, vol] of [[0, 0.3], [7, 0.22], [12, 0.26], [19, 0.14]] as const) {
      nota(pista, { inicio: t0 + climax.t, hz: midiAHz(raiz + semi), duracion: 1.4, volumen: vol, timbre: 'triangulo', ataque: 0.01, caida: 0.3, sostenido: 0.5, liberacion: 0.9 });
    }
    golpe(pista, t0 + climax.t, { duracion: 0.25, volumen: 0.5, tono: 0.12, semilla: 99 });
    if (climax.tipo === 'lleno') nota(pista, { inicio: t0 + climax.t, hz: 45, duracion: 1.2, volumen: 0.35, timbre: 'seno', ataque: 0.02, caida: 0.2, sostenido: 0.8, liberacion: 0.8 });
    else barrido(pista, t0 + climax.t, 1600, 200, 0.6, 0.18, 'seno');
  }
  // Cierre: un "pling" suave cuando entra el cartel.
  const tCierre = t0 + (sim.duracionFrames - FRAMES_CIERRE) / sim.fps;
  nota(pista, { inicio: tCierre, hz: midiAHz(raiz + 24), duracion: 0.5, volumen: 0.22, timbre: 'pluck' });
  nota(pista, { inicio: tCierre + 0.08, hz: midiAHz(raiz + 31), duracion: 0.5, volumen: 0.18, timbre: 'pluck' });

  normalizar(pista, -1);
  // Fundido final de 0,3 s para no cortar en seco.
  const fin = Math.floor(total * SR);
  const fundido = Math.floor(0.3 * SR);
  for (let k = 0; k < pista.length; k++) {
    if (k > fin) pista[k] = 0;
    else if (k > fin - fundido) pista[k] *= (fin - k) / fundido;
  }
  escribirWav(ruta, [pista.subarray(0, fin)]);
};

// ---------- Orquestación ----------
export const leerProps = (rutaGuion: string): GuionBola => {
  const crudo = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
  const props = crudo.props ?? crudo;
  if (crudo.plantilla && crudo.plantilla !== 'bola') throw new Error(`el guion es de la plantilla "${crudo.plantilla}", no "bola"`);
  if (crudo.id && !props.id) props.id = crudo.id;
  return GuionBola.parse(props);
};

/** Simula y sintetiza; devuelve el sim escrito. */
export const simularYSintetizar = (props: GuionBola, raiz = process.cwd()): SimBola => {
  const { res, p } = buscarSimulacion(props);
  const sim: SimBola = {
    version: 1, id: props.id, fps: FPS, modo: props.modo, bolas: props.bolas,
    duracionFrames: res.duracionFrames, climaxFrame: res.climaxFrame, rebotesTotales: res.rebotes,
    anillo: { cx: CX, cy: CY, r: R, anchoHueco: p.anchoHueco, grosor: GROSOR },
    hueco: res.hueco, huecoSemi: res.huecoSemi, cuadros: res.cuadros, eventos: res.eventos,
    semillaUsada: p.semilla, velocidadHuecoUsada: p.velocidadHueco,
    coldOpenFrames: COLD_OPEN_FRAMES,
    coldOpenDesde: desdeColdOpen(res, props.modo),
  };
  const rutaWav = path.join(raiz, 'public/audio/generado', `${props.id}.wav`);
  sintetizar(sim, props.melodia, rutaWav); // también anota `nota` en los eventos
  const rutaSim = path.join(raiz, 'public/sim', `${props.id}.json`);
  fs.mkdirSync(path.dirname(rutaSim), { recursive: true });
  fs.writeFileSync(rutaSim, JSON.stringify(sim));
  const seg = ((sim.duracionFrames + COLD_OPEN_FRAMES) / FPS).toFixed(1);
  const primer = sim.eventos.find((e) => e.tipo === 'rebote');
  console.log(`sim ${props.id}: clímax a ${(sim.climaxFrame / FPS).toFixed(1)} s, ${sim.rebotesTotales} rebotes, ${sim.eventos.filter((e) => e.tipo === 'choque').length} choques, total ${seg} s · semilla ${p.semilla} · hueco ${p.velocidadHueco.toFixed(2)}°/s × ${p.anchoHueco}° · crecimiento ${p.crecimiento.toFixed(2)} px · 1.er rebote ${primer ? (primer.t * 1000).toFixed(0) : '—'} ms tras el cold open`);
  console.log(`  → ${path.relative(raiz, rutaSim)} (${(fs.statSync(rutaSim).size / 1024).toFixed(0)} KB), ${path.relative(raiz, rutaWav)}`);
  return sim;
};

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const ruta = process.argv[2];
  if (!ruta) { console.error('uso: npx tsx scripts/simular-bola.mts <guion.json>'); process.exit(2); }
  simularYSintetizar(leerProps(ruta));
}
