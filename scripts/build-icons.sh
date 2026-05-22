#!/bin/bash
# Generates the plugin's icon set (original art, no Elgato template images) from one SVG.
# Uses macOS Quick Look (qlmanage) to rasterise the SVG, then sips to resize to each target.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="$ROOT/com.salikov.claude-sessions.sdPlugin/imgs"
TMP="$(mktemp -d)"
SVG="$TMP/master.svg"

# Master icon: a terminal prompt ">" + cursor, with three status dots (working / your turn / idle).
cat > "$SVG" <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0e1726"/>
  <path d="M150 168 L256 256 L150 344" fill="none" stroke="#e6edf5" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="286" y="320" width="116" height="36" rx="18" fill="#46586e"/>
  <circle cx="170" cy="410" r="28" fill="#f5a623"/>
  <circle cx="256" cy="410" r="28" fill="#2ec27e"/>
  <circle cx="342" cy="410" r="28" fill="#6b7280"/>
</svg>
EOF

# Rasterise to a large PNG once.
qlmanage -t -s 1024 -o "$TMP" "$SVG" >/dev/null 2>&1
BASE="$TMP/master.svg.png"
[ -f "$BASE" ] || { echo "qlmanage failed to render SVG"; exit 1; }

gen() { # gen <relative-out> <size>
  mkdir -p "$(dirname "$IMG/$1")"
  sips -z "$2" "$2" "$BASE" --out "$IMG/$1" >/dev/null
}

gen plugin/icon.png 256;            gen plugin/icon@2x.png 512
gen plugin/category-icon.png 28;    gen plugin/category-icon@2x.png 56
gen actions/session/icon.png 20;    gen actions/session/icon@2x.png 40
gen actions/session/key.png 72;     gen actions/session/key@2x.png 144

# Remove the old Elgato template marketplace images (replaced by icon.png).
rm -f "$IMG/plugin/marketplace.png" "$IMG/plugin/marketplace@2x.png"

rm -rf "$TMP"
echo "Icons generated in $IMG"
ls -1 "$IMG"/plugin "$IMG"/actions/session
