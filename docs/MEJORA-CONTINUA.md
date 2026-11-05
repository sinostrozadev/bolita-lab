# Mejora continua (orden permanente de Santiago, 2026-11-04)

> "Trabaja para mejorar cada vez. Evalúa cada tanda de videos, busca mejoras e impleméntalas.
> Que no tenga que volver a pedirlo."

Esta es la regla que gobierna el canal desde ahora. Cualquier sesión de Claude que trabaje en
este repo la cumple sin que se la pidan.

## 1. Qué se evalúa y cuándo

**Cada lunes** (cron `revisar`) y **cada vez que una sesión termina una tanda** de ≥ 5 videos:

1. **Mirar los videos, no solo el código.** Extraer 6 fotogramas por video (0 s, 1,5 s, 25 %,
   50 %, 75 %, último) y revisarlos de verdad: ¿hay algo que mirar en cada momento? ¿se
   entiende sin audio? ¿el gancho está en el frame 0? ¿hay texto pisado, cortado o fuera de la
   zona segura?
2. **Comparar contra la vara del nicho**, no contra la tanda anterior. La vara: los mejores
   Shorts de datos cuentan una **historia visual** (una imagen o escena por idea, movimiento
   continuo, iconografía reconocible), y los de carreras muestran a los competidores con su
   **identidad visual real** (logo, color, emoji), no solo su nombre.
3. **Métricas** (cuando haya): Studio → Analytics → Shorts. Visto vs deslizado, retención media,
   suscriptores por cada 1.000 vistas, comentarios. Ver `docs/ESTRATEGIA.md` §5 para los umbrales.
4. **Escribir la revisión** en `salida/revisiones/<fecha>.md`: 3 cosas que están bien,
   5 mejoras concretas ordenadas por impacto/esfuerzo, y cuáles se implementan ya.

## 2. Qué se hace con lo encontrado

- Las mejoras de **plantilla** (visual, ritmo, sonido, tipografía) se implementan en la misma
  sesión, en `src/plantillas/<p>` y `scripts/`, con `tsc` limpio y un render de prueba de
  cada plantilla tocada, revisado fotograma a fotograma antes de dar por cerrado.
- Las mejoras de **guion** (ganchos, temas, estructura) van a `src/plantillas/<p>/README.md` y
  al prompt de `scripts/generar-guiones.mts`, y se re-generan los guiones del backlog afectados.
- Los videos ya renderizados con un defecto visible se **re-renderizan** antes de subirse; los
  ya programados en YouTube se dejan (no se borra lo publicado por un detalle estético).
- Cada mejora se anota en `docs/DECISIONES.md` con fecha y motivo. Si una mejora empeora la
  retención, se revierte: la métrica manda sobre el gusto.

## 2b. Herramientas, estrategia y referentes (añadido por Santiago, 2026-11-04)

- **Explorar herramientas, no solo ajustar las que hay.** En cada revisión, preguntar "¿qué
  herramienta haría esto mejor?" (voz más natural, música generada, imágenes, efectos, edición,
  analítica) y, si una mejora lo necesita, **instalarla y adoptarla** sin pedir permiso:
  paquetes npm, modelos locales, fuentes, bancos de imágenes/sonido con licencia, APIs gratuitas.
  Solo se consulta a Santiago si cuesta dinero o exige una cuenta suya.
- **Compararse con los virales del nicho.** Cada semana, buscar (web) 5–10 Shorts recientes
  con millones de vistas del mismo tipo (simulaciones satisfying, datos animados, carreras) y
  anotar qué hacen distinto: gancho, ritmo, sonido, texto, miniatura/primer frame, duración,
  títulos. Convertir lo que se pueda en reglas de plantilla o de guion. No copiar: adaptar.
- **Evaluar la estrategia, no solo los videos.** Con las métricas reales, revisar cadencia,
  horarios, proporción de plantillas, idioma, duración, y la ruta al YPP (subs vs horas vs
  vistas de Shorts). Si algo no rinde en 2–3 semanas, cambiarlo y dejarlo escrito en
  `docs/ESTRATEGIA.md` y `docs/DECISIONES.md`.
- **Sin depender de Santiago.** Todo lo anterior lo ejecuta la revisión semanal
  (`scripts/revisar.mts`) y cualquier sesión que trabaje en el repo, de forma continua.
  Santiago solo recibe el resumen en `salida/revisiones/` y decide únicamente lo que implica
  dinero, cuentas suyas o un cambio de identidad del canal.

## 3. Lo que NO se negocia

- Solo material con licencia clara: imágenes de **dominio público o CC0/CC BY** (Wikimedia
  Commons con filtro de licencia, atribución en la descripción cuando la licencia lo exige),
  logos desde **simple-icons** (CC0) o formas propias; melodías de dominio público. Cero Content ID.
- Zona segura, duración 25–58 s, gancho ≤ 1,5 s, marca de agua y cierre (ver `docs/CONVENCIONES.md`).
- Un dato por video con fuente verificable en la descripción.
- No se sacrifica lo que funciona por novedad: variar formatos, sí; romper la identidad, no.

## 4. Dirección de producto (respuesta a "¿haremos solo Shorts?")

1. **Ahora (semanas 1–4):** Shorts, 2 al día, tres plantillas. Es lo que consigue suscriptores y
   vistas. Más la **compilación larga semanal** (16:9, con capítulos), que suma horas de
   reproducción, el otro camino al YPP.
2. **Cuando una plantilla retenga > 80 %** (mediados de noviembre): subir la vara visual de
   `dato` a historia ilustrada (imágenes de archivo con movimiento, escenas, personajes) y
   preparar la plantilla **`historia`**: 3–6 minutos, horizontal, la misma voz y estética, un
   tema por video ("la vida de Cleopatra en 4 minutos"). Un largo bien hecho vale 10 Shorts en
   horas de reproducción.
3. **Después (diciembre):** series (mismo personaje, capítulos), un formato interactivo en
   comentarios ("elige el próximo competidor"), y versión en inglés de las simulaciones
   (no tienen idioma: duplican alcance gratis).

## 5. Cómo corre solo

- `scripts/revisar.mts` (cron lunes 05:00): extrae fotogramas de la última tanda, reúne las
  métricas por API, llama a `claude -p` (Opus) con este documento como contrato, escribe la
  revisión y aplica las mejoras de plantilla y guion que pasen `tsc` + render de prueba; si algo
  falla, revierte con `git checkout` y deja el detalle en la revisión. Commit automático solo
  si todo quedó verde.
- Si Santiago quiere ver qué cambió: `git log --oneline` y `salida/revisiones/`.

## 6. Skills y referentes (2026-11-05)

El método de este documento vive también como skill de Santiago (`~/.claude/skills/mejora-continua-canal`), junto
con `monetizacion-youtube` (lista de verificación por video y por tanda que se pasa en cada revisión),
`canal-youtube-automatico`, `navegador-piloto` y `mejorar-skills-y-md-global`. Los canales referentes se anotan en
`docs/REFERENTES.md` (primero: Ñerd). La última revisión se copia a `salida/revisiones/ULTIMA.md` para que Santiago
tenga una sola ruta que abrir.
