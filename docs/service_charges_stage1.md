# Etapa 1: Núcleo de facturación recurrente (documento técnico)

Este documento es la referencia técnica para ejecutar la **Etapa 1** de la
reingeniería del modelo de datos. El objetivo es introducir un núcleo auditable
**suscripción → cargo → pago** de forma **aditiva y segura en producción**, sin
romper la operación actual.

---

## 1) Objetivo de la Etapa 1

**Problemas del modelo actual que se atacan en este bloque:**

- No existe un concepto formal de **cargo mensual** (invoice/charge) por periodo.
- La deuda real y los pagos parciales dependen del backend y de resúmenes.
- El historial de cobros no es audit-able por periodo.

**Prioridad del bloque:**

- Establecer un **núcleo financiero estable** que permita calcular deuda real,
  pagos parciales y reportes confiables sin “trucos”.
- Habilitar la transición a un modelo profesional tipo WISP/Wisphub sin romper
  servicios existentes.

---

## 2) Diseño propuesto (modelo objetivo)

> Nota: Este diseño es **aditivo**. En Etapa 1 no se eliminan tablas actuales.

### 2.1 Tablas nuevas (objetivo)

#### A) `services_catalog`
**Propósito:** Catálogo de servicios/planes (extensible sin migraciones).

**Campos clave:**
- `service_id` (PK)
- `code` (unique)
- `name`
- `category` (internet/streaming/hotspot/otros)
- `billing_policy` (mensual/anual/variable)
- `default_price`, `currency`
- `status`, `created_at`

**Relaciones:**
- Referenciado por `client_service_subscriptions.service_id`.

**Constraints/Índices:**
- `UNIQUE(code)`

#### B) `client_service_subscriptions`
**Propósito:** Suscripción/contrato de un cliente a un servicio del catálogo.

**Campos clave:**
- `subscription_id` (PK)
- `client_id` (FK → clients)
- `service_id` (FK → services_catalog)
- `active_from`, `active_to`
- `status`
- `custom_price`
- `billing_day`

**Relaciones:**
- 1:N con `service_charges`.

**Constraints/Índices:**
- Índice por `client_id`
- Índice por `service_id`

#### C) `service_charges`
**Propósito:** Cargos mensuales por periodo y suscripción.

**Campos clave:**
- `charge_id` (PK)
- `subscription_id` (FK → client_service_subscriptions)
- `client_id` (FK → clients)
- `period_key` (FK → billing_periods)
- `charge_date`, `due_date`
- `amount`
- `status` (pending/invoiced/partially_paid/paid/void)

**Constraints/Índices importantes:**
- **UNIQUE(`subscription_id`, `period_key`)**
- `CHECK amount >= 0`
- Índices por `client_id`, `period_key`, `status`

#### D) `charge_payments` (o `service_charge_payments`)
**Propósito:** Asignación de pagos a cargos (soporta parcialidades/adelantos).

**Campos clave:**
- `allocation_id` (PK)
- `charge_id` (FK → service_charges)
- `payment_id` (FK → service_payments)
- `amount`, `applied_on`

**Constraints/Índices importantes:**
- `CHECK amount >= 0`
- `UNIQUE(charge_id, payment_id)`

---

### 2.2 Reglas protegidas por la base de datos

- Un cargo único por suscripción y periodo (constraint UNIQUE).
- Montos no negativos (CHECK).
- Integridad referencial por FKs (suscripción → cargo → pago).

### 2.3 Reglas que siguen en backend

- Generación mensual de cargos por servicio activo.
- Aplicación de pagos parciales a uno o varios cargos.
- Cálculo de estado (`paid`/`partially_paid`).
- Priorización de cargos al asignar pagos (FIFO o por fecha).

---

## 3) Relación con el modelo actual (transición)

### 3.1 Fuente de verdad durante transición

