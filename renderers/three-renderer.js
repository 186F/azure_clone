(function registerMoonlightThreeRenderer(globalScope) {
  "use strict";

  function createThreeRenderer(config) {
    const THREE = globalScope.THREE;
    if (!THREE) {
      throw new Error("THREE global is unavailable. Load Three.js before creating the 3D renderer.");
    }

    const { canvas, state, constants, helpers } = config;
    const { MAP_WIDTH, MAP_HEIGHT, TILE_WALL, TILE_STAIRS } = constants;
    const { getUpgradeLevel } = helpers;

    const createAssets =
      globalScope.MoonlightRenderers?.createThreeAssets ||
      (() => {
        throw new Error("Moonlight three-assets factory is unavailable.");
      });
    const assets = createAssets(THREE);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(Math.max(globalScope.devicePixelRatio || 1, 1), 1.5));
    if ("outputColorSpace" in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x091623, 6, 32);

    const camera = new THREE.OrthographicCamera(-12, 12, 9, -9, 0.1, 100);
    camera.position.set(10.5, 12, 10.5);
    camera.lookAt(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0x9ac6ff, 0.6);
    const keyLight = new THREE.DirectionalLight(0xbdd5ff, 0.9);
    keyLight.position.set(12, 18, 6);
    scene.add(ambientLight, keyLight);

    const root = new THREE.Group();
    scene.add(root);

    const tileGroup = new THREE.Group();
    const itemGroup = new THREE.Group();
    const trapGroup = new THREE.Group();
    const shrineGroup = new THREE.Group();
    const entityGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    root.add(tileGroup, itemGroup, trapGroup, shrineGroup, entityGroup, overlayGroup);

    const centerX = (MAP_WIDTH - 1) / 2;
    const centerY = (MAP_HEIGHT - 1) / 2;
    const tileCount = MAP_WIDTH * MAP_HEIGHT;
    const tileMeshes = [];

    function toWorld(x, y, height = 0) {
      return {
        x: x - centerX,
        y: height,
        z: y - centerY,
      };
    }

    function createHealthBar(fillMaterial) {
      const group = new THREE.Group();
      const bg = new THREE.Mesh(assets.geometries.hpBarBg, assets.materials.hpBg);
      const fill = new THREE.Mesh(assets.geometries.hpBarFill, fillMaterial);
      fill.position.z = 0.001;
      group.add(bg, fill);
      overlayGroup.add(group);
      return { group, fill };
    }

    function updateHealthBar(bar, entity, offsetY) {
      if (!entity || entity.maxHp <= 0 || entity.hp <= 0) {
        bar.group.visible = false;
        return;
      }

      const world = toWorld(entity.x, entity.y, offsetY);
      const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));
      bar.group.visible = true;
      bar.group.position.set(world.x, world.y, world.z);
      bar.group.quaternion.copy(camera.quaternion);
      bar.fill.scale.x = Math.max(0.001, ratio);
      bar.fill.position.x = -0.35 * (1 - ratio);
    }

    for (let i = 0; i < tileCount; i += 1) {
      const mesh = new THREE.Mesh(assets.geometries.tile, assets.materials.floor);
      mesh.matrixAutoUpdate = true;
      tileMeshes.push(mesh);
      tileGroup.add(mesh);
    }

    function createMonsterVisual() {
      const mesh = new THREE.Mesh(assets.geometries.entity, assets.getMonsterMaterial(0));
      const eliteRing = new THREE.Mesh(assets.geometries.eliteRing, assets.materials.eliteRing);
      eliteRing.rotation.x = Math.PI / 2;
      eliteRing.position.y = 0.36;
      eliteRing.visible = false;
      mesh.add(eliteRing);

      const stunRing = new THREE.Mesh(assets.geometries.stunRing, assets.materials.stunRing);
      stunRing.rotation.x = Math.PI / 2;
      stunRing.position.y = 0.54;
      stunRing.visible = false;
      mesh.add(stunRing);

      const hpBar = createHealthBar(assets.materials.hpMonster);
      entityGroup.add(mesh);
      return { mesh, eliteRing, stunRing, hpBar };
    }

    function createSimpleVisual(group, geometry, material) {
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
      return mesh;
    }

    const monsterPool = Array.from({ length: 26 }, () => createMonsterVisual());
    const itemPool = Array.from({ length: 26 }, () =>
      createSimpleVisual(itemGroup, assets.geometries.item, assets.getItemMaterial("consumable")),
    );
    const trapPool = Array.from({ length: 20 }, () =>
      createSimpleVisual(trapGroup, assets.geometries.trap, assets.getTrapMaterial("spike")),
    );
    const shrinePool = Array.from({ length: 8 }, () =>
      createSimpleVisual(shrineGroup, assets.geometries.shrine, assets.getShrineMaterial("healing")),
    );

    const playerMesh = new THREE.Mesh(assets.geometries.entity, assets.materials.player);
    playerMesh.scale.set(1, 1.15, 1);
    entityGroup.add(playerMesh);
    const playerHpBar = createHealthBar(assets.materials.hpPlayer);

    const familiarMesh = new THREE.Mesh(assets.geometries.familiar, assets.materials.familiar);
    familiarMesh.scale.set(1, 1.08, 1);
    entityGroup.add(familiarMesh);
    const familiarHpBar = createHealthBar(assets.materials.hpFamiliar);

    let activeVariety = "";

    function updateVarietyLook() {
      const varietyId = state.mode === "tower" ? state.floorVariety?.id || "standard" : "town";
      if (activeVariety === varietyId) return;
      activeVariety = varietyId;

      const look = assets.getVarietyLook(varietyId);
      renderer.setClearColor(look.clear, 1);
      scene.fog.color.setHex(look.clear);
      ambientLight.color.setHex(look.ambient);
      ambientLight.intensity = look.ambientIntensity;
      keyLight.color.setHex(look.key);
    }

    function resize() {
      const width = Math.max(1, Math.floor(canvas.clientWidth));
      const height = Math.max(1, Math.floor(canvas.clientHeight));
      const aspect = width / Math.max(1, height);
      const viewSize = Math.max(MAP_WIDTH, MAP_HEIGHT) * 0.68;

      camera.left = -viewSize * aspect;
      camera.right = viewSize * aspect;
      camera.top = viewSize;
      camera.bottom = -viewSize;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(Math.min(Math.max(globalScope.devicePixelRatio || 1, 1), 1.5));
      renderer.setSize(width, height, false);

      state.tileWidth = width / MAP_WIDTH;
      state.tileHeight = height / MAP_HEIGHT;
    }

    function updateTiles(tick) {
      const pulse = 0.7 + Math.sin(tick * 0.006) * 0.2;
      let index = 0;
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) {
          const mesh = tileMeshes[index];
          index += 1;
          const tile = state.map?.[y]?.[x] ?? TILE_WALL;
          const world = toWorld(x, y, tile === TILE_WALL ? 0.52 : 0);

          mesh.position.set(world.x, world.y, world.z);
          mesh.scale.set(1, tile === TILE_WALL ? 3.2 : 1, 1);

          if (tile === TILE_WALL) {
            mesh.material = assets.materials.wall;
          } else if (tile === TILE_STAIRS) {
            mesh.material = assets.materials.stairs;
            mesh.material.emissiveIntensity = pulse;
          } else {
            mesh.material = assets.materials.floor;
          }
        }
      }
    }

    function hidePool(pool) {
      for (const entry of pool) {
        if (entry.mesh) {
          entry.mesh.visible = false;
        } else {
          entry.visible = false;
        }
      }
    }

    function updateItems(tick) {
      hidePool(itemPool);
      for (let i = 0; i < state.items.length && i < itemPool.length; i += 1) {
        const entry = state.items[i];
        const mesh = itemPool[i];
        const kind = entry.item?.kind || "consumable";
        const bob = Math.sin((tick + (entry.x + entry.y) * 95) * 0.01) * 0.08;
        const world = toWorld(entry.x, entry.y, 0.23 + bob);
        mesh.visible = true;
        mesh.material = assets.getItemMaterial(kind);
        mesh.position.set(world.x, world.y, world.z);
        mesh.rotation.y = tick * 0.001 + i * 0.3;
      }
    }

    function updateTraps(tick) {
      hidePool(trapPool);
      const revealHidden = getUpgradeLevel("watchtower") >= 3;
      let count = 0;
      for (const trap of state.traps) {
        if (!trap.revealed && !revealHidden) continue;
        if (count >= trapPool.length) break;

        const mesh = trapPool[count];
        count += 1;
        const world = toWorld(trap.x, trap.y, 0.04);
        const pulse = 0.42 + Math.sin((tick + (trap.x + trap.y) * 35) * 0.008) * 0.18;
        mesh.visible = true;
        mesh.material = assets.getTrapMaterial(trap.type);
        mesh.material.opacity = trap.revealed ? 0.78 : 0.26;
        mesh.position.set(world.x, world.y, world.z);
        mesh.rotation.y = tick * 0.002;
        mesh.scale.setScalar(1 + pulse * 0.2);
      }
    }

    function updateShrines(tick) {
      hidePool(shrinePool);
      if (state.mode !== "tower") return;

      for (let i = 0; i < state.shrines.length && i < shrinePool.length; i += 1) {
        const shrine = state.shrines[i];
        const mesh = shrinePool[i];
        const world = toWorld(shrine.x, shrine.y, 0.24);
        const pulse = 0.42 + Math.sin((tick + (shrine.x + shrine.y) * 45) * 0.01) * 0.2;
        mesh.visible = true;
        mesh.material = assets.getShrineMaterial(shrine.type);
        mesh.material.opacity = shrine.used ? 0.34 : 0.86;
        mesh.material.transparent = true;
        mesh.position.set(world.x, world.y, world.z);
        mesh.rotation.y = tick * 0.0018 + i * 0.2;
        mesh.scale.setScalar(shrine.used ? 0.86 : 1 + pulse * 0.12);
      }
    }

    function updateMonsters(tick) {
      for (const view of monsterPool) {
        view.mesh.visible = false;
        view.eliteRing.visible = false;
        view.stunRing.visible = false;
        view.hpBar.group.visible = false;
      }

      for (let i = 0; i < state.monsters.length && i < monsterPool.length; i += 1) {
        const monster = state.monsters[i];
        const view = monsterPool[i];
        const bob = Math.sin((tick + monster.id * 77) * 0.01) * 0.07;
        const world = toWorld(monster.x, monster.y, 0.34 + bob);
        view.mesh.visible = true;
        view.mesh.material = assets.getMonsterMaterial(monster.variant);
        view.mesh.position.set(world.x, world.y, world.z);
        view.mesh.scale.set(monster.elite ? 1.14 : 1, monster.elite ? 1.2 : 1.05, monster.elite ? 1.14 : 1);

        view.eliteRing.visible = Boolean(monster.elite);
        view.stunRing.visible = (monster.stunTurns || 0) > 0;
        view.stunRing.rotation.z = tick * 0.002;

        updateHealthBar(view.hpBar, monster, 0.88 + bob);
      }
    }

    function updateHeroes(tick) {
      if (!state.player || !state.familiar) {
        playerMesh.visible = false;
        familiarMesh.visible = false;
        playerHpBar.group.visible = false;
        familiarHpBar.group.visible = false;
        return;
      }

      const playerPulse = state.mode === "tower" ? Math.sin(tick * 0.01) * 0.02 : 0;
      const playerWorld = toWorld(state.player.x, state.player.y, 0.34 + playerPulse);
      playerMesh.visible = true;
      playerMesh.position.set(playerWorld.x, playerWorld.y, playerWorld.z);
      updateHealthBar(playerHpBar, state.mode === "tower" ? state.player : null, 0.9 + playerPulse);

      if (state.familiar.alive) {
        const familiarPulse = Math.sin(tick * 0.008 + 1.2) * 0.03;
        const familiarWorld = toWorld(state.familiar.x, state.familiar.y, 0.3 + familiarPulse);
        familiarMesh.visible = true;
        familiarMesh.position.set(familiarWorld.x, familiarWorld.y, familiarWorld.z);
        updateHealthBar(familiarHpBar, state.mode === "tower" ? state.familiar : null, 0.82 + familiarPulse);
      } else {
        familiarMesh.visible = false;
        familiarHpBar.group.visible = false;
      }
    }

    function render(tick = 0) {
      resize();
      updateVarietyLook();
      updateTiles(tick);
      updateItems(tick);
      updateTraps(tick);
      updateShrines(tick);
      updateMonsters(tick);
      updateHeroes(tick);
      renderer.render(scene, camera);
    }

    function init() {
      resize();
      return Promise.resolve(true);
    }

    function destroy() {
      for (const bar of [playerHpBar, familiarHpBar, ...monsterPool.map((entry) => entry.hpBar)]) {
        overlayGroup.remove(bar.group);
      }
      renderer.dispose();
      assets.dispose();
    }

    return {
      mode: "3d",
      init,
      resize,
      render,
      destroy,
    };
  }

  const api = {
    createThreeRenderer,
  };

  globalScope.MoonlightRenderers = Object.assign({}, globalScope.MoonlightRenderers || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
