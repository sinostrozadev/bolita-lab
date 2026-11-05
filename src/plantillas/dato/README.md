# Plantilla `dato`

Shorts de "dato sorprendente" con voz en español neutro, subtítulos palabra a palabra, visuales animados, cama musical y SFX sintetizados.

## Flujo
1. Guion en `contenido/guiones/<id>.json` (envoltorio `{plantilla:'dato', titulo, descripcion, hashtags, props}`); `props` = `GuionDato` (`guion.ts`).
2. `npx tsx scripts/preparar-dato.mts contenido/guiones/<id>.json`
   - `scripts/voz.mts`: msedge-tts, un MP3 por línea (0 = gancho, 1..n = escenas, n+1 = remate) en `public/voz/<id>/` + `<n>.json` (sidecar con hash) + `tiempos.json` (duraciones y límites de palabra). Caché por hash de texto+voz+prosodia: si cambias una línea, solo esa se vuelve a sintetizar (si insertas una escena, se rehacen las que cambian de índice).
   - `scripts/sonido-dato.mts`: `public/audio/generado/<id>.wav` (cama + SFX; sin voz).
   - `scripts/imagenes-dato.mts`: fotos de Wikimedia Commons por escena (ver "Imágenes"), en `public/imagenes/<id>/<n>.jpg` (gitignored).
   - Escribe `salida/trabajo/<id>.props.json` (guion + `duracionFrames` + `tiempos` + `imagenes` + `creditos`).
3. Render (RAM justa: mirar `free -m` antes, nunca dos renders a la vez):
   `npx remotion render src/index.ts Dato salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1`
4. `salida/bandeja/<id>.json`: `{ id, plantilla:'dato', titulo, descripcion, hashtags, duracionSeg, estado:'listo' }`. El diario agrega `creditos` a la descripción (antes de la línea de hashtags).

## Props (`GuionDato`)
`id`, `voz?`, `color` (lima|cian|magenta|naranja|violeta|amarillo), `gancho`, `imagenGancho?`, `escenas[3..6] {texto, visual, imagen?}`, `remate`, `imagenRemate?`, `fuentes`.
Visuales:
- `cifra {valor, prefijo?, sufijo?, etiqueta, dice?}`: cuenta con ease-out y aterriza con un rebote amortiguado (1 → 1,08 → 0,98 → 1) + destello. El conteo arranca al inicio de la escena (nunca queda un "0" quieto en pantalla) y aterriza ~0,35 s después de que la voz dice el número: por defecto el primer número hablado de la línea; `dice` fuerza la palabra (útil si hay otro número antes, ej. "A setenta por minuto, son unos **cien** mil").
- `comparar {items[{etiqueta,valor,color?}], sufijo?}`: las filas entran en cascada (80 ms) y cada barra crece cuando la voz nombra su etiqueta; su valor numérico aparece recién cuando la barra empieza a crecer (no se ve "0" mientras espera).
- `escala {items[{etiqueta,radio}]}`: círculos proporcionales que flotan.
- `lista {items}`: tarjetas numeradas que entran cuando se nombran.
- `frase {texto, enfasis?}`: tipografía cinética; el énfasis se enciende en neón cuando la voz lo dice.
- `icono {forma, etiqueta?}` (tierra, luna, sol, corazon, rayo, reloj, persona, bola): glow + halo, respira (escala 1 → 1,03 en 2 s) y cada icono tiene su micro-movimiento.

Los items de lista/comparar/escala (y el énfasis de `frase`) entran cuando la voz dice su primera palabra, así que conviene nombrarlos en el `texto` de la escena.

