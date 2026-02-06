const Data = globalThis.MoonlightData;
const Core = globalThis.MoonlightCore;
const Systems = globalThis.MoonlightSystems;

if (!Data) {
  throw new Error("MoonlightData not found. Ensure game-data.js is loaded before app.js.");
}
if (!Core) {
  throw new Error("MoonlightCore not found. Ensure core.js is loaded before app.js.");
}
if (!Systems) {
  throw new Error(
    "MoonlightSystems not found. Ensure systems/*.js files are loaded before app.js.",
  );
}

const {
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
} = Data;

const UPGRADE_BY_ID = Object.fromEntries(UPGRADE_DEFS.map((upgrade) => [upgrade.id, upgrade]));
const FAMILIAR_ROLE_BY_ID = Object.fromEntries(FAMILIAR_ROLE_DEFS.map((entry) => [entry.id, entry]));

function createRunState() {
  return Core.createRunState(FLOOR_PRESSURE_BASE);
}

const dom = {
  canvas: document.getElementById("gameCanvas"),
  floorStat: document.getElementById("floorStat"),
  hpStat: document.getElementById("hpStat"),
  xpStat: document.getElementById("xpStat"),
  potionStat: document.getElementById("potionStat"),
  seedStat: document.getElementById("seedStat"),
  pressureStat: document.getElementById("pressureStat"),
  familiarStat: document.getElementById("familiarStat"),
  townGoldStat: document.getElementById("townGoldStat"),
  runGoldStat: document.getElementById("runGoldStat"),
  bestFloorStat: document.getElementById("bestFloorStat"),
  statusLine: document.getElementById("statusLine"),
  townSummary: document.getElementById("townSummary"),
  upgradeList: document.getElementById("upgradeList"),
  townCard: document.getElementById("townCard"),
  logList: document.getElementById("logList"),
  runToggleBtn: document.getElementById("runToggleBtn"),
  audioBtn: document.getElementById("audioBtn"),
  copySeedBtn: document.getElementById("copySeedBtn"),
  waitBtn: document.getElementById("waitBtn"),
  potionBtn: document.getElementById("potionBtn"),
  cycleBtn: document.getElementById("cycleBtn"),
  retreatBtn: document.getElementById("retreatBtn"),
  controls: document.querySelector(".controls"),
  dirButtons: [...document.querySelectorAll(".dir-btn")],
};

const ctx = dom.canvas.getContext("2d");

const state = {
  mode: "town",
  floor: 0,
  map: [],
  stairs: { x: 0, y: 0 },
  monsters: [],
  items: [],
  traps: [],
  shrines: [],
  specialRooms: [],
  floorVariety: null,
  nextMonsterId: 1,
  nextItemId: 1,
  logs: [],
  status: "",
  townSummary: "Invest town gold before your next climb.",
  gameOver: false,
  player: null,
  familiar: null,
  tileWidth: 0,
  tileHeight: 0,
  run: createRunState(),
  meta: loadMeta(),
  rng: {
    seed: "",
    next: Math.random,
  },
  sprites: {
    image: null,
    ready: false,
  },
  audio: {
    enabled: true,
    context: null,
  },
  upgradeUi: new Map(),
};

let touchStartPoint = null;
let spawnSystem = null;
let combatSystem = null;
let runSystem = null;

function ensureSystems() {
  if (!spawnSystem) {
    if (typeof Systems.createSpawnSystem !== "function") {
      throw new Error("Moonlight spawn system is unavailable.");
    }
    spawnSystem = Systems.createSpawnSystem({
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
    });
  }

  if (!combatSystem) {
    if (typeof Systems.createCombatSystem !== "function") {
      throw new Error("Moonlight combat system is unavailable.");
    }
    combatSystem = Systems.createCombatSystem({
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
    });
  }

  if (!runSystem) {
    if (typeof Systems.createRunSystem !== "function") {
      throw new Error("Moonlight run system is unavailable.");
    }
    runSystem = Systems.createRunSystem({
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
    });
  }
}

function createSeededRandom(seedString) {
  return Core.createSeededRandom(seedString);
}

function makeRunSeed() {
  const perfNow = typeof performance !== "undefined" ? performance.now() : Date.now();
  return Core.makeRunSeed(Date.now(), perfNow);
}

function setRunSeed(seed) {
  const normalized = String(seed || makeRunSeed()).trim().toLowerCase();
  state.rng.seed = normalized;
  state.rng.next = createSeededRandom(normalized);
  state.run.seed = normalized;
}

