# Operación de Bolita Lab

Cómo funciona la fábrica día a día. Lo que **solo** puede hacer Santiago está en `docs/SANTIAGO.md`.

## Flujo

```
generar-guiones ─► contenido/backlog/<plantilla>-<slug>.json          (id "pendiente-<plantilla>-<slug>")
        diario ─► promueve a contenido/guiones/<fecha>-<plantilla>-<slug>.json   (id "<fecha>-<plantilla>-<slug>")
               ─► scripts/preparar-<plantilla>.mts <guion>  ─► salida/trabajo/<id>.props.json
               ─► remotion render (--concurrency=1)          ─► salida/bandeja/<id>.mp4 + <id>.json (estado 'listo')
               ─► subir --todos  (o, sin token, solo exportar) ─► YouTube (privado + publishAt) / PARA-SUBIR-A-MANO.md
     compilar ─► salida/compilaciones/<fecha>-compilacion.mp4 + .json (video largo, tipo 'largo')
      revisar ─► salida/revisiones/<fecha>.md (+ fotogramas/, metricas.json) y, si todo queda verde, un commit
                 "revisión semanal <fecha>" con las mejoras (docs/MEJORA-CONTINUA.md)
```

Archivos: `scripts/{diario,subir,generar-guiones,compilar,estado,revisar}.mts`, utilidades en
`scripts/lib/operacion.mts`, calendario en `contenido/calendario.json`, cron en `scripts/cron.txt`.
Logs en `salida/logs/<fecha>.log` (diario) y `salida/logs/cron.log` (todo lo que lanza el cron).

## Comandos

| Qué | Comando |
|---|---|
| Ver todo el estado | `npx tsx scripts/estado.mts` |
| Día completo (render + generar + subir/exportar) | `npx tsx scripts/diario.mts` |
| Solo renderizar (hasta tener 3 'listo') | `npx tsx scripts/diario.mts --solo-render` |
| Renderizar K videos seguidos (aunque ya haya 3) | `npx tsx scripts/diario.mts --solo-render --n K` |
| Solo subir/exportar | `npx tsx scripts/diario.mts --solo-subir` |
| No generar guiones nuevos | `--sin-generar` |
| Ver qué haría sin tocar nada | `--dry-run` |
| Generar guiones | `npx tsx scripts/generar-guiones.mts [--plantilla bola\|dato\|carrera] [--n 5] [--modelo X] [--mostrar-prompt]` |
| Autorizar YouTube (1 vez) | `npx tsx scripts/subir.mts autorizar` |
| Listar pendientes con su ranura | `npx tsx scripts/subir.mts pendientes` |
| Subir uno / todos | `npx tsx scripts/subir.mts subir --id <id>` · `subir --todos [--publicar-en ISO] [--dry-run]` |
| Subir compilación | `npx tsx scripts/subir.mts subir --compilacion salida/compilaciones/<x>.mp4` |
| Lista para subir a mano | `npx tsx scripts/subir.mts exportar` → `salida/bandeja/PARA-SUBIR-A-MANO.md` |
| Compilación | `npx tsx scripts/compilar.mts [--n 14] [--listos] [--ids a,b] [--dry-run]` |
| Revisión semanal (informe + mejoras) | `npx tsx scripts/revisar.mts [--desde AAAA-MM-DD] [--sin-aplicar] [--dry-run] [--excluir ruta1,ruta2] [--modelo opus]` |

Variables: `BOLITA_MEMORIA_MIN_MB` (por defecto 1200), `BOLITA_CONCURRENCIA` (por defecto 1),
`BOLITA_RENDER_MAX_MIN` (por defecto 90), `FFMPEG_BIN` (opcional, ffmpeg alternativo para compilar).

