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
```

Archivos: `scripts/{diario,subir,generar-guiones,compilar,estado}.mts`, utilidades en
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
| Aviso `zod: installed 3.25… required 4.6.7` en renders | Aviso de Remotion por la versión de zod; no bloquea. Los mensajes de error del diario ya lo filtran. |

**Reintentar un guion con error:** mira el motivo en `salida/bandeja/<id>.json`, arregla la causa, borra ese json
(y el mp4 si quedó) y mueve `contenido/guiones/<id>.json` a `contenido/backlog/<plantilla>-<slug>.json`
(el id puede quedarse como está; el diario lo vuelve a fechar). Los 'error' no se reintentan solos para no repetir
un fallo cada noche en silencio; `estado.mts` y los logs los muestran.

**Marcar como subido un video subido a mano:** en su json, `"estado": "subido"` y `"publicarEn": "<ISO>"`
(así esa ranura queda ocupada y el video sale de la lista).

## Cron
`scripts/cron.txt` — copiar a mano con `crontab -e` (no usar `crontab archivo`). Diario 03:30, compilación
domingos 04:30, estado 08:00. La zona del sistema ya es America/Santiago. Rutas absolutas y PATH con
`/home/santiago/.nvm/versions/node/v22.14.0/bin` (node) y `/home/santiago/.local/bin` (claude).
WSL: el cron solo corre con WSL encendido; si la PC estuvo apagada, `npx tsx scripts/diario.mts` a mano recupera el día.

## Agregar una plantilla nueva (`serie`, por ejemplo)
1. `src/plantillas/serie/guion.ts` (schema zod `GuionSerie`; opcional `EnvoltorioSerie`), `index.tsx` con
   `registrar()` y registrarla en `src/Root.tsx` (composición `Serie`).
2. `scripts/preparar-serie.mts <guion.json>` → `salida/trabajo/<id>.props.json`.
3. En `scripts/lib/operacion.mts`: añadir `'serie'` a `PLANTILLAS` (y a `rotacion` del calendario); ajustar
   `categoriaDe` si no es 24.
4. `generar-guiones --plantilla serie` usa `src/plantillas/serie/guion.ts` como texto y como validador real.
