/**
 * Captura diaria de métricas (skill global `metricas-diarias`): carpeta salida/metricas/AAAA-MM-DD/ con
 *   - 4 capturas PNG de YouTube Studio (overview, monetización, alcance, contenido) vía el piloto (:8777)
 *   - un .txt con el texto de cada pantalla (para parsear números después)
 *   - metricas.json con los números de canal y videos 'subido' de la bandeja: API de YouTube (token de secrets/) si
 *     responde (Data API: subs/vistas/videos; Analytics si el token tiene el scope: horas, vistas 28 d y 48 h); si no, curl público.
 *   npx tsx scripts/metricas.mts [--sin-capturas] [--fecha AAAA-MM-DD]
 * Idempotente: si la carpeta del día existe, actualiza (una captura fallida nunca pisa una buena).
 * Convivencia: pestaña propia (/nueva) → /cerrar → /usar la que estaba activa; nunca lanza un piloto.
 * Cuelga de estado.mts (cron 08:00; se omite allí con --sin-metricas), así que no necesita línea propia en el cron.
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { DIR_SALIDA, RAIZ, cargarCalendario, escribirJson, leerJson, leerBandeja, existeSecreto, ARCHIVO_TOKEN_YT, ARCHIVO_CLIENTE_YT } from './lib/operacion.mjs';

const CANAL = process.env.BOLITA_CANAL_ID ?? 'UCi1_1_ItZCLY4axLshZcuZQ';
const PILOTO = process.env.PILOTO_URL ?? 'http://127.0.0.1:8777';
const zona = cargarCalendario().zonaHoraria;
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const fecha = arg('--fecha') ?? new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date());
const dir = path.join(DIR_SALIDA, 'metricas', fecha);
fs.mkdirSync(dir, { recursive: true });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ piloto
const piloto = async (ruta: string, params: Record<string, string> = {}, bin = false): Promise<any> => {
  const u = new URL(PILOTO + ruta);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { signal: AbortSignal.timeout(45_000) });
  if (bin) return Buffer.from(await r.arrayBuffer());
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

const PANTALLAS = [
  { nombre: '1-overview', ruta: 'analytics/tab-overview/period-default', espera: /Views|Visualizaciones|Watch time|Tiempo de reproducci/i },
  { nombre: '2-monetizacion', ruta: 'monetization', espera: /Partner Program|Programa de Partners|subscribers|suscriptores/i },
  { nombre: '3-alcance', ruta: 'analytics/tab-reach_viewers/period-default', espera: /Impressions|Impresiones/i },
  { nombre: '4-contenido', ruta: 'analytics/tab-content/period-default', espera: /Content|Contenido|Views|Visualizaciones/i },
];

const NOMBRE = process.env.BOLITA_CANAL_NOMBRE || 'Bolita Lab'; // nombre visible en el selector de canales
const MALA = /Oops|don't have permission|Select a channel|Elige un canal/i;

/**
 * Misma rutina que herramientas/navegador/subir-studio.mjs (asegurarCanal): si Studio pide "Select a channel" se hace clic en
 * el canal por nombre. Extensión: en la página "Oops, you don't have permission" (Studio en otro canal de marca) primero se
 * pulsa "Switch account" y luego se elige el canal. Es cambio entre canales de la MISMA cuenta de Google (sin consentimiento).
 * Sin verificar contra el piloto real todavía. Devuelve el texto final; si no se logra, la captura se marca fallida.
 */
const asegurarCanal = async (url: string): Promise<string> => {
  let texto = String(await piloto('/texto', { max: '6000' }));
  for (let i = 0; i < 3 && MALA.test(texto); i++) {
    if (/don't have permission|Oops/i.test(texto) && !/Select a channel|Elige un canal/i.test(texto)) {
      await piloto('/clicktexto', { texto: 'Switch account', exacto: '1' });
      await dormir(4000);
    }
    texto = String(await piloto('/texto', { max: '6000' }));
    if (/Select a channel|Elige un canal/i.test(texto) || !texto.includes('Oops')) {
      await piloto('/clicktexto', { texto: NOMBRE, exacto: '1' });
      await dormir(6000);
    }
    await piloto('/ir', { url }); // vuelve a la pantalla pedida ya en el canal elegido
    await dormir(5000);
    texto = String(await piloto('/texto', { max: '6000' }));
  }
  return texto;
};