## Contrato con las plantillas
- Guion: `{ plantilla:'bola'|'dato'|'carrera', id, titulo, descripcion, hashtags, props }`; `props.id` = `id`.
- Backlog: `contenido/backlog/<plantilla>-<slug>.json` con id `pendiente-<plantilla>-<slug>`.
  Al promoverlo, el diario quita `pendiente-` y `<plantilla>-` del id y le antepone la fecha:
  `pendiente-carrera-cafe-te-mate` → `2026-11-03-carrera-cafe-te-mate` (si ya existe, sufijo `-2`, `-3`…).
- `scripts/preparar-<plantilla>.mts <guion>` debe escribir `salida/trabajo/<id>.props.json` y salir con 0.
- Render: `remotion render src/index.ts <Bola|Dato|Carrera> salida/bandeja/<id>.mp4 --props=… --codec=h264 --crf=18 --concurrency=1`.
- Metadatos `salida/bandeja/<id>.json`: `{ id, plantilla, titulo, descripcion, hashtags, duracionSeg, estado:'listo'|'subido'|'error', videoId?, publicarEn?, subidoEn?, error? }`.
  El json se escribe **después** del mp4. Un json 'listo' sin mp4 por más de 10 min es un **huérfano**
  (render matado, p. ej. por RAM): `diario`, `estado` y `subir` lo pasan a `estado:'error'`.

## Calendario (`contenido/calendario.json`)
- Normal: 1 Short diario a las **18:00 America/Santiago**; sábados y domingos un 2.º a las **12:00**.
- **Fase doble**: hasta `dobleHasta` (fecha local, inclusive) se usan `ranurasDoble` = **12:00 y 18:00 todos
  los días** (las dos primeras semanas del canal). Está en `2026-11-16`; si el canal arranca otro día, pon
  la fecha de lanzamiento + 13. Para desactivarla: `"dobleHasta": null`.
- Videos largos: `ranurasLargo` (domingo 10:00). No ocupan ranuras de Shorts.
- Rotación `bola → dato → carrera`: al **publicar**, los 'listo' se intercalan en ese orden empezando por la
  plantilla que sigue a la última programada; al **renderizar**, se elige la plantilla con menos 'listo'
  (empate → rotación), para que siempre haya de las tres.
- `siguienteRanura()` (en `lib/operacion.mts`) salta las ranuras ya ocupadas por `publicarEn` de la bandeja
  y exige `margenMinutos` (20) desde ahora. Usa la zona horaria real (horario de verano incluido).
- `minimoBandeja: 3` (videos 'listo' que el diario mantiene), `minimoBacklog: 6`.

## Hito del miércoles: semana asegurada (orden de Santiago, 2026-11-08)
El cupo semanal del Max se renueva los **miércoles**. Cada miércoles en la noche quedan escritos, verificados y dirigidos los guiones de
TODAS las ranuras **jueves → miércoles siguiente**, arrancan los renders (local en serie con el lock; nube donde exista) y el **jueves**
todo está `programado` en Studio con su fecha (tope jue 23:59; resto el viernes con ≥ 72 h de colchón). Solo después el cupo sobrante va a
mejoras o canales nuevos. El bloque "Hito del mié AAAA-MM-DD" arriba de `docs/PLAN-SEMANAL.md` lleva la cuenta; `estado.mts` avisa
"⚠ hito del miércoles" si quedan ranuras sin programar antes del próximo miércoles. Regla: skill `plan-semanal` §5b y `operacion-diaria` §0.

## Qué hace `diario.mts`
1. Lock atómico `salida/diario.lock` con pid (uno huérfano se reemplaza). Nunca hay 2 diarios a la vez.
2. Marca huérfanos (json 'listo' sin mp4) como 'error'.
3. Si hay menos de 3 'listo' (o con `--n K`: K veces): elige guion del backlog, lo promueve, corre
   `preparar-<plantilla>` y renderiza **de a uno**, `--concurrency=1`. Antes de cada render espera a que
   `MemAvailable` > 1200 MB (consulta cada 20 s, máx. 30 min; si no llega, el guion queda 'error').
   Si el render falla (o el kernel lo mata: código 137) reintenta una vez. Cada paso tiene tiempo máximo
   (preparar 20 min, render 90 min, generar 20 min, subir 4 h): un proceso colgado se mata con todo su grupo.
