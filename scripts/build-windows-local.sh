#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="x86_64-pc-windows-msvc"
LOG_DIR="$ROOT/windows-local"
LOG="$LOG_DIR/build.log"
OUT="$LOG_DIR/Conversor-de-Video-TV 1080p-Windows-x64.exe"
FFMPEG_SRC="$ROOT/src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe"
TARGET_DIR="$ROOT/src-tauri/target/$TARGET/release"

mkdir -p "$LOG_DIR"
: > "$LOG"

exec > >(tee -a "$LOG") 2>&1

trap 'echo; echo "❌ Build falhou na linha $LINENO."; echo "Log completo: $LOG"; exit 1' ERR

echo "==> 1/4: Frontend"
npm run build

echo
echo "==> 2/4: Cross-build Tauri Windows"
cargo xwin build \
  --release \
  --target "$TARGET" \
  --manifest-path "$ROOT/src-tauri/Cargo.toml"

echo
echo "==> 3/4: Procurando executável"
APP="$TARGET_DIR/conversor-video-tv1080p.exe"

if [[ ! -f "$APP" ]]; then
  echo "❌ O Rust terminou, mas o executável esperado não existe:"
  echo "   $APP"
  echo
  echo "Executáveis encontrados:"
  find "$ROOT/src-tauri/target" -type f -iname '*.exe' -printf '  %p (%s bytes)\n' 2>/dev/null || true
  exit 1
fi

mkdir -p "$LOG_DIR"
cp -f "$APP" "$OUT"

echo "✅ Aplicativo:"
ls -lh "$OUT"

echo
echo "==> 4/4: Preparando FFmpeg para teste"
if [[ ! -f "$FFMPEG_SRC" ]]; then
  echo "❌ FFmpeg Windows não encontrado:"
  echo "   $FFMPEG_SRC"
  exit 1
fi

cp -f "$FFMPEG_SRC" "$LOG_DIR/ffmpeg-x86_64-pc-windows-msvc.exe"

echo
echo "==> Resultado"
echo "APP=$OUT"
echo "FFMPEG=$LOG_DIR/ffmpeg-x86_64-pc-windows-msvc.exe"
echo "LOG=$LOG"
echo
echo "Para testar:"
echo "  ./run.sh"
