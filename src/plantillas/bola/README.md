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
"REBOTES: n" con pop de escala; gancho con spring que sale a los 1,5 s; `<MarcaDeAgua/>` y
`<Cierre/>` en los últimos 72 frames.

## Uso
Props: `id`, `gancho` (≤ 90; > 58 caracteres se dibuja más chico), `melodia` (furelise,
marchaturca, odaalegria, canon, cisnes), `modo`, `bolas` (1–3), opcionales `semilla`,
`velocidadHueco`, `anchoHueco`.

```
npx tsx scripts/preparar-bola.mts contenido/guiones/<guion>.json
# antes de renderizar: free -m (available > 1200 MB) y nunca dos renders a la vez
npx remotion render src/index.ts Bola salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1
```
