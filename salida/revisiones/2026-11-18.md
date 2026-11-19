# Revisión 2026-11-18 (noche) — estrategia del diagnóstico de virales

Sesión multicanal (subagente Opus de Bolita Lab + 2 subagentes Sonnet). Fuente: `/home/santiago/projects/yt/_propuestas/2026-11-18-diagnostico-virales.md`.
Formato fijo (lo lee el panel): Detectado · Mejorado · Herramientas exploradas · Agregado · Pendiente.

## Detectado

- Todos los Shorts topan en ~1.000–1.500 vistas sin importar formato; compartidos 0–2 y comentarios 0–3 por video: no hay razón para reenviar ni discutir.
- Los Shorts duran 30–53 s y caen parejo; el formato que explota (bouncyball, 8,46 M) dura 20 s, en bucle, con la pregunta fija.
- Largo Torneo: CTR 5,4 % (empaque sano) pero 392 impresiones; los largos que vuelan en el nicho son de 20–45 min con 50 participantes por fases.
- El largo relajante (30 min) es un formato muerto en todos los canales medidos (79–3.300 vistas).
- 6 videos tenían `defaultAudioLanguage = en-US` con título en español.
- El simulador de carrera usaba `ESCALA_MIDI[i]` (6 notas): con más de 6 bolas el tono salía NaN.
- La API de YouTube tarda ~1 min en reflejar un `videos.update`: releer al instante da el valor viejo (parece que falló).
- Quitar `publishAt` exige mandarlo en `null` explícito (omitirlo no lo borra de forma fiable).

### Crítica visual honesta (Shorts y largos vs fotogramas de referentes, `lab/diagnostico-2026-11-18/tr/`)
- **Materiales/iluminación:** lo nuestro son discos planos de CSS con halo neón; sin sombras, sin reflejos, sin profundidad. MoreBalls ("Night Marble Elimination Race", 6,1 M) usa 3D con brillo, reflejos y desenfoque; MarbleDecide (14 M) es una pista REAL filmada con una mano: tacto y autenticidad que el 2D no da.
- **Pero el Short que más rinde (bouncyball, 8,46 M) es más simple que el nuestro:** fondo negro, 5 círculos, un texto con una REGLA ("EVERY SMASH GRAVITY INCREASES"). En Shorts la brecha no es el acabado: es la mecánica, la duración y el bucle. En largos, AlgoRaces (1,46 M) es Algodoo 2D plano: la escala (50 banderas) pesa más que el render.
- **Cámara:** la nuestra es pan/zoom 2D correcto; falta seguir "la pelea" (ya aplicado al largo: cámara al corte) y planos de repetición (aplicado).
- **Densidad/UI:** los largos nuestros cargan panel lateral + rótulos + avisos; los referentes muestran casi solo pista y un contador. Lo dejamos porque "QUEDAN N" es lo que pide el formato, pero es la pantalla más cargada del nicho.
- **Color/sonido:** paleta neón sobre violeta oscuro uniforme en todo el canal (se ve igual siempre); sonido sintetizado limpio pero sin "golpe" físico grave ni ambiente de estadio.
- **Qué cerraría la brecha:** para un largo "premium", **Blender 4.2** (`~/opt/blender-4.2.3-linux-x64`, ya instalado) con física rigid body y Eevee: canicas de vidrio con reflejos y pista 3D tipo MoreBalls (render de horas: solo de noche bajo el lock). **Three.js + `--gl=swangle`** (ya en `maquina`) sirve para Shorts 3D, pero es lento (32 min por 44 s a 60 fps): no escala a 20 min. **Rapier/Matter** no hacen falta para 2D (nuestra física determinista ya rinde); Rapier 3D sería el motor si se pasa a Three.js. Barato y aplicado hoy al largo: tinte de tablero por fase, repetición desaturada con viñeta y anillos verde/rojo ("SE SALVA" / "FUERA"), cámara que sigue el corte y audio de la repetición a media velocidad.

## Mejorado

- Idioma de audio `es` / `es-419` en `ifYaoZV1jlU`, `ujPXyUS7ASY`, `V-geJGHFy48`, `Hw8RS-K-KRM`, `Liq64V3Kn34`, `yV2xgpjEOpY` (verificado releyendo por API).
- Relajante `tuCnd-Q2JMQ` desprogramado: privado sin `publishAt` (verificado), no se borró; motivo en la bandeja y en `docs/DECISIONES.md`.
- Cadencia: 1 Short al día (18:00) desde el 23-11; rotación del diario `bola`/`carrera` (sale `dato`, con voz sintética); `minimoBandeja` 3.
- Tono por bola con módulo en `scripts/simular-carrera.mts` (carreras de hasta 10 bolas).

## Herramientas exploradas

- Fotogramas de referentes del diagnóstico (bouncyball, MarbleDecide, barra lateral con MoreBalls): conclusión arriba.
- Blender 4.2 y Three.js `--gl=swangle` evaluados por costo de render (no adoptados para el largo de hoy).
- Emoji de banderas: Noto Color Emoji (`~/.local/share/fonts/NotoColorEmoji.ttf`, Google, SIL Open Font License 1.1); anotado en la descripción del largo.

## Agregado

- Plantilla de largo **`eliminacion`** (`src/plantillas/eliminacion/`) + `scripts/preparar-largo-eliminacion.mts`: 50 países, 15 carreras (clasificación 5×10 con repechaje, ronda de 32, octavos, semifinales, final de 4), "QUEDAN N" fijo, secciones distintas por carrera, repeticiones de los cortes < 0,9 s, parrilla de los 50 con tachados animados, votación antes de la final, campeón + podio + parrilla final, miniatura con la parrilla real. Plan definitivo: **20:10**, 8 repeticiones, podio España · Bolivia · Corea del Sur.
- `scripts/idioma-es.mts`, `scripts/desprogramar.mts`, `scripts/localizaciones.mts` (título/descripción EN por API).
- `salida/tmp/render-largo-50.sh` (render por tramos con reintentos) y `salida/tmp/terminar-largo-50.sh` (ffprobe + volumen → miniatura → bandeja → Studio con lock → publishAt por API → idioma → localización EN).
- Pedido GPT de carátula preparado, NO enviado (`salida/caratulas/pedidos/PEDIDO-bolita-lab-eliminacion-50-paises.md`): la evidencia del nicho favorece el pantallazo real; queda para A/B si el CTR < 5 %.
- Shorts nuevos (subagentes): "¿Qué canción toca la bolita?" en bucle de ~20 s (formato 16) y "Elige tu color" con remontada (formato 17). Ids en `docs/FORMATOS.md`.

## Pendiente

- Terminar el render del largo (`salida/logs/render-eliminacion-50.log`) y correr `bash salida/tmp/terminar-largo-50.sh` antes del sáb 21 18:00; después pantalla final, comentario fijado y Related video.
- Reescribir `docs/META-REFERENTE.md` (bouncyball / MarbleDecide / AlgoRaces) en el ritual del jue 19-11.
- Lecturas: largo a 48 h (lun 23-11 20:00) y 7 días (sáb 28-11); canciones y remontadas a 48 h cada una (umbrales en `docs/PLAN-SEMANAL.md`).
- `estado.mts` sigue avisando el hito los miércoles (es jueves).
