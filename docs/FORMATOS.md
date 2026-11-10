# Bolita Lab — Catálogo de formatos en prueba

> Creado **2026-11-09** por Claude a pedido de Santiago: "almacena en algún lugar todos los tipos de videos distintos que tenemos,
> para que en unas 2 o 3 semanas revisemos cuáles pegan más".
> **Revisión programada: domingo 2026-11-29** (y cierre definitivo el 2026-12-06 si falta n).
> Cada video publicado se anota en la tabla de su formato con su id. La revisión compara por formato, no por video suelto.

## Cómo se mide (igual para todos)
- **Vistas a 48 h y a 7 días** (Data API, `salida/metricas/<día>/metricas.json`).
- **"Se queda a ver"** por Short (Studio, `node herramientas/navegador/retencion-studio.mjs <ids…>`). Meta ≥ 55 %.
- **Comentarios por 1.000 vistas** (los formatos de juego viven de esto).
- **Suscriptores ganados por video** (Studio → Analytics del video).
- Regla de decisión (skill `estrategia-viva`): un formato con mediana ≥ 2× la del canal en ≥ 3 videos se duplica; con mediana < ½ en 2 tandas se mata.
- Comparar a igual hora cuando se pueda (ej. los dos estilos de `ritmo` van ambos a las 15:00).

## Formatos

| # | Formato | Plantilla / variante | Qué es | Desde | Estado |
|---|---|---|---|---|---|
| 1 | **Bola clásica (vieja)** | `bola` antes del 11-04 | bolita en anillo, gancho débil, pantalla vacía | 11-04 | referencia (base de comparación) |
| 2 | **Bola "primer segundo"** | `bola` (8cd01ec) | trazas que llenan el círculo, bola grande, cold open "así termina ↓", 2 textos fijos | 11-10 | en prueba |
| 3 | **Carrera clásica (vieja)** | `carrera` antes del 11-08 | Plinko con etiquetas chicas | 11-05 | referencia |
| 4 | **Carrera "primer segundo"** | `carrera` (8cd01ec) | banderas/iconos legibles, podio vacío desde el inicio | 11-09 | en prueba |
| 5 | **Carrera v2** | `carrera` rama `carrera-v2` | bloques con números que se rompen, tubos con vueltas, sonido nuevo, votación | 11-10 | en prueba: `Hw8RS-K-KRM` vie 11-13 07:00 (aprobado); votación rediseñándose (4 competidores, filas grandes) |
| 6 | **Dato** | `dato` | dato curioso narrado, ~35 s | 11-04 | en prueba |
| 7 | **Adivina la canción (dominio público)** | `bola` + `juego: adivina` | la bolita toca una melodía conocida, 3 pistas, "escríbela en los comentarios" | 11-10 | en prueba |
| 8 | **Adivina la canción (con derechos)** | `bola` + `juego: adivina` | igual, con un hit (notas aportadas por Santiago); Content ID probable | 11-13 | en prueba (1 video) |
| 9 | **Apuesta** | `bola` + `juego: apuesta` | "¿en qué rebote llena el círculo? comenta tu número" | 11-11 | en prueba |
| 10 | **Ritmo plano** | `ritmo` estilo `plano` | 5 bolitas = 5 instrumentos; cada choque es una nota; caídas simples | 11-14 | en prueba |
| 11 | **Ritmo figuras** | `ritmo` estilo `figuras` | igual, con rieles, rizos, portales, péndulos, hélices | 11-15 | en prueba |
| 12 | **Batalla de colores** | `colores` | equipos de color: mismo color se fusiona, distinto se divide, los chicos mueren, gana el que sobrevive | en construcción | prototipo |
| 13 | **Máquina de canicas musical 3D** | `maquina` | máquina tipo Wintergatan en Three.js: noria, xilófono, bombo; la melodía la tocan las canicas | en construcción | prototipo |
| 15 | **Votación por acciones** | variable en `colores` y `carrera` v2 | "❤️ = ROJO · 💬 = AZUL · 🔁 = AMARILLO · 🔔 = VERDE": cada acción vota un color | en construcción | variable a medir (me gusta/comentarios/compartidos/subs por 1.000 vistas) |
| 14 | **Compilación / largo** | `compilar.mts` | largo 16:9 con Shorts | — | pausado (la del 11-08 no se sube); próximo: quiz "¿Cuántas adivinas?" |

