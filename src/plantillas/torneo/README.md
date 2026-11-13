# Largo `torneo` — "Torneo de bolitas" (16:9, lunes 19:00)

16 competidores, 10 carreras con la física de `carrera` v2 en un tablero ancho (1520 px de mundo a la derecha de un
panel en vivo de 400 px). Todo determinista por semilla; cada carrera busca semilla hasta que sea reñida (< 1,5 s
entre la última que clasifica y la primera que queda fuera).

## Flujo
```bash
npx tsx scripts/preparar-largo-torneo.mts contenido/largos/<id>.json        # 10 sims + plan + wav (≈ 10 s)
flock -w 7200 /tmp/bolita-render.lock npx tsx scripts/fotogramas-largo.mts Torneo salida/trabajo/<id>.props.json salida/pruebas/torneo nombre:frame …
npx tsx scripts/render-largo.mts Torneo salida/trabajo/<id>.props.json /home/santiago/projects/yt/bolita-lab/salida/largos/<id>.mp4
flock -w 7200 /tmp/bolita-render.lock npx remotion still src/index.ts MiniaturaTorneo <mini>.png --props=salida/trabajo/<id>.props.json
npx tsx scripts/bandeja-largo.mts contenido/largos/<id>.json <mp4> <mini> 2026-11-16T19:00:00-03:00
```

## Llave
Octavos: 4 carreras de 4 (grupos = participantes 0–3, 4–7, 8–11, 12–15), pasan 2 → cuartos: 2 carreras de 4
([A1, B2, C1, D2] y [B1, A2, D1, C2]), pasan 2 → semis: 2 duelos → bronce (perdedores de semis) → final.

## Pista por secciones (`SECCIONES_POR_CARRERA` en el preparar)
Cada carrera tiene 5 secciones (la final 7) separadas por embudos; ninguna combinación se repite. Tipos (simulador
`scripts/simular-carrera.mts`, modo `secciones`): `bloques` (números que se rompen), `bumpers` (pinball: devuelven a
≥ 720 px/s), `trampolines` (rebotan a ≥ 860 px/s), `molinos` (aspas que giran: choque con la velocidad del punto de
contacto), `plataformas` (barras que suben y bajan), `portales` (entra en A, sale en B con la misma velocidad) y
`tuneles` (2 tubos largos: atajo y vueltas). Cada una con su sonido (`sonido-carrera.mts`) y su rótulo (en el tablero y
arriba al entrar la líder).

## Cámara inteligente (`camaraInteligente` en el preparar)
Encuadra a todas las que siguen corriendo (alto visible 1080–1750 px de mundo: se aleja cuando se separan, con flechas
▲/▼ para las que igual quedan fuera); desde que la líder entra a los últimos 1500 px, va a un plano fijo de la meta y no
vuelve: se ve llegar a cada una. Aleja rápido, acerca lento. En la cámara lenta, zoom ×1,3 a la que decide.

## Pantallas
Portada (16 + pregunta + llave vacía) · cartel de ronda · presentación de cada carrera · carrera · resultado sobre la llave
(✅/❌, "Eliminados: …") · votación antes de las semis (panel compartido `src/marca/Votacion.tsx`, escalado) · campeón:
gigante + podio (+ "si le diste … ¡acertaste!") + repaso de la llave · cierre (pregunta del próximo torneo, zona libre
para la pantalla final de YouTube). Capítulos y mid-rolls sugeridos salen del plan.
