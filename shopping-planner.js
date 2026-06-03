/*
 * Shopping planner engine for PlanificadorComidas.
 * Converts a weekly plan into ingredient demand, stock allocation and purchase suggestions.
 * Depends optionally on MealCosting for unit normalization and stock lot allocation.
 */
(function attachShoppingPlanner(global) {
  "use strict";

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function round(value, decimals = 4) {
    const factor = 10 ** decimals;
    return Math.round((Number(value) || 0) * factor) / factor;
  }

  function normalizeUnit(unit) {
    if (global.MealCosting?.normalizeUnit) return global.MealCosting.normalizeUnit(unit);
    return { group: "custom", unit: String(unit || "ud"), baseUnit: String(unit || "ud"), factor: 1 };
  }

  function toBaseQty(qty, unit) {
    if (global.MealCosting?.toBaseQty) return global.MealCosting.toBaseQty(qty, unit);
    const normalized = normalizeUnit(unit);
    return { qty: numberOrZero(qty), unit: normalized.baseUnit, group: normalized.group };
  }

  function convertQty(qty, fromUnit, toUnit) {
    if (global.MealCosting?.convertQty) return global.MealCosting.convertQty(qty, fromUnit, toUnit);
    return String(fromUnit || "") === String(toUnit || "") ? numberOrZero(qty) : null;
  }

  function getPlanDishEntries(plan = {}) {
    const entries = [];
    Object.entries(plan || {}).forEach(([slotId, value]) => {
      const values = Array.isArray(value) ? value : (value ? [value] : []);
      values.forEach(entry => {
        if (!entry) return;
        if (typeof entry === "string") {
          entries.push({ slotId, dishId: entry, servings: 1 });
        } else if (typeof entry === "object") {
          entries.push({
            slotId,
            dishId: entry.dishId || entry.id || entry.value || "",
            servings: Math.max(0, numberOrZero(entry.servings ?? entry.raciones ?? entry.qty ?? 1)) || 1,
            memberIds: Array.isArray(entry.memberIds) ? entry.memberIds : []
          });
        }
      });
    });
    return entries.filter(entry => entry.dishId);
  }

  function calculatePlannedServings(plan = {}) {
    const servingsByDish = {};
    const entries = getPlanDishEntries(plan);
    entries.forEach(entry => {
      servingsByDish[entry.dishId] = (servingsByDish[entry.dishId] || 0) + entry.servings;
    });
    return { entries, servingsByDish };
  }

  function buildIngredientDemand(plan = {}, dishes = [], ingredients = []) {
    const { entries, servingsByDish } = calculatePlannedServings(plan);
    const dishesById = new Map(dishes.map(dish => [dish.id, dish]));
    const ingredientsById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
    const demandByIngredient = new Map();

    entries.forEach(entry => {
      const dish = dishesById.get(entry.dishId);
      if (!dish) return;
      const recipe = Array.isArray(dish.recipe) ? dish.recipe : [];
      recipe.forEach(row => {
        const ingredientId = row.ingredientId || row.id || "";
        const ingredient = ingredientsById.get(ingredientId) || row;
        const unit = row.unit || ingredient.unit || "ud";
        const qty = numberOrZero(row.qtyPerServing ?? row.qty ?? row.amount) * entry.servings;
        const base = toBaseQty(qty, unit);
        const key = ingredientId || `${row.name || ingredient.name || "ingredient"}::${unit}`;
        const current = demandByIngredient.get(key) || {
          ingredientId,
          ingredientName: ingredient.name || row.name || "Ingrediente",
          unit,
          baseUnit: base.unit,
          unitGroup: base.group,
          totalQty: 0,
          totalBaseQty: 0,
          rows: []
        };

        current.totalQty += qty;
        current.totalBaseQty += base.qty;
        current.rows.push({
          dishId: dish.id,
          dishName: dish.name || "Plato",
          slotId: entry.slotId,
          servings: entry.servings,
          qty,
          unit,
          baseQty: base.qty,
          baseUnit: base.unit
        });
        demandByIngredient.set(key, current);
      });
    });

    return Array.from(demandByIngredient.values()).map(item => ({
      ...item,
      totalQty: round(item.totalQty, 4),
      totalBaseQty: round(item.totalBaseQty, 4)
    })).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, "es"));
  }

  function allocateDemand(demandItems = [], ingredients = []) {
    const ingredientsById = new Map(ingredients.map(ingredient => [ingredient.id, ingredient]));
    return demandItems.map(demand => {
      const ingredient = ingredientsById.get(demand.ingredientId) || { id: demand.ingredientId, name: demand.ingredientName, unit: demand.unit, qty: 0, available: false };
      const allocation = global.MealCosting?.allocateLots
        ? global.MealCosting.allocateLots(ingredient, demand.totalQty, demand.unit)
        : fallbackAllocate(ingredient, demand.totalQty, demand.unit);
      return { ...demand, ingredient, allocation };
    });
  }

  function fallbackAllocate(ingredient, requiredQty, unit) {
    const available = ingredient.available === false ? 0 : numberOrZero(ingredient.qty);
    const missing = Math.max(0, numberOrZero(requiredQty) - available);
    return {
      requiredBaseQty: numberOrZero(requiredQty),
      baseUnit: unit,
      allocatedBaseQty: Math.min(numberOrZero(requiredQty), available),
      missingBaseQty: missing,
      missingQty: missing,
      unit,
      allocations: [],
      stockCost: 0
    };
  }

  function normalizeProduct(product = {}, fallbackUnit = "ud") {
    if (global.MealCosting?.normalizeProduct) return global.MealCosting.normalizeProduct(product, fallbackUnit);
    const price = numberOrZero(product.price);
    const packageQty = numberOrZero(product.packageQty ?? product.qty ?? 0);
    return {
      ...product,
      name: product.productName || product.name || product.brand || "Producto",
      packageQty,
      packageUnit: product.packageUnit || product.unit || fallbackUnit,
      packageBaseQty: packageQty,
      packageBaseUnit: product.packageUnit || product.unit || fallbackUnit,
      unitGroup: normalizeUnit(product.packageUnit || product.unit || fallbackUnit).group,
      price,
      unitCost: packageQty > 0 ? price / packageQty : 0
    };
  }

  function choosePurchaseOption(ingredient = {}, missingQty, missingUnit) {
    const missingBase = toBaseQty(missingQty, missingUnit || ingredient.unit || "ud");
    const options = (Array.isArray(ingredient.products) ? ingredient.products : [])
      .map(product => normalizeProduct(product, ingredient.unit || missingUnit || "ud"))
      .filter(product => product.price > 0 && product.packageBaseQty > 0 && product.unitGroup === missingBase.group)
      .map(product => {
        const packages = Math.max(1, Math.ceil(missingBase.qty / product.packageBaseQty));
        const purchasedBaseQty = packages * product.packageBaseQty;
        const leftoverBaseQty = Math.max(0, purchasedBaseQty - missingBase.qty);
        const leftoverQty = convertQty(leftoverBaseQty, product.packageBaseUnit, product.packageUnit) ?? leftoverBaseQty;
        const wasteRatio = purchasedBaseQty > 0 ? leftoverBaseQty / purchasedBaseQty : 1;
        const fitScore = Math.max(0, Math.min(100, Math.round(100 - wasteRatio * 60 - Math.max(0, product.unitCost) * 2)));
        return {
          product,
          packages,
          purchasedBaseQty: round(purchasedBaseQty, 4),
          purchasedQty: round(packages * product.packageQty, 4),
          purchasedUnit: product.packageUnit,
          leftoverBaseQty: round(leftoverBaseQty, 4),
          leftoverQty: round(leftoverQty, 4),
          leftoverUnit: product.packageUnit,
          totalCost: round(packages * product.price, 4),
          unitCost: round(product.unitCost, 6),
          fitScore,
          wasteRatio: round(wasteRatio, 4)
        };
      });

    if (!options.length) {
      return {
        product: null,
        packages: 0,
        purchasedBaseQty: round(missingBase.qty, 4),
        purchasedQty: round(missingQty, 4),
        purchasedUnit: missingUnit || ingredient.unit || "ud",
        leftoverBaseQty: 0,
        leftoverQty: 0,
        leftoverUnit: missingUnit || ingredient.unit || "ud",
        totalCost: numberOrZero(ingredient.approxPrice),
        unitCost: 0,
        fitScore: ingredient.approxPrice ? 60 : 30,
        wasteRatio: 0,
        note: "Sin producto por envase compatible; usa precio aproximado si existe."
      };
    }

    return options.sort((a, b) => b.fitScore - a.fitScore || a.totalCost - b.totalCost || a.unitCost - b.unitCost)[0];
  }

  function buildPurchasePlan(allocatedDemand = []) {
    return allocatedDemand
      .filter(item => item.allocation.missingQty > 0.0001)
      .map(item => {
        const purchase = choosePurchaseOption(item.ingredient, item.allocation.missingQty, item.unit);
        return {
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          missingQty: round(item.allocation.missingQty, 4),
          missingUnit: item.unit,
          missingBaseQty: item.allocation.missingBaseQty,
          baseUnit: item.allocation.baseUnit,
          purchase,
          demand: item
        };
      })
      .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName, "es"));
  }

  function calculateShoppingPlan({ plan = {}, dishes = [], ingredients = [] } = {}) {
    const demand = buildIngredientDemand(plan, dishes, ingredients);
    const allocatedDemand = allocateDemand(demand, ingredients);
    const purchases = buildPurchasePlan(allocatedDemand);
    const totalPurchaseCost = purchases.reduce((sum, item) => sum + numberOrZero(item.purchase.totalCost), 0);
    const totalMissingItems = purchases.length;
    const totalLeftoverBaseQty = purchases.reduce((sum, item) => sum + numberOrZero(item.purchase.leftoverBaseQty), 0);
    const averageFitScore = purchases.length
      ? purchases.reduce((sum, item) => sum + numberOrZero(item.purchase.fitScore), 0) / purchases.length
      : 100;

    return {
      demand,
      allocatedDemand,
      purchases,
      summary: {
        totalPurchaseCost: round(totalPurchaseCost, 2),
        totalMissingItems,
        totalLeftoverBaseQty: round(totalLeftoverBaseQty, 4),
        averageFitScore: round(averageFitScore, 2)
      }
    };
  }

  function runSelfTests() {
    const ingredients = [{
      id: "tomate",
      name: "Tomate triturado",
      qty: 100,
      unit: "g",
      available: true,
      products: [{ brand: "Bote", packageQty: 500, packageUnit: "g", price: 1.25 }],
      stockLots: [{ id: "lote-1", qty: 100, unit: "g", expiryDate: "2026-06-05" }]
    }];
    const dishes = [{ id: "pasta", name: "Pasta", recipe: [{ ingredientId: "tomate", qty: 150, unit: "g" }] }];
    const plan = { slot1: ["pasta", "pasta"] };
    const result = calculateShoppingPlan({ plan, dishes, ingredients });
    const assertions = [
      [result.demand[0].totalQty === 300, "demand multiplies recipes by planned servings"],
      [result.allocatedDemand[0].allocation.missingQty === 200, "stock is subtracted from demand"],
      [result.purchases[0].purchase.packages === 1, "purchase is rounded to complete packages"],
      [result.purchases[0].purchase.leftoverQty === 300, "leftover after purchase is calculated"],
      [result.summary.totalPurchaseCost === 1.25, "purchase cost uses full package price"]
    ];
    return assertions.map(([ok, message]) => ({ ok, message }));
  }

  global.ShoppingPlanner = {
    getPlanDishEntries,
    calculatePlannedServings,
    buildIngredientDemand,
    allocateDemand,
    choosePurchaseOption,
    buildPurchasePlan,
    calculateShoppingPlan,
    runSelfTests
  };
})(typeof window !== "undefined" ? window : globalThis);
