# Plantilla `carrera` — "¿Cuál llega primero?"

4–6 bolitas de neón con etiqueta bajan por un tablero tipo Plinko de ~5 pantallas de alto
(clavijas, 3 rampas, 2 embudos, meta a cuadros). La cámara sigue a la líder, el marcador
en vivo muestra el top 3 y la llegada tiene cámara lenta + zoom, confeti y "GANA: <etiqueta>".

## Flujo
```bash
# 1. Física + audio + props (≈2 s)
npx tsx scripts/preparar-carrera.mts contenido/guiones/<id>.json
#    → public/sim/<id>.json · public/audio/generado/<id>.wav · salida/trabajo/<id>.props.json
# 2. Prueba (siempre --concurrency=1: la máquina tiene poca RAM)
npx remotion render src/index.ts Carrera salida/pruebas/<id>.mp4 --props=salida/trabajo/<id>.props.json --scale=0.5 --concurrency=1
# 3. Final
npx remotion render src/index.ts Carrera salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1
```
`scripts/simular-carrera.mts <guion>` hace solo el paso de física + audio.

## Props (`GuionCarrera`, en `guion.ts`)
| campo | qué es |
|---|---|
| `id` | nombra `public/sim/<id>.json` y el wav |
| `gancho` | pregunta en pantalla los primeros 1,5 s (≤60 car.) |
| `participantes` | 4–6 `{ etiqueta (≤18), color: lima·cian·magenta·naranja·violeta·amarillo, icono? }` |
| `semilla?` | si falta, `semillaDesde(id)` |
| `tema?` | informativo |
| `extras?` | v2: bloques con vida, tubos y avisos. Ausente = activados; `false` = tablero clásico (idéntico al v1, mismo azar) |

Los guiones del backlog (`contenido/backlog/carrera-<slug>.json`) llevan `id` = nombre de
archivo: el pipeline le quita `carrera-` y antepone la fecha al promover.
**Colores:** si la etiqueta ES un color (p. ej. "AMARILLO"), usa ese neón; nunca "ROJO" en cian.

## Iconos: identidad visual de cada competidor (2026-11-04)
Cada participante lleva `icono` (schema `IconoCompetidor` en `guion.ts`). Se ve dentro de la
bolita (≈55 % del diámetro, centrado, sin rotar), en su etiqueta, en la mini-bolita del marcador
y grande en el final, donde "salta" con `spring` al llegar la ganadora al centro.

