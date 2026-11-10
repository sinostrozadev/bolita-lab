/**
 * Cambia título, descripción y (opcional) fecha de publicación de un video ya subido (API videos.update).
 *   npx tsx scripts/metadatos.mts <videoId> --titulo "…" [--descripcion "…"] [--publicar-en ISO]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, escribirJson, leerJson } from './lib/operacion.mjs';
const { values: o, positionals } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { titulo: { type: 'string' }, descripcion: { type: 'string' }, 'publicar-en': { type: 'string' } } });
const id = positionals[0]; if (!id) { console.error('uso: metadatos.mts <videoId> --titulo …'); process.exit(2); }
const cj = leerJson<any>(ARCHIVO_CLIENTE_YT); const c = cj.installed ?? cj.web;
const cli = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tok = leerJson<any>(ARCHIVO_TOKEN_YT); cli.setCredentials(tok); cli.on('tokens', (n) => escribirJson(ARCHIVO_TOKEN_YT, { ...tok, ...n }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cli });
const v = (await yt.videos.list({ part: ['snippet', 'status'], id: [id] })).data.items?.[0];
if (!v) { console.error('no encontrado'); process.exit(1); }
const sn = v.snippet!; const parts: string[] = []; const body: any = { id };
if (o.titulo || o.descripcion) { body.snippet = { title: o.titulo ?? sn.title, description: o.descripcion ?? sn.description, categoryId: sn.categoryId, tags: sn.tags, defaultLanguage: sn.defaultLanguage }; parts.push('snippet'); }
if (o['publicar-en']) { body.status = { privacyStatus: 'private', publishAt: new Date(o['publicar-en']).toISOString(), selfDeclaredMadeForKids: false }; parts.push('status'); }
const r = await yt.videos.update({ part: parts, requestBody: body });
console.log(`✓ ${id} · "${r.data.snippet?.title ?? sn.title}" · publishAt ${r.data.status?.publishAt ?? v.status?.publishAt ?? '-'}`);
