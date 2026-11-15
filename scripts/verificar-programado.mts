import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, DIR_BANDEJA, RAIZ, escribirJson, existeSecreto, leerJson } from './lib/operacion.mjs';
/** Verifica por API que un video quedó programado: npx tsx scripts/verificar-programado.mts <videoId> [<videoId>…] */
const ids = process.argv.slice(2);
const cj = leerJson<{ installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }>(ARCHIVO_CLIENTE_YT);
const c = cj.installed ?? cj.web!;
const cliente = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tokens = leerJson<Record<string, unknown>>(ARCHIVO_TOKEN_YT);
cliente.setCredentials(tokens);
cliente.on('tokens', (nuevos) => escribirJson(ARCHIVO_TOKEN_YT, { ...tokens, ...nuevos }, 0o600));
const yt = google.youtube({ version: 'v3', auth: cliente });
const r = await yt.videos.list({ part: ['status', 'snippet', 'contentDetails'], id: ids });
for (const v of r.data.items ?? []) console.log(v.id, '·', v.snippet?.title, '·', v.status?.privacyStatus, '· publishAt', v.status?.publishAt ?? '—', '·', v.status?.uploadStatus, '·', v.contentDetails?.duration);
if ((r.data.items ?? []).length < ids.length) console.log('no encontrados:', ids.filter((i) => !(r.data.items ?? []).some((v) => v.id === i)).join(', '));
