# Checklist de contract tests (frontend ↔ backend)

## Endpoints consumidos por el frontend

| Área | Método | Endpoint | Backend router | Referencia frontend |
| --- | --- | --- | --- | --- |
| Auth | POST | `/auth/token` | `backend/app/routers/auth.py` | `src/services/authService.js` |
| Clientes | GET | `/clients` | `backend/app/routers/clients.py` | `src/store/useBackofficeStore.js` |
| Clientes | POST | `/clients` | `backend/app/routers/clients.py` | `src/store/useBackofficeStore.js` |
| Clientes | PUT | `/clients/{id}` | `backend/app/routers/clients.py` | `src/store/useBackofficeStore.js` |
| Clientes | DELETE | `/clients/{id}` | `backend/app/routers/clients.py` | `src/store/useBackofficeStore.js` |
| Clientes | GET | `/clients/import/template` | `backend/app/routers/clients.py` | `src/components/clients/ImportClientsModal.jsx` |
| Clientes | POST | `/clients/import` | `backend/app/routers/clients.py` | `src/store/useBackofficeStore.js` |
| Servicios | GET | `/client-services` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | POST | `/client-services` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | PUT | `/client-services/{id}` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | DELETE | `/client-services/{id}` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | POST | `/client-services/bulk-assign` | `backend/app/routers/client_services.py` | `src/components/clients/BulkAssignServicesModal.jsx` |
| Servicios | GET | `/client-services/{id}/debt` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | PUT | `/client-services/{id}/debt` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Servicios | GET | `/client-services/{id}/proration-preview` | `backend/app/routers/client_services.py` | `src/store/useBackofficeStore.js` |
| Planes | GET | `/service-plans` | `backend/app/routers/service_plans.py` | `src/store/useBackofficeStore.js` |
| Planes | POST | `/service-plans` | `backend/app/routers/service_plans.py` | `src/store/useBackofficeStore.js` |
| Planes | PUT | `/service-plans/{id}` | `backend/app/routers/service_plans.py` | `src/store/useBackofficeStore.js` |
| Planes | DELETE | `/service-plans/{id}` | `backend/app/routers/service_plans.py` | `src/store/useBackofficeStore.js` |
| Pagos | GET | `/payments` | `backend/app/routers/payments.py` | `src/store/useBackofficeStore.js`, `src/hooks/useClientReceipts.js` |
| Pagos | POST | `/payments` | `backend/app/routers/payments.py` | `src/store/useBackofficeStore.js` |
| Pagos | POST | `/payments/preview` | `backend/app/routers/payments.py` | `src/pages/Payments.jsx` |
| Pagos | DELETE | `/payments/{id}` | `backend/app/routers/payments.py` | `src/store/useBackofficeStore.js` |
| Cuentas | GET | `/account-management/principal-accounts` | `backend/app/routers/account_management.py` | `src/store/useBackofficeStore.js` |
| Cuentas | POST | `/account-management/principal-accounts` | `backend/app/routers/account_management.py` | `src/store/useBackofficeStore.js` |
| Cuentas | GET | `/account-management/client-accounts` | `backend/app/routers/account_management.py` | `src/store/useBackofficeStore.js` |
| Cuentas | POST | `/account-management/client-accounts` | `backend/app/routers/account_management.py` | `src/store/useBackofficeStore.js` |
| Cuentas | PUT | `/account-management/client-accounts/{id}` | `backend/app/routers/account_management.py` | `src/store/useBackofficeStore.js` |
| Métricas | GET | `/metrics/dashboard` | `backend/app/routers/metrics.py` | `src/store/useBackofficeStore.js` |
| Métricas | PUT | `/metrics/base-costs` | `backend/app/routers/metrics.py` | `src/store/useBackofficeStore.js` |
| Métricas | GET | `/metrics/consistency/payments` | `backend/app/routers/metrics.py` | `src/store/useBackofficeStore.js` |
| Inventario | GET | `/inventory` | `backend/app/routers/inventory.py` | `src/store/useBackofficeStore.js` |
| Inventario | POST | `/inventory` | `backend/app/routers/inventory.py` | `src/store/useBackofficeStore.js` |
| Inventario | PUT | `/inventory/{id}` | `backend/app/routers/inventory.py` | `src/store/useBackofficeStore.js` |
| Inventario | DELETE | `/inventory/{id}` | `backend/app/routers/inventory.py` | `src/store/useBackofficeStore.js` |
| Gastos | GET | `/expenses` | `backend/app/routers/expenses.py` | `src/store/useBackofficeStore.js` |
| Gastos | POST | `/expenses` | `backend/app/routers/expenses.py` | `src/store/useBackofficeStore.js` |
| Gastos | DELETE | `/expenses/{id}` | `backend/app/routers/expenses.py` | `src/store/useBackofficeStore.js` |
| Revendedores | GET | `/resellers` | `backend/app/routers/resellers.py` | `src/store/useBackofficeStore.js` |
| Revendedores | POST | `/resellers` | `backend/app/routers/resellers.py` | `src/store/useBackofficeStore.js` |
| Revendedores | POST | `/resellers/{id}/deliveries` | `backend/app/routers/resellers.py` | `src/store/useBackofficeStore.js` |
| Revendedores | POST | `/resellers/{id}/settlements` | `backend/app/routers/resellers.py` | `src/store/useBackofficeStore.js` |
| Revendedores | DELETE | `/resellers/{id}` | `backend/app/routers/resellers.py` | `src/store/useBackofficeStore.js` |
| POS | GET | `/sales/products` | `backend/app/routers/sales.py` | `src/hooks/usePosCatalog.js` |
| POS | POST | `/sales/products` | `backend/app/routers/sales.py` | `src/hooks/usePosCatalog.js` |
| POS | PATCH | `/sales/products/{id}` | `backend/app/routers/sales.py` | `src/hooks/usePosCatalog.js` |
| POS | GET | `/sales/transactions` | `backend/app/routers/sales.py` | `src/hooks/usePosSales.js` |
| POS | POST | `/sales/transactions` | `backend/app/routers/sales.py` | `src/hooks/usePosSales.js` |

