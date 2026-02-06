#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node --check "${ROOT_DIR}/app.js"
node --check "${ROOT_DIR}/azure_clone/app.js"
node --check "${ROOT_DIR}/core.js"
node --check "${ROOT_DIR}/game-data.js"
node --check "${ROOT_DIR}/systems/spawn.js"
node --check "${ROOT_DIR}/systems/combat.js"
node --check "${ROOT_DIR}/systems/run.js"
node --check "${ROOT_DIR}/azure_clone/systems/spawn.js"
node --check "${ROOT_DIR}/azure_clone/systems/combat.js"
node --check "${ROOT_DIR}/azure_clone/systems/run.js"
node "${ROOT_DIR}/scripts/core-tests.js"
node "${ROOT_DIR}/scripts/data-tests.js"
"${ROOT_DIR}/scripts/check-mirror.sh"

echo "Smoke checks passed."
