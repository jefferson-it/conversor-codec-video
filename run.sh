#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/windows-local/Conversor-de-Video-TV 1080p-Windows-x64.exe"

if [[ ! -f "$APP" ]]; then
  echo "❌ Executável não encontrado:"
  echo "  $APP"
  echo
  echo "Gere primeiro:"
  echo "  npm run tauri:build:windows:local"
  exit 1
fi

if ! command -v wine >/dev/null 2>&1; then
  echo "❌ Wine não está instalado."
  exit 1
fi

echo "▶ Executando aplicativo Windows:"
echo "  $APP"
echo
echo "🍷 Wine: $(wine --version)"
echo

exec wine "$APP" "$@"
