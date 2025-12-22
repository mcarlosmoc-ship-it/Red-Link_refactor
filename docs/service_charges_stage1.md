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

### 3.0 Flujo oficial (service_charges + service_payments + service_charge_payments)

**Orden de registro (fuente de verdad):**

1. **Generar/asegurar el cargo** (`service_charges`) para el servicio y periodo.
2. **Registrar el pago** en `service_payments` (monto total, método, fecha).
3. **Asignar el pago** a uno o varios cargos en `service_charge_payments`.

**Reglas operativas:**

- Los **reportes por periodo** deben leer **montos asignados** en
  `service_charge_payments` unidos a `service_charges.period_key`.
- `service_payments.period_key` queda como **compatibilidad** (fallback para
  pagos antiguos o no asignados).
- La **deuda real** se calcula con cargos vs asignaciones, no con
  `debt_months`/`months_paid`.

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

### 4.0 Estrategia de migración desde `legacy_payments`

**Objetivo:** migrar pagos históricos a `service_payments` y generar sus
asignaciones (`service_charge_payments`) sin romper el frontend viejo.

1. **Migrar registros históricos**:
   - `legacy_payments` → `service_payments` (mismos campos; `client_service_id`
     se resuelve desde `client_services` activos o se marca como pendiente).
2. **Crear cargos retroactivos**:
   - Para cada `period_key` histórico, crear `service_charges` por servicio
     (monto de tarifa vigente).
3. **Asignar pagos**:
   - Para cada pago migrado, crear `service_charge_payments` contra los cargos
     del mismo `period_key`.
   - Si el pago cubre varios periodos, dividir por monto o aplicar FIFO.
4. **Validar consistencia**:
   - `SUM(service_charge_payments.amount)` debe igualar
     `service_payments.amount` por `payment_id`.

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

## 6) Vista de compatibilidad (`payments_compat_view`)

Para mantener el frontend viejo mientras se migra, se recomienda exponer una
vista que entregue el **formato legacy** con datos provenientes del nuevo
flujo:

```sql
CREATE VIEW payments_compat_view AS
SELECT
  sp.payment_id,
  sp.client_id,
  sc.period_key,
  sp.paid_on,
  scp.amount,
  sp.months_paid,
  sp.method,
  sp.note,
  sp.created_at
FROM service_payments sp
JOIN service_charge_payments scp ON scp.payment_id = sp.payment_id
JOIN service_charges sc ON sc.charge_id = scp.charge_id

UNION ALL

SELECT
  sp.payment_id,
  sp.client_id,
  sp.period_key,
  sp.paid_on,
  sp.amount,
  sp.months_paid,
  sp.method,
  sp.note,
  sp.created_at
FROM service_payments sp
WHERE NOT EXISTS (
  SELECT 1 FROM service_charge_payments scp
  WHERE scp.payment_id = sp.payment_id
);
```

> Nota: los pagos asignados aparecen **por cargo/periodo**; los pagos sin
> asignación conservan su `period_key` original.

---

## 7) Riesgos y mitigación

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

## 8) Orden de ejecución

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
