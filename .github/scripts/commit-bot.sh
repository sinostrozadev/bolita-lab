#!/usr/bin/env bash
# Commit del bot de producción: solo las rutas que se le pasan, mensaje fijo, rebase y hasta 3 pushes.
#   .github/scripts/commit-bot.sh "bot: producción 2026-11-04" contenido/backlog salida/bandeja ...
# El push se hace con GITHUB_TOKEN: no dispara otros workflows (no hay bucle con producir.yml).
set -euo pipefail
mensaje="$1"; shift

git config user.name "bolita-bot"
git config user.email "bolita-bot@users.noreply.github.com"

rutas=()
for r in "$@"; do
  # Solo rutas que existen o que git ya conoce (las borradas del backlog también cuentan).
  if [ -e "$r" ] || git ls-files --error-unmatch "$r" >/dev/null 2>&1; then rutas+=("$r"); fi
done
if [ ${#rutas[@]} -eq 0 ]; then echo "Nada que commitear (ninguna ruta existe)."; exit 0; fi

# -A respeta .gitignore: los mp4/wav/logs de salida/ nunca entran.
git add -A -- "${rutas[@]}"
if git diff --cached --quiet; then echo "Nada que commitear."; exit 0; fi
git diff --cached --stat
git commit -q -m "$mensaje"

for intento in 1 2 3; do
  if git pull --rebase origin master && git push origin HEAD:master; then
    echo "✓ push hecho (intento $intento)"
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  echo "⚠ push falló (intento $intento de 3); reintento en $((intento * 15)) s"
  sleep $((intento * 15))
done
echo "✗ no se pudo pushear el estado tras 3 intentos" >&2
exit 1
