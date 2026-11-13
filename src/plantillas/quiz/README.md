# Largo `quiz` — "¿Cuántas adivinas?" (16:9, versión simple, miércoles 19:00)

10 melodías de dominio público (`scripts/lib/canciones-quiz.mts`, de fácil a difícil). Por canción: 2 s "CANCIÓN n",
35 s en que una bolita salta sobre un teclado de pads (un pad por altura; cada salto es una parábola que cae JUSTO en la
nota: la partitura manda) y 9 s de tarjeta (cuenta 3-2-1 y "Era… <nombre> · <autor>"). Cierre de 22 s "comenta tu
puntaje". Audio: `melodiaATempo` (piano + acordes) de wav.mts. Total 8:12.

```bash
npx tsx scripts/preparar-largo-quiz.mts contenido/largos/<id>.json --previews <dir>   # wav de 12 s por melodía
npx tsx scripts/render-largo.mts Quiz salida/trabajo/<id>.props.json <salida.mp4>
```
Cumpleaños feliz queda fuera; títulos y descripción nombran el juego, no las canciones (los capítulos dicen "Canción n").
