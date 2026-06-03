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

## Hardening de index

`index-hardening.js` es una integracion progresiva para `index.html`. Debe cargarse despues del script principal de la app y despues de `stock-lifecycle.js`.

Uso recomendado antes de `</body>`:

```html
<script src="stock-lifecycle.js"></script>
<script src="index-hardening.js"></script>
```

Aporta:

- campo de caducidad y conservacion al crear o editar ingredientes;
- saneamiento de JSON antes de importar copias completas, ingredientes o platos;
- limites de tamano y longitud para reducir datos corruptos o excesivos;
- normalizacion de fechas, cantidades, textos, productos y recetas;
- enlace rapido al panel `caducidades.html`.

## Campo notes en recetas

El campo `notes` se debe usar para guardar tanto las notas generales como el procedimiento de elaboracion del plato. Esto mantiene la compatibilidad con el importador actual.

## Panel de caducidades

`caducidades.html` usa el mismo `localStorage` que la app principal y permite editar fechas, ver avisos, consultar la puntuacion de desperdicio y registrar cantidades desperdiciadas.

## Tests

Abre `tests/stock-lifecycle.test.html` en el navegador para ejecutar los tests minimos.
