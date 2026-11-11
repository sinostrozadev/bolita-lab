# Plantilla `bola`

Bolita de neón rebotando dentro de un anillo. Cada rebote toca la siguiente nota de una melodía de
dominio público (timbre `pluck`), la bola crece un poco y cambia de color, el anillo destella y
saltan partículas. Dos finales:

- **`escape`**: el anillo tiene un hueco (~37–40°) que gira; la bola termina saliendo por él →
  0,5 s de cámara lenta (el sim integra a 0,12×), zoom 1,15 hacia el punto de fuga y
  "¡ESCAPÓ EN EL REBOTE n!" (+ "escapó la <color> · ¿acertaste?" con varias bolas).
- **`crecer`**: anillo cerrado; la bola crece en cada rebote hasta ocupar el 86 % del radio
  (o, con 2–3 bolas, el 42 %/50 % del área) → la bola se expande hasta tapar la pantalla con su
  color y "LLENÓ EL CÍRCULO / tras n rebotes".

`bolas`: 1–3, con choques elásticos entre ellas (suenan como golpe de ruido).

## Archivos
- `guion.ts`: props zod (`GuionBola`) y forma del sim precalculado (`SimBola`, `EventoSim`).
- `Bola.tsx`: componente. Carga `public/sim/<id>.json` con `staticFile` + `fetch` + `delayRender`;
  `calcularMetadataBola` fija la duración (desde `duracionFrames` de las props o desde el sim).
  Reproduce `public/audio/generado/<id>.wav`.
- `index.tsx`: `registrar()` → composición `Bola` (1080×1920, 60 fps).
- `scripts/simular-bola.mts`: física determinista (paso fijo 1/600 s, `crearAzar(semillaDesde(id))`)
  + síntesis del audio. Busca semilla/giro del hueco/crecimiento hasta que el clímax caiga entre
  25 y 46 s (video total = clímax + 2,5 s de final + 1,2 s de cierre).
- `scripts/preparar-bola.mts <guion.json>`: genera sim, wav y `salida/trabajo/<id>.props.json`.

## Reglas de ritmo (para que suene a música y no a metralleta)
- Un rebote **cuenta** (nota, color, crecimiento, contador) solo si la velocidad normal supera
  260 px/s y pasaron ≥ 40 ms desde el anterior de la misma bola: nada de micro-rebotes contra la pared.
- En `crecer` la velocidad máxima baja a medida que la bola crece (2400 → 650 px/s), así la
  tasa se mantiene en ~3 rebotes/s hasta el final en vez de dispararse.
- Con varias bolas y > 6 rebotes/s, **solo la bola 0 toca la melodía**; las demás suenan como
  golpes suaves. Nunca dos notas a menos de 70 ms.
- Tasas medidas: 1 bola ≈ 2,3–3,2 rebotes/s; 2–3 bolas ≈ 5–10 eventos/s, con la melodía a 2–3,7/s.

## Audio
Notas a 0,45 (×fuerza), cama sub de 55 Hz, riser de 2 s que remata en el clímax, acorde + golpe
en el clímax, "pling" al entrar el cierre. Normalizado con limitador suave: pico ≈ −1,5 dBFS,
RMS ≈ −16/−19 dBFS.

## Visual
Fondo con viñeta radial tintada del color actual; anillo con halo difuso + línea nítida + brillo
interior; flash de 100 ms del color de la bola; bola con degradado radial (brillo arriba-izquierda)
y triple glow; estela de 4 copias; 6–10 partículas por rebote que se apagan en 0,3 s; contador
"REBOTES: n" con pop de escala; `<MarcaDeAgua/>` y `<Cierre/>` en los últimos 72 frames.

## El primer segundo (2026-11-08, rama `primer-segundo`)
Diagnóstico: 55,6 % deslizaba en el 1.er segundo; nuestro frame 0 era ~90 % negro con una bolita del 3 % del alto.
Referente: satisfying.ba11s (círculo al 95 % del ancho saturado de trazas, bola 7–16 % del alto, 2 textos fijos).
- **Tamaño**: anillo R 490 (borde exterior 992 px = 92 % del ancho, centro y 958); bola inicial radio 78
  (8,1 % del alto); en `crecer` termina en el 86 % del radio; en `escape` crece hasta radio 100 y el hueco
  tiene ≥ 30° para que quepa.
- **Trazas** (`trazas`, por defecto sí): cada posición de cada bola queda dibujada como disco de su tamaño
  (relleno hsl 56 % + contorno oscuro de 3 px = "tubos" estriados), tono que deriva 0,35°/frame y salta 31°
  por rebote. Un solo `<canvas>` recortado al anillo, dibujado en `useLayoutEffect`: incremental si el frame
  avanza, desde cero si retrocede. En escape dejan de dibujarse en la salida y un velo oscura el interior
  para que el cartel se lea. La bola viva lleva borde blanco para distinguirse de sus trazas.
