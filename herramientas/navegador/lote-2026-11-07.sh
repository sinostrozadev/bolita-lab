#!/bin/bash
# Sube los 3 renders del diario del 11-06 a las ranuras libres (11-14 12:00, 11-14 18:00, 11-15 12:00).
cd "$(dirname "$0")"
B=http://127.0.0.1:8777
esperar_ram() { while [ "$(free -m | awk '/^Mem/{print $7}')" -lt 1400 ]; do sleep 20; done; }
leer_filas() { curl -s --max-time 30 "$B/eval?js=Array.from(document.querySelectorAll('ytcp-video-row')).map(r%3D%3Er.innerText.replace(%2F%5Cn%2B%2Fg%2C'%20%7C%20').slice(0%2C70))"; }
esperar_ram
curl -s --max-time 90 "$B/ir?url=https%3A%2F%2Fstudio.youtube.com%2Fchannel%2FUCi1_1_ItZCLY4axLshZcuZQ%2Fvideos%2Fshort" >/dev/null
for i in $(seq 1 12); do sleep 8; F=$(leer_filas); case "$F" in "[]"|*error*) ;; *) break;; esac; done
echo "filas: $F"
B1=$(echo "$F" | grep -o "Edit draft" | wc -l)
echo "borradores: $B1 (los 3 viejos son conocidos)"
while read -r id fecha hora; do
  [ -z "$id" ] && continue
  esperar_ram
  for intento in 1 2; do
    node subir-studio.mjs "$id" "$fecha" "$hora" && break
    echo "reintento $intento para $id"; sleep 10; esperar_ram
    [ $intento = 2 ] && { echo "ABORTADO en $id"; exit 1; }
  done
  sleep 3
done <<'LISTA'
2026-11-06-carrera-pizza-vs-hamburguesa 2026-11-14 12:00
2026-11-06-bola-cisnes-escape 2026-11-14 18:00
2026-11-06-dato-el-everest-no-es-la-cima-mas-cercana-al 2026-11-15 12:00
LISTA
echo "LOTE COMPLETO"
