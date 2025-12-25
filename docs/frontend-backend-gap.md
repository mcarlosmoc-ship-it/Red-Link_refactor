# Frontend ↔ Backend – Mapa y gap report

## Inventario de pantallas
- **Dashboard** (`/`): métricas, clientes destacados, costos por base; usa `/metrics/dashboard` con filtros `period_key`, `current_period`, `status_filter`, `search` para poblar KPIs y listas.【F:src/store/useBackofficeStore.js†L516-L572】【F:src/routes/routeLoaders.js†L1-L11】
- **Clientes** (`/clients`): listado CRUD y tabs de servicios/pagos/importación; llama `/clients`, `/client-services`, `/payments`, `/clients/import` y endpoints de creación/actualización/borrado de clientes/servicios.【F:src/store/useBackofficeStore.js†L32-L196】【F:src/store/useBackofficeStore.js†L574-L947】
- **Resellers** (`/resellers`): listado y creación, entregas y conciliaciones vía `/resellers`, `/resellers/{id}/deliveries`, `/resellers/{id}/settlements`.【F:src/store/useBackofficeStore.js†L340-L418】【F:src/store/useBackofficeStore.js†L1088-L1124】
- **Payments** (`/payments`): historial por periodo y registro de pagos; consume `/payments` (GET/POST) y `/payments/preview` para simulación desde la página.【F:src/store/useBackofficeStore.js†L196-L339】【F:src/pages/Payments.jsx†L13-L335】
- **Expenses** (`/expenses`): egresos y costos operativos; usa `/expenses` (GET/POST) y `/metrics/base-costs` para costos mensuales por base.【F:src/store/useBackofficeStore.js†L418-L519】【F:src/store/useBackofficeStore.js†L1210-L1223】
- **Inventory** (`/inventory`): inventario, altas/bajas y actualizaciones; consume `/inventory` (GET/POST/PUT/DELETE).【F:src/store/useBackofficeStore.js†L418-L519】【F:src/store/useBackofficeStore.js†L1139-L1187】
- **Point of Sale** (`/pos`): catálogo y ventas POS; hooks consultan `/sales/products` y `/sales/transactions` (GET/POST/PATCH).【F:src/routes/routeLoaders.js†L7-L10】【F:src/hooks/usePosCatalog.js†L3-L68】【F:src/hooks/usePosSales.js†L3-L64】
- **Settings** (`/settings`): administración de cuentas de clientes/principal; usa `/account-management/principal-accounts` y `/account-management/client-accounts` (GET/POST/PUT).【F:src/store/useBackofficeStore.js†L196-L339】【F:src/store/useBackofficeStore.js†L805-L876】
- **Reports** (`/reports`) e **Dashboard** comparten datos de `/metrics` y `/payments` según filtros actuales.【F:src/routes/routeLoaders.js†L6-L8】

## Mapa pantalla → endpoint → tablas
- **Dashboard** → `/metrics/dashboard` → agrega `service_charges`, `service_payments`, `expenses`, `base_operating_costs`, `clients` para KPIs; carga costos por base.【F:src/store/useBackofficeStore.js†L516-L572】
- **Clientes** → `/clients` (`clients`), `/client-services` (`client_services`, `subscriptions`), `/payments` (`service_payments`, `legacy_payments`), `/service-plans` (`service_plans`), `/metrics/consistency/payments` (verificación).【F:src/store/useBackofficeStore.js†L32-L196】【F:src/store/useBackofficeStore.js†L951-L1068】
- **Pagos** → `/payments` + `/payments/preview` → afecta `service_payments`, `service_charge_payments`, vista `payments_compat_view`.【F:src/pages/Payments.jsx†L231-L335】
- **Resellers** → `/resellers` + `/deliveries` + `/settlements` → tablas `resellers`, `reseller_deliveries`, `reseller_delivery_items`, `reseller_settlements`.【F:src/store/useBackofficeStore.js†L340-L418】【F:src/store/useBackofficeStore.js†L1088-L1124】
- **Inventario** → `/inventory` → `inventory_items`, `client_service_equipment`, `base_ip_reservations` (asignaciones).【F:src/store/useBackofficeStore.js†L418-L519】【F:db/schema.sql†L405-L517】
- **Expenses** → `/expenses` → `expenses`; `/metrics/base-costs` → `base_operating_costs`.【F:src/store/useBackofficeStore.js†L418-L519】【F:src/store/useBackofficeStore.js†L1210-L1223】
- **POS** → `/sales/products`, `/sales/transactions` → tablas definidas en backend POS (ver módulo `backend/app/models/pos.py`).【F:src/hooks/usePosCatalog.js†L3-L68】【F:src/hooks/usePosSales.js†L3-L64】
- **Settings** → `/account-management/principal-accounts`, `/account-management/client-accounts`, `/client-services` (asignación a cuentas) → `principal_accounts`, `client_accounts`, `client_account_services`.【F:src/store/useBackofficeStore.js†L196-L339】【F:src/store/useBackofficeStore.js†L805-L876】