function random() {
  return state.rng.next();
}

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function weightedPick(entries) {
  return Core.weightedPick(entries, random);
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function inBounds(x, y) {
  return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

function tileAt(x, y) {
  if (!inBounds(x, y)) return TILE_WALL;
  return state.map[y][x];
}

function isWalkable(x, y) {
  const tile = tileAt(x, y);
  return tile === TILE_FLOOR || tile === TILE_STAIRS;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isAdjacent(a, b) {
  return distance(a, b) === 1;
}

function logEvent(message) {
  state.logs.push(message);
  if (state.logs.length > MAX_LOG_ENTRIES) {
    state.logs.shift();
  }
}

function setStatus(message) {
  state.status = message;
}

function createDefaultMeta() {
  const upgrades = {};
  for (const entry of UPGRADE_DEFS) {
    upgrades[entry.id] = 0;
  }

  return {
    schemaVersion: META_SCHEMA_VERSION,
    townGold: 0,
    bestFloor: 1,
    runs: 0,
    stash: [],
    upgrades,
  };
}

function migrateMeta(raw) {
  if (!raw || typeof raw !== "object") {
    return createDefaultMeta();
  }

  const migrated = { ...raw };
  const version = Number(migrated.schemaVersion);
  migrated.schemaVersion = Number.isFinite(version) ? Math.max(1, Math.floor(version)) : 1;

  if (migrated.schemaVersion < 2) {
    migrated.stash = [];
  }

  if (migrated.schemaVersion < 3) {
    migrated.schemaVersion = META_SCHEMA_VERSION;
  }

  return migrated;
}

function normalizeMeta(raw) {
  const fallback = createDefaultMeta();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const migrated = migrateMeta(raw);
  const upgrades = {};
  for (const entry of UPGRADE_DEFS) {
    const value = Number(migrated.upgrades?.[entry.id]);
    upgrades[entry.id] = Number.isFinite(value)
      ? Math.max(0, Math.min(entry.max, Math.floor(value)))
      : 0;
  }

  const stash = Array.isArray(migrated.stash)
    ? migrated.stash.filter((id) => typeof id === "string" && ITEM_LIBRARY[id]).slice(0, 12)
    : [];
  const townGold = Number(migrated.townGold);
  const bestFloor = Number(migrated.bestFloor);
  const runs = Number(migrated.runs);

  return {
    schemaVersion: META_SCHEMA_VERSION,
    townGold: Number.isFinite(townGold) ? Math.max(0, Math.floor(townGold)) : 0,
    bestFloor: Number.isFinite(bestFloor) ? Math.max(1, Math.floor(bestFloor)) : 1,
    runs: Number.isFinite(runs) ? Math.max(0, Math.floor(runs)) : 0,
    stash,
    upgrades,
  };
}

function loadMeta() {
  const fallback = createDefaultMeta();
  const storageKeys = [META_STORAGE_KEY, ...LEGACY_META_STORAGE_KEYS];

  for (const key of storageKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const normalized = normalizeMeta(JSON.parse(raw));
      if (key !== META_STORAGE_KEY) {
        localStorage.setItem(META_STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      continue;
    }
  }

  return fallback;
}

function saveMeta() {
  try {
    const payload = {
      ...state.meta,
      schemaVersion: META_SCHEMA_VERSION,
      stash: Array.isArray(state.meta.stash) ? state.meta.stash.slice(0, 12) : [],
    };
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    logEvent("Warning: Unable to save town progression in this browser.");
  }
}

function getUpgradeLevel(id) {
  return state.meta.upgrades[id] || 0;
}

function getUpgradeCost(id) {
  const upgrade = UPGRADE_BY_ID[id];
  const level = getUpgradeLevel(id);
  return Math.floor(upgrade.baseCost * Math.pow(1.42, level));
}

function getUpgradeEffectText(id, level) {
  if (id === "forge") {
    return `Current: +${level} ATK, +${Math.floor(level / 3)} DEF at run start.`;
  }

  if (id === "clinic") {
    return `Current: +${level * 4} HP, potions heal +${level}.`;
  }

  if (id === "pantry") {
    return `Current: +${level} starting potion${level === 1 ? "" : "s"}.`;
  }

  if (id === "nursery") {
    return `Current: Kewne +${level * 2} HP, +${Math.floor(level / 2)} ATK.`;
  }

  if (id === "watchtower") {
    const delay = Math.floor(level / 2);
    return `Current: +${level * 5}% run gold${level > 0 ? ", compass enabled" : ""}${
      delay > 0 ? `, collapse +${delay} turns.` : "."
    }`;
  }

  return "";
}

function buildUpgradeUi() {
  dom.upgradeList.innerHTML = "";

  for (const upgrade of UPGRADE_DEFS) {
    const item = document.createElement("li");
    item.className = "upgrade-item";

    const copy = document.createElement("div");
    copy.className = "upgrade-copy";

    const title = document.createElement("h3");
    title.textContent = upgrade.title;

    const desc = document.createElement("p");
    desc.textContent = upgrade.desc;

    const levelLine = document.createElement("p");
    levelLine.className = "upgrade-level";

    const effectLine = document.createElement("p");

    copy.append(title, desc, levelLine, effectLine);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "upgrade-btn";
    button.dataset.upgrade = upgrade.id;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      primeAudio();
      purchaseUpgrade(upgrade.id);
    });

    item.append(copy, button);
    dom.upgradeList.append(item);

    state.upgradeUi.set(upgrade.id, {
      levelLine,
      effectLine,
      button,
    });
  }
}

function purchaseUpgrade(id) {
  if (state.mode !== "town") {
    setStatus("Upgrades can only be purchased in town.");
    playSfx("deny");
    syncUi();
    return;
  }

  const upgrade = UPGRADE_BY_ID[id];
  if (!upgrade) return;

  const level = getUpgradeLevel(id);
  if (level >= upgrade.max) {
    setStatus(`${upgrade.title} is already maxed.`);
    playSfx("deny");
    syncUi();
    return;
  }

  const cost = getUpgradeCost(id);
  if (state.meta.townGold < cost) {
    setStatus("Not enough town gold.");
    playSfx("deny");
    syncUi();
    return;
  }

  state.meta.townGold -= cost;
  state.meta.upgrades[id] = level + 1;
  state.townSummary = `${upgrade.title} upgraded to Lv ${level + 1}.`;
  setStatus(`${upgrade.title} improved.`);
  logEvent(`Town: ${upgrade.title} is now Lv ${level + 1}.`);
  saveMeta();
  playSfx("upgrade");
  syncUi();
}

function createInventoryItem(id) {
  const def = ITEM_LIBRARY[id];
  if (!def) return null;

  const item = {
    uid: state.nextItemId,
    id: def.id,
    name: def.name,
    kind: def.kind,
    identified: def.alwaysIdentified === true,
    unidentifiedName: def.unidentifiedName || "",
  };

  const copyKeys = [
    "healMin",
    "healMax",
    "atkBonus",
    "defBonus",
    "target",
    "bonus",
    "damageMin",
    "damageMax",
    "range",
    "stunTurns",
    "role",
  ];
  for (const key of copyKeys) {
    if (def[key] !== undefined) {
      item[key] = def[key];
    }
  }

  if (def.durability) {
    item.durability = def.durability;
    item.maxDurability = def.durability;
  }
  if (def.maxEnhance) {
    item.enhance = 0;
    item.maxEnhance = def.maxEnhance;
  }

  if (
    def.canBeCursed &&
    state.mode === "tower" &&
    state.floor >= 3 &&
    random() < Math.min(0.45, 0.08 + state.floor * 0.015)
  ) {
    item.cursed = true;
  }

  state.nextItemId += 1;
  return item;
}

function getItemEnhanceBonus(item) {
  if (!item) return 0;
  const value = Number(item.enhance);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function getEffectiveAtkBonus(item) {
  if (!item) return 0;
  const base = Number(item.atkBonus) || 0;
  return base + (item.kind === "weapon" ? getItemEnhanceBonus(item) : 0);
}

function getEffectiveDefBonus(item) {
  if (!item) return 0;
  const base = Number(item.defBonus) || 0;
  return base + (item.kind === "shield" ? getItemEnhanceBonus(item) : 0);
}

function getItemDisplayName(item, revealHidden = false) {
  if (!item) return "";
  const known = revealHidden || item.identified !== false || !item.unidentifiedName;
  let label = known ? item.name : item.unidentifiedName || "Unknown Item";

  if (known && (item.kind === "weapon" || item.kind === "shield")) {
    const plus = getItemEnhanceBonus(item);
    if (plus > 0) {
      label += ` +${plus}`;
    }
    if (item.cursed) {
      label += " (Cursed)";
    }
  }

  return label;
}

function identifyItem(item, source = "") {
  if (!item || item.identified !== false) return false;
  item.identified = true;
  if (source) {
    logEvent(`${source} reveals ${getItemDisplayName(item, true)}.`);
  }
  return true;
}

function getEquipmentSlot(kind) {
  if (kind === "weapon") return "weapon";
  if (kind === "shield") return "shield";
  return "";
}

function applyEquipmentDelta(item, direction) {
  if (!item) return;
  const sign = direction >= 0 ? 1 : -1;
  const atkBonus = getEffectiveAtkBonus(item);
  const defBonus = getEffectiveDefBonus(item);
  if (atkBonus) {
    state.player.atk += sign * atkBonus;
  }
  if (defBonus) {
    state.player.def += sign * defBonus;
  }
}

function normalizeSelectedInventory() {
  if (!state.player) return;
  if (state.player.inventory.length === 0) {
    state.player.selectedItemIndex = 0;
    return;
  }
  state.player.selectedItemIndex =
    ((state.player.selectedItemIndex % state.player.inventory.length) +
      state.player.inventory.length) %
    state.player.inventory.length;
}

function getSelectedInventoryItem() {
  if (!state.player) return null;
  normalizeSelectedInventory();
  return state.player.inventory[state.player.selectedItemIndex] || null;
}

function removeInventoryIndex(index) {
  if (!state.player) return null;
  if (index < 0 || index >= state.player.inventory.length) return null;
  const [removed] = state.player.inventory.splice(index, 1);
  normalizeSelectedInventory();
  return removed || null;
}

function addInventoryItem(item, source = "") {
  if (!state.player || !item) return false;
  if (state.player.inventory.length >= state.player.inventorySize) {
    if (source) {
      logEvent(`Your bag is full. ${source} was left behind.`);
    }
    return false;
  }

  state.player.inventory.push(item);
  normalizeSelectedInventory();
  return true;
}

function stashItemId(itemId) {
  if (!itemId || !ITEM_LIBRARY[itemId]) return;
  if (!Array.isArray(state.meta.stash)) {
    state.meta.stash = [];
  }
  if (state.meta.stash.length >= 12) {
    state.meta.stash.shift();
  }
  state.meta.stash.push(itemId);
}

function takeStashItemForRun() {
  if (!Array.isArray(state.meta.stash) || state.meta.stash.length === 0) {
    return null;
  }
  const itemId = state.meta.stash.shift();
  return createInventoryItem(itemId);
}

function equipItem(item, source = "inventory") {
  if (!item || !state.player) return false;
  const slot = getEquipmentSlot(item.kind);
  if (!slot) return false;

  const current = state.player.equipment[slot];
  if (current?.cursed) {
    setStatus(`${getItemDisplayName(current, true)} is cursed and cannot be removed.`);
    logEvent("A curse keeps your equipment bound.");
    playSfx("deny");
    return false;
  }

  identifyItem(item, "Attuning");

  if (current) {
    applyEquipmentDelta(current, -1);
    if (!addInventoryItem(current, getItemDisplayName(current, true))) {
      logEvent(`${getItemDisplayName(current, true)} was discarded.`);
    }
  }

  state.player.equipment[slot] = item;
  applyEquipmentDelta(item, 1);
  if (source === "ground") {
    setStatus(`${getItemDisplayName(item, true)} equipped.`);
  } else {
    setStatus(`You equip ${getItemDisplayName(item, true)}.`);
  }
  playSfx("upgrade");
  return true;
}

function damageEquipment(slot, amount = 1, chance = 0.5) {
  if (!state.player) return;
  const item = state.player.equipment[slot];
  if (!item || typeof item.durability !== "number" || random() > chance) return;

  item.durability = Math.max(0, item.durability - amount);
  if (item.durability > 0) return;

  state.player.equipment[slot] = null;
  applyEquipmentDelta(item, -1);
  logEvent(`${getItemDisplayName(item, true)} broke.`);
  setStatus(`${getItemDisplayName(item, true)} shattered.`);
}

function upgradeEquippedItem(slot, amount = 1, source = "") {
  if (!state.player) return false;
  const item = state.player.equipment[slot];
  if (!item || (slot !== "weapon" && slot !== "shield")) return false;

  const maxEnhance = Number(item.maxEnhance) || 0;
  const current = getItemEnhanceBonus(item);
  if (maxEnhance <= 0 || current >= maxEnhance) return false;

  const applied = Math.max(1, Math.min(amount, maxEnhance - current));
  applyEquipmentDelta(item, -1);
  item.enhance = current + applied;
  if (typeof item.durability === "number") {
    item.maxDurability += applied;
    item.durability = Math.min(item.maxDurability, item.durability + applied * 2);
  }
  applyEquipmentDelta(item, 1);
  identifyItem(item, source);
  return true;
}

function findTrapAt(x, y) {
  return state.traps.find((trap) => trap.x === x && trap.y === y) || null;
}

function rollItemIdForFloor() {
  ensureSystems();
  return spawnSystem.rollItemIdForFloor();
}

function rollTrapTypeForFloor() {
  ensureSystems();
  return spawnSystem.rollTrapTypeForFloor();
}

function calculateFloorCollapseTurn() {
  return Core.calculateCollapseTurn(
    FLOOR_PRESSURE_BASE,
    FLOOR_PRESSURE_STEP,
    FLOOR_PRESSURE_MIN,
    state.floor,
    getUpgradeLevel("watchtower"),
  );
}

function cycleInventory(direction = 1) {
  if (state.mode !== "tower" || state.gameOver) return;
  if (!state.player || state.player.inventory.length === 0) {
    setStatus("Your bag is empty.");
    syncUi();
    return;
  }

  state.player.selectedItemIndex += direction;
  normalizeSelectedInventory();
  const selected = getSelectedInventoryItem();
  if (selected) {
    setStatus(`Selected: ${getItemDisplayName(selected)}.`);
  }
  syncUi();
}

function getRunGoldMultiplier() {
  return 1 + getUpgradeLevel("watchtower") * 0.05;
}

function awardRunGold(baseAmount, source) {
  if (state.mode !== "tower") return;

  const amount = Math.max(1, Math.round(baseAmount * getRunGoldMultiplier()));
  state.run.gold += amount;
  if (source) {
    logEvent(`+${amount}g from ${source}.`);
  }
  playSfx("gold");
}

function rollDamage(atk, def) {
  ensureSystems();
  return combatSystem.rollDamage(atk, def);
}

function createHero(x, y, loadRunKit = false) {
  const forge = getUpgradeLevel("forge");
  const clinic = getUpgradeLevel("clinic");
  const pantry = getUpgradeLevel("pantry");

  const maxHp = 34 + clinic * 4;
  const hero = {
    x,
    y,
    level: 1,
    hp: maxHp,
    maxHp,
    atk: 8 + forge,
    def: 2 + Math.floor(forge / 3),
    xp: 0,
    nextXp: 20,
    inventory: [],
    inventorySize: MAX_INVENTORY_SIZE,
    selectedItemIndex: 0,
    equipment: {
      weapon: null,
      shield: null,
    },
    potionBoost: clinic,
    skipTurns: 0,
  };

  if (loadRunKit) {
    const startPotions = 2 + pantry;
    for (let i = 0; i < startPotions; i += 1) {
      const potion = createInventoryItem("potion");
      if (potion) {
        hero.inventory.push(potion);
      }
    }

    const stashItem = takeStashItemForRun();
    if (stashItem && hero.inventory.length < hero.inventorySize) {
      hero.inventory.push(stashItem);
    }
  }

  return hero;
}

function createFamiliar(x, y) {
  const nursery = getUpgradeLevel("nursery");
  const familiar = {
    name: "Kewne",
    x,
    y,
    hp: 1,
    maxHp: 1,
    atk: 1,
    def: 0,
    baseMaxHp: 24 + nursery * 2,
    baseAtk: 6 + Math.floor(nursery / 2),
    baseDef: 1 + Math.floor(nursery / 4),
    level: 1,
    xp: 0,
    nextXp: 16,
    role: "balanced",
    evolutionTier: 0,
    form: "Kewne",
    alive: true,
  };

  const roleDef = getFamiliarRoleDef(familiar.role);
  const evoDef = getFamiliarEvolutionDef(familiar.level);
  familiar.maxHp = familiar.baseMaxHp + roleDef.hpBonus + evoDef.hpBonus;
  familiar.hp = familiar.maxHp;
  familiar.atk = familiar.baseAtk + roleDef.atkBonus + evoDef.atkBonus;
  familiar.def = familiar.baseDef + roleDef.defBonus + evoDef.defBonus;
  familiar.form = evoDef.name;
  familiar.evolutionTier = evoDef.tier;
  return familiar;
}

function getFamiliarRoleDef(roleId) {
  return FAMILIAR_ROLE_BY_ID[roleId] || FAMILIAR_ROLE_BY_ID.balanced || FAMILIAR_ROLE_DEFS[0];
}

function getFamiliarEvolutionDef(level) {
  let resolved = FAMILIAR_EVOLUTION_DEFS[0];
  for (const entry of FAMILIAR_EVOLUTION_DEFS) {
    if (level >= entry.level) {
      resolved = entry;
    }
  }
  return resolved;
}

function recalculateFamiliarStats(preserveHpRatio = true) {
  if (!state.familiar) return;

  const familiar = state.familiar;
  const oldMaxHp = Math.max(1, familiar.maxHp || 1);
  const hpRatio = Math.max(0, Math.min(1, familiar.hp / oldMaxHp));

  const roleDef = getFamiliarRoleDef(familiar.role);
  const evoDef = getFamiliarEvolutionDef(familiar.level);

  familiar.maxHp = Math.max(1, familiar.baseMaxHp + roleDef.hpBonus + evoDef.hpBonus);
  familiar.atk = Math.max(1, familiar.baseAtk + roleDef.atkBonus + evoDef.atkBonus);
  familiar.def = Math.max(0, familiar.baseDef + roleDef.defBonus + evoDef.defBonus);
  familiar.form = evoDef.name;
  familiar.evolutionTier = evoDef.tier;

  if (preserveHpRatio) {
    familiar.hp = Math.max(1, Math.min(familiar.maxHp, Math.round(familiar.maxHp * hpRatio)));
  } else {
    familiar.hp = Math.max(0, Math.min(familiar.maxHp, familiar.hp));
  }

  if (!familiar.alive && familiar.hp > 0) {
    familiar.alive = true;
  }
}

function setFamiliarRole(roleId, sourceLabel = "") {
  if (!state.familiar) return false;
  const roleDef = FAMILIAR_ROLE_BY_ID[roleId];
  if (!roleDef) return false;

  if (state.familiar.role === roleDef.id) {
    setStatus(`Kewne is already aligned with the ${roleDef.title} role.`);
    return false;
  }

  state.familiar.role = roleDef.id;
  recalculateFamiliarStats(false);
  const origin = sourceLabel || "A charm";
  logEvent(`${origin} shifts Kewne into the ${roleDef.title} role.`);
  setStatus(`Kewne attunes to ${roleDef.title}.`);
  playSfx("level");
  return true;
}

function grantFamiliarXp(amount) {
  if (!state.familiar || !state.familiar.alive) return;
  const gain = Math.max(0, Math.floor(amount));
  if (gain <= 0) return;

  state.familiar.xp += gain;
  let leveled = false;
  let evolved = false;

  while (state.familiar.xp >= state.familiar.nextXp) {
    const previousTier = state.familiar.evolutionTier;
    state.familiar.xp -= state.familiar.nextXp;
    state.familiar.level += 1;
    state.familiar.nextXp = Math.floor(state.familiar.nextXp * 1.42) + 4;
    state.familiar.baseMaxHp += 2;
    if (state.familiar.level % 2 === 0) {
      state.familiar.baseAtk += 1;
    }
    if (state.familiar.level % 3 === 0) {
      state.familiar.baseDef += 1;
    }
    recalculateFamiliarStats(false);
    state.familiar.hp = state.familiar.maxHp;
    leveled = true;
    if (state.familiar.evolutionTier > previousTier) {
      evolved = true;
    }
  }

  if (!leveled) return;

  logEvent(`Kewne reached Lv ${state.familiar.level}.`);
  setStatus(`Kewne grows stronger (Lv ${state.familiar.level}).`);
  playSfx("level");

  if (evolved) {
    logEvent(`Kewne evolved into ${state.familiar.form}.`);
    setStatus(`Evolution! ${state.familiar.form} joins your climb.`);
  }
}

function findNearestFloorCell(map, targetX, targetY) {
  let best = null;
  let bestDist = Infinity;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (map[y][x] !== TILE_FLOOR) continue;
      const d = Math.abs(targetX - x) + Math.abs(targetY - y);
      if (d < bestDist) {
        bestDist = d;
        best = { x, y };
      }
    }
  }

  return best;
}

function reachableFarthestCell(map, start) {
  const visited = new Set([keyOf(start.x, start.y)]);
  const queue = [{ x: start.x, y: start.y, d: 0 }];
  let farthest = { x: start.x, y: start.y, d: 0 };

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.d > farthest.d) {
      farthest = current;
    }

    for (const dir of DIR_LIST) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;
      const key = keyOf(nx, ny);
      if (!inBounds(nx, ny)) continue;
      if (map[ny][nx] !== TILE_FLOOR) continue;
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push({ x: nx, y: ny, d: current.d + 1 });
    }
  }

  return farthest.d > 3 ? farthest : null;
}

