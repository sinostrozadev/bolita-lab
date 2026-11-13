# Revisión semanal 2026-11-09

Generada por `scripts/revisar.mts` (docs/MEJORA-CONTINUA.md §5) · rango desde 2026-11-02 05:00 (America/Santiago) · modo aplicar · modelo `opus`. Formato fijo (lo lee el panel): Detectado · Mejorado · Herramientas exploradas · Agregado · Pendiente.

## Detectado

- dato Everest/Panamá/Eiffel: mismo andamiaje palabra por palabra ('La verdad es más…', 'Todo se explica con dos cosas', 'Y aquí está el giro') y 44–50 s vs 30 s del mejor dato (billón, 76 % visto)
- dato Eiffel y Panamá, fotograma 25 %: pantalla vacía ~2 s en la escena-anuncio 'Todo se explica con dos cosas'
- carrera ¿Qué país gana?, fotograma 75 %: la etiqueta COLOMBIA tapa la bola de Perú
- bola Bella Ciao (rebote 49) y Para Elisa ×2 (rebote 94): la bola tapa el contador REBOTES
- Analytics: bola 52–54 % visto, carrera 52–59 %, dato 60–76 %; 10 subs con ~6,7 K vistas (1,5 por 1.000; meta ≥ 2)
- 2026-11-03-bola-canon-crecer (bola): retención media 53 % con 1283 vistas, bajo el umbral de 80 % (docs/ESTRATEGIA.md §5).
- 2026-11-03-bola-canon-escape-2 (bola): retención media 54 % con 1174 vistas, bajo el umbral de 80 % (docs/ESTRATEGIA.md §5).
- 2026-11-03-bola-canon-escape-2: 0.9 subs por 1.000 vistas (+1 con 1174); el cierre no convierte (meta > 3).
- 2026-11-03-carrera-gamers-consola (carrera): retención media 59 % con 1151 vistas, bajo el umbral de 80 % (docs/ESTRATEGIA.md §5).
- 2026-11-03-carrera-helados-chocolate-vainilla-fresa-menta-limon (carrera): retención media 52 % con 700 vistas, bajo el umbral de 80 % (docs/ESTRATEGIA.md §5).
- 2026-11-03-dato-camaron-mantis-colores (dato): retención media 60 % con 1139 vistas, bajo el umbral de 65 % (docs/ESTRATEGIA.md §5).
- 2026-11-03-dato-camaron-mantis-colores: 0.0 subs por 1.000 vistas (+0 con 1139); el cierre no convierte (meta > 3).
- 2026-11-06-dato-el-everest-no-es-la-cima-mas-cercana-al (dato): retención media 31 % con 1 vistas, bajo el umbral de 65 % (docs/ESTRATEGIA.md §5).

## Mejorado

- scripts/generar-guiones.mts FORMULA_DATO: frases del molde prohibidas, sin escena-anuncio, tope de 75–100 palabras y 4–6 escenas
- src/plantillas/carrera/Carrera.tsx colocarEtiquetas: la etiqueta elige el lado libre o se omite; ya no tapa la bola de otro competidor
- contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json reescrito sin muletillas (6 → 5 escenas)
- Commit `323283a` en `revision/2026-11-09` (tsc + render de prueba en verde): `contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json`, `docs/DECISIONES.md`, `scripts/generar-guiones.mts`, `src/plantillas/carrera/Carrera.tsx`, `src/plantillas/dato/README.md`.

## Herramientas exploradas

- Kokoro TTS local (Apache-2.0, gratis): plan B de voz; queda para una sesión interactiva porque falta pip
- retencion-studio.mjs (propio) en el cron del lunes para tener visto/deslizado por Short: propuesta
- Fun Circle Games / Korpi AI: descartados (cuenta o pago, y contenido en serie)

## Agregado

- Regla 'Frases prohibidas' y tope de palabras en src/plantillas/dato/README.md
- 2 entradas del 2026-11-09 en docs/DECISIONES.md
- Informe `salida/revisiones/2026-11-09.md` y su copia `salida/revisiones/ULTIMA.md`.
- 35 hoja(s) de contacto y 210 fotogramas en `salida/revisiones/2026-11-09/fotogramas`.
- Métricas de la tanda en `salida/revisiones/2026-11-09/metricas.json`.
- Render de prueba de carrera: `salida/pruebas/revision-2026-11-09-carrera.mp4`.
- Commit `323283a` "revisión semanal 2026-11-09" en la rama principal (sin push).

