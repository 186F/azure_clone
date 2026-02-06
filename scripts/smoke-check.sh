#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node --check "${ROOT_DIR}/app.js"
node --check "${ROOT_DIR}/azure_clone/app.js"
node --check "${ROOT_DIR}/core.js"
node --check "${ROOT_DIR}/game-data.js"
node --check "${ROOT_DIR}/renderers/renderer-interface.js"
node --check "${ROOT_DIR}/renderers/canvas2d-renderer.js"
node --check "${ROOT_DIR}/renderers/three-assets.js"
node --check "${ROOT_DIR}/renderers/three-renderer.js"
node --check "${ROOT_DIR}/azure_clone/renderers/renderer-interface.js"
node --check "${ROOT_DIR}/azure_clone/renderers/canvas2d-renderer.js"
node --check "${ROOT_DIR}/azure_clone/renderers/three-assets.js"
node --check "${ROOT_DIR}/azure_clone/renderers/three-renderer.js"
node --check "${ROOT_DIR}/systems/spawn.js"
node --check "${ROOT_DIR}/systems/combat.js"
node --check "${ROOT_DIR}/systems/run.js"
node --check "${ROOT_DIR}/azure_clone/systems/spawn.js"
node --check "${ROOT_DIR}/azure_clone/systems/combat.js"
node --check "${ROOT_DIR}/azure_clone/systems/run.js"
node "${ROOT_DIR}/scripts/core-tests.js"
node "${ROOT_DIR}/scripts/data-tests.js"
node "${ROOT_DIR}/scripts/renderer-parity.js"
"${ROOT_DIR}/scripts/check-mirror.sh"

echo "Smoke checks passed."
