# Mejoras · Bolita Lab · 2026-11-08 (sesión multicanal, Fable + 2 agentes Opus; Santiago: "toma tú Bolita Lab")

Métricas al 2026-11-08 08:00: 11 subs · 6.871 vistas totales · 8 Shorts públicos; 28 d en Studio: 7,7 K vistas, 21,4 h, +9 subs, 99,9 % espectadores nuevos.

## Detectado
- **El canal no pega porque el primer segundo no retiene.** Studio (28 d): **44,4 % se queda a ver, 55,6 % desliza**. Por Short (herramienta nueva `retencion-studio.mjs`):
  bola Pachelbel 58,7 % · dato billón 56,3 % · dato mantis 45,7 % · bola escape 44,4 % · carrera consolas 40,0 % · dato Cleopatra 35,2 % · carrera helados 28,3 % · bola cisnes 26,0 %.
  Meta de un Short que crece: ≥ 55 % (satisfying.ba11s ≈ 70 %+). Solo 2 de 8 llegan.
- Todos los Shorts con ≥ 3 días se frenan en **1.147–1.288 vistas** (audiencia de prueba) sin importar la plantilla; los más nuevos retienen peor (26–35 %) y reciben menos empuje (688, 792, 66 vistas).
- **Los 8 publicados (y los 2 de hoy) son renders del 11-03, anteriores al gancho en frame 0 del 11-04.** Lo programado desde `iBORkBbkd8c` (11-09 12:00) ya lleva gancho → comparación natural viejo vs nuevo desde el 11-09.
- Lo que la plantilla actual NO arregla frente a satisfying.ba11s (51 miniaturas de 7 referentes medidas): bolita de 2,6–3,6 % del alto (ellos 7–16 %), anillo al 80 % del ancho (ellos ~95 %), **~90 % de pantalla negra** (ellos círculo 100 % lleno de trazas de color), promesa invisible (preguntamos "¿cuántos hasta llenarlo?" con el círculo vacío; ellos muestran el estado final + "The end is insane 💀"), 0,5 s de bolita quieta y silencio (primera nota a ~0,55 s), un solo bloque de texto (ellos mecánica arriba + intriga abajo, fijos todo el video), iconos de carrera ilegibles en móvil.
- `carrera` es la plantilla más floja también en retención (40 % y 28 %).
- El token de YouTube de Bolita no tiene el permiso `yt-analytics.readonly` (LP sí): `metricas.mts` no puede leer retención por API.

## Mejorado
- Rediseño del primer segundo en curso (agente Opus, rama `primer-segundo`, worktree): trazas persistentes que llenan el círculo de color, bola ≥ 8 % del alto y anillo al 92 %, cold open de 0,4 s con el estado final ("así termina ↓"), movimiento + primera nota en ≤ 0,2 s, dos bloques de texto fijos (mecánica arriba, intriga abajo). Primero `bola`, luego `carrera`. Se mezcla solo si pasa tsc + render de prueba + fotogramas medidos.
- Herramienta `herramientas/navegador/retencion-studio.mjs`: lee "se quedó a ver" por Short desde Studio con el piloto (lo que la API no da).

## Herramientas exploradas
- Lectura de `ytInitialData` + chip "Populares" de YouTube sin piloto para bajar las portadas más vistas de un canal (scripts en la skill `caratulas-con-gpt/referencias/`).
- El ffmpeg de Remotion solo trae `scale`: sirve para fotogramas, no para hojas de contacto.

## Agregado
- Evidencia: 40 fotogramas (0/0,5/1/2/3 s) de los 8 Shorts + 51 portadas de referentes con manifiesto (scratchpad de la sesión; resumen aquí y en META-REFERENTE).
- META-REFERENTE: fila "Retención" ya con datos (antes "sin datos").

## Pendiente
- Mezclar `primer-segundo` tras revisar los fotogramas; re-renderizar desde el 11-17 con la plantilla nueva y evaluar reemplazar los programados 11-12 → 11-16 si el tope diario de subidas lo permite (son 10).
- Medir: "se quedó a ver" ≥ 55 % en los 6 primeros Shorts nuevos y ≥ 3 de 6 sobre 2.000 vistas a 7 días (hoy 0/8).
- Santiago: reautorizar el token con Analytics (`subir.mts autorizar` ya pide el scope en LP; copiar la lista a Bolita) para que `metricas.mts` guarde retención sola.
