# Punto de venta: flujos de cobro y registro de pagos

## Botón "Cobrar" (ventas en caja)
- **Endpoint**: envía `POST /sales/transactions` mediante `recordSale` del hook `usePosSales` después de consolidar un payload con desglose de métodos de pago,
  totales y conceptos.【F:src/hooks/usePosSales.js†L60-L77】【F:src/pages/PointOfSale.jsx†L1091-L1188】
- **Desencadenante**: el formulario principal abre el modal de métodos de pago con `handleOpenPaymentModal`, y el botón **Cobrar** dentro del modal ejecuta `handleCheckout` para validar montos y despachar la transacción.【F:src/pages/PointOfSale.jsx†L1074-L1089】【F:src/pages/PointOfSale.jsx†L2378-L2416】【F:src/pages/PointOfSale.jsx†L3334-L3387】
- **Validaciones**:
  - Carrito no vacío, sin alertas y con referencia obligatoria cuando hay descuentos (para reembolsos/cancelaciones).【F:src/pages/PointOfSale.jsx†L939-L958】
  - Alertas por línea: stock insuficiente, cliente/contrato requerido para servicios, instalación/cobertura y reglas de reconexión/único servicio puntual por cliente.【F:src/pages/PointOfSale.jsx†L889-L934】
  - En el modal: la suma de splits debe igualar el total y no puede ser cero; valida efectivo recibido para calcular cambio.【F:src/pages/PointOfSale.jsx†L990-L1015】
- **Carrito y modal**:
  - Líneas se agregan desde catálogo/búsqueda (`addProductToCart`, `addSearchItemToCart`) o artículo personalizado; se permiten servicios puntuales/mensuales con categoría y timing por defecto.【F:src/pages/PointOfSale.jsx†L448-L497】【F:src/pages/PointOfSale.jsx†L619-L706】【F:src/pages/PointOfSale.jsx†L708-L750】
  - Desglose de categorías (productos/puntuales, mensualidades, adeudos, recargos) y de cobros inmediatos vs futuros se recalcula con los items actuales.【F:src/pages/PointOfSale.jsx†L533-L618】
  - El modal precarga un split igual al total, permite múltiples métodos (`paymentSplits`) y guarda cambio recibido; tras éxito limpia carrito y conserva resumen para imprimir recibo.【F:src/pages/PointOfSale.jsx†L1074-L1088】【F:src/pages/PointOfSale.jsx†L1175-L1188】

## Botón "Registrar pago" (pagos rápidos de clientes)
- **Endpoint**: usa `recordPayment` del store de backoffice, que construye payload con cliente/servicio, monto o meses calculados y llama a `POST /payments`; invalida y recarga clientes, pagos y métricas globales.【F:src/pages/PointOfSale.jsx†L1451-L1539】【F:src/store/useBackofficeStore.js†L989-L1055】
- **Validaciones previas**:
  - Cliente y servicio seleccionados; requiere monto o meses positivos para calcular el cobro.【F:src/pages/PointOfSale.jsx†L1451-L1493】
  - Previene duplicados buscando recibos del periodo actual (`useClientReceipts` + llamada a `/receipts`); muestra advertencia si ya existe folio para el periodo/servicio antes de cobrar.【F:src/pages/PointOfSale.jsx†L1505-L1520】
- **Construcción de datos**: deriva meses y monto a registrar a partir de mensualidad del servicio o deuda; permite nota y método de pago POS, y tras éxito refresca recibos y limpia filtros del formulario.【F:src/pages/PointOfSale.jsx†L1495-L1545】

## Dependencias de estado y helpers
- **Store global (Zustand)**: `useBackofficeStore` aporta `recordPayment` y los periodos activos (para validar duplicados por periodo) y mantiene cache de clientes/servicios usado por ambos flujos.【F:src/pages/PointOfSale.jsx†L253-L310】【F:src/store/useBackofficeStore.js†L989-L1055】
- **Hooks de dominio**: `usePosSales` (ventas), `useClients` (clientes en cache), `useServicePlans` y `useClientServices` (planes/servicios para validar contratos y catálogo), `useClientReceipts` (verificación de recibos).【F:src/pages/PointOfSale.jsx†L242-L309】【F:src/pages/PointOfSale.jsx†L1210-L1308】【F:src/hooks/usePosSales.js†L39-L77】
- **Helpers/formatters**: `getClientDebtSummary`, `getClientMonthlyFee`, `getPrimaryService` para precargar montos/servicio de pago; `CLIENT_PRICE` como fallback; utilidades de normalización (por ejemplo `clamp`, `normalizeNumericInput`) y formato de moneda (`peso`).【F:src/pages/PointOfSale.jsx†L26-L35】【F:src/pages/PointOfSale.jsx†L245-L309】【F:src/pages/PointOfSale.jsx†L516-L529】

## Construcción del carrito y contexto de cliente
- El cliente seleccionado se replica en cada línea de servicio (`useEffect` que sincroniza `clientId`), y la búsqueda rápida asocia productos/servicios al carrito según el contexto actual.【F:src/pages/PointOfSale.jsx†L432-L446】【F:src/pages/PointOfSale.jsx†L708-L750】
- Validaciones de cliente (alertas por suspensión, instalación pendiente o bloqueo de facturación) se calculan a partir de `selectedClient` y `selectedClientServices`, influyendo en mensajes previos al cobro.【F:src/pages/PointOfSale.jsx†L860-L888】

## Preguntas para alinear el registro de pagos con la nueva cobertura

Mensaje sugerido para el programador (solo preguntas, sin adelantar soluciones):

- Del flujo y diseño actuales de registro de pagos (el que ya existe en la UI), ¿hay algo que necesite cambiar obligatoriamente para funcionar correctamente con el modelo de cobertura, o consideras que ya es suficiente como está?
- Desde backend, ¿qué información mínima necesita hoy el frontend para mostrar correctamente el estado del servicio, sugerir montos y registrar pagos sin ambigüedad?
- ¿Hay algún punto del flujo actual donde el frontend esté recalculando estados, interpretando montos o usando datos legacy que convenga eliminar o simplificar?
- Pensando en mantener el sistema simple para el usuario final, ¿ves algún paso del flujo actual que sobre o que pueda confundir ahora que ya no usamos meses?
- Desde tu perspectiva, ¿cuál sería el siguiente paso lógico a trabajar: ajustes de UI, validaciones o simplemente estabilización y pruebas con datos reales?

Con estas respuestas buscamos cerrar bien el diseño actual antes de pedir cambios.
