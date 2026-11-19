cd /home/santiago/projects/yt/bolita-lab
for s in montana ode turca nachtmusik; do
 f=$(ls contenido/guiones/*bucle-$s.json); ID=$(basename $f .json)
 npx tsx scripts/preparar-bola.mts $f >/dev/null 2>&1
 flock -w 7200 /tmp/bolita-render.lock node_modules/.bin/remotion render src/index.ts Bola salida/bandeja/$ID.mp4 --props=salida/trabajo/$ID.props.json --codec=h264 --crf=18 --concurrency=1 --log=error --timeout=180000 --x264-preset=veryfast > salida/pruebas/render-$ID.log 2>&1
 echo "$ID rc=$?" >> salida/pruebas/render-bucle-todos.log
done
echo FIN >> salida/pruebas/render-bucle-todos.log
