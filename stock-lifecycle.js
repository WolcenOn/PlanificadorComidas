/*
 * Stock lifecycle helpers for PlanificadorComidas.
 * Adds normalized expiry/preparation/freezing metadata and food-waste scoring.
 * This file is intentionally framework-free so it can be loaded from index.html
 * or tested independently in a browser.
 */
(function attachStockLifecycle(global) {
  "use strict";

  const STORAGE_TYPES = ["pantry", "fridge", "freezer"];
  const DATE_FIELDS = ["expiryDate", "openedDate", "preparedDate", "frozenDate", "discardedDate", "consumedDate"];

  function cleanText(value, fallback = "") {
    return String(value ?? fallback).trim();
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function isValidDateString(value) {
    if (!value || typeof value !== "string") return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function cleanDate(value) {
    const text = cleanText(value);
    return isValidDateString(text) ? text : "";
  }

  function todayDate(referenceDate = new Date()) {
    const date = new Date(referenceDate);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function parseDate(value) {
    if (!isValidDateString(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function daysBetween(dateString, referenceDate = new Date()) {
    const date = parseDate(dateString);
    if (!date) return null;
    const today = todayDate(referenceDate);
    return Math.round((date.getTime() - today.getTime()) / 86400000);
  }

  function normalizeStorageType(value, fallback = "pantry") {
    const clean = cleanText(value || fallback).toLowerCase();
    return STORAGE_TYPES.includes(clean) ? clean : fallback;
  }

  function normalizeLifecycle(raw = {}, defaults = {}) {
    const lifecycle = {
      expiryDate: cleanDate(raw.expiryDate || raw.caducidad || raw.bestBeforeDate || raw.fechaCaducidad || defaults.expiryDate),
      openedDate: cleanDate(raw.openedDate || raw.fechaApertura || defaults.openedDate),
      preparedDate: cleanDate(raw.preparedDate || raw.fechaPreparacion || raw.cookedDate || defaults.preparedDate),
      frozenDate: cleanDate(raw.frozenDate || raw.fechaCongelado || defaults.frozenDate),
      storageType: normalizeStorageType(raw.storageType || raw.conservacion || defaults.storageType, defaults.storageType || "pantry"),
      consumedDate: cleanDate(raw.consumedDate || raw.fechaConsumo || defaults.consumedDate),
      discardedDate: cleanDate(raw.discardedDate || raw.fechaDesperdicio || defaults.discardedDate),
      discardedQty: Math.max(0, numberOrZero(raw.discardedQty ?? raw.cantidadDesperdiciada ?? defaults.discardedQty)),
      wasteReason: cleanText(raw.wasteReason || raw.motivoDesperdicio || defaults.wasteReason)
    };

    return lifecycle;
  }

  function normalizeIngredientStock(raw = {}) {
    return {
      ...raw,
      qty: Math.max(0, numberOrZero(raw.qty ?? raw.cantidad)),
      unit: cleanText(raw.unit || raw.unidad || "unidades"),
      available: raw.available !== false && raw.disponible !== false,
      ...normalizeLifecycle(raw, { storageType: "pantry" })
    };
  }

  function normalizeDishStock(raw = {}) {
    return {
      ...raw,
      qty: Math.max(0, numberOrZero(raw.qty ?? raw.racionesPreparadas ?? raw.stock)),
      unit: cleanText(raw.unit || raw.unidad || "raciones"),
      ...normalizeLifecycle(raw, { storageType: raw.frozenDate ? "freezer" : "fridge" })
    };
  }

  function buildExpiryAlerts({ ingredients = [], dishes = [] } = {}, options = {}) {
    const referenceDate = options.referenceDate || new Date();
    const soonDays = Number.isFinite(Number(options.soonDays)) ? Number(options.soonDays) : 3;
    const freezerWarningDays = Number.isFinite(Number(options.freezerWarningDays)) ? Number(options.freezerWarningDays) : 90;
    const alerts = [];

    function pushExpiryAlert(item, itemType) {
      const days = daysBetween(item.expiryDate, referenceDate);
      if (days === null) return;

      if (days < 0) {
        alerts.push({
          severity: "expired",
          itemType,
          id: item.id || "",
          name: item.name || item.nombre || "Sin nombre",
          days,
          message: `Caducado hace ${Math.abs(days)} día/s`,
          action: "Revisar y descartar si no es seguro"
        });
      } else if (days === 0) {
        alerts.push({
          severity: "today",
          itemType,
          id: item.id || "",
          name: item.name || item.nombre || "Sin nombre",
          days,
          message: itemType === "Plato" ? "Consumir hoy" : "Caduca hoy",
          action: "Planificar hoy"
        });
      } else if (days <= soonDays) {
        alerts.push({
          severity: "soon",
          itemType,
          id: item.id || "",
          name: item.name || item.nombre || "Sin nombre",
          days,
          message: itemType === "Plato" ? `Consumir en ${days} día/s` : `Caduca en ${days} día/s`,
          action: "Priorizar esta semana"
        });
      }
    }

    function pushFreezerAlert(item, itemType) {
      if (item.storageType !== "freezer" && !item.frozenDate) return;
      const daysSinceFrozen = daysBetween(item.frozenDate, referenceDate);
      if (daysSinceFrozen === null) return;
      const age = Math.abs(Math.min(daysSinceFrozen, 0));
      if (age >= freezerWarningDays) {
        alerts.push({
          severity: "freezer",
          itemType,
          id: item.id || "",
          name: item.name || item.nombre || "Sin nombre",
          days: -age,
          message: `Congelado hace ${age} día/s`,
          action: "Usar antes de seguir acumulando congelados"
        });
      }
    }

    ingredients.map(normalizeIngredientStock).forEach(item => {
      pushExpiryAlert(item, "Ingrediente");
      pushFreezerAlert(item, "Ingrediente");
    });

    dishes.map(normalizeDishStock).forEach(item => {
      pushExpiryAlert(item, "Plato");
      pushFreezerAlert(item, "Plato");
    });

    const severityWeight = { expired: 0, today: 1, soon: 2, freezer: 3 };
    return alerts.sort((a, b) => (severityWeight[a.severity] ?? 9) - (severityWeight[b.severity] ?? 9) || a.days - b.days || a.name.localeCompare(b.name, "es"));
  }

  function buildConsumptionRecommendations({ ingredients = [], dishes = [] } = {}, options = {}) {
    const alerts = buildExpiryAlerts({ ingredients, dishes }, options);
    const severityScore = { expired: 100, today: 80, soon: 60, freezer: 35 };
    const recommendations = alerts.map(alert => ({
      ...alert,
      priority: severityScore[alert.severity] || 0,
      title: `${alert.name}: ${alert.message}`,
      suggestion: alert.severity === "expired"
        ? "Revisa olor, textura y seguridad antes de consumir; descarta si hay duda."
        : alert.severity === "freezer"
          ? "Inclúyelo en una comida próxima para rotar el congelador."
          : "Dale prioridad en el calendario antes de comprar más."
    }));

    return recommendations.sort((a, b) => b.priority - a.priority || a.days - b.days || a.name.localeCompare(b.name, "es"));
  }

  function calculateWasteScore({ ingredients = [], dishes = [] } = {}, options = {}) {
    const allItems = [
      ...ingredients.map(item => ({ ...normalizeIngredientStock(item), itemType: "Ingrediente" })),
      ...dishes.map(item => ({ ...normalizeDishStock(item), itemType: "Plato" }))
    ];

    const stockItems = allItems.filter(item => numberOrZero(item.qty) > 0 || item.available === true);
    const alerts = buildExpiryAlerts({ ingredients, dishes }, options);
    const expiredCount = alerts.filter(alert => alert.severity === "expired").length;
    const todayCount = alerts.filter(alert => alert.severity === "today").length;
    const soonCount = alerts.filter(alert => alert.severity === "soon").length;
    const freezerCount = alerts.filter(alert => alert.severity === "freezer").length;
    const discardedQty = allItems.reduce((total, item) => total + numberOrZero(item.discardedQty), 0);

    const possible = Math.max(1, stockItems.length);
    const riskPenalty = Math.min(70, expiredCount * 18 + todayCount * 10 + soonCount * 5 + freezerCount * 3);
    const wastePenalty = Math.min(30, discardedQty * 2);
    const score = Math.max(0, Math.min(100, Math.round(100 - riskPenalty - wastePenalty)));

    let label = "Excelente";
    if (score < 40) label = "Alto riesgo de desperdicio";
    else if (score < 70) label = "Mejorable";
    else if (score < 90) label = "Bueno";

    return {
      score,
      label,
      stockItems: possible,
      expiredCount,
      todayCount,
      soonCount,
      freezerCount,
      discardedQty,
      alerts,
      recommendations: buildConsumptionRecommendations({ ingredients, dishes }, options)
    };
  }

  function migrateStockDatabase(data = {}) {
    return {
      ...data,
      app: data.app || "gestor-comidas",
      version: Math.max(3, Number(data.version) || 0),
      ingredientFamilies: Array.isArray(data.ingredientFamilies) ? data.ingredientFamilies : [],
      ingredients: Array.isArray(data.ingredients) ? data.ingredients.map(normalizeIngredientStock) : [],
      dishPacks: Array.isArray(data.dishPacks) ? data.dishPacks : [],
      dishes: Array.isArray(data.dishes) ? data.dishes.map(normalizeDishStock) : [],
      favoriteIds: Array.isArray(data.favoriteIds) ? data.favoriteIds : [],
      familyMembers: Array.isArray(data.familyMembers) ? data.familyMembers : [{ id: "default", name: "Todos" }],
      mealTypes: Array.isArray(data.mealTypes) ? data.mealTypes : [{ id: "lunch", name: "Comida" }, { id: "dinner", name: "Cena" }],
      weeks: Array.isArray(data.weeks) ? data.weeks : [],
      typicalWeekPlan: data.typicalWeekPlan || null
    };
  }

  function runSelfTests() {
    const sample = migrateStockDatabase({
      version: 2,
      ingredients: [
        { name: "Yogur", qty: 2, unit: "unidades", expiryDate: "2026-06-04", available: true },
        { name: "Arroz", qty: 1, unit: "kg", expiryDate: "fecha mala", available: true },
        { name: "Pollo", qty: 1, unit: "kg", frozenDate: "2026-01-01", storageType: "freezer" }
      ],
      dishes: [
        { name: "Salmorejo", qty: 3, unit: "raciones", preparedDate: "2026-06-01", expiryDate: "2026-06-03" }
      ]
    });

    const result = calculateWasteScore(sample, { referenceDate: new Date("2026-06-03T12:00:00"), soonDays: 3, freezerWarningDays: 90 });
    const assertions = [
      [sample.version === 3, "migrateStockDatabase bumps version to 3"],
      [sample.ingredients[1].expiryDate === "", "invalid dates are cleaned"],
      [result.todayCount === 1, "dish expiring today is counted"],
      [result.soonCount === 1, "ingredient expiring soon is counted"],
      [result.freezerCount === 1, "old frozen stock is counted"],
      [result.score < 100, "risk lowers the waste score"],
      [result.recommendations.length === 3, "recommendations are created from alerts"]
    ];

    return assertions.map(([ok, message]) => ({ ok, message }));
  }

  global.StockLifecycle = {
    STORAGE_TYPES,
    DATE_FIELDS,
    cleanDate,
    daysBetween,
    normalizeLifecycle,
    normalizeIngredientStock,
    normalizeDishStock,
    buildExpiryAlerts,
    buildConsumptionRecommendations,
    calculateWasteScore,
    migrateStockDatabase,
    runSelfTests
  };
})(typeof window !== "undefined" ? window : globalThis);
