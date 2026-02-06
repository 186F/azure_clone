(function registerMoonlightRendererInterface(globalScope) {
  "use strict";

  const RENDERER_STORAGE_KEY = "moonlight_tower_renderer_mode_v1";

  function normalizeRendererMode(value) {
    const token = String(value || "").trim().toLowerCase();
    if (token === "3d" || token === "three" || token === "threejs" || token === "webgl") {
      return "3d";
    }
    return "2d";
  }

  function readRendererModeFromQuery(searchText = "") {
    try {
      const params = new URLSearchParams(String(searchText || ""));
      if (!params.has("renderer")) return "";
      return normalizeRendererMode(params.get("renderer"));
    } catch (_error) {
      return "";
    }
  }

  const api = {
    RENDERER_STORAGE_KEY,
    normalizeRendererMode,
    readRendererModeFromQuery,
  };

  globalScope.MoonlightRenderers = Object.assign({}, globalScope.MoonlightRenderers || {}, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