| tipo | ejemplo | cuándo |
|---|---|---|
| `marca` | `{ "tipo": "marca", "slug": "apple" }` | el competidor ES una marca. Slug = archivo de [simple-icons](https://simpleicons.org) (CC0). **No existen**: xbox, nintendo, microsoft, windows |
| `emoji` | `{ "tipo": "emoji", "valor": "🍫" }` | sin marca: meses, sabores, mascotas, países (bandera), signos |
| `texto` | `{ "tipo": "texto", "valor": "PC" }` | 1–3 caracteres cuando no hay logo ni emoji claro |

- `scripts/preparar-carrera.mts` (vía `scripts/lib/iconos.mts`) busca el slug en simple-icons y
  deja `svg: { path, hex, titulo }` **inline en los props**. Slug inexistente o competidor sin
  icono → `texto` con las iniciales + aviso `[iconos] ⚠` por consola. No escribas `svg` a mano.
- Color del logo (`Icono.tsx`, `colorSobre`): el color oficial de la marca si contrasta ≥ 3:1 con
  el neón de la bolita; si no (o si es negro/blanco puro), tinta oscura o blanca, la que más contraste.
- Emoji con la fuente **Noto Color Emoji** del sistema (`~/.local/share/fonts/NotoColorEmoji.ttf`).
  Si sale en blanco y negro o como cuadro, falta esa fuente en la máquina.
- **Personas reales:** nunca fotos; bandera de su país o iniciales ("CR7").
- Logotipos de texto anchos (ancho/alto > 2,2; p. ej. `samsung`): en tamaños chicos (bolita,
  marcador) se muestra su inicial y en el final el logotipo completo. En la etiqueta no se repite
  un icono que sea solo letras ("S SAMSUNG"): ahí va únicamente el nombre.
- Las bolas miden **radio 32** (antes 27) para que el icono se lea: ≈35 px de logo en 1080 de ancho.

## Simulación (`scripts/simular-carrera.mts`)
- Física propia a paso fijo 1/600 s, todo con `crearAzar(semilla)`: mismo guion → mismo video.
- **Duración:** la ganadora cruza entre 25 y 45 s (si no, se ajusta la gravedad).
- **Carrera reñida:** si 1.º y 2.º llegan separadas por ≥ 1,5 s se deriva otra semilla
  (`semilla + 0x9e3779b9`); tras 20 carreras de duración válida sin cumplir se queda con la
  más ajustada. La ventaja queda en `sim.ventajaSeg` y se muestra en el final ("por 0,10 s").
- **Cámara lenta:** 0,4 s a ×0,25 en el cruce (con rampas de entrada/salida). Se aplica en
  Node re-muestreando posiciones, eventos y llegadas: **todos los frames del JSON son frames
  del video**, así el audio cae exacto (la fanfarria suena en el frame en que el centro de la
  ganadora pasa la línea; el instante de cruce se calcula con precisión de subpaso).
- **Cámara:** sigue a la líder con suavizado (0,07/frame) y luego se acota a una banda: la
  líder siempre queda entre y=720 y y=1290 de pantalla (bajo pregunta + marcador, sobre podio + intriga). Al fondo, la meta
  queda a y≈1180 (no bajo la UI de YouTube).
- **Ranking por frame** con histéresis de 24 px: el marcador no parpadea en empates.

## Audio (en el mismo script, WAV 48 kHz estéreo)
Golpe afinado por bola (pentatónica de Do, paneado por x) por clavija/rampa, máx. 12 golpes/s;
nota (octava arriba, promedio de ambas bolas) en choques bola–bola; riser desde que la líder
entra al último 15 %; "golpe" grave al entrar la cámara lenta; fanfarria (arpegio Do–Mi–Sol +
acorde) en el cruce. Normalizado a −1 dBFS con limitador suave.

## Composición (`Carrera.tsx`)
- Bolas con degradado radial, brillo especular, halo y glow; estela de 5 copias.
- Clavijas con glow suave; la golpeada se ilumina 120 ms (7 frames) del color de la bola
  (índice exacto de clavija en el evento, no búsqueda por cercanía).
- Icono del competidor dentro de cada bola (`Icono.tsx`), también en etiqueta, marcador y final.
- Etiquetas junto a cada bola, siempre dentro de la zona segura y sin pisarse; si una bola
  está fuera de cuadro su etiqueta queda en el borde con ▲/▼.
- Marcador top 3 arriba a la izquierda: las posiciones se deslizan (~14 frames) y la que sube
  hace un pulso. HUD y etiquetas se apagan durante la cámara lenta.
- Llegada: zoom ×1,38 hacia la meta, viñeta del color de la ganadora, flash; la ganadora viaja
  al centro y crece; 90 papelitos de confeti determinista con gravedad desde dos cañones;
  "GANA: <etiqueta>" (tamaño auto) + ventaja. Luego `<Cierre/>` (72 frames). `<MarcaDeAgua/>` siempre.

## Arranque y final (2026-11-04)
- **Gancho en el frame 0:** la pregunta del guion en texto gigante sobre placa oscura, arriba en la
  zona segura, legible desde el primer frame; se queda 1,8 s (`GANCHO_FRAMES`) mientras la carrera
  arranca debajo y se va con corte limpio. Marcador y etiquetas entran recién después.
- **Etiquetas:** se apagan si su bola tiene otra a menos de 1,6–1,9 diámetros (no se montan); el
  icono dentro de la bola sigue identificándola.
- **Capas:** el marcador lleva panel opaco y la marca de agua una placa oscura: el tablero no se ve a
  través de ellos.
- **Resultado:** bajo "GANA" aparece la fila con el resto (2.º, 3.º…) con su icono: orden real de
  llegada y, las que no cruzaron cuando terminó el video, por posición en pista. Sin "(no llega)".

## El primer segundo (2026-11-08, rama `primer-segundo`)
- **Bolas de 116 px** (radio 58, 6 % del alto; antes 64 px) con el icono a 0,78 del diámetro (≈ 90 px).
  Tablero abierto en proporción: clavijas cada 200 × 165 px (huecos ≥ 167 px), columnas a ≥ 127 px de las
  paredes (sin bolsillos), bocas de embudo de 250 px, márgenes de rampas/embudos mayores.
- **Salida en movimiento**: bolas a y 640–680 cayendo a 420–500 px/s y 1.ª fila de clavijas en y 840 →
  1.er choque con clavija a 167–283 ms (medido en los 5 guiones del backlog). "¡Ya!" sintetizado en el frame 0.
- **Dos bloques fijos** (frame 0 → cierre, `src/marca/BloqueTexto.tsx`): arriba `ganchoArriba` (si falta,
  `gancho`), abajo `ganchoAbajo` (si falta, variante por id: `VARIANTES_GANCHO_ABAJO_CARRERA`). El gancho
  gigante de 1,8 s desapareció; el marcador top 3 queda fijo bajo la pregunta (y 430) desde el frame 0 y las
  etiquetas entran a 1 s.
- **Podio vacío** (2.º · 1.º · 3.º con "?") sobre el bloque de abajo desde el frame 0: cada puesto se llena con
  la bola (color + icono, con pop) en el frame en que cruza la meta; se apaga cuando entra la fila del resultado.

## Carrera v2: más giros y suspenso (2026-11-09, rama `carrera-v2`)
Ideas de Santiago. Todo en la simulación determinista (paso fijo, semilla); el extra usa su **propio azar**
(`semilla ^ 0x7b10c5`), así que con `extras: false` el tablero, la física y la sim salen idénticos al v1
(verificado contra master con `carrera-super-poder`).
- **Bloques con vida** (~20–25 % de los obstáculos): rectángulos redondeados de 112 × 68 px con el número 1, 2 o 3
  (Bricolage 58 px), en clavijas interiores (x 230–850, nunca dos a < 260 px: dos bloques vecinos cerrarían el paso
  de una bola de 116 px). Cada golpe (vn > 110 px/s, enfriamiento 9 frames por bola) resta 1: destello blanco,
  temblor, el número salta y aparece una grieta; el color baja de rojo (3) a naranja (2) y amarillo (1). En 0 se
  rompe: anillo del color de la bola que lo rompió, flash y 14 fragmentos con gravedad; desaparece de la física.
  Golpe sobre la cara plana → empujoncito lateral de 55 px/s (no se queda posada encima).
- **Tubos** (2–3 por carrera, en franjas laterales de 380 px libres de embudos y rampas, alternando lado): boca en
  embudo con cartel `⚡ ATAJO` o `🌀 VUELTAS`, pared del lado de la cancha, y tubo de vidrio de 136 px. La bola que
  cae en la franja entra; recorre la línea central (re-muestreada cada 8 px) con velocidad que converge en 0,3 s a la
  del tubo (atajo 1300 px/s: serpentina + 1 rizo, ≈ 1,2 s para ~1000 px, gana ≈ 2 s; vueltas 480 px/s: 3–4 rizos,
  ≈ 4,3 s para ~800 px, pierde ≈ 2 s) y sale por abajo en vertical (≤ 760 px/s). Dentro van en **fila india** (no se
  acercan a menos de un diámetro) y no chocan con nadie. El vidrio tiene una capa detrás de la bola y un brillo
  delante: se ve la bola dentro. Mientras hay una bola dentro, el borde brilla de su color.
- **Búsqueda de semilla**: además de duración 25–45 s y ventaja < 1,5 s, pide ≥ 1 tubo usado, ≥ 1 bloque roto y
  ≥ 1 "le abrió el camino" (hasta 60 carreras válidas; si no, la mejor por extras y luego por ventaja).
- **Avisos** (`sim.avisos`, `Extras.tsx`): "💥 ¡X le abrió el camino a Y!" cuando Y pasa (≤ 8 s después) por donde
  estaba el bloque que rompió X, y "🌀/⚡ ¡X se metió al tubo!". Máx. 1 cada 3 s, 2,4 s en pantalla, en el lugar del
  llamado (y 668, bajo el marcador y sobre la banda de la líder) y solo hasta que entra el llamado.
- **Sonido** (`scripts/lib/sonido-carrera.mts`): clavija = marimba en Do pentatónica según la ALTURA (la escala
  baja con las filas y vuelve a empezar cada 11: cascadas que suenan musicales); bloque = golpe grave + crujido;
  rotura = boom + estallido brillante + campanitas; tubo = "fiuuu" continuo (tono por velocidad, sube en los rizos y
  baja al caer, doppler leve) con "chup" al entrar y "pop" al salir; cama a 110 bpm (bajo Do–La–Fa–Sol + bombo +
  hi-hat; en los últimos ~8 s entra caja y semicorcheas) que se corta en la cámara lenta; fanfarria de metales +
  platillo. Master `masterizar` (wav.mts): RMS −15 dB con compuerta + limitador con anticipación a −2,2 dBFS
  → medido −14 LUFS integrado, true peak < −0,5 dBTP.

## Votación con acciones del público (prop `votacion`; rehecha el 2026-11-10 tras "no se entiende")
- **Exactamente 4 competidores** (el schema lo exige con `votacion: true`; `generar-guiones` pide 4). Acción por orden:
  1.º "❤️ ME GUSTA", 2.º "💬 COMENTA", 3.º "🔁 COMPARTE", 4.º "🔔 SUSCRÍBETE". Los guiones de 5–6 van sin votación.
- **Panel grande** (frames 0–240 y los 3 s antes de la meta): placa oscura x 56–940 (deja libre la columna de botones de
  YouTube) y y 1204–1580, con "VOTA POR TU FAVORITO 👇" (48 px, amarillo) y 4 filas "● NOMBRE → ❤️ ME GUSTA"
  (bola de 64 px con el icono, nombre de 46 px en su color, acción de 42 px). Mientras está grande, el podio se oculta.
- **Franja compacta** (el resto de la carrera): 2×2 "● NOMBRE → ❤️" en y 1470–1580, con el podio encima.
- **Final** (desde k = 40 tras la meta): "GANÓ X → / si le diste <acción>, ¡acertaste! 🎉" con el color de la ganadora.
- Con votación, el llamado nunca usa "¿Acertaste? Suscríbete" (pasa a "Suscríbete y elige la próxima carrera 🏁").
- La búsqueda de semilla con extras pide además que el **atajo** reciba al menos una bola.

## Duración del video
`frames hasta el cruce (incluye cámara lenta) + 2,5 s de celebración + 1,2 s de cierre` ≈ 30–50 s.

## Canción de fondo (`musica`, 2026-11-10)
Prop opcional `musica`: nombre de una partitura de `contenido/partituras/` (formato de `ritmo`: `bpm`, `pistas.melodia|bajo|ritmo`,
`arpegio` opcional) o ruta a un `.json`. La cama genérica de 110 bpm se reemplaza por esa canción (piano suave + arpegio/bajo +
percusión suave, `scripts/lib/cama-cancion.mts`) desde 0,12 s hasta la cámara lenta (fundido de 0,5 s); los choques bajan a la
mitad y el bus de música sube al frente. Si el video dura más que la canción, se repite. Primer uso:
`contenido/prototipos/cancion-santiago/carrera.json` (`cancion-santiago-tema`).
