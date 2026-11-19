/**
 * Pone título y descripción traducidos (`localizations`) a un video ya subido, desde el guion del largo.
 *   npx tsx scripts/localizaciones.mts <videoId> contenido/largos/<id>.json
 * El guion trae `localizaciones: { en: { title, description } }`; en la descripción, {CAPITULOS_EN} se reemplaza por los
 * capítulos del plan (public/sim/<id>.json) traducidos con las reglas de abajo (plantilla `eliminacion`/`torneo`).
 * Conserva el snippet (título, descripción, etiquetas, categoría) y fija defaultLanguage=es (requisito de la API).
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, escribirJson, leerJson } from './lib/operacion.mjs';

const [id, rutaGuion] = process.argv.slice(2);
if (!id || !rutaGuion) { console.error('uso: npx tsx scripts/localizaciones.mts <videoId> <guion.json>'); process.exit(2); }
const g = JSON.parse(fs.readFileSync(rutaGuion, 'utf8'));
const loc: Record<string, { title: string; description: string }> = g.localizaciones ?? {};
if (!Object.keys(loc).length) { console.error('el guion no trae "localizaciones"'); process.exit(2); }
const rutaPlan = path.join('public/sim', `${g.id}.json`);
const caps: { seg: number; titulo: string }[] = fs.existsSync(rutaPlan) ? JSON.parse(fs.readFileSync(rutaPlan, 'utf8')).capitulos ?? [] : [];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const REGLAS: [RegExp, string][] = [
  [/^Clasificación: (\d+) países, 5 carreras de 10$/, 'Qualifiers: $1 countries, 5 races of 10'],
  [/Clasificación/g, 'Qualifiers'], [/Repechaje/g, 'Last-chance race'], [/Ronda de 32/g, 'Round of 32'], [/Octavos/g, 'Round of 16'],
  [/Semifinales/g, 'Semifinals'], [/La gran final/g, 'The grand final'], [/El campeón y el podio/g, 'The champion and the podium'],
  [/carrera (\d+) de (\d+)/g, 'race $1 of $2'], [/quedan (\d+)/g, '$1 left'],
];
const traducir = (t: string) => REGLAS.reduce((s, [re, r]) => s.replace(re, r), t);
const capsEn = caps.map((c) => `${mmss(c.seg)} ${traducir(c.titulo)}`).join('\n');
for (const v of Object.values(loc)) v.description = v.description.replace('{CAPITULOS_EN}', capsEn);

const cj = leerJson<any>(ARCHIVO_CLIENTE_YT); const c = cj.installed ?? cj.web;
const cli = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tok = leerJson<any>(ARCHIVO_TOKEN_YT); cli.setCredentials(tok); cli.on('tokens', (n) => escribirJson(ARCHIVO_TOKEN_YT, { ...tok, ...n }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cli });
const v = (await yt.videos.list({ part: ['snippet', 'localizations'], id: [id] })).data.items?.[0];
if (!v) { console.error('no encontrado:', id); process.exit(1); }
const sn = v.snippet!;
await yt.videos.update({ part: ['snippet', 'localizations'], requestBody: { id,
  snippet: { title: sn.title, description: sn.description, tags: sn.tags, categoryId: sn.categoryId, defaultLanguage: 'es', defaultAudioLanguage: sn.defaultAudioLanguage ?? 'es-419' },
  localizations: { ...(v.localizations ?? {}), ...loc },
} });
console.log(`✓ ${id} · localizaciones: ${Object.keys(loc).join(', ')} · "${Object.values(loc)[0].title}" (la API tarda ~1 min en reflejarlo)`);