- **Pagos existentes**: `service_payments` sigue siendo la fuente principal.
- **Servicios activos**: `client_services` mantiene el vínculo cliente ↔ servicio.

### 3.2 Dual write

- Cada pago nuevo se escribe en `service_payments`.
- En paralelo, se asigna en `service_charge_payments`.
- Si el cargo del periodo no existe, se crea antes de aplicar el pago.

### 3.3 Compatibilidad / deprecated (sin borrar)

- `client_services.debt_months` y `clients.debt_months` quedan **solo lectura**.
- `service_payments.months_paid` permanece solo por compatibilidad.

---

## 4) Plan de backfill

### 4.1 Fecha de corte

- **Definir `cutoff_date = YYYY-MM-01`.**
- Periodos **anteriores** a la fecha de corte se consideran históricos.
- Periodos **desde** la fecha de corte se calculan con el modelo nuevo.

### 4.2 Mapeo `client_services` → `client_service_subscriptions`

- `subscription_id = client_services.client_service_id`
- `client_id = client_services.client_id`
- `service_id` se deriva del catálogo (ver 4.3).
- `custom_price = client_services.custom_price`

### 4.3 Generación de catálogo desde lo existente

- Crear entradas en `services_catalog` a partir de `service_plans` actuales.
- Mapear `client_services.service_plan_id → services_catalog`.
- Resolver nombres duplicados con `code` normalizado.

### 4.4 Generación de cargos

- Para cada suscripción activa, generar cargos desde `cutoff_date`.
- `amount = COALESCE(custom_price, service_plans.monthly_price)`
- `period_key` calculado con `billing_periods`.

### 4.5 Casos borde / manuales

- Servicios sin `service_plan_id` activo.
- Pagos sin `period_key`.
- Cambios retroactivos de precio o servicio.

---

## 5) Validaciones y checks

### 5.1 Totales legacy vs nuevos (por periodo)

```sql
SELECT period_key, SUM(amount) AS legacy_total
FROM service_payments
GROUP BY period_key
ORDER BY period_key DESC;
```

```sql
SELECT period_key, SUM(amount) AS charge_total
FROM service_charges
GROUP BY period_key
ORDER BY period_key DESC;
```

### 5.2 Pagos asignados vs pagos registrados

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

### 5.3 Duplicados de cargos

```sql
SELECT subscription_id, period_key, COUNT(*)
FROM service_charges
GROUP BY subscription_id, period_key
HAVING COUNT(*) > 1;
```

---

## 6) Riesgos y mitigación

**Riesgos:**
- Inconsistencias durante dual write.
- Backfill incompleto por datos legacy faltantes.
- Rendimiento en consultas de reporting.

**Mitigaciones:**
- Validaciones paralelas por periodo antes de corte final.
- Reportes de diferencias y reconciliación manual.
- Índices por `period_key`, `client_id`, `status`.

**Rollback:**
- Mantener `service_payments` como fuente principal hasta estabilizar.
- Desactivar dual write mediante feature flag.
- Conservar nuevas tablas sin afectar flujos legacy.

---

## 7) Orden de ejecución

1. **Migraciones Alembic (aditivas)**
   - Crear `service_charges` y `service_charge_payments`.
   - Crear `services_catalog` y `client_service_subscriptions` (si no existen aún).
2. **Backfill inicial**
   - Catálogo → suscripciones → cargos.
3. **Dual write**
   - Backend escribe pagos en legacy + asignación en cargos.
4. **Validaciones**
   - Comparar totales y asignaciones.
5. **Transición**
   - Reportes leen del nuevo núcleo.
   - Legacy queda solo lectura hasta retiro definitivo.

---

## Alcance de Etapa 1 (resumen)

- **Incluye**: Catálogo + suscripciones + cargos + asignaciones + dual write.
- **No incluye**: reestructurar historial de IPs/equipos ni eliminar tablas legacy.

Este documento es la referencia oficial para ejecutar el bloque con seguridad.
