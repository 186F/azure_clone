#!/usr/bin/env node
"use strict";

const core = require("../core.js");
const data = require("../game-data.js");

const MONSTER_POOL = data.MONSTER_POOL;
const COLLAPSE_BASE = data.FLOOR_PRESSURE_BASE;
const COLLAPSE_STEP = data.FLOOR_PRESSURE_STEP;
const COLLAPSE_MIN = data.FLOOR_PRESSURE_MIN;

const DEFAULTS = {
  runs: 500,
  seed: "balance",
  maxFloor: 30,
  watchtower: 0,
  forge: 0,
  clinic: 0,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, rawValue] = token.slice(2).split("=");
    const key = rawKey.trim();
    const value = rawValue === undefined ? "" : rawValue.trim();

    if (key === "runs") options.runs = Math.max(1, Math.floor(Number(value) || DEFAULTS.runs));
    if (key === "seed") options.seed = value || DEFAULTS.seed;
    if (key === "max-floor") {
      options.maxFloor = Math.max(1, Math.floor(Number(value) || DEFAULTS.maxFloor));
    }
    if (key === "watchtower") options.watchtower = Math.max(0, Math.floor(Number(value) || 0));
    if (key === "forge") options.forge = Math.max(0, Math.floor(Number(value) || 0));
    if (key === "clinic") options.clinic = Math.max(0, Math.floor(Number(value) || 0));
  }
  return options;
}

function randomInt(randomFn, min, max) {
  return Math.floor(randomFn() * (max - min + 1)) + min;
}

function pick(randomFn, list) {
  return list[Math.floor(randomFn() * list.length)];
}

function pickMonster(randomFn, floor) {
  const pool = MONSTER_POOL.filter((entry) => entry.minFloor <= floor);
  return pick(randomFn, pool);
}

function rollDamage(randomFn, atk, def) {
  let amount = Math.max(1, atk + randomInt(randomFn, -1, 2) - def);
  if (randomFn() < 0.08) amount += 2;
  return amount;
}

function createPlayer(options) {
  const maxHp = 34 + options.clinic * 4;
  return {
    hp: maxHp,
    maxHp,
    atk: 8 + options.forge,
    def: 2 + Math.floor(options.forge / 3),
    potionBoost: options.clinic,
    potions: 2,
  };
}

function healPlayer(randomFn, player) {
  if (player.potions <= 0 || player.hp >= player.maxHp) return false;
  player.potions -= 1;
  const minHeal = 10 + player.potionBoost;
  const maxHeal = 15 + player.potionBoost * 2;
  const heal = randomInt(randomFn, minHeal, maxHeal);
  player.hp = Math.min(player.maxHp, player.hp + heal);
  return true;
}

function simulateEncounter(randomFn, player, floor) {
  const profile = pickMonster(randomFn, floor);
  const monster = {
    hp: profile.hp + Math.floor(floor * 1.2),
    atk: profile.atk + Math.floor(floor / 3),
    def: profile.def + Math.floor(floor / 7),
  };

  let rounds = 0;
  while (player.hp > 0 && monster.hp > 0 && rounds < 20) {
    rounds += 1;
    monster.hp -= rollDamage(randomFn, player.atk, monster.def);
    if (monster.hp <= 0) break;
    player.hp -= rollDamage(randomFn, monster.atk, player.def);
  }

  if (player.hp > 0 && randomFn() < 0.2) {
    player.potions += 1;
  }

  return {
    won: player.hp > 0 && monster.hp <= 0,
    rounds,
  };
}

function maybeApplyCollapse(randomFn, player, floor, turns, collapseAt) {
  if (turns < collapseAt) return false;
  if ((turns - collapseAt) % 6 !== 0) return false;

  const damage = randomInt(randomFn, 3 + Math.floor(floor / 3), 6 + Math.floor(floor / 2));
  player.hp -= damage;
  return true;
}

