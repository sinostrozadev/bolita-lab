/**
 * Pipeline de UN día de Bolita Lab. Pensado para cron (ver scripts/cron.txt), pero se puede
 * correr a mano.
 *
 *   npx tsx scripts/diario.mts [--solo-render] [--solo-subir] [--sin-generar] [--n K] [--dry-run]
 *                              [--sin-guiones] [--cuantos K] [--sin-subir]
 *
 * --sin-guiones = --sin-generar y --cuantos K = --n K (nombres que usa .github/workflows/producir.yml).
 * --sin-subir: no llama a `subir --todos` aunque haya token; igual actualiza PARA-SUBIR-A-MANO.md.
 * Con BOLITA_NUBE=1 (GitHub Actions) los mp4 van a artifacts y no se marcan huérfanos; si además
 * hay BOLITA_ARTEFACTO, cada entrada nueva de la bandeja lo guarda en `artefacto` (dónde bajar el mp4).
 *
 * (0) Marca como 'error' los .json 'listo' de la bandeja que no tienen mp4 (renders interrumpidos).
 * (a) Si la bandeja tiene menos de `minimoBandeja` videos 'listo' (o se pasó --n K: exactamente K
 *     renders seguidos), toma guiones del backlog por rotación (bola → dato → carrera, priorizando
 *     la plantilla con menos videos listos), los promueve a contenido/guiones/<fecha>-<plantilla>-<slug>.json,
 *     corre preparar-<plantilla> y renderiza de a UNO con --concurrency=1. Antes de cada render
 *     espera a tener RAM (MemAvailable > 1200 MB, máx. 30 min).
 * (b) Si el backlog baja de `minimoBacklog`, genera guiones nuevos con generar-guiones.mts.
 * (c) Sube con `subir --todos` si existe secrets/youtube-token.json; si no, `exportar`.
 * Lock en salida/diario.lock; log en salida/logs/<fecha>.log. Un fallo marca el guion con
 * estado 'error' y sigue con el siguiente; cada paso tiene tiempo máximo: nunca se cuelga el día.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { agregarCreditos } from './imagenes-dato.mjs';
import {
  ARCHIVO_API_AUDITADA, ARCHIVO_TOKEN_YT, DIR_BANDEJA, caducidadTokenYT, DIR_GUIONES, DIR_SALIDA, DIR_TRABAJO, RAIZ,
  asegurarDirectorios, cargarCalendario, composicionDe, correr, crearLog, detectarHuerfanos, duracionVideo,
  enLaNube, escribirJson, existeSecreto, fechaHoyLocal, leerBacklog, leerBandeja, memoriaDisponibleMb, ordenRotacion,
  resumenSalida, siguientePlantilla, slugificar,
  type EntradaBandeja, type Guion, type Log, type Plantilla,
} from './lib/operacion.mjs';

const { values: opc } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'solo-render': { type: 'boolean', default: false },
    'solo-subir': { type: 'boolean', default: false },
    'sin-generar': { type: 'boolean', default: false },
    /** Alias de --sin-generar (sin `claude -p`: en la nube los guiones llegan hechos al backlog). */
    'sin-guiones': { type: 'boolean', default: false },
    /** No sube a YouTube (solo exporta la lista manual). */
    'sin-subir': { type: 'boolean', default: false },
    /** Renderiza exactamente K videos seguidos (aunque la bandeja ya tenga el mínimo). */
    n: { type: 'string' },
    /** Alias de --n. */
    cuantos: { type: 'string' },
    /** Tope de renders cuando se rellena la bandeja hasta el mínimo (por defecto = minimoBandeja). */
    'max-renders': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (opc.cuantos !== undefined && opc.n === undefined) opc.n = opc.cuantos;
if (opc['sin-guiones']) opc['sin-generar'] = true;

