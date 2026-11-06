/**
 * Subida a YouTube (Data API v3) de los videos de la bandeja.
 *
 *   npx tsx scripts/subir.mts autorizar                      # OAuth2 una sola vez → secrets/youtube-token.json
 *   npx tsx scripts/subir.mts pendientes                     # lista la bandeja con estado 'listo'
 *   npx tsx scripts/subir.mts subir --id <id> | --todos [--publicar-en ISO] [--dry-run]
 *   npx tsx scripts/subir.mts subir --compilacion salida/compilaciones/<x>.mp4
 *   npx tsx scripts/subir.mts exportar                       # salida/bandeja/PARA-SUBIR-A-MANO.md
 *
 * Los videos se suben como PRIVADOS con `publishAt` programado: YouTube los publica solo
 * a la hora de la ranura. OJO: sin la auditoría de cumplimiento del proyecto de Google
 * Cloud, los videos subidos por API quedan bloqueados en privado (ver docs/SANTIAGO.md).
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import {
  ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_BANDEJA, DIR_SECRETS, RAIZ,
  asegurarDirectorios, cargarCalendario, categoriaDe, detectarHuerfanos, enLaNube, escribirJson, existeSecreto, formatoDuracion,
  formatoLocal, guardarEntrada, leerBandeja, leerJson, normalizarHashtag, ordenarParaPublicar, quitarHashtagsFinales,
  siguienteRanura, type Calendario, type EntradaConRuta,
} from './lib/operacion.mjs';

// force-ssl: leer y responder comentarios por API (commentThreads/comments). Al agregar un scope hay que volver a `autorizar`.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.force-ssl'];
const PUERTO = 8765;
const REDIRECT = `http://127.0.0.1:${PUERTO}`;
const TROZO = 8 * 1024 * 1024; // múltiplo de 256 KiB, como exige la API

// ---------------------------------------------------------------- argumentos
const { values: opc, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    todos: { type: 'boolean', default: false },
    'publicar-en': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    compilacion: { type: 'string' },
    ayuda: { type: 'boolean', short: 'h', default: false },
  },
});
const subcomando = positionals[0] ?? (opc.ayuda ? 'ayuda' : 'pendientes');

const AYUDA = `Uso: npx tsx scripts/subir.mts <autorizar|pendientes|subir|exportar> [opciones]
  autorizar                    OAuth2 una vez (navegador → 127.0.0.1:${PUERTO}, o pegar el código) → secrets/youtube-token.json
  pendientes                   lista los 'listo' en orden de calendario con su ranura
  subir --id <id>              sube un video de la bandeja
  subir --todos                sube todos los 'listo', uno por ranura del calendario (rotación bola→dato→carrera)
  subir --compilacion <mp4>    sube un video largo (salida/compilaciones), con su miniatura si la tiene
  --publicar-en <ISO>          hora de publicación (si no, siguiente ranura libre)
  --dry-run                    muestra qué haría sin tocar la API
  exportar                     escribe salida/bandeja/PARA-SUBIR-A-MANO.md (plan B: subir desde YouTube Studio)

OJO: mientras Google no audite el proyecto de la API, todo video subido por API queda
bloqueado en PRIVADO (no se publica aunque tenga publishAt). Ver docs/SANTIAGO.md §4.`;

// ---------------------------------------------------------------- OAuth
interface ClienteJson { installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }

const crearCliente = (): OAuth2Client => {
  if (!existeSecreto(ARCHIVO_CLIENTE_YT)) {
    throw new Error(
      `Falta ${rel(ARCHIVO_CLIENTE_YT)}.\n` +
        `  Descárgalo de Google Cloud Console → Credenciales → "OAuth client ID" (tipo Desktop app)\n` +
        `  y guárdalo ahí con permisos 600. Pasos exactos en docs/SANTIAGO.md.`,
    );
  }
  const j = leerJson<ClienteJson>(ARCHIVO_CLIENTE_YT);
  const c = j.installed ?? j.web;
  if (!c?.client_id || !c.client_secret) throw new Error(`${rel(ARCHIVO_CLIENTE_YT)} no tiene client_id/client_secret (¿es el JSON de un OAuth client ID?)`);
  return new google.auth.OAuth2(c.client_id, c.client_secret, REDIRECT);
};

const guardarToken = (tokens: Credentials) => {
  const previo = existeSecreto(ARCHIVO_TOKEN_YT) ? leerJson<Credentials>(ARCHIVO_TOKEN_YT) : {};
  // emitido_en: para saber cuándo caduca el refresh token (ver caducidadTokenYT en lib/operacion).
  const extra = tokens.refresh_token ? { emitido_en: Date.now() } : {};
  escribirJson(ARCHIVO_TOKEN_YT, { ...previo, ...tokens, ...extra }, 0o600);
};

/** Cliente autenticado, con refresco automático del access token. */
const clienteAutorizado = (): OAuth2Client => {
  const cliente = crearCliente();
  if (!existeSecreto(ARCHIVO_TOKEN_YT)) {
    throw new Error(`Falta ${rel(ARCHIVO_TOKEN_YT)}: corre primero  npx tsx scripts/subir.mts autorizar`);
  }
  const tokens = leerJson<Credentials>(ARCHIVO_TOKEN_YT);
  if (!tokens.refresh_token) throw new Error(`${rel(ARCHIVO_TOKEN_YT)} no tiene refresh_token: vuelve a correr  autorizar`);
  cliente.setCredentials(tokens);
  cliente.on('tokens', (nuevos) => guardarToken(nuevos));
  return cliente;
};