function rollFloorVariety(floorNumber) {
  const options = FLOOR_VARIANTS.filter((entry) => entry.minFloor <= floorNumber);
  return weightedPick(options) || FLOOR_VARIANTS[0];
}

function carveSpecialRoom(map) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const roomW = randomInt(3, 4);
    const roomH = randomInt(3, 4);
    const roomX = randomInt(1, MAP_WIDTH - roomW - 2);
    const roomY = randomInt(1, MAP_HEIGHT - roomH - 2);

    let touchesFloor = false;
    for (let y = roomY - 1; y <= roomY + roomH; y += 1) {
      for (let x = roomX - 1; x <= roomX + roomW; x += 1) {
        if (!inBounds(x, y)) continue;
        if (x >= roomX && x < roomX + roomW && y >= roomY && y < roomY + roomH) continue;
        if (map[y][x] === TILE_FLOOR) {
          touchesFloor = true;
        }
      }
    }

    if (!touchesFloor) continue;

    for (let y = roomY; y < roomY + roomH; y += 1) {
      for (let x = roomX; x < roomX + roomW; x += 1) {
        map[y][x] = TILE_FLOOR;
      }
    }

    const doorwayCandidates = [];
    for (let x = roomX; x < roomX + roomW; x += 1) {
      doorwayCandidates.push({ x, y: roomY - 1 });
      doorwayCandidates.push({ x, y: roomY + roomH });
    }
    for (let y = roomY; y < roomY + roomH; y += 1) {
      doorwayCandidates.push({ x: roomX - 1, y });
      doorwayCandidates.push({ x: roomX + roomW, y });
    }
    for (const doorway of doorwayCandidates) {
      if (!inBounds(doorway.x, doorway.y)) continue;
      if (map[doorway.y][doorway.x] === TILE_FLOOR) {
        map[doorway.y][doorway.x] = TILE_FLOOR;
        break;
      }
    }

    return {
      x: roomX + Math.floor(roomW / 2),
      y: roomY + Math.floor(roomH / 2),
      width: roomW,
      height: roomH,
      kind: "sanctum-room",
    };
  }

  return null;
}

