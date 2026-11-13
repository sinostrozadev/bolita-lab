# Criterios de guion — Bolita Lab (borrador para aprobación de Santiago, 2026-11-13)
> Lo usa el revisor automático (propuesta en `yt/_propuestas/revisor-de-guiones.md`); Santiago aprueba o veta en el panel. Formato común: `yt/_propuestas/plantilla-criterios-guion.md`.

## 1. Bloqueantes (sí/no)
| # | Criterio | ¿Lo comprueba una máquina? |
|---|---|---|
| B1 | Props validan el schema zod de la plantilla (`Guion<Plantilla>`) | sí: `scripts/generar-guiones.mts` (lo valida al generar) |
| B2 | Carrera: exactamente 4 participantes y `votacion: true`; colores: votación unificada | sí: superRefine en `src/plantillas/carrera/guion.ts` |
| B3 | Título ≤ 70 caracteres, no repetido; título/descripción = lo que pasa (si nombra N participantes, hay N) | parcial: largo sí; coherencia no (revisor) |
| B4 | Música: dominio público o compuesta; con derechos solo si Santiago la aprobó (notas aportadas por él) | no: revisor contra `docs/DECISIONES.md` |
| B5 | Gancho en el frame 0: `ganchoArriba` ≤ 9 palabras (mecánica) + `ganchoAbajo` ≤ 5 palabras + 1 emoji | parcial: largo zod; contenido revisor |
| B6 | El sujeto se entiende sin leer el título (qué compite, qué canción o juego) | no: revisor |
| B7 | `dato`: cada cifra con fuente (institución + año) en `fuentes`, fuente dicha en la voz, 75–100 palabras, 4–6 escenas, sin frases prohibidas (FORMULA_DATO) | parcial: zod + prompt; las fuentes las revisa el revisor con web |
| B8 | Ritmo/máquina: sincronía golpe-nota ±1 frame | sí: `scripts/verificar-ritmo.mts`, `scripts/verificar-maquina.mts` (después del preparar) |
| B9 | Monetización: no es para niños, marcas solo como competidores, sin caras reales, no repite tema/melodía/mecánica de la semana | parcial: lista de usados en el generador |

## 2. Rúbrica 1–5
| Criterio | 1 | 3 | 5 |
|---|---|---|---|
| Gancho | texto genérico, pantalla vacía | pregunta clara, sin intriga | mecánica + intriga legibles en 0,5 s, estado final insinuado (cold open) |
| Claridad / votación | no se sabe qué votar ni quién es quién | se entiende leyendo dos veces | votación de un vistazo: "ACCIÓN → ● NOMBRE", 4 filas grandes |
| Creatividad del movimiento | lineal y repetido | 1–2 figuras | figuras variadas, nunca la misma dos veces seguidas; la sincronía es el piso |
| No amontonado | todo se pisa | se pisa a ratos | máx. 2 figuras grandes en cuadro, etiquetas sin tapar bolas |
| Sorpresa / giro | final obvio | algo de vuelco | vuelco real en los últimos 3–6 s |
| Valor de comentario | nada que comentar | invitación genérica | apuesta/adivinanza que pide comentar algo concreto |
| Parecido al referente | lejos de satisfying.ba11s / mikan2d / Ñerd | mismo formato | iguala o supera su gancho y su estructura |

## 3. Umbral
Se aprueba con todos los bloqueantes, promedio ≥ 4 y ningún criterio < 3. Si no llega: se reescribe 1 vez con los cambios pedidos; si vuelve a fallar, se descarta y la idea vuelve al banco.

## 4. Veredicto (JSON, uno por guion)
```json
{"id":"…","canal":"bolita-lab","aprobado":false,"bloqueantes":{"B2":false},"puntajes":{"gancho":4,"claridad":2},
 "promedio":3.4,"motivos":["B2: 6 participantes; la votación exige 4"],"cambios":["dejar 4 participantes y activar votacion"],
 "revisor":"opus","fecha":"2026-11-13","estado_santiago":"pendiente"}
```

## 5. Ejemplos
- **Aprobaría:** `contenido/guiones/2026-11-09-bola-apuesta-marcha-turca.json` (dominio público, pregunta concreta que pide comentar; 54,8 % se queda a ver). Veredicto: aprobado; gancho 4, comentario 5, giro 4.
- **No aprobaría:** `contenido/guiones/2026-11-10-carrera-redes-sociales.json`. Veredicto: rechazado por B2 (6 participantes, sin votación) y B3 (el título nombra 4 redes y la descripción dice "seis"). Cambio pedido: 4 redes + `votacion: true`.

- **Ritmo/máquina:** se aprueba solo si `verificar-ritmo`/`verificar-maquina` dan sincronía ±1 frame y 0 avisos geométricos (ej.: ritmo v3 Canon y Creep: 0 avisos). La v2 de Creep (`V-geJGHFy48`, con 45 avisos y rieles enredados) habría quedado en "cambios pedidos" (no amontonado = 2).

## 6. Preferencias de Santiago (citadas)
- "hay que ser más creativo con las bolitas, todo es tan lineal; explora movimientos, inventa caminos; el requisito es que cuadren con los golpes originales" (11-09).
- La grilla de votación "no se entiende": siempre 4 competidores, filas grandes (11-10).
- Máximo 2 figuras grandes en cuadro, "si no, se ve amontonado".
- Hits con derechos solo con las notas que trae él; los videos nuevos se evalúan en privado.
