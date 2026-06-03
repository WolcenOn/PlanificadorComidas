# PlanificadorComidas

Planificador de comidas semanal con control de stock.

## Caducidad, congelado y desperdicio

El modulo `stock-lifecycle.js` normaliza datos de stock y calcula avisos de consumo prioritario.

Campos soportados en ingredientes y platos:

- `expiryDate`: fecha en formato `YYYY-MM-DD`.
- `openedDate`: fecha de apertura.
- `preparedDate`: fecha de elaboracion.
- `frozenDate`: fecha de congelado.
- `storageType`: `pantry`, `fridge` o `freezer`.
- `discardedDate`, `discardedQty` y `wasteReason`: datos opcionales para registrar desperdicio.

Funciones principales:

- `StockLifecycle.normalizeIngredientStock(item)`
- `StockLifecycle.normalizeDishStock(item)`
- `StockLifecycle.migrateStockDatabase(data)`
- `StockLifecycle.buildExpiryAlerts(data, options)`
- `StockLifecycle.buildConsumptionRecommendations(data, options)`
- `StockLifecycle.calculateWasteScore(data, options)`
- `StockLifecycle.runSelfTests()`

## Campo notes en recetas

El campo `notes` se debe usar para guardar tanto las notas generales como el procedimiento de elaboracion del plato. Esto mantiene la compatibilidad con el importador actual.

## Panel de caducidades

`caducidades.html` usa el mismo `localStorage` que la app principal y permite editar fechas, ver avisos, consultar la puntuacion de desperdicio y registrar cantidades desperdiciadas.

## Tests

Abre `tests/stock-lifecycle.test.html` en el navegador para ejecutar los tests minimos.
