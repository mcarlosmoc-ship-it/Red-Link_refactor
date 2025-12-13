# Flujo y estabilidad de metadata del carrito POS

## Objetivos
- Mantener objetos de metadata estables para evitar re-renders y bucles de actualización.
- Cambiar la identidad de `cartItems`, `metadata` y `validationFlags` **solo** cuando cambia su contenido.
- Evitar llamadas a `setCartItems` si el estado resultante es estructuralmente igual al anterior.

## Flujo simplificado
1. **Entrada**: líneas del carrito (`id`, `type`, `productId`, `servicePlanId`, `quantity`, `price`) y contexto (`activePeriodKey`, `productLookup`, `activeServices`).
2. **Normalización pura** (`normalizeLineMetadata`):
   - Deriva `period`, `months`, `availableStock`, `serviceStatus` y `validationFlags`.
   - Reutiliza metadata previa o en caché cuando el contenido coincide (igualdad estructural).
3. **Actualización controlada** (`updateCart` / `refreshMetadata`):
   - Enriquecen líneas con metadata estable.
   - Comparan el resultado con el estado previo usando igualdad estructural (`areCartItemsEqual`).
   - Solo invocan `setCartItems` cuando hay diferencias reales.
4. **Sincronización externa**: efectos que dependen de `cartItems` reciben objetos estables; cambios sin contenido nuevo no disparan renders adicionales.

## Contrato de estabilidad
- `cartItems`: la referencia cambia únicamente si cambia la longitud o alguna línea difiere en `id`, `type`, `productId`, `servicePlanId`, `quantity`, `price` o metadata.
- `metadata`: mantiene la identidad cuando `type`, `period`, `months`, `availableStock`, `serviceStatus` y `validationFlags` no cambian.
- `validationFlags`: la referencia se conserva si `hasIssue` y `message` son iguales.

## Reglas de validación y cacheo
- La cache de metadata es por `item.id`; se actualiza tras normalizar y solo sustituye entradas cuando el contenido es distinto.
- Los efectos de cliente/servicios activos filtran y recalculan usando metadata memoizada para evitar recrear objetos.

## Pruebas clave
- **Render estable**: mismo input → misma referencia para `cartItems` y `metadata` (sin nuevos renders).
- **Refresh seguro**: `refreshMetadata` no dispara `setCartItems` si la metadata no cambia.
- **Flags inmutables**: actualizar `validationFlags` con valores idénticos no altera referencias ni dispara renders.
