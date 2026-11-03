/**
 * Utilidades compartidas de OPERACIÓN (bandeja, backlog, calendario, logs, procesos).
 * Las usan subir.mts, diario.mts, generar-guiones.mts, compilar.mts y estado.mts.
 * No toca nada de src/: solo lee/escribe JSON en contenido/ y salida/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// ---------------------------------------------------------------- rutas
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DIR_CONTENIDO = path.join(RAIZ, 'contenido');
export const DIR_BACKLOG = path.join(DIR_CONTENIDO, 'backlog');
export const DIR_GUIONES = path.join(DIR_CONTENIDO, 'guiones');
export const DIR_SALIDA = path.join(RAIZ, 'salida');
export const DIR_BANDEJA = path.join(DIR_SALIDA, 'bandeja');
export const DIR_TRABAJO = path.join(DIR_SALIDA, 'trabajo');
export const DIR_LOGS = path.join(DIR_SALIDA, 'logs');
export const DIR_MARCA = path.join(DIR_SALIDA, 'marca');
export const DIR_COMPILACIONES = path.join(DIR_SALIDA, 'compilaciones');
export const DIR_SECRETS = path.join(RAIZ, 'secrets');
export const ARCHIVO_CALENDARIO = path.join(DIR_CONTENIDO, 'calendario.json');
export const ARCHIVO_CLIENTE_YT = path.join(DIR_SECRETS, 'youtube-client.json');
export const ARCHIVO_TOKEN_YT = path.join(DIR_SECRETS, 'youtube-token.json');
const DIR_COMPOSITOR = path.join(RAIZ, 'node_modules', '@remotion', 'compositor-linux-x64-gnu');
const FFMPEG_REMOTION = path.join(DIR_COMPOSITOR, 'ffmpeg');
/**
 * ffmpeg para compilar.mts: $FFMPEG_BIN, luego `ffmpeg` del sistema, luego el de Remotion.
 * compilar.mts NO necesita filtros especiales (el de Remotion es mínimo: sin overlay/pad/boxblur);
 * la composición sobre el fondo desenfocado se hace en Node con frames crudos.
 */
export const FFMPEG = (() => {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  const sistema = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return sistema.status === 0 ? 'ffmpeg' : FFMPEG_REMOTION;
})();
export const FFPROBE = path.join(DIR_COMPOSITOR, 'ffprobe');

export const asegurarDirectorios = () => {
  for (const d of [DIR_BACKLOG, DIR_GUIONES, DIR_BANDEJA, DIR_TRABAJO, DIR_LOGS, DIR_COMPILACIONES]) {
    fs.mkdirSync(d, { recursive: true });
  }
};

// ---------------------------------------------------------------- tipos
export const PLANTILLAS = ['bola', 'dato', 'carrera'] as const;
export type Plantilla = (typeof PLANTILLAS)[number];

/** Guion: contrato con las plantillas (contenido/guiones/<id>.json o contenido/backlog/<plantilla>-<slug>.json). */
export const GuionSchema = z.object({
  plantilla: z.enum(PLANTILLAS),
  id: z.string().min(1),
  titulo: z.string().min(1),
  descripcion: z.string(),
  hashtags: z.array(z.string()),
  props: z.record(z.unknown()),
});
export type Guion = z.infer<typeof GuionSchema>;

export const ESTADOS = ['listo', 'subido', 'error'] as const;
export type Estado = (typeof ESTADOS)[number];

/** Entrada de la bandeja: salida/bandeja/<id>.json (o salida/compilaciones/<id>.json con tipo 'largo'). */
export const EntradaBandejaSchema = z.object({
  id: z.string().min(1),
  plantilla: z.string().min(1),
  titulo: z.string().min(1),
  descripcion: z.string().default(''),
  hashtags: z.array(z.string()).default([]),
  duracionSeg: z.number().nonnegative().default(0),
  estado: z.enum(ESTADOS),
  tipo: z.enum(['short', 'largo']).default('short'),
  videoId: z.string().optional(),
  publicarEn: z.string().optional(),
  subidoEn: z.string().optional(),
  error: z.string().optional(),
  /** Para compilaciones: ids de los Shorts incluidos. */
  videos: z.array(z.string()).optional(),
  /** Para compilaciones: ruta (absoluta o relativa a la raíz) de la miniatura a subir con thumbnails.set. */
  miniatura: z.string().optional(),
}).passthrough(); // conserva campos extra (p. ej. capitulos) al reescribir la entrada
export type EntradaBandeja = z.infer<typeof EntradaBandejaSchema>;

