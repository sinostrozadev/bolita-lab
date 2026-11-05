# Lo que SOLO Santiago puede hacer (checklist, ~35 min en total)

Todo lo demás lo hace la fábrica sola. Marca cada casilla. Los pasos 1–5 son una sola vez;
el 6 es semanal.

Mientras no hagas los pasos 2–4, la fábrica **igual produce**: el diario renderiza los Shorts y
mantiene `salida/bandeja/PARA-SUBIR-A-MANO.md` con título, descripción, hashtags, hora y la ruta
de cada mp4, listos para copiar/pegar en YouTube Studio (2 min por video).

## 1. [x] Crear el canal @bolitalab — HECHO 2026-11-04 (canal de marca `UCi1_1_ItZCLY4axLshZcuZQ`, https://www.youtube.com/@bolitalab; logo, banner, descripción, país, keywords y audiencia "no para niños" ya configurados)
1. Entra a <https://www.youtube.com> con la cuenta Google que será dueña del canal.
2. Avatar → **Crear un canal** → nombre **Bolita Lab** → Crear.
3. YouTube Studio (<https://studio.youtube.com>) → **Personalización**:
   - **Información básica → Handle:** `@bolitalab` (si está ocupado, `@bolitalab_` y avísame).
   - **Descripción:** copia el párrafo de "Descripción" de `/home/santiago/idea/salida/marca/canal.md`.
     Palabras clave: las de la misma ficha (Configuración → Canal → Información básica).
   - **Foto de perfil:** `/home/santiago/idea/salida/marca/logo.png` (800×800).
   - **Banner:** `/home/santiago/idea/salida/marca/banner.png` (2560×1440, el contenido va en la zona central).
   - Idioma del canal: Español. País: Chile.
4. **Configuración → Canal → Ajustes avanzados:** "No, configurar este canal como contenido que NO es para niños".
5. **Verifica el canal con tu teléfono** (<https://www.youtube.com/verify>): habilita videos de más de 15 min,
   miniaturas personalizadas (las compilaciones suben la suya) y programación.

Desde Windows, los archivos de WSL se abren en el Explorador como
`\\wsl$\Debian\home\santiago\idea\salida\marca\` (o `explorer.exe .` dentro de esa carpeta).

## 2. [x] Proyecto de Google Cloud + credencial OAuth — HECHO 2026-11-04 (proyecto `bolita-lab`, cliente `bolita-lab-desktop`, JSON en `secrets/youtube-client.json`; app en modo Prueba con tu correo como usuario de prueba)
1. <https://console.cloud.google.com/projectcreate> → nombre `bolita-lab` → Crear. Selecciónalo arriba.
2. **Habilitar la API:** <https://console.cloud.google.com/apis/library/youtube.googleapis.com> →
   **YouTube Data API v3** → Habilitar.
3. **Pantalla de consentimiento OAuth:** <https://console.cloud.google.com/apis/credentials/consent>
   - Tipo de usuario: **Externo**. Nombre de la app: `Bolita Lab`. Correo de soporte y de contacto: el tuyo.
   - Alcances: déjalo vacío (la app pide `youtube.upload` y `youtube` al autorizar).
   - **Usuarios de prueba:** agrega **tu correo** (el dueño del canal). Deja la app en modo **Prueba**.
   - Ojo: en modo Prueba el token caduca a los **7 días** (repetir el paso 3). Para que no caduque:
     "Publicar app" (pasar a Producción); al autorizar verás "Google no verificó esta app" → Avanzado → Continuar.
4. **Credencial:** <https://console.cloud.google.com/apis/credentials> → **Crear credenciales → ID de cliente de OAuth**
   → tipo **Aplicación de escritorio** → nombre `bolita-lab-desktop` → Crear → **Descargar JSON**.
5. Guárdalo como `/home/santiago/idea/secrets/youtube-client.json`:
   ```bash
   cp "/mnt/c/Users/<tu-usuario>/Downloads/client_secret_"*.json /home/santiago/idea/secrets/youtube-client.json
   chmod 600 /home/santiago/idea/secrets/youtube-client.json
   ```

## 3. [x] Autorizar la app — HECHO 2026-11-04 (token en `secrets/youtube-token.json`, verificado: la API responde "Bolita Lab @bolitalab")
```bash
cd /home/santiago/idea && npx tsx scripts/subir.mts autorizar
```
Abre la URL que imprime, elige la cuenta dueña del canal y acepta (si sale "Google no verificó esta app":
Avanzado → Ir a Bolita Lab). El código llega solo a `127.0.0.1:8765` (WSL comparte localhost con Windows). Si no
llega, copia de la barra de direcciones el valor `code=...` de la URL final (aunque la página dé error) y pégalo
en la terminal. Debe terminar con `✓ Canal autorizado: Bolita Lab`. Comprueba con `npx tsx scripts/estado.mts`.

## 4. [x] Solicitar la auditoría de la API — ENVIADA el 2026-11-04 (Santiago pulsó Enviar)
Falta solo **Publish app**: el botón está gris hasta completar **Branding** (App name "Bolita Lab", support
email y developer contact = sinostrozadev@gmail.com, home page y enlaces de privacidad/términos del sitio
público, authorized domain `sinostrozadev.github.io`, sin logo). Claude puede rellenar Branding desde el piloto;
el clic de Publish app → Confirm es tuyo. La respuesta de Google llega por correo; al aprobarse:
`touch /home/santiago/idea/secrets/api-auditada` y `BOLITA_SUBIR=1` en GitHub.
Estado 2026-11-04 (histórico): las respuestas están en `docs/AUDITORIA-API.md`, el sitio público con privacidad y
términos ya está en <https://sinostrozadev.github.io/bolitalab/>, y Claude rellena el formulario en el
navegador piloto. **Lo tuyo:** (a) en <https://console.cloud.google.com/auth/audience?project=bolita-lab>
clic en **Publish app** → Confirm (Claude no puede aceptar eso por ti; sin esto el token caduca cada 7 días),
(b) el clic final de **Submit** del formulario cuando Claude te avise que está listo en http://localhost:8777/ver.
**Importante:** mientras el proyecto de Google Cloud no esté auditado, **todo video subido por API queda bloqueado
en privado** (YouTube lo marca "restringido por la política de servicios de la API") y la publicación programada
no ocurre. Hasta que aprueben, sube a mano con `salida/bandeja/PARA-SUBIR-A-MANO.md`.
1. Formulario **"YouTube API Services - Audit and Quota Extension Form"**:
   <https://support.google.com/youtube/contact/yt_api_form>
2. Lo que piden y qué responder:
   - Número/ID del proyecto: el de `bolita-lab` (Cloud Console → Panel).
   - Qué hace la app: "Herramienta interna que sube los Shorts de mi propio canal @bolitalab con título,
     descripción y fecha de publicación programada. Un solo canal, un solo usuario (el dueño). No accede a
     datos de otros usuarios ni los almacena o vende."
   - Métodos de la API: `videos.insert`, `thumbnails.set`, `channels.list` (solo `mine=true`).
   - Enlace al canal y, si lo piden, una captura del flujo (la terminal con `subir`).
3. Es gratis; la respuesta tarda días o semanas. **Al aprobarse:** `touch /home/santiago/idea/secrets/api-auditada`
   (hasta que exista ese archivo el diario NO sube por API: quedaría todo privado y gastaría el cupo diario) y, en la
   nube, `BOLITA_SUBIR=1` (paso 7). Desde ahí los videos nuevos se publican solos. Los que
   quedaron bloqueados hay que volver a subirlos (o, si Studio lo permite, ponerlos públicos a mano).
4. Cuota por defecto: 10.000 unidades/día, ~1.600 por subida (≈6 videos/día): sobra para 2 Shorts diarios.

## 5. [x] Activar el cron — HECHO 2026-11-04 (las 3 líneas instaladas, servicio activo)
```bash
crontab -e
```
Pega **todas** las líneas de `/home/santiago/idea/scripts/cron.txt` desde `SHELL=` hasta el final y guarda.
**No uses `crontab scripts/cron.txt`**: borraría lo que ya tengas en tu crontab.
- Comprueba con `crontab -l`. El servicio cron ya está activo en esta máquina (`systemctl is-active cron`).
- WSL: el cron solo corre si WSL está encendido a las 03:30. Si la PC estuvo apagada,
  `cd /home/santiago/idea && npx tsx scripts/diario.mts` a mano recupera el día.
- `claude` debe tener la sesión iniciada (para generar guiones): si `salida/logs/cron.log` muestra errores de
  `claude -p`, abre `claude` una vez en la terminal.

## 6. [x] Revisión semanal — AHORA LA HACE EL SCRIPT (cron lunes 05:00, `scripts/revisar.mts`)
Desde 2026-11-04 no tienes que revisar nada a mano ni pedírmelo (`docs/MEJORA-CONTINUA.md`). Cada lunes el
script mira los videos de la semana (6 fotogramas por video), baja las métricas por API, me pide la revisión
(3 cosas bien, 5 mejoras), se compara con los Shorts virales del nicho (búsqueda web), propone herramientas
nuevas (instala las gratuitas), evalúa la estrategia y aplica las mejoras que pasan `tsc` + un render de prueba,
con commit propio. Solo te consulta lo que cueste dinero o necesite una cuenta tuya (marcado **requiere a Santiago**).
1. **Lo único que haces:** leer `salida/revisiones/<fecha>.md` (2 min). Ahí están las mejoras, qué se aplicó
   y si algo se revirtió. Para ver qué cambió en el código: `git log --oneline` (commits "revisión semanal …").
2. **Una vez (2 min):** habilitar la **YouTube Analytics API** en el proyecto `bolita-lab` para que la revisión
   tenga retención y suscriptores por video:
   <https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=786643510790>
   → **Habilitar**. No hace falta volver a autorizar.
3. Lo que la API no da y sigue siendo tuyo (opcional, si entras a Studio): **visto vs. deslizado** de Shorts y
   **Content ID** (0 reclamos). Si ves algo raro, pégame la captura.
4. Domingo/lunes: la compilación semanal queda en `salida/compilaciones/` y al final de
   `PARA-SUBIR-A-MANO.md`. Súbela (`npx tsx scripts/subir.mts subir --compilacion salida/compilaciones/<fecha>-compilacion.mp4`
   cuando la API esté auditada, o a mano). Fija en cada Short un comentario con pregunta (30 s desde el celular).

## 7. Producción en la nube (GitHub Actions) — ya funciona sola
Desde el 2026-11-04 los Shorts también se renderizan en GitHub, sin tu PC. Se ven en
<https://github.com/sinostrozadev/bolita-lab/actions> ("Producir Shorts" a diario y con cada push al
backlog; "Compilar semanal" los domingos). Detalle técnico: `docs/OPERACION.md` → "Producción en la nube".

- **Bajar los mp4 de un run:** en la página del run, abajo, sección **Artifacts** → `shorts-<fecha>` (zip
  con los mp4; duran 14 días). O por terminal:
  `gh run download <run-id> -R sinostrozadev/bolita-lab -n shorts-<fecha> -D ~/shorts`.
  Para revisar sin bajar nada: `salida/revisiones/hojas/<id>.jpg` (6 fotogramas por video) en el repo.
- **Lista para subir a mano:** `salida/bandeja/PARA-SUBIR-A-MANO.md` en el repo; cada video dice en qué
  artifact está su mp4.
- **Credenciales de YouTube para la nube** (si las cambias o el token caduca, repite esto desde
  `/home/santiago/idea`):
  ```bash
  gh secret set YOUTUBE_CLIENT_JSON -R sinostrozadev/bolita-lab < secrets/youtube-client.json
  gh secret set YOUTUBE_TOKEN_JSON  -R sinostrozadev/bolita-lab < secrets/youtube-token.json
  ```
- **Encender la subida automática desde la nube** (solo cuando Google apruebe la auditoría del paso 4;
  antes, todo lo subido por API queda privado): Settings → Secrets and variables → Actions → **Variables** →
  `BOLITA_SUBIR` = `1` (hoy está en `0`). Por terminal:
  `gh api -X PATCH repos/sinostrozadev/bolita-lab/actions/variables/BOLITA_SUBIR -f name=BOLITA_SUBIR -f value=1`.
  Al encenderla, apaga la línea del diario en tu `crontab -e` para que no suban los dos.
- **Producir ya, a mano:** Actions → "Producir Shorts" → **Run workflow** (`cuantos`, `subir`).

## Si algo se rompe
- `TOKEN INVÁLIDO O REVOCADO`: borra `secrets/youtube-token.json` y repite el paso 3.
- Dos primeras semanas = 2 Shorts al día (12:00 y 18:00). Si el canal arranca en otra fecha que el 3 de
  noviembre, dime la fecha (o cambia `dobleHasta` en `contenido/calendario.json` a lanzamiento + 13 días).
- Más detalle: `docs/OPERACION.md` → "Fallos típicos".
