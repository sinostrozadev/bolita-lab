/**
 * Revisión semanal automática de calidad (docs/MEJORA-CONTINUA.md §5). Cron: lunes 05:00.
 *
 *   npx tsx scripts/revisar.mts [--desde AAAA-MM-DD] [--sin-aplicar] [--dry-run] [--modelo opus]
 *                               [--excluir ruta1,ruta2]
 *
 * 1. Evidencia: los Shorts de salida/bandeja subidos (subidoEn) o renderizados (mtime del mp4) desde
 *    --desde (por defecto, hace 7 días). Por video, 6 fotogramas (0 s, 1,5 s, 25 %, 50 %, 75 %, último)
 *    a 540 px de ancho → salida/revisiones/<fecha>/fotogramas/<id>-<n>.jpg, y una hoja de contacto con
 *    los 6 en fila → <id>-hoja.jpg. Usa el ffmpeg de Remotion (no tiene `tile`/`hstack`: la hoja se
 *    compone en Node con frames crudos, como compilar.mts; ver scripts/lib/fotogramas.mts).
 * 2. Métricas (opcional, nunca rompe): Data API videos.list (vistas, likes, comentarios) y YouTube
 *    Analytics (views, averageViewPercentage, averageViewDuration, subscribersGained por video).
 *    → salida/revisiones/<fecha>/metricas.json. Si Analytics no está habilitada, el informe dice cómo.
 * 3. Revisión: `claude -p --model opus --output-format json` con docs/MEJORA-CONTINUA.md como contrato,
 *    los guiones, las métricas y las rutas de las hojas de contacto (Claude las abre con Read: sí ve
 *    imágenes). Además (§2b): busca en la web 5–10 Shorts virales del nicho (WebSearch/WebFetch) y los
 *    convierte en reglas, propone/adopta herramientas gratuitas y evalúa la estrategia (cadencia, horarios,
 *    mezcla, ruta al YPP). Permisos: --permission-mode dontAsk + lista explícita (todo lo demás se deniega).
 *    Con --sin-aplicar solo tiene Read/Glob/Grep/WebSearch/WebFetch. Los paquetes npm que pida (bloque
 *    ```instalar) los instala el script en el checkout principal con --no-save (node_modules es compartido).
 * 4. Aplicación con red de seguridad: Claude trabaja en un git worktree propio
 *    (salida/revisiones/<fecha>/arbol, rama revision/<fecha> desde la rama principal), así nunca toca
 *    el árbol de trabajo principal ni lo que otras sesiones tengan sin commitear. Después: tsc; render
 *    de prueba de cada plantilla tocada (flock /tmp/bolita-render.lock, ≥1500 MB libres, concurrency 1,
 *    a salida/pruebas/); si algo falla, `git checkout -- . && git clean -fd` en el worktree. Si todo
 *    queda verde: commit en la rama y merge --ff-only a la rama principal. Nunca push.
 * 5. Informe: salida/revisiones/<fecha>.md + una línea de resumen en salida/logs/cron.log.
 *
 * --dry-run: muestra qué haría (videos, fotogramas, comando de claude, plan de git) sin escribir nada.
 * --excluir: rutas (relativas a la raíz) que Claude no puede editar en esta corrida (p. ej. una carpeta
 *            que otra sesión está tocando). También: $BOLITA_REVISION_EXCLUIR.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import {
  ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_GUIONES, DIR_LOGS, DIR_SALIDA, RAIZ, PLANTILLAS,
  cargarCalendario, correr, crearLog, escribirJson, existeSecreto, fechaEnZona, fechaHoyLocal, formatoLocal,
  infoVideo, leerBandeja, leerJson, memoriaDisponibleMb, resumenSalida,
  type EntradaConRuta, type Log, type Plantilla,
} from './lib/operacion.mjs';
import { ETIQUETAS, FFMPEG_R, extraerFotogramas } from './lib/fotogramas.mjs';

const { values: opc } = parseArgs({
  args: process.argv.slice(2),
  options: {
    desde: { type: 'string' },
    'sin-aplicar': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    modelo: { type: 'string', default: 'opus' },
    excluir: { type: 'string' },
  },
});

const MIN = 60_000;
const LOCK_RENDER = '/tmp/bolita-render.lock';
const MEMORIA_RENDER_MB = parseInt(process.env.BOLITA_REVISION_MEMORIA_MB ?? '1500', 10);
const TIEMPO_CLAUDE = parseInt(process.env.BOLITA_REVISION_CLAUDE_MIN ?? '60', 10) * MIN;
const COAUTOR = opc.modelo === 'opus' ? 'Claude Opus 5.5 <noreply@anthropic.com>' : 'Claude <noreply@anthropic.com>';
const ARCHIVO_CRON_LOG = path.join(DIR_LOGS, 'cron.log');

const cal = cargarCalendario();
const zona = cal.zonaHoraria;
const FECHA = fechaHoyLocal(zona);
const DIR_REVISIONES = path.join(DIR_SALIDA, 'revisiones');
const DIR_REV = path.join(DIR_REVISIONES, FECHA);
const DIR_FOTOS = path.join(DIR_REV, 'fotogramas');
const DIR_PRUEBAS = path.join(DIR_SALIDA, 'pruebas');
const ARCHIVO_INFORME = path.join(DIR_REVISIONES, `${FECHA}.md`);
const dryRun = opc['dry-run'];
const aplicar = !opc['sin-aplicar'];
const excluir = [...(opc.excluir ?? '').split(','), ...(process.env.BOLITA_REVISION_EXCLUIR ?? '').split(',')]
  .map((s) => s.trim().replace(/^\.?\/+|\/+$/g, '')).filter(Boolean);

const rel = (p: string) => path.relative(RAIZ, p);
const dd = (n: number) => String(n).padStart(2, '0');

/** Inicio del rango: --desde (fecha local) o hace 7 días. */
const inicioRango = (): Date => {
  if (opc.desde) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opc.desde);
    if (!m) throw new Error(`--desde debe ser AAAA-MM-DD (recibí "${opc.desde}")`);
    return fechaEnZona(+m[1], +m[2], +m[3], 0, 0, zona);
  }
  return new Date(Date.now() - 7 * 24 * 60 * MIN);
};