function generateFloorMap() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const map = Array.from({ length: MAP_HEIGHT }, () =>
      Array.from({ length: MAP_WIDTH }, () => TILE_WALL),
    );

    let x = randomInt(2, MAP_WIDTH - 3);
    let y = randomInt(2, MAP_HEIGHT - 3);
    const steps = MAP_WIDTH * MAP_HEIGHT * 6;

    for (let i = 0; i < steps; i += 1) {
      map[y][x] = TILE_FLOOR;

      if (random() < 0.18) {
        for (const dir of DIR_LIST) {
          const sx = x + dir.dx;
          const sy = y + dir.dy;
          if (sx > 0 && sx < MAP_WIDTH - 1 && sy > 0 && sy < MAP_HEIGHT - 1) {
            map[sy][sx] = TILE_FLOOR;
          }
        }
      }

      const dir = pick(DIR_LIST);
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (nx > 1 && nx < MAP_WIDTH - 2 && ny > 1 && ny < MAP_HEIGHT - 2) {
        x = nx;
        y = ny;
      }
    }

    for (let room = 0; room < 6; room += 1) {
      const roomW = randomInt(2, 4);
      const roomH = randomInt(2, 4);
      const roomX = randomInt(1, MAP_WIDTH - roomW - 2);
      const roomY = randomInt(1, MAP_HEIGHT - roomH - 2);
      for (let ry = roomY; ry < roomY + roomH; ry += 1) {
        for (let rx = roomX; rx < roomX + roomW; rx += 1) {
          map[ry][rx] = TILE_FLOOR;
        }
      }
    }

    const specialRooms = [];
    if (state.floor >= 2 && random() < 0.45) {
      const carved = carveSpecialRoom(map);
      if (carved) {
        specialRooms.push(carved);
      }
    }

    let floorCount = 0;
    for (let row = 0; row < MAP_HEIGHT; row += 1) {
      for (let col = 0; col < MAP_WIDTH; col += 1) {
        if (map[row][col] === TILE_FLOOR) floorCount += 1;
      }
    }

    if (floorCount < MAP_WIDTH * MAP_HEIGHT * 0.4) {
      continue;
    }

    const start = findNearestFloorCell(map, Math.floor(MAP_WIDTH / 2), Math.floor(MAP_HEIGHT / 2));
    if (!start) continue;

    const farthest = reachableFarthestCell(map, start);
    if (!farthest) continue;

    map[farthest.y][farthest.x] = TILE_STAIRS;

    return {
      map,
      start,
      stairs: { x: farthest.x, y: farthest.y },
      specialRooms,
    };
  }

  const fallback = Array.from({ length: MAP_HEIGHT }, (_, y) =>
    Array.from({ length: MAP_WIDTH }, (_, x) =>
      x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1 ? TILE_WALL : TILE_FLOOR,
    ),
  );

  fallback[MAP_HEIGHT - 2][MAP_WIDTH - 2] = TILE_STAIRS;
  return {
    map: fallback,
    start: { x: 1, y: 1 },
    stairs: { x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2 },
    specialRooms: [],
  };
}

function createTownMap() {
  const map = Array.from({ length: MAP_HEIGHT }, (_, y) =>
    Array.from({ length: MAP_WIDTH }, (_, x) =>
      x === 0 || y === 0 || x === MAP_WIDTH - 1 || y === MAP_HEIGHT - 1 ? TILE_WALL : TILE_FLOOR,
    ),
  );

  for (let x = 1; x <= 4; x += 1) {
    map[3][x] = TILE_WALL;
    map[7][x] = TILE_WALL;
  }

  for (let x = 8; x <= 11; x += 1) {
    map[4][x] = TILE_WALL;
    map[8][x] = TILE_WALL;
  }

  for (let y = 11; y <= 14; y += 1) {
    map[y][3] = TILE_WALL;
    map[y][9] = TILE_WALL;
  }

  map[8][6] = TILE_STAIRS;

  return map;
}

function collectFloorCells() {
  ensureSystems();
  return spawnSystem.collectFloorCells();
}

function collectReachableFloorCells(startX, startY) {
  ensureSystems();
  return spawnSystem.collectReachableFloorCells(startX, startY);
}

function pickFreeCell(cells, occupied, anchor = null, minDistance = 0) {
  ensureSystems();
  return spawnSystem.pickFreeCell(cells, occupied, anchor, minDistance);
}

function findOpenAdjacent(origin, blocked) {
  ensureSystems();
  return spawnSystem.findOpenAdjacent(origin, blocked);
}

function spawnMonstersAndItems() {
  ensureSystems();
  spawnSystem.spawnMonstersAndItems();
}

function findShrineAt(x, y) {
  return state.shrines.find((shrine) => shrine.x === x && shrine.y === y) || null;
}

function activateShrine(shrine) {
  if (!shrine || shrine.used || !state.player || !state.familiar) return false;
  shrine.used = true;

  if (shrine.type === "healing") {
    const heroHeal = randomInt(8 + state.floor, 14 + state.floor * 2);
    const familiarHeal = randomInt(6, 12);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heroHeal);
    if (state.familiar.alive) {
      state.familiar.hp = Math.min(state.familiar.maxHp, state.familiar.hp + familiarHeal);
    }
    logEvent(`Healing shrine restores ${heroHeal} HP and steadies Kewne.`);
    setStatus("Warm light mends your wounds.");
    playSfx("potion");
    return true;
  }

  if (shrine.type === "forge") {
    const choices = ["weapon", "shield"].filter((slot) => state.player.equipment[slot]);
    if (choices.length > 0) {
      const slot = pick(choices);
      if (upgradeEquippedItem(slot, 1, "Forge altar")) {
        const upgraded = state.player.equipment[slot];
        logEvent(`Forge altar empowers ${getItemDisplayName(upgraded, true)}.`);
        setStatus("Your gear resonates with forge magic.");
      } else {
        logEvent("Forge altar flares, but your gear cannot be improved further.");
        setStatus("Your gear is already at its enhancement limit.");
      }
    } else {
      logEvent("Forge altar sputters. You lack equipment to temper.");
      setStatus("No equipped gear for the altar to empower.");
    }
    playSfx("upgrade");
    return true;
  }

  if (shrine.type === "oracle") {
    const targets = [
      ...state.player.inventory,
      ...Object.values(state.player.equipment).filter(Boolean),
    ];
    let identified = 0;
    for (const item of targets) {
      if (identifyItem(item, "Oracle light")) {
        identified += 1;
      }
    }
    if (identified > 0) {
      logEvent(`Oracle altar reveals ${identified} hidden item${identified === 1 ? "" : "s"}.`);
      setStatus("Veils lift from your belongings.");
    } else {
      logEvent("Oracle altar offers a calm omen.");
      setStatus("Nothing remained hidden.");
    }
    playSfx("level");
    return true;
  }

  if (shrine.type === "bond") {
    const bonusXp = 8 + state.floor * 2;
    grantFamiliarXp(bonusXp);
    logEvent(`Bond altar grants Kewne ${bonusXp} bond XP.`);
    setStatus("Kewne's aura intensifies.");
    playSfx("level");
    return true;
  }

  return false;
}

function applyFloorVarietyOpeningEvent() {
  if (!state.floorVariety || state.mode !== "tower") return;
  const variety = state.floorVariety;

  if (variety.event === "blessing") {
    const heal = randomInt(4, 8);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    if (state.familiar.alive) {
      state.familiar.hp = Math.min(state.familiar.maxHp, state.familiar.hp + heal);
    }
    logEvent(`A calm aura blesses this floor (+${heal} HP).`);
    return;
  }

  if (variety.event === "treasure") {
    const item = createInventoryItem(rollItemIdForFloor());
    if (item && addInventoryItem(item, getItemDisplayName(item, true))) {
      logEvent(`Relic cache grants ${getItemDisplayName(item)}.`);
      setStatus("A relic cache was discovered.");
    } else {
      awardRunGold(5 + state.floor, "a relic cache");
      logEvent("Relic cache converted to run gold.");
    }
    return;
  }

  if (variety.event === "ambush") {
    const candidate = state.monsters.find((monster) => !monster.elite);
    if (candidate) {
      candidate.elite = true;
      candidate.name = `Elite ${candidate.name}`;
      candidate.maxHp += 6 + Math.floor(state.floor * 0.8);
      candidate.hp = candidate.maxHp;
      candidate.atk += 2;
      candidate.def += 1;
      candidate.xp += 5;
      logEvent("An elite pack leader appears nearby.");
    }
    return;
  }

  if (variety.event === "hazard") {
    const trap = pick(state.traps) || null;
    if (trap) {
      trap.revealed = true;
      trap.armed = true;
      logEvent("The floor's traps are unusually active.");
    }
  }
}