## Imágenes (historia visual, desde 2026-11-04)
Cada idea con un sujeto concreto (persona, lugar, objeto, animal, astro) lleva una foto de archivo además del texto: "Cleopatra vivió más cerca del iPhone que de las pirámides" tiene que mostrar a Cleopatra, las pirámides y el iPhone.
- En el guion: `imagen: { buscar, archivo?, forma?, encuadre? }` en la escena, o `imagenGancho` / `imagenRemate`.
  - `buscar`: 2–4 palabras **en inglés**, como los títulos de Commons ("Cleopatra bust", "Great Pyramid of Giza", "Original iPhone").
  - `archivo`: título exacto `File:...` para fijar una foto concreta (recomendado cuando la búsqueda trae algo raro; la licencia se valida igual).
  - `forma`: `marco` (tarjeta redondeada 960×600 arriba; por defecto en escenas), `circulo` (medallón 600 px; retratos, objetos sueltos, astros), `completa` (de fondo, oscurecida; por defecto en gancho/remate).
  - `encuadre`: `arriba` | `centro` | `abajo` (qué parte se conserva al recortar; los retratos usan `arriba` por defecto).
  - **El gancho siempre lleva imagen** (el frame 0 muestra frase + foto). Si es abstracto, un objeto que lo represente ("hourglass" para el tiempo).
  - No pedir imágenes de ideas abstractas en escenas, logos/marcas ni personas vivas en primer plano.
- `scripts/imagenes-dato.mts` (lo llama `preparar-dato`) consulta la API de Commons (`generator=search`, `filetype:bitmap`, User-Agent con contacto) y elige la **primera** que sea jpg/png, con ≥ 1200 px en el lado mayor y licencia **Public domain, CC0, CC BY o CC BY-SA** (rechaza NC, ND y desconocidas). Descarga una miniatura de 1280 px (más grande gasta RAM en el render). Caché en `public/imagenes/<id>/imagenes.json`: si `buscar`/`archivo` no cambian, no vuelve a la red (el video es reproducible aunque Commons cambie). Solo imágenes: `npx tsx scripts/imagenes-dato.mts <guion.json>`. Para sondear búsquedas sin descargar, importar `consultar` + `elegir`.
- Si no hay imagen válida (o Commons no responde), la escena queda con su visual de siempre: nunca rompe el render.
- Créditos: `props.creditos` = "Imágenes: Wikimedia Commons" + una línea por foto (título · autor · licencia (enlace si es BY/BY-SA) · página). El diario lo agrega a la descripción del video.
- Render (`Imagen.tsx`): Ken Burns (zoom 1 → 1,08 + paneo ≤ 2 %, sentido distinto por escena), tinte del neón (soft-light), viñeta hacia el fondo de la paleta, borde neón con glow que respira; entra con resorte (escala + opacidad) y sale con corte limpio. En el gancho la foto ya está al 75 % en el frame 0.
- Composición con foto en marco/círculo: foto en y = 290–890 (debajo de la marca de agua), visual en modo **compacto** en y = 915–1280 (la cifra pierde el anillo y gana una barra neón; los demás visuales se escalan para caber), subtítulos en 1290–1550 como siempre. Con `completa` el visual queda en su franja normal. En gancho/remate con foto en tarjeta, el texto gigante baja 200 px.

## Guion: fórmula narrativa (desde 2026-11-05)
Sacada del referente **Ñerd** (Shorts de mapas/historia, 16 M de vistas en 2 semanas; su más visto, 4,1 M, es "¿Por qué Arizona se quedó a 60 km del mar sin tocarlo?"). `scripts/generar-guiones.mts` la exige en el prompt (`FORMULA_DATO`, solo para `dato`). Misma estructura de props y misma duración (25–58 s):
1. **Gancho** (`gancho`, gigante en el frame 0): imperativo visual ("Mira…", "Fíjate en…") + el dato en ≤ 2 frases + "¿Por qué?". ~90 caracteres máx.; `imagenGancho` muestra lo que se manda a mirar.
2. **Mito** (escena 1): lo que la gente cree → "La verdad es más rara / simple / peor."
3. **Mapa de ruta** (escena 2, si hay 2–3 causas): "Todo se explica con dos cosas: X e Y." y luego "Primero, X." / "Segundo, Y.", una escena por causa.
4. **Fuente nombrada en la voz** ("según la NASA", "según un estudio de la Universidad de X de 2019"), además de `fuentes` y la descripción: da valor educativo propio y protege la monetización.
5. **Giro** (penúltima/última escena): "Y aquí está el giro:" + consecuencia inesperada o inversión.
6. **Remate** (`remate`): una frase simétrica, dos mitades espejo ("X compró el camino del tren. Y se quedó con el camino al mar."). Sin llamados a suscribirse.
7. **Estilo**: concreto, cifras redondeadas en la voz (la exacta puede ir en el visual), sin relleno; una idea = una escena = una imagen. ~90–110 palabras habladas.