function simulateFloor(randomFn, player, floor, options) {
  const collapseAt = core.calculateCollapseTurn(
    COLLAPSE_BASE,
    COLLAPSE_STEP,
    COLLAPSE_MIN,
    floor,
    options.watchtower,
  );
  const targetTurns = randomInt(randomFn, 13 + floor, 36 + floor * 2);

  let turns = 0;
  let kills = 0;
  let collapseTicks = 0;

  while (player.hp > 0 && turns < targetTurns) {
    turns += 1;

    if (player.hp < player.maxHp * 0.4) {
      healPlayer(randomFn, player);
    }

    const encounterChance = Math.min(0.72, 0.36 + floor * 0.015);
    if (randomFn() < encounterChance) {
      const encounter = simulateEncounter(randomFn, player, floor);
      if (!encounter.won) {
        return {
          cleared: false,
          turns,
          kills,
          collapseTicks,
          reason: "monster",
        };
      }
      kills += 1;
    }

    if (maybeApplyCollapse(randomFn, player, floor, turns, collapseAt)) {
      collapseTicks += 1;
      if (player.hp <= 0) {
        return {
          cleared: false,
          turns,
          kills,
          collapseTicks,
          reason: "collapse",
        };
      }
    }
  }

  return {
    cleared: true,
    turns,
    kills,
    collapseTicks,
    reason: "stairs",
  };
}

function simulateRun(seed, options) {
  const randomFn = core.createSeededRandom(seed);
  const player = createPlayer(options);

  let floor = 1;
  let totalTurns = 0;
  let totalKills = 0;
  let collapseTicks = 0;
  let reason = "max-floor";

  while (floor <= options.maxFloor) {
    const result = simulateFloor(randomFn, player, floor, options);
    totalTurns += result.turns;
    totalKills += result.kills;
    collapseTicks += result.collapseTicks;

    if (!result.cleared) {
      reason = result.reason;
      break;
    }

    floor += 1;
    player.hp = Math.min(player.maxHp, player.hp + 4);
  }

  if (floor > options.maxFloor) {
    floor = options.maxFloor;
    reason = "max-floor";
  }

  return {
    floor,
    turns: totalTurns,
    kills: totalKills,
    collapseTicks,
    reason,
  };
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
}

function runSimulation(options) {
  const runs = [];
  const reasonCounts = new Map();

  for (let i = 0; i < options.runs; i += 1) {
    const seed = `${options.seed}-${i}`;
    const result = simulateRun(seed, options);
    runs.push(result);
    reasonCounts.set(result.reason, (reasonCounts.get(result.reason) || 0) + 1);
  }

  const floors = runs.map((entry) => entry.floor).sort((a, b) => a - b);
  const turns = runs.map((entry) => entry.turns).sort((a, b) => a - b);
  const kills = runs.map((entry) => entry.kills).sort((a, b) => a - b);
  const collapse = runs.map((entry) => entry.collapseTicks).sort((a, b) => a - b);

  const avg = (list, key) =>
    (list.reduce((sum, entry) => sum + entry[key], 0) / Math.max(1, list.length)).toFixed(2);

  console.log(`Simulation runs: ${options.runs}`);
  console.log(`Seed prefix: ${options.seed}`);
  console.log(
    `Upgrades -> Forge:${options.forge} Clinic:${options.clinic} Watchtower:${options.watchtower}`,
  );
  console.log("");
  console.log(`Floor avg: ${avg(runs, "floor")} | p50: ${quantile(floors, 0.5)} | p90: ${quantile(floors, 0.9)}`);
  console.log(`Turns avg: ${avg(runs, "turns")} | p50: ${quantile(turns, 0.5)} | p90: ${quantile(turns, 0.9)}`);
  console.log(`Kills avg: ${avg(runs, "kills")} | p50: ${quantile(kills, 0.5)} | p90: ${quantile(kills, 0.9)}`);
  console.log(
    `Collapse ticks avg: ${avg(runs, "collapseTicks")} | p50: ${quantile(collapse, 0.5)} | p90: ${quantile(collapse, 0.9)}`,
  );
  console.log("");
  console.log("Defeat/exit reasons:");

  const total = runs.length;
  for (const [reason, count] of [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`- ${reason}: ${count} (${pct}%)`);
  }
}

const options = parseArgs(process.argv.slice(2));
runSimulation(options);
