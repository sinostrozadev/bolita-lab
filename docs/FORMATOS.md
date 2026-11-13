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
| 10 | **Ritmo plano** | `ritmo` estilo `plano` (v3 en master: 0 choques, colores por rol) | 5 bolitas = 5 instrumentos; cada choque es una nota; caídas simples | 11-14 | en prueba |
| 11 | **Ritmo figuras** | `ritmo` estilo `figuras` | igual, con rieles, rizos, portales, péndulos, hélices | 11-15 | en prueba |
| 12 | **Batalla de colores** | `colores` (rama `colores`) | equipos de color: mismo color se fusiona, distinto se divide, los chicos mueren, gana el que sobrevive; votación | 11-10 | en prueba: `yV2xgpjEOpY` sáb 11-14 07:00 (aprobado); mejoras del final y votación unificada en curso |
| 13 | **Máquina de canicas musical 3D** | `maquina` | máquina tipo Wintergatan en Three.js: noria, vibráfono, bombo, platillo; la melodía la tocan las canicas (179 golpes sincronizados) | 11-10 | prototipo privado `Liq64V3Kn34` (espera veredicto); render 32 min a 60 fps |
| 15 | **Votación por acciones** | variable en `colores` y `carrera` v2 | "❤️ = ROJO · 💬 = AZUL · 🔁 = AMARILLO · 🔔 = VERDE": cada acción vota un color | en construcción | variable a medir (me gusta/comentarios/compartidos/subs por 1.000 vistas) |
| 14 | **Compilación / largo** | `compilar.mts` | largo 16:9 con Shorts | — | pausado (la del 11-08 no se sube); próximo: quiz "¿Cuántas adivinas?" |

## Experimento "una canción, siete formatos" (11-16 → 11-22, 07:00)
Misma canción (transcripción de Santiago, compases 1–8 ×2, 80 bpm) en: bola adivina, bola apuesta, ritmo plano, ritmo figuras, máquina 3D, carrera v2 (cama musical) y colores (cama musical). Uno por día, siempre 07:00, del **11-11 al 11-17** (máquina el 11-15). Los 07:00 que ocupaban se movieron al 11-18/19/20/21. Se compara vistas 48 h, "se queda a ver" y comentarios: la única variable es el formato.

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
    { "formato": 12, "id": "yV2xgpjEOpY", "fecha": "2026-11-14", "nota": "batalla 4 colores, gana amarillo, votación v1, 07:00" },
    { "formato": 7, "id": "fHVj0At4E0U", "fecha": "2026-11-11", "nota": "DBGT adivina, 07:00" },
    { "formato": 9, "id": "iUBhm8a36Dc", "fecha": "2026-11-12", "nota": "DBGT apuesta, 07:00" },
    { "formato": 10, "id": "2p6VCKA2V9s", "fecha": "2026-11-13", "nota": "DBGT ritmo plano, 07:00" },
    { "formato": 11, "id": "7ja9SS_rMxA", "fecha": "2026-11-14", "nota": "DBGT ritmo figuras, 07:00" },
    { "formato": 13, "id": "poa80223y84", "fecha": "2026-11-15", "nota": "DBGT máquina 3D, 07:00" },
    { "formato": 5, "id": "4xZI3VplZw0", "fecha": "2026-11-16", "nota": "DBGT carrera (cama), 07:00" },
    { "formato": 12, "id": "oFa1laPNopI", "fecha": "2026-11-17", "nota": "DBGT colores (cama), 07:00" },
    { "formato": 11, "id": "V-geJGHFy48", "fecha": "2026-11-15", "nota": "Creep (notas de tutorial), 15:00" },
    { "formato": 6, "id": "dXorev0KyK8", "fecha": "2026-11-17", "nota": "dato primer sitio web 1991, 12:00" },
    { "formato": 4, "id": "xIVZYWIMeVM", "fecha": "2026-11-18", "nota": "carrera redes sociales, 12:00" },
    { "formato": 12, "id": "PxIwfqL-vx8", "fecha": "2026-11-19", "nota": "colores batalla 4, 12:00" },
    { "formato": 13, "id": "Liq64V3Kn34", "fecha": "2026-11-20", "nota": "máquina de canicas 3D, Oda a la alegría, 12:00 (ex prototipo privado)" }
  ]
}
```

## Mediciones
### 2026-11-12 — "Se queda a ver" (Studio, `retencion-studio.mjs`; meta >= 55 %)
| Formato | Video (id) | Se queda a ver | Vistas |
|---|---|---|---|
| 2 bola "primer segundo" | vCBxbjwusnc | 43,1 % | 1.0K |
| 4 carrera "primer segundo" | 5QFQ3xWI71c (zodiaco, 07:00) | 75,4 % | 864 |
| 4 carrera "primer segundo" | mBG93NTd51c (estaciones) | 54,2 % | 290 |
| 4 carrera "primer segundo" | CvgoCXRxVCQ (países) | 50,7 % | 1.0K |
| 7 adivina (dominio público) | 6u43w_oAtTE (Bella Ciao) | 44,9 % | 1.1K |
| 7 adivina | yO7rByQZW2k (Jingle Bells) | 44,0 % | 967 |
| 7 adivina (DBGT) | fHVj0At4E0U | 37,9 % | 1.2K |
| 9 apuesta | pi_-etXwymI (Marcha turca) | 54,8 % | 982 |
| 9 apuesta (DBGT) | iUBhm8a36Dc | 33,3 % | 12 (muy reciente) |
| 1 bola clásica (vieja) | 6T5zmMoG93A (marcha crecer) | 59,7 % | 956 |
Lectura: carrera "primer segundo" promedia ~60 % (rango 51-75 %), la mejor; apuesta ~55 % con una muestra; adivina 38-45 %, bajo la meta; bola 43 %. n pequeño: no decide nada hasta la revisión del 11-29.

## Reglas de esta tabla
- Al programar un video de un formato nuevo o en prueba, se agrega una línea al JSON (formato, id, fecha de publicación, nota).
- Un formato nuevo entra a la tabla de formatos con "prototipo" y pasa a "en prueba" con su primer video publicado.
- La revisión del 11-29 escribe aquí el veredicto por formato (duplicar / mantener / matar) y lo copia a `docs/DECISIONES.md`.