function buildFloor(floorNumber, freshRun = false) {
  state.floor = floorNumber;
  state.run.floorTurns = 0;
  state.run.warnings = new Set();
  state.run.collapseAt = calculateFloorCollapseTurn();
  state.floorVariety = rollFloorVariety(floorNumber);

  const generated = generateFloorMap();
  state.map = generated.map;
  state.stairs = generated.stairs;
  state.specialRooms = generated.specialRooms || [];

  if (freshRun || !state.player) {
    state.player = createHero(generated.start.x, generated.start.y, true);
  } else {
    state.player.x = generated.start.x;
    state.player.y = generated.start.y;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
  }

  if (freshRun || !state.familiar) {
    const blocked = new Set([keyOf(state.player.x, state.player.y)]);
    const spawn = findOpenAdjacent(state.player, blocked) || generated.start;
    state.familiar = createFamiliar(spawn.x, spawn.y);
  } else {
    if (!state.familiar.alive) {
      state.familiar.alive = true;
      state.familiar.hp = Math.ceil(state.familiar.maxHp * 0.6);
      logEvent("Kewne regains strength on the new floor.");
    } else {
      state.familiar.hp = Math.min(state.familiar.maxHp, state.familiar.hp + 3);
    }

    const blocked = new Set([keyOf(state.player.x, state.player.y)]);
    const spawn = findOpenAdjacent(state.player, blocked) || generated.start;
    state.familiar.x = spawn.x;
    state.familiar.y = spawn.y;
  }

  spawnMonstersAndItems();
  applyFloorVarietyOpeningEvent();
  const varietyTitle = state.floorVariety?.title || "Standard Floor";
  setStatus(
    `Floor ${state.floor} (${varietyTitle}): Find stairs and survive. Collapse at turn ${state.run.collapseAt}.`,
  );
  logEvent(`You enter floor ${state.floor}: ${varietyTitle}.`);
}

function setTownScene() {
  state.floor = 0;
  state.map = createTownMap();
  state.stairs = { x: 6, y: 8 };
  state.monsters = [];
  state.items = [];
  state.traps = [];
  state.shrines = [];
  state.specialRooms = [];
  state.floorVariety = null;
  state.player = createHero(6, 10, false);
  state.familiar = createFamiliar(7, 10);
}

function monsterAt(x, y) {
  return state.monsters.find((monster) => monster.x === x && monster.y === y) || null;
}

function itemAt(x, y) {
  return state.items.find((item) => item.x === x && item.y === y) || null;
}

function removeMonster(monster) {
  ensureSystems();
  combatSystem.removeMonster(monster);
}

function gainXp(amount) {
  ensureSystems();
  combatSystem.gainXp(amount);
}

function handleMonsterDefeat(monster) {
  ensureSystems();
  combatSystem.handleMonsterDefeat(monster);
}

function playerAttack(monster) {
  ensureSystems();
  combatSystem.playerAttack(monster);
}

function familiarAttack(monster) {
  ensureSystems();
  combatSystem.familiarAttack(monster);
}

function monsterAttack(monster, target, targetName) {
  ensureSystems();
  combatSystem.monsterAttack(monster, target, targetName);
}

function stepToward(from, target, blocked) {
  ensureSystems();
  return combatSystem.stepToward(from, target, blocked);
}

function familiarTurn() {
  ensureSystems();
  combatSystem.familiarTurn();
}

function monstersTurn() {
  ensureSystems();
  combatSystem.monstersTurn();
}

function pickItem(item) {
  if (!item?.item) return;
  const found = item.item;
  const foundLabel = getItemDisplayName(found);
  let claimed = false;

  if ((found.kind === "weapon" || found.kind === "shield") && !state.player.equipment[found.kind]) {
    claimed = equipItem(found, "ground");
    if (claimed) {
      logEvent(`You equip ${getItemDisplayName(found, true)}.`);
    }
  } else if (addInventoryItem(found, getItemDisplayName(found, true))) {
    claimed = true;
    logEvent(`You found ${foundLabel}.`);
    setStatus(`${foundLabel} added to your bag.`);
    playSfx("potion");
  }

  if (!claimed) {
    setStatus("Your bag is full.");
    return;
  }

  state.items = state.items.filter((entry) => entry !== item);
}

function triggerTrapAtPlayerPosition() {
  const trap = findTrapAt(state.player.x, state.player.y);
  if (!trap || !trap.armed) {
    return false;
  }

  trap.armed = false;
  trap.revealed = true;

  if (trap.type === "spike") {
    const damage = randomInt(6 + Math.floor(state.floor / 3), 10 + Math.floor(state.floor / 2));
    state.player.hp -= damage;
    logEvent(`A spike trap triggers for ${damage} damage.`);
    setStatus(`Spike trap! You take ${damage} damage.`);
    playSfx("hurt");
    return true;
  }

  if (trap.type === "snare") {
    state.player.skipTurns = Math.max(state.player.skipTurns, 1);
    logEvent("A snare trap tangles your feet.");
    setStatus("Snared. Your next action will be delayed.");
    playSfx("deny");
    return true;
  }

  if (trap.type === "warp") {
    const blocked = new Set([
      ...state.monsters.map((monster) => keyOf(monster.x, monster.y)),
      keyOf(state.familiar.x, state.familiar.y),
    ]);
    const options = collectReachableFloorCells(state.player.x, state.player.y).filter(
      (cell) => !blocked.has(keyOf(cell.x, cell.y)) && tileAt(cell.x, cell.y) === TILE_FLOOR,
    );
    if (options.length > 0) {
      const destination = pick(options);
      state.player.x = destination.x;
      state.player.y = destination.y;
    }
    logEvent("A warp trap throws you across the floor.");
    setStatus("Warp trap! You are displaced.");
    playSfx("stairs");
    return true;
  }

  return false;
}

function resolvePostMoveTile() {
  triggerTrapAtPlayerPosition();
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    return false;
  }

  const shrine = findShrineAt(state.player.x, state.player.y);
  if (shrine && !shrine.used) {
    activateShrine(shrine);
  }

  const item = itemAt(state.player.x, state.player.y);
  if (item) {
    pickItem(item);
  }

  if (tileAt(state.player.x, state.player.y) === TILE_STAIRS) {
    state.run.floorsCleared += 1;
    awardRunGold(8 + state.floor * 2, "the stairs");
    setStatus(`You climb to floor ${state.floor + 1}.`);
    logEvent(`You reached floor ${state.floor + 1}.`);
    playSfx("stairs");
    buildFloor(state.floor + 1);
    return true;
  }

  return false;
}

function tryMovePlayer(dx, dy) {
  const targetX = state.player.x + dx;
  const targetY = state.player.y + dy;

  if (!isWalkable(targetX, targetY)) {
    setStatus("A wall blocks your path.");
    return { acted: false, skipEnemy: true };
  }

  if (state.familiar.alive && state.familiar.x === targetX && state.familiar.y === targetY) {
    setStatus("Kewne is in the way.");
    return { acted: false, skipEnemy: true };
  }

  const defender = monsterAt(targetX, targetY);
  if (defender) {
    playerAttack(defender);
    return { acted: true, skipEnemy: false };
  }

  state.player.x = targetX;
  state.player.y = targetY;
  playSfx("move");

  if (resolvePostMoveTile()) {
    return { acted: true, skipEnemy: true };
  }

  return { acted: true, skipEnemy: false };
}

function actionWait() {
  setStatus("You hold your ground.");
  logEvent("You wait and watch the room.");
  return { acted: true, skipEnemy: false };
}

function findNearestMonsterInRange(range = 4) {
  let best = null;
  let bestDistance = Infinity;

  for (const monster of state.monsters) {
    const d = distance(state.player, monster);
    if (d > range || d >= bestDistance) continue;
    bestDistance = d;
    best = monster;
  }

  return best;
}

function useThrowableItem(item) {
  identifyItem(item, "The throw");
  const range = Math.max(1, Number(item.range) || 4);
  const target = findNearestMonsterInRange(range);
  const itemLabel = getItemDisplayName(item, true);

  if (!target) {
    logEvent(`You throw ${itemLabel}, but it hits nothing.`);
    setStatus(`${itemLabel} sails into darkness.`);
    playSfx("deny");
    return true;
  }

  const min = Number(item.damageMin) || 8;
  const max = Number(item.damageMax) || 14;
  const damage = randomInt(min, max) + Math.floor(state.player.level / 3);
  target.hp -= damage;
  logEvent(`${itemLabel} strikes ${target.name} for ${damage}.`);
  setStatus(`${target.name} is hit for ${damage}.`);
  playSfx("attack");

  const stunTurns = Number(item.stunTurns) || 0;
  if (stunTurns > 0 && target.hp > 0) {
    target.stunTurns = Math.max(target.stunTurns || 0, stunTurns);
    logEvent(`${target.name} is slowed by the impact.`);
  }

  if (target.hp <= 0) {
    handleMonsterDefeat(target);
  }

  return true;
}

