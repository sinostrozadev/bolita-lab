# Largo `relajante` — "Bolitas relajantes" (16:9, 30 min, sábado 19:00)

6 escenas de 305 s con fundidos de 6 s (total 30:00), cada una con su simulación, su paleta (tono base que deriva
±28° y avanza lento) y su pieza: `llenar` (1 bola, trazas que llenan el círculo · Gymnopédie n.º 1), `pendulos` (ola de
16 péndulos, se realinean cada 75 s · Canon), `tres` (3 bolas en el anillo · Canción de cuna de Brahms), `espirografo`
(3 plumas de luz · Greensleeves), `hexagono` (2 bolas en un hexágono que gira · "Bruma", propia), `gotas` (una gota por
nota de la melodía · "Marea", propia). Sin texto salvo el título de los primeros 10 s y la marca.

- Física en Node (`scripts/preparar-largo-relajante.mts`, 1/1200 s): rebotes que conservan la energía y se tuercen ±4°
  (el recorrido no se vuelve periódico).
- Música (`scripts/lib/musica-relajante.mts`): pad (triángulo + seno una octava abajo, desafinados L/R) + bajo + melodía
  lenta (piano/campana que rotan por vuelta, octava que alterna) + campanitas suaves del acorde en los rebotes, con
  reverberación de Schroeder; −21 dB RMS. Audio completo armado en 16 bits por bloques (30 min en float no caben cómodos).
- Dibujo en `<canvas>`: capa de trazas incremental (se rehace desde el inicio de la escena si el frame salta: un still o
  el inicio de un tramo) + capa viva. Render con `--concurrency=1`.

```bash
npx tsx scripts/preparar-largo-relajante.mts contenido/largos/<id>.json [--preview-audio x.wav] [--sin-audio]
npx tsx scripts/render-largo.mts Relajante salida/trabajo/<id>.props.json <salida.mp4> --tramo 9000
```