type Resultado = Record<string, string>;
const capturar = async (): Promise<{ estado: Resultado | string; textos: Record<string, string> }> => {
  const textos: Record<string, string> = {};
  try { await piloto('/url'); } catch { return { estado: 'piloto caído', textos }; }
  // Pestaña activa del otro proyecto: la identificamos por URL para devolverla al final.
  const antes = await piloto('/url');
  const paginas: string[] = await piloto('/paginas');
  let idx = paginas.findIndex((u) => u === antes.url);
  if (idx < 0) idx = 0;
  const estado: Resultado = {};
  try {
    await piloto('/nueva', { url: 'about:blank' });
    for (const p of PANTALLAS) {
      await piloto('/ir', { url: `https://studio.youtube.com/channel/${CANAL}/${p.ruta}` });
      let texto = '', url = '';
      for (let t = 0; t < 12; t++) { // hasta ~36 s: Studio hidrata lento
        await dormir(3000);
        url = (await piloto('/url')).url ?? '';
        texto = String(await piloto('/texto', { max: '6000' }));
        if (MALA.test(texto)) { texto = await asegurarCanal(`https://studio.youtube.com/channel/${CANAL}/${p.ruta}`); url = (await piloto('/url')).url ?? ''; if (MALA.test(texto)) break; }
        if (p.espera.test(texto) && texto.length > 300) { await dormir(2500); texto = String(await piloto('/texto', { max: '6000' })); break; }
      }
      const png = await piloto('/captura', {}, true);
      const archivo = path.join(dir, `${p.nombre}.png`);
      let veredicto = 'ok';
      if (MALA.test(texto)) veredicto = 'canal equivocado (el cambio de canal no funcionó)';
      else if (!url.includes(CANAL)) veredicto = `URL inesperada: ${url.slice(0, 80)}`;
      else if (!p.espera.test(texto)) veredicto = 'no cargó a tiempo';
      if (veredicto === 'ok') {
        fs.writeFileSync(archivo, png);
        fs.writeFileSync(path.join(dir, `${p.nombre}.txt`), texto);
        fs.rmSync(path.join(dir, `fallo-${p.nombre}.png`), { force: true });
      } else {
        fs.writeFileSync(path.join(dir, `fallo-${p.nombre}.png`), png); // evidencia, no se confunde con la captura buena
        if (fs.existsSync(archivo)) veredicto += ' (se conserva la captura buena anterior de hoy)';
      }
      estado[p.nombre] = veredicto;
      textos[p.nombre] = texto;
    }
  } catch (e) {
    estado.error = String((e as Error).message ?? e);
  } finally {
    try { await piloto('/cerrar'); await piloto('/usar', { i: String(idx) }); } catch { /* piloto caído: nada que restaurar */ }
  }
  return { estado, textos };
};

// ------------------------------------------------------------ números públicos
const UA = { 'user-agent': 'Mozilla/5.0', 'accept-language': 'es-CL,es;q=0.9', cookie: 'CONSENT=YES+1; SOCS=CAI' };
const html = async (url: string) => (await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) })).text();
const numero = (s?: string) => {
  if (!s) return null;
  const m = s.match(/([\d.,]+)\s*(K|M|mil|mill)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (/k|mil$/i.test(m[2] ?? '')) n *= 1e3; else if (/m|mill/i.test(m[2] ?? '')) n *= 1e6;
  return Math.round(n);
};

const canalPublico = async () => {
  try {
    const h = await html(`https://www.youtube.com/channel/${CANAL}`);
    const subs = h.match(/"content":"([^"]*?)\s(?:suscriptores?|subscribers?)"/i)?.[1];
    const vids = h.match(/"content":"(\d[\d.,]*)\s(?:videos?)"/i)?.[1];
    return { subs: numero(subs), videosPublicados: numero(vids) };
  } catch (e) { return { subs: null, videosPublicados: null, error: String((e as Error).message) }; }
};

