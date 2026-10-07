#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe"

if [[ ! -f "$BIN" ]]; then
  echo "ERRO: FFmpeg Windows não encontrado:"
  echo "  $BIN"
  exit 1
fi

echo "FFmpeg Windows sidecar:"
ls -lh "$BIN"
