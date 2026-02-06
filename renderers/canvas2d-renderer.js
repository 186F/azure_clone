(function registerMoonlightCanvasRenderer(globalScope) {
  "use strict";

  function createCanvas2DRenderer(config) {
    const { canvas, state, constants, helpers } = config;
    const { MAP_WIDTH, MAP_HEIGHT, SPRITE_SIZE, TILE_WALL, TILE_STAIRS } = constants;
    const { getUpgradeLevel } = helpers;
    const ctx = canvas.getContext("2d");

    let spriteImage = null;
    let spriteReady = false;

    function loadSprites() {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          spriteImage = image;
          spriteReady = true;
          resolve(true);
        };
        image.onerror = () => {
          spriteImage = null;
          spriteReady = false;
          resolve(false);
        };
        image.src = "assets/sprites.svg";
      });
    }

    function resize() {
      const dpr = Math.min(Math.max(globalScope.devicePixelRatio || 1, 1), 2);
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const targetWidth = Math.floor(cssWidth * dpr);
      const targetHeight = Math.floor(cssHeight * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      state.tileWidth = cssWidth / MAP_WIDTH;
      state.tileHeight = cssHeight / MAP_HEIGHT;
    }

    function drawSprite(frameX, frameY, dx, dy, dw, dh, alpha = 1) {
      if (!spriteReady || !spriteImage) return false;

      ctx.save();
      if (alpha !== 1) {
        ctx.globalAlpha = alpha;
      }

      ctx.drawImage(
        spriteImage,
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

      if (!spriteReady) {
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
      for (const entry of state.items) {
        const kind = entry.item?.kind || "consumable";
        const wobble = Math.sin((tick + (entry.x + entry.y) * 95) * 0.01) * state.tileHeight * 0.05;
        const px = entry.x * state.tileWidth;
        const py = entry.y * state.tileHeight + wobble;

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
          ctx.fillStyle = trap.revealed
            ? `rgba(255, 116, 116, ${0.5 + pulse})`
            : "rgba(255, 116, 116, 0.22)";
          ctx.fillRect(
            px + state.tileWidth * 0.22,
            py + state.tileHeight * 0.22,
            state.tileWidth * 0.56,
            state.tileHeight * 0.56,
          );
          continue;
        }

        if (trap.type === "snare") {
          ctx.strokeStyle = trap.revealed
            ? `rgba(255, 212, 106, ${0.55 + pulse})`
            : "rgba(255, 212, 106, 0.24)";
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
          ctx.fillStyle = trap.revealed
            ? `rgba(127, 188, 255, ${0.45 + pulse})`
            : "rgba(127, 188, 255, 0.2)";
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
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      ctx.fillStyle = "#d4f2ff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 22px Aldrich";
      ctx.fillText("Monsbaiya Town", canvas.clientWidth / 2, canvas.clientHeight / 2 - 10);

      ctx.font = "500 12px Space Grotesk";
      ctx.fillText(
        "Spend gold on upgrades, then enter tower.",
        canvas.clientWidth / 2,
        canvas.clientHeight / 2 + 16,
      );
    }

    function render(tick = 0) {
      resize();
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

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
    }

    function destroy() {
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }

    return {
      mode: "2d",
      init: loadSprites,
      resize,
      render,
      destroy,
    };
  }

  const api = {
    createCanvas2DRenderer,
  };

  globalScope.MoonlightRenderers = Object.assign({}, globalScope.MoonlightRenderers || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
