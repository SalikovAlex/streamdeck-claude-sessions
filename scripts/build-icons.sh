#!/bin/bash
# Generates the plugin's icon set (original art, no Elgato template images).
#
# Two masters:
#   - master-color: full-colour artwork — used for the Marketplace tile (plugin/icon)
#     and the rendered key image (actions/session/key). Rasterised with macOS Quick Look
#     (qlmanage) and resized with sips. Quick Look composites onto an opaque white
#     background, which is fine here because the artwork has its own opaque backdrop.
#   - master-white: white-on-transparent monochrome — used for the in-app icons
#     (plugin/category-icon, actions/session/icon). Per Elgato's plugin guidelines these
#     must be white (#FFFFFF) on a transparent background, and SVG is the preferred format
#     (https://docs.elgato.com/guidelines/stream-deck/plugins#icons). They are written as
#     SVG directly — do NOT rasterise them with qlmanage: it fills the alpha with white and
#     you get a solid white square.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="$ROOT/com.salikov.claude-sessions.sdPlugin/imgs"
TMP="$(mktemp -d)"

# --- Master 1: colour artwork (terminal prompt + status dots) -----------------
cat > "$TMP/master-color.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0e1726"/>
  <path d="M150 168 L256 256 L150 344" fill="none" stroke="#e6edf5" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="286" y="320" width="116" height="36" rx="18" fill="#46586e"/>
  <circle cx="170" cy="410" r="28" fill="#f5a623"/>
  <circle cx="256" cy="410" r="28" fill="#2ec27e"/>
  <circle cx="342" cy="410" r="28" fill="#6b7280"/>
</svg>
SVG

# --- Master 2: white-on-transparent (in-app icons per Elgato guidelines) ------
# Just the prompt chevron + cursor bar, centred in the box. Monochrome white, no background.
white_svg() { # white_svg <px-size>
cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="$1" height="$1" viewBox="0 0 512 512">
  <path d="M125 152 L255 256 L125 360" fill="none" stroke="#ffffff" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="271" y="332" width="140" height="44" rx="22" fill="#ffffff"/>
</svg>
SVG
}

rasterise() { # rasterise <svg-path> <out-base>
  qlmanage -t -s 1024 -o "$TMP" "$1" >/dev/null 2>&1
  local rendered="$TMP/$(basename "$1").png"
  [ -f "$rendered" ] || { echo "qlmanage failed to render $1"; exit 1; }
  mv "$rendered" "$2"
}

rasterise "$TMP/master-color.svg" "$TMP/base-color.png"

gen() { # gen <source-base> <relative-out> <size>
  mkdir -p "$(dirname "$IMG/$2")"
  sips -z "$3" "$3" "$1" --out "$IMG/$2" >/dev/null
}

# Colour: Marketplace tile + on-device key artwork
gen "$TMP/base-color.png" plugin/icon.png 256;        gen "$TMP/base-color.png" plugin/icon@2x.png 512
gen "$TMP/base-color.png" actions/session/key.png 72; gen "$TMP/base-color.png" actions/session/key@2x.png 144

# White: in-app category (28px) + action-list (20px) icons, as SVG.
white_svg 28 > "$IMG/plugin/category-icon.svg"
white_svg 20 > "$IMG/actions/session/icon.svg"
# Remove any stale PNG variants so the app can't pick them over the SVGs.
rm -f "$IMG/plugin/category-icon.png" "$IMG/plugin/category-icon@2x.png" \
      "$IMG/actions/session/icon.png" "$IMG/actions/session/icon@2x.png"

# Remove the old Elgato template marketplace images (replaced by icon.png).
rm -f "$IMG/plugin/marketplace.png" "$IMG/plugin/marketplace@2x.png"

rm -rf "$TMP"
echo "Icons generated in $IMG"
ls -1 "$IMG"/plugin "$IMG"/actions/session
