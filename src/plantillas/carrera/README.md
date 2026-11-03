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
| `participantes` | 4–6 `{ etiqueta (≤18), color: lima·cian·magenta·naranja·violeta·amarillo }` |
| `semilla?` | si falta, `semillaDesde(id)` |
| `tema?` | informativo |

Los guiones del backlog (`contenido/backlog/carrera-<slug>.json`) llevan `id` = nombre de
archivo: el pipeline le quita `carrera-` y antepone la fecha al promover.
**Colores:** si la etiqueta ES un color (p. ej. "AMARILLO"), usa ese neón; nunca "ROJO" en cian.

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
  líder siempre queda entre y=520 y y=1500 de pantalla (zona segura). Al fondo, la meta
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
- Etiquetas junto a cada bola, siempre dentro de la zona segura y sin pisarse; si una bola
  está fuera de cuadro su etiqueta queda en el borde con ▲/▼.
- Marcador top 3 arriba a la izquierda: las posiciones se deslizan (~14 frames) y la que sube
  hace un pulso. HUD y etiquetas se apagan durante la cámara lenta.
- Llegada: zoom ×1,38 hacia la meta, viñeta del color de la ganadora, flash; la ganadora viaja
  al centro y crece; 90 papelitos de confeti determinista con gravedad desde dos cañones;
  "GANA: <etiqueta>" (tamaño auto) + ventaja. Luego `<Cierre/>` (72 frames). `<MarcaDeAgua/>` siempre.

## Duración del video
`frames hasta el cruce (incluye cámara lenta) + 2,5 s de celebración + 1,2 s de cierre` ≈ 30–50 s.