const autorizar = async () => {
  const cliente = crearCliente();
  const url = cliente.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log('\n1) Abre esta URL en un navegador con la cuenta DUEÑA del canal @bolitalab:\n');
  console.log(url + '\n');
  console.log(`2) Acepta los permisos. Google redirige a ${REDIRECT}/?code=...`);
  console.log('   - Si el navegador está en ESTA máquina, el código llega solo.');
  console.log('   - Si está en OTRA, copia el parámetro "code" de la URL final (aunque la página no cargue) y pégalo aquí:\n');

  const codigo = await Promise.race([esperarCodigoServidor(), esperarCodigoStdin()]);
  const { tokens } = await cliente.getToken(codigo);
  cliente.setCredentials(tokens);
  if (!tokens.refresh_token) {
    console.error('⚠ Google no devolvió refresh_token. Revoca el acceso en https://myaccount.google.com/permissions y vuelve a correr autorizar.');
  }
  guardarToken(tokens);
  console.log(`\n✓ Token guardado en ${rel(ARCHIVO_TOKEN_YT)} (permisos 600).`);
  try {
    const yt = google.youtube({ version: 'v3', auth: cliente });
    const r = await yt.channels.list({ part: ['snippet'], mine: true });
    const canal = r.data.items?.[0];
    console.log(canal ? `✓ Canal autorizado: ${canal.snippet?.title} (${canal.snippet?.customUrl ?? canal.id})` : '⚠ La cuenta no tiene canal de YouTube todavía.');
  } catch (e) {
    console.error(`⚠ No pude consultar el canal: ${mensajeError(e)}`);
  }
  process.exit(0);
};

let servidorAuth: http.Server | undefined;
let lectorStdin: readline.Interface | undefined;

const esperarCodigoServidor = () =>
  new Promise<string>((resolver, rechazar) => {
    servidorAuth = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', REDIRECT);
      const code = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (code) {
        res.end('<h2>Listo ✓ Ya puedes cerrar esta pestaña y volver a la terminal.</h2>');
        lectorStdin?.close();
        servidorAuth?.close();
        resolver(code);
      } else {
        res.statusCode = 400;
        res.end(`<h2>Sin código${error ? `: ${error}` : ''}</h2>`);
        if (error) rechazar(new Error(`Google devolvió error=${error}`));
      }
    });
    servidorAuth.on('error', (e) => console.error(`⚠ No pude escuchar en ${REDIRECT} (${e.message}); pega el código a mano.`));
    servidorAuth.listen(PUERTO, '127.0.0.1');
  });