const videoPublico = async (id: string) => {
  try {
    const h = await html(`https://www.youtube.com/watch?v=${id}`);
    const vistas = h.match(/"viewCount":"(\d+)"/)?.[1];
    return {
      vistas: vistas ? Number(vistas) : null,
      titulo: h.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? null,
      publicadoEn: h.match(/"publishDate":"([^"]*)"/)?.[1] ?? null,
      segundos: Number(h.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0) || null,
      privado: /"isPrivate":true/.test(h),
    };
  } catch (e) { return { vistas: null, error: String((e as Error).message) }; }
};

/** Mejor esfuerzo sobre el texto de Studio (se afinará con la primera captura real; el .txt queda guardado). */
const deStudio = (textos: Record<string, string>) => {
  const t = textos['1-overview'] ?? '', m = textos['2-monetizacion'] ?? '';
  const tras = (s: string, re: RegExp) => numero(s.match(re)?.[1]);
  return {
    vistas28d: tras(t, /(?:Views|Visualizaciones)\s*\n?\s*([\d.,]+\s*[KM]?)/i),
    horas28d: tras(t, /(?:Watch time \(hours\)|Tiempo de reproducción \(horas\))\s*\n?\s*([\d.,]+)/i),
    vistas48h: tras(t, /([\d.,]+)\s*\n?\s*(?:Views|Visualizaciones)\s*·?\s*(?:Last 48 hours|Últimas 48 horas)/i),
    ypp: m ? { subs: tras(m, /([\d.,]+)\s*\/\s*1[.,]?000/), vistasShorts90d: tras(m, /([\d.,]+\s*[KM]?)\s*\/\s*10\s*M/i), horas12m: tras(m, /([\d.,]+)\s*\/\s*4[.,]?000/) } : null,
  };
};


// ------------------------------------------------------------ API de YouTube (token propio de Bolita Lab)
interface ApiDatos { subs: number | null; vistasCanal: number | null; videosCanal: number | null; horas28d: number | null; vistas28d: number | null; vistas48h: number | null; vistasVideo: Record<string, number>; notas: string[] }
const porApi = async (ids: string[]): Promise<ApiDatos | null> => {
  const d: ApiDatos = { subs: null, vistasCanal: null, videosCanal: null, horas28d: null, vistas28d: null, vistas48h: null, vistasVideo: {}, notas: [] };
  try {
    if (!existeSecreto(ARCHIVO_TOKEN_YT) || !existeSecreto(ARCHIVO_CLIENTE_YT)) return null;
    const cj = leerJson<{ installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }>(ARCHIVO_CLIENTE_YT);
    const c = cj.installed ?? cj.web!;
    const cliente = new google.auth.OAuth2(c.client_id, c.client_secret);
    const tokens = leerJson<Record<string, unknown>>(ARCHIVO_TOKEN_YT);
    cliente.setCredentials(tokens as never);
    // Si Google refresca el access token, se conserva (mismo criterio que subir.mts: sin pisar emitido_en ni el refresh).
    cliente.on('tokens', (n) => escribirJson(ARCHIVO_TOKEN_YT, { ...leerJson<Record<string, unknown>>(ARCHIVO_TOKEN_YT), ...n }, 0o600));
    const yt = google.youtube({ version: 'v3', auth: cliente });
    const ch = await yt.channels.list({ part: ['statistics'], mine: true });
    const it = ch.data.items?.[0];
    if (it?.id && it.id !== CANAL) { d.notas.push(`el token es de otro canal (${it.id})`); return d; }
    const s = it?.statistics;
    d.subs = s?.subscriberCount != null ? Number(s.subscriberCount) : null; // la API redondea a 3 cifras significativas
    d.vistasCanal = s?.viewCount != null ? Number(s.viewCount) : null;
    d.videosCanal = s?.videoCount != null ? Number(s.videoCount) : null;
    for (let i = 0; i < ids.length; i += 50) {
      const r = await yt.videos.list({ part: ['statistics'], id: ids.slice(i, i + 50) });
      for (const v of r.data.items ?? []) d.vistasVideo[v.id ?? ''] = Number(v.statistics?.viewCount ?? 0);
    }
    try {
      const ya = google.youtubeAnalytics({ version: 'v2', auth: cliente });
      const dia = (off: number) => new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(new Date(Date.now() - off * 864e5));
      const q = async (desde: number) => (await ya.reports.query({ ids: 'channel==MINE', startDate: dia(desde), endDate: dia(0), metrics: 'views,estimatedMinutesWatched' })).data.rows?.[0] as number[] | undefined;
      const r28 = await q(28), r2 = await q(2);
      d.vistas28d = r28?.[0] ?? 0; d.horas28d = Math.round(((r28?.[1] ?? 0) / 60) * 10) / 10; d.vistas48h = r2?.[0] ?? 0;
    } catch (e) {
      d.notas.push(`Analytics no disponible: ${String((e as Error).message).slice(0, 120)} (¿scope yt-analytics.readonly? ver revisar.mts)`);
    }
    return d;
  } catch (e) { d.notas.push(`API falló: ${String((e as Error).message).slice(0, 150)}`); return d.subs != null ? d : null; }
};