4. Si el backlog tiene menos de 6: `generar-guiones` para las plantillas que menos tienen.
5. Si existe `secrets/youtube-token.json`: `subir --todos`. Siempre: `exportar` (la lista manual queda al día).
6. Un error en un paso se registra y se sigue con el siguiente.

## Subida a YouTube (`subir.mts`)
- OAuth2 de **aplicación instalada** (`secrets/youtube-client.json`, tipo "Aplicación de escritorio").
  `autorizar` abre un servidor en `127.0.0.1:8765` para recibir el código; si el navegador está en otra
  máquina, se pega el `code=` de la URL final en la terminal. El token queda en `secrets/youtube-token.json` (600).
- Cada Short se sube **privado** con `publishAt` = su ranura (YouTube lo publica solo),
  `selfDeclaredMadeForKids:false`, `defaultLanguage:'es'`, categoría **28** (dato) / **24** (bola, carrera,
  compilaciones), tags = hashtags sin `#`, `#Shorts` asegurado en la descripción (los hashtags que el guion
  ya traía al final de la descripción no se duplican). Subida **resumable** en trozos de 8 MiB con reanudación.
- Compilaciones: `subir --compilacion <mp4>`; si su json trae `miniatura`, se sube con `thumbnails.set`
  (requiere canal verificado por teléfono).
- **Sin la auditoría de cumplimiento de Google, todo video subido por API queda bloqueado en PRIVADO**
  (no se publica aunque tenga `publishAt`). Hay que pedirla (`docs/SANTIAGO.md` §4). Hasta entonces, subir a
  mano con `salida/bandeja/PARA-SUBIR-A-MANO.md`.
- Tras subir: `estado:'subido'` + `videoId`, `publicarEn`, `subidoEn`. Si falla, queda 'listo' con `error`.

## Compilación (`compilar.mts`)
Toma los últimos N 'subido' (o 'listo' si no hay subidos; o `--ids`), antepone `salida/marca/intro.mp4` y arma un
1920×1080 a 30 fps: cada vertical centrado sobre una copia de sí mismo muy desenfocada y oscurecida. h264 crf 20
(`-threads 2`), aac 192 kbps. Escribe `salida/compilaciones/<fecha>-compilacion.mp4` + `.json` (título,
descripción con capítulos, `tipo:'largo'`, `miniatura` si existe `salida/marca/miniatura-compilacion.png`).
**Funciona con el ffmpeg que trae Remotion** (no hace falta instalar nada): ffmpeg decodifica a frames crudos
y Node compone el fondo; ~25 fps de proceso, ~300 MB de RAM (10 min de video ≈ 7 min).
Capítulos: YouTube exige ≥ 3, de ≥ 10 s, el primero en 00:00 (la intro se funde con el primero).

## Revisión semanal (`revisar.mts`)
Cumple `docs/MEJORA-CONTINUA.md` §5 sin que nadie lo pida (cron lunes 05:00).
1. **Evidencia:** los Shorts de la bandeja subidos (`subidoEn`) o renderizados (fecha del mp4) desde `--desde`
   (por defecto, últimos 7 días). Por video, 6 fotogramas (0 s, 1,5 s, 25 %, 50 %, 75 %, último) a 540 px →
   `salida/revisiones/<fecha>/fotogramas/<id>-<1..6>.jpg` y una hoja de contacto con los 6 en fila → `<id>-hoja.jpg`.
   Usa el ffmpeg de Remotion (`LD_LIBRARY_PATH` a su carpeta); como ese build no trae `tile`/`hstack`, la hoja
   se compone en Node con frames crudos. No necesita `sharp`.
2. **Métricas (opcional):** Data API `videos.list` (vistas, likes, comentarios) y YouTube Analytics
   (`views`, `averageViewPercentage`, `averageViewDuration`, `subscribersGained` por video) con el mismo token de
   `subir.mts` → `metricas.json`. Si falla (API sin habilitar, sin token, cuota), lo anota con la instrucción
   exacta y sigue. "Visto vs deslizado" no existe en la API: solo en Studio.
