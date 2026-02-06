(function registerMoonlightCombatSystem(globalScope) {
  "use strict";

  function createCombatSystem(deps) {
    const {
      state,
      DIR_LIST,
      keyOf,
      isWalkable,
      isAdjacent,
      distance,
      random,
      randomInt,
      logEvent,
      setStatus,
      playSfx,
      damageEquipment,
      itemAt,
      createInventoryItem,
      rollItemIdForFloor,
      awardRunGold,
      grantFamiliarXp,
      getItemDisplayName,
    } = deps;

    function rollDamage(atk, def) {
      let amount = Math.max(1, atk + randomInt(-1, 2) - def);
      if (random() < 0.08) {
        amount += 2;
      }
      return amount;
    }

    function removeMonster(monster) {
      state.monsters = state.monsters.filter((entry) => entry.id !== monster.id);
    }

    function gainXp(amount) {
      state.player.xp += amount;

      while (state.player.xp >= state.player.nextXp) {
        state.player.xp -= state.player.nextXp;
        state.player.level += 1;
        state.player.nextXp = Math.floor(state.player.nextXp * 1.35);
        state.player.maxHp += 5;
        state.player.atk += 1;
        if (state.player.level % 3 === 0) {
          state.player.def += 1;
        }

        state.player.hp = state.player.maxHp;
        logEvent(`Level up! You are now level ${state.player.level}.`);
        setStatus(`Power surges through you at level ${state.player.level}.`);
        playSfx("level");
      }
    }

    function handleMonsterDefeat(monster) {
      removeMonster(monster);
      gainXp(monster.xp);
      grantFamiliarXp(Math.max(2, Math.floor(monster.xp * 0.7)));
      state.run.kills += 1;
      awardRunGold(2 + Math.floor(state.floor * 0.8), "a monster");
      logEvent(`${monster.name} is defeated.`);

      if (random() < 0.2 && !itemAt(monster.x, monster.y)) {
        const drop = createInventoryItem(rollItemIdForFloor());
        if (drop) {
          state.items.push({ x: monster.x, y: monster.y, item: drop });
          logEvent(`${monster.name} dropped ${getItemDisplayName(drop)}.`);
        }
      }
    }

    function playerAttack(monster) {
      const dmg = rollDamage(state.player.atk, monster.def);
      monster.hp -= dmg;
      damageEquipment("weapon", 1, 0.45);
      logEvent(`You hit ${monster.name} for ${dmg}.`);
      setStatus(`Strike landed on ${monster.name}.`);
      playSfx("attack");

      if (monster.hp <= 0) {
        handleMonsterDefeat(monster);
      }
    }

    function familiarAttack(monster) {
      const dmg = rollDamage(state.familiar.atk, monster.def);
      monster.hp -= dmg;
      logEvent(`Kewne claws ${monster.name} for ${dmg}.`);
      playSfx("attack");

      if (
        monster.hp > 0 &&
        state.familiar.role === "feral" &&
        state.familiar.level >= 3 &&
        random() < 0.24
      ) {
        const followUp = Math.max(1, rollDamage(Math.max(1, state.familiar.atk - 1), monster.def));
        monster.hp -= followUp;
        logEvent(`Feral instinct triggers for an extra ${followUp} damage.`);
      }

      if (monster.hp <= 0) {
        handleMonsterDefeat(monster);
      }
    }

    function monsterAttack(monster, target, targetName) {
      let dmg = rollDamage(monster.atk, target.def);
      if (
        target === state.player &&
        state.familiar.alive &&
        state.familiar.role === "guardian" &&
        state.familiar.level >= 3 &&
        isAdjacent(monster, state.familiar)
      ) {
        const reduced = Math.max(1, dmg - (2 + Math.floor(state.familiar.level / 4)));
        if (reduced < dmg) {
          logEvent("Kewne intercepts part of the blow.");
          dmg = reduced;
        }
      }

      target.hp -= dmg;
      if (target === state.player) {
        damageEquipment("shield", 1, 0.4);
      }
      logEvent(`${monster.name} hits ${targetName} for ${dmg}.`);
      playSfx("hurt");

      if (target === state.player && state.player.hp <= 0) {
        state.gameOver = true;
        state.player.hp = 0;
        setStatus(`You fell on floor ${state.floor}.`);
        logEvent("You were defeated.");
      }

      if (target === state.familiar && state.familiar.hp <= 0 && state.familiar.alive) {
        state.familiar.hp = 0;
        state.familiar.alive = false;
        logEvent("Kewne collapsed.");
        setStatus("Kewne is down. Reach the next floor to revive it.");
      }
    }

    function stepToward(from, target, blocked) {
      const candidates = [];

      for (const dir of DIR_LIST) {
        const nx = from.x + dir.dx;
        const ny = from.y + dir.dy;
        if (!isWalkable(nx, ny)) continue;
        const key = keyOf(nx, ny);
        if (blocked.has(key)) continue;

        candidates.push({
          x: nx,
          y: ny,
          score: Math.abs(nx - target.x) + Math.abs(ny - target.y) + random() * 0.1,
        });
      }

      candidates.sort((a, b) => a.score - b.score);
      return candidates.length > 0 ? { x: candidates[0].x, y: candidates[0].y } : null;
    }

    function familiarTurn() {
      if (!state.familiar.alive || state.gameOver || state.monsters.length === 0) return;

      const adjacentEnemy = state.monsters.find((monster) => isAdjacent(state.familiar, monster));
      if (adjacentEnemy) {
        familiarAttack(adjacentEnemy);
      } else {
        let target = null;
        let bestDist = Infinity;
        for (const monster of state.monsters) {
          const d = distance(state.familiar, monster);
          if (d < bestDist) {
            bestDist = d;
            target = monster;
          }
        }

        if (!target) return;

        const blocked = new Set([
          keyOf(state.player.x, state.player.y),
          ...state.monsters.map((monster) => keyOf(monster.x, monster.y)),
        ]);

        const step = stepToward(state.familiar, target, blocked);
        if (step) {
          state.familiar.x = step.x;
          state.familiar.y = step.y;
        } else {
          const fallback = stepToward(state.familiar, { x: state.player.x, y: state.player.y }, blocked);
          if (fallback) {
            state.familiar.x = fallback.x;
            state.familiar.y = fallback.y;
          }
        }
      }

      if (
        state.familiar.role === "sage" &&
        state.familiar.level >= 3 &&
        state.player.hp < state.player.maxHp &&
        random() < 0.22
      ) {
        const heal = randomInt(1, 3 + Math.floor(state.familiar.level / 4));
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
        logEvent(`Kewne's aura restores ${heal} HP.`);
      }
    }

    function monstersTurn() {
      if (state.gameOver) return;

      for (const monster of [...state.monsters]) {
        if (state.gameOver) return;

        if ((monster.stunTurns || 0) > 0) {
          monster.stunTurns -= 1;
          continue;
        }

        if (isAdjacent(monster, state.player)) {
          monsterAttack(monster, state.player, "you");
          continue;
        }

        if (state.familiar.alive && isAdjacent(monster, state.familiar)) {
          monsterAttack(monster, state.familiar, "Kewne");
          continue;
        }

        const target =
          state.familiar.alive && distance(monster, state.familiar) <= distance(monster, state.player)
            ? state.familiar
            : state.player;

        const occupied = new Set([
          keyOf(state.player.x, state.player.y),
          ...state.monsters
            .filter((other) => other.id !== monster.id)
            .map((other) => keyOf(other.x, other.y)),
        ]);

        if (state.familiar.alive) {
          occupied.add(keyOf(state.familiar.x, state.familiar.y));
        }

        const step = stepToward(monster, target, occupied);
        if (step) {
          monster.x = step.x;
          monster.y = step.y;
        }
      }
    }

    return {
      rollDamage,
      removeMonster,
      gainXp,
      handleMonsterDefeat,
      playerAttack,
      familiarAttack,
      monsterAttack,
      stepToward,
      familiarTurn,
      monstersTurn,
    };
  }

  const api = {
    createCombatSystem,
  };

  globalScope.MoonlightSystems = Object.assign({}, globalScope.MoonlightSystems || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
