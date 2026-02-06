(function registerMoonlightSpawnSystem(globalScope) {
  "use strict";

  function createSpawnSystem(deps) {
    const {
      state,
      MAP_WIDTH,
      MAP_HEIGHT,
      TILE_FLOOR,
      TILE_STAIRS,
      DIR_LIST,
      MONSTER_POOL,
      ITEM_SPAWN_TABLE,
      TRAP_DEFS,
      SHRINE_DEFS,
      keyOf,
      isWalkable,
      tileAt,
      pick,
      weightedPick,
      random,
      createInventoryItem,
    } = deps;

    function rollItemIdForFloor() {
      const pool = ITEM_SPAWN_TABLE.filter((entry) => entry.minFloor <= state.floor);
      const choice = weightedPick(pool);
      return choice ? choice.id : "potion";
    }

    function rollTrapTypeForFloor() {
      const pool = TRAP_DEFS.filter((entry) => entry.minFloor <= state.floor);
      const choice = weightedPick(pool);
      return choice ? choice.id : "spike";
    }

    function rollShrineTypeForFloor() {
      const pool = SHRINE_DEFS.filter((entry) => entry.minFloor <= state.floor);
      const choice = weightedPick(pool);
      return choice ? choice.id : "healing";
    }

    function collectFloorCells() {
      const cells = [];

      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) {
          if (isWalkable(x, y)) {
            cells.push({ x, y });
          }
        }
      }

      return cells;
    }

    function collectReachableFloorCells(startX, startY) {
      if (!isWalkable(startX, startY)) {
        return [];
      }

      const cells = [];
      const visited = new Set([keyOf(startX, startY)]);
      const queue = [{ x: startX, y: startY }];

      while (queue.length > 0) {
        const current = queue.shift();
        if (tileAt(current.x, current.y) === TILE_FLOOR) {
          cells.push({ x: current.x, y: current.y });
        }

        for (const dir of DIR_LIST) {
          const nx = current.x + dir.dx;
          const ny = current.y + dir.dy;
          const key = keyOf(nx, ny);

          if (!isWalkable(nx, ny)) continue;
          if (visited.has(key)) continue;

          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }

      return cells;
    }

    function pickFreeCell(cells, occupied, anchor = null, minDistance = 0) {
      for (let i = 0; i < 140; i += 1) {
        const cell = pick(cells);
        if (occupied.has(keyOf(cell.x, cell.y))) continue;

        if (anchor) {
          const d = Math.abs(cell.x - anchor.x) + Math.abs(cell.y - anchor.y);
          if (d < minDistance) continue;
        }

        return cell;
      }

      for (const cell of cells) {
        if (occupied.has(keyOf(cell.x, cell.y))) continue;
        return cell;
      }

      return null;
    }

    function findOpenAdjacent(origin, blocked) {
      const candidates = [];

      for (const dir of DIR_LIST) {
        const x = origin.x + dir.dx;
        const y = origin.y + dir.dy;
        if (!isWalkable(x, y)) continue;
        if (blocked.has(keyOf(x, y))) continue;
        candidates.push({ x, y });
      }

      return candidates.length > 0 ? pick(candidates) : null;
    }

    function spawnMonstersAndItems() {
      state.monsters = [];
      state.items = [];
      state.traps = [];
      state.shrines = [];

      const floorCells = collectReachableFloorCells(state.player.x, state.player.y);
      if (floorCells.length === 0) {
        floorCells.push(...collectFloorCells().filter((cell) => tileAt(cell.x, cell.y) === TILE_FLOOR));
      }
      const occupied = new Set([keyOf(state.player.x, state.player.y)]);
      const variety = state.floorVariety || {};

      if (state.familiar.alive) {
        occupied.add(keyOf(state.familiar.x, state.familiar.y));
      }

      const monsterBase = Math.min(5 + state.floor, 14);
      const monsterCount = Math.max(3, Math.min(18, monsterBase + (variety.monsterDelta || 0)));
      const eliteChance = Math.min(
        0.6,
        Math.max(0, (variety.eliteChance || 0) + Math.max(0, state.floor - 5) * 0.01),
      );
      for (let i = 0; i < monsterCount; i += 1) {
        const spawn = pickFreeCell(floorCells, occupied, state.player, 3);
        if (!spawn) break;

        const profile = pick(MONSTER_POOL.filter((entry) => entry.minFloor <= state.floor));
        let maxHp = profile.hp + Math.floor(state.floor * 1.2);
        let atk = profile.atk + Math.floor(state.floor / 3);
        let def = profile.def + Math.floor(state.floor / 7);
        let xp = profile.xp + Math.floor(state.floor * 0.6);
        let name = profile.name;
        const elite = random() < eliteChance;
        if (elite) {
          maxHp = Math.floor(maxHp * 1.45) + 2;
          atk += 2;
          def += 1;
          xp = Math.floor(xp * 1.7) + 2;
          name = `Elite ${name}`;
        }

        state.monsters.push({
          id: state.nextMonsterId,
          name,
          x: spawn.x,
          y: spawn.y,
          hp: maxHp,
          maxHp,
          atk,
          def,
          xp,
          variant: profile.variant,
          elite,
          stunTurns: 0,
        });

        state.nextMonsterId += 1;
        occupied.add(keyOf(spawn.x, spawn.y));
      }

      const itemBase = 2 + Math.floor(state.floor / 2);
      const itemCount = Math.max(1, Math.min(12, itemBase + (variety.itemDelta || 0)));
      for (let i = 0; i < itemCount; i += 1) {
        const spawn = pickFreeCell(floorCells, occupied, state.player, 2);
        if (!spawn) break;
        occupied.add(keyOf(spawn.x, spawn.y));
        const item = createInventoryItem(rollItemIdForFloor());
        if (item) {
          state.items.push({ x: spawn.x, y: spawn.y, item });
        }
      }

      const trapBase = Math.min(2 + Math.floor(state.floor / 2), 9);
      const trapCount = Math.max(0, Math.min(12, trapBase + (variety.trapDelta || 0)));
      for (let i = 0; i < trapCount; i += 1) {
        const spawn = pickFreeCell(floorCells, occupied, state.player, 2);
        if (!spawn) break;
        if (tileAt(spawn.x, spawn.y) === TILE_STAIRS) continue;

        state.traps.push({
          x: spawn.x,
          y: spawn.y,
          type: rollTrapTypeForFloor(),
          revealed: false,
          armed: true,
        });
        occupied.add(keyOf(spawn.x, spawn.y));
      }

      const shrineCount = Math.max(0, Number(variety.shrineCount) || 0);
      const roomAnchors = Array.isArray(state.specialRooms)
        ? state.specialRooms
            .map((room) => ({ x: room.x, y: room.y }))
            .filter((cell) => tileAt(cell.x, cell.y) === TILE_FLOOR)
        : [];

      for (let i = 0; i < shrineCount; i += 1) {
        let spawn = null;

        while (roomAnchors.length > 0 && !spawn) {
          const anchor = roomAnchors.shift();
          if (!anchor) continue;
          if (occupied.has(keyOf(anchor.x, anchor.y))) continue;
          spawn = anchor;
        }

        if (!spawn) {
          spawn = pickFreeCell(floorCells, occupied, state.player, 2);
        }
        if (!spawn) break;
        if (tileAt(spawn.x, spawn.y) !== TILE_FLOOR) continue;

        state.shrines.push({
          x: spawn.x,
          y: spawn.y,
          type: rollShrineTypeForFloor(),
          used: false,
        });
        occupied.add(keyOf(spawn.x, spawn.y));
      }
    }

    return {
      rollItemIdForFloor,
      rollTrapTypeForFloor,
      rollShrineTypeForFloor,
      collectFloorCells,
      collectReachableFloorCells,
      pickFreeCell,
      findOpenAdjacent,
      spawnMonstersAndItems,
    };
  }

  const api = {
    createSpawnSystem,
  };

  globalScope.MoonlightSystems = Object.assign({}, globalScope.MoonlightSystems || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
