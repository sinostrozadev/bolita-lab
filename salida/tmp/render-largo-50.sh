#!/usr/bin/env bash
# Render del largo "50 países" por tramos. render-largo.mts toma /tmp/bolita-render.lock POR TRAMO (flock -w 3600) y retoma
# los tramos hechos: si un tramo se cansa de esperar el lock (máquina compartida), este bucle reintenta (hasta 12 veces).
# Log: salida/logs/render-eliminacion-50.log. Al terminar: bash salida/tmp/terminar-largo-50.sh (NO se encadena solo).
cd /home/santiago/projects/yt/bolita-lab
ID=2026-11-21-eliminacion-50-paises
for intento in $(seq 1 12); do
  echo "[render-largo-50] intento $intento · $(date '+%F %T')"
  if npx tsx scripts/render-largo.mts Eliminacion salida/trabajo/$ID.props.json /home/santiago/projects/yt/bolita-lab/salida/largos/$ID.mp4 --tramo 4500; then
    echo "[render-largo-50] ✓ terminado $(date '+%F %T') → correr: bash salida/tmp/terminar-largo-50.sh"; exit 0
  fi
  sleep 60
done
echo "[render-largo-50] ✗ 12 intentos sin terminar"; exit 1
