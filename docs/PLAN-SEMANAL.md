# Bolita Lab — Plan semanal (rodante)

> Actualizado **2026-11-07 02:45** (America/Santiago) por Claude (subagente, sesión de madrugada). Método: skill global `plan-semanal`.
> Regla: siempre hay plan de la semana en curso **y** de la siguiente. Cuando a la semana en curso le quedan < 3 ranuras
> futuras con guion, o termina, se hace el ritual de cierre (skill §5) y se arma la que viene.
> **Manda el bloque JSON del final** (lo leen `estado.mts` y el panel de Santiago); la tabla es su vista legible.
> Meta de calidad contra la que se mide cada ranura: `docs/META-REFERENTE.md`.

## 🔒 Hito del mié 2026-11-11 → semana asegurada 2026-11-12 (jue) → 2026-11-18 (mié)

> Orden de Santiago (2026-11-08): el cupo del Max se renueva los **miércoles**. El miércoles en la noche quedan todos los guiones de
> la semana jue → mié escritos y dirigidos, arrancan los renders y el **jueves** todo está `programado` en Studio. Recién entonces el
> cupo sobrante va a mejoras. Regla completa: skill `plan-semanal` §5b · `operacion-diaria` §0 · `~/.claude/canales/calendario.json`.

| Ranuras jue 11-12 → mié 11-18 | Ya `programado` | Falta | Orden de producción el mié 11-11 |
|---|---|---|---|
| 12 Shorts (2/día hasta el 11-16; 18:00 el 11-17 y 11-18) | 10 (11-12 → 11-16, ids en la tabla y en Studio) | **2 Shorts**: 11-17 18:00 (`dato` Leónidas, contingente de la cola) y 11-18 18:00 (`bola`/`carrera` según rotación) | 1.º guiones (2, Opus) → render (~20 min c/u) → Studio |
| 1 largo (compilación dom 11-15 10:00) | 0 | la compilación del cron 04:30 del 11-08 (espera OK de Santiago) | solo con su OK |

Al cumplirse: anotar aquí "✅ asegurada hasta el mié 11-18 (fecha/hora)" y en `salida/revisiones/<fecha>.md`. El plan debe extenderse
hasta el 11-18 (hoy termina el 11-15): agregar las ranuras 11-16 → 11-18 en el ritual del miércoles.

Calendario (`contenido/calendario.json`): 2 Shorts/día (12:00 y 18:00) hasta el 2026-11-16 (`dobleHasta`); desde el
2026-11-17, 1 Short diario a las 18:00 + 12:00 sáb/dom. Largo (compilación) el domingo 10:00. Rotación cíclica
`bola → dato → carrera` (en la práctica de la bandeja: carrera → bola → dato). Canal lanzado el 2026-11-04: la semana en
curso es parcial (11-04 → 11-08). Cuota contingente: **0 %** en ambas semanas (todo ya estaba programado antes del barrido;
ver "Contingencias revisadas"); el nicho es atemporal, así que 0 % no es falla (skill §3).

## Semana en curso: lun 2026-11-02 → dom 2026-11-08

