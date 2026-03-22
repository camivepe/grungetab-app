#!/bin/bash
# ── GrungeTab · dev.sh ──
# Uso:
#   ./dev.sh           → solo genera index.local.html (para WebStorm)
#   ./dev.sh --serve   → genera + levanta servidor Python en :8080

set -e

ENV_FILE=".env.local"
SOURCE="index.html"
OUTPUT="index.local.html"
PORT=8080

# Verificar que existe .env.local
if [ ! -f "$ENV_FILE" ]; then
  echo "❌  No se encontró $ENV_FILE"
  echo "    Crealo con este contenido:"
  echo "    GOOGLE_CLIENT_ID=tu_client_id_aqui"
  exit 1
fi

# Leer el Client ID desde .env.local
CLIENT_ID=$(grep GOOGLE_CLIENT_ID "$ENV_FILE" | cut -d '=' -f2 | tr -d '[:space:]')

if [ -z "$CLIENT_ID" ]; then
  echo "❌  GOOGLE_CLIENT_ID no encontrado en $ENV_FILE"
  exit 1
fi

# Inyectar el Client ID
sed "s|__GOOGLE_CLIENT_ID__|$CLIENT_ID|g" "$SOURCE" > "$OUTPUT"
echo "✅  $OUTPUT generado con Client ID inyectado"

# Modo servidor Python (opcional)
if [ "$1" == "--serve" ]; then
  echo "🌐  Servidor en http://localhost:$PORT/$OUTPUT"
  echo "    (Ctrl+C para detener)"
  sleep 1 && open "http://localhost:$PORT/$OUTPUT" &
  python3 -m http.server $PORT
else
  echo "💡  Abrí index.local.html con WebStorm"
  echo "    O usá ./dev.sh --serve para el servidor Python"
fi