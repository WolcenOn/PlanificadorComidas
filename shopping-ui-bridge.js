/*
 * Enhanced shopping UI bridge for PlanificadorComidas.
 * Re-renders the shopping summary/list using ShoppingPlanner without modifying index.html.
 */
(function attachShoppingUiBridge(global) {
  "use strict";

  let renderTimer = null;
  let isRendering = false;

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

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";
    return number.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  }

  function formatCurrency(value) {
    const number = Number(value) || 0;
    return number.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  }

  function readArray(key, fallback = []) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function readState() {
    if (global.PlanificadorDataStore?.loadAll) {
      return global.PlanificadorDataStore.loadAll();
    }

    const weeks = readArray("savedWeeks", []);
    const activeWeekId = localStorage.getItem("activeWeekId") || weeks[0]?.id || "";
    return {
      ingredients: readArray("ingredients", []),
      dishes: readArray("dishes", []),
      weeks,
      activeWeekId
    };
  }

  function activeWeek(state) {
    return state.weeks.find(week => week.id === state.activeWeekId) || state.weeks[0] || { name: "Semana", plan: {} };
  }

  function renderSummary(container, result, week) {
    const summaryItems = [
      ["Productos a comprar", result.summary.totalMissingItems],
      ["Coste real estimado", formatCurrency(result.summary.totalPurchaseCost)],
      ["Ajuste medio", `${formatNumber(result.summary.averageFitScore)}/100`],
      ["Semana", week.name || "Semana activa"]
    ];

    container.innerHTML = summaryItems.map(([label, value]) => `
      <div class="summary-item">
        <strong>${escapeHtml(value)}</strong>
        <span class="muted">${escapeHtml(label)}</span>
      </div>`).join("");
  }

  function purchaseDescription(item) {
    const purchase = item.purchase;
    if (!purchase.product) {
      return purchase.note || "Sin envase compatible registrado.";
    }
    const productName = purchase.product.name || purchase.product.brand || "Producto";
    return `${productName}: comprar ${purchase.packages} paquete/s de ${formatNumber(purchase.product.packageQty)} ${purchase.product.packageUnit} · ${formatCurrency(purchase.totalCost)}`;
  }

  function renderShoppingItems(container, result) {
    container.innerHTML = "";
    if (!result.purchases.length) {
      container.innerHTML = '<div class="empty">No falta ningún ingrediente para la planificación actual.</div>';
      return;
    }

    result.purchases.forEach(item => {
      const div = document.createElement("div");
      div.className = "item shopping-item";
      const fitClass = item.purchase.fitScore >= 80 ? "ok" : item.purchase.fitScore >= 55 ? "warn" : "zero";
      const usedLots = item.demand.allocation.allocations || [];
      const lotText = usedLots.length
        ? usedLots.map(lot => `${formatNumber(lot.usedQty)} ${lot.unit}${lot.expiryDate ? ` · caduca ${lot.expiryDate}` : ""}`).join("; ")
        : "Sin lotes usados o sin lotes registrados.";

      div.innerHTML = `
        <input type="checkbox" />
        <div>
          <strong>${escapeHtml(item.ingredientName)}</strong>
          <small>Falta ${formatNumber(item.missingQty)} ${escapeHtml(item.missingUnit)}.</small>
          <small>${escapeHtml(purchaseDescription(item))}</small>
          <small>Sobrante previsto: ${formatNumber(item.purchase.leftoverQty)} ${escapeHtml(item.purchase.leftoverUnit)}.</small>
          <small>Stock usado antes de comprar: ${escapeHtml(lotText)}</small>
        </div>
        <span class="badge ${fitClass}">${escapeHtml(item.purchase.fitScore)}/100</span>`;
      container.appendChild(div);
    });
  }

  function renderEnhancedShopping() {
    if (isRendering) return;
    if (!global.ShoppingPlanner?.calculateShoppingPlan) return;

    const shoppingList = byId("shoppingList");
    const shoppingSummary = byId("shoppingSummary");
    const shoppingWeekInfo = byId("shoppingWeekInfo");
    if (!shoppingList || !shoppingSummary) return;

    const state = readState();
    const week = activeWeek(state);
    const result = global.ShoppingPlanner.calculateShoppingPlan({
      plan: week.plan || {},
      dishes: state.dishes || [],
      ingredients: state.ingredients || []
    });

    isRendering = true;
    try {
      if (shoppingWeekInfo) shoppingWeekInfo.textContent = `Compra optimizada para: ${week.name || "Semana activa"}`;
      renderSummary(shoppingSummary, result, week);
      renderShoppingItems(shoppingList, result);
      shoppingList.dataset.enhancedShopping = "true";
    } finally {
      isRendering = false;
    }
  }

  function scheduleRender(delay = 60) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderEnhancedShopping, delay);
  }

  function install() {
    scheduleRender(200);
    document.addEventListener("planificador:modules-ready", () => scheduleRender(50));
    window.addEventListener("storage", () => scheduleRender(80));
    document.addEventListener("click", () => scheduleRender(120), true);
    document.addEventListener("input", () => scheduleRender(180), true);
    document.addEventListener("change", () => scheduleRender(180), true);

    const target = byId("panel-shopping") || document.body;
    if (target && "MutationObserver" in window) {
      const observer = new MutationObserver(() => {
        if (!isRendering) scheduleRender(80);
      });
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();

  global.ShoppingUiBridge = {
    renderEnhancedShopping,
    scheduleRender
  };
})(typeof window !== "undefined" ? window : globalThis);
