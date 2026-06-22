#!/usr/bin/env bash
# Render the Chrome Web Store screenshot from tools/promo.html.
# Output: store-assets/screenshot-1280x800.png  (exactly 1280x800)
#
# Set CHROME to your browser binary if it isn't auto-detected, e.g.:
#   CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ./tools/shots.sh
# On WSL you can point at the Windows binary:
#   CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" ./tools/shots.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="$ROOT/store-assets"
mkdir -p "$OUTDIR"

# Find a Chrome/Chromium if CHROME wasn't provided.
CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
  done
fi
[ -z "$CHROME" ] && { echo "No Chrome found. Set CHROME=/path/to/chrome"; exit 1; }

IN="$ROOT/tools/promo.html"
OUT="$OUTDIR/screenshot-1280x800.png"

# WSL + Windows chrome.exe needs Windows-style paths.
if [[ "$CHROME" == *.exe ]] && command -v wslpath >/dev/null 2>&1; then
  IN="$(wslpath -w "$IN")"
  OUT="$(wslpath -w "$OUT")"
fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1280,800 \
  --screenshot="$OUT" "$IN"

echo "Wrote store-assets/screenshot-1280x800.png"
