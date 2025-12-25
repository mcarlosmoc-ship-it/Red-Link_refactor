# Data authority and hardening plan

## Canonical sources
- **Estado del servicio**: `client_services.status` (`ClientService.status`) es la autoridad única para activo/suspendido/cancelado; el frontend debe consumir directamente ese campo y no inferirlo. La propiedad `Client.service_status` solo refleja ese mismo estado para compatibilidad.
- **Deuda / meses adeudados**: el balance se deriva únicamente del ledger (`service_charges`, `service_payments`, `service_charge_payments`) expuesto en la vista `service_ledger_balances` y el endpoint `/client-services/{id}/ledger-balance`.
- **IP**: `base_ip_reservations` mantiene la autoridad (IP única por base/pool) y `client_services` referencia la reserva primaria vía `primary_ip_reservation_id`.

## Campos deprecated (solo lectura)
- `client_services.debt_amount`
- `client_services.debt_months`
- `client_services.debt_notes`
- Endpoints de adeudo manual (`PUT /client-services/{id}/debt`) rechazan escrituras y se mantienen solo para compatibilidad en lectura.

## Etapa 1 – migraciones Alembic
1) **Vista de adeudos por ledger**: `service_ledger_balances` suma cargos y pagos por servicio, calcula `balance_due`, `months_due`, `due_soon` y `next_due_date`.
2) **Puerta de escritura legacy**: mantener los campos legacy pero bloquear escrituras a nivel de servicio (capa de aplicación) mientras se migra el frontend.
3) **Convergencia de estado**: documentar `client_services.status` como única autoridad y usarlo en las consultas de métricas/consumos existentes.
4) **IP consistente**: conservar la constraint `uq_base_ip_reservations_unique_ip` y el uso de `primary_ip_reservation_id`; futuras migraciones podrán eliminar los textos de IP duplicados (`antenna_ip`, `modem_ip`).
