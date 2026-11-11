/**
 * Diseño sonoro de la plantilla `carrera` (v2, 2026-11-09). Todo sintetizado en Node, sin muestras:
 * sale de los MISMOS eventos de la simulación, así que cada sonido cae en el frame de su choque.
 *
 * Capas (bus de efectos + bus de música, masterizados juntos con `masterizar`):
 *  - "¡Ya!" en el frame 0.
 *  - Clavija: marimba afinada en Do pentatónica según la ALTURA de la clavija (cada ~11 filas la escala
 *    vuelve a empezar arriba): al caer se oyen cascadas descendentes que suenan musicales aunque el orden sea azar.
 *  - Bloque: golpe grave (más grave cuanto más vida le queda) + crujido de piedra.
 *  - Bloque roto: explosión brillante (boom + ruido agudo + destellos de campanita).
 *  - Tubo: "fiuuu" continuo mientras la bola va dentro: el tono sigue la velocidad y sube cuando la bola sube
 *    en un rizo y baja cuando cae (con un doppler leve por la velocidad horizontal); "chup" al entrar, "pop" al salir.
 *  - Cama musical a 110 bpm: bajo (Do–La–Fa–Sol) + bombo + hi-hat suave; en el último tramo entra caja,
 *    hi-hat en semicorcheas y el bajo sube. Se corta con el golpe grave de la cámara lenta.
 *  - Riser (la líder en el último 15 %) y fanfarria de metales sintéticos + platillo al cruzar.
 *  - Prop `musica` (2026-11-10): la cama genérica se reemplaza por una canción de `contenido/partituras/` (piano suave +
 *    bajo/arpegio + percusión suave, scripts/lib/cama-cancion.mts) y los golpes de los choques bajan a la mitad.
 */
import { SR, barrido, escribirWav, golpe, masterizar, midiAHz, nota } from './wav.mjs';
import { leerPartituraCama, tocarCama } from './cama-cancion.mjs';
import type { SimulacionCarrera } from '../../src/plantillas/carrera/tipos';

/** Do mayor pentatónica, dos octavas y algo (de agudo a grave según baja la clavija). */
const PENTA = [88, 86, 84, 81, 79, 76, 74, 72, 69, 67, 64];
const FILA = 165;
const BPM = 110;

/** Ruido determinista (LCG) para crujidos y platillos. */
const ruido = (semilla: number) => {
  let s = semilla >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; };
};

/** Bombo: seno que cae de 150 a 45 Hz en 0,16 s con clic de ataque. */
const bombo = (p: Float32Array, t: number, vol: number) => {
  barrido(p, t, 150, 45, 0.16, vol, 'seno');
  golpe(p, t, { duracion: 0.008, volumen: vol * 0.4, tono: 0.6, semilla: Math.floor(t * 1000) });
};

/** Ruido "aclarado" (paso alto de 1 polo): hi-hat, chispas, platillo. */
const ruidoAgudo = (p: Float32Array, t: number, dur: number, vol: number, semilla: number, caida = 8) => {
  const az = ruido(semilla);
  const desde = Math.floor(t * SR), total = Math.floor(dur * SR);
  let prev = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0) continue;
    if (idx >= p.length) break;
    const r = az();
    const hp = r - prev; prev = r * 0.85 + prev * 0.15;
    p[idx] += hp * Math.exp(-(i / total) * caida) * vol;
  }
};

/** Metal sintético: armónicos 1..7 con 1/n, ataque de 25 ms y vibrato leve (fanfarria). */
const metal = (p: Float32Array, t: number, hz: number, dur: number, vol: number) => {
  const desde = Math.floor(t * SR), total = Math.floor((dur + 0.25) * SR);
  let fase = 0;
  for (let i = 0; i < total; i++) {
    const idx = desde + i;
    if (idx < 0) continue;
    if (idx >= p.length) break;
    const s = i / SR;
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * s) * Math.min(1, s / 0.2);
    fase += (hz * vib) / SR;
    let v = 0;
    // El brillo se abre con el ataque (como un metal que "sopla").
    const brillo = Math.min(1, s / 0.06);
    for (let k = 1; k <= 7; k++) v += Math.sin(2 * Math.PI * fase * k) / k * (k === 1 ? 1 : brillo * Math.exp(-(k - 1) * 0.25));
    const env = s < 0.025 ? s / 0.025 : s < dur ? 1 - 0.25 * ((s - 0.025) / Math.max(0.01, dur)) : 0.75 * Math.max(0, 1 - (s - dur) / 0.25);
    p[idx] += v * 0.45 * env * vol;
  }
};

