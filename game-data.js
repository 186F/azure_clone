(function registerMoonlightData(globalScope) {
  "use strict";

  const MAP_WIDTH = 13;
  const MAP_HEIGHT = 17;
  const SPRITE_SIZE = 16;
  const META_STORAGE_KEY = "moonlight_tower_meta_v3";
  const LEGACY_META_STORAGE_KEYS = ["moonlight_tower_meta_v2", "moonlight_tower_meta_v1"];
  const META_SCHEMA_VERSION = 3;

  const TILE_WALL = 0;
  const TILE_FLOOR = 1;
  const TILE_STAIRS = 2;

  const DIRECTIONS = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 },
  };

  const DIR_LIST = Object.values(DIRECTIONS);

  const MONSTER_POOL = [
    { name: "Pulunpa", minFloor: 1, hp: 11, atk: 4, def: 1, xp: 6, variant: 0 },
    { name: "KidN", minFloor: 2, hp: 14, atk: 5, def: 1, xp: 8, variant: 1 },
    { name: "Viper", minFloor: 3, hp: 17, atk: 6, def: 2, xp: 10, variant: 2 },
    { name: "Blume", minFloor: 4, hp: 20, atk: 7, def: 2, xp: 12, variant: 3 },
    { name: "Saber", minFloor: 6, hp: 24, atk: 8, def: 3, xp: 15, variant: 1 },
  ];

  const UPGRADE_DEFS = [
    {
      id: "forge",
      title: "Forge",
      desc: "Permanent starting ATK and DEF boost.",
      baseCost: 20,
      max: 10,
    },
    {
      id: "clinic",
      title: "Clinic",
      desc: "Permanent max HP and potion power boost.",
      baseCost: 18,
      max: 8,
    },
    {
      id: "pantry",
      title: "Pantry",
      desc: "Adds starting potions each run.",
      baseCost: 14,
      max: 6,
    },
    {
      id: "nursery",
      title: "Nursery",
      desc: "Makes Kewne permanently stronger.",
      baseCost: 22,
      max: 8,
    },
    {
      id: "watchtower",
      title: "Watchtower",
      desc: "Grants compass hint and extra run gold.",
      baseCost: 24,
      max: 7,
    },
  ];

  const MAX_INVENTORY_SIZE = 8;
  const FLOOR_PRESSURE_BASE = 62;
  const FLOOR_PRESSURE_STEP = 2;
  const FLOOR_PRESSURE_MIN = 28;

  const FAMILIAR_ROLE_DEFS = [
    {
      id: "balanced",
      title: "Balanced",
      desc: "No stat penalty and stable familiar behavior.",
      atkBonus: 0,
      defBonus: 0,
      hpBonus: 0,
    },
    {
      id: "feral",
      title: "Feral",
      desc: "Higher attack, lower defense, and a chance for a follow-up strike.",
      atkBonus: 2,
      defBonus: -1,
      hpBonus: 0,
    },
    {
      id: "guardian",
      title: "Guardian",
      desc: "Higher defense and can partially intercept hits aimed at the hero.",
      atkBonus: 0,
      defBonus: 2,
      hpBonus: 4,
    },
    {
      id: "sage",
      title: "Sage",
      desc: "Support-focused role with small restorative pulses during combat.",
      atkBonus: 0,
      defBonus: 1,
      hpBonus: 2,
    },
  ];

  const FAMILIAR_EVOLUTION_DEFS = [
    { tier: 0, level: 1, name: "Kewne", hpBonus: 0, atkBonus: 0, defBonus: 0 },
    { tier: 1, level: 4, name: "Kewne Spark", hpBonus: 4, atkBonus: 1, defBonus: 0 },
    { tier: 2, level: 8, name: "Kewne Nova", hpBonus: 8, atkBonus: 2, defBonus: 1 },
  ];

  const FLOOR_VARIANTS = [
    {
      id: "standard",
      title: "Standard Floor",
      minFloor: 1,
      weight: 40,
      monsterDelta: 0,
      itemDelta: 0,
      trapDelta: 0,
      eliteChance: 0.05,
      shrineCount: 0,
      event: "none",
    },
    {
      id: "hunting",
      title: "Hunting Grounds",
      minFloor: 3,
      weight: 16,
      monsterDelta: 2,
      itemDelta: 0,
      trapDelta: 0,
      eliteChance: 0.22,
      shrineCount: 0,
      event: "ambush",
    },
    {
      id: "vault",
      title: "Relic Vault",
      minFloor: 2,
      weight: 14,
      monsterDelta: 0,
      itemDelta: 2,
      trapDelta: -1,
      eliteChance: 0.08,
      shrineCount: 1,
      event: "treasure",
    },
    {
      id: "gauntlet",
      title: "Trap Gauntlet",
      minFloor: 4,
      weight: 12,
      monsterDelta: 1,
      itemDelta: 0,
      trapDelta: 3,
      eliteChance: 0.12,
      shrineCount: 0,
      event: "hazard",
    },
    {
      id: "sanctum",
      title: "Moonlight Sanctum",
      minFloor: 5,
      weight: 8,
      monsterDelta: -1,
      itemDelta: 1,
      trapDelta: -1,
      eliteChance: 0.08,
      shrineCount: 2,
      event: "blessing",
    },
  ];

  const SHRINE_DEFS = [
    { id: "healing", title: "Healing Shrine", minFloor: 1, weight: 30 },
    { id: "forge", title: "Forge Altar", minFloor: 3, weight: 22 },
    { id: "oracle", title: "Oracle Altar", minFloor: 2, weight: 24 },
    { id: "bond", title: "Bond Altar", minFloor: 4, weight: 24 },
  ];

  const ITEM_LIBRARY = {
    potion: {
      id: "potion",
      name: "Potion",
      kind: "consumable",
      healMin: 10,
      healMax: 15,
      alwaysIdentified: true,
    },
    hiPotion: {
      id: "hiPotion",
      name: "Hi-Potion",
      kind: "consumable",
      healMin: 18,
      healMax: 28,
      unidentifiedName: "Cloudy Tonic",
    },
    windbell: {
      id: "windbell",
      name: "Windbell",
      kind: "escape",
      unidentifiedName: "Whistling Relic",
    },
    insightOrb: {
      id: "insightOrb",
      name: "Insight Orb",
      kind: "identify",
      unidentifiedName: "Murky Orb",
    },
    purityOrb: {
      id: "purityOrb",
      name: "Purity Orb",
      kind: "purify",
      unidentifiedName: "Pale Orb",
    },
    whetstone: {
      id: "whetstone",
      name: "Whetstone",
      kind: "augment",
      target: "weapon",
      bonus: 1,
      unidentifiedName: "Rough Stone",
    },
    guardPolish: {
      id: "guardPolish",
      name: "Guard Polish",
      kind: "augment",
      target: "shield",
      bonus: 1,
      unidentifiedName: "Tin of Paste",
    },
    fireOrb: {
      id: "fireOrb",
      name: "Fire Orb",
      kind: "throwable",
      damageMin: 13,
      damageMax: 20,
      range: 4,
      unidentifiedName: "Crimson Orb",
    },
    frostOrb: {
      id: "frostOrb",
      name: "Frost Orb",
      kind: "throwable",
      damageMin: 9,
      damageMax: 15,
      range: 4,
      stunTurns: 1,
      unidentifiedName: "Azure Orb",
    },
    feralSigil: {
      id: "feralSigil",
      name: "Feral Sigil",
      kind: "familiarRole",
      role: "feral",
      unidentifiedName: "Clawed Sigil",
    },
    guardianSigil: {
      id: "guardianSigil",
      name: "Guardian Sigil",
      kind: "familiarRole",
      role: "guardian",
      unidentifiedName: "Bulwark Sigil",
    },
    sageSigil: {
      id: "sageSigil",
      name: "Sage Sigil",
      kind: "familiarRole",
      role: "sage",
      unidentifiedName: "Astral Sigil",
    },
    bronzeSword: {
      id: "bronzeSword",
      name: "Bronze Sword",
      kind: "weapon",
      atkBonus: 2,
      durability: 18,
      maxEnhance: 6,
      canBeCursed: true,
      unidentifiedName: "Dulled Blade",
    },
    ironSword: {
      id: "ironSword",
      name: "Iron Sword",
      kind: "weapon",
      atkBonus: 4,
      durability: 22,
      maxEnhance: 7,
      canBeCursed: true,
      unidentifiedName: "Heavy Blade",
    },
    oakShield: {
      id: "oakShield",
      name: "Oak Shield",
      kind: "shield",
      defBonus: 1,
      durability: 20,
      maxEnhance: 6,
      canBeCursed: true,
      unidentifiedName: "Worn Shield",
    },
    steelShield: {
      id: "steelShield",
      name: "Steel Shield",
      kind: "shield",
      defBonus: 2,
      durability: 24,
      maxEnhance: 7,
      canBeCursed: true,
      unidentifiedName: "Reinforced Shield",
    },
  };

  const ITEM_SPAWN_TABLE = [
    { id: "potion", weight: 34, minFloor: 1 },
    { id: "hiPotion", weight: 14, minFloor: 3 },
    { id: "windbell", weight: 6, minFloor: 4 },
    { id: "insightOrb", weight: 8, minFloor: 2 },
    { id: "purityOrb", weight: 6, minFloor: 4 },
    { id: "whetstone", weight: 9, minFloor: 3 },
    { id: "guardPolish", weight: 9, minFloor: 3 },
    { id: "fireOrb", weight: 11, minFloor: 2 },
    { id: "frostOrb", weight: 10, minFloor: 4 },
    { id: "feralSigil", weight: 4, minFloor: 3 },
    { id: "guardianSigil", weight: 4, minFloor: 3 },
    { id: "sageSigil", weight: 4, minFloor: 4 },
    { id: "bronzeSword", weight: 13, minFloor: 2 },
    { id: "oakShield", weight: 13, minFloor: 2 },
    { id: "ironSword", weight: 8, minFloor: 5 },
    { id: "steelShield", weight: 7, minFloor: 6 },
  ];

  const TRAP_DEFS = [
    {
      id: "spike",
      title: "Spike Trap",
      minFloor: 1,
      weight: 50,
    },
    {
      id: "snare",
      title: "Snare Trap",
      minFloor: 2,
      weight: 30,
    },
    {
      id: "warp",
      title: "Warp Trap",
      minFloor: 4,
      weight: 20,
    },
  ];

  const SFX_LIBRARY = {
    move: [
      { freq: 210, time: 0.03, type: "square", gain: 0.018 },
      { freq: 260, time: 0.025, type: "square", gain: 0.015 },
    ],
    attack: [
      { freq: 420, time: 0.045, type: "sawtooth", gain: 0.028 },
      { freq: 280, time: 0.035, type: "triangle", gain: 0.02 },
    ],
    hurt: [
      { freq: 170, time: 0.06, type: "square", gain: 0.03 },
      { freq: 120, time: 0.04, type: "triangle", gain: 0.02 },
    ],
    potion: [
      { freq: 460, time: 0.04, type: "sine", gain: 0.02 },
      { freq: 620, time: 0.07, type: "sine", gain: 0.02 },
    ],
    gold: [{ freq: 760, time: 0.04, type: "triangle", gain: 0.02 }],
    stairs: [
      { freq: 380, time: 0.04, type: "triangle", gain: 0.018 },
      { freq: 520, time: 0.05, type: "triangle", gain: 0.02 },
      { freq: 700, time: 0.06, type: "triangle", gain: 0.02 },
    ],
    level: [
      { freq: 420, time: 0.05, type: "triangle", gain: 0.02 },
      { freq: 560, time: 0.07, type: "triangle", gain: 0.02 },
      { freq: 840, time: 0.09, type: "triangle", gain: 0.02 },
    ],
    upgrade: [
      { freq: 520, time: 0.04, type: "square", gain: 0.018 },
      { freq: 680, time: 0.06, type: "square", gain: 0.018 },
      { freq: 860, time: 0.06, type: "triangle", gain: 0.02 },
    ],
    start: [
      { freq: 310, time: 0.05, type: "triangle", gain: 0.018 },
      { freq: 470, time: 0.06, type: "triangle", gain: 0.018 },
      { freq: 620, time: 0.08, type: "triangle", gain: 0.018 },
    ],
    deny: [{ freq: 150, time: 0.06, type: "square", gain: 0.02 }],
    defeat: [
      { freq: 260, time: 0.06, type: "sawtooth", gain: 0.022 },
      { freq: 170, time: 0.08, type: "sawtooth", gain: 0.022 },
      { freq: 110, time: 0.12, type: "sawtooth", gain: 0.025 },
    ],
  };

  const MAX_LOG_ENTRIES = 10;

  const api = {
    MAP_WIDTH,
    MAP_HEIGHT,
    SPRITE_SIZE,
    META_STORAGE_KEY,
    LEGACY_META_STORAGE_KEYS,
    META_SCHEMA_VERSION,
    TILE_WALL,
    TILE_FLOOR,
    TILE_STAIRS,
    DIRECTIONS,
    DIR_LIST,
    MONSTER_POOL,
    UPGRADE_DEFS,
    MAX_INVENTORY_SIZE,
    FLOOR_PRESSURE_BASE,
    FLOOR_PRESSURE_STEP,
    FLOOR_PRESSURE_MIN,
    FAMILIAR_ROLE_DEFS,
    FAMILIAR_EVOLUTION_DEFS,
    FLOOR_VARIANTS,
    SHRINE_DEFS,
    ITEM_LIBRARY,
    ITEM_SPAWN_TABLE,
    TRAP_DEFS,
    SFX_LIBRARY,
    MAX_LOG_ENTRIES,
  };

  globalScope.MoonlightData = Object.assign({}, globalScope.MoonlightData || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
