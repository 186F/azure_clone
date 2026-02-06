(function registerMoonlightRunSystem(globalScope) {
  "use strict";

  function createRunSystem(deps) {
    const {
      state,
      random,
      randomInt,
      pick,
      createRunState,
      logEvent,
      setStatus,
      playSfx,
      syncUi,
      removeMonster,
      stashItemId,
      saveMeta,
      setTownScene,
      familiarTurn,
      monstersTurn,
    } = deps;

    function applyFloorPressure() {
      if (state.mode !== "tower" || state.gameOver) return;

      state.run.floorTurns += 1;
      const turns = state.run.floorTurns;
      const collapseAt = state.run.collapseAt;
      const remaining = collapseAt - turns;
      const warningSteps = [8, 4, 1];

      if (remaining > 0 && warningSteps.includes(remaining) && !state.run.warnings.has(remaining)) {
        state.run.warnings.add(remaining);
        logEvent(`The tower trembles. Collapse in ${remaining} turns.`);
        setStatus(`The tower trembles. ${remaining} turns until collapse.`);
      }

      if (turns < collapseAt) return;
      if ((turns - collapseAt) % 6 !== 0) return;

      const damage = randomInt(3 + Math.floor(state.floor / 3), 6 + Math.floor(state.floor / 2));
      state.player.hp -= damage;
      if (state.familiar.alive) {
        state.familiar.hp -= Math.max(1, Math.floor(damage / 2));
        if (state.familiar.hp <= 0) {
          state.familiar.hp = 0;
          state.familiar.alive = false;
          logEvent("Kewne collapsed during the collapse tremor.");
        }
      }

      for (const monster of [...state.monsters]) {
        if (random() < 0.55) {
          monster.hp -= randomInt(2, 5);
          if (monster.hp <= 0) {
            removeMonster(monster);
            logEvent(`${monster.name} was crushed by falling debris.`);
          }
        }
      }

      logEvent(`The floor shakes violently for ${damage} damage.`);
      setStatus(`Collapse damage: ${damage}. Reach the stairs quickly.`);
      playSfx("hurt");

      if (state.player.hp <= 0) {
        state.player.hp = 0;
        state.gameOver = true;
      }
    }

    function finishRun(reason) {
      if (state.mode !== "tower") return;

      const bankRatio = reason === "defeat" ? 0.5 : 1;
      const bankedGold = Math.floor(state.run.gold * bankRatio);
      const reachedFloor = Math.max(1, state.floor);
      let salvageLabel = "";

      if (reason !== "defeat") {
        const salvagePool = [
          ...state.player.inventory,
          ...Object.values(state.player.equipment).filter(Boolean),
        ];
        if (salvagePool.length > 0) {
          const salvaged = pick(salvagePool);
          stashItemId(salvaged.id);
          salvageLabel = ` Salvaged ${salvaged.name} for town stash.`;
        }
      }

      state.meta.townGold += bankedGold;
      state.meta.bestFloor = Math.max(state.meta.bestFloor, reachedFloor);
      state.meta.runs += 1;
      saveMeta();

      if (reason === "defeat") {
        playSfx("defeat");
        state.townSummary = `Defeated on floor ${reachedFloor}. Banked ${bankedGold} town gold.${salvageLabel}`;
      } else if (reason === "escape") {
        playSfx("stairs");
        state.townSummary = `Escaped from floor ${reachedFloor}. Banked ${bankedGold} town gold.${salvageLabel}`;
      } else {
        playSfx("stairs");
        state.townSummary = `Retreated from floor ${reachedFloor}. Banked ${bankedGold} town gold.${salvageLabel}`;
      }

      logEvent(state.townSummary);
      state.mode = "town";
      state.gameOver = false;
      state.run = createRunState();
      setTownScene();
      setStatus("Back in Monsbaiya. Spend gold to strengthen future runs.");
      syncUi();
    }

    function performAction(result) {
      if (state.mode !== "tower" || state.gameOver) return;

      if (!result.acted) {
        syncUi();
        return;
      }

      if (result.skipEnemy) {
        syncUi();
        return;
      }

      familiarTurn();
      monstersTurn();
      applyFloorPressure();

      if (state.player.hp <= 0 || state.gameOver) {
        state.player.hp = 0;
        state.gameOver = true;
        finishRun("defeat");
        return;
      }

      syncUi();
    }

    function consumeForcedSkipTurn() {
      if (state.mode !== "tower" || state.gameOver) return false;
      if (!state.player || state.player.skipTurns <= 0) return false;

      state.player.skipTurns -= 1;
      setStatus("You struggle to break free from the snare.");
      logEvent("You lose a turn while snared.");
      familiarTurn();
      monstersTurn();
      applyFloorPressure();

      if (state.player.hp <= 0 || state.gameOver) {
        state.player.hp = 0;
        state.gameOver = true;
        finishRun("defeat");
      } else {
        syncUi();
      }

      return true;
    }

    return {
      applyFloorPressure,
      consumeForcedSkipTurn,
      finishRun,
      performAction,
    };
  }

  const api = {
    createRunSystem,
  };

  globalScope.MoonlightSystems = Object.assign({}, globalScope.MoonlightSystems || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