| Día | Hora | Plantilla | Tema | Tipo | Contingencia (fuente) | Estado | Referente | Por qué entra |
|---|---|---|---|---|---|---|---|---|
| mié 11-04 | 12:00 | bola | ¿Cuántos rebotes necesita para llenar el círculo? Canon de Pachelbel | evergreen | — | publicado ([wWkHMfYBX0g](https://youtube.com/shorts/wWkHMfYBX0g)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación. Vistas al 11-07: 1282. |
| mié 11-04 | 18:00 | dato | Un billón de segundos son más de 31.000 años | evergreen | — | publicado ([Zn66wjkNX0w](https://youtube.com/shorts/Zn66wjkNX0w)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP). Vistas al 11-07: 1247. |
| jue 11-05 | 12:00 | carrera | ¿PlayStation, Xbox, Nintendo o PC? 🎮 ¿Cuál gana? | evergreen | — | publicado ([nJJ6-EY6jKg](https://youtube.com/shorts/nJJ6-EY6jKg)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2). Vistas al 11-07: 1149. |
| jue 11-05 | 18:00 | bola | 2 bolitas, 1 hueco que gira: ¿cuál escapa primero? (Canon) | evergreen | — | publicado ([Z8-3_uzhpJs](https://youtube.com/shorts/Z8-3_uzhpJs)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación. Vistas al 11-07: 1171. |
| vie 11-06 | 12:00 | dato | El camarón mantis tiene 12 receptores de color; tú, solo 3 | evergreen | — | publicado ([ELqZFQmmhHo](https://youtube.com/shorts/ELqZFQmmhHo)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP). Vistas al 11-07: 1129. |
| vie 11-06 | 18:00 | carrera | ¿Chocolate, vainilla, fresa, menta o limón? ¿Qué helado gana? 🍦 | evergreen | — | publicado ([XMNHIHXSLhM](https://youtube.com/shorts/XMNHIHXSLhM)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2). Vistas al 11-07: 676. |
| sáb 11-07 | 12:00 | bola | 3 bolitas crecen en cada rebote: ¿cuánto tardan en llenar el círculo? | evergreen | — | programado ([Wav_W4VRJ_8](https://youtube.com/shorts/Wav_W4VRJ_8)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación |
| sáb 11-07 | 18:00 | dato | Cleopatra vivió más cerca del iPhone que de las pirámides | evergreen | — | programado ([tCaY7nso7CY](https://youtube.com/shorts/tCaY7nso7CY)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| dom 11-08 | 10:00 | **largo** 16:9 | Compilación semanal: los mejores Shorts de bolitas y datos de la semana | evergreen · _Compilación del domingo_ | — | idea · ⚠ la genera el cron dom 04:30 (compilar.mts --n 14); se sube SOLO tras el OK de Santiago (copia en su Escritorio). Riesgo "reutilizado": revisar monetizacion-youtube | mikan2d (largos 8–9 min de carreras) | ruta B (horas de largo) y prueba del formato compilación con los renders mejorados |
| dom 11-08 | 12:00 | carrera | ¿iPhone, Samsung, Xiaomi o Pixel? 📱 ¿Qué celular gana? | evergreen | — | programado ([OzRnX27pawU](https://youtube.com/shorts/OzRnX27pawU)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| dom 11-08 | 18:00 | bola | ¿Cuántos rebotes aguanta antes de escapar? Para Elisa en neón | evergreen | — | programado ([pZwZS5YXUP8](https://youtube.com/shorts/pZwZS5YXUP8)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación |

## Semana siguiente: lun 2026-11-09 → dom 2026-11-15

| Día | Hora | Plantilla | Tema | Tipo | Contingencia (fuente) | Estado | Referente | Por qué entra |
|---|---|---|---|---|---|---|---|---|
| lun 11-09 | 12:00 | dato | Si la Tierra fuera una pelota de básquet, ¿dónde estaría la Luna? | evergreen | — | programado ([iBORkBbkd8c](https://youtube.com/shorts/iBORkBbkd8c)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| lun 11-09 | 18:00 | carrera | ¿Qué mes del año gana la carrera? 🏁 Carrera de bolitas | evergreen | — | programado ([z9c6DgDFKAA](https://youtube.com/shorts/z9c6DgDFKAA)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| mar 11-10 | 12:00 | dato | Lo que ves en el cielo ya pasó: el Sol tiene 8 minutos de retraso | evergreen | — | programado ([ddtrrj2MF3M](https://youtube.com/shorts/ddtrrj2MF3M)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| mar 11-10 | 18:00 | carrera | ¿Messi, CR7, Neymar o Mbappé? ⚽ ¿Quién gana la carrera? | evergreen | — | programado ([dy2omu9k2go](https://youtube.com/shorts/dy2omu9k2go)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| mié 11-11 | 12:00 | dato | Tu corazón late casi 3.000 millones de veces en tu vida | evergreen | — | programado ([vb23i8EbyFI](https://youtube.com/shorts/vb23i8EbyFI)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| mié 11-11 | 18:00 | carrera | ¿Perro, gato, hámster o loro? 🐶🐱 Carrera de bolitas | evergreen | — | programado ([fnnlwWYxIMo](https://youtube.com/shorts/fnnlwWYxIMo)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| jue 11-12 | 12:00 | carrera | ¿Qué día de la semana gana? 📅 Carrera de bolitas | evergreen | — | programado ([b3v9Q6ymd3A](https://youtube.com/shorts/b3v9Q6ymd3A)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| jue 11-12 | 18:00 | bola | La bolita crece con cada rebote hasta llenar el círculo (Marcha Turca) | evergreen | — | programado ([6T5zmMoG93A](https://youtube.com/shorts/6T5zmMoG93A)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación |
| vie 11-13 | 12:00 | bola | 3 bolitas, un hueco: ¿cuál escapa primero? Canon de Pachelbel | evergreen | — | programado ([zeb04rqSoHk](https://youtube.com/shorts/zeb04rqSoHk)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación |
| vie 11-13 | 18:00 | dato | Naces con unos 300 huesos y de adulto tienes 206 | evergreen | — | programado ([O2YLb4xlTNk](https://youtube.com/shorts/O2YLb4xlTNk)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| sáb 11-14 | 12:00 | carrera | ¿Pizza, hamburguesa, sushi o tacos? 🍕 ¿Qué comida gana? | evergreen | — | programado ([JKfuFS0b99U](https://youtube.com/shorts/JKfuFS0b99U)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2) |
| sáb 11-14 | 18:00 | bola | ¿En qué rebote escapa la bolita? El lago de los cisnes en neón | evergreen | — | programado ([aqlybcvEYz0](https://youtube.com/shorts/aqlybcvEYz0)) | satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K) | bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación |
| dom 11-15 | 10:00 | **largo** 16:9 | Compilación semanal 2: carreras, rebotes y datos de la semana | evergreen · _Compilación del domingo_ | — | idea · ⚠ cron dom 04:30; OK de Santiago antes de subir; si la del 11-08 no se aprobó, se revisa el formato antes de producir esta | mikan2d (largos 8–9 min de carreras) | segunda compilación; mide si el largo suma horas o solo canibaliza |
| dom 11-15 | 12:00 | dato | El Everest no es la cima más cercana al espacio: es el Chimborazo | evergreen | — | programado ([rKeo3b33kJM](https://youtube.com/shorts/rKeo3b33kJM)) | Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español) | dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP) |
| dom 11-15 | 18:00 | carrera | ¿Qué color gana la carrera? 🎨 El tuyo, ¿llega primero? | evergreen | — | programado ([TlEUxPDJQMY](https://youtube.com/shorts/TlEUxPDJQMY)) | mikan2d (biN5wJVlEzA "Digging Race", 5,7 M) | rotación (toca carrera tras el dato de las 12:00); render del 11-07 con el CTA; café/té/mate pasa a la cola |

Colchón: las 14 ranuras de Short de la semana siguiente están `programado` (la última, color favorito, subida el 11-07 por la mañana) → ≥ 50 %
con guion cumplido con holgura. Los 6 subidos el 11-07 (madrugada y mañana) ya tienen videoId anotado.

## Ritual de cierre — lectura de la semana 1 (métricas al 2026-11-07 02:37, `salida/metricas/2026-11-07/metricas.json`)

- Canal: **9 suscriptores, 4.823 vistas**, 6 Shorts públicos, 9,1 h de visionado (28 d).
- Por Short: bola 1.282 (44 s) y 1.171 (30 s) · dato 1.247 y 1.129 · carrera 1.149 y 676 (el de helados lleva solo ~9 h
  publicado: aún no comparable). **Mediana ≈ 1.160.** Nada rinde > 2× la mediana (nada que duplicar todavía) y nada cae
  bajo la mitad (nada que matar). Carrera es la plantilla más floja: se mantiene en rotación hasta tener n ≥ 4 a 7 días.
- **Problema a atacar: los suscriptores están estancados en 9 con 4,8 K vistas (1 sub cada ~536 vistas, 0,19 %).**
  Causa probable: el único llamado a suscribirse es el cartel `<Cierre/>` de 1,2 s al final (`src/marca/Cierre.tsx`,
  "@bolitalab · suscríbete"), y en un Short que se repite en bucle casi nadie llega a verlo. Además no hay serie ni
  razón para volver (mikan2d: "el último queda fuera de la próxima carrera"). Tareas (dueño y verificación en
  `docs/META-REFERENTE.md`, fila "Subs/video"): (1) CTA dentro del clímax, no después (p. ej. "Suscríbete y elige el
  color de la próxima" en carrera; "¿Adivinaste el rebote? Suscríbete para la próxima" en bola); (2) comentario fijado
  con pregunta-apuesta en cada Short; (3) serie numerada con eliminación en `carrera`. Se mide en subs/1.000 vistas;
  objetivo ≥ 2 (hoy 0,19).
- Plantillas: ninguna supera el 50 % de la semana (siguiente: 6 carrera · 5 dato · 3 bola; carrera 43 %). Variedad OK, pero la plantilla más floja es la que más sale la semana del 9: no se movió porque ya estaba programado; desde el 11-16 la cola prioriza bola y dato hasta que carrera tenga n ≥ 4 a 7 días.

## Contingencias revisadas (barrido 2026-11-07, ventana 11-07 → 11-21)

| Hecho | Fecha | Fuente | Decisión |
|---|---|---|---|
| Máximo de las Leónidas 2026 (restos del cometa 55P/Tempel-Tuttle; ~15 meteoros/h, sin estallido; Luna en cuarto creciente que se pone antes del máximo) | noche 2026-11-17 → 18 | [Star Walk (2026)](https://starwalk.space/es/news/watch-for-the-greatest-leonids-in-the-moonless-sky) · [IGN](https://astronomia.ign.es/leonidas) | **Propuesta 1 (fuera de las 2 semanas):** Short `dato` el **2026-11-17 18:00** (víspera del máximo), ángulo propio: "Una estrella fugaz es un grano del tamaño de una lenteja que entra a ~71 km/s" (cifras a verificar con 2 fuentes al guionar: NASA/IMO). Requiere guion nuevo: encargarlo al generador con este tema y `contingencia` |
| Día Mundial de la Ciencia para la Paz y el Desarrollo (UNESCO) | 2026-11-10 | [Diario Las Américas](https://www.diariolasamericas.com/bienestar/el-10-noviembre-es-el-dia-mundial-la-ciencia-fecha-pensar-la-paz-y-el-desarrollo-n4107469) | **No entra**: sin contradicción ni dato propio (efeméride institucional, saturada); y el 11-10 ya está programado (luz del pasado / Messi-CR7) |
| Otras fechas del 9 al 15 (Día de la Contabilidad 10-11, nacimiento de Rodin 12-11) | — | [El Universo](https://www.eluniverso.com/larevista/sociedad/que-se-celebra-el-10-de-noviembre-nota) | **No entran**: fuera del nicho |

Para la semana 11-09 → 11-15 **no hay contingencia sólida** que desplace algo: todas las ranuras menos una ya están
`programado` (la skill prohíbe moverlas). Una sola propuesta para la semana del 11-16 (Leónidas).

## Cola para la semana del 2026-11-16 (desde el 11-17 baja a 1 Short/día a las 18:00 + 12:00 sáb/dom)

Ya renderizados el 11-07 (diario 03:30, con el CTA) y subidos el 11-07 por la mañana:
1. lun 11-16 12:00 `bola` · ¿Cuál de las 2 bolitas escapa? (`2026-11-07-bola-cual-de-las-2-bolitas-escapa`) — [YG-h9ndmaBc](https://youtube.com/shorts/YG-h9ndmaBc)
2. lun 11-16 18:00 `dato` · En el Canal de Panamá vas del Atlántico al Pacífico hacia el… (`2026-11-07-dato-en-el-canal-de-panama-vas-del-atlantico`) — [9s_YaNsKVEo](https://youtube.com/shorts/9s_YaNsKVEo)

Siguen, en orden de rotación (guiones listos, sin render):
3. mar 11-17 18:00 `dato` · **Leónidas** (contingente, guion por escribir) — si no llega a tiempo, `carrera` · ¿Café, té, mate, cola o jugo? (`contenido/guiones/2026-11-06-carrera-cafe-te-mate.json`, ya promovido)
4. mié 11-18 18:00 `carrera` · café/té/mate (o ¿Qué país de Latinoamérica llega primero? `carrera-que-pais-gana.json` si el anterior se usó arriba)
5. jue 11-19 18:00 `bola` · ¿En qué rebote se escapa? La Oda a la Alegría en neón (`bola-oda-escape.json`)
6. vie 11-20 18:00 `dato` · La miel no caduca: la de hace 3.000 años aún se podía comer (`dato-miel-nunca-se-echa-a-perder.json`)
7. sáb 11-21 12:00 `bola` · 3 bolitas y la Marcha Turca: ¿cuál encuentra la salida? (`bola-marcha-escape-3.json`) · 18:00 `dato` · Un rayo es 5 veces más caliente que la superficie del Sol (`dato-rayo-mas-caliente-que-el-sol.json`)

Reemplazos si una ranura se cae: `dato-pulpo-tres-corazones` · `carrera-super-poder` · `bola-furelise-crecer`.

## Plan (JSON)

```json
{
  "version": 1,
  "canal": "bolita-lab",
  "zona": "America/Santiago",
  "actualizado": "2026-11-07T02:45:00-03:00",
  "semanas": [
    {
      "inicio": "2026-11-02",
      "fin": "2026-11-08",
      "rol": "en-curso"
    },
    {
      "inicio": "2026-11-09",
      "fin": "2026-11-15",
      "rol": "siguiente"
    }
  ],
  "ranuras": [
    {
      "fecha": "2026-11-04",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "¿Cuántos rebotes necesita para llenar el círculo? Canon de Pachelbel",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-bola-canon-crecer.json",
      "videoId": "wWkHMfYBX0g",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación. Vistas al 11-07: 1282.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-04",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Un billón de segundos son más de 31.000 años",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-dato-billon-de-segundos.json",
      "videoId": "Zn66wjkNX0w",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP). Vistas al 11-07: 1247.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-05",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿PlayStation, Xbox, Nintendo o PC? 🎮 ¿Cuál gana?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-carrera-gamers-consola.json",
      "videoId": "nJJ6-EY6jKg",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2). Vistas al 11-07: 1149.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-05",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "2 bolitas, 1 hueco que gira: ¿cuál escapa primero? (Canon)",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-bola-canon-escape-2.json",
      "videoId": "Z8-3_uzhpJs",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación. Vistas al 11-07: 1171.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-06",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "El camarón mantis tiene 12 receptores de color; tú, solo 3",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-dato-camaron-mantis-colores.json",
      "videoId": "ELqZFQmmhHo",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP). Vistas al 11-07: 1129.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-06",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Chocolate, vainilla, fresa, menta o limón? ¿Qué helado gana? 🍦",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "publicado",
      "guion": "contenido/guiones/2026-11-03-carrera-helados-chocolate-vainilla-fresa-menta-limon.json",
      "videoId": "XMNHIHXSLhM",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2). Vistas al 11-07: 676.",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-07",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "3 bolitas crecen en cada rebote: ¿cuánto tardan en llenar el círculo?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-bola-cisnes-crecer-3.json",
      "videoId": "Wav_W4VRJ_8",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-07",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Cleopatra vivió más cerca del iPhone que de las pirámides",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-dato-cleopatra-mas-cerca-de-iphone.json",
      "videoId": "tCaY7nso7CY",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-08",
      "hora": "10:00",
      "formato": "largo",
      "plantilla": "compilacion",
      "tema": "Compilación semanal: los mejores Shorts de bolitas y datos de la semana",
      "tipo": "evergreen",
      "serie": "Compilación del domingo",
      "contingencia": null,
      "estado": "idea",
      "guion": null,
      "videoId": null,
      "referente": "mikan2d (largos 8–9 min de carreras)",
      "porQue": "ruta B (horas de largo) y prueba del formato compilación con los renders mejorados",
      "bloqueo": "la genera el cron dom 04:30 (compilar.mts --n 14); se sube SOLO tras el OK de Santiago (copia en su Escritorio). Riesgo \"reutilizado\": revisar monetizacion-youtube"
    },
    {
      "fecha": "2026-11-08",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿iPhone, Samsung, Xiaomi o Pixel? 📱 ¿Qué celular gana?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-carrera-iphone-vs-android.json",
      "videoId": "OzRnX27pawU",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-08",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "¿Cuántos rebotes aguanta antes de escapar? Para Elisa en neón",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-bola-furelise.json",
      "videoId": "pZwZS5YXUP8",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-09",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Si la Tierra fuera una pelota de básquet, ¿dónde estaría la Luna?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-dato-tierra-luna.json",
      "videoId": "iBORkBbkd8c",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-09",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Qué mes del año gana la carrera? 🏁 Carrera de bolitas",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-carrera-meses.json",
      "videoId": "z9c6DgDFKAA",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-10",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Lo que ves en el cielo ya pasó: el Sol tiene 8 minutos de retraso",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-04-dato-luz-pasado.json",
      "videoId": "ddtrrj2MF3M",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-10",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Messi, CR7, Neymar o Mbappé? ⚽ ¿Quién gana la carrera?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-03-carrera-messi-cr7-neymar.json",
      "videoId": "dy2omu9k2go",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-11",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Tu corazón late casi 3.000 millones de veces en tu vida",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-05-dato-corazon-latidos.json",
      "videoId": "vb23i8EbyFI",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-11",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Perro, gato, hámster o loro? 🐶🐱 Carrera de bolitas",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-04-carrera-mascotas.json",
      "videoId": "fnnlwWYxIMo",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-12",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Qué día de la semana gana? 📅 Carrera de bolitas",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-05-carrera-dias-semana.json",
      "videoId": "b3v9Q6ymd3A",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-12",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "La bolita crece con cada rebote hasta llenar el círculo (Marcha Turca)",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-04-bola-marcha-crecer.json",
      "videoId": "6T5zmMoG93A",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-13",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "3 bolitas, un hueco: ¿cuál escapa primero? Canon de Pachelbel",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-05-bola-3bolas-canon.json",
      "videoId": "zeb04rqSoHk",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-13",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "Naces con unos 300 huesos y de adulto tienes 206",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-04-dato-huesos-bebe-300-adulto-206.json",
      "videoId": "O2YLb4xlTNk",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)",
      "bloqueo": null
    },
    {
      "fecha": "2026-11-14",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Pizza, hamburguesa, sushi o tacos? 🍕 ¿Qué comida gana?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-06-carrera-pizza-vs-hamburguesa.json",
      "videoId": "JKfuFS0b99U",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación; carrera es la más floja (1.149 y 676): seguir midiendo antes de matar (n=2)"
    },
    {
      "fecha": "2026-11-14",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "bola",
      "tema": "¿En qué rebote escapa la bolita? El lago de los cisnes en neón",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-06-bola-cisnes-escape.json",
      "videoId": "aqlybcvEYz0",
      "referente": "satisfying.ba11s (Peo-DIOmmRo, 78 M; mediana reciente 60–160 K)",
      "porQue": "bola + dato rinden ≈ 1.150–1.280 vistas (mejor plantilla junto a dato); rotación"
    },
    {
      "fecha": "2026-11-15",
      "hora": "10:00",
      "formato": "largo",
      "plantilla": "compilacion",
      "tema": "Compilación semanal 2: carreras, rebotes y datos de la semana",
      "tipo": "evergreen",
      "serie": "Compilación del domingo",
      "contingencia": null,
      "estado": "idea",
      "guion": null,
      "videoId": null,
      "referente": "mikan2d (largos 8–9 min de carreras)",
      "porQue": "segunda compilación; mide si el largo suma horas o solo canibaliza",
      "bloqueo": "cron dom 04:30; OK de Santiago antes de subir; si la del 11-08 no se aprobó, se revisa el formato antes de producir esta"
    },
    {
      "fecha": "2026-11-15",
      "hora": "12:00",
      "formato": "short",
      "plantilla": "dato",
      "tema": "El Everest no es la cima más cercana al espacio: es el Chimborazo",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-06-dato-el-everest-no-es-la-cima-mas-cercana-al.json",
      "videoId": "rKeo3b33kJM",
      "referente": "Ñerd (fórmula Arizona, 4,1 M) · El Calacas (formato 60 s en español)",
      "porQue": "dato ≈ 1.130–1.250 vistas; valor educativo propio (YPP)"
    },
    {
      "fecha": "2026-11-15",
      "hora": "18:00",
      "formato": "short",
      "plantilla": "carrera",
      "tema": "¿Qué color gana la carrera? 🎨 El tuyo, ¿llega primero?",
      "tipo": "evergreen",
      "serie": null,
      "contingencia": null,
      "estado": "programado",
      "guion": "contenido/guiones/2026-11-07-carrera-que-color-favorito.json",
      "videoId": "TlEUxPDJQMY",
      "referente": "mikan2d (biN5wJVlEzA \"Digging Race\", 5,7 M)",
      "porQue": "rotación (toca carrera tras el dato de las 12:00); ya renderizado el 11-07 con el CTA; el de café/té/mate pasa a la cola"
    }
  ]
}
```