const main = async () => {
  const sinCapturas = process.argv.includes('--sin-capturas');
  const cap = sinCapturas ? { estado: 'omitidas (--sin-capturas)' as Resultado | string, textos: {} } : await capturar();
  const canal = await canalPublico();
  const subidos = leerBandeja(true).filter((e) => e.estado === 'subido' && e.videoId);
  const api = await porApi(subidos.map((e) => e.videoId!));
  if (api && api.subs != null) { canal.subs = api.subs; canal.videosPublicados = api.videosCanal; }
  const videos = [];
  for (const e of subidos) {
    const v = await videoPublico(e.videoId!);
    if (api?.vistasVideo[e.videoId!] != null) v.vistas = api.vistasVideo[e.videoId!];
    // `...v` va primero: si fuera al final, su `titulo` (vacío o null mientras el video está programado y la página
    // pública no lo muestra) pisaría el fallback al título de la bandeja.
    videos.push({ ...v, id: e.videoId, bandeja: e.id, titulo: ('titulo' in v && v.titulo) || e.titulo, plantilla: e.plantilla, tipo: e.tipo, publicarEn: e.publicarEn ?? null });
  }
  const previo = path.join(dir, 'metricas.json');
  const anterior = fs.existsSync(previo) ? JSON.parse(fs.readFileSync(previo, 'utf8')) : null;
  const vistasTotales = api?.vistasCanal ?? videos.reduce((s, v) => s + (v.vistas ?? 0), 0);
  const studio = deStudio(cap.textos);
  const datos = {
    fecha, canalId: CANAL, generadoEn: new Date().toISOString(), zona,
    subs: canal.subs, videosPublicados: canal.videosPublicados ?? subidos.length,
    vistasTotales, // suma pública de los videos subidos (equivale a las vistas del canal salvo videos borrados)
    vistas28d: api?.vistas28d ?? studio.vistas28d, vistas48h: api?.vistas48h ?? studio.vistas48h, horasTotales: api?.horas28d ?? studio.horas28d,
    progresoYPP: studio.ypp,
    fuentes: { numeros: api?.subs != null ? 'API de YouTube (Data)' : 'públicos (curl a youtube.com)', studio: 'texto de Studio, mejor esfuerzo', api: api ? (api.vistas28d != null ? 'Data + Analytics' : 'Data (sin Analytics)') : 'sin token / falló', ...(api?.notas.length ? { notas: api.notas } : {}) },
    capturas: cap.estado,
    videos,
    ...(anterior && typeof anterior.capturas === 'object' && typeof cap.estado === 'object' ? { actualizaciones: (anterior.actualizaciones ?? 0) + 1 } : {}),
  };
  escribirJson(previo, datos);
  const caps = typeof cap.estado === 'string' ? cap.estado : `${Object.values(cap.estado).filter((v) => v === 'ok').length}/${PANTALLAS.length} capturas ok`;
  console.log(`MÉTRICAS ${fecha} · ${datos.subs ?? '?'} subs · ${datos.videosPublicados} videos · ${vistasTotales} vistas · ${caps} · ${path.relative(RAIZ, dir)}/`);
};

main().catch((e) => { console.error(`metricas: ${(e as Error).message}`); process.exit(1); });
