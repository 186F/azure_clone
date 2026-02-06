#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILES=(
  "game-data.js"
  "core.js"
  "renderers/renderer-interface.js"
  "renderers/canvas2d-renderer.js"
  "renderers/three-assets.js"
  "renderers/three-renderer.js"
  "systems/spawn.js"
  "systems/combat.js"
  "systems/run.js"
  "app.js"
  "index.html"
  "styles.css"
  "assets/sprites.svg"
)

for file in "${FILES[@]}"; do
  src="${ROOT_DIR}/${file}"
  dst="${ROOT_DIR}/azure_clone/${file}"

  if [[ ! -f "${src}" ]]; then
    echo "Skipping missing source file: ${file}"
    continue
  fi

  mkdir -p "$(dirname "${dst}")"
  cp "${src}" "${dst}"
done

echo "Mirror sync complete."
