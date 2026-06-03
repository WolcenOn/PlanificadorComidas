/*
 * Robust remote pack preview for PlanificadorComidas.
 * Load after index.html main script. It intercepts clicks on "Vista previa"
 * buttons and builds its own pack list from packs/index.json or the GitHub API.
 */
(function attachPackPreviewFix(global) {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanRemotePath(path) {
    return String(path || "packs/recetas").trim().replace(/^\/+|\/+$/g, "") || "packs/recetas";
  }

  function inferGitHubRepoFromLocation() {
    const host = window.location.hostname;
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (!host.endsWith("github.io")) return { owner: "", repo: "" };
    const owner = host.replace(".github.io", "");
    const repo = parts[0] || `${owner}.github.io`;
    return { owner, repo };
  }

  function encodePath(path) {
    return cleanRemotePath(path).split("/").map(encodeURIComponent).join("/");
  }

  function resolvePackUrl(url, basePath) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\//i.test(raw)) {
      return raw
        .replace("https://github.com/", "https://raw.githubusercontent.com/")
        .replace("/blob/", "/");
    }

    if (/^https?:\/\//i.test(raw)) return raw;

    const clean = raw.replace(/^\.\//, "").replace(/^\/+/, "");
    if (clean.includes("/")) return encodePath(clean);
    return `${encodePath(basePath)}/${encodeURIComponent(clean)}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} al leer ${url}`);
    try {
      return await response.json();
    } catch {
      throw new Error(`El archivo no contiene JSON valido: ${url}`);
    }
  }

  function getConfig() {
    const inferred = inferGitHubRepoFromLocation();
    return {
      path: cleanRemotePath(byId("remotePacksPath")?.value || localStorage.getItem("remotePacksPath") || "packs/recetas"),
      owner: byId("remoteRepoOwner")?.value.trim() || localStorage.getItem("remoteRepoOwner") || inferred.owner,
      repo: byId("remoteRepoName")?.value.trim() || localStorage.getItem("remoteRepoName") || inferred.repo,
      branch: byId("remoteRepoBranch")?.value.trim() || localStorage.getItem("remoteRepoBranch") || "main"
    };
  }

  function normalizeIndexItem(item, config) {
    if (typeof item === "string") {
      return {
        name: item.replace(/\.json$/i, ""),
        description: "Archivo JSON del indice local",
        filename: item,
        url: resolvePackUrl(item, config.path)
      };
    }

    if (!item || typeof item !== "object") return null;
    const filename = item.file || item.filename || item.path || item.name || "pack.json";
    return {
      name: item.name || item.title || String(filename).replace(/\.json$/i, "") || "Pack",
      description: item.description || item.descripcion || "Archivo JSON del indice local",
      filename,
      url: resolvePackUrl(item.url || filename, config.path)
    };
  }

  async function loadPackList() {
    const config = getConfig();

    try {
      const index = await fetchJson("packs/index.json");
      const files = Array.isArray(index) ? index : (index.files || index.packs || index.recipes || []);
      const packs = files.map(item => normalizeIndexItem(item, config)).filter(item => item && item.url && item.url.toLowerCase().includes(".json"));
      if (packs.length) return packs;
    } catch {
      // Fall back to GitHub API below.
    }

    if (!config.owner || !config.repo) throw new Error("Faltan usuario o repositorio para buscar packs.");

    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodePath(config.path)}?ref=${encodeURIComponent(config.branch)}`;
    const contents = await fetchJson(apiUrl);
    return (Array.isArray(contents) ? contents : [])
      .filter(item => item && item.type === "file" && String(item.name || "").toLowerCase().endsWith(".json"))
      .map(item => ({
        name: String(item.name).replace(/\.json$/i, ""),
        description: "Archivo JSON del repositorio",
        filename: item.name,
        url: item.download_url || resolvePackUrl(item.name, config.path)
      }));
  }

  function extractDishes(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.dishes)) return data.dishes;
    if (data && Array.isArray(data.platos)) return data.platos;
    if (data && Array.isArray(data.recipes)) return data.recipes;
    if (data && Array.isArray(data.recetas)) return data.recetas;
    return [];
  }

  function dishIngredientsCount(dish) {
    const rows = dish && (dish.ingredients || dish.ingredientes || dish.recipe || dish.receta);
    return Array.isArray(rows) ? rows.length : 0;
  }

  function buildPreviewHtml(pack, data) {
    const dishes = extractDishes(data);
    const title = data.name || data.nombre || data.title || pack.name || "Pack";
    const description = data.description || data.descripcion || pack.description || "Sin descripcion";
    const sample = dishes.slice(0, 8);

    return `
      <div class="pack-preview-overlay" role="dialog" aria-modal="true">
        <div class="pack-preview-modal">
          <div class="item-top">
            <div>
              <h2>${escapeHtml(title)}</h2>
              <p class="muted">${escapeHtml(description)}</p>
              <p><strong>${dishes.length}</strong> plato/s encontrados · <span class="muted">${escapeHtml(pack.filename || pack.url)}</span></p>
            </div>
            <button type="button" class="ghost" data-pack-preview-close>Cerrar</button>
          </div>
          <div class="list">
            ${sample.length ? sample.map(dish => `
              <div class="item">
                <div class="item-top">
                  <div>
                    <div class="item-name">${escapeHtml(dish.name || dish.nombre || "Plato")}</div>
                    <div class="muted">${escapeHtml(dish.category || dish.categoria || "Sin categoria")} · ${escapeHtml(dish.prepTime || dish.tiempo || "Tiempo no indicado")} · ${escapeHtml(dish.difficulty || dish.dificultad || "Dificultad no indicada")}</div>
                    <div class="muted">${dishIngredientsCount(dish)} ingrediente/s</div>
                  </div>
                  <span class="badge favorite">Vista previa</span>
                </div>
                ${dish.notes || dish.notas ? `<p class="muted">${escapeHtml(String(dish.notes || dish.notas).slice(0, 260))}${String(dish.notes || dish.notas).length > 260 ? "..." : ""}</p>` : ""}
              </div>`).join("") : '<div class="empty">No se han encontrado platos en este pack.</div>'}
          </div>
        </div>
      </div>`;
  }

  function ensureStyles() {
    if (document.getElementById("packPreviewFixStyles")) return;
    const style = document.createElement("style");
    style.id = "packPreviewFixStyles";
    style.textContent = `
      .pack-preview-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(8, 31, 35, 0.5);
        padding: 18px;
        overflow: auto;
      }
      .pack-preview-modal {
        width: min(820px, 100%);
        margin: 40px auto;
        background: white;
        border: 1px solid var(--border, #cfe7df);
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
      }
      .pack-preview-modal h2 { margin: 0 0 8px; }
    `;
    document.head.appendChild(style);
  }

  function closePreview() {
    document.querySelectorAll(".pack-preview-overlay").forEach(node => node.remove());
  }

  async function previewPackByIndex(index) {
    ensureStyles();
    const packs = await loadPackList();
    const pack = packs[Number(index)];
    if (!pack) throw new Error("No encuentro ese pack en la lista cargada.");
    const data = await fetchJson(pack.url);
    closePreview();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = buildPreviewHtml(pack, data);
    document.body.appendChild(wrapper.firstElementChild);
  }

  function getPreviewIndexFromButton(button) {
    const onclick = button.getAttribute("onclick") || "";
    const match = onclick.match(/previewRemotePack\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  function installPreviewPatch() {
    document.addEventListener("click", event => {
      const close = event.target.closest("[data-pack-preview-close]");
      if (close) {
        closePreview();
        return;
      }

      const button = event.target.closest('button[onclick^="previewRemotePack"]');
      if (!button) return;
      const index = getPreviewIndexFromButton(button);
      if (index === null) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Cargando...";

      previewPackByIndex(index)
        .catch(error => alert(`No se pudo mostrar la vista previa: ${error.message}`))
        .finally(() => {
          button.disabled = false;
          button.textContent = originalText;
        });
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installPreviewPatch);
  else installPreviewPatch();

  global.PackPreviewFix = { loadPackList, previewPackByIndex };
})(typeof window !== "undefined" ? window : globalThis);
