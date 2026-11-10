# Plantilla `ritmo` (prototipo, 2026-11-09)

Cinco bolitas caen por un mundo vertical lleno de clavijas y **cada choque es una nota**: melodía, bajo, bombo,
caja y platillo. La canción suena a su ritmo real y cada golpe coincide con un choque que parece casualidad.
Es la inversa de `bola`: aquí **la partitura manda** y el nivel se construye para que los choques caigan en el
instante exacto de cada evento.

## Flujo

```bash
npx tsx scripts/preparar-ritmo.mts contenido/backlog/ritmo-creep.json   # sim + wav + props (10–45 s en v3)
npx tsx scripts/verificar-ritmo.mts pendiente-ritmo-creep               # sincronía de TODOS los golpes + geometría: exit 1 si algo falla
flock -w 900 /tmp/bolita-render.lock npx remotion render src/index.ts Ritmo salida/bandeja/<id>.mp4 \
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

`id`, `partitura`, `estilo` (`'plano'` | `'figuras'`, por defecto `'figuras'`; ver v3), `arriba` ("5 bolitas, 1 canción 🎵"), `abajo` ("¿Cuál lleva la melodía? 👇"), `timbre`
(piano|campana|pluck), `revelar` (por defecto sí), `semilla`, `llamado`, `duracionFrames` (lo pone preparar).

## Falta para producción

Integrarla en `scripts/lib/operacion.mts` (`PLANTILLAS`, rotación) y en `diario.mts` (el render debe pasar
`--gl=swangle`), más partituras (Marcha turca, Oda, Para Elisa, Cisnes) y variación visual por video (paletas,
forma de las clavijas, densidad) para no caer en "contenido repetitivo".

## v2 (2026-11-09): figuras, más luz, Creep

- Vista de 1100 u de ancho (cámara cerca), bolitas de r 70–78 (diámetro ≥ 7 % del alto), escalonadas en altura.
- Fondo con más luz (degradado radial violeta, luz hemisférica, niebla luminosa de manchas aditivas), metal claro.
- Clavijas y rieles aparecen por delante de las bolitas (clavija 0,67 s antes de su golpe; riel 0,9 s antes) y se
  disuelven detrás: solo estorban en su ventana de vida. Los defectos se ponderan (bolitas montadas 4, atravesar 2,
  choque sin rebote real 20) y quedan como "avisos" del generador; la sincronía no depende de ellos.
- `RITMO_DIAG=1` cuenta los motivos de rechazo por figura; `RITMO_BOLITAS=n` genera solo las n primeras (pruebas).
- `contenido/partituras/creep.json` (92 bpm, Content ID aceptado por Santiago) y `contenido/backlog/ritmo-creep.json`.

## v3 (2026-11-10): dos estilos, menos amontonado, cero choques

Veredicto de Santiago sobre v2 (Creep, `V-geJGHFy48`): "se ve muy amontonado, hace que no se distinga todo". Se
publica tal cual; para los siguientes videos de este estilo rige v3. Y se conserva el estilo anterior para comparar.

**Dos estilos en la misma plantilla** (prop `estilo`):

- `'plano'` (v1, el del Canon): solo parábolas entre clavijas que se disuelven. Gravedad de v1 a escala de la
  cámara nueva (2050 u/s²). Una nota larga que pediría un rebote imposible usa una clavija-trampolín (sigue siendo
  parábola). Escalonado vertical al 40 %: las franjas ya las separan.
- `'figuras'` (v2 mejorado, por defecto): rieles, zigzag, portales, rizo, columpio y trampolín (gravedad 2800), con
  las reglas nuevas de abajo. Salen del catálogo el `cruce` (invadía el carril vecino) y la `espiral` (la hélice 3D
  proyectada se lee como un riel que se cruza consigo mismo); el código sigue en `figuras-ritmo.mts`.

**Lo que cambió (ambos estilos):**

1. **Franjas disjuntas.** Cada bolita tiene una franja fija para su centro, con ≥ 42 u entre cuerpos vecinos:
   melodía al centro (±110), bajo y bombo a la izquierda, caja y platillo a la derecha. La cámara no se mueve en x.
2. **Tamaño, brillo y color por rol.** Melodía r 74, brillo 1,0, amarillo `#FFE23D`, estela larga y la única con
   luz puntual; bajo r 52 violeta `#9D5CFF`; bombo r 38 rojo `#FF4D5B`; caja r 34 verde `#3DFF8F`; platillo r 28
   cian `#2EF2FF` (percusión con brillo 0,5 y estela corta). El bombo ya no se parece a la melodía (era naranja y casi
   del mismo tamaño). El destello del golpe ya no lleva la bolita ni la clavija a blanco (se perdía el color).
