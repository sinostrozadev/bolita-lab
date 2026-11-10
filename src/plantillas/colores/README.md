# Plantilla `colores` — Batalla de colores

2–4 equipos de color (por defecto rojo, azul, amarillo, verde), 8–12 bolitas cada uno, en una arena (círculo
o caja) vista desde arriba. Gana el último color con bolitas. Short 1080×1920, 60 fps, 35–50 s.

## Flujo
```bash
npx tsx scripts/preparar-colores.mts contenido/backlog/colores-batalla-4.json   # sim + wav + props (30–120 s: busca semilla)
npx remotion render src/index.ts Colores salida/bandeja/<id>.mp4 --props=salida/trabajo/<id>.props.json --codec=h264 --crf=18 --concurrency=1
```
`preparar` escribe `public/sim/<id>.json` (trayectorias, eventos, áreas por equipo, mapa video→sim),
`public/audio/generado/<id>.wav` y `salida/trabajo/<id>.props.json` (con `duracionFrames`).

## Reglas del juego (las aplica `scripts/simular-colores.mts`)
- **Mismo color se tocan → FUSIÓN**: la grande absorbe a la chica (área = suma, momento conservado). Tope: si el
  resultado pasaría de r = 58 px, rebotan (así no se forma una mancha única que decide sola).
- **Distinto color se tocan → DIVISIÓN**: las dos pierden la MISMA área, `daño(t) × área de la más chica`
  (la chica pierde proporcionalmente más). La que siga siendo grande (≥ 3 × área mínima) se **parte en 2**
  (42–58 %), las mitades salen en ángulo. 0,3 s de inmunidad tras un golpe o al nacer (rebotan).
- **Bajo el área mínima (r 12 px) → MUERE** (estallido de partículas). Si ambas morirían, la más grande aguanta
  en el mínimo (no hay empates).
- **CONQUISTA (desde los 18 s, aviso "¡CONQUISTA! Los que caen cambian de color")**: la que cae bajo el mínimo ya
  no muere, se pasa al color que la golpeó (renace con 1,8 × el área mínima; anillo del color nuevo + chispas del
  viejo + "flip" sonoro). En esta fase el escudo se invierte (exponente −0,5: el grande resiste) y solo se fusionan
  las chicas, así la arena sigue llena y el que va ganando arrastra a los demás en cascada. Medido en
  `colores-batalla-4`: 19–23 bolitas entre 5 y 2 s antes de la victoria, duelo 10 vs 9 a 3 s del final.
- **Escudo del que va perdiendo** (lo que da vuelcos): el daño que recibe una bolita se multiplica por
  `(área de su equipo / área media de los equipos vivos)^2`, acotado a [0,35; 1,6].
- **Daño que crece**: `daño × (0,3 + 1,7·(t/32 s)²)`, tope 2,5×. Al inicio casi solo hay fusiones y
  divisiones (la arena se llena de trozos: ~40 → 50 bolitas); al final los golpes matan.
- **Caza**: cada bolita acelera hacia el rival más cercano, suave al inicio y fuerte al final; rapidez objetivo
  según tamaño (chicas rápidas). **La arena se cierra** desde los 26 s (20 px/s, mínimo r 210) con aviso.
- **Victoria**: queda un color. Cámara lenta (0,3×) 0,6 s antes hasta 0,1 s después del último golpe; las bolitas del
  ganador se juntan al centro en una grande; "GANA: X", remate de la votación, cierre de marca.

## Búsqueda (determinista)
Semilla base = hash del id (o `semilla`); prueba hasta 600 semillas × 5 daños base (0,10–0,14) hasta cumplir:
video 35–50 s · ≥ 2 vuelcos de liderazgo (líder = mayor área total, histéresis 3 % sostenida 0,5 s) · primer
choque ≤ 0,3 s · eliminaciones separadas ≥ 1,5 s · arena poblada (≥ 25 bolitas a la mitad de la partida, ≥ 9 al
75 %, ≥ 5 al 85 %) · **final masivo**: ≥ 15 bolitas desde la conquista hasta 3 s antes de la victoria y ≥ 2
equipos con ≥ 5 bolitas hasta 5 s antes · si el ganador iba primero cuando cayó el primer equipo, exige ≥ 3 vuelcos.

## Pantalla
- Arriba fijo desde el frame 0: `pregunta` ("¿Qué color gana? 🎨") y el **marcador**: barra apilada con el % de
  área de cada color (crece/encoge en vivo, 👑 en el líder, pop al cambiar).
- Entre la barra y la arena: avisos "¡Cae el VERDE!" (1,4 s) y "¡La arena se cierra!".
- Abajo: **votación** con el panel compartido `src/marca/Votacion.tsx` (mismo formato que `carrera`): los primeros
  4 s "VOTA POR TU FAVORITO 👇" y una fila por color "[pulgar] ME GUSTA → ● ROJO" (íconos dibujados como los de
  YouTube Shorts: pulgar, burbuja, flecha de compartir, campana; sin emoji); después franja compacta 2×2
  "[ícono] → ● ROJO" (eliminados tachados); en el final "GANÓ ROJO → si le diste [ícono] COMENTA, ¡acertaste! 🎉".
  Acciones sorteadas por id (`votacion: { orden }` las fija). Con `votacion: false` vuelve el CTA "Comenta tu color 👇".
- Llamado a suscribirse (src/marca/Llamado.tsx) 6 s antes de la victoria hasta el cierre.

## Props (ver `guion.ts`)
`id`, `pregunta?`, `cta?`, `equipos?` (2–4 de rojo/azul/amarillo/verde/violeta/naranja/cian/rosa),
`bolasPorEquipo?` (8–12), `arena?` (circulo|caja), `votacion?` (true | false | { textos, orden, remate }),
`semilla?`, `llamado?`.

## Audio (sintetizado en Node)
Fusión: acorde mayor ascendente suave en el tono del equipo · división: golpe seco + "crack" + cuerpo grave ·
muerte: pop agudo · eliminación: boom + tres notas que caen · cambio de líder: campanita · cama rítmica
(bombo, platillo, bajo) que acelera de 96 a 150 bpm · cámara lenta: riser · victoria: fanfarria en el tono del
ganador. Tope de densidad por tipo (no se amontonan 20 golpes en 10 ms).

## Verificar un video
Fotogramas 0 s (pregunta + barra 25 % c/u + votación legibles), 3 s, mitad (arena llena), cada "¡Cae el…!",
cámara lenta, "GANA" + remate, último cuadro (cierre). Revisar que el ganador de la consola coincida con el cartel.

## Fórmula de guion
Título: "Batalla de N colores: ¿cuál sobrevive? 🎨" / "¿Qué color gana? Vota con tu like" · descripción con las
reglas en 2 líneas + "Vota con tu acción" · el título y la descripción NO dicen quién gana.
