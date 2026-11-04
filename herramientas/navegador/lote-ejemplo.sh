#!/bin/bash
# Retoma las 7 subidas re-renderizadas (las 2 bola van después, con el gancho nuevo): espera RAM, resuelve el borrador de tierra-luna, sigue con el resto.
cd "$(dirname "$0")"
B=http://127.0.0.1:8777
esperar_ram() { while [ "$(free -m | awk '/^Mem/{print $7}')" -lt 1400 ]; do sleep 20; done; }
leer_filas() { curl -s --max-time 30 "$B/eval?js=Array.from(document.querySelectorAll('ytcp-video-row')).map(r%3D%3Er.innerText.replace(%2F%5Cn%2B%2Fg%2C'%20%7C%20').slice(0%2C70))"; }
esperar_ram
curl -s --max-time 90 "$B/ir?url=https%3A%2F%2Fstudio.youtube.com%2Fchannel%2FUCi1_1_ItZCLY4axLshZcuZQ%2Fvideos%2Fshort" >/dev/null
for i in $(seq 1 12); do sleep 8; F=$(leer_filas); case "$F" in "[]"|*error*) ;; *) break;; esac; done
echo "filas: $F"
B1=$(echo "$F" | grep -o "Edit draft" | wc -l)
echo "borradores: $B1"
if [ "$B1" -ge 2 ]; then echo "ABORTADO: hay $B1 borradores, resolver a mano"; exit 1; fi
while read -r id fecha hora; do
  [ -z "$id" ] && continue
  esperar_ram
  modo=""; [ "$id" = "2026-11-03-dato-tierra-luna" ] && [ "$B1" = 1 ] && modo="BORRADOR=1"
  for intento in 1 2; do
    env $modo node subir-studio.mjs "$id" "$fecha" "$hora" && break
    echo "reintento $intento para $id"; sleep 10; esperar_ram
    [ $intento = 2 ] && { echo "ABORTADO en $id"; exit 1; }
  done
  sleep 3
done <<'LISTA'
2026-11-03-dato-tierra-luna 2026-11-09 12:00
2026-11-03-carrera-meses 2026-11-09 18:00
2026-11-04-dato-luz-pasado 2026-11-10 12:00
2026-11-03-carrera-messi-cr7-neymar 2026-11-10 18:00
2026-11-05-dato-corazon-latidos 2026-11-11 12:00
2026-11-04-carrera-mascotas 2026-11-11 18:00
2026-11-05-carrera-dias-semana 2026-11-12 12:00
LISTA
echo "LOTE COMPLETO"; touch LOTE4-OK
