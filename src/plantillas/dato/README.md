# Plantilla `dato`

Shorts de "dato sorprendente" con voz en español neutro, subtítulos palabra a palabra, visuales animados, cama musical y SFX sintetizados.

## Flujo
1. Guion en `contenido/guiones/<id>.json` (envoltorio `{plantilla:'dato', titulo, descripcion, hashtags, props}`); `props` = `GuionDato` (`guion.ts`).
2. `npx tsx scripts/preparar-dato.mts contenido/guiones/<id>.json`
   - `scripts/voz.mts`: msedge-tts, un MP3 por línea (0 = gancho, 1..n = escenas, n+1 = remate) en `public/voz/<id>/` + `<n>.json` (sidecar con hash) + `tiempos.json` (duraciones y límites de palabra). Caché por hash de texto+voz+prosodia: si cambias una línea, solo esa se vuelve a sintetizar (si insertas una escena, se rehacen las que cambian de índice).
   - `scripts/sonido-dato.mts`: `public/audio/generado/<id>.wav` (cama + SFX; sin voz).
   - Escribe `salida/trabajo/<id>.props.json` (guion + `duracionFrames` + `tiempos`).
3. Render (RAM justa: mirar `free -m` antes, nunca dos renders a la vez):
   `npx remotion render src/index.ts Dato salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1`
4. `salida/bandeja/<id>.json`: `{ id, plantilla:'dato', titulo, descripcion, hashtags, duracionSeg, estado:'listo' }`.

## Props (`GuionDato`)
`id`, `voz?`, `color` (lima|cian|magenta|naranja|violeta|amarillo), `gancho`, `escenas[3..6] {texto, visual}`, `remate`, `fuentes`.
Visuales:
- `cifra {valor, prefijo?, sufijo?, etiqueta, dice?}`: cuenta con ease-out y aterriza con un rebote amortiguado (1 → 1,08 → 0,98 → 1) + destello. El conteo arranca justo cuando la voz dice el número: por defecto el primer número hablado de la línea; `dice` fuerza la palabra (útil si hay otro número antes, ej. "A setenta por minuto, son unos **cien** mil").
- `comparar {items[{etiqueta,valor,color?}], sufijo?}`: las filas entran en cascada (80 ms) y cada barra crece cuando la voz nombra su etiqueta.
- `escala {items[{etiqueta,radio}]}`: círculos proporcionales que flotan.
- `lista {items}`: tarjetas numeradas que entran cuando se nombran.
- `frase {texto, enfasis?}`: tipografía cinética; el énfasis se enciende en neón cuando la voz lo dice.
- `icono {forma, etiqueta?}` (tierra, luna, sol, corazon, rayo, reloj, persona, bola): glow + halo, respira (escala 1 → 1,03 en 2 s) y cada icono tiene su micro-movimiento.

Los items de lista/comparar/escala (y el énfasis de `frase`) entran cuando la voz dice su primera palabra, así que conviene nombrarlos en el `texto` de la escena.

## Cómo está armado
- `plan.ts` (puro) calcula la línea de tiempo, las palabras enfatizadas de cada escena y los eventos de sonido; lo usan la composición y el script de audio, por eso quedan sincronizados: la palabra enfatizada suena con un tick/pop y hace un pop de escala en el subtítulo (y queda encendida en neón).
- SFX: whoosh en cada cambio de escena, ticks del conteo siguiendo la curva ease-out + tick fuerte al decir el número, pop al aterrizar la cifra o al entrar cada item, riser 0,8 s antes del remate, golpe en gancho y remate, ding final.
- Gancho: `TextoGigante` legible desde el frame 0 (opacidad ≥ 0,88), cada palabra se enciende al decirse. Remate: `TextoGigante` en modo slam con flash del color y anillo de impacto. Luego `<Cierre/>` de 1,2 s.
- Subtítulos: Bricolage 800 a 64 px en páginas de ≤4 palabras, caja oscura redondeada en y = 1290–1550 (dentro de la zona segura). El pop de escala dura 0,28 s y se limita según el ancho de la palabra para no pisar a la vecina.
- Fondo: degradado radial del color a la deriva + 48 partículas deterministas + viñeta. Siempre hay algo moviéndose.
- Duración = voz + pausas de 0,25 s + 72 frames de `<Cierre/>`. `calculateMetadata` lee `voz/<id>/tiempos.json` con fetch (si no existe, estima tiempos para el Studio).
- Audio: la voz va en `<Audio>` por línea (volumen 1); la cama+SFX en otro `<Audio>` (0,9). La cama se sintetiza a 0,09 y los SFX a 0,5, sin normalizar a pico: la cama+SFX queda ~8–10 dB por debajo de la voz (medido: voz ≈ −20 dBFS RMS, cama+SFX ≈ −28/−30 dBFS RMS).
- Duración mínima práctica: el guion debe sumar >= 25 s con voz (los tres primeros videos quedaron en 29–32 s).

## Voz
`es-MX-JorgeNeural` (por defecto, a +6 % de velocidad): clara, neutra y sin marcado acento regional; suena natural con cifras. Alternativas permitidas en `guion.ts`.
Los límites de palabra son **reales** (WordBoundary del servicio, `limitesReales: true` en `tiempos.json`); si faltan, se estiman por longitud (`reales: false`).

## Verificar un video
- Fotogramas: `node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg -ss <seg> -i video.mp4 -frames:v 1 x.png` y comparar la palabra resaltada con `tiempos.json` (inicio de línea + inicio de palabra).
- El ffmpeg de Remotion no trae `volumedetect`: para medir niveles, decodificar a WAV (`-c:a pcm_s16le`) y calcular RMS/pico en Node.