- **Cold open** (`coldOpenFrames` = 24 = 0,4 s, `coldOpenDesde` en el sim): el video arranca mostrando el final
  (escape: los 0,4 s antes de salir; crecer: cuando la bola llega a 2/3 del radio, con las trazas ya saturadas)
  con el rótulo "así termina ↓", y corta en seco al inicio. El sim NO incluye esos frames (cuadros/eventos son
  tiempo de simulación); el wav sí (todo corrido 0,4 s) y `duracionFrames` de las props también.
- **Arranque**: la bola parte cerca del fondo cayendo a 1.900–2.200 px/s → 1.er rebote + nota ≈ 100 ms tras el
  corte. El cold open suena desde la muestra 0 (acorde corto del clímax + barrido de "rebobinar" + golpe en el corte).
- **Texto en dos bloques fijos** (frame 0 → cierre, `src/marca/BloqueTexto.tsx`): arriba `ganchoArriba`
  (≤ 9 palabras; si falta, `gancho`), abajo `ganchoAbajo` (≤ 5 palabras; si falta, variante por modo elegida por
  id: `VARIANTES_GANCHO_ABAJO`). Placa oscura semitransparente. El contador "REBOTES n" pasó al centro del anillo.
- Costo medido: render a escala 0,25 de un Short de 38 s = ~2 min (antes ~1,5 min); RAM sin cambios visibles.

## Melodía propia, timbres y juegos (2026-11-09, rama `adivina-la-cancion`)
- **`melodiaNotas`** `{ bpm, notas: [[midi, pulsos], …], compas?, anacrusa?, tonica?, menor?, acordes? }`: alternativa a
  `melodia` (hace falta una de las dos; si vienen ambas manda `melodiaNotas`). Solo **dominio público** u obra propia.
  `acordes` = un acorde por compás `[raíz 0–11, menor]` (en bucle); si falta, `armonizar` elige el grado que mejor cubre el compás.
- **`timbre`**: `pluck` (por defecto, idéntico a antes), `piano` (parciales estirados, golpe + resonancia, batido, martillo)
  o `campana` (tubular, parciales inarmónicos, decaimiento ~2,6 s).
- **`acompanamiento`**: `bajo` (raíz + octava grave) o `acorde` (tríada cerrada) una octava bajo la melodía, timbre suave;
  entra con la nota que abre cada compás y dura hasta el siguiente (nunca pasa del clímax).
- **`juego.tipo = 'adivina'`** `{ pistas: [{ t, texto }] (1–3, ≤ 6 palabras, t = segundo del VIDEO, sin "Pista n:"), cta?, cierre? }`:
  arriba "¿Qué canción es? 🎵" (o `ganchoArriba`), abajo "Escríbela en los comentarios 👇"; las pistas se acumulan bajo el
  bloque de arriba (la nueva resaltada). El clímax NUNCA nombra la canción ("¿La reconociste? Escríbela abajo 👇" + resultado
  chico); título, descripción y hashtags tampoco deben nombrarla. El llamado a suscribirse entra recién en el clímax.
- **`juego.tipo = 'apuesta'`** `{ pregunta, cta?, acierto? }`: arriba la pregunta, abajo "Comenta tu número antes del final 👇",
  a los 3 s "⏳ apuesta ya" 1,5 s; en el clímax el resultado real + "¿Acertaste? 👇".
- Revisar la melodía antes de simular: `npx tsx scripts/escuchar-melodia.mts <guion.json> [--segundos 12] [--salida x.wav]`.
- Comentario fijable del juego: `npx tsx scripts/comentar.mts <videoId> "<texto>" [--dry-run]` (50 unidades; fijarlo, en Studio).

## Uso
Props: `id`, `gancho` (≤ 90), opcionales `ganchoArriba` (≤ 9 palabras), `ganchoAbajo` (≤ 5 palabras), `trazas`, `melodia` (furelise,
marchaturca, odaalegria, canon, cisnes), `modo`, `bolas` (1–3), opcionales `semilla`,
`velocidadHueco`, `anchoHueco`.

```
npx tsx scripts/preparar-bola.mts contenido/guiones/<guion>.json
# antes de renderizar: free -m (available > 1200 MB) y nunca dos renders a la vez
npx remotion render src/index.ts Bola salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1
```

## Adivina sin pistas y CTA largo (2026-11-10, Dragon Ball GT)
`juego.pistas` puede ser `[]` (sin tarjetas de pista) y `juego.cta` acepta hasta 9 palabras / 56 caracteres (pasa a 2 líneas).
El `llamado` de todas las plantillas acepta hasta 64 caracteres (más de 40 → píldora de 2 líneas). Ejemplo:
`contenido/prototipos/cancion-santiago/bola-adivina.json`.