export type EntradaConRuta = EntradaBandeja & { rutaJson: string; rutaMp4: string; mp4Existe: boolean };

// ---------------------------------------------------------------- JSON
export const leerJson = <T = unknown,>(ruta: string): T => JSON.parse(fs.readFileSync(ruta, 'utf8')) as T;

export const escribirJson = (ruta: string, datos: unknown, modo?: number) => {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2) + '\n', modo === undefined ? undefined : { mode: modo });
  if (modo !== undefined) fs.chmodSync(ruta, modo);
};

export const leerGuion = (ruta: string): Guion => {
  const crudo = leerJson(ruta);
  const r = GuionSchema.safeParse(crudo);
  if (!r.success) {
    throw new Error(`Guion inválido en ${ruta}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return r.data;
};

const listarJson = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f)) : [];

/** Guiones del backlog (los inválidos se reportan y se saltan). */
export const leerBacklog = (): Array<Guion & { ruta: string }> => {
  const lista: Array<Guion & { ruta: string }> = [];
  for (const ruta of listarJson(DIR_BACKLOG)) {
    try {
      lista.push({ ...leerGuion(ruta), ruta });
    } catch (e) {
      console.error(`⚠ backlog: ${(e as Error).message}`);
    }
  }
  return lista;
};

/** Guiones ya promovidos (contenido/guiones). */
export const leerGuiones = (): Array<Guion & { ruta: string }> => {
  const lista: Array<Guion & { ruta: string }> = [];
  for (const ruta of listarJson(DIR_GUIONES)) {
    try {
      lista.push({ ...leerGuion(ruta), ruta });
    } catch (e) {
      console.error(`⚠ guiones: ${(e as Error).message}`);
    }
  }
  return lista;
};

/** Bandeja de videos (salida/bandeja). Incluye compilaciones si `conCompilaciones`. */
export const leerBandeja = (conCompilaciones = false): EntradaConRuta[] => {
  const dirs = conCompilaciones ? [DIR_BANDEJA, DIR_COMPILACIONES] : [DIR_BANDEJA];
  const lista: EntradaConRuta[] = [];
  for (const dir of dirs) {
    for (const rutaJson of listarJson(dir)) {
      const r = EntradaBandejaSchema.safeParse(leerJsonSeguro(rutaJson));
      if (!r.success) continue; // no es una entrada de bandeja (p. ej. props sueltos)
      const rutaMp4 = rutaJson.replace(/\.json$/, '.mp4');
      lista.push({ ...r.data, rutaJson, rutaMp4, mp4Existe: fs.existsSync(rutaMp4) });
    }
  }
  return lista.sort((a, b) => a.id.localeCompare(b.id));
};

const leerJsonSeguro = (ruta: string): unknown => {
  try {
    return leerJson(ruta);
  } catch {
    return null;
  }
};

export const guardarEntrada = (entrada: EntradaConRuta | (EntradaBandeja & { rutaJson: string })) => {
  const { rutaJson, ...resto } = entrada as EntradaConRuta;
  const limpio: Record<string, unknown> = { ...resto };
  delete limpio.rutaMp4;
  delete limpio.mp4Existe;
  escribirJson(rutaJson, limpio);
};

// ---------------------------------------------------------------- calendario
const RanuraSchema = z.object({ dias: z.array(z.number().int().min(0).max(6)), hora: z.string().regex(/^\d{2}:\d{2}$/) });
export type Ranura = z.infer<typeof RanuraSchema>;
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export const CalendarioSchema = z.object({
  zonaHoraria: z.string().default('America/Santiago'),
  /** Ranuras normales de Shorts (dias: 0=domingo … 6=sábado). */
  ranuras: z.array(RanuraSchema).min(1),
  /**
   * Hasta esta fecha local (AAAA-MM-DD, inclusive) se usan `ranurasDoble` en vez de `ranuras`:
   * las dos primeras semanas del canal van con 2 Shorts al día. null/ausente = sin fase doble.
   */
  dobleHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ranurasDoble: z.array(RanuraSchema).default([{ dias: TODOS_LOS_DIAS, hora: '12:00' }, { dias: TODOS_LOS_DIAS, hora: '18:00' }]),
  /** Ranura de los videos largos (compilaciones): no compiten con las de Shorts. */
  ranurasLargo: z.array(RanuraSchema).default([{ dias: [0], hora: '10:00' }]),
  rotacion: z.array(z.enum(PLANTILLAS)).min(1),
  minimoBandeja: z.number().int().positive().default(3),
  minimoBacklog: z.number().int().positive().default(6),
  /** Minutos mínimos entre "ahora" y la primera ranura ofrecida (YouTube exige futuro). */
  margenMinutos: z.number().int().nonnegative().default(20),
});
export type Calendario = z.infer<typeof CalendarioSchema>;

export const cargarCalendario = (): Calendario => {
  if (!fs.existsSync(ARCHIVO_CALENDARIO)) {
    return CalendarioSchema.parse({
      ranuras: [{ dias: TODOS_LOS_DIAS, hora: '18:00' }, { dias: [6, 0], hora: '12:00' }],
      rotacion: [...PLANTILLAS],
    });
  }
  return CalendarioSchema.parse(leerJson(ARCHIVO_CALENDARIO));
};

const DIAS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Campos de calendario de una fecha vistos desde una zona horaria. */
export const partesEnZona = (d: Date, zona: string) => {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    anio: +p.year, mes: +p.month, dia: +p.day,
    hora: +p.hour % 24, minuto: +p.minute, segundo: +p.second,
    diaSemana: DIAS_EN.indexOf(p.weekday),
  };
};

const desfaseMs = (d: Date, zona: string) => {
  const p = partesEnZona(d, zona);
  return Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(d.getTime() / 1000) * 1000;
};

/** Construye un instante a partir de fecha/hora "de pared" en la zona (maneja horario de verano). */
export const fechaEnZona = (anio: number, mes: number, dia: number, hora: number, minuto: number, zona: string): Date => {
  const pared = Date.UTC(anio, mes - 1, dia, hora, minuto);
  let t = pared - desfaseMs(new Date(pared), zona);
  const d2 = desfaseMs(new Date(t), zona);
  if (pared - d2 !== t) t = pared - d2;
  return new Date(t);
};

const dd = (n: number) => String(n).padStart(2, '0');

/** "2026-11-03 18:00 (America/Santiago)" */
export const formatoLocal = (d: Date, zona: string) => {
  const p = partesEnZona(d, zona);
  return `${p.anio}-${dd(p.mes)}-${dd(p.dia)} ${dd(p.hora)}:${dd(p.minuto)} (${zona})`;
};

/** Fecha local AAAA-MM-DD en la zona del calendario (para nombrar guiones y logs). */
export const fechaHoyLocal = (zona = cargarCalendario().zonaHoraria, d = new Date()) => {
  const p = partesEnZona(d, zona);
  return `${p.anio}-${dd(p.mes)}-${dd(p.dia)}`;
};

export type TipoVideo = 'short' | 'largo';

/** Ranuras que aplican a un día local concreto (fase doble, normal o largo). */
export const ranurasDelDia = (fechaIso: string, tipo: TipoVideo, calendario: Calendario): Ranura[] => {
  if (tipo === 'largo') return calendario.ranurasLargo;
  if (calendario.dobleHasta && fechaIso <= calendario.dobleHasta) return calendario.ranurasDoble;
  return calendario.ranuras;
};

/** Instantes ya programados (publicarEn) en bandeja y compilaciones, del tipo pedido. */
export const ranurasOcupadas = (tipo: TipoVideo = 'short'): Date[] =>
  leerBandeja(true)
    .filter((e) => e.publicarEn && (e.tipo ?? 'short') === tipo)
    .map((e) => new Date(e.publicarEn as string))
    .filter((d) => !Number.isNaN(d.getTime()));

/**
 * Próxima ranura libre del calendario posterior a `desde` (+ margenMinutos), saltando las ya
 * ocupadas en la bandeja y las que se pasen en `extra` (p. ej. asignadas en esta misma corrida).
 */
export const siguienteRanura = (
  desde: Date = new Date(), extra: Date[] = [], calendario = cargarCalendario(), tipo: TipoVideo = 'short',
): Date => {
  const zona = calendario.zonaHoraria;
  const ocupadas = [...ranurasOcupadas(tipo), ...extra].map((d) => d.getTime());
  const minimo = desde.getTime() + calendario.margenMinutos * 60_000;
  const base = partesEnZona(desde, zona);
  for (let offset = 0; offset < 730; offset++) {
    // Aritmética de calendario con Date.UTC como "calendario puro".
    const dia = new Date(Date.UTC(base.anio, base.mes - 1, base.dia + offset));
    const anio = dia.getUTCFullYear(), mes = dia.getUTCMonth() + 1, d = dia.getUTCDate(), ds = dia.getUTCDay();
    const iso = `${anio}-${dd(mes)}-${dd(d)}`;
    const candidatas = ranurasDelDia(iso, tipo, calendario)
      .filter((r) => r.dias.includes(ds))
      .map((r) => {
        const [h, m] = r.hora.split(':').map(Number);
        return fechaEnZona(anio, mes, d, h, m, zona);
      })
      .sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidatas) {
      if (c.getTime() < minimo) continue;
      if (ocupadas.some((o) => Math.abs(o - c.getTime()) < 60_000)) continue;
      return c;
    }
  }
  throw new Error('No se encontró una ranura libre en 2 años: revisa contenido/calendario.json');
};

/** Las próximas `n` ranuras libres (sin repetir). */
export const proximasRanuras = (n: number, desde: Date = new Date(), calendario = cargarCalendario(), tipo: TipoVideo = 'short'): Date[] => {
  const lista: Date[] = [];
  for (let i = 0; i < n; i++) lista.push(siguienteRanura(desde, lista, calendario, tipo));
  return lista;
};

/** Plantilla del guion promovido más recientemente (por fecha de modificación). */
const ultimaPromovida = (): Plantilla | undefined => {
  let mejor: { t: number; p: Plantilla } | undefined;
  for (const g of leerGuiones()) {
    const t = fs.statSync(g.ruta).mtimeMs;
    if (!mejor || t > mejor.t) mejor = { t, p: g.plantilla };
  }
  return mejor?.p;
};

/**
 * Qué plantilla renderizar ahora. Mantiene la bandeja balanceada para que la publicación pueda
 * rotar: elige la plantilla con MENOS videos 'listo'; si empatan, sigue la rotación a partir de
 * la última promovida.
 */
export const siguientePlantilla = (calendario = cargarCalendario()): Plantilla => {
  const rot = calendario.rotacion;
  const ultima = ultimaPromovida();
  const desde = ultima ? (rot.indexOf(ultima) + 1) % rot.length : 0;
  const orden = rot.map((_, k) => rot[(desde + k) % rot.length]);
  const listos = leerBandeja().filter((e) => e.estado === 'listo' && e.mp4Existe);
  const cuenta = (p: Plantilla) => listos.filter((e) => e.plantilla === p).length;
  return orden.reduce((mejor, p) => (cuenta(p) < cuenta(mejor) ? p : mejor), orden[0]);
};

/** Orden de rotación empezando por `desde`. */
export const ordenRotacion = (desde: Plantilla, calendario = cargarCalendario()): Plantilla[] => {
  const rot = calendario.rotacion;
  const i = Math.max(0, rot.indexOf(desde));
  return rot.map((_, k) => rot[(i + k) % rot.length]);
};

/**
 * Ordena videos 'listo' para publicar intercalando plantillas según la rotación (bola → dato →
 * carrera), empezando por la que sigue a la última ya programada. Dentro de cada plantilla, por id.
 */
export const ordenarParaPublicar = <T extends { id: string; plantilla: string }>(lista: T[], calendario = cargarCalendario()): T[] => {
  const rot = calendario.rotacion as readonly string[];
  const programados = leerBandeja()
    .filter((e) => e.publicarEn)
    .sort((a, b) => (a.publicarEn as string).localeCompare(b.publicarEn as string));
  const ultima = programados.at(-1)?.plantilla;
  let i = ultima && rot.includes(ultima) ? (rot.indexOf(ultima) + 1) % rot.length : 0;
  const colas = new Map(rot.map((p) => [p, lista.filter((e) => e.plantilla === p).sort((a, b) => a.id.localeCompare(b.id))]));
  const resultado: T[] = [];
  for (;;) {
    let tomado = false;
    for (let k = 0; k < rot.length; k++) {
      const p = rot[(i + k) % rot.length];
      const cola = colas.get(p)!;
      if (cola.length) {
        resultado.push(cola.shift()!);
        i = (rot.indexOf(p) + 1) % rot.length;
        tomado = true;
        break;
      }
    }
    if (!tomado) break;
  }
  // Plantillas fuera de la rotación, al final.
  return [...resultado, ...lista.filter((e) => !rot.includes(e.plantilla)).sort((a, b) => a.id.localeCompare(b.id))];
};

// ---------------------------------------------------------------- huérfanos
/**
 * Entradas 'listo' cuyo mp4 no existe (render interrumpido, p. ej. el kernel lo mató por RAM).
 * Con `marcar`, las pasa a estado 'error' para que no se cuenten ni se intenten subir. Se da un
 * margen de `graciaMin` desde la última modificación del json por si un render lo escribe antes del mp4.
 */
export const detectarHuerfanos = (marcar = true, graciaMin = 10): EntradaConRuta[] => {
  const ahora = Date.now();
  const huerfanos = leerBandeja(true).filter(
    (e) => e.estado === 'listo' && !e.mp4Existe && ahora - fs.statSync(e.rutaJson).mtimeMs > graciaMin * 60_000,
  );
  if (marcar) {
    for (const e of huerfanos) {
      e.estado = 'error';
      e.error = `huérfano: falta ${path.basename(e.rutaMp4)} (render interrumpido o mp4 borrado). Para reintentar: borra este json y devuelve el guion al backlog.`;
      guardarEntrada(e);
    }
  }
  return huerfanos;
};

/** Quita del final de una descripción las líneas que son solo hashtags (para no duplicarlos). */
export const quitarHashtagsFinales = (texto: string) => {
  const lineas = texto.trimEnd().split('\n');
  while (lineas.length && /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(lineas[lineas.length - 1])) lineas.pop();
  return lineas.join('\n').trimEnd();
};

// ---------------------------------------------------------------- texto
export const slugificar = (texto: string, max = 40) =>
  texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(new RegExp(`^(.{0,${max}})(?:-.*)?$`), '$1')
    .replace(/(?:-(?:que|de|del|la|el|los|las|y|o|en|a|con|por|un|una))+$/g, '') // sin palabras sueltas al final
    .replace(/-+$/g, '') || 'sin-titulo';

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Composición de Remotion para una plantilla: bola → Bola. */
export const composicionDe = (plantilla: string) => capitalizar(plantilla);

/** Categoría de YouTube: 28 Ciencia y tecnología (dato), 24 Entretenimiento (resto). */
export const categoriaDe = (plantilla: string) => (plantilla === 'dato' ? '28' : '24');

/** Asegura que un hashtag empiece con # y no tenga espacios. */
export const normalizarHashtag = (h: string) => '#' + h.replace(/^#+/, '').replace(/\s+/g, '');

export const formatoDuracion = (seg: number) => {
  const s = Math.round(seg);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// ---------------------------------------------------------------- logs
export type Log = ((linea: string) => void) & { ruta: string };

/** Log a consola + salida/logs/<nombre>.log con hora local. */
export const crearLog = (nombre: string, zona = 'America/Santiago'): Log => {
  fs.mkdirSync(DIR_LOGS, { recursive: true });
  const ruta = path.join(DIR_LOGS, `${nombre}.log`);
  const fn = ((linea: string) => {
    const p = partesEnZona(new Date(), zona);
    const hora = `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}:${String(p.segundo).padStart(2, '0')}`;
    const texto = `[${hora}] ${linea}`;
    console.log(texto);
    fs.appendFileSync(ruta, texto + '\n');
  }) as Log;
  fn.ruta = ruta;
  return fn;
};

/** Últimas líneas con "ERROR" o "✗" de los logs más recientes. */
export const ultimosErrores = (max = 8): string[] => {
  if (!fs.existsSync(DIR_LOGS)) return [];
  const archivos = fs.readdirSync(DIR_LOGS).filter((f) => f.endsWith('.log')).sort().reverse().slice(0, 7);
  const errores: string[] = [];
  for (const f of archivos) {
    const lineas = fs.readFileSync(path.join(DIR_LOGS, f), 'utf8').split('\n');
    for (const l of lineas.reverse()) {
      if (/✗|ERROR/.test(l)) errores.push(`${f}: ${l.trim()}`);
      if (errores.length >= max) return errores;
    }
  }
  return errores;
};

// ---------------------------------------------------------------- procesos
export interface ResultadoProceso { codigo: number; salida: string }

/**
 * Ejecuta un comando, volcando su salida al log (si hay) y devolviendo código + texto.
 * Con `timeoutMs`, mata al proceso y a todo su grupo (Chrome de Remotion incluido) si se pasa.
 */
export const correr = (
  comando: string,
  args: string[],
  opciones: { log?: Log; cwd?: string; env?: NodeJS.ProcessEnv; silencioso?: boolean; entrada?: string; timeoutMs?: number } = {},
): Promise<ResultadoProceso> =>
  new Promise((resolver) => {
    const hijo = spawn(comando, args, {
      cwd: opciones.cwd ?? RAIZ,
      env: { ...process.env, ...opciones.env },
      stdio: [opciones.entrada === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      detached: opciones.timeoutMs !== undefined, // grupo propio para poder matarlo entero
    });
    let salida = '';
    let vencido = false;
    const temporizador = opciones.timeoutMs === undefined ? undefined : setTimeout(() => {
      vencido = true;
      salida += `\n[tiempo agotado: ${Math.round((opciones.timeoutMs as number) / 60000)} min; proceso terminado]\n`;
      try { process.kill(-(hijo.pid as number), 'SIGKILL'); } catch { try { hijo.kill('SIGKILL'); } catch { /* ya murió */ } }
    }, opciones.timeoutMs);
    const manejar = (trozo: Buffer) => {
      const texto = trozo.toString();
      salida += texto;
      if (salida.length > 2_000_000) salida = salida.slice(-1_000_000); // no acumular sin fin
      if (opciones.silencioso) return;
      if (opciones.log) {
        for (const linea of texto.split(/\r?\n|\r/)) if (linea.trim() && !esRuido(linea)) opciones.log(`  │ ${linea.trimEnd()}`);
      } else {
        process.stdout.write(texto);
      }
    };
    hijo.stdout?.on('data', manejar);
    hijo.stderr?.on('data', manejar);
    hijo.on('error', (e) => {
      if (temporizador) clearTimeout(temporizador);
      salida += String(e);
      resolver({ codigo: 127, salida });
    });
    hijo.on('close', (codigo, senal) => {
      if (temporizador) clearTimeout(temporizador);
      resolver({ codigo: vencido ? 124 : codigo ?? (senal === 'SIGKILL' ? 137 : 1), salida });
    });
    if (opciones.entrada !== undefined) {
      hijo.stdin?.end(opciones.entrada);
    }
  });

/** Líneas del aviso de versiones de zod que Remotion imprime en cada render (ruido, no es un error). */
const RUIDO_REMOTION = /^-{5,}$|Version mismatch|Extra packages with wrong versions|zod: installed|zod-types|You may experience|To resolve:|remotion versions|pin a package|same version|React context and hooks|Type errors and feature|Failed renders and unclear|npx remotion add zod/;
export const esRuido = (linea: string) => RUIDO_REMOTION.test(linea.trim());

/** Últimas líneas útiles de una salida (sin el aviso de versiones de zod que imprime Remotion). */
export const resumenSalida = (salida: string, lineas = 6): string => {
  const todas = salida.split(/\r?\n|\r/).map((l) => l.trimEnd()).filter((l) => l.trim());
  const utiles = todas.filter((l) => !esRuido(l)).map((l) => l.trim());
  return utiles.slice(-lineas).join(' | ') || todas.slice(-lineas).join(' | ');
};

/** Duración en segundos de un archivo de video (ffprobe del compositor de Remotion). */
export const duracionVideo = async (ruta: string): Promise<number> => {
  const r = await correr(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ruta], { silencioso: true });
  const n = parseFloat(r.salida.trim());
  if (r.codigo !== 0 || Number.isNaN(n)) throw new Error(`ffprobe falló para ${ruta}: ${r.salida.trim()}`);
  return n;
};

/** Metadatos básicos de un video. */
export const infoVideo = async (ruta: string): Promise<{ duracion: number; ancho: number; alto: number; tieneAudio: boolean }> => {
  const r = await correr(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', ruta], { silencioso: true });
  if (r.codigo !== 0) throw new Error(`ffprobe falló para ${ruta}: ${r.salida.trim()}`);
  const j = JSON.parse(r.salida) as { streams: Array<{ codec_type: string; width?: number; height?: number }>; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === 'video');
  return {
    duracion: parseFloat(j.format.duration),
    ancho: v?.width ?? 0,
    alto: v?.height ?? 0,
    tieneAudio: j.streams.some((s) => s.codec_type === 'audio'),
  };
};

export const existeSecreto = (ruta: string) => fs.existsSync(ruta) && fs.statSync(ruta).size > 0;

/** MB disponibles según /proc/meminfo (MemAvailable). */
export const memoriaDisponibleMb = (): number => {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    return m ? Math.round(parseInt(m[1], 10) / 1024) : Infinity;
  } catch {
    return Infinity;
  }
};
