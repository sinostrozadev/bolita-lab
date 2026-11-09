# Plantilla `ritmo` (prototipo, 2026-11-09)

Cinco bolitas caen por un mundo vertical lleno de clavijas y **cada choque es una nota**: melodía, bajo, bombo,
caja y platillo. La canción suena a su ritmo real y cada golpe coincide con un choque que parece casualidad.
Es la inversa de `bola`: aquí **la partitura manda** y el nivel se construye para que los choques caigan en el
instante exacto de cada evento.

## Flujo

```bash
npx tsx scripts/preparar-ritmo.mts contenido/backlog/ritmo-canon.json   # sim + wav + props (≈ 3 s)
npx tsx scripts/verificar-ritmo.mts pendiente-ritmo-canon 10            # sincronía partitura ↔ choque ↔ wav
flock /tmp/bolita-render.lock -w 900 npx remotion render src/index.ts Ritmo salida/bandeja/<id>.mp4 \
  --props=salida/trabajo/<id>.props.json --gl=swangle --concurrency=1
```

**`--gl=swangle` es obligatorio**: Three.js necesita WebGL y en WSL el Chromium headless no tiene GPU
(`--gl=angle`, el valor de `remotion.config.ts`, falla con "Error creating WebGL context"). SwiftShader (WebGL
por CPU) renderiza estable y rápido para esta escena.

## Piezas

- `contenido/partituras/<nombre>.json`: `bpm`, `compas`, `pistas.melodia|bajo` = `[midi, pulsoInicio, duración]`,
  `pistas.ritmo` = `{ tipo: kick|snare|hat, pulso, abierto?, acento? }`. Cada pista es monofónica. Elegir el bpm para que
  la subdivisión más corta caiga en frames enteros a 60 fps (75 bpm → corchea = 24 cuadros; también 90, 100, 120,
  150 → 20, 18, 15, 12). Solo dominio público u obra propia.
- `src/plantillas/ritmo/guion.ts`: schema `GuionRitmo` (props), `EnvoltorioRitmo` (backlog), `PartituraRitmo`, tipos del sim.
- `scripts/simular-ritmo.mts`: el **generador de nivel**. Por golpe i: elige P_{i+1} en el carril y cerca de una
  línea de descenso común (lenta en la intro para que las 5 se vean, rápida cuando entra la percusión),
  `v_out = (P_{i+1} − P_i − ½gΔt²ŷ)/Δt`, normal de la clavija = `normalize(v_out − v_in)` (choque sin fricción con
  restitución e = −v_out·n / v_in·n). Descarta candidatos con e fuera de [0,3; 1,7], choques rasantes, velocidades o
  subidas absurdas, clavijas que se pisan o que atraviesan la trayectoria de cualquier bolita, y bolitas que se
  tocan; gana el de menor costo. Si una bolita queda con reparos, reintenta entera con otro azar (16 intentos, todo
  derivado de la semilla). Las clavijas **se disuelven 0,3 s después de sonar** (dejan una huella tenue): así las
  notas largas pueden lanzar alto sin chocar con clavijas viejas. Tras el golpe final, cámara lenta (×0,35) y se
  revela qué toca cada bolita.
- `scripts/lib/figuras-ritmo.mts`: **catálogo de figuras** entre golpe y golpe (v2, 2026-11-09, tras el veredicto "todo es
  tan lineal"). Cada figura dura exactamente Δt, expone posición(s) continua con velocidad que empata en las uniones
  (curvas de Hermite) y trae su objeto: `parabola` (la de v1), `riel` (curva suave que termina en la clavija), `loop`
  (rizo completo con rapidez física), `zigzag` (rebota entre dos paredes cortas, sin sonido), `pendulo` (una copa
  que viene oscilando la recoge con su misma velocidad y la estrella contra la clavija siguiente), `espiral` (hélice 3D:
  pasa por delante y por detrás), `trampolin` (la clavija de salida es un trampolín: sube ≥ 260 u), `portal` (entra
  por un óvalo y sale por otro) y `cruce` (riel que se desvía por el carril de una vecina y vuelve, a ≥ 0,15 s de
  ella). Δt mínimo por figura en `DT_MIN`. Reglas: nunca la misma figura dos veces seguidas en una bolita, ≥ 4 figuras
  distintas por bolita (las menos usadas se prueban primero). Si un golpe no encuentra camino limpio, el generador
  deshace el golpe anterior y lo rehace (retroceso acotado). Los rieles se dibujan 0,9 s antes de que entre la bolita y
  se disuelven detrás de ella; las paredes del zigzag son sólidas (se verifican contra todas las bolitas).
- `scripts/preparar-ritmo.mts`: síntesis en Node: melodía con `tocar` (piano por defecto), bajo redondo (seno + 2.º
  armónico, ataque 18 ms), bombo (barrido 150→50 Hz), caja (ruido en banda + 180 Hz), platillo (ruido doble paso
  alto; abierto en el golpe final). Paneo por carril y limitador común a los dos canales. Pico −1 dBFS; RMS ≈ −15 dB.
- `scripts/verificar-ritmo.mts`: para n golpes (todas las pistas) mide frame de la partitura, frame del contacto
  geométrico real (holgura con la superficie de la clavija, inversión de la velocidad normal) y ataque en el wav.
- `Ritmo.tsx`: Three.js vía `@remotion/three`. Esferas `MeshPhysicalMaterial` emisivas con luz puntual propia,
  clavijas/pads metálicos que se encienden y se disuelven, "bloom" con sprites aditivos (sin posprocesado), estelas,
  ondas y chispas deterministas, paralaje de puntos en dos planos, niebla, cámara que sigue al centroide con
  retraso (precalculada en el sim), sacudida y destello en el golpe final, rótulos de revelado, bloques de texto
  fijos, llamado a suscribirse 6 s antes del final, marca de agua y cierre.

## Props

`id`, `partitura`, `arriba` ("5 bolitas, 1 canción 🎵"), `abajo` ("¿Cuál lleva la melodía? 👇"), `timbre`
(piano|campana|pluck), `revelar` (por defecto sí), `semilla`, `llamado`, `duracionFrames` (lo pone preparar).

## Falta para producción

Integrarla en `scripts/lib/operacion.mts` (`PLANTILLAS`, rotación) y en `diario.mts` (el render debe pasar
`--gl=swangle`), más partituras (Marcha turca, Oda, Para Elisa, Cisnes) y variación visual por video (paletas,
forma de las clavijas, densidad) para no caer en "contenido repetitivo".
