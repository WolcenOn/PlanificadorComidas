/*
 * Unit normalization bridge for PlanificadorComidas.
 * Adds unitWeightG for ingredients measured by unit/piece so impact calculations can convert units to kg.
 */
(function attachUnitNormalization(global) {
  "use strict";

  let pendingIngredientUnitWeight = null;
  let storagePatched = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  function isUnitBased(unit) {
    const clean = String(unit || "").trim().toLowerCase();
    return ["ud", "uds", "u", "unidad", "unidades", "pieza", "piezas"].includes(clean);
  }

  function insertAfter(reference, node) {
    if (!reference || !reference.parentElement || !node) return false;
    reference.parentElement.insertBefore(node, reference.nextSibling);
    return true;
  }

  function ensureUnitWeightField() {
    if (byId("ingredientUnitWeightG")) return;
    const unitInput = byId("ingredientUnit");
    if (!unitInput) return;
    const wrapper = document.createElement("div");
    wrapper.id = "ingredientUnitWeightGWrapper";
    wrapper.innerHTML = `
      <label for="ingredientUnitWeightG">Peso por unidad (g)</label>
      <input id="ingredientUnitWeightG" type="number" min="0" step="1" placeholder="Ej. 180" />
      <div class="help">Úsalo si la unidad es unidad/pieza. Ej.: 1 manzana = 180 g.</div>`;
    insertAfter(unitInput.closest(".row") || unitInput, wrapper);
  }

  function readPendingIngredient() {
    const unit = byId("ingredientUnit")?.value || "";
    return {
      id: byId("editingIngredientId")?.value || "",
      name: byId("ingredientName")?.value || "",
      unit,
      unitWeightG: numberOrZero(byId("ingredientUnitWeightG")?.value)
    };
  }

  function findTarget(list, values) {
    if (!Array.isArray(list) || !values) return null;
    if (values.id) {
      const byIdMatch = list.find(item => item && item.id === values.id);
      if (byIdMatch) return byIdMatch;
    }
    const wantedName = normalizeName(values.name);
    if (!wantedName) return null;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const itemName = normalizeName(list[index]?.name || list[index]?.nombre);
      if (itemName === wantedName) return list[index];
    }
    return null;
  }

  function mergeUnitWeight(list, values) {
    if (!values || !values.unitWeightG) return list;
    const item = findTarget(list, values);
    if (!item) return list;
    item.unitWeightG = values.unitWeightG;
    if (values.unit) item.unit = values.unit;
    return list;
  }

  function patchLocalStorageWrites() {
    if (storagePatched || !global.localStorage) return;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (key === "ingredients" && pendingIngredientUnitWeight?.unitWeightG) {
        try {
          const parsed = JSON.parse(String(value || "[]"));
          if (Array.isArray(parsed)) value = JSON.stringify(mergeUnitWeight(parsed, pendingIngredientUnitWeight));
        } catch {
          // Keep original value.
        }
      }
      return originalSetItem.call(this, key, value);
    };
    storagePatched = true;
  }

  function persistCurrentUnitWeight() {
    const values = readPendingIngredient();
    pendingIngredientUnitWeight = values;
    if (!values.unitWeightG) return;
    try {
      const list = JSON.parse(localStorage.getItem("ingredients") || "[]");
      if (!Array.isArray(list)) return;
      localStorage.setItem("ingredients", JSON.stringify(mergeUnitWeight(list, values)));
    } catch {
      // Ignore invalid local data.
    }
  }

  function fillUnitWeightOnEdit() {
    const editingId = byId("editingIngredientId")?.value || "";
    if (!editingId) return;
    try {
      const list = JSON.parse(localStorage.getItem("ingredients") || "[]");
      const item = Array.isArray(list) ? list.find(entry => entry && entry.id === editingId) : null;
      const field = byId("ingredientUnitWeightG");
      if (field && item) field.value = item.unitWeightG || "";
    } catch {
      // Ignore invalid local data.
    }
  }

  function updateHintVisibility() {
    const wrapper = byId("ingredientUnitWeightGWrapper");
    const unit = byId("ingredientUnit")?.value || "";
    if (!wrapper) return;
    wrapper.style.opacity = isUnitBased(unit) ? "1" : "0.72";
  }

  function install() {
    ensureUnitWeightField();
    patchLocalStorageWrites();
    updateHintVisibility();

    const saveButton = byId("saveIngredientBtn");
    if (saveButton && saveButton.dataset.unitNormalization !== "true") {
      saveButton.dataset.unitNormalization = "true";
      saveButton.addEventListener("click", () => {
        pendingIngredientUnitWeight = readPendingIngredient();
        setTimeout(persistCurrentUnitWeight, 0);
        setTimeout(persistCurrentUnitWeight, 200);
      }, true);
    }

    byId("ingredientUnit")?.addEventListener("input", updateHintVisibility);

    document.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || !/Editar/.test(button.textContent || "")) return;
      setTimeout(fillUnitWeightOnEdit, 80);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
  document.addEventListener?.("planificador:modules-ready", install);
  setTimeout(install, 500);

  global.UnitNormalization = {
    isUnitBased,
    mergeUnitWeight,
    persistCurrentUnitWeight,
    install
  };
})(typeof window !== "undefined" ? window : globalThis);
