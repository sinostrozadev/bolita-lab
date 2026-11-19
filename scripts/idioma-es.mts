/**
 * Marca el idioma del video y del audio como español (API videos.update, part snippet), conservando título,
 * descripción, etiquetas y categoría. Relee y muestra el resultado.
 *   npx tsx scripts/idioma-es.mts <videoId> [<videoId>…]   (defaultLanguage=es, defaultAudioLanguage=es-419)
 *   npx tsx scripts/idioma-es.mts --leer <videoId>…   (solo muestra; ojo: la API tarda ~1 min en reflejar el cambio)
 * Motivo (2026-11-18): 6 videos quedaron con defaultAudioLanguage=en-US y título en español; YouTube los ofrecía al
 * público equivocado. El resto del canal usa es / es-419.
 */
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, escribirJson, leerJson } from './lib/operacion.mjs';
const soloLeer = process.argv.includes('--leer');
const ids = process.argv.slice(2).filter((a) => a !== '--leer');
if (!ids.length) { console.error('uso: npx tsx scripts/idioma-es.mts <videoId>…'); process.exit(2); }
const cj = leerJson<any>(ARCHIVO_CLIENTE_YT); const c = cj.installed ?? cj.web;
const cli = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tok = leerJson<any>(ARCHIVO_TOKEN_YT); cli.setCredentials(tok); cli.on('tokens', (n) => escribirJson(ARCHIVO_TOKEN_YT, { ...tok, ...n }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cli });
for (const id of ids) {
  const v = (await yt.videos.list({ part: ['snippet'], id: [id] })).data.items?.[0];
  if (!v) { console.error('✗ no encontrado:', id); continue; }
  const sn = v.snippet!;
  const antes = `${sn.defaultLanguage ?? '-'} / ${sn.defaultAudioLanguage ?? '-'}`;
  if (soloLeer) { console.log(`${id} · ${antes} · "${sn.title}"`); continue; }
  await yt.videos.update({ part: ['snippet'], requestBody: { id, snippet: {
    title: sn.title, description: sn.description, tags: sn.tags, categoryId: sn.categoryId,
    defaultLanguage: 'es', defaultAudioLanguage: 'es-419',
  } } });
  const d = (await yt.videos.list({ part: ['snippet'], id: [id] })).data.items![0].snippet!;
  const ok = d.defaultAudioLanguage === 'es-419' && d.title === sn.title && d.description === sn.description;
  console.log(`${ok ? "✓" : "… (la API tarda ~1 min en reflejarlo: confirma con --leer)"} ${id} · "${d.title}" · idioma ${antes} → ${d.defaultLanguage} / ${d.defaultAudioLanguage} · etiquetas ${(d.tags ?? []).length}/${(sn.tags ?? []).length}`);
}
