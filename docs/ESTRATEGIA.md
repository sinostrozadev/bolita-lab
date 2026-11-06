# Bolita Lab — Estrategia del canal

> Objetivo: entrar al Programa de Partners de YouTube (YPP). Requisito real (2026):
> **1.000 suscriptores + (4.000 h de largos en 12 meses **o** 10 M de vistas de Shorts en 90 días)**. (No son 10.000: son 10 millones.)
> Hay un escalón previo a los 500 suscriptores + 3 subidas en 90 días que abre
> membresías y Super Thanks, pero no los anuncios.

## 1. Cómo lo hacen los canales "hechos con Claude"

Lo que ves en esos canales no es un generador de video de IA. Es **código**:

1. **Claude escribe el guion** como un JSON (qué pasa, qué se dice, qué cifra sale).
2. **Claude escribe el programa que dibuja el video**, casi siempre con **Remotion**
   (React: cada fotograma es un componente en el tiempo `t`), o con p5.js/Canvas grabado
   con Chrome headless, o Manim para matemáticas. Por eso las animaciones se ven "perfectas":
   no son dibujos, son funciones.
3. **Los juegos "sencillos pero atrapantes"** son **simulaciones físicas deterministas**:
   una bola en un anillo con un hueco que gira, bolas que crecen al rebotar, carreras de
   canicas, "¿qué color gana?". El truco de retención es que **cada rebote dispara una nota**
   de una melodía reconocible, la bola crece o cambia de color, y hay una pregunta abierta
   ("¿escapa o no?") que solo se resuelve al final. El cerebro no suelta hasta el final.
4. **El sonido no es un detalle**: se sintetiza desde los eventos de la física (rebote →
   nota), así que está perfectamente sincronizado. Los "datos" llevan voz neural (Edge/Azure,
   ElevenLabs), subtítulos palabra a palabra, whoosh en cada corte y una cama musical.
5. **Todo sale de un pipeline**: `guion.json → assets (voz, sonido, simulación) → render →
   subida programada`. Un cron produce y sube un Short diario sin que nadie toque nada.
6. Lo que separa a los buenos de los que hacen spam: **marca coherente** (una mascota, una
   paleta), **un solo tipo de promesa por canal**, gancho en el frame 0, nada estático,
   duración 25–55 s, cierre con "giro" y variedad (si repites exactamente el mismo formato
   con el mismo gancho, YouTube lo marca como repetitivo y deja de empujarlo).

## 2. El canal: Bolita Lab (@bolitalab)

Una mascota: **Bolita**, una bolita de neón. Hace dos cosas y las dos se ven igual de bonitas:

| Pilar | Qué es | Para qué sirve |
|---|---|---|
| **Simulaciones** (`bola`, `carrera`) | Física satisfactoria con melodías de dominio público. Sin idioma. | **Alcance**: viaja por todo el mundo. Es lo que acumula millones de vistas. |
| **Datos animados** (`dato`) | Un dato sorprendente en 35 s con voz en español, tipografía cinética y cifras que crecen. | **Suscriptores**: crea audiencia hispana que vuelve. Más comentarios y shares. |

Las dos comparten paleta, tipografía, marca de agua y cierre. Fondo casi negro, neones con
glow. Eso hace que el canal se reconozca en el feed en medio segundo.

### Reglas editoriales (el "cómo se ve bien")
- Gancho en el primer segundo: ya hay movimiento en el frame 0 y una pregunta en texto.
- Nunca más de 0,8 s sin que algo se mueva.
- 25–55 s. Los Shorts de 40–55 s con buena retención generan más vistas que los de 15.
- Cierre con giro (escapa, gana, el dato se da vuelta) y cartel de 1,2 s con el handle.
- Títulos ≤70 caracteres, con pregunta o tensión. Nunca prometer lo que el video no da.
- Un dato por video. Fuente verificada en la descripción.
- Melodías solo de dominio público (Beethoven, Mozart, Pachelbel, Chaikovski) o propias:
  cero reclamos de Content ID.

## 3. Calendario y cadencia

- **1 Short diario a las 18:00 (Chile)**, rotando `bola → dato → carrera`. Fines de semana,
  un segundo Short a las 12:00. Lo publica YouTube solo (`publishAt`).
