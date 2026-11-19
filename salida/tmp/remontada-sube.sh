#!/bin/bash
# Espera cada render (log rend.log) y luego sube, programa, verifica por API y fija idioma. Registra en sube.log.
cd /home/santiago/projects/yt/bolita-lab
S=/tmp/claude-1000/-home-santiago-projects-yt/1c51bb1f-e4e7-43de-9a77-f8c19a9f3972/scratchpad
procesar() { # id slug fecha nota
  id=$1; slug=$2; fecha=$3; nota=$4
  until grep -q "$id exit" $S/rend.log; do sleep 30; done
  if ! grep -q "$id exit 0" $S/rend.log; then echo "$id RENDER FALLO"; return; fi
  for intento in 1 2 3; do
    out=$(flock -w 1800 /tmp/piloto.lock node herramientas/navegador/subir-studio.mjs $id $fecha 18:00 2>&1 | tail -3)
    echo "$out"
    vid=$(echo "$out" | grep -o 'shorts/[A-Za-z0-9_-]*' | head -1 | cut -d/ -f2)
    [ -n "$vid" ] && break
    sleep 60
  done
  [ -z "$vid" ] && { echo "$id SUBIDA FALLO"; return; }
  npx tsx scripts/verificar-programado.mts $vid
  if ! npx tsx scripts/verificar-programado.mts $vid | grep -q "publishAt ${fecha}T21:00:00Z"; then
    npx tsx scripts/reprogramar.mts $vid ${fecha}T18:00:00-03:00; npx tsx scripts/verificar-programado.mts $vid
  fi
  npx tsx scripts/idioma-es.mts $vid
  sleep 75
  npx tsx scripts/idioma-es.mts $vid --leer
  echo "$id VID $vid"
  python3 - "$vid" "$fecha" "$nota" <<'PY'
import sys
vid,fecha,nota=sys.argv[1:4]
p='docs/FORMATOS.md'; s=open(p).read()
linea='    { "formato": 17, "id": "%s", "fecha": "%s", "nota": "%s" }'%(vid,fecha,nota)
if vid not in s:
    a='    { "formato": 14, "id": "ifYaoZV1jlU"'
    i=s.index(a); j=s.index('\n',i)
    k=s.rfind('\n',0,s.index('\n  ]\n}',i))
    s=s[:j]+(',' if not s[:j].rstrip().endswith(',') else '')+'\n'+linea+s[j:] if False else s
    # insertar al final del arreglo (antes de el cierre) con coma en la línea anterior
    fin=s.index('\n  ]\n}', i)
    s=s[:fin]+',\n'+linea+s[fin:]
    open(p,'w').write(s)
PY
}
procesar 2026-11-26-carrera-remontada-bebidas x 2026-11-26 "carrera remontada elige tu color: Coca/Pepsi/Fanta/Sprite, gana PEPSI, remontada a 14,3 s, 18:00"
procesar 2026-11-28-carrera-remontada-paises x 2026-11-28 "carrera remontada elige tu color: ARG/BRA/CHI/MEX, gana MÉXICO, remontada a 15,0 s, 18:00"
echo FIN-SUBE
