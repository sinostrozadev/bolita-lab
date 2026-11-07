#!/bin/bash
# Sube los 3 renders del diario del 11-07 a las ranuras libres (11-15 18:00, 11-16 12:00, 11-16 18:00).
cd "$(dirname "$0")"
B=http://127.0.0.1:8777
esperar_ram() { while [ "$(free -m | awk '/^Mem/{print $7}')" -lt 1400 ]; do sleep 20; done; }
leer_filas() { curl -s --max-time 30 "$B/eval?js=Array.from(document.querySelectorAll('ytcp-video-row')).map(r%3D%3Er.innerText.replace(%2F%5Cn%2B%2Fg%2C'%20%7C%20').slice(0%2C70))"; }
modo_reintento() {  # si el diálogo sigue abierto, NO relanzar una subida nueva (crea un duplicado): retomar
  T=$(curl -s --max-time 20 "$B/eval?js=(()%3D%3E%7Bconst%20t%3Ddocument.querySelector('%23title-textarea%20%23textbox')%3Breturn%20t%3F(t.innerText.trim()%7C%7C'VACIO')%3A'SIN_DIALOGO'%7D)()")
  case "$T" in *SIN_DIALOGO*) echo "";; *VACIO*|*"$1"*) echo "RETOMAR=1";; *) echo "CONTINUAR=1";; esac
}
esperar_ram
curl -s --max-time 90 "$B/ir?url=https%3A%2F%2Fstudio.youtube.com%2Fchannel%2FUCi1_1_ItZCLY4axLshZcuZQ%2Fvideos%2Fshort" >/dev/null
for i in $(seq 1 12); do sleep 8; F=$(leer_filas); case "$F" in "[]"|*error*) ;; *) break;; esac; done
echo "filas: $F"
U=$(curl -s --max-time 10 "$B/url")
case "$U" in *UCi1_1_ItZCLY4axLshZcuZQ*) echo "canal OK: Bolita Lab";; *) echo "CANAL INCORRECTO: $U"; exit 2;; esac
case "$F" in "[]"|"") echo "sin filas en Studio: abortando"; exit 2;; esac
B1=$(echo "$F" | grep -o "Edit draft" | wc -l)
echo "borradores: $B1 (los 3 viejos son conocidos)"
while read -r id fecha hora; do
  [ -z "$id" ] && continue
  esperar_ram
  MODO=""
  for intento in 1 2 3; do
    env $MODO node subir-studio.mjs "$id" "$fecha" "$hora" && break
    sleep 10; esperar_ram; MODO=$(modo_reintento "$id"); echo "reintento $intento para $id (modo: ${MODO:-subida nueva})"
    [ $intento = 3 ] && { echo "ABORTADO en $id"; exit 1; }
  done
  sleep 3
done <<'LISTA'
2026-11-07-carrera-que-color-favorito 2026-11-15 18:00
2026-11-07-bola-cual-de-las-2-bolitas-escapa 2026-11-16 12:00
2026-11-07-dato-en-el-canal-de-panama-vas-del-atlantico 2026-11-16 18:00
LISTA
echo "LOTE COMPLETO"