3. **Revisión:** `claude -p --model opus --output-format json --permission-mode dontAsk` con el contrato completo,
   los guiones, las métricas y las rutas de las hojas (Claude las abre con Read: ve imágenes). Todo lo que no
   esté en `--allowedTools` se deniega: lectura libre salvo `secrets/`; edición solo en `src/`, `scripts/`,
   `contenido/backlog/`, `contenido/calendario.json`, `package.json`, `docs/DECISIONES.md` y `docs/ESTRATEGIA.md` (nunca `subir.mts`, `revisar.mts`, `MEJORA-CONTINUA.md`);
   Bash solo `npx tsc --noEmit`, `git diff/status` y `ls`. Con `--sin-aplicar`, solo Read/Glob/Grep/WebSearch/WebFetch.
   Cubre también el §2b: busca en la web 5–10 Shorts virales recientes del nicho (WebSearch/WebFetch) y los
   convierte en reglas, propone/adopta herramientas gratuitas y evalúa la estrategia (puede tocar
   `docs/ESTRATEGIA.md` y `contenido/calendario.json` si las métricas lo justifican). El informe trae las secciones
   "Referentes virales", "Herramientas" y "Estrategia". Paquetes npm: Claude los agrega al `package.json` del
   worktree y los declara en un bloque ```` ```instalar ````; **los instala el script** en el checkout principal con
   `npm install --no-save` (Claude no puede correr npm: en el worktree podaría el `node_modules` compartido).
   Lo que cueste dinero o pida una cuenta de Santiago queda marcado **requiere a Santiago**.
4. **Aplicar con red de seguridad:** Claude trabaja en un **git worktree** propio
   (`salida/revisiones/<fecha>/arbol`, rama `revision/<fecha>` desde la rama principal, `node_modules` enlazado),
   así nunca pisa el árbol principal ni lo que otra sesión tenga sin commitear. Luego `tsc --noEmit` en el
   worktree; render de prueba de cada plantilla tocada (detectada con `git status`: `src/plantillas/<p>/`,
   `preparar-/simular-<p>`, y todas si cambia `src/marca`, `src/lib`, `Root.tsx`) con el último guion de esa
   plantilla, `--concurrency=1`, dentro de `flock /tmp/bolita-render.lock` y esperando ≥ 1500 MB libres
   (`BOLITA_REVISION_MEMORIA_MB`), a `salida/pruebas/revision-<fecha>-<p>.mp4`, y exige 25–58 s. Si algo falla:
   `git checkout -- . && git clean -fd` en el worktree y queda anotado. Si todo está verde: commit
   `revisión semanal <fecha>` en la rama y `merge --ff-only` a la rama principal (si git se niega porque pisaría
   cambios locales, la rama queda para mergear a mano). **Nunca push.** El worktree se borra al final.
5. **Informe:** `salida/revisiones/<fecha>.md` (tabla de videos, métricas, la revisión de Claude con
   "3 cosas bien / 5 mejoras / cambios aplicados" y el resultado de cada verificación) + una línea en `cron.log`.

`--dry-run` lista videos, el comando exacto de claude con sus permisos y el plan de git, sin escribir nada.
`--excluir src/plantillas/dato` (o `BOLITA_REVISION_EXCLUIR`) protege carpetas que otra sesión está editando.
Tiempo máximo de claude: `BOLITA_REVISION_CLAUDE_MIN` (60). Log en `salida/logs/revision-<fecha>.log`.

## Fallos típicos

| Síntoma | Causa y arreglo |
|---|---|
| `Falta secrets/youtube-client.json` / `…token.json` | Falta el paso de `docs/SANTIAGO.md`. Mientras tanto el diario mantiene la lista manual. |
| `TOKEN INVÁLIDO O REVOCADO` | Caducó (app en modo Prueba: 7 días) o se revocó. Borrar `secrets/youtube-token.json` y `autorizar`. |
| `CREDENCIAL OAuth INVÁLIDA` | `youtube-client.json` no es un cliente "Aplicación de escritorio" vigente: descargarlo de nuevo. |
| `CUOTA AGOTADA (quotaExceeded)` | 10.000 unidades/día, ~1.600 por subida (≈6/día). Se reinicia a medianoche del Pacífico. El script se detiene y los videos quedan 'listo' para el día siguiente. |
| `LÍMITE DE SUBIDAS` | Canal nuevo/sin verificar: esperar 24 h o verificar el teléfono. |
| Videos subidos pero siguen privados | Falta la auditoría de la API. Subir a mano con la lista exportada. |
| `huérfano: falta <id>.mp4` | El render murió (RAM). Ver "Reintentar" abajo. |
| `⏳ RAM disponible … espero` / `sin RAM suficiente` | Otros procesos (otro render, VS Code, Studio). `free -m`. Se puede bajar el umbral con `BOLITA_MEMORIA_MIN_MB`, con riesgo de que el kernel mate el render. |
| Render con código 137 | El kernel lo mató por falta de RAM: el diario reintenta una vez con concurrency 1. |
| `preparar-dato` falla con error de voz / `msedge-tts` | El servicio de voz Edge (no oficial) cayó o limita. Reintentar más tarde. Plan B en `docs/DECISIONES.md`. |
| `claude -p terminó con código …` al generar | `claude` no está en el PATH del cron (revisar `scripts/cron.txt`) o no hay sesión: correr `claude` una vez a mano. |
| `Ya hay un diario corriendo` | Otro diario vivo (esperar) o lock viejo: se reemplaza solo si el pid no existe. |
| Informe dice `Analytics API: ✗ … has not been used in project` | Habilitar la YouTube Analytics API en el proyecto `bolita-lab` (URL exacta en el informe). No hace falta reautorizar. |
| Revisión: `⚠ no pude hacer fast-forward` | La rama principal avanzó o tiene cambios locales en los mismos archivos. Los cambios quedan en `revision/<fecha>`: `git merge revision/<fecha>`. |
| Actions: `Faltan los secrets YOUTUBE_CLIENT_JSON y/o YOUTUBE_TOKEN_JSON` | Subida encendida sin secrets: cargarlos (docs/SANTIAGO.md) o volver `BOLITA_SUBIR` a `0`. |
| Actions: `✗ no se pudo pushear el estado tras 3 intentos` | Conflicto real con un push humano en los mismos archivos. Los mp4 quedan en el artifact, pero el estado de ese run no llegó al repo: los guiones siguen en el backlog y el próximo run los vuelve a renderizar. Si la subida estaba encendida, revisar en Studio que no queden duplicados. |
| Actions: artifact no sube / "storage quota" | Se llenaron los 500 MB de artifacts del plan gratis: borrar artifacts viejos (Actions → run → Artifacts) o bajar `retention-days`. |
| Aviso `zod: installed 3.25… required 4.6.7` en renders | Aviso de Remotion por la versión de zod; no bloquea. Los mensajes de error del diario ya lo filtran. |

**Reintentar un guion con error:** mira el motivo en `salida/bandeja/<id>.json`, arregla la causa, borra ese json
(y el mp4 si quedó) y mueve `contenido/guiones/<id>.json` a `contenido/backlog/<plantilla>-<slug>.json`
(el id puede quedarse como está; el diario lo vuelve a fechar). Los 'error' no se reintentan solos para no repetir
un fallo cada noche en silencio; `estado.mts` y los logs los muestran.

**Marcar como subido un video subido a mano:** en su json, `"estado": "subido"` y `"publicarEn": "<ISO>"`
(así esa ranura queda ocupada y el video sale de la lista).

## Cron
`scripts/cron.txt` — copiar a mano con `crontab -e` (no usar `crontab archivo`). Diario 03:30, compilación
domingos 04:30, revisión semanal lunes 05:00, estado 08:00. La zona del sistema ya es America/Santiago. Rutas absolutas y PATH con
`/home/santiago/.nvm/versions/node/v22.14.0/bin` (node) y `/home/santiago/.local/bin` (claude).
WSL: el cron solo corre con WSL encendido; si la PC estuvo apagada, `npx tsx scripts/diario.mts` a mano recupera el día.

## Producción en la nube (GitHub Actions)
Para que la fábrica no dependa del PC: los mismos scripts corren en runners de GitHub
(<https://github.com/sinostrozadev/bolita-lab/actions>). El cron local sigue activo hasta la auditoría
de la API (docs/DECISIONES.md, 2026-11-04).

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/producir.yml` ("Producir Shorts") | push a `master` que toque `contenido/backlog/**` o `contenido/calendario.json`; a mano (`cuantos`, `subir`); diario 06:30 UTC (03:30 Chile) | `diario.mts --sin-guiones --cuantos N [--sin-subir]` → `hojas.mts` → artifact + commit del estado |
| `.github/workflows/compilar.yml` ("Compilar semanal") | domingos 07:30 UTC (04:30 Chile) y a mano (`n`) | baja los mp4 de los artifacts `shorts-*` de los últimos 14 días, `compilar.mts --n 14`, `subir exportar` → artifact + commit |