const ARCHIVO_LOCK = path.join(DIR_SALIDA, 'diario.lock');
const TSX = path.join(RAIZ, 'node_modules', '.bin', 'tsx');
const REMOTION = path.join(RAIZ, 'node_modules', '.bin', 'remotion');
const CONCURRENCIA = process.env.BOLITA_CONCURRENCIA ?? '1';
const MEMORIA_MIN_MB = parseInt(process.env.BOLITA_MEMORIA_MIN_MB ?? '1200', 10);
const ESPERA_MEMORIA_MAX_MIN = 30;
const MIN = 60_000;
const TIEMPO_PREPARAR = 20 * MIN;
const TIEMPO_RENDER = parseInt(process.env.BOLITA_RENDER_MAX_MIN ?? '90', 10) * MIN;
const TIEMPO_GENERAR = 20 * MIN;
const TIEMPO_SUBIR = 4 * 60 * MIN;
const rel = (p: string) => path.relative(RAIZ, p);

/** Espera (hasta 30 min) a que haya RAM suficiente antes de renderizar. Devuelve false si no llegó. */
const esperarMemoria = async (log: Log): Promise<boolean> => {
  const limite = Date.now() + ESPERA_MEMORIA_MAX_MIN * MIN;
  let ultimoAviso = 0;
  while (memoriaDisponibleMb() < MEMORIA_MIN_MB) {
    if (Date.now() > limite) return false;
    if (Date.now() - ultimoAviso > 5 * MIN) {
      log(`  ⏳ RAM disponible ${memoriaDisponibleMb()} MB < ${MEMORIA_MIN_MB} MB: espero (máx ${ESPERA_MEMORIA_MAX_MIN} min)…`);
      ultimoAviso = Date.now();
    }
    await new Promise((ok) => setTimeout(ok, 20_000));
  }
  log(`  RAM disponible ${memoriaDisponibleMb()} MB ≥ ${MEMORIA_MIN_MB} MB: adelante.`);
  return true;
};

// ---------------------------------------------------------------- lock
const tomarLock = (log: Log): boolean => {
  for (let intento = 0; intento < 2; intento++) {
    try {
      fs.writeFileSync(ARCHIVO_LOCK, String(process.pid), { flag: 'wx' }); // atómico: falla si ya existe
      return true;
    } catch {
      const pid = parseInt(fs.readFileSync(ARCHIVO_LOCK, 'utf8').trim(), 10);
      let vivo = false;
      try { process.kill(pid, 0); vivo = true; } catch { vivo = false; }
      if (vivo) {
        log(`✗ Ya hay un diario corriendo (pid ${pid}, ${rel(ARCHIVO_LOCK)}). Salgo.`);
        return false;
      }
      log(`⚠ Lock huérfano (pid ${pid} no existe): lo reemplazo.`);
      try { fs.unlinkSync(ARCHIVO_LOCK); } catch { /* otro lo borró */ }
    }
  }
  return false;
};
const soltarLock = () => {
  try {
    if (fs.readFileSync(ARCHIVO_LOCK, 'utf8').trim() === String(process.pid)) fs.unlinkSync(ARCHIVO_LOCK);
  } catch { /* nada */ }
};

// ---------------------------------------------------------------- (a) render
const marcarError = (guion: Guion, mensaje: string, log: Log) => {
  const entrada: EntradaBandeja = {
    id: guion.id, plantilla: guion.plantilla, titulo: guion.titulo, descripcion: guion.descripcion,
    hashtags: guion.hashtags, duracionSeg: 0, estado: 'error', tipo: 'short', error: mensaje.slice(0, 1500),
  };
  escribirJson(path.join(DIR_BANDEJA, `${guion.id}.json`), entrada);
  log(`  ✗ ${guion.id} → estado 'error': ${mensaje.split('\n')[0]}`);
};

/**
 * Slug de un guion del backlog: su id sin el prefijo `pendiente-` ni `<plantilla>-`.
 *   pendiente-carrera-cafe-te-mate → cafe-te-mate ;  bola-oda-escape → oda-escape
 */
