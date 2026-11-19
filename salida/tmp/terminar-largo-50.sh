#!/usr/bin/env bash
# Termina el largo "50 países, carrera de eliminación" DESPUÉS del render: verifica, arma la bandeja, sube y programa.
# NO se lanza solo: correrlo a mano (o desde la sesión) cuando el log del render diga "✓".
#
#   bash salida/tmp/terminar-largo-50.sh            # verifica + miniatura + bandeja + sube + programa + verifica por API
#   SOLO_VERIFICAR=1 bash salida/tmp/terminar-largo-50.sh   # solo los chequeos de ffprobe/volumen (no sube nada)
#
# Pasos:
#  1. ffprobe: el mp4 existe, dura lo que dice el plan (± 3 s) y ≥ 20 min, video 1920×1080 h264, audio AAC presente;
#     volumen RMS > −35 dB (medido en Python) (no está mudo). Cualquier fallo → sale sin subir.
#  2. Miniatura: still MiniaturaEliminacion (fotograma real de la parrilla de los 50 + "50 PAÍSES / SOLO 1 GANA") bajo el lock
#     de render. Es Remotion, no GPT → se sube con CARATULA_REMOTION=1 (provisional, ver salida/caratulas/pedidos/).
#  3. bandeja-largo.mts → salida/bandeja/<id>.json (capítulos en la descripción, mid-rolls) + enlace duro del mp4 en la bandeja.
#  4. Subida por Studio con el piloto bajo flock -w 1800 /tmp/piloto.lock (canal verificado por el script).
#  5. Verificación por API: privado + publishAt = sáb 2026-11-21 19:00 Chile (22:00Z). Si quedó en Draft sin publishAt, lo
#     programa con reprogramar.mts. Idioma es/es-419 (idioma-es.mts) y título/descripción en inglés (localizaciones.mts).
set -euo pipefail
cd /home/santiago/projects/yt/bolita-lab
ID=2026-11-21-eliminacion-50-paises
MP4=${MP4:-salida/largos/$ID.mp4}
GUION=contenido/largos/$ID.json
PROPS=${PROPS:-salida/trabajo/$ID.props.json}
CUANDO=2026-11-21T19:00:00-03:00
CANAL=UCi1_1_ItZCLY4axLshZcuZQ
FFPROBE=$(command -v ffprobe || echo node_modules/@remotion/compositor-linux-x64-gnu/ffprobe)
FFMPEG=$(command -v ffmpeg || echo node_modules/@remotion/compositor-linux-x64-gnu/ffmpeg)

echo "== 1. chequeos de $MP4"
[ -s "$MP4" ] || { echo "✗ no existe $MP4 (¿terminó el render? mira salida/logs/render-eliminacion-50.log)"; exit 1; }
DUR=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$MP4")
ESPERADA=$(python3 -c "import json;print(json.load(open('$PROPS'))['duracionFrames']/30)")
VID=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 "$MP4")
AUD=$("$FFPROBE" -v error -select_streams a:0 -show_entries stream=codec_name,channels -of csv=p=0 "$MP4")
echo "   duración $DUR s (plan $ESPERADA s) · video $VID · audio ${AUD:-NINGUNO}"
python3 -c "import sys;d=float('$DUR');e=float('$ESPERADA');sys.exit(0 if d>=1200 and abs(d-e)<=3 else 1)" || { echo "✗ duración fuera de rango (≥ 1200 s y ± 3 s del plan)"; exit 1; }
[ "$VID" = "h264,1920,1080" ] || { echo "✗ video inesperado: $VID"; exit 1; }
[[ "$AUD" == aac,2* ]] || { echo "✗ sin audio AAC estéreo: $AUD"; exit 1; }
# El ffmpeg de Remotion no trae volumedetect ni s16le: se decodifica a wav 8 kHz mono y se mide en Python.
WAVTMP=$(mktemp --suffix=.wav)
"$FFMPEG" -v error -y -i "$MP4" -map 0:a -ac 1 -ar 8000 -c:a pcm_s16le "$WAVTMP"
VOL=$(python3 -c "
import wave,array,math
w=wave.open('$WAVTMP');a=array.array('h',w.readframes(w.getnframes()))
print(round(20*math.log10(math.sqrt(sum(x*x for x in a)/max(1,len(a)))/32768+1e-9),1))")
rm -f "$WAVTMP"
echo "   volumen RMS $VOL dB"
python3 -c "import sys;sys.exit(0 if float('${VOL:--99}')>-35 else 1)" || { echo "✗ audio casi mudo"; exit 1; }
echo "✓ mp4 verificado"
[ "${SOLO_VERIFICAR:-0}" = 1 ] && exit 0

echo "== 2. miniatura"
MINI=salida/largos/$ID-mini.png
if [ ! -s "$MINI" ]; then
  flock -w 7200 /tmp/bolita-render.lock npx remotion still src/index.ts MiniaturaEliminacion "$MINI" --props="$PROPS"
fi
[ -s "$MINI" ] || { echo "✗ no salió la miniatura"; exit 1; }
cp -f "$MINI" "salida/bandeja/$ID-mini.png"

echo "== 3. bandeja"
npx tsx scripts/bandeja-largo.mts "$GUION" "$MP4" "$MINI" "$CUANDO"
ln -f "$MP4" "salida/bandeja/$ID.mp4"   # enlace duro: no ocupa disco extra

echo "== 4. subida por Studio (piloto, lock)"
CARATULA_REMOTION=1 NR_CANAL_ID=$CANAL NR_CANAL_NOMBRE='Bolita Lab' \
  flock -w 1800 /tmp/piloto.lock node herramientas/navegador/subir-studio-privado.mjs "$ID" 2026-11-21 19:00 | tee -a salida/logs/subir-eliminacion-50.log

echo "== 5. verificación por API"
VIDEO=$(python3 -c "import json;print(json.load(open('salida/bandeja/$ID.json')).get('videoId',''))")
[ -n "$VIDEO" ] || { echo "✗ la bandeja no tiene videoId: revisar Studio a mano (posible Draft)"; exit 1; }
npx tsx scripts/verificar-programado.mts "$VIDEO"
if ! npx tsx scripts/verificar-programado.mts "$VIDEO" | grep -q "publishAt 2026-11-21T22:00:00"; then
  echo "⚠ sin publishAt correcto → reprogramar por API"; npx tsx scripts/reprogramar.mts "$VIDEO" "$CUANDO"
fi
npx tsx scripts/idioma-es.mts "$VIDEO"
npx tsx scripts/localizaciones.mts "$VIDEO" "$GUION"
sleep 60
npx tsx scripts/verificar-programado.mts "$VIDEO"
npx tsx scripts/idioma-es.mts --leer "$VIDEO"
echo "✓ listo: https://www.youtube.com/watch?v=$VIDEO · falta a mano: pantalla final (herramientas/navegador/pantalla-final.mjs $VIDEO),"
echo "  comentario fijado con la pregunta (scripts/comentar.mts) y Related video de los Shorts (related-video.mjs)."
