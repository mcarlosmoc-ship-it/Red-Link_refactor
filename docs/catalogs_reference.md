# Catálogos y enumeraciones compartidas

Este documento resume los catálogos centrales (tablas o ENUM de Postgres) que deben consumir los equipos de frontend para evitar inconsistencias.

## Estados de cuentas de clientes (`client_accounts.estatus`)

**Catálogo central:** ENUM `client_account_status_enum`

Valores permitidos:

- `activo`
- `suspendido`
- `moroso`

## Perfiles de cuentas (`client_accounts.perfil`)

**Catálogo central:** tabla `client_account_profiles`

- Columna clave: `client_account_profiles.profile`.
- Agrega nuevos perfiles insertando registros en la tabla antes de usarlos en `client_accounts`.

Consulta sugerida:

```sql
SELECT profile, description
FROM client_account_profiles
ORDER BY profile;
```

## Métodos de pago (pagos de servicios y cuentas)

**Catálogo central:** ENUM `payment_method_enum`

Valores permitidos:

- `Mixto`
- `Efectivo`
- `Transferencia`
- `Tarjeta`
- `Revendedor`
- `Otro`

Se usa en las columnas:

- `service_payments.method`
- `legacy_payments.method`
- `payments.metodo_pago`
- `pos_sales.payment_method`
- `payment_schedules.method`

## Tipos de cliente (`clients.client_type`)

**Catálogo central:** ENUM `client_type_enum`

Valores permitidos:

- `residential`
- `token`

## Estado del servicio del cliente (`clients.service_status`)

**Catálogo central:** ENUM `client_service_status_enum`

Valores permitidos:

- `Activo`
- `Suspendido`

## Estado operativo de servicios (`client_services.status`)

**Catálogo central:** ENUM `client_service_status_enum`

Valores permitidos:

- `active`
- `suspended`
- `cancelled`
- `pending`

## Categoría de planes de servicio (`service_plans.category`)

**Catálogo central:** ENUM `service_plan_category_enum`

Valores permitidos:

- `internet`
- `streaming`
- `hotspot`
- `point_of_sale`
- `other`

## Categorías de gastos (`expenses`)

**Catálogo central:** tabla `expense_categories`

- Clave: `expense_categories.expense_category_id`
- Nombre: `expense_categories.name`

Consulta sugerida:

```sql
SELECT expense_category_id, name, description
FROM expense_categories
WHERE is_active = true
ORDER BY name;
```