const git = (args: string[], cwd = RAIZ) => correr('git', args, { cwd, silencioso: true });

// ---------------------------------------------------------------- 1. evidencia
interface Video {
  entrada: EntradaConRuta;
  duracion: number;
  guion: Record<string, unknown> | null;
  fotogramas: string[];
  hoja: string | null;
  errorFotos?: string;
}

const seleccionarVideos = (desde: Date): EntradaConRuta[] =>
  leerBandeja()
    .filter((e) => (e.tipo ?? 'short') === 'short' && e.mp4Existe && e.estado !== 'error')
    .filter((e) => {
      const subido = e.subidoEn ? new Date(e.subidoEn) : null;
      const render = fs.statSync(e.rutaMp4).mtime;
      return (subido && subido >= desde) || render >= desde;
    });

const leerGuionDe = (id: string): Record<string, unknown> | null => {
  const ruta = path.join(DIR_GUIONES, `${id}.json`);
  try { return fs.existsSync(ruta) ? leerJson<Record<string, unknown>>(ruta) : null; } catch { return null; }
};

// ---------------------------------------------------------------- 2. métricas
interface MetricasVideo {
  vistas?: number; likes?: number; comentarios?: number;
  analytics?: { views: number; averageViewPercentage: number; averageViewDuration: number; subscribersGained: number };
}
interface Metricas {
  generado: string; desde: string; hasta: string;
  dataApi: { ok: boolean; error?: string };
  analytics: { ok: boolean; error?: string; instruccion?: string };
  videos: Record<string, MetricasVideo>;
}

const clienteYouTube = (): OAuth2Client => {
  if (!existeSecreto(ARCHIVO_CLIENTE_YT) || !existeSecreto(ARCHIVO_TOKEN_YT)) throw new Error(`faltan ${rel(ARCHIVO_CLIENTE_YT)} o ${rel(ARCHIVO_TOKEN_YT)} (docs/SANTIAGO.md)`);
  const j = leerJson<{ installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }>(ARCHIVO_CLIENTE_YT);
  const c = j.installed ?? j.web;
  if (!c) throw new Error(`${rel(ARCHIVO_CLIENTE_YT)} sin client_id`);
  const cliente = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
  const tokens = leerJson<Credentials>(ARCHIVO_TOKEN_YT);
  cliente.setCredentials(tokens);
  // Mismo criterio que subir.mts: si Google refresca el token, se guarda (fusionando con el previo).
  cliente.on('tokens', (nuevos) => escribirJson(ARCHIVO_TOKEN_YT, { ...leerJson<Credentials>(ARCHIVO_TOKEN_YT), ...nuevos }, 0o600));
  return cliente;
};

const mensajeGoogle = (e: unknown): string => {
  const x = e as { code?: number; message?: string };
  return `${x.code ? `${x.code} ` : ''}${(x.message ?? String(e)).split('\n')[0]}`;
};

const reunirMetricas = async (videos: Video[], desde: Date, log: Log): Promise<Metricas> => {
  const hasta = new Date();
  const iso = (d: Date) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(d); return p; };
  const m: Metricas = {
    generado: new Date().toISOString(), desde: iso(desde), hasta: iso(hasta),
    dataApi: { ok: false }, analytics: { ok: false }, videos: {},
  };
  const ids = videos.map((v) => v.entrada.videoId).filter((x): x is string => !!x);
  if (!ids.length) {
    m.dataApi.error = m.analytics.error = 'ningún video del rango tiene videoId (aún no se suben)';
    return m;
  }
  let cliente: OAuth2Client;
  try { cliente = clienteYouTube(); } catch (e) {
    m.dataApi.error = m.analytics.error = (e as Error).message;
    log(`  ⚠ métricas: ${(e as Error).message}`);
    return m;
  }
  const porVideoId = new Map(videos.filter((v) => v.entrada.videoId).map((v) => [v.entrada.videoId as string, v.entrada.id]));
  try {
    const yt = google.youtube({ version: 'v3', auth: cliente });
    for (let i = 0; i < ids.length; i += 50) {
      const r = await yt.videos.list({ part: ['statistics'], id: ids.slice(i, i + 50) });
      for (const it of r.data.items ?? []) {
        const id = porVideoId.get(it.id ?? '');
        if (!id) continue;
        m.videos[id] = { vistas: +(it.statistics?.viewCount ?? 0), likes: +(it.statistics?.likeCount ?? 0), comentarios: +(it.statistics?.commentCount ?? 0) };
      }
    }
    m.dataApi.ok = true;
    log(`  ✓ Data API: estadísticas de ${Object.keys(m.videos).length}/${ids.length} video(s)`);
  } catch (e) {
    m.dataApi.error = mensajeGoogle(e);
    log(`  ⚠ Data API: ${m.dataApi.error}`);
  }
  try {
    const ya = google.youtubeAnalytics({ version: 'v2', auth: cliente });
    for (let i = 0; i < ids.length; i += 200) {
      const r = await ya.reports.query({
        ids: 'channel==MINE', startDate: m.desde, endDate: m.hasta, dimensions: 'video',
        metrics: 'views,averageViewPercentage,averageViewDuration,subscribersGained',
        filters: `video==${ids.slice(i, i + 200).join(',')}`, sort: '-views', maxResults: 200,
      });
      for (const fila of r.data.rows ?? []) {
        const [vid, views, pct, dur, subs] = fila as [string, number, number, number, number];
        const id = porVideoId.get(vid);
        if (!id) continue;
        m.videos[id] = { ...m.videos[id], analytics: { views, averageViewPercentage: pct, averageViewDuration: dur, subscribersGained: subs } };
      }
    }
    m.analytics.ok = true;
    log(`  ✓ Analytics API: ${Object.values(m.videos).filter((v) => v.analytics).length} video(s) con datos (Analytics tarda ~48 h en reflejar vistas)`);
  } catch (e) {
    m.analytics.error = mensajeGoogle(e);
    const url = /https:\/\/console\.developers\.google\.com\/\S+/.exec(m.analytics.error)?.[0]
      ?? /https:\/\/console\.developers\.google\.com\/\S+/.exec(String((e as { message?: string }).message))?.[0];
    if (/has not been used|disabled|SERVICE_DISABLED/i.test(String((e as { message?: string }).message))) {
      m.analytics.instruccion = `Habilitar la YouTube Analytics API en el proyecto de Google Cloud (bolita-lab): abre ${url ?? 'https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com'} con la cuenta dueña del proyecto → "Habilitar". Espera unos minutos. No hace falta reautorizar: el token ya tiene el scope youtube.`;
    } else if (/insufficient|scope|permission/i.test(m.analytics.error)) {
      m.analytics.instruccion = 'El token no tiene permiso para Analytics: agrega el scope https://www.googleapis.com/auth/yt-analytics.readonly en SCOPES de scripts/subir.mts y vuelve a correr `npx tsx scripts/subir.mts autorizar`.';
    }
    log(`  ⚠ Analytics API: ${m.analytics.error.slice(0, 200)}`);
  }
  return m;
};