function actionUsePotion() {
  const selected = getSelectedInventoryItem();
  if (!selected) {
    setStatus("Your bag is empty.");
    return { acted: false, skipEnemy: true };
  }

  if (selected.kind === "weapon" || selected.kind === "shield") {
    const removed = removeInventoryIndex(state.player.selectedItemIndex);
    if (!removed) {
      return { acted: false, skipEnemy: true };
    }
    if (!equipItem(removed)) {
      addInventoryItem(removed, getItemDisplayName(removed, true));
      return { acted: false, skipEnemy: true };
    }
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "escape") {
    const removed = removeInventoryIndex(state.player.selectedItemIndex);
    if (removed) {
      identifyItem(removed, "The chime");
    }
    logEvent("You ring the Windbell.");
    finishRun("escape");
    return { acted: false, skipEnemy: true };
  }

  if (selected.kind === "consumable") {
    if (state.player.hp >= state.player.maxHp) {
      setStatus("Your HP is already full.");
      return { acted: false, skipEnemy: true };
    }

    const removed = removeInventoryIndex(state.player.selectedItemIndex);
    if (!removed) {
      return { acted: false, skipEnemy: true };
    }
    identifyItem(removed, "The draught");
    const minHeal = selected.healMin + state.player.potionBoost;
    const maxHeal = selected.healMax + state.player.potionBoost * 2;
    const heal = randomInt(minHeal, maxHeal);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
    setStatus(`You recover ${heal} HP.`);
    logEvent(`You use ${getItemDisplayName(removed, true)} and recover ${heal} HP.`);
    playSfx("potion");
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "identify") {
    const targets = [
      ...state.player.inventory.filter((item) => item !== selected),
      ...Object.values(state.player.equipment).filter(Boolean),
    ];
    let count = 0;
    for (const item of targets) {
      if (identifyItem(item, "Insight orb")) {
        count += 1;
      }
    }
    if (count === 0) {
      setStatus("Nothing in your pack is unidentified.");
      return { acted: false, skipEnemy: true };
    }

    removeInventoryIndex(state.player.selectedItemIndex);
    identifyItem(selected, "The orb");
    logEvent(`Insight orb identifies ${count} item${count === 1 ? "" : "s"}.`);
    setStatus("Your inventory details become clear.");
    playSfx("level");
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "purify") {
    const cursedSlots = ["weapon", "shield"].filter((slot) => state.player.equipment[slot]?.cursed);
    if (cursedSlots.length === 0) {
      setStatus("No equipped cursed gear to purify.");
      return { acted: false, skipEnemy: true };
    }

    const slot = cursedSlots[0];
    const target = state.player.equipment[slot];
    removeInventoryIndex(state.player.selectedItemIndex);
    identifyItem(selected, "The orb");
    target.cursed = false;
    identifyItem(target, "Purifying light");
    logEvent(`${getItemDisplayName(target, true)} is freed from its curse.`);
    setStatus("The curse is lifted.");
    playSfx("upgrade");
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "augment") {
    const targetSlot = selected.target === "shield" ? "shield" : "weapon";
    const target = state.player.equipment[targetSlot];
    if (!target) {
      setStatus(`No ${targetSlot} equipped.`);
      return { acted: false, skipEnemy: true };
    }

    if (!upgradeEquippedItem(targetSlot, Number(selected.bonus) || 1, "Enhancer")) {
      setStatus(`${getItemDisplayName(target, true)} cannot be enhanced further.`);
      return { acted: false, skipEnemy: true };
    }

    removeInventoryIndex(state.player.selectedItemIndex);
    identifyItem(selected, "The polish");
    logEvent(`${getItemDisplayName(target, true)} is strengthened.`);
    setStatus(`${getItemDisplayName(target, true)} glows with new power.`);
    playSfx("upgrade");
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "throwable") {
    const removed = removeInventoryIndex(state.player.selectedItemIndex);
    if (!removed) {
      return { acted: false, skipEnemy: true };
    }
    useThrowableItem(removed);
    return { acted: true, skipEnemy: false };
  }

  if (selected.kind === "familiarRole") {
    const role = selected.role;
    if (!role) {
      return { acted: false, skipEnemy: true };
    }
    if (state.familiar.role === role) {
      setStatus(`Kewne is already in the ${getFamiliarRoleDef(role).title} role.`);
      return { acted: false, skipEnemy: true };
    }
    removeInventoryIndex(state.player.selectedItemIndex);
    identifyItem(selected, "The sigil");
    setFamiliarRole(role, getItemDisplayName(selected, true));
    return { acted: true, skipEnemy: false };
  }

  setStatus(`${getItemDisplayName(selected)} cannot be used right now.`);
  return { acted: false, skipEnemy: true };
}

function applyFloorPressure() {
  ensureSystems();
  runSystem.applyFloorPressure();
}

function consumeForcedSkipTurn() {
  ensureSystems();
  return runSystem.consumeForcedSkipTurn();
}

function finishRun(reason) {
  ensureSystems();
  runSystem.finishRun(reason);
}

function performAction(result) {
  ensureSystems();
  runSystem.performAction(result);
}

function processDirection(name) {
  if (state.mode !== "tower" || state.gameOver) return;
  if (consumeForcedSkipTurn()) return;
  if (!DIRECTIONS[name]) return;

  const { dx, dy } = DIRECTIONS[name];
  performAction(tryMovePlayer(dx, dy));
}

function processWait() {
  if (state.mode !== "tower" || state.gameOver) return;
  if (consumeForcedSkipTurn()) return;
  performAction(actionWait());
}

function processPotion() {
  if (state.mode !== "tower" || state.gameOver) return;
  if (consumeForcedSkipTurn()) return;
  performAction(actionUsePotion());
}

function processCycleItem() {
  if (state.mode !== "tower" || state.gameOver) return;
  cycleInventory(1);
}

function enterTower() {
  if (state.mode === "tower") return;

  state.mode = "tower";
  state.logs = [];
  state.status = "";
  state.gameOver = false;
  state.nextMonsterId = 1;
  state.nextItemId = 1;
  state.run = createRunState();
  setRunSeed(makeRunSeed());

  buildFloor(1, true);
  saveMeta();
  logEvent("You and Kewne enter the Moonlight Tower.");
  logEvent(`Run seed: ${state.run.seed}`);
  setStatus(`Floor 1: Find stairs and survive. Seed ${state.run.seed}.`);
  playSfx("start");
  syncUi();
}

function toggleRunState() {
  if (state.mode === "town") {
    enterTower();
  } else {
    finishRun("retreat");
  }
}

function getCompassHint() {
  if (state.mode !== "tower" || getUpgradeLevel("watchtower") === 0) {
    return "";
  }

  if (state.player.x === state.stairs.x && state.player.y === state.stairs.y) {
    return "Compass: stairs beneath you.";
  }

  const dx = state.stairs.x - state.player.x;
  const dy = state.stairs.y - state.player.y;

  const horizontal = dx > 0 ? "east" : dx < 0 ? "west" : "";
  const vertical = dy > 0 ? "south" : dy < 0 ? "north" : "";

  if (horizontal && vertical) {
    return `Compass: ${vertical}-${horizontal}.`;
  }

  if (horizontal) {
    return `Compass: ${horizontal}.`;
  }

  if (vertical) {
    return `Compass: ${vertical}.`;
  }

  return "";
}

function syncUpgradeUi() {
  for (const upgrade of UPGRADE_DEFS) {
    const level = getUpgradeLevel(upgrade.id);
    const slot = state.upgradeUi.get(upgrade.id);
    if (!slot) continue;

    slot.levelLine.textContent = `Lv ${level}/${upgrade.max}`;
    slot.effectLine.textContent = getUpgradeEffectText(upgrade.id, level);

    if (level >= upgrade.max) {
      slot.button.textContent = "Maxed";
      slot.button.disabled = true;
      continue;
    }

    const cost = getUpgradeCost(upgrade.id);
    slot.button.textContent = `Buy ${cost}g`;
    slot.button.disabled = state.mode !== "town" || state.meta.townGold < cost;
  }
}

function syncUi() {
  const towerMode = state.mode === "tower";
  const inAction = towerMode && !state.gameOver;
  const selectedItem = towerMode ? getSelectedInventoryItem() : null;
  const selectedLabel = selectedItem ? getItemDisplayName(selectedItem) : "None";

  dom.floorStat.textContent = towerMode ? String(state.floor) : "Town";
  dom.hpStat.textContent = towerMode ? `${state.player.hp}/${state.player.maxHp}` : "--";
  dom.xpStat.textContent = towerMode ? `${state.player.xp}/${state.player.nextXp}` : "--";
  dom.potionStat.textContent = towerMode
    ? `${state.player.inventory.length}/${state.player.inventorySize}`
    : "--";
  if (dom.seedStat) {
    dom.seedStat.textContent = towerMode ? state.run.seed.slice(-8) : "--";
  }
  if (dom.pressureStat) {
    dom.pressureStat.textContent = towerMode
      ? `${Math.max(0, state.run.collapseAt - state.run.floorTurns)}`
      : "--";
  }
  dom.familiarStat.textContent = towerMode
    ? state.familiar.alive
      ? `${state.familiar.hp}/${state.familiar.maxHp} Lv${state.familiar.level}`
      : "Down"
    : "--";

  dom.townGoldStat.textContent = String(state.meta.townGold);
  dom.runGoldStat.textContent = towerMode ? String(state.run.gold) : "0";
  dom.bestFloorStat.textContent = String(state.meta.bestFloor);

  dom.townSummary.textContent = state.townSummary;

  const compassHint = getCompassHint();
  const floorHint =
    towerMode && state.floorVariety ? `Variety: ${state.floorVariety.title}.` : "";
  const weapon = towerMode ? state.player.equipment.weapon : null;
  const shield = towerMode ? state.player.equipment.shield : null;
  const weaponLabel = weapon
    ? `${getItemDisplayName(weapon, true)} ${weapon.durability}/${weapon.maxDurability}`
    : "None";
  const shieldLabel = shield
    ? `${getItemDisplayName(shield, true)} ${shield.durability}/${shield.maxDurability}`
    : "None";
  const familiarHint = towerMode
    ? `Kewne: ${state.familiar.form} (${getFamiliarRoleDef(state.familiar.role).title}).`
    : "";
  const equipmentHint = towerMode
    ? `W:${weaponLabel} S:${shieldLabel}.`
    : "";
  const inventoryHint = towerMode ? `Selected: ${selectedLabel}.` : "";
  dom.statusLine.textContent = [state.status, compassHint, floorHint, inventoryHint, equipmentHint, familiarHint]
    .filter(Boolean)
    .join(" ");

  dom.logList.innerHTML = "";
  for (const message of [...state.logs].reverse()) {
    const li = document.createElement("li");
    li.textContent = message;
    dom.logList.append(li);
  }

  dom.runToggleBtn.textContent = towerMode ? "Retreat" : "Enter Tower";
  dom.retreatBtn.disabled = !towerMode;
  if (dom.copySeedBtn) {
    dom.copySeedBtn.disabled = !towerMode;
  }

  for (const button of dom.dirButtons) {
    button.disabled = !inAction;
  }
  dom.waitBtn.disabled = !inAction;
  dom.potionBtn.disabled = !inAction;
  if (dom.cycleBtn) {
    dom.cycleBtn.disabled = !inAction;
  }
  dom.controls.dataset.disabled = inAction ? "false" : "true";

  dom.audioBtn.textContent = state.audio.enabled ? "SFX: On" : "SFX: Off";
  dom.townCard.dataset.mode = state.mode;

  syncUpgradeUi();
}

