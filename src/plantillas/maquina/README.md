# Plantilla `maquina` (prototipo, 2026-11-09)

Una **máquina de canicas musical en 3D** (estilo Wintergatan "Marble Machine"): una noria y un ascensor de
cangilones suben las canicas, bajan por un riel y una espiral hasta los cargadores de vidrio, y cada compuerta se
abre en el instante justo para que su canica caiga sobre una lámina del vibráfono, el bajo de madera, el bombo o el
platillo. Después rebotan hacia la cámara, ruedan por la bandeja, giran en el embudo y vuelven al depósito: el ciclo
completo se ve. Como `ritmo`, **la partitura manda** y la máquina se construye para que cada golpe caiga en su frame.

## Flujo

```bash
npx tsx scripts/preparar-maquina.mts contenido/backlog/maquina-oda.json      # sim + wav + props (≈ 4 s)
npx tsx scripts/verificar-maquina.mts pendiente-maquina-oda 40               # sincronía de TODOS los golpes
npx tsx scripts/fotogramas-maquina.mts pendiente-maquina-oda salida/pruebas/maquina/fotos 0.5   # fotogramas sueltos
flock /tmp/bolita-render.lock -w 3600 npx remotion render src/index.ts Maquina salida/bandeja/<id>.mp4 \
  --props=salida/trabajo/<id>.props.json --gl=swangle --concurrency=1
```

**`--gl=swangle` es obligatorio** (Three.js en WSL sin GPU; ver `ritmo`). 30 fps: `MAQUINA_FPS=30` al preparar
(o `"fps": 30` en props); el sim, el audio y la cámara se recalculan a esa cadencia.

## Piezas

- `geometria.ts`: TODAS las medidas (cm, y arriba, z hacia la cámara): láminas Sol4–Sol5 (8), bajo Sol2/Do3/Re3/Mi3,
  bombo, platillo inclinado, bandeja, embudo, depósito, noria, ascensor, rieles, espiral, `contacto()` (punto y normal
  de golpe) y `holgura()` (la usa el verificador). La comparten el sim (Node) y el componente.
- `scripts/simular-maquina.mts`: por cada nota `t_suelta = t_golpe − √(2·Δy/g)` (caída libre desde la compuerta);
  después del golpe, tramos analíticos: rebote hacia la cámara (restitución por pieza: lámina/bajo 0,3, bombo 0,55,
  platillo 0,4 reflejado sobre su normal) → bandeja (rodadura 5/7·g·senθ, carril elegido) → embudo (espiral con
  radio que baja y rapidez ∝ R^-½) → tubo → depósito (rebote corto y se hunde). Entre variantes (carril × tiempo en
  el embudo × desvío) gana la que menos se toca con las demás canicas visibles. Canicas "de antes" (golpes en tiempo
  negativo, sin sonido) para que en el frame 0 la máquina ya esté andando. Cámara: 11 planos por pulso con fundidos
  de 0,8 s o cortes (general → láminas en 3/4 siguiendo la melodía → bajo y bombo → grúa noria/ascensor → espiral →
  contrapicado → órbita → percusión → láminas en 3/4 → acorde → general).
- `scripts/preparar-maquina.mts`: vibráfono (parciales 1:4:10, trémolo de motor de 5,6 Hz con fase común), bajo de
  madera (marimba grave + "toc"), bombo (barrido 140→52 Hz), platillo (parciales inarmónicos + ruido; abierto con cola
  larga), y la máquina: clac del trinquete de la noria en cada negra, tic de compuertas, canicas en la bandeja y el
  depósito, rodar de fondo (ruido filtrado que sube con las canicas que ruedan). Paneo por la x de cada pieza.
- `scripts/verificar-maquina.mts`: para CADA golpe compara el frame de la partitura (recalculado), el frame de
  contacto geométrico real contra la superficie de la pieza (holgura, huella, inversión de la velocidad normal),
  que la canica salga quieta de su compuerta, y el ataque en la pista sola del instrumento y en el wav mezclado.
- `Maquina.tsx` + `texturas.ts`: taller (pared y piso de tablas, repisas, lámparas con bokeh), materiales madera /
  latón / acero con entorno `RoomEnvironment` para los reflejos, sombras suaves (direccional 2048), contraluz frío,
  canicas en `InstancedMesh` (flujo, noria, cargadores, partitura), láminas que se encienden y vibran, parche que se
  hunde, platillo que oscila, ondas y chispas aditivas en cada golpe, textos fijos, llamado, marca de agua y cierre.

## Rendimiento (WSL, SwiftShader, 2026-11-10)

- Render completo 1080×1920 a 30 fps (1296 frames): **17,7 min** (≈ 0,8 s/frame con la máquina poco cargada; con otros
  renders al lado sube a 2–2,5 s/frame). A 60 fps (2592 frames) ≈ 35–40 min si la máquina está libre.
- Lo que más costaba: cientos de mallas estáticas (llamadas de dibujo) → `Fusionar` las une por material al montar;
  pared sin iluminación (`MeshBasicMaterial`), piso y pila con Lambert. El MSAA cuesta ~30 %; se dejó activado.
- `scripts/medir-maquina.mts <id> <frame> "" sinaa sombra1k …` mide s/frame con banderas de la prop `prueba`.

## Partituras

`contenido/partituras/<nombre>.json`: `bpm`, `compas`, `pistas.melodia|bajo` = `[midi, pulso, duración]` (la melodía
puede ser polifónica: cada nota es una canica), `pistas.ritmo` = `{ tipo: bombo|platillo, pulso, abierto?, acento? }`.
Las notas deben existir en el instrumento (melodía Sol4–Sol5 diatónica; bajo Sol2, Do3, Re3, Mi3): para otra
tonalidad hay que cambiar `NOTAS_VIBRA`/`NOTAS_BAJO`. Elegir bpm con negra en frames enteros (100 bpm → 36 a 60 fps).
Los planos de cámara están pensados para ~66 pulsos (16 compases); otra duración necesita revisar `planos`.

## Falta para producción

Integrarla en `scripts/lib/operacion.mts` (`PLANTILLAS`, rotación) y en `diario.mts` (render con `--gl=swangle`),
más partituras (Para Elisa, Marcha turca, Himno de la alegría en otra tonalidad, Cisnes) y variación visual por video
(paleta de láminas, madera, hora del taller) para no caer en "contenido repetitivo".
