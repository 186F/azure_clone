#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const data = require("../game-data.js");

function runDataTests() {
  assert.equal(data.MAP_WIDTH, 13, "Unexpected map width");
  assert.equal(data.MAP_HEIGHT, 17, "Unexpected map height");
  assert.equal(data.TILE_WALL, 0);
  assert.equal(data.TILE_FLOOR, 1);
  assert.equal(data.TILE_STAIRS, 2);

  assert.ok(Array.isArray(data.DIR_LIST), "DIR_LIST must be an array");
  assert.equal(data.DIR_LIST.length, 4, "DIR_LIST should include four cardinal directions");

  assert.ok(Array.isArray(data.UPGRADE_DEFS), "UPGRADE_DEFS missing");
  assert.ok(data.UPGRADE_DEFS.some((entry) => entry.id === "watchtower"), "watchtower upgrade missing");
  assert.ok(
    Array.isArray(data.FAMILIAR_ROLE_DEFS) && data.FAMILIAR_ROLE_DEFS.length >= 4,
    "Familiar roles missing",
  );
  assert.ok(
    data.FAMILIAR_ROLE_DEFS.some((entry) => entry.id === "feral"),
    "Feral familiar role missing",
  );
  assert.ok(
    Array.isArray(data.FLOOR_VARIANTS) && data.FLOOR_VARIANTS.length >= 4,
    "Floor variants missing",
  );
  assert.ok(Array.isArray(data.SHRINE_DEFS) && data.SHRINE_DEFS.length >= 3, "Shrine defs missing");

  assert.ok(data.ITEM_LIBRARY.potion, "Potion item missing");
  assert.ok(data.ITEM_LIBRARY.windbell, "Windbell item missing");
  assert.ok(data.ITEM_LIBRARY.fireOrb, "Throwable fire orb missing");
  assert.ok(data.ITEM_LIBRARY.whetstone, "Equipment augment item missing");
  assert.ok(data.ITEM_LIBRARY.feralSigil, "Familiar role sigil missing");
  assert.ok(
    data.ITEM_SPAWN_TABLE.some((entry) => entry.id === "windbell"),
    "Windbell missing from spawn table",
  );
  assert.ok(
    data.ITEM_SPAWN_TABLE.some((entry) => entry.id === "fireOrb"),
    "Fire orb missing from spawn table",
  );

  assert.ok(Array.isArray(data.TRAP_DEFS), "TRAP_DEFS missing");
  assert.ok(data.TRAP_DEFS.some((entry) => entry.id === "spike"), "Spike trap missing");

  assert.ok(Array.isArray(data.MONSTER_POOL), "MONSTER_POOL missing");
  assert.ok(data.MONSTER_POOL.length >= 5, "MONSTER_POOL unexpectedly small");

  assert.ok(data.SFX_LIBRARY.attack?.length > 0, "Attack SFX pattern missing");
}

runDataTests();
console.log("Data tests passed.");