const esperarCodigoStdin = () =>
  new Promise<string>((resolver) => {
    lectorStdin = readline.createInterface({ input: process.stdin, output: process.stdout });
    lectorStdin.question('Código (o Enter para seguir esperando al navegador): ', (texto) => {
      const limpio = texto.trim();
      if (!limpio) return; // sigue esperando al servidor
      const code = limpio.startsWith('http') ? new URL(limpio).searchParams.get('code') ?? limpio : limpio;
      servidorAuth?.close();
      resolver(decodeURIComponent(code));
    });
  });

// ---------------------------------------------------------------- errores de la API
interface ErrorApi { code?: number; response?: { status?: number; data?: { error?: { errors?: Array<{ reason?: string; message?: string }>; message?: string } } }; message?: string }

export const mensajeError = (e: unknown): string => {
  const err = e as ErrorApi;
  const estado = err.response?.status ?? err.code;
  const detalle = err.response?.data?.error;
  const razon = detalle?.errors?.[0]?.reason ?? '';
  const texto = detalle?.message ?? err.message ?? String(e);
  if (razon === 'quotaExceeded' || razon === 'dailyLimitExceeded') {
    return `CUOTA AGOTADA (403 ${razon}): la API da 10.000 unidades/día y cada subida cuesta ~1.600 (≈6 videos/día). ` +
      `Se reinicia a medianoche hora del Pacífico (≈04:00 Chile). Reintenta mañana o pide ampliación de cuota (docs/SANTIAGO.md).`;
  }
  if (razon === 'uploadLimitExceeded') return `LÍMITE DE SUBIDAS del canal (403 uploadLimitExceeded): YouTube limita subidas diarias en canales nuevos; reintenta en 24 h.`;
  if (razon === 'youtubeSignupRequired') return `La cuenta autorizada NO tiene canal de YouTube (youtubeSignupRequired). Crea el canal y vuelve a autorizar.`;
  if (razon === 'forbidden' && /publishAt|schedul/i.test(texto)) return `YouTube rechazó la programación (${texto}). ¿La fecha es futura? ¿El canal está verificado?`;
  if (/invalid_client|unauthorized_client/i.test(texto)) {
    return `CREDENCIAL OAuth INVÁLIDA (${texto}): ${rel(ARCHIVO_CLIENTE_YT)} no corresponde a un cliente "Aplicación de escritorio" vigente. ` +
      `Descárgalo de nuevo (docs/SANTIAGO.md §2), borra ${rel(ARCHIVO_TOKEN_YT)} y corre:  npx tsx scripts/subir.mts autorizar`;
  }
  if (estado === 401 || /invalid_grant|invalid_token|Token has been expired or revoked/i.test(texto)) {
    return `TOKEN INVÁLIDO O REVOCADO (${texto}). Borra ${rel(ARCHIVO_TOKEN_YT)} y corre:  npx tsx scripts/subir.mts autorizar`;
  }
  return `${estado ? `HTTP ${estado} ` : ''}${razon ? `${razon}: ` : ''}${texto}`;
};

// ---------------------------------------------------------------- metadatos
interface Metadatos { title: string; description: string; tags: string[]; categoryId: string }

