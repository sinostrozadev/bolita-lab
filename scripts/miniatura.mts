/**
 * Pone (o cambia) la miniatura personalizada de un video ya subido, por la API (thumbnails.set, 50 unidades).
 *   npx tsx scripts/miniatura.mts <videoId> <ruta.png|jpg>
 * Requiere el canal verificado por teléfono y secrets/youtube-token.json con refresh_token (subir.mts autorizar).
 */
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { ARCHIVO_CLIENTE_YT, ARCHIVO_TOKEN_YT, RAIZ, escribirJson, existeSecreto, leerJson } from './lib/operacion.mjs';

const [videoId, rutaArg] = process.argv.slice(2);
if (!videoId || !rutaArg) { console.error('uso: npx tsx scripts/miniatura.mts <videoId> <imagen>'); process.exit(2); }
const ruta = path.isAbsolute(rutaArg) ? rutaArg : path.join(RAIZ, rutaArg);
if (!fs.existsSync(ruta)) { console.error('no existe', ruta); process.exit(2); }
const bytes = fs.statSync(ruta).size;
if (bytes > 2 * 1024 * 1024) { console.error(`la imagen pesa ${bytes} bytes (> 2 MB): conviértela a JPG`); process.exit(2); }
if (!existeSecreto(ARCHIVO_CLIENTE_YT) || !existeSecreto(ARCHIVO_TOKEN_YT)) { console.error('faltan secrets/youtube-client.json o youtube-token.json'); process.exit(2); }

const cj = leerJson<{ installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }>(ARCHIVO_CLIENTE_YT);
const c = cj.installed ?? cj.web!;
const cliente = new google.auth.OAuth2(c.client_id, c.client_secret, 'http://127.0.0.1:8765');
const tokens = leerJson<Record<string, unknown>>(ARCHIVO_TOKEN_YT);
cliente.setCredentials(tokens);
cliente.on('tokens', (nuevos) => escribirJson(ARCHIVO_TOKEN_YT, { ...tokens, ...nuevos }, 0o600));

const yt = google.youtube({ version: 'v3', auth: cliente });
const r = await yt.thumbnails.set({ videoId, media: { mimeType: /\.jpe?g$/i.test(ruta) ? 'image/jpeg' : 'image/png', body: fs.createReadStream(ruta) } });
const alta = r.data.items?.[0]?.maxres ?? r.data.items?.[0]?.high;
console.log(`✓ miniatura puesta a ${videoId}: ${path.relative(RAIZ, ruta)} (${bytes} bytes) → ${alta?.width}x${alta?.height} ${alta?.url ?? ''}`);