## Cálculos en frontend que deberían ir al backend
- Cálculo de `monthsPaid` a partir de `amount` y `monthlyFee` al registrar pagos se realiza en `recordPayment` en el store; debería validarse/normalizarse server-side para coherencia con cargos y precios de plan.【F:src/store/useBackofficeStore.js†L977-L1042】
- Determinación de `nextStatus` y sincronización de estados de servicio se hace en el cliente (`toggleClientService`); el backend debería exponer acción de transición con reglas y auditoría.【F:src/store/useBackofficeStore.js†L897-L954】
- Selección de periodo actual y sincronización de periodos se mantiene en estado frontend (`periods`); convendría resolver periodo activo en backend para evitar desfases entre clientes.【F:src/store/useBackofficeStore.js†L47-L71】

## Gap report
- **Desfase de pagos**: Frontend sigue permitiendo `legacy_payments` al consumir `/payments` con `period` opcional; esquema promueve `service_payments` + `service_charge_payments`. Endpoints deben consolidar y evitar mezclar meses adelantados/calculados en cliente.【F:src/store/useBackofficeStore.js†L196-L339】【F:db/schema.sql†L181-L246】
- **Estados**: UI usa `client_services.status` y alterna entre active/suspended, pero `subscriptions.status` y `charge_status` no se sincronizan; riesgo de divergencia en métricas y recordatorios.
- **Portal vs. backoffice**: Pantallas de Settings manipulan `client_accounts` pero no enlazan de forma obligatoria con cargos/pagos unificados; la tabla `client_account_payment_links` queda infrautilizada.
- **Inventario/IPs**: Inventario se actualiza vía `/inventory` pero no fuerza reserva en `base_ip_reservations`; IPs en servicios pueden quedar fuera del pool.
- **POS**: Hooks usan endpoints `/sales/*` sin validación visible en UI respecto al catálogo de servicios principal; revisar alineación con modelo de productos en backend.

## Checklist de salud
- **Backend**: Requiere variables de seguridad (`CLIENT_PASSWORD_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_JWT_SECRET`) y base de datos configurada; iniciar con `alembic upgrade head` y FastAPI (`uvicorn backend.app.main:app`).【F:backend/README.md†L6-L93】 No se ejecutaron pruebas en este diagnóstico.
- **Frontend**: SPA en Vite; base URL al backend se resuelve automáticamente en `apiClient` hacia `http://localhost:8000` en desarrollo.【F:src/services/apiClient.js†L1-L115】 Compilación no verificada en este barrido.

## Rutas rotas o en riesgo
- Cambios de BD que rompen UI: si se elimina `legacy_payments` o cambian columnas de `client_services` (precio/estado), calculadora de meses pagados fallará; si `service_plan_prices` introduce moneda obligatoria, UI debe enviar `currency` consistente.
- Endpoints que no coinciden: `payments/preview` asume payload con `period_key`, `amount`, `months_paid`; validar contra backend real. `sales` endpoints dependen de esquema POS (no detallado en schema.sql) y pueden desfasarse.
- Pantallas con lógica vieja: importación de clientes (`/clients/import`) sigue modelos legacy (`paid_months_ahead`, `debt_months`); debería migrar a servicios/cargos.

## Levanta o no levanta
- **Backend**: arranca si variables de entorno y DB están presentes; migraciones disponibles vía `./backend/scripts/run_alembic.sh upgrade head` (no ejecutadas aquí).【F:backend/README.md†L60-L87】
- **Frontend**: requiere Vite (`npm run dev`/`npm run build`); acceso al backend depende de `VITE_DEV_BACKEND_PORT` opcional (por defecto 8000).【F:src/services/apiClient.js†L1-L115】 No se compiló durante este diagnóstico.
- **Errores potenciales**: falta de token de acceso muestra alerta en `AccessTokenAlert`; sin variables backend la app falla en arranque con `SecurityConfigurationError` (FastAPI).