const slugDeBacklog = (g: Pick<Guion, 'id' | 'plantilla' | 'titulo'>): string => {
  let base = g.id.trim();
  base = base.replace(/^pendiente-/, '');
  base = base.replace(new RegExp(`^${g.plantilla}-`), '');
  base = base.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(new RegExp(`^${g.plantilla}-`), '');
  return slugificar(base || g.titulo, 60);
};

/** Mueve un guion del backlog a contenido/guiones con id `<fecha>-<plantilla>-<slug>`. */
const promover = (g: Guion & { ruta: string }, fecha: string, log: Log): Guion & { ruta: string } => {
  const slug = slugDeBacklog(g);
  let id = `${fecha}-${g.plantilla}-${slug}`;
  const ocupado = (x: string) => fs.existsSync(path.join(DIR_GUIONES, `${x}.json`)) || fs.existsSync(path.join(DIR_BANDEJA, `${x}.json`));
  for (let k = 2; ocupado(id); k++) id = `${fecha}-${g.plantilla}-${slug}-${k}`;
  const destino = path.join(DIR_GUIONES, `${id}.json`);
  const { ruta: origen, ...resto } = g;
  const nuevo: Guion = { ...resto, id, props: { ...resto.props, id } };
  escribirJson(destino, nuevo);
  fs.unlinkSync(origen);
  log(`  → promovido ${rel(origen)} ⇒ ${rel(destino)}`);
  return { ...nuevo, ruta: destino };
};

/** Si preparar-<plantilla> dejó `creditos` (atribución de imágenes de Commons) en el json de props, los agrega a la descripción. */
const descripcionConCreditos = (descripcion: string, rutaProps: string): string => {
  try {
    const { creditos } = JSON.parse(fs.readFileSync(rutaProps, 'utf8')) as { creditos?: string };
    return agregarCreditos(descripcion, creditos);
  } catch { return descripcion; }
};