## Cómo está armado
- `plan.ts` (puro) calcula la línea de tiempo, las palabras enfatizadas de cada escena y los eventos de sonido; lo usan la composición y el script de audio, por eso quedan sincronizados: la palabra enfatizada suena con un tick/pop y hace un pop de escala en el subtítulo (y queda encendida en neón).
- SFX: whoosh en cada cambio de escena, ticks del conteo siguiendo la curva ease-out + tick fuerte al decir el número, pop al aterrizar la cifra o al entrar cada item, riser 0,8 s antes del remate, golpe en gancho y remate, ding final.
- Gancho: `TextoGigante` legible desde el frame 0 (opacidad ≥ 0,88), cada palabra se enciende al decirse. Remate: `TextoGigante` en modo slam con flash del color y anillo de impacto. Luego `<Cierre/>` de 1,2 s.
- Subtítulos: Bricolage 800 a 64 px en páginas de ≤4 palabras, caja oscura redondeada en y = 1290–1550 (dentro de la zona segura). El pop de escala dura 0,28 s y se limita según el ancho de la palabra para no pisar a la vecina.
- Fondo: degradado radial del color a la deriva + 48 partículas deterministas + viñeta. Siempre hay algo moviéndose.
- Duración = voz + pausas de 0,25 s + 72 frames de `<Cierre/>`. `calculateMetadata` lee `voz/<id>/tiempos.json` con fetch (si no existe, estima tiempos para el Studio).
- Audio: la voz va en `<Audio>` por línea (volumen 1); la cama+SFX en otro `<Audio>` (0,9). La cama se sintetiza a 0,09 y los SFX a 0,5, sin normalizar a pico: la cama+SFX queda ~8–10 dB por debajo de la voz (medido: voz ≈ −20 dBFS RMS, cama+SFX ≈ −28/−30 dBFS RMS).
- Duración mínima práctica: el guion debe sumar >= 25 s con voz (los tres primeros videos quedaron en 29–32 s). `preparar-dato.mts` lo exige: tras generar la voz calcula voz + pausas + cierre y, si queda fuera de 25–58 s, sale con código 1 ("guion demasiado corto: X s, mínimo 25") y no escribe props, así el diario lo marca `error`. Regla práctica: ~90–110 palabras habladas en 6 escenas ≈ 30–38 s (la voz va a ~3 palabras/s).

## Voz
`es-MX-JorgeNeural` (por defecto, a +6 % de velocidad): clara, neutra y sin marcado acento regional; suena natural con cifras. Alternativas permitidas en `guion.ts`.
Los límites de palabra son **reales** (WordBoundary del servicio, `limitesReales: true` en `tiempos.json`); si faltan, se estiman por longitud (`reales: false`).

## Verificar un video
- Fotogramas: `node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg -ss <seg> -i video.mp4 -frames:v 1 x.png` y comparar la palabra resaltada con `tiempos.json` (inicio de línea + inicio de palabra).
- El ffmpeg de Remotion no trae `volumedetect`: para medir niveles, decodificar a WAV (`-c:a pcm_s16le`) y calcular RMS/pico en Node.
