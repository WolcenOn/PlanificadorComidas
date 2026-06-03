(function bootstrapPlanificadorModules() {
  "use strict";

  const modules = [
    "data-store.js",
    "import-export.js",
    "stock-lifecycle.js",
    "expiry-date-guard.js",
    "meal-costing.js",
    "shopping-planner.js",
    "index-hardening.js",
    "pack-preview-fix.js",
    "shopping-ui-bridge.js"
  ];

  function alreadyLoaded(src) {
    return Array.from(document.scripts).some(script => (script.getAttribute("src") || "").endsWith(src));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (alreadyLoaded(src)) return resolve(src);
      const script = document.createElement("script");
      script.src = src;
      script.defer = false;
      script.onload = () => resolve(src);
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadAll() {
    for (const module of modules) {
      await loadScript(module);
    }
    document.dispatchEvent(new CustomEvent("planificador:modules-ready", { detail: { modules } }));
  }

  loadAll().catch(error => {
    console.error(error);
  });
})();