- **1 video largo semanal (domingo)**: compilación horizontal de los Shorts de la semana con
  capítulos. Es la máquina de **horas de reproducción** (los Shorts no cuentan para las
  4.000 h; los largos sí). 8–12 min cada uno.
- Primeras 2 semanas: 2 Shorts al día (12:00 y 18:00) para que el algoritmo tenga material
  con qué aprender quién es la audiencia. Luego bajar a 1.

## 4. Plan de 90 días

| Fase | Días | Qué pasa | Meta medible |
|---|---|---|---|
| **0. Arranque** | 1–3 | Canal creado, logo/banner, descripción, 6 videos ya listos en bandeja, auditoría de API solicitada. | Canal público con 3 Shorts. |
| **1. Aprendizaje** | 4–21 | 2 Shorts/día. Cada lunes se leen las métricas: **% visto vs. deslizado** y **retención media** por plantilla y por gancho. Se duplica lo que retiene > 80 %, se mata lo que retiene < 60 %. | 100 suscriptores, un Short > 50.000 vistas. |
| **2. Explotación** | 22–60 | 1 Short/día + largo semanal. Variantes del formato ganador (otra melodía, 2 bolas, otro tema de carrera). Fijar comentario con pregunta ("¿a quién apoyabas?"). Responder comentarios las primeras 2 h. | 500 suscriptores (abre membresías), 1–3 M de vistas acumuladas. |
| **3. Monetización** | 61–90 | Consolidar los largos (compilaciones + "los 10 mejores"). Series con continuidad ("Bolita vs. la melodía más difícil", parte 1, 2, 3) para que la gente se suscriba por lo que viene. | 1.000 suscriptores y la vía que llegue primero: 10 M vistas de Shorts/90 d o 4.000 h. |

**Honestidad sobre los números:** 1.000 suscriptores en 90 días con un Short diario bien
hecho es realista. Los 10 M de vistas en 90 días dependen de que 2–3 Shorts "exploten";
es lo normal en este nicho pero no está garantizado. Las 4.000 h con compilaciones largas
son la red de seguridad: con 40 compilaciones de 10 min y 600 vistas completas cada una ya
está. Por eso el canal hace las dos cosas.

## 5. Qué se mide (en YouTube Studio, cada lunes, 10 minutos)
1. **Visto vs. deslizado** (Shorts): > 70 % es bueno. < 55 % → cambiar el gancho.
2. **Retención media**: > 80 % en simulaciones, > 65 % en datos.
3. **Suscriptores por cada 1.000 vistas**: > 3 es excelente. Si es bajo, reforzar el cierre.
4. **Comentarios**: las carreras deben generar "yo apoyaba al X"; si no, el tema no polariza.
5. Reclamos de Content ID: deben ser **cero**.

## 6. Riesgos y cómo se evitan
- **"Contenido repetitivo / producido en masa"** (política de YPP): se evita con 3
  plantillas distintas, ganchos distintos, melodías distintas, temas distintos, voz y datos
  reales con fuente. La variedad está metida en el generador de guiones.
- **Voz gratuita (Edge) deja de funcionar**: plan B documentado (Azure Speech, misma voz, o
  Kokoro local en la RTX 3060).
- **Subida por API bloqueada en privado** hasta que Google audite el proyecto: mientras
  tanto, la bandeja exporta una lista con título y descripción listos para subir a mano
  (2 minutos por video desde el celular).
- **Derechos**: melodías de dominio público sintetizadas por nosotros; sin imágenes
  externas; todo dibujado con código.

## 7. Qué puede hacer Claude solo y qué no
- **Solo:** escribir guiones, simular, sintetizar sonido y voz, renderizar, programar la
  subida, armar compilaciones, generar backlog, revisar métricas si Santiago comparte
  capturas o el acceso de Analytics por API.
- **Solo Santiago (una vez, 20 minutos):** crear el canal de YouTube (requiere su cuenta
  Google en un navegador), crear el proyecto en Google Cloud y autorizar la app, solicitar
  la auditoría de la API. Está paso a paso en `docs/SANTIAGO.md`.