**Reglas del diseño**
- Todo lo que es código corre en Actions; los guiones llegan **ya escritos** al backlog (en la nube no hay
  `claude -p`: se generan en una sesión local o con `generar-guiones` y se pushean). Cada push al backlog
  dispara una producción de 2 Shorts.
- **Estado = archivos commiteados.** Cualquier ejecutor arranca del último `master` y sabe en qué va. El bot
  (`bolita-bot`, mensaje fijo `bot: producción <fecha>` / `bot: compilación <fecha>`) commitea solo:
  `contenido/backlog/` y `contenido/guiones/` (el guion consumido se mueve, como en local),
  `salida/bandeja/<id>.json` (listo/subido, `videoId`, `publicarEn`, `artefacto`),
  `salida/bandeja/PARA-SUBIR-A-MANO.md`, `salida/revisiones/hojas/<id>.jpg` (6 fotogramas en fila, ≤150 KB)
  y `salida/compilaciones/*.json`. Script: `.github/scripts/commit-bot.sh` (`git add -A` de esas rutas,
  `git pull --rebase origin master`, hasta 3 pushes). `.gitignore` deja fuera todo lo pesado de `salida/`.
- **Los mp4 no se commitean**: van al artifact `shorts-<fecha>` (14 días) del run; la compilación a
  `compilacion-<fecha>`. Cada json lleva en `artefacto` el nombre y la URL del run donde está su mp4.
