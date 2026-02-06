#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Baseline =="
node "${ROOT_DIR}/scripts/simulate-runs.js" --runs=300 --seed=baseline --forge=0 --clinic=0 --watchtower=0
echo
echo "== Mid Upgrades =="
node "${ROOT_DIR}/scripts/simulate-runs.js" --runs=300 --seed=mid --forge=3 --clinic=2 --watchtower=3
echo
echo "== Late Upgrades =="
node "${ROOT_DIR}/scripts/simulate-runs.js" --runs=300 --seed=late --forge=6 --clinic=5 --watchtower=6
