/*
 * Bootstrap loader for extracted PlanificadorComidas modules.
 * Include this file once from index.html, after the current inline script:
 * <script src="app-bootstrap.js"></script>
 */
(function bootstrapPlanificadorModules() {
  "use strict";

  const modules = [
    "data-store.js",
    "import-export.js",
    "stock-lifecycle.js",
    "meal-costing.js",
    "shopping-planner.js",
    "index-hardening.js",
    "pack-preview-fix.js"
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
    const box = document.getElementById("startup-error");
    const msg = document.getElementById("startup-error-message");
    if (box && msg) {
      box.style.display = "block";
      msg.textContent = `Error cargando modulos externos: ${error.message}`;
    }
  });
})();