- `BOLITA_NUBE=1` (lo pone el workflow): los json 'listo' sin mp4 son normales (no se marcan huérfanos), un
  render fallido hace fallar el workflow (lo ya producido igual se commitea: los pasos de hojas, artifact y
  commit corren con `always()`), y `exportar` lista los 'listo' cuyo mp4 está en un artifact.
- Sin bucles: el push del bot usa `GITHUB_TOKEN`, que no dispara workflows; además los `paths` no incluyen
  `salida/` y el job se salta si el último commit empieza con `bot:`. Para encadenar workflows: `gh workflow run`.
- `concurrency: producir` (sin cancelar) evita dos producciones a la vez; `timeout-minutes: 90`.
- Runner `ubuntu-latest` (2 vCPU / 7 GB): render con `--concurrency=2` (`BOLITA_CONCURRENCIA=2`). Se instala
  `fonts-noto-color-emoji` (emoji a color de `carrera`) y el Chrome headless con `npx remotion browser ensure`.
  Las fuentes de marca vienen de Google Fonts en tiempo de render (`src/marca/fuentes.ts`): no hay que instalarlas.

**Subida a YouTube (apagada por defecto).** Se enciende si el run se lanza con `subir=true` o si la variable
de repo `BOLITA_SUBIR` vale `1` (Settings → Secrets and variables → Actions → Variables). Entonces el workflow
escribe `secrets/youtube-client.json` y `secrets/youtube-token.json` desde los secrets `YOUTUBE_CLIENT_JSON` y
`YOUTUBE_TOKEN_JSON` (si faltan, falla con mensaje claro), corre el diario sin `--sin-subir` (→ `subir --todos`
de lo renderizado en ese run) y borra `secrets/` al final. Mientras Google no audite el proyecto todo lo que sube
la API queda privado: por eso está en `0`. Solo sube lo renderizado en el mismo run (los 'listo' de runs
anteriores ya no tienen el mp4 en el runner: se suben a mano desde su artifact).

