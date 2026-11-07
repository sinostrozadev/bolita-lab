# Bolita Lab — Meta referente (a quién tenemos que superar)

> Creado **2026-11-07 02:45** por Claude (subagente). Método: skill global `superar-virales-del-nicho`.
> Norte: **monetizar y hacer ganar dinero a Santiago**. La meta de calidad es **superar** al referente, no igualarlo, y
> solo cuenta como "superado" con resultados (retención, vistas relativas, subs/video) durante 2 tandas seguidas (§5).
> Fuentes: `docs/REFERENTES.md` (investigación 2026-11-04/05), `salida/metricas/2026-11-07/metricas.json` (lo nuestro).

## Metas actuales

| Plantillas | Canal-meta | Video-meta | Videos de apoyo |
|---|---|---|---|
| **`bola`** (y el canal entero en "Shorts de bolita") | **satisfying.ba11s** ([@satisfying.ba11s](https://www.youtube.com/@satisfying.ba11s)) · ~1,35 M subs · ~384 videos · creado 2023-11 · ~12 Shorts/mes · sin voz, bola que rebota/crece en un círculo + melodía, hecho por código (alcanzable con Remotion) | **"Here is a bouncing ball that gets bigger and faster until my pc crashes"** — [Peo-DIOmmRo](https://www.youtube.com/watch?v=Peo-DIOmmRo) · 78,3 M · 56 s · 2023-12 | [rgjeRfHFjms](https://www.youtube.com/watch?v=rgjeRfHFjms) "Reminds me of something 🤔" (38,6 M, 36 s, adivinar la canción) · su **pestaña Shorts reciente** (60–160 K por Short = la vara realista de la mediana) |
| `carrera` (apoyo de la misma meta) | mikan2d ([@mikan2d](https://www.youtube.com/@mikan2d)) · 3,08 M subs · ~6/mes | [biN5wJVlEzA](https://www.youtube.com/watch?v=biN5wJVlEzA) "Digging Race" · 5,7 M · 34 s | [4S4LVaZoiks](https://www.youtube.com/watch?v=4S4LVaZoiks) "Particle Race 4" (5,1 M, 60 s, serie numerada) |
| **`dato`** | **Ñerd** ([@Ñerd-s2j](https://www.youtube.com/@%C3%91erd-s2j)) · 19,1 K subs · 44 Shorts en ~2 semanas · ~16 M vistas | "¿Por qué Arizona se quedó a 60 km del mar sin tocarlo?" · 4,1 M · 2:42 (fórmula ya copiada a `FORMULA_DATO`) | capital de Canadá (1,3 M) · "¿Por qué Chile es tan largo…?" (1,1 M). Formato vecino en español a 60–90 s: El Calacas ("beberte todos los océanos", 3,6 M, 61 s) |

**Por qué estas y no otras (criterios §2):**
- satisfying.ba11s es **la misma mecánica que `bola`** (inventó la ola "Will the ball escape?"), sin voz, sin equipo
  humano: lo podría hacer nuestra fábrica (test de ≤ 5 días de plantilla: sí). Está vivo (~12/mes).
- **Excepciones declaradas:** (a) el video-meta es un **outlier de 2023** (78 M); lo usamos solo como plantilla de
  *gancho y estructura*, porque es el patrón que todo el formato copió. La vara de **resultado** es la mediana reciente
  del canal (60–160 K por Short), no los 78 M. (b) Ningún referente cumple "3–30× nuestros subs" (tenemos 9): todos son
  techo lejano; comparamos por ratios (§7) y por la mediana reciente. (c) satisfying.ba11s usa melodías con derechos
  (riesgo Content ID): **no se copia eso**; nosotros solo dominio público (Canon, Para Elisa, Marcha Turca, Oda,
  Lago de los cisnes). Ahí ya ganamos en riesgo de monetización.
- Ñerd para `dato`: el formato (2–3 min narrado) es **más largo** que nuestro `dato` (~30–35 s), así que es meta de
  **guion y fórmula** (gancho → mito → "la verdad es más rara" → fuente en la voz → giro → cierre simétrico), no de duración.
- **Pendiente (cuando el piloto 8777 esté libre):** abrir la pestaña Shorts de satisfying.ba11s, elegir un Short de los
  últimos 60 días cercano a su mediana alta y reemplazar el video-meta "de resultado" con su id, duración y vistas a 7 d
  (procedimiento `arranque-de-nicho` §2). La búsqueda web del 2026-11-07 no devolvió cifras recientes del canal
  (vidIQ tiene datos de 2024-11: 1,45 M subs, 384 videos).

## Ficha de la meta — `bola` vs. satisfying.ba11s (medido 2026-11-07)

| Dimensión | satisfying.ba11s (referente) | Bolita Lab hoy | Gana | Fecha / fuente |
|---|---|---|---|---|
| Gancho 0–3 s | Fondo negro, bola **ya en movimiento** en el frame 0 y **dos rótulos fijos todo el video**: promesa arriba ("…until my pc crashes 😳") + "The end is insane 💀" abajo | Pregunta gigante sobre placa oscura desde el frame 0 (`props.gancho`), **se va a los 1,8 s** y entra el contador "REBOTES"; sin rótulo de promesa del final | referente (nuestro gancho desaparece; el suyo sostiene la promesa 56 s) | 2026-11-07 · REFERENTES.md; `src/plantillas/bola/Bola.tsx` |
| Ritmo | 1 nota por rebote y aceleración continua hasta el clímax (la canción se vuelve reconocible al acelerar) | 1 nota por rebote, crecer/escapar; eventos/10 s **sin medir** | por medir | contar rebotes/10 s en la hoja de contacto de ambos |
| Lenguaje visual | bola de color sólido, círculo fino, fondo negro, nada más | neón con estela, contador, cartel del clímax, marca de agua | por verificar lado a lado | hoja de contacto pendiente |
| Voz / texto | sin voz; texto fijo en inglés con emoji | sin voz; texto en español (gancho + contador + cartel) | empate (idioma es ventaja nuestra en LatAm) | — |
| Música | canciones conocidas **con derechos** (p. ej. "Kerosene") → Content ID | **dominio público** sintetizado en Node | **nosotros** (riesgo de monetización ≈ 0) | DECISIONES / REFERENTES |
| Duración | 36–56 s | bola 30–44 s (1.282 vistas con 44 s; 1.171 con 30 s) | por medir (¿más largo = más vistas? n=2) | metricas 2026-11-07 |
| Retención | no pública (formato famoso por retener hasta el final) | **sin datos** (Analytics no guarda `averageViewPercentage` en metricas.json) | sin datos | — |
| Título / miniatura | promesa en 1.ª persona + emoji ("until my pc crashes 😳"), sin pregunta | pregunta-apuesta ("¿Cuántos rebotes…?", "¿cuál escapa primero?") + nombre de la pieza | por medir (CTR no medido) | — |
| Cadencia | ~12/mes | 2/día (hasta 11-16), luego 1/día + 2 sáb/dom (~38/mes) | nosotros en volumen; **riesgo "repetitivo" YPP** si las variantes se parecen | calendario.json |
| Vistas por Short | mediana reciente **60–160 K** (outlier 78 M) | **≈ 1.160** de mediana (bola 1.282 · 1.171) en 1–3 días | referente (×50–140) | metricas 2026-11-07 |
| Vistas ÷ subs | 60–160 K ÷ 1,35 M ≈ 0,04–0,12 | 1.160 ÷ 9 ≈ 129 | sin sentido aún con 9 subs (nos favorece por tamaño) | — |
| **Subs/video** | ~1,35 M ÷ ~384 ≈ **3.500** | **9 ÷ 6 = 1,5** (1 sub cada ~536 vistas, 0,19 %) | **referente — brecha #1** | metricas 2026-11-07 |

## Ficha — `carrera` vs. mikan2d (resumen)

| Dimensión | mikan2d | Bolita Lab hoy | Gana |
|---|---|---|---|
| Gancho | parrilla completa de 24 bolitas + "Who will win?" arriba en el frame 0 | pregunta en frame 0; 4–5 competidores con logo/emoji | por verificar lado a lado |
| Razón para volver | **serie con eliminación** ("el último queda fuera de la próxima") | ninguna (cada carrera es suelta) | referente |
| Mecánica en el título | "Digging Race", "Particle Race 4": la **mecánica** es el título | el **tema** es el título (consolas, helados, celulares) | por medir |
| Vistas | 5,7 M (34 s) | 1.149 y 676 (la de 676 con ~9 h) — la plantilla más floja | referente |

## Ficha — `dato` vs. Ñerd (resumen)

| Dimensión | Ñerd | Bolita Lab hoy | Gana |
|---|---|---|---|
| Fórmula | gancho imperativo → mito → "la verdad es más rara" → fuente en la voz → giro → cierre simétrico | la misma, en el prompt desde 2026-11-05 (`FORMULA_DATO`); los 2 publicados (billón, camarón) son **anteriores** | por medir con los primeros que la llevan |
| Duración | 104–164 s | ~30–35 s | otro formato (meta de guion, no de duración) |
| Imagen por idea | mapa/satélite + fotos con crédito + rótulos de 1–2 palabras | fotos de Commons por escena (desde 2026-11-04), cifras que aterrizan con la voz | por verificar lado a lado |
| Vistas | ~384 K/video de mediana | 1.247 y 1.129 | referente |
| Subs/video | ~19,1 K ÷ 44 ≈ 434 | (canal) 1,5 | referente |

## Brechas → tareas (ordenadas por impacto en el Norte)

| # | Brecha | Tarea | Dueño | Verificación | Impacto / esfuerzo |
|---|---|---|---|---|---|
| 1 | **Subs/video 1,5 vs. 3.500** (9 subs con 4,8 K vistas) | CTA de suscripción **dentro** del video, no después: hoy solo existe `<Cierre/>` de 1,2 s al final ("@bolitalab · suscríbete", `src/marca/Cierre.tsx`) que en un Short en bucle casi nadie ve. Poner una línea de CTA en el clímax ("Suscríbete y elige el color de la próxima" / "¿Acertaste? Suscríbete para la próxima") + comentario fijado con pregunta-apuesta en cada Short | Claude: sesión de canal → subagente Opus en `src/plantillas` + `src/marca` (render de prueba de las 3 plantillas) | subs por 1.000 vistas: de **0,19 a ≥ 2** en la tanda siguiente (métricas diarias, 7 días tras el cambio) | alto / bajo |
| 2 | Sin razón para volver (mikan2d: eliminación) | Serie numerada en `carrera`: "Carrera #N — el último queda fuera de la #N+1", lista en la descripción; mismo elenco (p. ej. países de LatAm, `carrera-que-pais-gana`) | Claude: Opus en generador de guiones + `carrera` | ≥ 3 carreras seguidas de la serie publicadas; vistas de la #2 y #3 ≥ mediana de carrera | alto / medio |
| 3 | Gancho de `bola` se va a los 1,8 s; el referente sostiene la promesa todo el video | Segundo rótulo **fijo abajo** con promesa del final ("El final es una locura 💀" o variantes) y el gancho arriba persistente (reducido) en vez de desaparecer; respetar zona segura | Claude: Opus en `src/plantillas/bola` | hoja de contacto a 0 / 1,5 / 10 / 25 s muestra ambos rótulos; retención (cuando haya Analytics) ≥ la del lote anterior | alto / bajo |
| 4 | Retención sin medir (fila vacía = "superado" imposible) | Agregar `averageViewPercentage` y `averageViewDuration` por video a `scripts/metricas.mts` (Analytics API, mismo cliente) | Claude: Sonnet en `scripts/` | `metricas.json` del día siguiente trae retención por video publicado | alto / bajo |
| 5 | Video-meta de resultado es un outlier de 2023 | Elegir un Short reciente (≤ 60 días) de satisfying.ba11s cercano a su mediana; anotar id, duración, vistas 48 h / 7 d; hoja de contacto lado a lado con nuestro mejor `bola` | Claude con el piloto 8777 **cuando esté libre** (`navegador-piloto`, `arranque-de-nicho` §2) | esta ficha con id real y las filas "Ritmo" y "Lenguaje visual" llenas | medio / bajo |
| 6 | "¿Adivinas la canción?" (gancho de rgjeRfHFjms, 38,6 M) no se usa | Lote de 6 `bola` con título "¿Adivinas la canción? 🎵" y melodía de dominio público reconocible, sin nombrarla en pantalla hasta el final | Claude: Opus en generador de guiones (`bola`) | lote de 6 publicado; mediana del lote vs. mediana de `bola` (1.160) | medio / bajo |
| 7 | Carrera es la plantilla más floja (1.149 / 676) | Probar la mecánica en el título (estilo mikan2d: "Carrera cavando arena", "Carrera en espiral") contra el tema en el título, lotes de ≥ 6, una variable | Claude: sesión de canal (`estrategia-viva`) | tras 2 tandas: si sigue < ½ de la mediana del canal, se reduce su cuota en la rotación (DECISIONES) | medio / medio |
| 8 | `dato` publicado sin la fórmula Ñerd | Verificar que los `dato` programados desde el 11-09 llevan la fórmula; comparar sus vistas a 7 d con billón/camarón | Claude: sesión de canal | tabla "con fórmula vs. sin fórmula" en la revisión del lunes 11-16 | medio / bajo |

## Estado de la meta

- **Avance, no superado.** Producción: ganamos en riesgo de monetización (música de dominio público) e idioma; el resto
  está por medir. Resultado: perdemos lejos en vistas (×50–140) y en subs/video (1,5 vs. 3.500); retención sin datos.
- Próxima re-medición: al cerrar la tanda siguiente (≥ 5 videos tras el cambio del CTA) y el lunes 2026-11-09 (`revisar.mts`).
- Trampas a vigilar: no copiar sus canciones con derechos ni sus textos exactos en inglés; no publicar variantes
  numeradas de la misma escena (política de contenido repetitivo del YPP, `monetizacion-youtube`).

## Historial de metas

- 2026-11-07 · Meta inicial fijada: satisfying.ba11s (bola/canal) + mikan2d (carrera) + Ñerd (dato).
