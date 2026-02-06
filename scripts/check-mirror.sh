#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FILES=(
  "game-data.js"
  "core.js"
  "systems/spawn.js"
  "systems/combat.js"
  "systems/run.js"
  "app.js"
  "index.html"
  "styles.css"
  "assets/sprites.svg"
)

status=0

for file in "${FILES[@]}"; do
  left="${ROOT_DIR}/${file}"
  right="${ROOT_DIR}/azure_clone/${file}"

  if [[ ! -f "${left}" ]]; then
    echo "Missing root file: ${file}"
    status=1
    continue
  fi

  if [[ ! -f "${right}" ]]; then
    echo "Missing clone file: azure_clone/${file}"
    status=1
    continue
  fi

  if ! cmp -s "${left}" "${right}"; then
    echo "Mismatch: ${file}"
    status=1
  fi
done

if [[ "${status}" -eq 0 ]]; then
  echo "Mirror check passed."
fi

exit "${status}"