const metadatosDe = (e: EntradaConRuta): Metadatos => {
  const esShort = e.tipo !== 'largo';
  const hashtags = e.hashtags.map(normalizarHashtag).filter((h) => h.length > 1);
  if (esShort && !hashtags.some((h) => h.toLowerCase() === '#shorts')) hashtags.unshift('#Shorts');
  // Algunos guiones ya traen los hashtags al final de la descripción: se quitan para no duplicarlos.
  const descripcion = `${quitarHashtagsFinales(e.descripcion.trim())}\n\n${[...new Set(hashtags)].join(' ')}`.trim();
  let tags = [...new Set(hashtags.map((h) => h.slice(1)))];
  // YouTube: máx 500 caracteres en tags (contando comas) y 30 por tag.
  tags = tags.filter((t) => t.length <= 30);
  while (tags.join(',').length > 480) tags.pop();
  return {
    title: e.titulo.length > 100 ? e.titulo.slice(0, 97) + '…' : e.titulo,
    description: descripcion.slice(0, 4900),
    tags,
    categoryId: esShort ? categoriaDe(e.plantilla) : '24',
  };
};

// ---------------------------------------------------------------- subida resumable
const subirResumable = async (cliente: OAuth2Client, rutaMp4: string, cuerpo: unknown): Promise<string> => {
  const total = fs.statSync(rutaMp4).size;
  const inicio = await cliente.request<unknown>({
    url: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(total),
    },
    data: cuerpo,
  });
  const sesion = cabecera(inicio.headers, 'location');
  if (!sesion) throw new Error('YouTube no devolvió la URL de sesión resumable');

  const fd = fs.openSync(rutaMp4, 'r');
  try {
    let desde = 0;
    let intentos = 0;
    while (desde < total) {
      const largo = Math.min(TROZO, total - desde);
      const buffer = Buffer.alloc(largo);
      fs.readSync(fd, buffer, 0, largo, desde);
      let r;
      try {
        r = await cliente.request<{ id?: string }>({
          url: sesion,
          method: 'PUT',
          headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${desde}-${desde + largo - 1}/${total}` },
          data: buffer,
          responseType: 'json',
          validateStatus: () => true,
        });
      } catch (e) {
        // Caída de red: preguntamos a YouTube cuánto recibió y seguimos desde ahí.
        if (++intentos > 5) throw e;
        process.stdout.write(`\n  ↻ red caída (${mensajeError(e)}); consultando progreso…\n`);
        desde = await consultarProgreso(cliente, sesion, total);
        await new Promise((ok) => setTimeout(ok, 2000 * intentos));
        continue;
      }
      if (r.status === 308) {
        const rango = cabecera(r.headers, 'range');
        desde = rango ? parseInt(rango.split('-')[1], 10) + 1 : desde + largo;
        progreso(desde, total);
        continue;
      }
      if (r.status === 200 || r.status === 201) {
        progreso(total, total);
        const id = r.data?.id;
        if (!id) throw new Error('Subida completa pero sin id de video en la respuesta');
        return id;
      }
      if (r.status >= 500 && ++intentos <= 5) {
        process.stdout.write(`\n  ↻ HTTP ${r.status}; reintentando…\n`);
        desde = await consultarProgreso(cliente, sesion, total);
        await new Promise((ok) => setTimeout(ok, 2000 * intentos));
        continue;
      }
      const err = new Error(`HTTP ${r.status}`) as ErrorApi & Error;
      err.response = { status: r.status, data: r.data as never };
      throw err;
    }
    throw new Error('La subida terminó sin respuesta final de YouTube');
  } finally {
    fs.closeSync(fd);
  }
};

/** Lee una cabecera venga como Headers (fetch) o como objeto plano. */
const cabecera = (h: unknown, nombre: string): string | undefined => {
  if (h && typeof (h as Headers).get === 'function') return (h as Headers).get(nombre) ?? undefined;
  const o = h as Record<string, string | string[]> | undefined;
  const v = o?.[nombre] ?? o?.[nombre.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};

const consultarProgreso = async (cliente: OAuth2Client, sesion: string, total: number) => {
  const r = await cliente.request({ url: sesion, method: 'PUT', headers: { 'Content-Range': `bytes */${total}` }, data: '', validateStatus: () => true });
  if (r.status === 308) {
    const rango = cabecera(r.headers, 'range');
    return rango ? parseInt(rango.split('-')[1], 10) + 1 : 0;
  }
  return 0;
};

const progreso = (hecho: number, total: number) => {
  const pct = Math.round((hecho / total) * 100);
  const barra = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
  process.stdout.write(`\r  ${barra} ${pct}% (${(hecho / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB)${pct === 100 ? '\n' : ''}`);
};

// ---------------------------------------------------------------- subir
const subirEntrada = async (cliente: OAuth2Client | null, e: EntradaConRuta, publicarEn: Date, dryRun: boolean, zona: string) => {
  const meta = metadatosDe(e);
  const cuerpo = {
    snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId, defaultLanguage: 'es', defaultAudioLanguage: 'es' },
    status: { privacyStatus: 'private', publishAt: publicarEn.toISOString(), selfDeclaredMadeForKids: false, embeddable: true },
  };
  const tam = fs.existsSync(e.rutaMp4) ? (fs.statSync(e.rutaMp4).size / 1048576).toFixed(1) : '?';
  console.log(`\n▶ ${e.id}  (${e.tipo === 'largo' ? 'largo' : e.plantilla}, ${formatoDuracion(e.duracionSeg)}, ${tam} MB)`);
  console.log(`  título:     ${meta.title}`);
  console.log(`  publicar:   ${formatoLocal(publicarEn, zona)}  → publishAt ${cuerpo.status.publishAt}`);
  console.log(`  categoría:  ${meta.categoryId}   tags: ${meta.tags.join(', ')}`);
  if (e.miniatura) console.log(`  miniatura:  ${rutaMiniatura(e) ?? `✗ no existe ${e.miniatura}`}`);
  if (dryRun) {
    console.log(`  descripción:\n${meta.description.split('\n').map((l) => '    ' + l).join('\n')}`);
    console.log('  [dry-run] no se llama a la API.');
    return;
  }
  if (!e.mp4Existe) throw new Error(`no existe el mp4 ${e.rutaMp4}`);
  if (!cliente) throw new Error('sin cliente autorizado');
  try {
    const videoId = await subirResumable(cliente, e.rutaMp4, cuerpo);
    e.estado = 'subido';
    e.videoId = videoId;
    e.publicarEn = publicarEn.toISOString();
    e.subidoEn = new Date().toISOString();
    delete e.error;
    guardarEntrada(e);
    console.log(`  ✓ subido: https://youtu.be/${videoId}  (privado hasta ${formatoLocal(publicarEn, zona)})`);
    await subirMiniatura(cliente, e, videoId);
  } catch (err) {
    const msg = mensajeError(err);
    e.error = `subida: ${msg}`;
    guardarEntrada(e); // sigue en 'listo' para reintentar
    console.error(`  ✗ ${msg}`);
    throw new ErrorSubida(msg, /CUOTA AGOTADA|TOKEN INVÁLIDO|CREDENCIAL OAuth|LÍMITE DE SUBIDAS/.test(msg));
  }
};

/** Miniatura personalizada (compilaciones): thumbnails.set. Un fallo no invalida la subida del video. */
const rutaMiniatura = (e: EntradaConRuta): string | undefined => {
  if (!e.miniatura) return undefined;
  const ruta = path.isAbsolute(e.miniatura) ? e.miniatura : path.join(RAIZ, e.miniatura);
  return fs.existsSync(ruta) ? ruta : undefined;
};

const subirMiniatura = async (cliente: OAuth2Client, e: EntradaConRuta, videoId: string) => {
  const ruta = rutaMiniatura(e);
  if (!ruta) return;
  try {
    const yt = google.youtube({ version: 'v3', auth: cliente });
    await yt.thumbnails.set({
      videoId,
      media: { mimeType: /\.jpe?g$/i.test(ruta) ? 'image/jpeg' : 'image/png', body: fs.createReadStream(ruta) },
    });
    console.log(`  ✓ miniatura: ${rel(ruta)}`);
  } catch (err) {
    // Típico: canal sin verificar por teléfono (no permite miniaturas) o imagen > 2 MB.
    console.error(`  ⚠ miniatura no subida (${mensajeError(err)}). Súbela a mano en Studio: ${ruta}`);
    e.error = `miniatura: ${mensajeError(err)}`;
    guardarEntrada(e);
  }
};

class ErrorSubida extends Error {
  constructor(msg: string, public detener: boolean) { super(msg); }
}

const subir = async () => {
  const dryRun = opc['dry-run'];
  const calendario = cargarCalendario();
  const zona = calendario.zonaHoraria;

  let seleccion: EntradaConRuta[];
  if (opc.compilacion) {
    const rutaMp4 = path.resolve(opc.compilacion);
    const rutaJson = rutaMp4.replace(/\.mp4$/, '.json');
    if (!fs.existsSync(rutaJson)) throw new Error(`No existe ${rutaJson} (lo escribe scripts/compilar.mts)`);
    const todas = leerBandeja(true);
    const e = todas.find((x) => x.rutaJson === rutaJson);
    if (!e) throw new Error(`${rutaJson} no es una entrada de bandeja válida`);
    e.tipo = 'largo';
    seleccion = [e];
  } else {
    if (!dryRun) detectarHuerfanos();
    const bandeja = leerBandeja();
    if (opc.id) {
      const e = bandeja.find((x) => x.id === opc.id);
      if (!e) throw new Error(`No hay ${opc.id}.json en ${rel(DIR_BANDEJA)}`);
      seleccion = [e];
    } else if (opc.todos) {
      seleccion = ordenarParaPublicar(bandeja.filter((x) => x.estado === 'listo' && x.mp4Existe), calendario);
    } else {
      throw new Error('Indica --id <id>, --todos o --compilacion <mp4>.\n' + AYUDA);
    }
  }
  seleccion = seleccion.filter((e) => e.estado !== 'subido' || opc.id);
  if (seleccion.length === 0) {
    console.log('Nada que subir: no hay videos en estado "listo".');
    return;
  }

  let cliente: OAuth2Client | null = null;
  if (!dryRun) {
    try {
      cliente = clienteAutorizado();
    } catch (e) {
      console.error(`✗ ${(e as Error).message}`);
      console.error('  Mientras tanto:  npx tsx scripts/subir.mts exportar  → lista para subir a mano desde YouTube Studio.');
      process.exit(2);
    }
  } else {
    if (!existeSecreto(ARCHIVO_CLIENTE_YT) || !existeSecreto(ARCHIVO_TOKEN_YT)) {
      console.log('[dry-run] AVISO: faltan credenciales de YouTube; una subida real fallaría. Usa `exportar` o sigue docs/SANTIAGO.md.');
    }
    console.log(`[dry-run] ${existeSecreto(ARCHIVO_CLIENTE_YT) ? '✓' : '✗ falta'} ${rel(ARCHIVO_CLIENTE_YT)}   ${existeSecreto(ARCHIVO_TOKEN_YT) ? '✓' : '✗ falta'} ${rel(ARCHIVO_TOKEN_YT)}`);
  }

  const asignadas: Date[] = [];
  const fija = opc['publicar-en'] ? new Date(opc['publicar-en']) : undefined;
  if (fija && fija.getTime() < Date.now() + 15 * 60_000 && !dryRun) throw new Error(`--publicar-en debe ser al menos 15 min en el futuro (YouTube rechaza publishAt pasados).`);
  if (fija && Number.isNaN(fija.getTime())) throw new Error(`--publicar-en inválido: ${opc['publicar-en']} (usa ISO, ej. 2026-11-05T18:00:00-03:00)`);
  if (fija && seleccion.length > 1) console.log(`⚠ --publicar-en con varios videos: el primero a esa hora, el resto en las ranuras siguientes.`);

  let ok = 0, fallos = 0;
  for (const [i, e] of seleccion.entries()) {
    const tipo = e.tipo === 'largo' ? 'largo' : 'short';
    const cuando = fija && i === 0 ? fija : siguienteRanura(fija ?? new Date(), asignadas, calendario, tipo);
    asignadas.push(cuando);
    try {
      await subirEntrada(cliente, e, cuando, dryRun, zona);
      ok++;
    } catch (err) {
      fallos++;
      if (err instanceof ErrorSubida && err.detener) {
        console.error('\nDeteniendo: el resto quedará para la próxima corrida.');
        break;
      }
      if (!(err instanceof ErrorSubida)) console.error(`  ✗ ${(err as Error).message}`);
    }
  }
  console.log(`\n${dryRun ? '[dry-run] ' : ''}${ok} ok, ${fallos} con error.`);
  if (fallos > 0) process.exitCode = 1;
};

// ---------------------------------------------------------------- pendientes / exportar
/**
 * Videos 'listo' con mp4, en orden de publicación (rotación) y con la ranura que les tocaría.
 * En la nube (BOLITA_NUBE=1) el mp4 está en un artifact del run, así que basta el json.
 */
const planPublicacion = (calendario: Calendario, conCompilaciones = false) => {
  const bandeja = leerBandeja(conCompilaciones);
  const conVideo = (e: EntradaConRuta) => e.mp4Existe || enLaNube();
  const shorts = ordenarParaPublicar(bandeja.filter((e) => e.estado === 'listo' && conVideo(e) && e.tipo !== 'largo'), calendario);
  const largos = bandeja.filter((e) => e.estado === 'listo' && conVideo(e) && e.tipo === 'largo');
  const asignadas: Date[] = [];
  const asignadasLargo: Date[] = [];
  const conRanura = (e: EntradaConRuta) => {
    const largo = e.tipo === 'largo';
    const r = siguienteRanura(new Date(), largo ? asignadasLargo : asignadas, calendario, largo ? 'largo' : 'short');
    (largo ? asignadasLargo : asignadas).push(r);
    return { e, ranura: r };
  };
  return { shorts: shorts.map(conRanura), largos: largos.map(conRanura), bandeja };
};

const pendientes = () => {
  const calendario = cargarCalendario();
  const zona = calendario.zonaHoraria;
  const { shorts, largos, bandeja } = planPublicacion(calendario, true);
  if (shorts.length + largos.length === 0) console.log('Bandeja sin videos "listo" con mp4.');
  else console.log(`${shorts.length + largos.length} video(s) listos para subir (en orden de calendario):`);
  for (const { e, ranura } of [...shorts, ...largos]) {
    console.log(`  • ${e.id}  [${e.tipo === 'largo' ? 'largo' : e.plantilla}, ${formatoDuracion(e.duracionSeg)}]  → ${formatoLocal(ranura, zona)}\n      ${e.titulo}${e.error ? `\n      último error: ${e.error}` : ''}`);
  }
  const sinMp4 = bandeja.filter((e) => e.estado === 'listo' && !e.mp4Existe);
  if (sinMp4.length) console.log(`✗ ${sinMp4.length} 'listo' SIN mp4 (huérfanos; el diario los marcará 'error'): ${sinMp4.map((e) => e.id).join(', ')}`);
  console.log(`Además: ${bandeja.filter((e) => e.estado === 'subido').length} subidos, ${bandeja.filter((e) => e.estado === 'error').length} con error.`);
};

export const exportar = (silencioso = false) => {
  const calendario = cargarCalendario();
  const zona = calendario.zonaHoraria;
  const { shorts, largos } = planPublicacion(calendario, true);
  const ruta = path.join(DIR_BANDEJA, 'PARA-SUBIR-A-MANO.md');
  const lineas: string[] = [
    '# Videos listos para subir a mano (YouTube Studio)',
    '',
    `Generado: ${formatoLocal(new Date(), zona)} · ${shorts.length} Short(s)${largos.length ? ` + ${largos.length} video(s) largo(s)` : ''}, en orden de calendario.`,
    '',
    'Cómo: YouTube Studio → **Crear → Subir videos** → elige el archivo indicado. Copia el título y la',
    'descripción **tal cual** (la descripción ya trae los hashtags al final). En "Público": **No, no es',
    'contenido para niños**. En "Más opciones": idioma Español, categoría indicada, etiquetas. En',
    '"Visibilidad": **Programar** con la fecha y hora indicadas (hora de Chile).',
    '',
    'Al terminar, marca cada video como subido para que no vuelva a aparecer: en `salida/bandeja/<id>.json`',
    'cambia `"estado": "listo"` por `"estado": "subido"` y agrega `"publicarEn": "<fecha ISO>"`',
    '(así el calendario sabe que esa ranura ya está ocupada). Si no lo haces, solo se volverá a listar.',
    '',
  ];
  const bloque = (n: number, e: EntradaConRuta, ranura: Date) => {
    const meta = metadatosDe(e);
    lineas.push(
      `## ${n}. ${e.titulo}`,
      '',
      enLaNube()
        ? `- **Archivo:** \`${path.basename(e.rutaMp4)}\` dentro del artifact ${typeof e.artefacto === 'string' ? e.artefacto : '(sin dato: búscalo en los runs de Actions)'}`
        : `- **Archivo:** \`${e.rutaMp4}\``,
      `- **Programar para:** ${formatoLocal(ranura, zona)}`,
      `- **Id:** \`${e.id}\` · **Plantilla:** ${e.tipo === 'largo' ? 'compilación (video largo)' : e.plantilla} · **Duración:** ${formatoDuracion(e.duracionSeg)} · **Categoría:** ${meta.categoryId === '28' ? 'Ciencia y tecnología' : 'Entretenimiento'}`,
      ...(rutaMiniatura(e) ? [`- **Miniatura:** \`${rutaMiniatura(e)}\``] : []),
      '',
      '**Título:**',
      '```',
      meta.title,
      '```',
      '',
      '**Descripción:**',
      '```',
      meta.description,
      '```',
      '',
      '**Hashtags:**',
      '```',
      [...new Set(e.hashtags.map(normalizarHashtag))].join(' '),
      '```',
      '',
      '**Etiquetas** (campo "Etiquetas" de Studio):',
      '```',
      meta.tags.join(', '),
      '```',
      '',
    );
  };
  shorts.forEach(({ e, ranura }, i) => bloque(i + 1, e, ranura));
  if (largos.length) {
    lineas.push('---', '', '# Videos largos (compilaciones)', '');
    largos.forEach(({ e, ranura }, i) => bloque(i + 1, e, ranura));
  }
  if (shorts.length + largos.length === 0) lineas.push('_No hay videos "listo" en la bandeja._', '');
  fs.mkdirSync(DIR_BANDEJA, { recursive: true });
  fs.writeFileSync(ruta, lineas.join('\n'));
  if (!silencioso) console.log(`✓ ${ruta} con ${shorts.length} Short(s)${largos.length ? ` y ${largos.length} largo(s)` : ''}.`);
  return ruta;
};

// ---------------------------------------------------------------- main
const rel = (p: string) => path.relative(RAIZ, p) || p;

const main = async () => {
  asegurarDirectorios();
  fs.mkdirSync(DIR_SECRETS, { recursive: true });
  switch (subcomando) {
    case 'autorizar': return autorizar();
    case 'pendientes': return pendientes();
    case 'subir': return subir();
    case 'exportar': return void exportar();
    case 'ayuda': case 'help': return console.log(AYUDA);
    default: throw new Error(`Subcomando desconocido: ${subcomando}\n${AYUDA}`);
  }
};

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
