# Lo que SOLO Santiago puede hacer (checklist, ~35 min en total)

Todo lo demás lo hace la fábrica sola. Marca cada casilla. Los pasos 1–5 son una sola vez;
el 6 es semanal.

Mientras no hagas los pasos 2–4, la fábrica **igual produce**: el diario renderiza los Shorts y
mantiene `salida/bandeja/PARA-SUBIR-A-MANO.md` con título, descripción, hashtags, hora y la ruta
de cada mp4, listos para copiar/pegar en YouTube Studio (2 min por video).

## 1. [ ] Crear el canal @bolitalab (5 min)
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

## 2. [ ] Proyecto de Google Cloud + credencial OAuth (15 min)
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

## 3. [ ] Autorizar la app (2 min)
```bash
cd /home/santiago/idea && npx tsx scripts/subir.mts autorizar
```
Abre la URL que imprime, elige la cuenta dueña del canal y acepta (si sale "Google no verificó esta app":
Avanzado → Ir a Bolita Lab). El código llega solo a `127.0.0.1:8765` (WSL comparte localhost con Windows). Si no
llega, copia de la barra de direcciones el valor `code=...` de la URL final (aunque la página dé error) y pégalo
en la terminal. Debe terminar con `✓ Canal autorizado: Bolita Lab`. Comprueba con `npx tsx scripts/estado.mts`.

## 4. [ ] Solicitar la auditoría de la API (10 min, hazlo apenas tengas el paso 2)
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
3. Es gratis; la respuesta tarda días o semanas. Al aprobarse, los videos nuevos se publican solos. Los que
   quedaron bloqueados hay que volver a subirlos (o, si Studio lo permite, ponerlos públicos a mano).
4. Cuota por defecto: 10.000 unidades/día, ~1.600 por subida (≈6 videos/día): sobra para 2 Shorts diarios.

## 5. [ ] Activar el cron (2 min)
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

## 6. [ ] Revisión semanal (10 min, cada lunes)
1. `cd /home/santiago/idea && npx tsx scripts/estado.mts` → que no haya ✗ (errores, credenciales, huérfanos).
2. YouTube Studio → Analytics → Contenido → Shorts (últimos 7 días). Según `docs/ESTRATEGIA.md` §5:
   - **Visto vs. deslizado:** > 70 % bien; < 55 % → cambiar el gancho de esa plantilla.
   - **Retención media:** > 80 % en simulaciones (`bola`, `carrera`), > 65 % en `dato`.
   - **Suscriptores por cada 1.000 vistas:** > 3 excelente; bajo → reforzar el cierre.
   - **Comentarios:** ¿las carreras generan "yo apoyaba al X"? Si no, el tema no polariza.
   - **Content ID:** 0 reclamos (Studio → Contenido → Derechos de autor).
3. Anota qué plantilla y qué gancho ganaron y pásamelo (o pega capturas): ajusto el backlog, la rotación y
   `contenido/calendario.json` (duplicar lo que retiene > 80 %, matar lo que retiene < 60 %).
4. Domingo/lunes: la compilación semanal queda en `salida/compilaciones/` y al final de
   `PARA-SUBIR-A-MANO.md`. Súbela (`npx tsx scripts/subir.mts subir --compilacion salida/compilaciones/<fecha>-compilacion.mp4`
   cuando la API esté auditada, o a mano). Fija en cada Short un comentario con pregunta (30 s desde el celular).

## Si algo se rompe
- `TOKEN INVÁLIDO O REVOCADO`: borra `secrets/youtube-token.json` y repite el paso 3.
- Dos primeras semanas = 2 Shorts al día (12:00 y 18:00). Si el canal arranca en otra fecha que el 3 de
  noviembre, dime la fecha (o cambia `dobleHasta` en `contenido/calendario.json` a lanzamiento + 13 días).
- Más detalle: `docs/OPERACION.md` → "Fallos típicos".