// ---------------------------------------------------------------- 3. claude
const resumenNumerico = (v: Video, m?: MetricasVideo) => {
  const a = m?.analytics;
  const partes = [
    `duración ${v.duracion.toFixed(1)} s`, `estado ${v.entrada.estado}`,
    v.entrada.publicarEn ? `publica ${formatoLocal(new Date(v.entrada.publicarEn), zona)}` : '',
    m?.vistas !== undefined ? `vistas ${m.vistas}, likes ${m.likes}, comentarios ${m.comentarios}` : 'sin estadísticas',
    a ? `Analytics: ${a.views} vistas, ${a.averageViewPercentage.toFixed(1)} % visto de media, ${a.averageViewDuration} s de media, +${a.subscribersGained} subs (${a.views ? ((a.subscribersGained * 1000) / a.views).toFixed(1) : '0'} por 1.000 vistas)` : 'sin Analytics',
  ];
  return partes.filter(Boolean).join(' · ');
};

const construirPrompt = (videos: Video[], metricas: Metricas, cwd: string): string => {
  const contrato = fs.readFileSync(path.join(RAIZ, 'docs', 'MEJORA-CONTINUA.md'), 'utf8');
  const estrategia = fs.readFileSync(path.join(RAIZ, 'docs', 'ESTRATEGIA.md'), 'utf8');
  const umbrales = /## 5\.[\s\S]*?(?=\n## 6\.|$)/.exec(estrategia)?.[0] ?? '';
  const lista = videos.map((v, i) => {
    const props = v.guion ? JSON.stringify(v.guion.props ?? {}) : '(guion no encontrado en contenido/guiones)';
    return [
      `### ${i + 1}. ${v.entrada.id} — plantilla ${v.entrada.plantilla}`,
      `Título: ${v.entrada.titulo}`,
      `Resumen: ${resumenNumerico(v, metricas.videos[v.entrada.id])}`,
      `Hoja de contacto (6 fotogramas en fila: ${ETIQUETAS.join(', ')}): ${v.hoja ?? `(no se pudo extraer: ${v.errorFotos})`}`,
      v.fotogramas.length ? `Fotogramas sueltos (540 px): ${v.fotogramas[0].replace(/-1\.jpg$/, '-<1..6>.jpg')}` : '',
      `Guion (props, recortado): ${props.length > 1500 ? props.slice(0, 1500) + '…' : props}`,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  const estadoMetricas = [
    `Data API: ${metricas.dataApi.ok ? 'ok' : `no disponible (${metricas.dataApi.error})`}`,
    `Analytics API: ${metricas.analytics.ok ? 'ok' : `no disponible (${metricas.analytics.error?.slice(0, 160)})`}`,
  ].join('\n');

  const modo = aplicar
    ? `MODO APLICAR. Trabajas en un git worktree aislado: ${cwd} (rama revision/${FECHA}). Edita SOLO dentro de esa carpeta y SOLO con rutas relativas a ella (src/…, scripts/…, contenido/backlog/…, docs/DECISIONES.md). NO edites nada bajo ${RAIZ} fuera del worktree: está prohibido y se deniega.
Implementa las mejoras marcadas "se aplica ya" que sean de plantilla (src/plantillas/<p>, scripts/preparar-*, scripts/simular-*) o de guion (src/plantillas/<p>/README.md, prompt de scripts/generar-guiones.mts, guiones de contenido/backlog afectados). Cambios acotados y seguros: como máximo 3 mejoras, que no rompan el contrato de las plantillas (docs/OPERACION.md "Contrato con las plantillas") ni la identidad del canal. Anota cada mejora en docs/DECISIONES.md con fecha ${FECHA} y motivo.
HERRAMIENTAS NUEVAS: si una mejora que aplicas necesita un paquete npm, agrégalo a "dependencies" de package.json y declara la instalación en un bloque de código con lenguaje \`instalar\` (una línea por paquete, \`npm <paquete>@<versión>\`). NO corras npm tú: el script lo instala antes de verificar. Solo paquetes gratuitos y con licencia compatible (MIT/Apache/BSD/CC0…). Lo que cueste dinero o exija una cuenta de Santiago, NO lo adoptes: déjalo como propuesta marcada **requiere a Santiago**. Modelos locales o binarios fuera de npm: propuesta para una sesión interactiva (anota pasos exactos).
ESTRATEGIA: si las métricas (≥ 2–3 semanas de datos) justifican un cambio de cadencia, horarios o mezcla de plantillas, aplícalo en contenido/calendario.json y docs/ESTRATEGIA.md y anótalo en docs/DECISIONES.md. Sin datos suficientes, solo propón. Corre \`npx tsc --noEmit\` al terminar y deja el árbol compilando. No hagas commit, ni push, ni cambies de rama: el script verifica (tsc + render de prueba) y commitea solo si todo queda verde.${excluir.length ? `\nNO toques estas rutas en esta corrida (otra sesión las está editando): ${excluir.join(', ')}.` : ''}
No toques scripts/subir.mts, scripts/revisar.mts, secrets/ ni docs/MEJORA-CONTINUA.md.`
    : 'MODO SOLO INFORME (--sin-aplicar): no edites ningún archivo ni instales nada. En "Cambios aplicados" escribe "Ninguno (modo solo informe)" y, para cada mejora "se aplica ya", indica los archivos que habría que tocar (y los paquetes a instalar, si hacen falta).';

  return `Eres el revisor de calidad semanal del canal de YouTube Shorts "Bolita Lab" (repo ${RAIZ}). Hoy es ${FECHA}.
Tu contrato es docs/MEJORA-CONTINUA.md (va completo abajo). Cumple su §1 (MIRA LOS VIDEOS, no solo el código) y su §2b (referentes virales, herramientas, estrategia).

CÓMO MIRAR: para cada video abre su hoja de contacto con la herramienta Read (es un JPG: lo ves como imagen). Si una hoja muestra un problema, abre los fotogramas sueltos para verlo mejor. Revisa: ¿hay algo que mirar en cada momento? ¿se entiende sin audio? ¿el gancho está en el frame 0? ¿texto pisado, cortado o fuera de la zona segura (docs/CONVENCIONES.md)? Compara contra la vara del nicho (§1.2), no contra la tanda anterior. Puedes leer el código de src/plantillas/<p>/ para proponer arreglos concretos.

=== docs/MEJORA-CONTINUA.md (contrato) ===
${contrato}

=== Umbrales (docs/ESTRATEGIA.md §5) ===
${umbrales}

=== Métricas ===
${estadoMetricas}
("Visto vs deslizado" de Shorts no existe en la API: solo en Studio. Si no hay métricas, evalúa solo por lo visual y dilo.)

=== Videos de la tanda (${videos.length}) ===
${lista}

=== Además de mirar la tanda (contrato §2b) ===
A. REFERENTES VIRALES: con WebSearch/WebFetch busca 5–10 Shorts RECIENTES (últimos ~3 meses) con millones de vistas del mismo tipo: simulaciones satisfying de bolitas/física con música, datos curiosos animados, carreras de bolitas/marble races con competidores. Para cada uno: canal, título, URL, vistas aproximadas y qué hace distinto (gancho, ritmo, sonido, texto en pantalla, primer frame/miniatura, duración, título). Si una página no carga, usa lo que digan los resultados de búsqueda y dilo; no inventes cifras ni URLs. Termina con reglas concretas (de plantilla o de guion) que adaptan —no copian— lo aprendido.
B. HERRAMIENTAS: pregunta "¿qué herramienta haría esto mejor?" (voz más natural, música/sonido generado, imágenes con licencia, efectos, edición, analítica). Propón opciones concretas (nombre, licencia, costo, cómo se integra) y adopta las gratuitas que una mejora de hoy necesite (ver reglas de instalación abajo). Revisa primero package.json para no proponer lo que ya está.
C. ESTRATEGIA: con las métricas (y contenido/calendario.json, docs/ESTRATEGIA.md) evalúa cadencia, horarios, mezcla de plantillas, idioma, duración y la ruta al YPP (1.000 subs + 4.000 h de reproducción en 12 meses, o 1.000 subs + 10 M de vistas de Shorts en 90 días). Si aún no hay datos suficientes, dilo y propone qué medir.

=== Qué hacer ===
${modo}

=== Formato de tu respuesta (Markdown, en español; es lo que se guarda como informe) ===
## Resumen
(2–4 líneas: estado general de la tanda y lo más urgente)
## 3 cosas que están bien
## 5 mejoras ordenadas por impacto/esfuerzo
(numeradas; cada una: qué se ve (video y fotograma concretos), por qué importa, qué cambiar y dónde, impacto/esfuerzo, y la marca **se aplica ya** o **queda para después** con motivo)
## Referentes virales
(tabla: canal · título · URL · vistas · qué hace distinto; luego "Reglas que adoptamos")
## Herramientas
(propuestas con licencia/costo; cuáles se adoptan hoy, cuáles quedan para después y cuáles **requieren a Santiago**)
## Estrategia
(evaluación con números; cambios aplicados o propuestos a docs/ESTRATEGIA.md y contenido/calendario.json)
## Videos a re-renderizar
(ids ya renderizados y aún no publicados con un defecto visible; "ninguno" si no hay)
## Cambios aplicados
(lista de archivos tocados con una línea de qué cambió cada uno, o "Ninguno")

Responde SOLO con ese Markdown, sin preámbulo.`;
};

interface ResultadoClaude { ok: boolean; texto: string; costo?: number; turnos?: number; denegados: string[]; error?: string }

/** Reglas de permisos para claude -p (todo lo no listado se deniega por --permission-mode dontAsk). */
const permisos = () => {
  // WebSearch/WebFetch: comparar con los virales del nicho (MEJORA-CONTINUA §2b). Solo lectura de la web.
  const lectura = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
  if (!aplicar) return { herramientas: lectura, permitidas: lectura, prohibidas: ['Read(./secrets/**)'] };
  const editables = [
    './src/**', './scripts/**', './contenido/backlog/**', './contenido/calendario.json',
    './docs/DECISIONES.md', './docs/ESTRATEGIA.md', './package.json',
  ];
  const prohibidas = [
    'Read(./secrets/**)', 'Edit(./secrets/**)', 'Write(./secrets/**)',
    ...['./scripts/subir.mts', './scripts/revisar.mts', './docs/MEJORA-CONTINUA.md', ...excluir.map((x) => `./${x}/**`), ...excluir.map((x) => `./${x}`)]
      .flatMap((p) => [`Edit(${p})`, `Write(${p})`]),
    'Bash(git commit *)', 'Bash(git push *)', 'Bash(git checkout *)', 'Bash(git reset *)', 'Bash(rm *)',
    // npm en el worktree podaría el node_modules compartido (enlazado): las instalaciones las hace el script.
    'Bash(npm *)', 'Bash(npx npm *)', 'Bash(pnpm *)', 'Bash(yarn *)', 'Edit(./package-lock.json)', 'Write(./package-lock.json)',
  ];
  return {
    herramientas: [...lectura, 'Edit', 'Write', 'Bash'],
    permitidas: [
      ...lectura, ...editables.flatMap((p) => [`Edit(${p})`, `Write(${p})`]),
      'Bash(npx tsc --noEmit)', 'Bash(npx tsc --noEmit *)', 'Bash(git diff *)', 'Bash(git diff)', 'Bash(git status *)', 'Bash(git status)', 'Bash(ls *)',
    ],
    prohibidas,
  };
};

const argsClaude = () => {
  const p = permisos();
  // El prompt posicional va primero: --allowedTools/--disallowedTools son variádicos y se comerían lo que siga.
  return [
    '-p', 'Sigue las instrucciones del texto que recibes por stdin y responde exactamente en el formato que piden.',
    '--model', opc.modelo as string, '--output-format', 'json', '--permission-mode', 'dontAsk', '--no-session-persistence',
    '--add-dir', DIR_REV,
    '--tools', p.herramientas.join(','),
    '--disallowedTools', ...p.prohibidas,
    '--allowedTools', ...p.permitidas,
  ];
};

const llamarClaude = async (prompt: string, cwd: string, log: Log): Promise<ResultadoClaude> => {
  log(`  🤖 claude -p --model ${opc.modelo} (prompt ${prompt.length} chars, cwd ${rel(cwd) || '.'}, máx ${TIEMPO_CLAUDE / MIN} min)…`);
  const r = await correr('claude', argsClaude(), { cwd, silencioso: true, entrada: prompt, env: { CLAUDECODE: '' }, timeoutMs: TIEMPO_CLAUDE });
  const ini = r.salida.indexOf('{');
  try {
    const j = JSON.parse(r.salida.slice(ini, r.salida.lastIndexOf('}') + 1)) as {
      result?: string; is_error?: boolean; total_cost_usd?: number; num_turns?: number; subtype?: string;
      permission_denials?: Array<{ tool_name?: string; tool_input?: Record<string, unknown> }>;
    };
    const denegados = (j.permission_denials ?? []).map((d) => `${d.tool_name}(${String(d.tool_input?.file_path ?? d.tool_input?.command ?? d.tool_input?.path ?? '')})`);
    const ok = r.codigo === 0 && !j.is_error && !!j.result;
    return { ok, texto: j.result ?? '', costo: j.total_cost_usd, turnos: j.num_turns, denegados, error: ok ? undefined : `código ${r.codigo}, ${j.subtype ?? ''} ${resumenSalida(r.salida, 3)}` };
  } catch {
    return { ok: false, texto: '', denegados: [], error: `claude -p terminó con código ${r.codigo}: ${r.salida.slice(-600)}` };
  }
};

// ---------------------------------------------------------------- 4. aplicar
const ramaPrincipal = async (): Promise<string> => {
  for (const r of ['main', 'master']) if ((await git(['rev-parse', '--verify', '--quiet', `refs/heads/${r}`])).codigo === 0) return r;
  return (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).salida.trim();
};

const nombreRama = async (): Promise<string> => {
  let rama = `revision/${FECHA}`;
  for (let k = 2; (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${rama}`])).codigo === 0; k++) rama = `revision/${FECHA}-${k}`;
  return rama;
};

/** Plantillas cuyo render puede cambiar con estos archivos. */
const plantillasTocadas = (archivos: string[]): Plantilla[] => {
  const set = new Set<Plantilla>();
  for (const f of archivos) {
    const m = /^src\/plantillas\/([^/]+)\/(.+)$/.exec(f);
    if (m && (PLANTILLAS as readonly string[]).includes(m[1]) && !m[2].endsWith('.md')) set.add(m[1] as Plantilla);
    const s = /^scripts\/(?:preparar|simular)-([a-z]+)\.mts$/.exec(f);
    if (s && (PLANTILLAS as readonly string[]).includes(s[1])) set.add(s[1] as Plantilla);
    if (/^scripts\/(voz|sonido-dato)\.mts$/.test(f)) set.add('dato');
    if (/^src\/(marca|lib)\/|^src\/(Root\.tsx|index\.ts)$|^scripts\/lib\/wav\.mts$/.test(f)) PLANTILLAS.forEach((p) => set.add(p));
  }
  return [...set];
};

/** Render de prueba de una plantilla en el worktree → salida/pruebas/revision-<fecha>-<p>.mp4. */
const renderPrueba = async (p: Plantilla, arbol: string, log: Log): Promise<{ ok: boolean; detalle: string; mp4?: string; hoja?: string }> => {
  const base = fs.readdirSync(DIR_GUIONES).filter((f) => f.endsWith('.json') && leerGuionDe(f.replace(/\.json$/, ''))?.plantilla === p).sort().at(-1);
  if (!base) return { ok: false, detalle: `no hay guion de "${p}" en contenido/guiones para probar` };
  const id = `prueba-revision-${FECHA}-${p}`;
  const guion: Record<string, unknown> = { ...leerJson<Record<string, unknown>>(path.join(DIR_GUIONES, base)), id };
  guion.props = { ...(guion.props as object), id };
  const rutaGuion = path.join(arbol, 'salida', 'trabajo', `${id}.guion.json`);
  escribirJson(rutaGuion, guion);
  log(`  ⚙ prueba ${p}: preparar-${p} con ${base}`);
  const tsx = path.join(arbol, 'node_modules', '.bin', 'tsx');
  const prep = await correr(tsx, [path.join(arbol, 'scripts', `preparar-${p}.mts`), rutaGuion], { cwd: arbol, log, timeoutMs: 20 * MIN });
  const props = path.join(arbol, 'salida', 'trabajo', `${id}.props.json`);
  if (prep.codigo !== 0 || !fs.existsSync(props)) return { ok: false, detalle: `preparar-${p} falló (código ${prep.codigo}): ${resumenSalida(prep.salida, 4)}` };

  fs.mkdirSync(DIR_PRUEBAS, { recursive: true });
  const mp4 = path.join(DIR_PRUEBAS, `revision-${FECHA}-${p}.mp4`);
  try { fs.unlinkSync(mp4); } catch { /* no existía */ }
  // Dentro del lock: espera (máx 60 min) a tener RAM y recién entonces renderiza.
  const espera = `for i in $(seq 180); do a=$(free -m | awk '/^Mem:/{print $7}'); if [ "$a" -ge ${MEMORIA_RENDER_MB} ]; then echo "RAM disponible $a MB: render"; exec "$@"; fi; sleep 20; done; echo "sin RAM suficiente (<${MEMORIA_RENDER_MB} MB) tras 60 min" >&2; exit 75`;
  log(`  🎬 prueba ${p}: render (flock ${LOCK_RENDER}, ≥${MEMORIA_RENDER_MB} MB, concurrency 1) → ${rel(mp4)}`);
  const r = await correr('flock', [
    '-w', '3600', LOCK_RENDER, 'bash', '-c', espera, '_',
    path.join(arbol, 'node_modules', '.bin', 'remotion'), 'render', 'src/index.ts', p.charAt(0).toUpperCase() + p.slice(1), mp4,
    `--props=${props}`, '--codec=h264', '--crf=18', '--concurrency=1', '--log=error', '--timeout=120000',
  ], { cwd: arbol, log, timeoutMs: 150 * MIN });
  if (r.codigo !== 0 || !fs.existsSync(mp4)) return { ok: false, detalle: `render falló (código ${r.codigo}${r.codigo === 1 && /flock/.test(r.salida) ? ', lock' : ''}): ${resumenSalida(r.salida, 4)}` };
  const info = await infoVideo(mp4);
  if (info.duracion < 25 || info.duracion > 58.5) return { ok: false, mp4, detalle: `duración ${info.duracion.toFixed(1)} s fuera de 25–58 s` };
  const f = await extraerFotogramas(mp4, `prueba-${p}`, path.join(DIR_REV, 'pruebas'), info.duracion, info.alto / info.ancho);
  return { ok: true, mp4, hoja: f.hoja, detalle: `ok: ${info.duracion.toFixed(1)} s, ${info.ancho}×${info.alto}, audio ${info.tieneAudio ? 'sí' : 'no'}` };
};

interface ResultadoAplicar { pasos: string[]; verde: boolean; archivos: string[]; commit?: string; rama?: string }

const prepararArbol = async (log: Log): Promise<{ arbol: string; rama: string; base: string }> => {
  const base = await ramaPrincipal();
  const rama = await nombreRama();
  const arbol = path.join(DIR_REV, 'arbol');
  if (fs.existsSync(arbol)) {
    await git(['worktree', 'remove', '--force', arbol]);
    fs.rmSync(arbol, { recursive: true, force: true });
    await git(['worktree', 'prune']);
  }
  const r = await git(['worktree', 'add', '-b', rama, arbol, base]);
  if (r.codigo !== 0) throw new Error(`git worktree add falló: ${r.salida.trim()}`);
  fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(arbol, 'node_modules'));
  log(`  ✓ worktree ${rel(arbol)} en rama ${rama} (desde ${base})`);
  return { arbol, rama, base };
};

/** Lo que Claude cambió en el worktree (sin el symlink de node_modules). */
const cambiosEnArbol = async (arbol: string): Promise<string[]> => {
  const r = await git(['status', '--porcelain', '--untracked-files=all'], arbol);
  return r.salida.split('\n').map((l) => l.slice(3).trim().replace(/^"|"$/g, '')).map((l) => l.split(' -> ').pop() as string)
    .filter((f) => f && f !== 'node_modules' && !f.startsWith('node_modules/'));
};

const revertir = async (arbol: string, pasos: string[], motivo: string, log: Log) => {
  await git(['checkout', '--', '.'], arbol);
  await git(['clean', '-fd', '-e', 'node_modules'], arbol);
  pasos.push(`↩ revertido en el worktree (\`git checkout -- . && git clean -fd\`): ${motivo}`);
  log(`  ↩ revertido: ${motivo}`);
};

/** Paquetes npm declarados por Claude en bloques \`\`\`instalar (líneas `npm <paquete>[@versión]`). */
const paquetesAInstalar = (texto: string): string[] => {
  const lista: string[] = [];
  for (const m of texto.matchAll(/```instalar\s*\n([\s\S]*?)```/g)) {
    for (const l of m[1].split('\n')) {
      const p = /^\s*npm\s+((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[\w.^~<>=-]+)?)\s*$/i.exec(l);
      if (p) lista.push(p[1]);
    }
  }
  return [...new Set(lista)];
};

const verificarYAplicar = async (arbol: string, rama: string, base: string, textoClaude: string, log: Log): Promise<ResultadoAplicar> => {
  const pasos: string[] = [];
  const archivos = await cambiosEnArbol(arbol);
  const fuera = archivos.filter((f) => excluir.some((x) => f === x || f.startsWith(`${x}/`)));
  if (!archivos.length) {
    pasos.push('Claude no dejó cambios en el worktree: nada que verificar ni commitear.');
    return { pasos, verde: true, archivos };
  }
  pasos.push(`Archivos cambiados: ${archivos.map((f) => `\`${f}\``).join(', ')}`);
  if (fuera.length) {
    await revertir(arbol, pasos, `tocó rutas excluidas (${fuera.join(', ')})`, log);
    return { pasos, verde: false, archivos };
  }

  const paquetes = paquetesAInstalar(textoClaude);
  if (paquetes.length) {
    // En el checkout principal (node_modules es compartido vía symlink): npm en el worktree podaría paquetes que
    // otras sesiones agregaron sin commitear. --no-save: el registro va en el package.json del worktree.
    log(`  📦 npm install --no-save ${paquetes.join(' ')}`);
    const n = await correr('npm', ['install', '--no-save', '--no-audit', '--no-fund', ...paquetes], { cwd: RAIZ, silencioso: true, timeoutMs: 15 * MIN });
    pasos.push(`${n.codigo === 0 ? '✓' : '✗'} npm install ${paquetes.join(' ')}${n.codigo === 0 ? '' : `: ${resumenSalida(n.salida, 3)}`}`);
    if (n.codigo !== 0) {
      await revertir(arbol, pasos, 'no se pudo instalar un paquete pedido', log);
      return { pasos, verde: false, archivos };
    }
  }

  log('  🔎 tsc --noEmit en el worktree…');
  const tsc = await correr(path.join(arbol, 'node_modules', '.bin', 'tsc'), ['--noEmit', '-p', path.join(arbol, 'tsconfig.json')], { cwd: arbol, silencioso: true, timeoutMs: 10 * MIN });
  if (tsc.codigo !== 0) {
    pasos.push(`✗ tsc falló:\n\n\`\`\`\n${tsc.salida.trim().split('\n').slice(0, 25).join('\n')}\n\`\`\``);
    await revertir(arbol, pasos, 'tsc no compila', log);
    return { pasos, verde: false, archivos };
  }
  pasos.push('✓ `tsc --noEmit` limpio');

  const tocadas = plantillasTocadas(archivos);
  pasos.push(tocadas.length ? `Plantillas tocadas: ${tocadas.join(', ')} → render de prueba de cada una` : 'Ninguna plantilla tocada en su render (solo guiones/docs): sin render de prueba.');
  for (const p of tocadas) {
    const r = await renderPrueba(p, arbol, log);
    pasos.push(`${r.ok ? '✓' : '✗'} render de prueba ${p}: ${r.detalle}${r.mp4 ? ` → \`${rel(r.mp4)}\`` : ''}${r.hoja ? ` · hoja \`${rel(r.hoja)}\`` : ''}`);
    if (!r.ok) {
      await revertir(arbol, pasos, `falló el render de prueba de ${p}`, log);
      return { pasos, verde: false, archivos };
    }
  }

  await git(['add', '-A', '--', '.', ':(exclude)node_modules'], arbol);
  const mensaje = `revisión semanal ${FECHA}\n\nAplicada por scripts/revisar.mts (informe: salida/revisiones/${FECHA}.md).\nArchivos: ${archivos.join(', ')}\n\nCo-Authored-By: ${COAUTOR}`;
  const c = await git(['commit', '-m', mensaje], arbol);
  if (c.codigo !== 0) {
    pasos.push(`✗ commit falló: ${c.salida.trim().slice(0, 300)}`);
    await revertir(arbol, pasos, 'commit falló', log);
    return { pasos, verde: false, archivos };
  }
  const commit = (await git(['rev-parse', '--short', 'HEAD'], arbol)).salida.trim();
  pasos.push(`✓ commit \`${commit}\` en \`${rama}\``);

  // Fast-forward de la rama principal. Si está en el checkout principal, merge allí (git se niega si
  // pisaría cambios locales sin commitear: entonces queda la rama para mergear a mano).
  const actual = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).salida.trim();
  const m = actual === base ? await git(['merge', '--ff-only', rama]) : await git(['fetch', '.', `${rama}:${base}`]);
  if (m.codigo === 0) {
    pasos.push(`✓ fast-forward de \`${base}\` a \`${commit}\` (sin push)`);
  } else {
    pasos.push(`⚠ no pude hacer fast-forward de \`${base}\` (${resumenSalida(m.salida, 2)}). Los cambios quedan en la rama \`${rama}\`: \`git merge ${rama}\` cuando convenga.`);
  }
  return { pasos, verde: true, archivos, commit, rama };
};

const cerrarArbol = async (arbol: string, rama: string, conCommit: boolean) => {
  await git(['worktree', 'remove', '--force', arbol]);
  await git(['worktree', 'prune']);
  if (!conCommit) await git(['branch', '-D', rama]); // rama vacía: no dejar basura
};

// ---------------------------------------------------------------- 5. informe
const tablaVideos = (videos: Video[], m: Metricas) => {
  const filas = videos.map((v) => {
    const x = m.videos[v.entrada.id];
    const a = x?.analytics;
    return `| ${v.entrada.id} | ${v.entrada.plantilla} | ${v.duracion.toFixed(1)} s | ${v.entrada.estado}${v.entrada.videoId ? ` ([${v.entrada.videoId}](https://youtu.be/${v.entrada.videoId}))` : ''} | ${x?.vistas ?? '—'} | ${a ? `${a.averageViewPercentage.toFixed(0)} %` : '—'} | ${a ? `+${a.subscribersGained}` : '—'} | ${v.hoja ? `\`${rel(v.hoja)}\`` : `✗ ${v.errorFotos ?? ''}`} |`;
  });
  return ['| id | plantilla | duración | estado | vistas | % visto | subs | hoja de contacto |', '|---|---|---|---|---|---|---|---|', ...filas].join('\n');
};

const lineaCron = (texto: string) => {
  const linea = `[${formatoLocal(new Date(), zona)}] revisar: ${texto}`;
  console.log(linea);
  // Bajo cron la salida estándar YA es cron.log (no duplicar); en cualquier otro caso se agrega aquí.
  let salidaEsCronLog = false;
  try {
    const a = fs.fstatSync(1), b = fs.statSync(ARCHIVO_CRON_LOG);
    salidaEsCronLog = a.ino === b.ino && a.dev === b.dev;
  } catch { /* cron.log aún no existe */ }
  if (!salidaEsCronLog) { fs.mkdirSync(DIR_LOGS, { recursive: true }); fs.appendFileSync(ARCHIVO_CRON_LOG, linea + '\n'); }
};

// ---------------------------------------------------------------- main
const main = async () => {
  const desde = inicioRango();
  const log = crearLog(`revision-${FECHA}`, zona);
  log(`REVISIÓN SEMANAL ${FECHA} · desde ${formatoLocal(desde, zona)} · modo ${dryRun ? 'dry-run' : aplicar ? 'aplicar' : 'solo informe'} · RAM ${memoriaDisponibleMb()} MB`);

  const entradas = seleccionarVideos(desde);
  log(`Videos en el rango: ${entradas.length}`);
  if (!entradas.length) {
    lineaCron('0 videos en el rango: nada que revisar');
    return;
  }

  if (dryRun) {
    for (const e of entradas) log(`  · ${e.id} [${e.plantilla}, ${e.estado}${e.videoId ? `, ${e.videoId}` : ''}] → ${rel(DIR_FOTOS)}/${e.id}-{1..6}.jpg + -hoja.jpg`);
    log(`[dry-run] extraería ${entradas.length * 6} fotogramas + ${entradas.length} hojas con ${rel(FFMPEG_R)}`);
    log(`[dry-run] métricas: ${entradas.filter((e) => e.videoId).length} videoId(s) → videos.list + youtubeAnalytics.reports.query → ${rel(DIR_REV)}/metricas.json`);
    const cwd = aplicar ? path.join(DIR_REV, 'arbol') : RAIZ;
    log(`[dry-run] claude ${argsClaude().map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}  (cwd ${rel(cwd)}, prompt por stdin)`);
    if (aplicar) {
      const base = await ramaPrincipal();
      const sucio = (await git(['status', '--porcelain'])).salida.trim().split('\n').filter(Boolean).length;
      log(`[dry-run] git worktree add -b ${await nombreRama()} ${rel(cwd)} ${base}  (el checkout principal tiene ${sucio} archivo(s) sin commitear: no se tocan)`);
      log(`[dry-run] luego: tsc --noEmit en el worktree → render de prueba por plantilla tocada (flock ${LOCK_RENDER}, ≥${MEMORIA_RENDER_MB} MB; hoy hay ${memoriaDisponibleMb()} MB) → commit "revisión semanal ${FECHA}" → merge --ff-only a ${base}. Si algo falla: git checkout -- . && git clean -fd en el worktree.`);
      if (excluir.length) log(`[dry-run] rutas excluidas para Claude: ${excluir.join(', ')}`);
    }
    log(`[dry-run] informe → ${rel(ARCHIVO_INFORME)}`);
    return;
  }

  fs.mkdirSync(DIR_FOTOS, { recursive: true });
  const videos: Video[] = [];
  for (const e of entradas) {
    const v: Video = { entrada: e, duracion: e.duracionSeg, guion: leerGuionDe(e.id), fotogramas: [], hoja: null };
    try {
      const info = await infoVideo(e.rutaMp4);
      v.duracion = info.duracion;
      const f = await extraerFotogramas(e.rutaMp4, e.id, DIR_FOTOS, info.duracion, info.alto / info.ancho);
      v.fotogramas = f.rutas;
      v.hoja = f.hoja;
    } catch (err) {
      v.errorFotos = (err as Error).message.slice(0, 200);
      log(`  ✗ ${e.id}: ${v.errorFotos}`);
    }
    videos.push(v);
  }
  log(`  ✓ fotogramas: ${videos.filter((v) => v.hoja).length}/${videos.length} video(s) → ${rel(DIR_FOTOS)}`);

  const metricas = await reunirMetricas(videos, desde, log);
  escribirJson(path.join(DIR_REV, 'metricas.json'), metricas);

  let arbol = RAIZ;
  let rama = '';
  let base = '';
  let resultado: ResultadoAplicar = { pasos: ['Modo solo informe (--sin-aplicar): no se tocó git.'], verde: true, archivos: [] };
  if (aplicar) {
    try {
      ({ arbol, rama, base } = await prepararArbol(log));
    } catch (e) {
      resultado = { pasos: [`✗ ${(e as Error).message}`], verde: false, archivos: [] };
      arbol = '';
    }
  }

  let claude: ResultadoClaude = { ok: false, texto: '', denegados: [], error: 'no se llamó (falló la preparación del worktree)' };
  if (arbol) {
    claude = await llamarClaude(construirPrompt(videos, metricas, arbol), arbol, log);
    log(claude.ok ? `  ✓ revisión recibida (${claude.texto.length} chars, ${claude.turnos ?? '?'} turnos, US$ ${claude.costo?.toFixed(2) ?? '?'})` : `  ✗ claude: ${claude.error}`);
    if (aplicar) {
      if (claude.ok) {
        resultado = await verificarYAplicar(arbol, rama, base, claude.texto, log);
      } else {
        resultado = { pasos: [], verde: false, archivos: [] };
        await revertir(arbol, resultado.pasos, 'la revisión de Claude falló', log);
      }
      await cerrarArbol(arbol, rama, !!resultado.commit);
    }
  }

  const a = metricas.analytics;
  const informe = `# Revisión semanal ${FECHA}

Generada por \`scripts/revisar.mts\` (docs/MEJORA-CONTINUA.md §5) · rango desde ${formatoLocal(desde, zona)} · modo ${aplicar ? 'aplicar' : 'solo informe'} · modelo \`${opc.modelo}\`.

## Videos revisados (${videos.length})

${tablaVideos(videos, metricas)}

Fotogramas en \`${rel(DIR_FOTOS)}/<id>-<1..6>.jpg\` (${ETIQUETAS.join(', ')}); métricas en \`${rel(DIR_REV)}/metricas.json\`.

## Métricas

- Data API (vistas, likes, comentarios): ${metricas.dataApi.ok ? '✓' : `✗ ${metricas.dataApi.error}`}
- Analytics API (retención, suscriptores): ${a.ok ? '✓' : `✗ ${a.error}`}
${a.instruccion ? `- **Para habilitarla:** ${a.instruccion}\n` : ''}- "Visto vs deslizado" no está en la API: mirarlo en Studio → Analytics → Shorts.

## Revisión de Claude

${claude.ok ? claude.texto.trim() : `✗ La revisión no se pudo generar: ${claude.error}`}

## Verificaciones del script

${resultado.pasos.map((p) => `- ${p}`).join('\n')}
${claude.denegados.length ? `- Permisos denegados a Claude (intentó salir de lo permitido): ${claude.denegados.slice(0, 15).map((d) => `\`${d}\``).join(', ')}` : ''}
- Claude: ${claude.turnos ?? '?'} turnos, costo US$ ${claude.costo?.toFixed(2) ?? '?'}
`;
  fs.mkdirSync(DIR_REVISIONES, { recursive: true });
  fs.writeFileSync(ARCHIVO_INFORME, informe);
  log(`✓ informe → ${rel(ARCHIVO_INFORME)}`);

  const estadoAplicar = !aplicar ? 'solo informe' : resultado.commit ? `commit ${resultado.commit}` : resultado.verde ? 'sin cambios' : 'revertido';
  lineaCron(`${videos.length} videos, ${videos.filter((v) => v.hoja).length} con fotogramas, Data API ${metricas.dataApi.ok ? 'ok' : 'no'}, Analytics ${a.ok ? 'ok' : 'no'}, claude ${claude.ok ? 'ok' : 'falló'}, ${estadoAplicar} → ${rel(ARCHIVO_INFORME)}`);
  if (!claude.ok || !resultado.verde) process.exitCode = 1;
};

main().catch((e) => {
  lineaCron(`✗ ERROR ${(e as Error).message.split('\n')[0]}`);
  process.exit(1);
});
