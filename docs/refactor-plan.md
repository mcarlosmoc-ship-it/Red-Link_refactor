# Plan de refactor – Etapas y decisiones

## Correcciones críticas (estabilidad)
1. **Unificar pagos**: migrar `legacy_payments` y `payments` (portal) hacia `service_payments` + `service_charge_payments`. Crear migración que marque legacy como solo lectura y agregar triggers/vistas de compatibilidad temporal.
2. **Fuente única de estado de servicio**: exponer columna `subscriptions.status` como autoridad y sincronizar `client_services.status` vía trigger o tarea de conciliación. Ajustar endpoints para escribir en una sola tabla.
3. **Integridad de IPs**: obligar a que `client_services.ip_address/antenna_ip/modem_ip` provengan de `base_ip_reservations` (FK opcional + unique). Añadir índice único en `inventory_items.ip_address` o mover IP a reservas.
4. **Integridad de cuentas portal**: requerir que pagos de portal se vinculen a cargos (`client_account_payment_links` NOT NULL en service_charge_id/payment_id) y sincronizar `client_accounts.estatus` con estado de suscripción.
5. **Índices clave**: refuerzos en `service_payments.paid_on`, `service_charges.status`, búsqueda por `clients.external_code`, `resellers.full_name`, `inventory_items.ip_address`.

## Mejoras estructurales (escalabilidad)
- **Separar dominios**: crear esquemas lógicos o prefijos para internet (`clients`, `client_services`, `subscriptions`), ventas (`service_plans`, `service_plan_prices`, POS), y cyber/hotspot (`vouchers`, `resellers`). Documentar bounded contexts.
- **Modelo limpio de cliente**: mantener `clients` sin métricas acumuladas; mover `paid_months_ahead`/`debt_months` a una vista calculada a partir de cargos y pagos.
- **Catálogo de servicios**: usar `service_catalog` + `service_plans` como única fuente de productos (internet, hotspot, trámites); eliminar campos de precio en `client_services` salvo overrides explícitos.
- **Cobros recurrentes**: generar `service_charges` automáticos por `billing_cycle` con job confiable; soportar pagos parciales/adelantados a nivel cargo.
- **Revendedores y fichas**: añadir tabla de consumo/activación de vouchers por cliente/servicio; registrar comisiones y lotes entregados/consumidos.

## Limpieza técnica
- **Tablas/columnas a eliminar**: `legacy_payments`, campos `paid_months_ahead`/`debt_months` en `clients`, IPs directas en `client_services` (mover a reservas), `payments` de portal si se consolida con service_payments.
- **Vistas de compatibilidad**: mantener `payments_compat_view` y crear vistas para exponer métricas legacy durante transición (ej. `client_balance_view`).
- **Tareas automáticas**: cron para reconciliar `subscriptions.status` vs. cargos/pagos; monitor de IPs en cuarentena.

## Migración por etapas
- **Etapa 1 (hardening)**: aplicar migraciones de integridad (FK y únicos adicionales, vistas de compatibilidad), migrar datos de `legacy_payments` a `service_payments`, congelar escrituras legacy. Riesgos: downtime por FK; rollback vía backup previo y drop de constraints.
- **Etapa 2 (dominios claros)**: refactor endpoints/backend para usar solo pagos/cargos nuevos y estados en `subscriptions`; ajustar frontend para dejar de calcular monthsPaid y usar periodos desde backend. Riesgos: cambios de contrato API; rollback reactivando vistas de compatibilidad.
- **Etapa 3 (feature parity)**: incorporar consumo de vouchers y portal unificado; mover IPs a reservas con UI para asignación automática; limpiar columnas deprecadas. Riesgos: scripts de migración complejos; rollback manteniendo columnas shadow hasta validar.

## Decisiones recomendadas (fuente de verdad)
- **Estado de servicio**: `subscriptions.status` + `service_charges.status` para facturación; `client_services.status` solo como view calculada.
- **Pagos y adeudos**: `service_payments` + `service_charge_payments` como única fuente; balances derivados por consulta, no por acumuladores en `clients`.
- **IPs**: `base_ip_reservations` como autoridad; `client_services` solo referencia al `reservation_id`.
- **Planes y precios**: `service_plans` + `service_plan_prices` definitivos; `client_services.price` solo override puntual.
- **Portal de clientes**: `client_accounts` ligados a cargos/pagos vía `client_account_payment_links`; estatus de cuenta derivado de cargos vencidos.
