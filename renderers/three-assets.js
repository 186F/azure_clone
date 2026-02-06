(function registerMoonlightThreeAssets(globalScope) {
  "use strict";

  function createThreeAssets(THREE) {
    const geometries = {
      tile: new THREE.BoxGeometry(0.96, 0.18, 0.96),
      entity: new THREE.SphereGeometry(0.32, 16, 16),
      familiar: new THREE.SphereGeometry(0.3, 16, 16),
      item: new THREE.BoxGeometry(0.28, 0.28, 0.28),
      trap: new THREE.CylinderGeometry(0.26, 0.26, 0.04, 16),
      shrine: new THREE.OctahedronGeometry(0.3, 0),
      eliteRing: new THREE.TorusGeometry(0.34, 0.04, 10, 24),
      stunRing: new THREE.TorusGeometry(0.28, 0.025, 10, 20),
      hpBarBg: new THREE.PlaneGeometry(0.74, 0.1),
      hpBarFill: new THREE.PlaneGeometry(0.7, 0.07),
    };

    const materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0x1a3d4f, roughness: 0.92, metalness: 0.04 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x102232, roughness: 0.98, metalness: 0.02 }),
      stairs: new THREE.MeshStandardMaterial({
        color: 0xf2d078,
        emissive: 0x8a6b20,
        emissiveIntensity: 0.35,
        roughness: 0.55,
      }),
      player: new THREE.MeshStandardMaterial({ color: 0x62c8ff, roughness: 0.35, metalness: 0.06 }),
      familiar: new THREE.MeshStandardMaterial({ color: 0x79f3ad, roughness: 0.3, metalness: 0.04 }),
      eliteRing: new THREE.MeshBasicMaterial({ color: 0xffe57a }),
      stunRing: new THREE.MeshBasicMaterial({ color: 0x8cc5ff }),
      hpBg: new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.64,
        side: THREE.DoubleSide,
      }),
      hpPlayer: new THREE.MeshBasicMaterial({ color: 0x85d7ff, side: THREE.DoubleSide }),
      hpFamiliar: new THREE.MeshBasicMaterial({ color: 0x8fffa8, side: THREE.DoubleSide }),
      hpMonster: new THREE.MeshBasicMaterial({ color: 0xff7f92, side: THREE.DoubleSide }),
    };

    const monsterMaterials = [
      new THREE.MeshStandardMaterial({ color: 0xff7590, roughness: 0.42, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xff9f66, roughness: 0.42, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xdd7bff, roughness: 0.42, metalness: 0.04 }),
      new THREE.MeshStandardMaterial({ color: 0xff8bc4, roughness: 0.42, metalness: 0.04 }),
    ];

    const itemMaterialByKind = {
      consumable: new THREE.MeshStandardMaterial({ color: 0x81f0ff, roughness: 0.3, metalness: 0.15 }),
      escape: new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.26, metalness: 0.22 }),
      weapon: new THREE.MeshStandardMaterial({ color: 0xffd77d, roughness: 0.3, metalness: 0.22 }),
      shield: new THREE.MeshStandardMaterial({ color: 0xffd77d, roughness: 0.3, metalness: 0.24 }),
      throwable: new THREE.MeshStandardMaterial({ color: 0xff9666, roughness: 0.3, metalness: 0.16 }),
      augment: new THREE.MeshStandardMaterial({ color: 0xffe37a, roughness: 0.3, metalness: 0.18 }),
      familiarRole: new THREE.MeshStandardMaterial({ color: 0x9cf0d8, roughness: 0.3, metalness: 0.12 }),
      identify: new THREE.MeshStandardMaterial({ color: 0x9fcbff, roughness: 0.32, metalness: 0.16 }),
      purify: new THREE.MeshStandardMaterial({ color: 0x9fcbff, roughness: 0.32, metalness: 0.16 }),
    };
    const itemFallbackMaterial = itemMaterialByKind.consumable;

    const trapMaterialByType = {
      spike: new THREE.MeshBasicMaterial({ color: 0xff7474, transparent: true, opacity: 0.8 }),
      snare: new THREE.MeshBasicMaterial({ color: 0xffd46a, transparent: true, opacity: 0.8 }),
      warp: new THREE.MeshBasicMaterial({ color: 0x7fbcff, transparent: true, opacity: 0.8 }),
    };
    const trapFallbackMaterial = trapMaterialByType.spike;

    const shrineMaterialByType = {
      healing: new THREE.MeshStandardMaterial({
        color: 0x7ef0ac,
        emissive: 0x1c5f3b,
        emissiveIntensity: 0.3,
      }),
      forge: new THREE.MeshStandardMaterial({
        color: 0xffb266,
        emissive: 0x71411f,
        emissiveIntensity: 0.35,
      }),
      oracle: new THREE.MeshStandardMaterial({
        color: 0x8ebaff,
        emissive: 0x223f72,
        emissiveIntensity: 0.34,
      }),
      bond: new THREE.MeshStandardMaterial({
        color: 0xbea4ff,
        emissive: 0x402f74,
        emissiveIntensity: 0.34,
      }),
    };
    const shrineFallbackMaterial = shrineMaterialByType.healing;

    const varietyLooks = {
      standard: { clear: 0x091623, ambient: 0x9ac6ff, ambientIntensity: 0.6, key: 0xbdd5ff },
      hunting: { clear: 0x1b1113, ambient: 0xffc0a3, ambientIntensity: 0.58, key: 0xffd0a5 },
      vault: { clear: 0x162117, ambient: 0xc7ffd8, ambientIntensity: 0.62, key: 0xd6ffd2 },
      gauntlet: { clear: 0x20150d, ambient: 0xffd1a1, ambientIntensity: 0.56, key: 0xffc38e },
      sanctum: { clear: 0x12162b, ambient: 0xc6c2ff, ambientIntensity: 0.63, key: 0xbcc8ff },
      town: { clear: 0x0f1f2d, ambient: 0xc1e8ff, ambientIntensity: 0.66, key: 0xd7f0ff },
    };

    function getMonsterMaterial(variant) {
      const index = Math.max(0, Number(variant) || 0) % monsterMaterials.length;
      return monsterMaterials[index];
    }

    function getItemMaterial(kind) {
      return itemMaterialByKind[kind] || itemFallbackMaterial;
    }

    function getTrapMaterial(type) {
      return trapMaterialByType[type] || trapFallbackMaterial;
    }

    function getShrineMaterial(type) {
      return shrineMaterialByType[type] || shrineFallbackMaterial;
    }

    function getVarietyLook(id) {
      return varietyLooks[id] || varietyLooks.standard;
    }

    function dispose() {
      const allGeometries = Object.values(geometries);
      for (const geometry of allGeometries) {
        geometry.dispose();
      }

      const allMaterials = [
        ...Object.values(materials),
        ...monsterMaterials,
        ...Object.values(itemMaterialByKind),
        ...Object.values(trapMaterialByType),
        ...Object.values(shrineMaterialByType),
      ];
      for (const material of allMaterials) {
        material.dispose();
      }
    }

    return {
      geometries,
      materials,
      getMonsterMaterial,
      getItemMaterial,
      getTrapMaterial,
      getShrineMaterial,
      getVarietyLook,
      dispose,
    };
  }

  const api = {
    createThreeAssets,
  };

  globalScope.MoonlightRenderers = Object.assign({}, globalScope.MoonlightRenderers || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
