#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_HOME="${HOME:-}"
cd "$ROOT_DIR"

if ! command -v godot >/dev/null 2>&1; then
  echo "Error: godot CLI not found in PATH. Install it or add it to PATH." >&2
  exit 1
fi

if ! command -v brotli >/dev/null 2>&1; then
  echo "Error: brotli not found in PATH. Install it (e.g. 'brew install brotli')." >&2
  exit 1
fi

export GODOT_HOME="$ROOT_DIR/.godot_home"
export HOME="$GODOT_HOME"
export XDG_CONFIG_HOME="$GODOT_HOME/.config"
export XDG_DATA_HOME="$GODOT_HOME/.local/share"
mkdir -p "$HOME/Library/Application Support/Godot" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME"

if [[ -f config/vfx_release_candidate.json ]]; then
  echo "Promoting VFX defaults from config/vfx_release_candidate.json..."
  node scripts/promote_vfx_defaults.mjs --from config/vfx_release_candidate.json --to config/vfx_defaults.json
fi

if [[ -n "$REAL_HOME" ]]; then
  src_templates="$REAL_HOME/Library/Application Support/Godot/export_templates"
  dst_templates="$HOME/Library/Application Support/Godot/export_templates"
  if [[ -d "$src_templates" && ! -d "$dst_templates/4.6.stable" ]]; then
    mkdir -p "$dst_templates"
    cp -R "$src_templates/." "$dst_templates/"
  fi
fi

echo "Exporting Web build..."
godot --headless --export-release "Web" public/index.html

echo "Applying Nodoku web loader skin..."
node scripts/patch_web_loader.mjs public/index.html

echo "Compressing wasm/pck with brotli..."
brotli -q 11 -f -o public/index.wasm.br public/index.wasm
brotli -q 11 -f -o public/index.pck.br public/index.pck
mv public/index.wasm.br public/index.wasm
mv public/index.pck.br public/index.pck

base_version="0.1.0"
if [[ -f version.txt ]]; then
  base_version="$(awk '{print $1}' version.txt)"
fi

timestamp="$(date '+%Y-%m-%d %H:%M')"
printf "%s (%s)\n" "$base_version" "$timestamp" > version.txt

git add public/index.html public/index.wasm public/index.pck version.txt >/dev/null 2>&1 || true

if command -v git >/dev/null 2>&1; then
  if ! git diff --cached --quiet; then
    msg="Release web $(date '+%Y-%m-%d %H:%M')"
    git commit -m "$msg" >/dev/null 2>&1 || true
    git push >/dev/null 2>&1 || true
    echo "Release committed and pushed."
  else
    echo "Release ready. No changes to commit."
  fi
else
  echo "Release ready. Updated public/ and version.txt."
fi