## Videos por formato

```json
{
  "version": 1,
  "revision": "2026-11-29",
  "videos": [
    { "formato": 1, "id": "wWkHMfYBX0g", "fecha": "2026-11-04", "nota": "bola Pachelbel crecer" },
    { "formato": 1, "id": "Z8-3_uzhpJs", "fecha": "2026-11-05", "nota": "bola escape 2" },
    { "formato": 1, "id": "Wav_W4VRJ_8", "fecha": "2026-11-07", "nota": "bola cisnes 3" },
    { "formato": 1, "id": "pZwZS5YXUP8", "fecha": "2026-11-08", "nota": "bola Para Elisa (último viejo)" },
    { "formato": 3, "id": "nJJ6-EY6jKg", "fecha": "2026-11-05", "nota": "carrera consolas" },
    { "formato": 3, "id": "XMNHIHXSLhM", "fecha": "2026-11-06", "nota": "carrera helados" },
    { "formato": 3, "id": "OzRnX27pawU", "fecha": "2026-11-08", "nota": "carrera celulares" },
    { "formato": 6, "id": "Zn66wjkNX0w", "fecha": "2026-11-04", "nota": "dato billón" },
    { "formato": 6, "id": "ELqZFQmmhHo", "fecha": "2026-11-06", "nota": "dato mantis" },
    { "formato": 6, "id": "tCaY7nso7CY", "fecha": "2026-11-07", "nota": "dato Cleopatra" },
    { "formato": 4, "id": "mBG93NTd51c", "fecha": "2026-11-09", "nota": "carrera estaciones" },
    { "formato": 2, "id": "vCBxbjwusnc", "fecha": "2026-11-10", "nota": "bola Para Elisa escape" },
    { "formato": 4, "id": "CvgoCXRxVCQ", "fecha": "2026-11-11", "nota": "carrera países" },
    { "formato": 7, "id": "6u43w_oAtTE", "fecha": "2026-11-10", "nota": "Bella Ciao, piano + bajo" },
    { "formato": 9, "id": "pi_-etXwymI", "fecha": "2026-11-11", "nota": "apuesta Marcha turca" },
    { "formato": 7, "id": "yO7rByQZW2k", "fecha": "2026-11-12", "nota": "Jingle Bells, campana" },
    { "formato": 8, "id": "bpZcIdShLpg", "fecha": "2026-11-13", "nota": "Still D.R.E." },
    { "formato": 10, "id": "ujPXyUS7ASY", "fecha": "2026-11-14", "nota": "Canon, 15:00" },
    { "formato": 4, "id": "5QFQ3xWI71c", "fecha": "2026-11-10", "nota": "carrera zodiaco, 07:00" },
    { "formato": 6, "id": "SKwduvciVTk", "fecha": "2026-11-11", "nota": "dato miel, 07:00" },
    { "formato": 6, "id": "E4wtIUfjZbE", "fecha": "2026-11-12", "nota": "dato Torre Eiffel, 07:00" },
    { "formato": 5, "id": "Hw8RS-K-KRM", "fecha": "2026-11-13", "nota": "carrera v2 superpoderes, 5 competidores, votación v1, 07:00" },
    { "formato": 11, "id": "V-geJGHFy48", "fecha": "2026-11-15", "nota": "Creep (notas de tutorial), 15:00" }
  ]
}
```

## Reglas de esta tabla
- Al programar un video de un formato nuevo o en prueba, se agrega una línea al JSON (formato, id, fecha de publicación, nota).
- Un formato nuevo entra a la tabla de formatos con "prototipo" y pasa a "en prueba" con su primer video publicado.
- La revisión del 11-29 escribe aquí el veredicto por formato (duplicar / mantener / matar) y lo copia a `docs/DECISIONES.md`.