3. **Separación dura entre bolitas** (`Ocupacion`, rejilla espacio-tiempo de 24 u): todo lo que se VE de las
   bolitas ya generadas (camino, clavijas, rieles, paredes, columpios, portales, con su ventana de vida) queda a
   ≥ 18 u de lo nuevo. Ya no es un costo: el candidato que lo viola se descarta y, si un golpe no tiene salida, el
   generador retrocede. La jugada de último recurso es una parábola dentro de la franja, limpia por construcción.
4. **Reserva de carril.** Una figura que sale de su franja no puede entrar en la banda donde estará una bolita que
   se genera DESPUÉS (su línea ± ruido + el ápice de la nota que suena, o su repisa antes de entrar): la percusión,
   que va última y casi sin holgura, siempre tiene su carril libre.
5. **Zona de juego entre los textos.** La bolita entera queda siempre entre el bloque de texto de arriba y el de
   abajo (en v2 la melodía pasaba por detrás de "5 bolitas, 1 canción"). Cada bolita va a la altura en que su
   parábola más alta cabe; si ni así cabe, su gravedad baja lo justo (solo esa bolita: en Creep la melodía tiene
   silencios de 2,6 s y queda en ~1040 en ambos estilos; en el Canon 2050/2186). La cámara sigue la línea de
   descenso (calculada antes del nivel) y no se mueve en x, así el generador sabe exactamente qué entra en cuadro.
6. **Clavijas.** Aparecen 40 frames antes de su golpe pero nunca antes del golpe anterior de su bolita (en un
   redoble se ve una sola por delante). Se comparan con su tamaño real de dibujo (nacen en 12 frames, se disuelven
   en 18). El golpe siguiente no puede quedar casi encima del actual.
7. **Estilo 'figuras' menos amontonado.** A lo más **2 figuras grandes** a la vista en todo el cuadro (rizo, hélice,
   columpio, trampolín y riel serpenteante de más de 520 u) y una por bolita; la percusión solo hace parábola y
   zigzag (paredes de a lo más 2r + 236 u de alto y dentro del cuadro). Rieles: a lo más 2 puntos de paso, radio de
   curvatura ≥ 1,25 r, sin nudos (el tubo no se toca consigo mismo) y dentro de la franja; rizo compacto, dentro de
   la franja. Un objeto nuevo no pisa uno propio que
   todavía se ve. Variedad: solo la melodía exige ≥ 4 figuras y no repetir seguidas; si no cabe otra cosa repite
   parábola y queda como `nota:` (no es un defecto visual).
8. **Verificador independiente** (`verificar-ritmo.mts <id>`): sincronía de TODOS los golpes y auditoría
   geométrica cuadro a cuadro (bolitas que se tocan; bolita que roza o atraviesa clavija, pared, riel o columpio
   ajenos; bolita que atraviesa una clavija propia que no es la de su golpe; fuera de cuadro o tapada por un texto;
   > 2 figuras grandes). Las clavijas se miden con su tamaño de dibujo en ese cuadro.
   Sale con código 1 si queda un solo aviso. Informa el hueco mínimo entre bolitas.
9. **Tiempos.** Generar el nivel bajó de 143 s (Canon v2) / ~150 s (Creep v2) a 3–5 s (Canon) y 3–6 s (Creep):
   la rejilla reemplazó los recorridos por muestras de las otras bolitas (eran el 75 % del tiempo) y las jugadas ya
   no se atascan. Render: una sola luz puntual (la melodía), esferas con menos polígonos según tamaño, estelas
   cortas en la percusión y menos objetos a la vez.
