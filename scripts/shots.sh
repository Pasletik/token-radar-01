#!/bin/sh
# Take the three dashboard screenshots with headless Chromium and convert them to JPEG.
# Usage: scripts/shots.sh [out-dir]  (default: out)
# Serves the built output on 127.0.0.1 only, screenshots the board, a detail view and a
# filtered view at 1440x900, and writes screenshots/1-board.jpg, 2-detail.jpg, 3-filtered.jpg.
set -e
OUT="${1:-out}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-$HOME/workspace/tools/makefun/headless-shell/chrome-headless-shell-linux64/chrome-headless-shell}"
PORT="${PORT:-8123}"
TMP="$(mktemp -d)"

cd "$ROOT/$OUT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1

shot() {
  name="$1"; url="$2"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1440,900 \
    --virtual-time-budget=5000 \
    --screenshot="$TMP/$name.png" "$url" >/dev/null 2>&1
}

BASE="http://127.0.0.1:$PORT/dashboard/index.html"
shot 1-board "$BASE"
shot 2-detail "$BASE#p=steakhouse-financial"
shot 3-filtered "$BASE#category=Dexs"

python3 - "$TMP" "$ROOT/screenshots" << 'EOF'
import sys
from PIL import Image
tmp, dest = sys.argv[1], sys.argv[2]
import os
for name in ('1-board', '2-detail', '3-filtered'):
    im = Image.open(os.path.join(tmp, name + '.png')).convert('RGB')
    out = os.path.join(dest, name + '.jpg')
    im.save(out, 'JPEG', quality=82, optimize=True)
    print(f"{name}.jpg: {im.size[0]}x{im.size[1]}, {os.path.getsize(out)} bytes")
EOF
