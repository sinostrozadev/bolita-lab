/**
 * Genera la identidad visual de Bolita Lab en `salida/marca/`:
 * logo.png, banner.png, intro.mp4 (+ intro.wav sintetizado), miniatura-compilacion.png y canal.md.
 * Uso: npx tsx scripts/marca.mts [logo] [banner] [intro] [miniatura] [canal]   (sin argumentos: todo)
 * Renderiza de a una pieza con --concurrency=1 (la máquina tiene poca RAM).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { crearPista, escribirWav, golpe, midiAHz, nota, normalizar, SR } from './lib/wav.mjs';
import { MARCA } from '../src/marca/tokens';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.join(RAIZ, 'salida/marca');
fs.mkdirSync(SALIDA, { recursive: true });
const remotion = (...args: string[]) => execFileSync('npx', ['remotion', ...args, '--concurrency=1'], { cwd: RAIZ, stdio: 'inherit' });

const piezas = new Set(process.argv.slice(2));
const toca = (p: string) => piezas.size === 0 || piezas.has(p);

// --- Audio de la intro: impactos en los frames 22, 46 y 60 (60 fps) → pluck, pluck y golpe suave.
const FPS = 60;
const impactos = [22, 46, 60].map((f) => f / FPS);
const pista = crearPista(1.5);
golpe(pista, impactos[0], { volumen: 0.5, tono: 0.35, duracion: 0.07, semilla: 3 });
nota(pista, { inicio: impactos[0], hz: midiAHz(72), duracion: 0.2, volumen: 0.6 });       // Do5
nota(pista, { inicio: impactos[1], hz: midiAHz(79), duracion: 0.25, volumen: 0.6 });      // Sol5
nota(pista, { inicio: impactos[1], hz: midiAHz(84), duracion: 0.3, volumen: 0.25, timbre: 'seno' });
golpe(pista, impactos[2], { volumen: 0.3, tono: 0.25, duracion: 0.09, semilla: 9 });
normalizar(pista, -1);
const rutaWav = path.join(RAIZ, 'public/audio/generado/intro.wav');
if (toca('intro')) {
  escribirWav(rutaWav, [pista, pista]);
  console.log(`[marca] audio → ${path.relative(RAIZ, rutaWav)} (${(pista.length / SR).toFixed(1)} s)`);
}

if (toca('logo')) remotion('still', 'src/index.ts', 'Logo', path.join(SALIDA, 'logo.png'));
if (toca('banner')) remotion('still', 'src/index.ts', 'Banner', path.join(SALIDA, 'banner.png'));
if (toca('intro')) remotion('render', 'src/index.ts', 'Intro', path.join(SALIDA, 'intro.mp4'), '--codec=h264', '--crf=18');
if (toca('miniatura')) {
  // Plantilla de miniatura para videos largos: cambia el título con --props.
  const props = JSON.stringify({ titulo: 'Los rebotes más satisfactorios de la semana' });
  remotion('still', 'src/index.ts', 'Miniatura', path.join(SALIDA, 'miniatura-compilacion.png'), `--props=${props}`);
}

const canal = `# Canal de YouTube — ${MARCA.nombre}

## Nombre
${MARCA.nombre}

## Handle
${MARCA.handle}

## Descripción (YouTube Studio → Personalización → Información básica)
Cosas que rebotan, chocan y explican. En Bolita Lab encuentras videos satisfying de física con bolitas de neón: carreras, rebotes, choques y sonidos que enganchan, además de datos curiosos animados que se entienden en segundos. Animación hecha con simulaciones reales, sin relleno. Shorts nuevos todos los días. Suscríbete y dinos en los comentarios quién gana la próxima carrera.

## Lemas (elige uno para firmar los videos)
1. Cosas que rebotan, chocan y explican.
2. Física que da gusto ver.
3. Una bolita, mil datos curiosos.

## Palabras clave del canal (YouTube Studio → Configuración → Canal → Información básica → Palabras clave)
satisfying, física, datos curiosos, animación, simulación, bolitas, carrera de bolitas, plinko, rebotes, sonidos satisfactorios, ASMR visual, shorts, curiosidades, ciencia, neón
`;
if (toca('canal')) fs.writeFileSync(path.join(SALIDA, 'canal.md'), canal);
console.log(`[marca] listo → ${path.relative(RAIZ, SALIDA)}`);
