/**
 * Cambia la fecha de publicación programada de un video YA subido (privado con publishAt) por la API (videos.update, 50 unidades),
 * y actualiza `publicarEn` en su json de la bandeja para que siguienteRanura() lo respete.
 *   npx tsx scripts/reprogramar.mts <videoId> <ISO con offset, ej. 2026-11-17T18:00:00-03:00>
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_BANDEJA, RAIZ, escribirJson, existeSecreto, leerJson } from './lib/operacion.mjs';

const [videoId, iso] = process.argv.slice(2);
if (!videoId || !iso) { console.error('uso: npx tsx scripts/reprogramar.mts <videoId> <ISO>'); process.exit(2); }
const cuando = new Date(iso);
if (Number.isNaN(cuando.getTime()) || cuando.getTime() < Date.now() + 15 * 60_000) { console.error('fecha inválida o a menos de 15 min'); process.exit(2); }
if (!existeSecreto(ARCHIVO_CLIENTE_YT) || !existeSecreto(ARCHIVO_TOKEN_YT)) { console.error('faltan secrets de YouTube'); process.exit(2); }
const cj = leerJson<{ installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }>(ARCHIVO_CLIENTE_YT);
const c = cj.installed ?? cj.web!;
const cliente = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tokens = leerJson<Record<string, unknown>>(ARCHIVO_TOKEN_YT);
cliente.setCredentials(tokens);
cliente.on('tokens', (nuevos) => escribirJson(ARCHIVO_TOKEN_YT, { ...tokens, ...nuevos }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cliente });
const actual = await yt.videos.list({ part: ['status', 'snippet'], id: [videoId] });
const v = actual.data.items?.[0];
if (!v) { console.error('video no encontrado o de otro canal:', videoId); process.exit(1); }
console.log(`${videoId} · "${v.snippet?.title}" · estado ${v.status?.privacyStatus} · publishAt ${v.status?.publishAt ?? '-'}`);
if (v.status?.privacyStatus !== 'private') { console.error('solo se reprograma un video privado programado (este no lo es)'); process.exit(1); }
const r = await yt.videos.update({ part: ['status'], requestBody: { id: videoId, status: { privacyStatus: 'private', publishAt: cuando.toISOString(), selfDeclaredMadeForKids: false } } });
console.log(`✓ publishAt → ${r.data.status?.publishAt}`);
for (const f of fs.readdirSync(DIR_BANDEJA).filter((x) => x.endsWith('.json'))) {
  const ruta = path.join(DIR_BANDEJA, f); const j = leerJson<Record<string, unknown>>(ruta);
  if (j.videoId === videoId) { j.publicarEn = cuando.toISOString(); j.reprogramadoEn = new Date().toISOString(); escribirJson(ruta, j); console.log(`✓ bandeja ${path.relative(RAIZ, ruta)} publicarEn=${j.publicarEn}`); }
}