**Comandos útiles**
```bash
gh workflow run producir.yml -f cuantos=1 -f subir=false     # producir ya
gh run list --workflow producir.yml -L 5                      # últimos runs
gh run watch <run-id>   ·   gh run view <run-id> --log-failed
gh run download <run-id> -n shorts-AAAA-MM-DD -D ~/shorts     # bajar los mp4 de un run
gh workflow run compilar.yml -f n=14                          # compilación a mano
```

**Límites (plan gratuito de cuenta personal, repo privado):** 2.000 min/mes de Actions y 500 MB de
almacenamiento de artifacts. Ver "Fallos típicos".
Medido (run de prueba 2026-11-04, 1 Short `dato` de 33 s): **5 min 16 s** en total (preparación ~1 min de
instalación, voz + sonido 4 s, render 4 min 33 s con concurrency 2, hojas/artifact/commit 5 s); el mp4 pesa
~10 MB. Estimado: 2 Shorts/día ≈ 10–11 min por run ≈ 330 min/mes (+ ~10 min por cada push al backlog y
~20–40 min por compilación semanal). Artifacts: ~20 MB/día × 14 días ≈ 280 MB + la compilación.

## Agregar una plantilla nueva (`serie`, por ejemplo)
1. `src/plantillas/serie/guion.ts` (schema zod `GuionSerie`; opcional `EnvoltorioSerie`), `index.tsx` con
   `registrar()` y registrarla en `src/Root.tsx` (composición `Serie`).
2. `scripts/preparar-serie.mts <guion.json>` → `salida/trabajo/<id>.props.json`.
3. En `scripts/lib/operacion.mts`: añadir `'serie'` a `PLANTILLAS` (y a `rotacion` del calendario); ajustar
   `categoriaDe` si no es 24.
4. `generar-guiones --plantilla serie` usa `src/plantillas/serie/guion.ts` como texto y como validador real.

## Métricas diarias (`scripts/metricas.mts`)
Skill global `metricas-diarias`. Guarda en `salida/metricas/AAAA-MM-DD/` cuatro capturas PNG de YouTube Studio
(overview, monetización, alcance, contenido) + su `.txt` + `metricas.json` (subs, vistas totales, vistas 28 d y 48 h,
horas, progreso YPP, por video). Se versiona todo salvo `fallo-*.png`.
- **Cuándo:** cuelga del final de `scripts/estado.mts` (cron 08:00, sin línea nueva). `estado.mts --sin-metricas` la omite.
- **Manual:** `npx tsx scripts/metricas.mts [--sin-capturas] [--fecha AAAA-MM-DD]`. Idempotente (una captura fallida no pisa una buena).
- **Números:** API de YouTube con `secrets/youtube-token.json` (Data: subs [redondeados a 3 cifras], vistas, videos; Analytics:
  vistas 28 d/48 h y horas, que tardan ~48 h en reflejarse); si falla, cae a curl público. `fuentes` del JSON dice cuál se usó.
- **Capturas:** pestaña propia del piloto (:8777), cambia al canal Bolita Lab (`BOLITA_CANAL_ID`, `BOLITA_CANAL_NOMBRE`) si Studio
  pide elegirlo, y restaura la pestaña anterior. Si el piloto está caído, solo queda el JSON.
