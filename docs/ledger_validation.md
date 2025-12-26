# Ledger de servicios: validación y hardening

## Cómo se calculan los campos
- **balance_due**: suma de `amount - allocated_amount` por cada cargo no `void` del servicio (incluye cargos parciales).
- **months_due**: cuenta de cargos con `open_amount > 0`, por lo que un pago parcial sigue contando el cargo como adeudado.
- **next_due_date**: `MIN(due_date)` entre los cargos con `open_amount > 0`; `null` si no hay cargos o todos están en cero.
- **due_soon**: `next_due_date <= hoy + 7 días` (incluye atrasos y próximos vencimientos); `false` cuando `next_due_date` es `null`.
- **Servicios nuevos / sin cargos**: el endpoint devuelve `balance_due = 0`, `months_due = 0`, `due_soon = false`, `next_due_date = null`.

## Vista `service_ledger_balances`
- **Tipo**: VIEW materializada en la base de datos (no es un cálculo en la app).
- **Compatibilidad**: la definición usa funciones de fecha soportadas por SQLite (dev) y PostgreSQL (prod). El Alembic recreate se encarga de que exista en ambos entornos.
- **Cobertura**: incluye todos los `client_services` aunque aún no tengan cargos (balance en cero), para que los dashboards no requieran un `LEFT JOIN` adicional.

## Hardening aplicado en Etapa 1
- **Ledger**:
  - Índices nuevos:
    - `service_charges(subscription_id, due_date, status)` para consultas de vencimientos.
    - `service_charges(client_id, period_key)` para listados por cliente/mes.
    - `service_charge_payments(charge_id)` y `(payment_id)` para repartir pagos y auditoría.
- **IP**:
  - Se mantiene `uq_base_ip_reservations_unique_ip` como autoridad de unicidad por base/pool.
  - `client_services.primary_ip_reservation_id` sigue siendo la referencia canónica; los campos de texto (`antenna_ip`, `modem_ip`) quedan deprecados para evitar duplicar la IP.
- **Campos legacy de deuda**:
  - `update_service_debt` arroja error y no persiste cambios; solo `GET /client-services/{id}/debt` expone los valores legados.

## Ejemplo mínimo (3 servicios)
_Asumiendo hoy = 2025-02-10 para el cálculo de `due_soon`._

| Servicio | Cargos (monto / due_date / status) | Pagos aplicados | Resultado `/client-services/{id}/ledger-balance` |
| --- | --- | --- | --- |
| A (al día) | 2025-01 (100 / 2025-01-10 / posted) | 100 aplicado al cargo | `{"balance_due": 0, "months_due": 0, "due_soon": false, "next_due_date": null}` |
| B (vencido) | 2025-01 (80 / 2025-01-05 / posted) | Ninguno | `{"balance_due": 80, "months_due": 1, "due_soon": true, "next_due_date": "2025-01-05"}` (atrasado, entra en due_soon) |
| C (pago parcial) | 2025-02 (120 / 2025-02-12 / posted) | 50 aplicado al cargo | `{"balance_due": 70, "months_due": 1, "due_soon": true, "next_due_date": "2025-02-12"}` (pago parcial sigue contando en months_due y el vencimiento cae dentro de 7 días) |

Estos resultados coinciden con la lógica del endpoint y la vista, asegurando que `months_due` refleja cargos abiertos (aunque sean parciales) y que `due_soon` cubre tanto atrasos como vencimientos próximos.
