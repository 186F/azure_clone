(function registerMoonlightCore(globalScope) {
  "use strict";

  function fnv1aHash(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createSeededRandom(seedString) {
    let state32 = fnv1aHash(seedString) || 1;
    return () => {
      state32 += 0x6d2b79f5;
      let t = state32;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRunSeed(now = Date.now(), perfNow = now) {
    const token = Math.floor(perfNow).toString(36).padStart(4, "0");
    const timeToken = Math.floor(now).toString(36);
    return `${timeToken}-${token}`.slice(-14);
  }

  function weightedPick(entries, randomFn = Math.random) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) {
      return entries[0] || null;
    }

    let roll = randomFn() * total;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) {
        return entry;
      }
    }

    return entries[entries.length - 1] || null;
  }

  function createRunState(collapseAt = 62) {
    return {
      gold: 0,
      kills: 0,
      floorsCleared: 0,
      floorTurns: 0,
      collapseAt,
      warnings: new Set(),
      seed: "",
    };
  }

  function calculateCollapseTurn(base, step, min, floor, watchtowerLevel) {
    const watchtowerBuffer = Math.floor(watchtowerLevel / 2);
    return Math.max(min, base - floor * step + watchtowerBuffer);
  }

  const api = {
    fnv1aHash,
    createSeededRandom,
    makeRunSeed,
    weightedPick,
    createRunState,
    calculateCollapseTurn,
  };

  globalScope.MoonlightCore = Object.assign({}, globalScope.MoonlightCore || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
