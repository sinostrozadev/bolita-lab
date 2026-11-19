# Revisión 2026-11-19 — ritual del jueves (semana asegurada 23→29), regla "cerrar frentes"

## Detectado
- Semana 23→29 completa: 1 Short por día a las 18:00 (8 programados del 23 al 30), ningún día vacío. Verificado por API (private + `publishAt`).
- Largo de 50 países `Sz2GoSvspmA` sigue programado sáb 21-11 19:00 (`publishAt` 2026-11-21T22:00:00Z).
- Dos Shorts programados llevan marcas en el título: mar 24 `JOzAjFGWNew` (Colo-Colo/U/UC/Cobreloa) y jue 26 `i1ziHMpmE9o` (Coca/Pepsi/Fanta/Sprite).
- En el JSON del plan, `b3v9Q6ymd3A` (sáb 21 18:00) y `zeb04rqSoHk` (dom 22 12:00) figuran programados pero la API no los lista en el canal.

## Mejorado
- Nada nuevo (regla del dueño del 19-11: cerrar frentes, sin mejoras).

## Herramientas exploradas
- Ninguna nueva. Verificación con la YouTube Data API (`playlistItems` del canal + `videos.list` status).

## Agregado
- `docs/PLAN-SEMANAL.md`: estado verificado de la semana 23→29, decisión del sáb 28 y esqueleto de la semana 30-11 → 06-12; JSON con las ranuras 23→30.
- `docs/DECISIONES.md`: no se hace el 2.º largo de eliminación el sáb 28.

## Pendiente
- Lectura de 48 h del largo de 50 países: lun 23-11 20:00; final sáb 28-11 20:00. Si pasa el umbral, 2.º largo de eliminación el sáb 05-12 19:00 (sin marcas).
- Decidir si quedan los dos Shorts con marcas (24 y 26). Revisar por qué `b3v9Q6ymd3A` y `zeb04rqSoHk` no aparecen como programados.
- `docs/META-REFERENTE.md` (bouncyball/MarbleDecide/AlgoRaces) y carátula GPT del largo de 50 países: no se hicieron hoy.
- Tras publicarse el largo (sáb 21 19:00): comentario fijado.
