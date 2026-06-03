(function bootstrapPlanificadorModules() {
  "use strict";

  const criticalModules = [
    "ui-safety-net.js",
    "data-store.js",
    "stock-lifecycle.js"
  ];

  const optionalModules = [
    "import-export.js",
    "expiry-date-guard.js",
    "meal-costing.js",
    "shopping-planner.js",
    "index-hardening.js",
    "lifecycle-form-bridge.js",
    "pack-preview-fix.js",
    "shopping-ui-bridge.js"
  ];

  function alreadyLoaded(src) {
    return Array.from(document.scripts).some(script => (script.getAttribute("src") || "").endsWith(src));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (alreadyLoaded(src)) return resolve({ src, ok: true, skipped: true });
      const script = document.createElement("script");
      script.src = `${src}?v=20260603-2`;
      script.defer = false;
      script.onload = () => resolve({ src, ok: true });
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadCritical() {
    for (const module of criticalModules) {
      await loadScript(module);
    }
  }

  async function loadOptional() {
    const results = [];
    for (const module of optionalModules) {
      try {
        results.push(await loadScript(module));
      } catch (error) {
        console.warn(error);
        results.push({ src: module, ok: false, error: error.message });
      }
    }
    return results;
  }

  async function loadAll() {
    await loadCritical();
    const optionalResults = await loadOptional();
    const modules = [...criticalModules, ...optionalModules];
    document.dispatchEvent(new CustomEvent("planificador:modules-ready", { detail: { modules, optionalResults } }));
    if (window.UiSafetyNet && typeof window.UiSafetyNet.install === "function") window.UiSafetyNet.install();
  }

  loadAll().catch(error => {
    console.error(error);
    const box = document.getElementById("startup-error");
    const msg = document.getElementById("startup-error-message");
    if (box && msg) {
      box.style.display = "block";
      msg.textContent = `Error cargando modulos basicos: ${error.message}`;
    }
  });
})();
