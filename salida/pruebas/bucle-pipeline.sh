#!/bin/bash
# Render -> subir -> verificar -> idioma de los 4 Shorts "bucle" restantes (respeta los locks compartidos).
cd /home/santiago/projects/yt/bolita-lab
C=$PWD/node_modules/@remotion/compositor-linux-x64-gnu
declare -A F=( [montana]=2026-11-25 [ode]=2026-11-27 [turca]=2026-11-29 [nachtmusik]=2026-11-30 )
for s in montana ode turca nachtmusik; do
  ID=${F[$s]}-bola-bucle-$s
  echo "== $(date) $ID: preparar"
  npx tsx scripts/preparar-bola.mts contenido/guiones/$ID.json > /dev/null 2>&1
  if [ ! -s salida/bandeja/$ID.mp4 ]; then
    flock -w 86400 /tmp/bolita-render.lock node_modules/.bin/remotion render src/index.ts Bola salida/bandeja/$ID.mp4 --props=salida/trabajo/$ID.props.json --codec=h264 --crf=18 --concurrency=1 --log=error --timeout=180000 --x264-preset=veryfast > salida/pruebas/render-$ID.log 2>&1
    echo "render rc=$?"
  fi
  [ -s salida/bandeja/$ID.mp4 ] || { echo "SIN MP4 $ID"; continue; }
  LD_LIBRARY_PATH=$C $C/ffprobe -v error -show_entries format=duration -of csv=p=0 salida/bandeja/$ID.mp4
  flock -w 7200 /tmp/piloto.lock node herramientas/navegador/subir-studio.mjs $ID ${F[$s]} 18:00 2>&1 | tail -3
  VID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('salida/bandeja/$ID.json')).videoId||'')")
  [ -n "$VID" ] && { npx tsx scripts/verificar-programado.mts $VID; npx tsx scripts/idioma-es.mts $VID | tail -1; }
done
echo "FIN $(date)"
