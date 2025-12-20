# Etapa 1: cargos recurrentes por servicio (modelo aditivo)

Este documento define el plan de **migración aditiva** para introducir cargos mensuales
por servicio, manteniendo compatibilidad con el flujo legacy.

## Objetivo del bloque

- Establecer un núcleo auditable: **suscripción → cargo → pago**.
- Evitar migraciones repetidas al agregar servicios nuevos (catálogo ya existente).
- Mantener producción estable mediante **dual write** y validaciones paralelas.

## DDL (resumen funcional)

- `service_charges`: cargos mensuales por servicio y periodo.
  - `UNIQUE (subscription_id, period_key)` evita duplicar el mismo cargo.
- `service_charge_payments`: asignación de pagos a cargos (parcialidades/adelantos).

## Plan de backfill (con fecha de corte)

1. **Definir fecha de corte**: `cutoff_date = YYYY-MM-01`.
   - Periodos anteriores a `cutoff_date` se consideran **históricos**.
   - Periodos posteriores (incluyendo el corte) se calculan con el flujo nuevo.
2. **Mapeo desde `client_services`**:
   - Crear un cargo por cada servicio activo y por cada periodo desde el corte.
   - `subscription_id = client_services.client_service_id`
   - `client_id = client_services.client_id`
   - `amount = COALESCE(client_services.custom_price, service_plans.monthly_price)`
3. **Pagos legacy**:
   - Para pagos existentes en `service_payments`, generar asignaciones
     en `service_charge_payments` para el periodo correspondiente.
4. **Estado de cargos**:
   - `paid` si el total asignado cubre el monto del cargo.
   - `partially_paid` si hay asignación parcial.
   - `pending` si no hay asignaciones.

## Validaciones (legacy vs nuevo)

### 1) Comparar totales por periodo

```sql
SELECT
  period_key,
  SUM(amount) AS legacy_total
FROM service_payments
GROUP BY period_key
ORDER BY period_key DESC;
```

```sql
SELECT
  period_key,
  SUM(amount) AS charge_total
FROM service_charges
GROUP BY period_key
ORDER BY period_key DESC;
```

### 2) Comparar pagos aplicados vs pagos registrados

```sql
SELECT
  sp.payment_id,
  sp.amount AS payment_amount,
  COALESCE(SUM(scp.amount), 0) AS allocated_amount
FROM service_payments sp
LEFT JOIN service_charge_payments scp ON scp.payment_id = sp.payment_id
GROUP BY sp.payment_id, sp.amount
HAVING COALESCE(SUM(scp.amount), 0) <> sp.amount;
```

### 3) Verificar cargos duplicados

```sql
SELECT subscription_id, period_key, COUNT(*)
FROM service_charges
GROUP BY subscription_id, period_key
HAVING COUNT(*) > 1;
```

## Estrategia de dual write / compatibilidad

1. **Dual write**:
   - Cada nuevo pago generado escribe en `service_payments`.
   - Se asigna simultáneamente a `service_charge_payments`.
   - Si el cargo del periodo no existe, se crea antes de asignar.
2. **Compatibilidad**:
   - El backend sigue leyendo `service_payments` como fuente legacy.
   - La nueva vista/reporting toma `service_charges` + asignaciones.
3. **Deprecación gradual**:
   - `client_services.debt_months` y `clients.debt_months` pasan a solo lectura.
   - `service_payments.months_paid` se conserva solo para compatibilidad.

## Transición → Modelo objetivo

- **Transición**: dual write y validaciones paralelas hasta cerrar brecha de datos.
- **Modelo objetivo**: reporte y cobranza dependen de `service_charges` y
  `service_charge_payments`, con `service_payments` como respaldo histórico.