const renderizarUno = async (g: Guion & { ruta: string }, log: Log): Promise<boolean> => {
  const salidaMp4 = path.join(DIR_BANDEJA, `${g.id}.mp4`);
  const props = path.join(DIR_TRABAJO, `${g.id}.props.json`);
  const composicion = composicionDe(g.plantilla);

  const preparar = path.join(RAIZ, 'scripts', `preparar-${g.plantilla}.mts`);
  if (!fs.existsSync(preparar)) {
    marcarError(g, `no existe ${rel(preparar)} (la plantilla "${g.plantilla}" aún no entrega su script de preparación)`, log);
    return false;
  }
  log(`  ⚙ preparar-${g.plantilla} ${rel(g.ruta)}`);
  const p = await correr(TSX, [preparar, g.ruta], { log, timeoutMs: TIEMPO_PREPARAR });
  if (p.codigo !== 0) {
    marcarError(g, `preparar-${g.plantilla} salió con código ${p.codigo}: ${resumenSalida(p.salida, 5)}`, log);
    return false;
  }
  if (!fs.existsSync(props)) {
    marcarError(g, `preparar-${g.plantilla} no escribió ${rel(props)}`, log);
    return false;
  }

  const argsRender = [
    'render', 'src/index.ts', composicion, salidaMp4,
    `--props=${props}`, '--codec=h264', '--crf=18', `--concurrency=${CONCURRENCIA}`, '--log=error',
    // timeout alto: con la máquina cargada un frame puede tardar más de los 30 s por defecto
    // (con 120 s igual se cortó un render de carrera el 2026-11-04).
    '--timeout=180000',
    // veryfast: x264 con menos lookahead usa mucha menos RAM; con el preset por defecto el
    // kernel mató a ffmpeg por OOM (≈950 MB) en un render de carrera. Con crf 18 la calidad sobra.
    '--x264-preset=veryfast',
  ];
  let r = { codigo: 1, salida: '' };
  for (let intento = 1; intento <= 2; intento++) {
    if (!(await esperarMemoria(log))) {
      marcarError(g, `sin RAM suficiente (<${MEMORIA_MIN_MB} MB disponibles) tras ${ESPERA_MEMORIA_MAX_MIN} min de espera`, log);
      return false;
    }
    log(`  🎬 render ${composicion} → ${rel(salidaMp4)} (concurrency ${intento === 1 ? CONCURRENCIA : 1}, intento ${intento})`);
    const inicio = Date.now();
    const args = intento === 1 ? argsRender : argsRender.map((a) => (a.startsWith('--concurrency=') ? '--concurrency=1' : a));
    r = await correr(REMOTION, args, { log, timeoutMs: TIEMPO_RENDER });
    if (r.codigo === 0 && fs.existsSync(salidaMp4)) {
      let duracionSeg = 0;
      try { duracionSeg = Math.round((await duracionVideo(salidaMp4)) * 10) / 10; } catch (e) { log(`  ⚠ ${(e as Error).message}`); }
      const entrada: EntradaBandeja = {
        id: g.id, plantilla: g.plantilla, titulo: g.titulo, descripcion: descripcionConCreditos(g.descripcion, props), hashtags: g.hashtags,
        duracionSeg, estado: 'listo', tipo: 'short',
        ...(process.env.BOLITA_ARTEFACTO ? { artefacto: process.env.BOLITA_ARTEFACTO } : {}),
      };
      escribirJson(path.join(DIR_BANDEJA, `${g.id}.json`), entrada); // json SIEMPRE después del mp4
      log(`  ✓ listo ${g.id} (${duracionSeg}s de video, ${((Date.now() - inicio) / 1000).toFixed(0)}s de render)`);
      return true;
    }
    try { fs.unlinkSync(salidaMp4); } catch { /* no había mp4 parcial */ }
    const motivo = r.codigo === 137 ? ' (SIGKILL: probablemente el kernel lo mató por falta de RAM)' : r.codigo === 124 ? ' (tiempo agotado)' : '';
    log(`  ⚠ render falló con código ${r.codigo}${motivo}: ${resumenSalida(r.salida, 3)}`);
    if (intento === 1) log('  ↻ reintento una vez (concurrency 1)…');
  }
  marcarError(g, `remotion render salió con código ${r.codigo}: ${resumenSalida(r.salida, 6)}`, log);
  return false;
};

const elegirDelBacklog = (log: Log): (Guion & { ruta: string }) | undefined => {
  const backlog = leerBacklog();
  if (backlog.length === 0) return undefined;
  const calendario = cargarCalendario();
  const toca = siguientePlantilla(calendario);
  const orden = ordenRotacion(toca, calendario);
  for (const p of orden) {
    const candidatos = backlog.filter((g) => g.plantilla === p);
    if (candidatos.length) {
      if (p !== toca) log(`  (no hay guiones de "${toca}" en el backlog; uso "${p}")`);
      return candidatos[0];
    }
  }
  return undefined;
};