## Pendiente

- Reescribir y re-renderizar dato Torre Eiffel (listo, no publicado) con las reglas nuevas
- Re-renderizar carrera zodiaco con el arreglo de etiquetas antes de subir
- bola: placa del contador REBOTES por encima de la bola (después de medir la plantilla nueva)
- Probar cierre-bucle de 0,5 s en bola con A/B (toca CONVENCIONES)
- carrera: no dibujar bolas sobre el título y marcador en '—' hasta el primer choque
- No se encontraron referentes virales de los últimos 3 meses con cifras verificables: repetir la búsqueda con el piloto en YouTube
- Revisar permisos denegados a Claude: `Bash(grep -n '"texto"\|"gancho"\|"remate"' contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json; for f in contenido/backlog/dato-*.json; do echo "$f $(grep -o '"texto": "[^"]*"' $f | wc -w)"; done; sed -n 1,30p src/plantillas/dato/README.md | head -5; sed -n 40,60p src/plantillas/dato/README.md)`.

## Videos revisados (35)

| id | plantilla | duración | estado | vistas | % visto | subs | hoja de contacto |
|---|---|---|---|---|---|---|---|
| 2026-11-03-bola-canon-crecer | bola | 43.6 s | subido ([wWkHMfYBX0g](https://youtu.be/wWkHMfYBX0g)) | 1288 | 53 % | +2 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-bola-canon-crecer-hoja.jpg` |
| 2026-11-03-bola-canon-escape-2 | bola | 30.2 s | subido ([Z8-3_uzhpJs](https://youtu.be/Z8-3_uzhpJs)) | 1291 | 54 % | +1 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-bola-canon-escape-2-hoja.jpg` |
| 2026-11-03-bola-cisnes-crecer-3 | bola | 29.0 s | subido ([Wav_W4VRJ_8](https://youtu.be/Wav_W4VRJ_8)) | 869 | 90 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-bola-cisnes-crecer-3-hoja.jpg` |
| 2026-11-03-bola-furelise | bola | 33.7 s | subido ([pZwZS5YXUP8](https://youtu.be/pZwZS5YXUP8)) | 1183 | 81 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-bola-furelise-hoja.jpg` |
| 2026-11-03-carrera-gamers-consola | carrera | 32.5 s | subido ([nJJ6-EY6jKg](https://youtu.be/nJJ6-EY6jKg)) | 1153 | 59 % | +4 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-carrera-gamers-consola-hoja.jpg` |
| 2026-11-03-carrera-helados-chocolate-vainilla-fresa-menta-limon | carrera | 34.1 s | subido ([XMNHIHXSLhM](https://youtu.be/XMNHIHXSLhM)) | 941 | 52 % | +1 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-carrera-helados-chocolate-vainilla-fresa-menta-limon-hoja.jpg` |
| 2026-11-03-carrera-iphone-vs-android | carrera | 41.8 s | subido ([OzRnX27pawU](https://youtu.be/OzRnX27pawU)) | 1178 | 110 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-carrera-iphone-vs-android-hoja.jpg` |
| 2026-11-03-carrera-meses | carrera | 36.2 s | subido ([z9c6DgDFKAA](https://youtu.be/z9c6DgDFKAA)) | 3 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-carrera-meses-hoja.jpg` |
| 2026-11-03-carrera-messi-cr7-neymar | carrera | 34.6 s | subido ([dy2omu9k2go](https://youtu.be/dy2omu9k2go)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-carrera-messi-cr7-neymar-hoja.jpg` |
| 2026-11-03-dato-billon-de-segundos | dato | 29.7 s | subido ([Zn66wjkNX0w](https://youtu.be/Zn66wjkNX0w)) | 1254 | 76 % | +2 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-dato-billon-de-segundos-hoja.jpg` |
| 2026-11-03-dato-camaron-mantis-colores | dato | 36.4 s | subido ([ELqZFQmmhHo](https://youtu.be/ELqZFQmmhHo)) | 1223 | 60 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-dato-camaron-mantis-colores-hoja.jpg` |
| 2026-11-03-dato-cleopatra-mas-cerca-de-iphone | dato | 39.3 s | subido ([tCaY7nso7CY](https://youtu.be/tCaY7nso7CY)) | 122 | 162 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-dato-cleopatra-mas-cerca-de-iphone-hoja.jpg` |
| 2026-11-03-dato-tierra-luna | dato | 30.2 s | subido ([iBORkBbkd8c](https://youtu.be/iBORkBbkd8c)) | 3 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-03-dato-tierra-luna-hoja.jpg` |
| 2026-11-04-bola-marcha-crecer | bola | 49.4 s | subido ([6T5zmMoG93A](https://youtu.be/6T5zmMoG93A)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-04-bola-marcha-crecer-hoja.jpg` |
| 2026-11-04-carrera-mascotas | carrera | 30.7 s | subido ([fnnlwWYxIMo](https://youtu.be/fnnlwWYxIMo)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-04-carrera-mascotas-hoja.jpg` |
| 2026-11-04-dato-huesos-bebe-300-adulto-206 | dato | 33.4 s | subido ([O2YLb4xlTNk](https://youtu.be/O2YLb4xlTNk)) | 3 | 104 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-04-dato-huesos-bebe-300-adulto-206-hoja.jpg` |
| 2026-11-04-dato-luz-pasado | dato | 32.0 s | subido ([ddtrrj2MF3M](https://youtu.be/ddtrrj2MF3M)) | 2 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-04-dato-luz-pasado-hoja.jpg` |
| 2026-11-05-bola-3bolas-canon | bola | 36.7 s | subido ([zeb04rqSoHk](https://youtu.be/zeb04rqSoHk)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-05-bola-3bolas-canon-hoja.jpg` |
| 2026-11-05-carrera-dias-semana | carrera | 36.7 s | subido ([b3v9Q6ymd3A](https://youtu.be/b3v9Q6ymd3A)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-05-carrera-dias-semana-hoja.jpg` |
| 2026-11-05-dato-corazon-latidos | dato | 29.2 s | subido ([vb23i8EbyFI](https://youtu.be/vb23i8EbyFI)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-05-dato-corazon-latidos-hoja.jpg` |
| 2026-11-06-bola-cisnes-escape | bola | 31.8 s | subido ([aqlybcvEYz0](https://youtu.be/aqlybcvEYz0)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-06-bola-cisnes-escape-hoja.jpg` |
| 2026-11-06-carrera-pizza-vs-hamburguesa | carrera | 39.6 s | subido ([JKfuFS0b99U](https://youtu.be/JKfuFS0b99U)) | 1 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-06-carrera-pizza-vs-hamburguesa-hoja.jpg` |
| 2026-11-06-dato-el-everest-no-es-la-cima-mas-cercana-al | dato | 47.6 s | subido ([rKeo3b33kJM](https://youtu.be/rKeo3b33kJM)) | 1 | 31 % | +0 | `salida/revisiones/2026-11-09/fotogramas/2026-11-06-dato-el-everest-no-es-la-cima-mas-cercana-al-hoja.jpg` |
| 2026-11-07-bola-cual-de-las-2-bolitas-escapa | bola | 29.1 s | subido ([YG-h9ndmaBc](https://youtu.be/YG-h9ndmaBc)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-07-bola-cual-de-las-2-bolitas-escapa-hoja.jpg` |
| 2026-11-07-carrera-que-color-favorito | carrera | 31.8 s | subido ([TlEUxPDJQMY](https://youtu.be/TlEUxPDJQMY)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-07-carrera-que-color-favorito-hoja.jpg` |
| 2026-11-07-dato-en-el-canal-de-panama-vas-del-atlantico | dato | 50.3 s | subido ([9s_YaNsKVEo](https://youtu.be/9s_YaNsKVEo)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-07-dato-en-el-canal-de-panama-vas-del-atlantico-hoja.jpg` |
| 2026-11-08-bola-furelise-2 | bola | 33.0 s | subido ([vCBxbjwusnc](https://youtu.be/vCBxbjwusnc)) | 2 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-08-bola-furelise-2-hoja.jpg` |
| 2026-11-08-carrera-que-estacion-gana | carrera | 31.5 s | subido ([mBG93NTd51c](https://youtu.be/mBG93NTd51c)) | 4 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-08-carrera-que-estacion-gana-hoja.jpg` |
| 2026-11-08-carrera-que-pais-gana | carrera | 32.8 s | subido ([CvgoCXRxVCQ](https://youtu.be/CvgoCXRxVCQ)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-08-carrera-que-pais-gana-hoja.jpg` |
| 2026-11-08-dato-la-torre-eiffel-mide-15-cm-mas-en-verano | dato | 44.3 s | listo | — | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-08-dato-la-torre-eiffel-mide-15-cm-mas-en-verano-hoja.jpg` |
| 2026-11-08-dato-miel-nunca-se-echa-a-perder | dato | 32.2 s | listo | — | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-08-dato-miel-nunca-se-echa-a-perder-hoja.jpg` |
| 2026-11-09-bola-adivina-bella-ciao | bola | 29.5 s | subido ([6u43w_oAtTE](https://youtu.be/6u43w_oAtTE)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-09-bola-adivina-bella-ciao-hoja.jpg` |
| 2026-11-09-bola-adivina-jingle-bells | bola | 33.0 s | subido ([yO7rByQZW2k](https://youtu.be/yO7rByQZW2k)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-09-bola-adivina-jingle-bells-hoja.jpg` |
| 2026-11-09-bola-apuesta-marcha-turca | bola | 46.8 s | subido ([pi_-etXwymI](https://youtu.be/pi_-etXwymI)) | 0 | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-09-bola-apuesta-marcha-turca-hoja.jpg` |
| 2026-11-09-carrera-que-signo-del-zodiaco-llega-primero | carrera | 31.5 s | listo | — | — | — | `salida/revisiones/2026-11-09/fotogramas/2026-11-09-carrera-que-signo-del-zodiaco-llega-primero-hoja.jpg` |

Fotogramas en `salida/revisiones/2026-11-09/fotogramas/<id>-<1..6>.jpg` (0 s, 1,5 s, 25 %, 50 %, 75 %, último); métricas en `salida/revisiones/2026-11-09/metricas.json`.

## Métricas

- Data API (vistas, likes, comentarios): ✓
- Analytics API (retención, suscriptores): ✓
- "Visto vs deslizado" no está en la API: mirarlo en Studio → Analytics → Shorts.

## Revisión de Claude

### Resumen
Revisé los 35 videos con sus hojas de contacto y miré algunos fotogramas sueltos. El rediseño del primer segundo funciona: los 9 Shorts nuevos de `bola` y `carrera` (2026-11-08 y 2026-11-09) parten en el frame 0 con el cold open "así termina ↓", trazas llenando el círculo, bolas grandes y dos textos fijos.

Las métricas siguen bajas. Medí con Analytics los 6 Shorts que tienen más de 700 vistas: `bola` llega a 52–54 % visto, `carrera` a 52–59 % y `dato` a 60–76 %. En total son 10 suscriptores con unas 6.700 vistas, o sea 1,5 por cada 1.000.

Lo más urgente está en `dato`: los guiones nuevos salen hechos en serie, con las mismas frases palabra por palabra y 44–50 s de duración. Eso alarga los videos sin subir la retención y puede contar como contenido "repetitivo" para el YPP.

### 3 cosas que están bien
1. **El frame 0 de `bola` ya engancha.** En Bella Ciao, Jingle Bells, la apuesta y Para Elisa a 2 bolitas, el fotograma 1 muestra el círculo saturado de trazas, una bola grande, "así termina ↓" y la pregunta arriba. Es el patrón de satisfying.ba11s, con identidad propia.
2. **Los juegos de interacción se leen sin audio.** En Bella Ciao (`2026-11-09-bola-adivina-bella-ciao`) las pistas 1/3 → 2/3 → 3/3 aparecen apiladas y la anterior queda atenuada (fotogramas 3–5). "Escríbela en los comentarios 👇" se ve todo el video. En la apuesta, el contador "REBOTES 2 → 22 → 54 → 88" es justo el número que se pide comentar.
3. **Las carreras ya muestran identidad visual.** En la de países las bolas llevan banderas y en la de signos, los símbolos del zodíaco. El podio vacío con "?" se ve desde el frame 0, junto con el marcador en vivo y el CTA en el clímax ("¿Acertaste? Suscríbete 👇", fotograma 5). La carrera de consolas es la única de la tanda que supera 3 suscriptores por cada 1.000 vistas (3,5).

### 5 mejoras ordenadas por impacto/esfuerzo
1. **`dato`: guiones en serie y largos.** **Se aplica ya.**
   - **Qué se ve:** Everest (47,6 s), Panamá (50,3 s) y Torre Eiffel (44,3 s) repiten la misma secuencia de frases: "Mira X… ¿Por qué?", "Dicen que… La verdad es más rara/simple", "Todo se explica con dos cosas… Primero… Segundo…" y "Y aquí está el giro".
   - **Pantalla vacía:** la escena "Todo se explica con dos cosas" no tiene nada que mostrar. En el fotograma 25 % de Eiffel y de Panamá hay unos 2 s de hueco entre la foto y el subtítulo.
   - **Por qué importa:**
     - El dato con mejor retención (billón de segundos: 76 % visto, 30 s) no usa ninguna de esas frases.
     - La política del YPP sobre contenido repetitivo o hecho en serie castiga justamente esto.
   - **Qué cambié:**
     - Prohibí esas frases en `FORMULA_DATO` de `scripts/generar-guiones.mts` y en `src/plantillas/dato/README.md`, y eliminé la escena que solo anuncia las causas.
     - Puse un tope duro de 75–100 palabras y 4–6 escenas (≈ 28–36 s).
     - Reescribí el guion de Alaska del backlog (6 → 5 escenas).
   - **Impacto/esfuerzo:** alto / bajo.
2. **`carrera`: una etiqueta tapa la bola de otro competidor.** **Se aplica ya.**
   - **Qué se ve:** en `2026-11-08-carrera-que-pais-gana`, fotograma 5 (75 %), la etiqueta COLOMBIA queda encima de la bola de Perú y la de PERÚ se monta debajo. Justo en el tramo final no se sabe quién es quién.
   - **Causa:** `colocarEtiquetas` ponía la etiqueta a la izquierda cuando a la derecha no cabía, sin revisar si ahí había otra bola.
   - **Qué cambié:** en `src/plantillas/carrera/Carrera.tsx`, ahora prueba derecha e izquierda y elige el lado libre. Si los dos lados tapan otra bola, no pone etiqueta (el icono dentro de la bola ya identifica al competidor).
   - **Impacto/esfuerzo:** medio / bajo.
3. **`bola`: el contador "REBOTES" queda debajo de la bola.**
   - **Qué se ve:** en Bella Ciao (fotograma 5, rebote 49) la bola magenta tapa "REBOTES", y en Para Elisa a 2 bolitas (fotograma 4, rebote 94) pasa lo mismo. En la apuesta el número es lo que se pide comentar, así que tiene que leerse siempre.
   - **Qué cambiar:** dibujar el contador encima de la bola y su halo, con una placa oscura semitransparente, o moverlo bajo el anillo (y ≈ 1300) en el modo `apuesta`.
   - **Impacto/esfuerzo:** medio / medio.
   - **Queda para después:** cambia la composición recién rediseñada, y primero hay que medir la retención de esa plantilla (meta: ≥ 55 % "se queda a ver") para no mezclar variables.
4. **Tarjeta final en lugar de bucle.**
   - **Qué se ve:** los 35 videos terminan en la misma tarjeta casi vacía, "Bolita Lab @bolitalab · suscríbete" (fotograma 6). Los virales del nicho cortan en el clímax y vuelven al inicio sin costura, y ese bucle es lo que sube el % visto por encima de 100 %.
   - **Qué cambiar:** probar en `bola` un cierre de 0,5 s (hoy 1,2 s) y que el último frame del clímax coincida con el cold open del frame 0.
   - **Impacto/esfuerzo:** alto / medio.
   - **Queda para después:** toca el cierre que exige `docs/CONVENCIONES.md`, así que hay que decidirlo con datos de un A/B entre dos Shorts.
5. **`carrera`: bolas cortadas por arriba y marcador sin sentido en el frame 0.**
   - **Qué se ve:** la cámara sigue a la líder y las rezagadas salen por el borde superior, pasando sobre el título y la marca de agua (signos, fotogramas 3–5; estaciones, fotograma 3). Además, en el frame 0 el marcador ya muestra un "1.º/2.º/3.º" que no es el resultado final.
   - **Qué cambiar:** apagar el render de las bolas con y < `seguro.arriba` y mostrar "—" en el marcador hasta el primer choque.
   - **Impacto/esfuerzo:** bajo / bajo.
   - **Queda para después:** el tope de esta corrida es 3 mejoras y ya prioricé la de etiquetas.

### Referentes virales
No encontré Shorts de los últimos 3 meses con vistas verificables. Las búsquedas devolvieron sobre todo páginas de herramientas generadoras y datos de 2023–2024. Por eso la tabla usa los casos que documenta Know Your Meme, con las cifras que da esa página; no son datos actuales.

| Canal | Título | URL | Vistas | Qué hace distinto |
|---|---|---|---|---|
| satisfying.ba11s | "Reminds me of something 💀 #crash #simulation #satisfying #melody" | https://www.youtube.com/watch?v=Peo-DIOmmRo | > 67 M (a 4 meses) | El título sugiere sin nombrar: el espectador tiene que reconocer la melodía. |
| satisfying.ba11ls | "Reminds me of something 🤔" | https://www.youtube.com/watch?v=rgjeRfHFjms | > 38 M (a 5 meses) | Cada rebote es una nota de "Kerosene" (Crystal Castles); la melodía se reconoce más a medida que la bola acelera. |
| Jack's Physics | "Bouncing ball but every time it bounces it gets bigger and faster" | https://www.youtube.com/watch?v=GPJqda-ThrY | > 945 K | La mecánica completa cabe en el título; crece y además acelera. |
| satisfying.ba11s | "Bouncing square but the border gets smaller🤯" | https://www.youtube.com/watch?v=mUns7QevB2g | > 191 K | Variación de forma (cuadrado) sobre la misma idea. |
| CodeCraftedPhysics | "Will the ball manage to escape this time?" | (sin URL fiable en la fuente) | ~4,4 M según la fuente | Paredes que se regeneran por capas y "this time", que sugiere una serie. |
| Crazy Marble Race (vidIQ) | — (canal) | https://vidiq.com/youtube-stats/channel/UCYAOO-SAasNHv6rtUQhyrlQ | ~816 K en 30 días | Carreras de canicas como serie constante; no encontré cifras por video. |

**Reglas que adoptamos**
- `adivina`: el título nunca nombra la canción y sugiere ("¿Qué canción toca esta bolita?"), como "Reminds me of something". Ya lo cumplimos; es el formato con más vistas del nicho, así que confirma el experimento del 11-10/11-12.
- `adivina`: la melodía tiene que volverse más reconocible hacia el final. Propuesta: que el tempo suba con los rebotes en el último tercio. Queda para después, junto con la mejora 3.
- `bola`: el título de mecánica pura funciona cuando la mecánica tiene doble efecto ("crece y acelera"). Lo propongo como regla de guion para la próxima tanda de `crecer`.

### Herramientas
- **Adoptadas hoy:** ninguna. Las dos mejoras aplicadas no necesitan paquetes nuevos.
- **Propuesta, queda para después (gratis):** Kokoro TTS local (Apache-2.0) en la RTX 3060 como plan B de `msedge-tts`, por la voz de `dato`. Necesita Python con pip y la máquina hoy no lo tiene. Pasos para una sesión interactiva: instalar `python3-pip`, `pip install kokoro` y comparar 3 frases contra la voz actual.
- **Propuesta, queda para después (gratis):** `retencion-studio.mjs`, que ya existe, ejecutado por el cron del lunes. Así esta revisión tendría "visto vs. deslizado" por Short, que la API no da.
- **Descartadas:** los generadores web de "ball escape" (Fun Circle Games, Korpi AI). Hacen lo mismo que nuestra plantilla, dependen de una cuenta o de un pago, y su contenido en serie es justo lo que el YPP marca como inauténtico.
- **Requiere a Santiago:** ninguna nueva.

### Estrategia
- **Datos:** hay Analytics útil solo para 6 Shorts de 4–6 días.

  | Plantilla | % visto | Suscriptores por 1.000 vistas | Meta |
  |---|---|---|---|
  | `bola` | 52,5–53,7 % | 0,9–1,6 | > 80 % |
  | `carrera` | 52,3–58,8 % | 1,4–3,5 | > 80 % |
  | `dato` | 59,7–76,2 % | 0–1,6 | > 65 % |

  Solo el billón de segundos cumple su meta. El canal suma 10 suscriptores con ~6.700 vistas de Analytics (1,5 por 1.000; meta ≥ 2).
- **Ruta al YPP:** a este ritmo (~1.200 vistas por Short y ~2 suscriptores por Short, 2 Shorts al día) faltarían unos 250 días para los 1.000 suscriptores, y los 10 M de vistas en 90 días quedan fuera de alcance (~220 K). La única palanca real es romper el techo de ~1.200 vistas, que es lo que mide el experimento del primer segundo.
- **Cambios aplicados:** ninguno en `contenido/calendario.json` ni en `docs/ESTRATEGIA.md`. Hay menos de 2 semanas de datos y los Shorts con la plantilla nueva salen recién desde el 11-09.
- **Propuesta para el lunes 11-16:**
  1. Si los `adivina` doblan los comentarios por cada 1.000 vistas, pasar a 1 `adivina` al día al mediodía.
  2. Si los `dato` nuevos (≤ 36 s) llegan a ≥ 65 % visto, mantener 1 cada 2 días; si no, bajar `dato` a 2 por semana y subir `bola`/`carrera`.
  3. Medir "visto vs. deslizado" por Short con `retencion-studio.mjs`.

### Videos a re-renderizar
- `2026-11-08-dato-la-torre-eiffel-mide-15-cm-mas-en-verano` (listo, no publicado): 44 s con el molde completo y la escena "Todo se explica con dos cosas: hierro y sol", que deja el hueco del fotograma 25 %. Hay que reescribir el guion con las reglas nuevas (≤ 100 palabras) y re-renderizar antes de subir.
- `2026-11-09-carrera-que-signo-del-zodiaco-llega-primero` (listo, no publicado): re-renderizar con el arreglo de etiquetas antes de subir. Es barato y evita el choque visto en la carrera de países.

### Cambios aplicados
- `scripts/generar-guiones.mts`: en `FORMULA_DATO`, la escena del mito pasa a opcional, se elimina la escena-anuncio de las causas, se prohíben las frases del molde, se pone un tope de 75–100 palabras y 4–6 escenas, y el ejemplo se reescribió sin muletillas.
- `src/plantillas/dato/README.md`: la sección "Guion: fórmula narrativa" queda alineada con el prompt (frases prohibidas, tope de palabras y escenas).
- `contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json`: sin "La verdad es más simple", sin la escena "Todo se explica con dos cosas", sin "Segundo, …" ni "Y aquí está el giro" (6 → 5 escenas). Mismas fuentes y cifras.
- `src/plantillas/carrera/Carrera.tsx`: `colocarEtiquetas` elige el lado de la etiqueta que no tapa otra bola, y si ninguno sirve, no la muestra.
- `docs/DECISIONES.md`: 2 entradas del 2026-11-09 con motivo y medida.
- `npx tsc --noEmit` pasa limpio. No hice el render de prueba: lo corre el script antes de hacer el commit.

## Verificaciones del script

- Archivos cambiados: `contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json`, `docs/DECISIONES.md`, `scripts/generar-guiones.mts`, `src/plantillas/carrera/Carrera.tsx`, `src/plantillas/dato/README.md`
- ✓ `tsc --noEmit` limpio
- Plantillas tocadas: carrera → render de prueba de cada una
- ✓ render de prueba carrera: ok: 34.3 s, 1080×1920, audio sí → `salida/pruebas/revision-2026-11-09-carrera.mp4` · hoja `salida/revisiones/2026-11-09/pruebas/prueba-carrera-hoja.jpg`
- ✓ commit `323283a` en `revision/2026-11-09`
- ✓ fast-forward de `master` a `323283a` (sin push)
- Permisos denegados a Claude (intentó salir de lo permitido): `Bash(grep -n '"texto"\|"gancho"\|"remate"' contenido/backlog/dato-rusia-vendio-alaska-por-2-centavos.json; for f in contenido/backlog/dato-*.json; do echo "$f $(grep -o '"texto": "[^"]*"' $f | wc -w)"; done; sed -n 1,30p src/plantillas/dato/README.md | head -5; sed -n 40,60p src/plantillas/dato/README.md)`
- Claude: 43 turnos, costo US$ 2.13
