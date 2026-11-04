#!/usr/bin/env bash
# Baja a salida/bandeja/ los mp4 de los artifacts "shorts-*" de los últimos N días (por defecto 14)
# que todavía no expiraron. Lo usa compilar.yml: los json ya están commiteados, solo faltan los mp4.
#   .github/scripts/bajar-shorts.sh [dias]
set -euo pipefail
dias="${1:-14}"
desde=$(date -u -d "$dias days ago" +%Y-%m-%dT%H:%M:%SZ)
mkdir -p salida/bandeja
tmp=$(mktemp -d)

gh api --paginate "repos/${GITHUB_REPOSITORY}/actions/artifacts?per_page=100" \
  --jq ".artifacts[] | select(.name | startswith(\"shorts-\")) | select(.expired | not) | select(.created_at >= \"$desde\") | \"\(.workflow_run.id) \(.name)\"" \
  > "$tmp/lista.txt"
echo "$(wc -l < "$tmp/lista.txt") artifact(s) shorts-* desde $desde"

while read -r run nombre; do
  [ -n "$run" ] || continue
  destino="$tmp/$run-$nombre"
  if gh run download "$run" -n "$nombre" -D "$destino"; then
    find "$destino" -name '*.mp4' -exec mv -n {} salida/bandeja/ \;
  else
    echo "⚠ no se pudo bajar $nombre del run $run; sigo"
  fi
done < "$tmp/lista.txt"
rm -rf "$tmp"
echo "mp4 en salida/bandeja: $(ls salida/bandeja/*.mp4 2>/dev/null | wc -l)"