const pasoRender = async (log: Log) => {
  const calendario = cargarCalendario();
  const fecha = fechaHoyLocal(calendario.zonaHoraria);
  const forzados = opc.n !== undefined ? Math.max(1, parseInt(opc.n, 10) || 1) : undefined;
  const tope = forzados ?? Math.max(1, parseInt(opc['max-renders'] ?? String(calendario.minimoBandeja), 10) || calendario.minimoBandeja);
  let renders = 0;
  while (renders < tope) {
    const listos = leerBandeja().filter((e) => e.estado === 'listo' && e.mp4Existe).length;
    if (forzados === undefined && listos >= calendario.minimoBandeja) {
      log(`(a) Bandeja con ${listos} listo(s) ≥ ${calendario.minimoBandeja}: no hace falta renderizar.`);
      return;
    }
    const elegido = elegirDelBacklog(log);
    if (!elegido) {
      log(`(a) Backlog vacío (bandeja: ${listos} listo(s)).${opc['sin-generar'] ? '' : ' Se generarán guiones en (b).'}`);
      return;
    }
    log(`(a) Render ${renders + 1}/${tope}${forzados ? ' (--n)' : ''} · bandeja: ${listos} listo(s) · ${elegido.plantilla} ← ${rel(elegido.ruta)}`);
    if (opc['dry-run']) { log(`  [dry-run] se promovería a ${fecha}-${elegido.plantilla}-${slugDeBacklog(elegido)} y se renderizaría.`); return; }
    const g = promover(elegido, fecha, log);
    let ok = false;
    try {
      ok = await renderizarUno(g, log);
    } catch (e) {
      marcarError(g, `excepción: ${(e as Error).message}`, log);
    }
    // En la nube un render fallido hace fallar el workflow (visible en Actions); en el cron local, no.
    if (!ok && enLaNube()) process.exitCode = 1;
    renders++;
  }
  log(`(a) ${renders} render(s) en esta corrida (tope ${tope}).`);
};

// ---------------------------------------------------------------- (b) generar
const tieneSchema = (p: Plantilla) => fs.existsSync(path.join(RAIZ, 'src', 'plantillas', p, 'guion.ts'));

const pasoGenerar = async (log: Log) => {
  const calendario = cargarCalendario();
  const backlog = leerBacklog();
  if (backlog.length >= calendario.minimoBacklog) {
    log(`(b) Backlog con ${backlog.length} guion(es) ≥ ${calendario.minimoBacklog}: no se generan.`);
    return;
  }
  const conSchema = calendario.rotacion.filter(tieneSchema);
  if (conSchema.length === 0) {
    log('(b) Ninguna plantilla tiene src/plantillas/<p>/guion.ts: no se puede generar.');
    return;
  }
  // Lleva cada plantilla a ~minimoBacklog/plantillas, empezando por la que menos tiene.
  const meta = Math.ceil(calendario.minimoBacklog / conSchema.length) + 1;
  const plan = conSchema
    .map((p) => ({ p, n: Math.max(0, meta - backlog.filter((g) => g.plantilla === p).length) }))
    .filter((x) => x.n > 0);
  log(`(b) Backlog con ${backlog.length} < ${calendario.minimoBacklog}: generar ${plan.map((x) => `${x.n} ${x.p}`).join(', ')}.`);
  if (opc['dry-run']) return log('  [dry-run] no se llama a generar-guiones.');
  for (const { p, n } of plan) {
    const r = await correr(TSX, [path.join(RAIZ, 'scripts', 'generar-guiones.mts'), '--plantilla', p, '--n', String(n)], { log, timeoutMs: TIEMPO_GENERAR });
    if (r.codigo !== 0) log(`  ✗ generar-guiones ${p} falló (código ${r.codigo}); sigo.`);
  }
};