function ensureAudioContext() {
  if (!state.audio.enabled) {
    return null;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    state.audio.enabled = false;
    return null;
  }

  if (!state.audio.context) {
    state.audio.context = new AudioContextCtor();
  }

  if (state.audio.context.state === "suspended") {
    state.audio.context.resume().catch(() => {});
  }

  return state.audio.context;
}

function primeAudio() {
  ensureAudioContext();
}

function playSfx(name) {
  if (!state.audio.enabled) return;

  const pattern = SFX_LIBRARY[name];
  if (!pattern || pattern.length === 0) return;

  const audioCtx = ensureAudioContext();
  if (!audioCtx) return;

  let startAt = audioCtx.currentTime + 0.005;

  for (const step of pattern) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = step.type;
    osc.frequency.setValueAtTime(step.freq, startAt);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(step.gain, startAt + Math.min(0.012, step.time * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + step.time);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startAt);
    osc.stop(startAt + step.time + 0.005);

    startAt += Math.max(0.012, step.time * 0.68);
  }
}

function toggleAudio() {
  state.audio.enabled = !state.audio.enabled;
  if (state.audio.enabled) {
    primeAudio();
    playSfx("start");
  }
  syncUi();
}

function loadSprites() {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      state.sprites.image = image;
      state.sprites.ready = true;
      resolve(true);
    };
    image.onerror = () => {
      state.sprites.ready = false;
      resolve(false);
    };
    image.src = "assets/sprites.svg";
  });
}

function resizeCanvas() {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  const cssWidth = dom.canvas.clientWidth;
  const cssHeight = dom.canvas.clientHeight;
  const targetWidth = Math.floor(cssWidth * dpr);
  const targetHeight = Math.floor(cssHeight * dpr);

  if (dom.canvas.width !== targetWidth || dom.canvas.height !== targetHeight) {
    dom.canvas.width = targetWidth;
    dom.canvas.height = targetHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  state.tileWidth = cssWidth / MAP_WIDTH;
  state.tileHeight = cssHeight / MAP_HEIGHT;
}

function drawSprite(frameX, frameY, dx, dy, dw, dh, alpha = 1) {
  if (!state.sprites.ready || !state.sprites.image) return false;

  ctx.save();
  if (alpha !== 1) {
    ctx.globalAlpha = alpha;
  }

  ctx.drawImage(
    state.sprites.image,
    frameX * SPRITE_SIZE,
    frameY * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    dx,
    dy,
    dw,
    dh,
  );
  ctx.restore();
  return true;
}

function drawTile(x, y, value, tick) {
  const px = x * state.tileWidth;
  const py = y * state.tileHeight;

  if (!state.sprites.ready) {
    if (value === TILE_WALL) {
      const shade = (x + y) % 2 === 0 ? "#0d1d29" : "#112431";
      ctx.fillStyle = shade;
      ctx.fillRect(px, py, state.tileWidth, state.tileHeight);
      return;
    }

    const floorShade = (x + y) % 2 === 0 ? "#1a394a" : "#173446";
    ctx.fillStyle = floorShade;
    ctx.fillRect(px, py, state.tileWidth, state.tileHeight);

    if (value === TILE_STAIRS) {
      const pulse = 0.42 + Math.sin(tick * 0.004) * 0.15;
      ctx.fillStyle = `rgba(250, 220, 108, ${pulse})`;
      ctx.fillRect(
        px + state.tileWidth * 0.18,
        py + state.tileHeight * 0.18,
        state.tileWidth * 0.64,
        state.tileHeight * 0.64,
      );
    }
    return;
  }

  if (value === TILE_WALL) {
    drawSprite(1, 0, px, py, state.tileWidth, state.tileHeight);
    return;
  }

  drawSprite(0, 0, px, py, state.tileWidth, state.tileHeight);

  if (value === TILE_STAIRS) {
    const pulse = 0.76 + Math.sin(tick * 0.006) * 0.2;
    drawSprite(2, 0, px, py, state.tileWidth, state.tileHeight, pulse);
  }
}

function drawHealthBar(entity, color) {
  const px = entity.x * state.tileWidth;
  const py = entity.y * state.tileHeight;
  const width = state.tileWidth * 0.74;
  const height = Math.max(2, state.tileHeight * 0.09);
  const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));

  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(px + state.tileWidth * 0.13, py + state.tileHeight * 0.08, width, height);

  ctx.fillStyle = color;
  ctx.fillRect(px + state.tileWidth * 0.13, py + state.tileHeight * 0.08, width * ratio, height);
}

function drawItems(tick) {
  for (const item of state.items) {
    const kind = item.item?.kind || "consumable";
    const wobble = Math.sin((tick + (item.x + item.y) * 95) * 0.01) * state.tileHeight * 0.05;
    const px = item.x * state.tileWidth;
    const py = item.y * state.tileHeight + wobble;

    if (!drawSprite(3, 0, px, py, state.tileWidth, state.tileHeight)) {
      if (kind === "escape") {
        ctx.fillStyle = "#9fd4ff";
      } else if (kind === "weapon" || kind === "shield") {
        ctx.fillStyle = "#ffd77d";
      } else if (kind === "throwable") {
        ctx.fillStyle = "#ff9666";
      } else if (kind === "augment") {
        ctx.fillStyle = "#ffe37a";
      } else if (kind === "familiarRole") {
        ctx.fillStyle = "#9cf0d8";
      } else if (kind === "identify" || kind === "purify") {
        ctx.fillStyle = "#9fcbff";
      } else {
        ctx.fillStyle = "#81f0ff";
      }
      ctx.fillRect(
        px + state.tileWidth * 0.36,
        py + state.tileHeight * 0.26,
        state.tileWidth * 0.28,
        state.tileHeight * 0.42,
      );
    }
  }
}

function drawShrines(tick) {
  if (state.mode !== "tower" || state.shrines.length === 0) return;

  for (const shrine of state.shrines) {
    const px = shrine.x * state.tileWidth;
    const py = shrine.y * state.tileHeight;
    const pulse = 0.35 + Math.sin((tick + (shrine.x + shrine.y) * 45) * 0.01) * 0.2;
    const alpha = shrine.used ? 0.28 : 0.5 + pulse * 0.3;

    if (shrine.type === "healing") {
      ctx.fillStyle = `rgba(126, 240, 172, ${alpha})`;
    } else if (shrine.type === "forge") {
      ctx.fillStyle = `rgba(255, 178, 102, ${alpha})`;
    } else if (shrine.type === "oracle") {
      ctx.fillStyle = `rgba(142, 186, 255, ${alpha})`;
    } else {
      ctx.fillStyle = `rgba(190, 164, 255, ${alpha})`;
    }

    ctx.fillRect(
      px + state.tileWidth * 0.2,
      py + state.tileHeight * 0.2,
      state.tileWidth * 0.6,
      state.tileHeight * 0.6,
    );

    ctx.strokeStyle = shrine.used ? "rgba(214, 225, 240, 0.4)" : "rgba(246, 252, 255, 0.88)";
    ctx.lineWidth = Math.max(1, state.tileWidth * 0.045);
    ctx.strokeRect(
      px + state.tileWidth * 0.26,
      py + state.tileHeight * 0.26,
      state.tileWidth * 0.48,
      state.tileHeight * 0.48,
    );
  }
}

