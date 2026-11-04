# Auditoría de la API de YouTube — respuestas listas para el formulario

Formulario: <https://support.google.com/youtube/contact/yt_api_form> (entrar con sinostrozadev@gmail.com).
Hasta que Google apruebe, todo video subido por la API queda **privado**; por eso importa.
Lo que sigue son las respuestas, campo por campo, en inglés (Google las revisa en inglés).
Los campos marcados **[SANTIAGO]** solo los sabe él.

## Sección 1 — Request type
- **Reason:** Complete a compliance audit to request additional quota.
  (Es la única vía para que auditen un proyecto nuevo; en quota se pide "no change / default".)

## Sección 2 — Organization and contact
- Applying as: **individual user**
- Full legal name: ver `secrets/datos-legales.txt` (recibido 2026-11-04)
- Organization's legal name: `self`
- Parent company: (vacío)
- Primary website: `https://sinostrozadev.github.io/bolitalab/`
- Country: **Other** → Chile · Street / City / Region / Postal code: ver `secrets/datos-legales.txt`
- Category: **Creator Tools and Services**
- Organization size / type: **Independent Developer / Sole Proprietor**
- Primary contact: Santiago · sinostrozadev@gmail.com (técnico y de negocio: "Same as primary")

## Sección 3 — Business model
- **Description** (≥100 chars):
  > Bolita Lab is a YouTube channel (youtube.com/@bolitalab, channel ID UCi1_1_ItZCLY4axLshZcuZQ) that publishes short animated physics simulations and fun-fact videos in Spanish. The videos are rendered from code with an in-house pipeline (Remotion + Node.js). The API client is an internal command-line tool with a single user — the channel owner — that uploads the rendered videos to the owner's own channel, sets title, description, tags, category and language, and schedules the publication date. It also reads basic statistics of the owner's own videos to plan the weekly calendar. It is not distributed to anyone else, does not access data of other users or channels, and does not store or share any YouTube user data beyond the owner's OAuth token kept locally on the owner's computer.
- Target audience: **internal users** (solo el dueño)
- Monetization: **free service** (no hay producto; es una herramienta interna)
- Google/YouTube representative: **No representative**
- How did you learn about the API: **Google Developer Documentation**
- Content Owner IDs / Google Ads IDs: (vacío)

## Sección 4 — API client overview
- API client name: `Bolita Lab Uploader`
- Contains "YouTube" in the name: **No**
- Primary access URL: `https://sinostrozadev.github.io/bolitalab/`
- Privacy policy URL: `https://sinostrozadev.github.io/bolitalab/privacidad.html`
- Terms of service URL: `https://sinostrozadev.github.io/bolitalab/terminos.html`
- Publicly accessible: **No**
- Demo account: no aplica (herramienta de línea de comandos del propio dueño). En
  "Special instructions for access" pegar:
  > The client is a command-line tool run only by the channel owner. There is no public login. The complete source of the upload script and a screencast of the end-to-end flow (OAuth consent → upload → scheduled publication in YouTube Studio) are attached as evidence.
- Acknowledgment checkbox: marcar.

## Sección 5 — Use cases and quota
- Projects: **1**
- Google Cloud project number: **786643510790** (es el prefijo del client ID; verificar en Cloud Console → Panel)
- Use case category: **Video Uploading & Account Management** + **Internal Company Tool**
- OAuth 2.0 sign-in: **Yes**
- Derived metrics / data storage: "I have read and agree".
- Expected volume: **fewer than 1,000 requests per day**
- Endpoints: `youtube.videos.insert`, `youtube.thumbnails.set`, `youtube.channels.list`, `youtube.videos.list`
- Total quota: **No change / default (10,000)**. Justification:
  > Two uploads per day (≈1,600 units each) plus a handful of list calls: well under 5,000 units/day. We are requesting the compliance audit so that videos uploaded through the API can be published publicly; we do not need more quota.
- `youtube.search.list`: not used (escribir "Not used").
- `youtube.videos.insert` per-day quota: `4000` · justification: la frase de arriba.

## Evidencia que piden (JPEG/PNG o PDF) — la genera Claude en `salida/auditoria/`
1. `privacidad.png` — captura de la política de privacidad publicada.
2. `inicio-con-enlace.png` — captura de la página de inicio mostrando el enlace a la política.
3. `terminos.pdf` — términos de servicio.
4. `oauth-1-cuenta.png`, `oauth-2-aviso.png`, `oauth-3-permisos.png` — flujo OAuth (elección de cuenta de marca, aviso de app en prueba, pantalla de permisos).
5. `subida-studio.png` — un video programado por la API visto en YouTube Studio.
6. `subir.mts.pdf` — el script de subida completo (fuente) y `screencast.mp4` del flujo
   `npx tsx scripts/subir.mts subir --id <id> --publicar-en <fecha>` hasta verlo programado.

## Estado
- 2026-11-04: respuestas redactadas. Falta: publicar el sitio (Santiago crea el repo público
  `sinostrozadev/bolitalab` con GitHub Pages; el contenido ya está listo en `sitio/`),
  capturas y envío (datos legales ya recibidos, en secrets/).