// ---------------------------------------------------------------- (c) subir
const pasoSubir = async (log: Log) => {
  const listos = leerBandeja().filter((e) => e.estado === 'listo' && e.mp4Existe).length;
  const subir = path.join(RAIZ, 'scripts', 'subir.mts');
  if (opc['sin-subir']) {
    log(`(c) --sin-subir: no se sube; exportar → salida/bandeja/PARA-SUBIR-A-MANO.md (${listos} listo(s)).`);
  } else if (!existeSecreto(ARCHIVO_API_AUDITADA)) {
    // Hasta que Google apruebe la auditoría del proyecto, todo lo subido por API queda privado y
    // consume el cupo diario de subidas. Mientras tanto se sube por YouTube Studio (herramientas/navegador).
    log(`(c) API sin auditar (falta ${rel(ARCHIVO_API_AUDITADA)}): no se sube por API; exportar → PARA-SUBIR-A-MANO.md (${listos} listo(s)).`);
  } else if (existeSecreto(ARCHIVO_TOKEN_YT)) {
    const cad = caducidadTokenYT();
    if (cad) {
      const dias = (cad.getTime() - Date.now()) / 86_400_000;
      if (dias < 0) log(`  ✗ El refresh token CADUCÓ el ${cad.toISOString()}: las subidas por API fallarán → npx tsx scripts/subir.mts autorizar`);
      else if (dias < 2) log(`  ⚠ El refresh token caduca en ${dias.toFixed(1)} días (${cad.toISOString()}) → reautorizar YA: npx tsx scripts/subir.mts autorizar`);
    }
    log(`(c) Token de YouTube presente: subir --todos (${listos} listo(s)).`);
    const r = await correr(TSX, [subir, 'subir', '--todos', ...(opc['dry-run'] ? ['--dry-run'] : [])], { log, timeoutMs: TIEMPO_SUBIR });
    if (r.codigo !== 0) {
      log(`  ✗ subir terminó con código ${r.codigo}: ${resumenSalida(r.salida, 2)}`);
      if (enLaNube()) process.exitCode = 1;
    }
  } else {
    log(`(c) Sin ${rel(ARCHIVO_TOKEN_YT)}: exportar → salida/bandeja/PARA-SUBIR-A-MANO.md (${listos} listo(s)).`);
  }
  // La lista manual se mantiene al día siempre (también sirve de respaldo si la API falla).
  const r = await correr(TSX, [subir, 'exportar'], { log, timeoutMs: 5 * MIN });
  if (r.codigo !== 0) log(`  ✗ exportar terminó con código ${r.codigo}.`);
};

// ---------------------------------------------------------------- main
const main = async () => {
  asegurarDirectorios();
  const zona = cargarCalendario().zonaHoraria;
  const log = crearLog(fechaHoyLocal(zona), zona);
  const banderas = ['solo-render', 'solo-subir', 'sin-generar', 'sin-subir', 'dry-run'].filter((k) => opc[k as keyof typeof opc]).map((k) => `--${k}`);
  if (opc.n) banderas.push(`--n ${opc.n}`);
  log(`══ diario ${banderas.join(' ')} (pid ${process.pid}, RAM disponible ${memoriaDisponibleMb()} MB)`);
  if (!tomarLock(log)) process.exit(3);
  process.on('exit', soltarLock);
  process.on('SIGINT', () => { soltarLock(); process.exit(130); });
  process.on('SIGTERM', () => { soltarLock(); process.exit(143); });

  const inicio = Date.now();
  const pasos: Array<[string, (l: Log) => Promise<void>, boolean]> = [
    ['huérfanos', async (l) => {
      const h = detectarHuerfanos(!opc['dry-run']);
      if (h.length) l(`(0) ✗ ${h.length} json 'listo' sin mp4 → estado 'error': ${h.map((e) => e.id).join(', ')}`);
    }, true],
    ['render', pasoRender, !opc['solo-subir']],
    ['generar', pasoGenerar, !opc['solo-subir'] && !opc['solo-render'] && !opc['sin-generar']],
    ['subir', pasoSubir, !opc['solo-render']],
  ];
  for (const [nombre, paso, activo] of pasos) {
    if (!activo) continue;
    try {
      await paso(log);
    } catch (e) {
      log(`✗ ERROR en el paso ${nombre}: ${(e as Error).stack ?? (e as Error).message}`);
      process.exitCode = 1; // sigue con los demás pasos
    }
  }
  const b = leerBandeja();
  log(`══ fin en ${((Date.now() - inicio) / 1000).toFixed(0)}s · bandeja: ${b.filter((e) => e.estado === 'listo').length} listo, ${b.filter((e) => e.estado === 'subido').length} subido, ${b.filter((e) => e.estado === 'error').length} error · backlog: ${leerBacklog().length}`);
};

main();
