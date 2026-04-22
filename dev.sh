#!/bin/bash
# ── GrungeTab · dev.sh ──
# Uso:
#   ./dev.sh           → solo genera index.local.html (para WebStorm)
#   ./dev.sh --serve   → genera + levanta servidor Python en :8080

set -e

ENV_FILE=".env.local"
SOURCE="index.html"
OUTPUT="index.local.html"
CONFIG_SOURCE="config.js"
CONFIG_OUTPUT="config.local.js"
PORT=8080

if [ ! -f "$ENV_FILE" ]; then
  echo "❌  No se encontró $ENV_FILE"
  echo "    Crealo con este contenido:"
  echo "    GOOGLE_CLIENT_ID=tu_client_id_aqui"
  echo "    ALLOWED_EMAIL=tu@gmail.com"
  echo "    TABS_FOLDER_ID=id_de_la_carpeta_tabs"
  exit 1
fi

read_env() {
  grep "^$1=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '[:space:]'
}

CLIENT_ID=$(read_env GOOGLE_CLIENT_ID)
ALLOWED_EMAIL=$(read_env ALLOWED_EMAIL)
TABS_FOLDER_ID=$(read_env TABS_FOLDER_ID)

[ -z "$CLIENT_ID" ]     && echo "❌  GOOGLE_CLIENT_ID no encontrado en $ENV_FILE" && exit 1
[ -z "$ALLOWED_EMAIL" ] && echo "❌  ALLOWED_EMAIL no encontrado en $ENV_FILE"    && exit 1
[ -z "$TABS_FOLDER_ID" ] && echo "❌  TABS_FOLDER_ID no encontrado en $ENV_FILE"  && exit 1

sed -e "s|__GOOGLE_CLIENT_ID__|$CLIENT_ID|g" \
    -e "s|__ALLOWED_EMAIL__|$ALLOWED_EMAIL|g" \
    -e "s|__TABS_FOLDER_ID__|$TABS_FOLDER_ID|g" \
    -e "s|src=\"$CONFIG_SOURCE\"|src=\"$CONFIG_OUTPUT\"|g" \
    "$SOURCE" > "$OUTPUT"

sed -e "s|__GOOGLE_CLIENT_ID__|$CLIENT_ID|g" \
    -e "s|__ALLOWED_EMAIL__|$ALLOWED_EMAIL|g" \
    -e "s|__TABS_FOLDER_ID__|$TABS_FOLDER_ID|g" \
    "$CONFIG_SOURCE" > "$CONFIG_OUTPUT"

echo "✅  $OUTPUT + $CONFIG_OUTPUT generados"

if [ "$1" == "--serve" ]; then
  echo "🌐  Servidor en http://localhost:$PORT/$OUTPUT"
  echo "    (Ctrl+C para detener)"
  sleep 1 && open "http://localhost:$PORT/$OUTPUT" &
  python3 -m http.server $PORT
else
  echo "💡  Abrí index.local.html con WebStorm o usá ./dev.sh --serve"
fi