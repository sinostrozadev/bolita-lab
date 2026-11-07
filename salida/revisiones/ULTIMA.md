# Mejoras · Bolita Lab · 2026-11-07 (sesión de madrugada, Fable + 3 agentes Opus)

Métricas al 2026-11-07 02:37: 9 subs · 4.823 vistas · 6 Shorts públicos (669–1.282 vistas c/u, mediana ≈ 1.160) · 23 programados hasta el 11-15 12:00.

## Detectado
- Subs estancados en 9 con 4,8 K vistas (0,19 %, 1,5 subs por video): el único llamado a suscribirse es el cartel de cierre de 1,2 s (`src/marca/Cierre.tsx`), invisible en un Short en bucle. Medido en `salida/metricas/2026-11-07/metricas.json`.
- `carrera` es la plantilla más floja (1.149 y 676 vistas) frente a `bola`/`dato` (1.130–1.280). n=2, se sigue midiendo antes de tocar la rotación.
- `estado.mts` mostraba una caducidad del token falsa (11-13 08:01): el archivo del token se reescribe en cada refresco y perdió `emitido_en`, así que la cuenta corría desde la fecha del archivo. Caducidad real: **2026-11-11 22:27**.
- `metricas.json` dejaba el título vacío en los videos programados (`...v` al final del objeto pisaba el fallback de la bandeja).
- `subir-studio.mjs` falló 2 veces con el primer Short de hoy (timeout en "Visibility" y luego en "Video language"): la subida del archivo iba lenta tras el reinicio (12 GB de RAM recién aplicados) y el desplegable de categoría quedó abierto tapando el diálogo. Se remató a mano desde el paso Details con `CONTINUAR=1`.
- El canal no tenía `docs/PLAN-SEMANAL.md` ni `docs/META-REFERENTE.md` (órdenes permanentes del 11-05).
- La revisión semanal (`revisar.mts`) escribía el informe sin los 5 encabezados que exige el panel de Santiago.

## Mejorado
- Token: `emitido_en` restaurado en `secrets/youtube-token.json` (emisión real 11-04 22:28) → `estado.mts` vuelve a avisar la fecha correcta.
- `scripts/metricas.mts`: título de la bandeja como fallback para los programados.
- 3 Shorts del diario del 11-06 revisados por hoja de contacto (gancho en el frame 0, emojis en la carrera, fotos en el dato) y programados: pizza 11-14 12:00 (JKfuFS0b99U), cisnes 11-14 18:00 (aqlybcvEYz0), Everest 11-15 12:00 (rKeo3b33kJM).
- `scripts/revisar.mts`: informe con las 5 secciones fijas (Detectado · Mejorado · Herramientas exploradas · Agregado · Pendiente) al principio, manteniendo el detalle. Verificado: tsc ok, dry-run con 23 videos y los 5 H2 en orden.
- CTA de suscripción dentro del video (clímax) en las 3 plantillas, en worktree con render de prueba. Hecho y mezclado a master (commit 7b999dd): `src/marca/Llamado.tsx`, prop opcional `llamado`; 4 renders de prueba a escala 0,5 revisados (hojas en `salida/pruebas/cta/`). Aparece 6 s antes del escape/meta y en el remate del dato. Desde el diario del 11-07 todos los renders lo llevan; verificación: subs por 1.000 vistas ≥ 2 en 7 días (hoy 0,19).

## Herramientas exploradas
- Ninguna nueva esta sesión; se usó el inventario (`herramientas-disponibles`): piloto 8777, helpers de fotogramas sobre el ffmpeg mínimo de Remotion, Data API para métricas. Búsqueda web para referentes (satisfying.ba11s, mikan2d) y contingencias (Leónidas 17–18 nov).

## Agregado
- `docs/PLAN-SEMANAL.md` (semanas 11-02→08 y 11-09→15, 26 ranuras, JSON v1; cola desde el 11-16).
- `docs/META-REFERENTE.md` (meta: satisfying.ba11s para `bola`/canal, mikan2d para `carrera`, Ñerd para `dato`; 8 brechas con dueño y verificación).
- `herramientas/navegador/lote-2026-11-07.sh`; estado compartido `~/.claude/canales/estado/bolita-lab.json`; línea en `docs/DECISIONES.md`.

## Pendiente
- Santiago: token reautorizado el 11-07 03:07 (ya con permiso de comentarios; caduca el 11-14 03:07, próxima renovación ≈ 11-13); ver la compilación del domingo 11-08 antes de subirla; `gh secret set YOUTUBE_TOKEN_JSON` cuando se apruebe la auditoría.
- Reemplazar el video-meta de `bola` (outlier de 2023) por un Short reciente de satisfying.ba11s con el piloto libre (META-REFERENTE brecha #5).
- Retención por video en `metricas.mts` (`averageViewPercentage`, brecha #4). Serie con eliminación en `carrera` (brecha #2). Guion `dato` de las Leónidas para el 11-17 18:00.
- Posible borrador duplicado de "pizza" en Studio por el intento fallido (revisar Content → Draft).
