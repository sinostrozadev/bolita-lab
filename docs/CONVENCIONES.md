# Convenciones de Bolita Lab (léelas antes de tocar el repo)

## Qué es esto
Fábrica de Shorts para YouTube. Dos pilares, una mascota: **Bolita**, una bolita de neón.
1. **Simulaciones satisfactorias** (`bola`, `carrera`): física determinista, sonido sincronizado
   a cada rebote/choque, sin voz. Funcionan en cualquier idioma.
2. **Datos animados** (`dato`): un dato sorprendente contado con voz en español neutro,
   tipografía cinética, cifras que crecen, SFX y cama musical.

Formato: **1080×1920, 60 fps**, 25–58 s. Zona segura: ver `src/marca/tokens.ts` (`FORMATO.seguro`).
Todo texto en pantalla queda dentro de la zona segura. Marca de agua "Bolita Lab" discreta,
arriba a la derecha, en TODAS las plantillas (hay un componente compartido en `src/marca/`).

## Reglas duras
- **Determinismo:** mismo guion (JSON) → mismo video. Nada de `Math.random()`: usa `crearAzar(semilla)`
  de `src/lib/azar.ts`. La física se **precalcula** en un script de Node (paso fijo) y se guarda
  como JSON junto al guion; el componente de Remotion solo lee posiciones por frame. Esto
  además da la lista de eventos (rebotes/choques) para sintetizar el audio.
- **Audio:** se sintetiza en Node (WAV 48 kHz PCM 16-bit, escrito a mano o con `wav`) a
  `public/audio/generado/<id>.wav`, y la composición lo reproduce con `<Audio>`. Nada de
  Web Audio dentro de Remotion. Loudness objetivo aprox. −14 LUFS; picos < −1 dBFS.
  Melodías: solo **dominio público** (Für Elise, Marcha Turca, Oda a la Alegría, Canon de
  Pachelbel, Cumpleaños feliz NO: tiene historia legal; evítalo) o compuestas por nosotros.
- **Voz (solo `dato`):** `msedge-tts` con `es-MX-JorgeNeural` / `es-CL-LorenzoNeural` /
  `es-ES-AlvaroNeural` (elegir una y documentarla). Guardar MP3 en `public/voz/<id>.mp3`
  y su duración + límites de palabra en JSON para subtítulos palabra a palabra.
- **Colores y tipografía:** solo desde `src/marca/tokens.ts`. Fuentes vía
  `@remotion/google-fonts` (Bricolage Grotesque + Inter).
- **Render:** `npx remotion render src/index.ts <Id> salida/pruebas/<id>.mp4 --props=<json>`.
  Para pruebas usa `--scale=0.5`. La máquina tiene ~2 GB libres: **nunca más de
  `--concurrency=2`** cuando haya otros agentes trabajando. Render final: `--codec=h264 --crf=18`.
- **Cada plantilla** vive en `src/plantillas/<nombre>/` y exporta `registrar()` que devuelve
  sus `<Composition>` (ya está cableado en `src/Root.tsx`). Props validadas con `zod`
  (schema exportado como `Guion<Nombre>`).
- **Guiones:** `contenido/guiones/<fecha>-<slug>.json` con forma
  `{ "plantilla": "bola", "id": "2026-11-03-bola-furelise", "titulo": "...", "descripcion": "...",
     "hashtags": ["#shorts", ...], "props": { ... } }`.
- **Bandeja:** cada video terminado queda en `salida/bandeja/<id>.mp4` + `<id>.json` (metadatos
  de publicación). `scripts/subir.mjs` lee la bandeja.
- **Idioma del código y los comentarios: español.** Nombres de archivo en minúsculas y sin acentos.
- No instales dependencias nuevas sin dejar anotado por qué en `docs/DECISIONES.md`.
- Commits: `ámbito: verbo en infinitivo` (ej. `bola: sintetizar notas por rebote`). No pushear.

## Cómo se ve "bien"
Fondo casi negro, neones saturados con glow (box-shadow / filter blur de una copia), motion
blur falso en objetos rápidos (estela de 3–5 copias con opacidad decreciente), easing con
`spring()` de Remotion, nada estático más de 0,8 s, gancho visual en el primer frame (ya
pasa algo en el frame 0: no hay intros). Cierre con un "giro" en los últimos 3 s (escape,
explosión, ganador) y un cartel breve de 1,2 s "Bolita Lab" con el handle.
