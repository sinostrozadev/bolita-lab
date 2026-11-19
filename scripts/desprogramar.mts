/**
 * Quita la programación de un video (lo deja PRIVADO sin publishAt; reversible con reprogramar.mts). No borra nada.
 *   npx tsx scripts/desprogramar.mts <videoId> "<motivo>"
 * Actualiza el json de la bandeja que tenga ese videoId (estado 'desprogramado', motivo) y relee por API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_BANDEJA, escribirJson, leerJson } from './lib/operacion.mjs';
const [id, motivo] = process.argv.slice(2);
if (!id) { console.error('uso: npx tsx scripts/desprogramar.mts <videoId> "<motivo>"'); process.exit(2); }
const cj = leerJson<any>(ARCHIVO_CLIENTE_YT); const c = cj.installed ?? cj.web;
const cli = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tok = leerJson<any>(ARCHIVO_TOKEN_YT); cli.setCredentials(tok); cli.on('tokens', (n) => escribirJson(ARCHIVO_TOKEN_YT, { ...tok, ...n }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cli });
const v = (await yt.videos.list({ part: ['status', 'snippet'], id: [id] })).data.items?.[0];
if (!v) { console.error('no encontrado:', id); process.exit(1); }
console.log(`antes: "${v.snippet?.title}" · ${v.status?.privacyStatus} · publishAt ${v.status?.publishAt ?? '-'}`);
if (v.status?.privacyStatus !== 'private') { console.error('el video ya es público/no listado: no se toca'); process.exit(1); }
await yt.videos.update({ part: ['status'], requestBody: { id, status: { privacyStatus: 'private', publishAt: null as any, selfDeclaredMadeForKids: false, embeddable: v.status?.embeddable, license: v.status?.license, publicStatsViewable: v.status?.publicStatsViewable } } });
const d = (await yt.videos.list({ part: ['status'], id: [id] })).data.items![0].status!;
console.log(`después: ${d.privacyStatus} · publishAt ${d.publishAt ?? '— (sin programar)'}`);
if (d.publishAt) { console.error('✗ sigue con publishAt'); process.exit(1); }
for (const f of fs.readdirSync(DIR_BANDEJA).filter((x) => x.endsWith('.json'))) {
  const ruta = path.join(DIR_BANDEJA, f);
  try {
    const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (j.videoId === id || j.youtubeId === id || String(j.url ?? '').includes(id)) {
      j.estado = 'desprogramado'; j.desprogramado = { fecha: new Date().toISOString(), motivo: motivo ?? '' };
      fs.writeFileSync(ruta, JSON.stringify(j, null, 2) + '\n'); console.log('bandeja:', f);
    }
  } catch { /* json ajeno */ }
}