## Checklist de contract tests

### Respuestas JSON (snapshots)
- [ ] `GET /clients` devuelve `ip_address`, `antenna_ip`, `modem_ip`, `antenna_model`, `modem_model` además de `services[]` con `ip_address` y metadatos de red.
- [ ] `GET /clients/{id}` incluye `services[]`, `recent_payments[]` y campos legacy de red.
- [ ] `GET /client-services` incluye `antenna_ip`, `modem_ip`, `antenna_model`, `modem_model` en cada item.
- [ ] `GET /account-management/principal-accounts` y `GET /principal-accounts` responden el mismo shape.
- [ ] `GET /account-management/client-accounts` y `GET /client-accounts` responden el mismo shape.
- [ ] `GET /payments` mantiene `period_key`, `amount`, `method`, `paid_on` con el mismo formato esperado por UI.
- [ ] `POST /payments/preview` conserva los campos `message`, `summary`, `resulting_payment` del preview.
- [ ] `GET /metrics/dashboard` conserva el shape esperado por el dashboard (totales, breakdowns).
- [ ] `GET /inventory` mantiene `ip_address` y campos base del inventario.

### Validaciones y compatibilidad
- [ ] Migraciones crean/actualizan vistas (`client_network_compat`, `payments_compat_view`) sin errores en SQLite y Postgres.
- [ ] Campos nuevos se agregan sin eliminar los legacy hasta que el frontend migre completamente.
- [ ] Respuestas paginadas siguen usando `items`, `total`, `limit`, `skip`.

### Flujos críticos
- [ ] Alta de cliente + asignación de servicio refleja IPs en `client_network_compat`.
- [ ] Actualización de servicio cambia IP/reservas y actualiza el snapshot del cliente.
- [ ] Alta de cuentas (principal y cliente) funciona usando `/account-management/*` y mantiene compatibilidad con rutas legacy.