function drawTraps(tick) {
  if (state.mode !== "tower") return;
  const revealHidden = getUpgradeLevel("watchtower") >= 3;

  for (const trap of state.traps) {
    if (!trap.revealed && !revealHidden) continue;
    const px = trap.x * state.tileWidth;
    const py = trap.y * state.tileHeight;
    const pulse = 0.35 + Math.sin((tick + (trap.x + trap.y) * 35) * 0.008) * 0.15;

    if (trap.type === "spike") {
      ctx.fillStyle = trap.revealed ? `rgba(255, 116, 116, ${0.5 + pulse})` : "rgba(255, 116, 116, 0.22)";
      ctx.fillRect(
        px + state.tileWidth * 0.22,
        py + state.tileHeight * 0.22,
        state.tileWidth * 0.56,
        state.tileHeight * 0.56,
      );
      continue;
    }

    if (trap.type === "snare") {
      ctx.strokeStyle = trap.revealed ? `rgba(255, 212, 106, ${0.55 + pulse})` : "rgba(255, 212, 106, 0.24)";
      ctx.lineWidth = Math.max(1, state.tileWidth * 0.05);
      ctx.beginPath();
      ctx.arc(
        px + state.tileWidth * 0.5,
        py + state.tileHeight * 0.5,
        state.tileWidth * 0.22,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      continue;
    }

    if (trap.type === "warp") {
      ctx.fillStyle = trap.revealed ? `rgba(127, 188, 255, ${0.45 + pulse})` : "rgba(127, 188, 255, 0.2)";
      ctx.beginPath();
      ctx.moveTo(px + state.tileWidth * 0.5, py + state.tileHeight * 0.2);
      ctx.lineTo(px + state.tileWidth * 0.82, py + state.tileHeight * 0.5);
      ctx.lineTo(px + state.tileWidth * 0.5, py + state.tileHeight * 0.8);
      ctx.lineTo(px + state.tileWidth * 0.18, py + state.tileHeight * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawEntities(tick) {
  if (!state.player || !state.familiar) return;

  const playerFrame = state.mode === "tower" ? Math.floor(tick / 240) % 2 : 1;
  const familiarFrame = state.familiar.alive ? Math.floor(tick / 300) % 2 : 3;

  for (const monster of state.monsters) {
    const bob = Math.sin((tick + monster.id * 77) * 0.01) * state.tileHeight * 0.05;
    const mx = monster.x * state.tileWidth;
    const my = monster.y * state.tileHeight + bob;

    if (!drawSprite(monster.variant, 3, mx, my, state.tileWidth, state.tileHeight)) {
      ctx.fillStyle = "#ff6f88";
      ctx.fillRect(
        mx + state.tileWidth * 0.2,
        my + state.tileHeight * 0.2,
        state.tileWidth * 0.6,
        state.tileHeight * 0.6,
      );
    }

    if (monster.elite) {
      ctx.strokeStyle = "rgba(255, 230, 126, 0.9)";
      ctx.lineWidth = Math.max(1, state.tileWidth * 0.06);
      ctx.strokeRect(
        mx + state.tileWidth * 0.15,
        my + state.tileHeight * 0.15,
        state.tileWidth * 0.7,
        state.tileHeight * 0.7,
      );
    }

    if ((monster.stunTurns || 0) > 0) {
      ctx.strokeStyle = "rgba(140, 205, 255, 0.85)";
      ctx.lineWidth = Math.max(1, state.tileWidth * 0.04);
      ctx.beginPath();
      ctx.arc(
        mx + state.tileWidth * 0.5,
        my + state.tileHeight * 0.5,
        state.tileWidth * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  if (state.familiar.alive) {
    const fx = state.familiar.x * state.tileWidth;
    const fy = state.familiar.y * state.tileHeight;
    if (!drawSprite(familiarFrame, 2, fx, fy, state.tileWidth, state.tileHeight)) {
      ctx.fillStyle = "#74ff95";
      ctx.fillRect(
        fx + state.tileWidth * 0.2,
        fy + state.tileHeight * 0.2,
        state.tileWidth * 0.6,
        state.tileHeight * 0.6,
      );
    }
  }

  const px = state.player.x * state.tileWidth;
  const py = state.player.y * state.tileHeight;
  if (!drawSprite(playerFrame, 1, px, py, state.tileWidth, state.tileHeight)) {
    ctx.fillStyle = "#62c8ff";
    ctx.fillRect(
      px + state.tileWidth * 0.18,
      py + state.tileHeight * 0.18,
      state.tileWidth * 0.64,
      state.tileHeight * 0.64,
    );
  }

  if (state.mode !== "tower") return;

  if (state.familiar.alive) {
    drawHealthBar(state.familiar, "#8fffa8");
  }

  for (const monster of state.monsters) {
    drawHealthBar(monster, "#ff7f92");
  }

  drawHealthBar(state.player, "#85d7ff");
}

function drawOverlay() {
  if (state.mode !== "town") return;

  ctx.fillStyle = "rgba(4, 11, 18, 0.55)";
  ctx.fillRect(0, 0, dom.canvas.clientWidth, dom.canvas.clientHeight);

  ctx.fillStyle = "#d4f2ff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 22px Aldrich";
  ctx.fillText("Monsbaiya Town", dom.canvas.clientWidth / 2, dom.canvas.clientHeight / 2 - 10);

  ctx.font = "500 12px Space Grotesk";
  ctx.fillText(
    "Spend gold on upgrades, then enter tower.",
    dom.canvas.clientWidth / 2,
    dom.canvas.clientHeight / 2 + 16,
  );
}

function render(tick = 0) {
  resizeCanvas();

  ctx.clearRect(0, 0, dom.canvas.clientWidth, dom.canvas.clientHeight);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      drawTile(x, y, state.map[y][x], tick);
    }
  }

  drawItems(tick);
  drawTraps(tick);
  drawShrines(tick);
  drawEntities(tick);
  drawOverlay();

  requestAnimationFrame(render);
}

function bindInputs() {
  const bindControl = (button, handler, prime = true) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (prime) {
        primeAudio();
      }
      handler();
    });
  };

  for (const button of dom.dirButtons) {
    bindControl(button, () => processDirection(button.dataset.dir));
  }

  bindControl(dom.waitBtn, processWait);

  bindControl(dom.potionBtn, processPotion);
  if (dom.cycleBtn) {
    bindControl(dom.cycleBtn, processCycleItem);
  }

  bindControl(dom.retreatBtn, () => finishRun("retreat"));

  bindControl(dom.runToggleBtn, toggleRunState);

  bindControl(dom.audioBtn, toggleAudio, false);

  if (dom.copySeedBtn) {
    bindControl(
      dom.copySeedBtn,
      () => {
        if (state.mode !== "tower" || !state.run.seed) {
          setStatus("No active run seed.");
          syncUi();
          return;
        }

        if (navigator.clipboard?.writeText) {
          navigator.clipboard
            .writeText(state.run.seed)
            .then(() => {
              setStatus(`Seed copied: ${state.run.seed}`);
              syncUi();
            })
            .catch(() => {
              setStatus(`Seed: ${state.run.seed}`);
              syncUi();
            });
          return;
        }

        setStatus(`Seed: ${state.run.seed}`);
        syncUi();
      },
      false,
    );
  }

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    const key = event.key.toLowerCase();
    const active = document.activeElement;
    const tag = active?.tagName;
    const isTextEntry =
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable;
    if (isTextEntry) {
      return;
    }

    const isInteractive = tag === "BUTTON" || tag === "A";
    if (isInteractive && (key === "enter" || key === " " || key === "spacebar")) {
      return;
    }

    let handled = false;

    if (key === "arrowup" || key === "w") {
      processDirection("up");
      handled = true;
    }

    if (key === "arrowdown" || key === "s") {
      processDirection("down");
      handled = true;
    }

    if (key === "arrowleft" || key === "a") {
      processDirection("left");
      handled = true;
    }

    if (key === "arrowright" || key === "d") {
      processDirection("right");
      handled = true;
    }

    if (key === " " || key === "spacebar") {
      processWait();
      handled = true;
    }

    if (key === "h") {
      processPotion();
      handled = true;
    }

    if ((key === "c" || key === "e" || key === "]") && state.mode === "tower") {
      processCycleItem();
      handled = true;
    }

    if ((key === "q" || key === "[") && state.mode === "tower") {
      cycleInventory(-1);
      handled = true;
    }

    if (key === "t") {
      toggleRunState();
      handled = true;
    }

    if (key === "enter" && state.mode === "town") {
      enterTower();
      handled = true;
    }

    if (key === "m") {
      toggleAudio();
      handled = true;
    }

    if (handled) {
      primeAudio();
      event.preventDefault();
    }
  });

  dom.canvas.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      touchStartPoint = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );

  dom.canvas.addEventListener(
    "touchend",
    (event) => {
      if (!touchStartPoint) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStartPoint.x;
      const dy = touch.clientY - touchStartPoint.y;
      touchStartPoint = null;

      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

      primeAudio();
      if (Math.abs(dx) > Math.abs(dy)) {
        processDirection(dx > 0 ? "right" : "left");
      } else {
        processDirection(dy > 0 ? "down" : "up");
      }
    },
    { passive: true },
  );

  window.addEventListener("resize", resizeCanvas);
}

function initializeGame() {
  ensureSystems();
  buildUpgradeUi();
  bindInputs();

  setTownScene();
  setStatus("Town mode: spend gold on upgrades, then enter tower.");
  logEvent("Welcome to Monsbaiya.");
  syncUi();

  loadSprites().then((loaded) => {
    if (!loaded) {
      logEvent("Sprite atlas failed to load. Using fallback renderer.");
      syncUi();
    }
  });

  requestAnimationFrame(render);
}

initializeGame();
