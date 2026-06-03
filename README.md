# PlanificadorComidas

Planificador de comidas semanal con control de stock.

## Caducidad, congelado y desperdicio

El módulo `stock-lifecycle.js` añade una capa reutilizable para normalizar datos de stock y calcular avisos de consumo prioritario.

Campos nuevos soportados en ingredientes y platos:

- `expiryDate`: fecha de caducidad o consumo preferente, en formato `YYYY-MM-DD`.
- `openedDate`: fecha de apertura, útil para ingredientes empezados.
- `preparedDate`: fecha de preparación/cocinado.
- `frozenDate`: fecha de congelado.
- `storageType`: `pantry`, `fridge` o `freezer`.
- `discardedDate`, `discardedQty` y `wasteReason`: datos opcionales para registrar desperdicio.

Funciones principales:

- `StockLifecycle.normalizeIngredientStock(item)`
- `StockLifecycle.normalizeDishStock(item)`
- `StockLifecycle.migrateStockDatabase(data)`
- `StockLifecycle.buildExpiryAlerts(data, options)`
- `StockLifecycle.calculateWasteScore(data, options)`
- `StockLifecycle.runSelfTests()`

## Tests

Abre `tests/stock-lifecycle.test.html` en el navegador para ejecutar los tests mínimos de normalización, caducidades, congelado y puntuación de desperdicio.