export const sintetizarCarrera = (sim: SimulacionCarrera, ruta: string, musica?: string) => {
  /** Con canción de fondo los choques suenan más bajos (se oyen encima sin tapar la melodía). */
  const kGolpe = musica ? 0.5 : 1;
  const segundos = (sim.duracionFrames + 72) / sim.fps + 0.8;
  const largo = Math.ceil(segundos * SR);
  const L = new Float32Array(largo), R = new Float32Array(largo);
  const mL = new Float32Array(largo), mR = new Float32Array(largo); // bus de música
  const pan = (x: number) => {
    const q = 0.15 + 0.7 * Math.max(0, Math.min(1, x / sim.tablero.ancho)); // paneo moderado (en celular suena centrado igual)
    return { l: Math.cos(q * Math.PI / 2), r: Math.sin(q * Math.PI / 2) };
  };
  const tmp = new Float32Array(Math.ceil(1.6 * SR));
  /** Renderiza un sonido corto en `tmp` y lo mezcla con paneo. */
  const colocar = (inicio: number, x: number, dibujar: (p: Float32Array) => void, largoSeg = 0.6) => {
    const vista = tmp.subarray(0, Math.ceil(largoSeg * SR));
    vista.fill(0);
    dibujar(vista);
    const { l, r } = pan(x);
    const desde = Math.floor(inicio * SR);
    for (let i = 0; i < vista.length; i++) {
      const idx = desde + i;
      if (idx < 0) continue;
      if (idx >= L.length) break;
      L[idx] += vista[i] * l * kGolpe; R[idx] += vista[i] * r * kGolpe;
    }
  };
  const xDe = (bola: number, frame: number) => sim.posiciones[bola][Math.max(0, Math.min(frame, sim.posiciones[bola].length - 1))][0];
  const tMeta = sim.frameGanadora / sim.fps;
  const tLenta = sim.camaraLenta.desde / sim.fps;

  // ---- "¡Ya!" ----
  for (const [k, midi] of [76, 83].entries()) {
    for (const p of [L, R]) nota(p, { inicio: k * 0.07, hz: midiAHz(midi), duracion: 0.12, volumen: 0.3, timbre: 'triangulo', caida: 0.05, liberacion: 0.08 });
  }
  golpe(L, 0, { duracion: 0.05, volumen: 0.2, tono: 0.3, semilla: 3 });
  golpe(R, 0, { duracion: 0.05, volumen: 0.2, tono: 0.3, semilla: 4 });

  // ---- Choques ----
  const tiemposGolpe: number[] = [];
  for (const ev of sim.eventos) {
    const t = ev.frame / sim.fps;
    const x = xDe(ev.bola, ev.frame);
    const f = ev.fuerza ?? 0.5;
    if (ev.tipo === 'clavija' || ev.tipo === 'rampa') {
      // Máx. 14 golpes/s en total (ventana deslizante): con 6 bolas no se vuelve granizo.
      while (tiemposGolpe.length && tiemposGolpe[0] < t - 1) tiemposGolpe.shift();
      if (tiemposGolpe.length >= 14) continue;
      tiemposGolpe.push(t);
      if (ev.tipo === 'clavija' && ev.clavija !== undefined) {
        const y = sim.clavijas[ev.clavija].y;
        const fila = Math.round((y - 840) / FILA);
        const midi = PENTA[((fila % PENTA.length) + PENTA.length) % PENTA.length];
        colocar(t, x, (p) => {
          // Marimba: fundamental + 4.º parcial que se apaga muy rápido + clic de baqueta.
          nota(p, { inicio: 0, hz: midiAHz(midi), duracion: 0.05, volumen: 0.26 * (0.5 + 0.5 * f), timbre: 'pluck', caida: 0.03, liberacion: 0.16 });
          nota(p, { inicio: 0, hz: midiAHz(midi) * 4, duracion: 0.01, volumen: 0.05 * (0.5 + 0.5 * f), timbre: 'seno', caida: 0.01, liberacion: 0.03 });
          golpe(p, 0, { duracion: 0.012, volumen: 0.07 * (0.5 + 0.5 * f), tono: 0.8, semilla: ev.frame + ev.bola });
        }, 0.4);
      } else {
        colocar(t, x, (p) => {
          nota(p, { inicio: 0, hz: midiAHz(55), duracion: 0.06, volumen: 0.22 * (0.5 + 0.5 * f), timbre: 'triangulo', caida: 0.04, liberacion: 0.12 });
          golpe(p, 0, { duracion: 0.04, volumen: 0.12, tono: 0.4, semilla: ev.frame * 3 + ev.bola });
        }, 0.4);
      }
    } else if (ev.tipo === 'bola') {
      colocar(t, x, (p) => {
        nota(p, { inicio: 0, hz: ev.hz!, duracion: 0.07, volumen: 0.22 * (0.6 + 0.4 * f), timbre: 'triangulo', caida: 0.04, liberacion: 0.1 });
        golpe(p, 0, { duracion: 0.03, volumen: 0.12, tono: 0.35, semilla: ev.frame * 7 + ev.bola });
      }, 0.4);
    } else if (ev.tipo === 'bloque') {
      const queda = ev.vida ?? 0;
      if (queda === 0) continue; // el golpe final lo cubre la explosión
      colocar(t, x, (p) => {
        // Golpe grave: más vida restante = más grave y pesado.
        const hz0 = [0, 150, 120, 95][Math.min(3, queda)];
        barrido(p, 0, hz0, hz0 * 0.45, 0.14, 0.42 * (0.6 + 0.4 * f), 'seno');
        golpe(p, 0, { duracion: 0.05, volumen: 0.22, tono: 0.25, semilla: ev.frame * 11 + 1 });
        // Crujido: 7 chasquidos cortos de ruido brillante en 90 ms.
        const az = ruido(ev.frame * 13 + ev.bola);
        for (let k = 0; k < 7; k++) {
          const tk = 0.008 + k * 0.012 + (az() + 1) * 0.004;
          ruidoAgudo(p, tk, 0.006 + (az() + 1) * 0.004, 0.16 * (1 - k / 9), ev.frame * 17 + k, 5);
        }
      }, 0.5);
    } else if (ev.tipo === 'rompe') {
      colocar(t, x, (p) => {
        barrido(p, 0, 110, 32, 0.45, 0.5, 'seno');                       // boom
        ruidoAgudo(p, 0, 0.32, 0.32, ev.frame * 19 + 5, 6);               // estallido brillante
        golpe(p, 0, { duracion: 0.12, volumen: 0.3, tono: 0.5, semilla: ev.frame * 23 });
        for (const [k, midi] of [96, 91, 100, 93, 103].entries()) {       // destellos (campanitas)
          nota(p, { inicio: 0.03 + k * 0.035, hz: midiAHz(midi), duracion: 0.03, volumen: 0.09, timbre: 'seno', caida: 0.02, liberacion: 0.22 });
        }
      }, 0.9);
    } else if (ev.tipo === 'tubo') {
      colocar(t, x, (p) => { barrido(p, 0, 260, 900, 0.12, 0.2, 'seno'); golpe(p, 0, { duracion: 0.03, volumen: 0.1, tono: 0.6, semilla: ev.frame }); }, 0.3);
    } else if (ev.tipo === 'tuboSale') {
      colocar(t, x, (p) => { barrido(p, 0, 900, 300, 0.1, 0.18, 'seno'); nota(p, { inicio: 0, hz: midiAHz(79), duracion: 0.04, volumen: 0.14, timbre: 'pluck', liberacion: 0.1 }); }, 0.3);
    }
  }

  // ---- Tubos: "fiuuu" continuo mientras la bola va dentro ----
  for (const tubo of sim.tubos ?? []) {
    for (const uso of tubo.usos) {
      const pos = sim.posiciones[uso.bola];
      const f0 = uso.desde, f1 = Math.min(uso.hasta, pos.length - 2);
      if (f1 <= f0) continue;
      // Por frame: tono (velocidad + dirección vertical + doppler horizontal) y volumen (velocidad).
      const hzF: number[] = [], volF: number[] = [], xF: number[] = [];
      for (let f = f0; f <= f1 + 1; f++) {
        const a = pos[Math.max(0, f - 1)], b = pos[Math.min(pos.length - 1, f + 1)];
        const vx = (b[0] - a[0]) * sim.fps / 2, vy = (b[1] - a[1]) * sim.fps / 2;
        const v = Math.hypot(vx, vy);
        hzF.push((260 + 0.32 * v) * Math.pow(2, -vy / 1400) * (1 + vx / 6000));
        volF.push(Math.min(1, 0.35 + v / 1600));
        xF.push(b[0]);
      }
      const desde = Math.floor((f0 / sim.fps) * SR), total = Math.floor(((f1 - f0 + 1) / sim.fps) * SR);
      const az = ruido(f0 * 31 + uso.bola);
      let fase = 0, lp = 0, bp = 0;
      for (let i = 0; i < total; i++) {
        const idx = desde + i;
        if (idx >= L.length) break;
        const u = (i / SR) * sim.fps, k = Math.floor(u), w = u - k;
        const hz = hzF[k] + (hzF[k + 1] - hzF[k]) * w;
        const vol = volF[k] + (volF[k + 1] - volF[k]) * w;
        fase += hz / SR;
        // Silbido (seno + 2.º armónico débil) + viento (ruido filtrado que sigue al tono).
        const tono = Math.sin(2 * Math.PI * fase) + 0.2 * Math.sin(4 * Math.PI * fase);
        const c = Math.min(0.5, (hz * 2.5) / SR * 6);
        lp += c * (az() - lp); bp += c * (lp - bp);
        const viento = (lp - bp) * 3;
        const s = i / SR, resto = total / SR - s;
        const env = Math.min(1, s / 0.08) * Math.min(1, resto / 0.12);
        const v = (tono * 0.11 + viento * 0.12) * vol * env;
        const { l, r } = pan(xF[k]);
        L[idx] += v * l; R[idx] += v * r;
      }
    }
  }

  // ---- Cama musical: la canción de `musica` o la genérica a 110 bpm ----
  const pulso = 60 / BPM;
  const tFin = tLenta; // se corta con el golpe grave de la cámara lenta
  if (musica) tocarCama([mL, mR], leerPartituraCama(musica), { desde: 0.12, hasta: tFin, volumen: 1 });
  else {
  const tIntenso = Math.max(4, Math.min(sim.frameRiser >= 0 ? sim.frameRiser / sim.fps : Infinity, tMeta - 8));
  const intensidad = (t: number) => Math.max(0, Math.min(1, (t - (tIntenso - 1)) / 1));
  const raices = [36, 33, 29, 31]; // Do · La · Fa · Sol (bajo)
  const patron = [1, 0, 0.7, 1, 0, 0.8, 0.6, 0]; // corcheas del bajo
  const entrada = (t: number) => Math.min(1, t / 1.2); // la cama entra suave bajo el "¡ya!"
  for (let c = 0; c * 8 * pulso / 2 < tFin; c++) {
    const raiz = raices[c % 4];
    for (let k = 0; k < 8; k++) {
      const t = (c * 8 + k) * (pulso / 2);
      if (t >= tFin - 0.05) break;
      const I = intensidad(t), E = entrada(t);
      // Bajo: pluck grave con octava en los contratiempos.
      if (patron[k] > 0) {
        const midi = raiz + (k === 3 || k === 6 ? 12 : 0);
        for (const p of [mL, mR]) {
          nota(p, { inicio: t, hz: midiAHz(midi), duracion: pulso * 0.42, volumen: (0.2 + 0.08 * I) * patron[k] * E, timbre: 'triangulo', ataque: 0.004, caida: 0.06, sostenido: 0.5, liberacion: 0.06 });
          nota(p, { inicio: t, hz: midiAHz(midi - 12), duracion: pulso * 0.4, volumen: 0.12 * patron[k] * E, timbre: 'seno', ataque: 0.004, caida: 0.08, sostenido: 0.6, liberacion: 0.06 });
        }
      }
      // Bombo en 1 y 3 (en el tramo intenso, en los 4 tiempos).
      if (k % 4 === 0 || (I > 0.5 && k % 2 === 0)) { bombo(mL, t, 0.3 * E); bombo(mR, t, 0.3 * E); }
      // Caja en 2 y 4 solo en el tramo intenso.
      if (I > 0 && (k === 2 || k === 6)) {
        for (const [p, sem] of [[mL, 1], [mR, 2]] as const) {
          ruidoAgudo(p, t, 0.14, 0.17 * I, c * 97 + k * 7 + sem, 7);
          nota(p, { inicio: t, hz: 190, duracion: 0.03, volumen: 0.1 * I, timbre: 'triangulo', caida: 0.03, liberacion: 0.05 });
        }
      }
      // Hi-hat en corcheas (y semicorcheas en el tramo intenso).
      const hat = (tt: number, v: number) => { ruidoAgudo(mL, tt, 0.03, v, Math.floor(tt * 997), 9); ruidoAgudo(mR, tt + 0.002, 0.03, v, Math.floor(tt * 991), 9); };
      hat(t, (k % 2 === 1 ? 0.06 : 0.035) * E);
      if (I > 0.3) hat(t + pulso / 4, 0.04 * I);
    }
  }

  }

  // ---- Riser: la líder entra al último 15 % del tablero ----
  if (sim.frameRiser >= 0) {
    const t0 = sim.frameRiser / sim.fps;
    const dur = Math.max(0.8, Math.min(5, tMeta - t0));
    for (const [p, d] of [[L, 0], [R, 0.01]] as const) {
      barrido(p, t0 + d, 160, 1400, dur, 0.13, 'triangulo');
      barrido(p, t0 + d, 800, 3200, dur, 0.035, 'sierra');
    }
  }

  // ---- Golpe grave al entrar en cámara lenta: el tiempo "se estira" ----
  for (const p of [L, R]) barrido(p, tLenta, 320, 60, 0.6, 0.3, 'seno');

  // ---- Fanfarria de metales + platillo al cruzar la ganadora ----
  const pm = pan(xDe(sim.ganadora, sim.frameGanadora));
  for (const [k, midi] of [67, 72, 76].entries()) {
    for (const p of [L, R]) metal(p, tMeta + k * 0.1, midiAHz(midi), 0.09, 0.32);
  }
  for (const midi of [72, 76, 79, 84]) for (const p of [L, R]) metal(p, tMeta + 0.32, midiAHz(midi), 0.95, 0.16);
  for (const p of [L, R]) {
    bombo(p, tMeta, 0.45);
    bombo(p, tMeta + 0.32, 0.4);
  }
  ruidoAgudo(L, tMeta + 0.32, 1.4, 0.16 + 0.05 * pm.l, 4242, 4);
  ruidoAgudo(R, tMeta + 0.322, 1.4, 0.16 + 0.05 * pm.r, 4343, 4);
  // Destellos de campanita sobre el acorde.
  for (const [k, midi] of [88, 91, 96].entries()) {
    for (const p of [L, R]) nota(p, { inicio: tMeta + 0.4 + k * 0.08, hz: midiAHz(midi), duracion: 0.05, volumen: 0.07, timbre: 'seno', liberacion: 0.4 });
  }

  // ---- Mezcla y master ----
  // Música ≈ 6 dB bajo los efectos: se siente el pulso sin tapar los golpes.
  // Con canción de fondo la música va al frente (los choques ya bajaron a la mitad).
  const kMusica = musica ? 1 : 0.5;
  for (let i = 0; i < largo; i++) { L[i] += mL[i] * kMusica; R[i] += mR[i] * kMusica; }
  masterizar([L, R], { rmsDb: -15, techoDb: -2.2 });
  escribirWav(ruta, [L, R]);
};
