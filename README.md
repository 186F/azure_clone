# Moonlight Tower

Mobile-first browser roguelite inspired by Azure Dreams.

## Quick Start

No build step is required.

1. Open `index.html` directly in a browser.
2. Or run a local static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Implemented Features

- Town mode and tower run mode
- Procedural floor generation with stairs
- Floor variety system (`standard`, `hunting`, `vault`, `gauntlet`, `sanctum`)
- Special-room carving on eligible floors
- Shrine/altar interactions (`healing`, `forge`, `oracle`, `bond`)
- Turn-based movement and melee combat
- Familiar ally (`Kewne`) with autonomous AI
- Familiar progression (XP, levels, form evolution)
- Familiar role choices (`balanced`, `feral`, `guardian`, `sage`)
- Enemy roster with floor-scaled stats
- Elite monster variants on themed floors
- XP and leveling progression
- Inventory system with selection and cycling
- Equipment system with durability, enhancement levels, curses, and breakage
- Item identification system with hidden item names
- Item pickup, equipment auto-equip behavior, and multi-kind item usage
- New item actions: identify, purify, augment, throwable attacks, familiar role sigils
- Trap system (`spike`, `snare`, `warp`)
- Floor pressure/collapse timer with warnings and quake damage
- Run seed generation and copy-to-clipboard
- Run gold earnings and town gold banking
- Run endings for retreat, escape, and defeat
- Persistent meta upgrades: `forge`, `clinic`, `pantry`, `nursery`, `watchtower`
- Persistent stash/salvage carryover between runs
- Touch controls, keyboard controls, swipe movement
- Sprite-atlas rendering from `assets/sprites.svg`
- Renderer abstraction with `2D Canvas` and `Three.js` modes
- 3D mode includes tile/entity rendering, traps/shrines/items, elite/stun markers, and HP bars
- Web Audio SFX with runtime toggle

## Controls

- Touch: D-pad and action buttons
- Swipe on map: move
- Keyboard move: `WASD` or arrow keys
- Keyboard wait: `Space`
- Keyboard use selected item: `H`
- Keyboard cycle item: `Q` or `E`
- Keyboard retreat/enter toggle: `T`
- Keyboard enter run from town: `Enter`
- Keyboard SFX toggle: `M`
- Keyboard renderer switch: `V` (reloads with alternate mode)

## Architecture

- `game-data.js`: shared constants, content tables, roles/evolution, floor variants, item/trap/shrine data, SFX definitions
- `core.js`: deterministic helpers (hashing, seeded RNG, weighted pick, run-state helpers)
- `systems/spawn.js`: spawn and floor-cell selection logic (including elites and shrines)
- `systems/combat.js`: damage, defeat, XP, familiar progression hooks, and AI turn logic
- `systems/run.js`: turn resolution, floor pressure, and run-end settlement
- `renderers/renderer-interface.js`: renderer mode selection helpers
- `renderers/canvas2d-renderer.js`: legacy canvas renderer implementation
- `renderers/three-assets.js`: shared Three.js geometry/material factory
- `renderers/three-renderer.js`: orthographic Three.js renderer
- `app.js`: UI wiring, rendering, input handling, persistence, orchestration
- `assets/sprites.svg`: sprite sheet

## Development Commands

- Full smoke checks: `./scripts/smoke-check.sh`
- Mirror verification: `./scripts/check-mirror.sh`
- Mirror sync: `./scripts/sync-mirror.sh`
- Core deterministic tests: `node ./scripts/core-tests.js`
- Data integrity checks: `node ./scripts/data-tests.js`
- Determinism parity check: `node ./scripts/renderer-parity.js`
- Balance simulation: `node ./scripts/simulate-runs.js --runs=500 --seed=trial`
- Upgrade-tier comparison report: `./scripts/balance-report.sh`

## Renderer Mode

- Default mode is `2D` unless a preference was saved.
- Force mode via query param:
  - `?renderer=2d`
  - `?renderer=three` (or `?renderer=3d`)
- Renderer preference is saved in `localStorage`.
- Three.js is loaded at runtime from multiple sources; if none are reachable, the app automatically falls back to `2D`.

## Mirror Workflow

This workspace keeps a root app copy and an `azure_clone/` copy synchronized.

- Use `./scripts/sync-mirror.sh` after root edits.
- Use `./scripts/check-mirror.sh` to assert parity.
- `./scripts/smoke-check.sh` validates syntax/tests and mirror parity together.

## Persistence

- Save data is stored in `localStorage`.
- Current key/schema source is defined in `game-data.js` (`META_STORAGE_KEY`, `META_SCHEMA_VERSION`).
