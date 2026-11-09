/**
 * Publica un comentario de PRIMER NIVEL en un video del canal (Data API v3, commentThreads.insert):
 *   npx tsx scripts/comentar.mts <videoId> "<texto>" [--dry-run]
 * Uso típico: el comentario fijado de los juegos ("adivina", "apuesta") para abrir la conversación.
 * Necesita el scope youtube.force-ssl en secrets/youtube-token.json (ya autorizado el 2026-11-07).
 * Costo: 50 unidades de cupo por comentario. --dry-run valida y muestra el cuerpo sin tocar la API.
 * Fijarlo arriba no se puede por API: se hace en Studio (Comentarios → ⋮ → Fijar).
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, RAIZ, escribirJson, existeSecreto, leerJson } from './lib/operacion.mjs';

const SCOPE_COMENTAR = 'https://www.googleapis.com/auth/youtube.force-ssl';
const rel = (p: string) => path.relative(RAIZ, p);

const { values: opc, positionals } = parseArgs({
  args: process.argv.slice(2), allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
});
const [videoId, texto] = positionals;
if (!videoId || !texto) { console.error('uso: npx tsx scripts/comentar.mts <videoId> "<texto>" [--dry-run]'); process.exit(2); }
if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) { console.error(`videoId inválido: "${videoId}" (son 11 caracteres [A-Za-z0-9_-])`); process.exit(2); }
if (texto.trim().length === 0 || texto.length > 10000) { console.error('el texto debe tener entre 1 y 10.000 caracteres'); process.exit(2); }

const cuerpo = { snippet: { videoId, topLevelComment: { snippet: { textOriginal: texto } } } };

// ---------------------------------------------------------------- OAuth (mismo patrón que scripts/subir.mts)
interface ClienteJson { installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }

const guardarToken = (tokens: Credentials) => {
  const previo = existeSecreto(ARCHIVO_TOKEN_YT) ? leerJson<Credentials>(ARCHIVO_TOKEN_YT) : {};
  // Conserva emitido_en (caducidad del refresh token): solo se renueva si Google entrega refresh_token nuevo.
  const extra = tokens.refresh_token ? { emitido_en: Date.now() } : {};
  escribirJson(ARCHIVO_TOKEN_YT, { ...previo, ...tokens, ...extra }, 0o600);
};

const clienteAutorizado = (): OAuth2Client => {
  if (!existeSecreto(ARCHIVO_CLIENTE_YT)) throw new Error(`Falta ${rel(ARCHIVO_CLIENTE_YT)} (ver docs/SANTIAGO.md).`);
  if (!existeSecreto(ARCHIVO_TOKEN_YT)) throw new Error(`Falta ${rel(ARCHIVO_TOKEN_YT)}: corre  npx tsx scripts/subir.mts autorizar`);
  const j = leerJson<ClienteJson>(ARCHIVO_CLIENTE_YT);
  const c = j.installed ?? j.web;
  if (!c?.client_id || !c.client_secret) throw new Error(`${rel(ARCHIVO_CLIENTE_YT)} no tiene client_id/client_secret`);
  const cliente = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
  const tokens = leerJson<Credentials>(ARCHIVO_TOKEN_YT);
  if (!tokens.refresh_token) throw new Error(`${rel(ARCHIVO_TOKEN_YT)} no tiene refresh_token: vuelve a correr  subir.mts autorizar`);
  cliente.setCredentials(tokens);
  cliente.on('tokens', (nuevos) => guardarToken(nuevos));
  return cliente;
};

/** Revisa el scope sin imprimir el token. */
const estadoToken = (): string => {
  if (!existeSecreto(ARCHIVO_TOKEN_YT)) return `sin token (${rel(ARCHIVO_TOKEN_YT)} no existe)`;
  const scope = leerJson<Credentials>(ARCHIVO_TOKEN_YT).scope ?? '';
  return scope.includes(SCOPE_COMENTAR) ? 'token con scope force-ssl ✓' : '⚠ el token NO tiene youtube.force-ssl: hay que volver a autorizar';
};

const main = async () => {
  if (opc['dry-run']) {
    console.log(`[dry-run] commentThreads.insert part=snippet (50 unidades)\n${JSON.stringify(cuerpo, null, 2)}\n${estadoToken()}`);
    return;
  }
  const yt = google.youtube({ version: 'v3', auth: clienteAutorizado() });
  try {
    const r = await yt.commentThreads.insert({ part: ['snippet'], requestBody: cuerpo });
    console.log(`comentario publicado: ${r.data.id} → https://www.youtube.com/watch?v=${videoId}&lc=${r.data.snippet?.topLevelComment?.id ?? r.data.id}`);
  } catch (e) {
    const err = e as { code?: number; response?: { data?: { error?: { message?: string; errors?: { reason?: string }[] } } }; message?: string };
    const d = err.response?.data?.error;
    const razon = d?.errors?.[0]?.reason ?? '';
    const pista = razon === 'commentsDisabled' ? ' (el video tiene los comentarios desactivados)'
      : razon === 'insufficientPermissions' || err.code === 403 && /scope/i.test(d?.message ?? '') ? ' (falta el scope force-ssl: vuelve a autorizar)'
      : razon === 'quotaExceeded' ? ' (cupo diario agotado; se reinicia ≈04:00 Chile)'
      : razon === 'videoNotFound' ? ' (¿video privado de otro canal o id mal copiado?)' : '';
    console.error(`✗ ${err.code ? `HTTP ${err.code} ` : ''}${razon ? `${razon}: ` : ''}${d?.message ?? err.message}${pista}`);
    process.exit(1);
  }
};
main();
