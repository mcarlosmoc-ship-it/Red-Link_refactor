# Postgres-first migration: `base_stations`, `subscriptions` y normalización de `service_type`

## Contrato de esquema (estado final)
- Tablas canónicas: `base_stations` y `subscriptions`.
- Llaves foráneas:
  - `clients.base_id` → `base_stations.base_id` (`CASCADE` en `UPDATE`).
  - `client_services.base_id` → `base_stations.base_id` (`SET NULL` en `DELETE`).
  - `service_charges.subscription_id` → `subscriptions.subscription_id` (`CASCADE` en `DELETE`).
- `zones` se mantiene solo como legado de referencia durante la transición; no participa en nuevas FKs ni vistas. Puede eliminarse en un corte posterior.

## Mapeo `zones` → `base_stations`
- Se reutiliza el identificador numérico (`base_id = zone_id`) para preservar compatibilidad con datos existentes.
- Campos copiados: `code`, `name`, `location`, `notes` (con `location` saneado a `''` cuando es `NULL`).
- Índices de cobertura se recrean sobre `base_id` en `clients` y `client_services`.
- FKs previas a `zones` se sustituyen por FKs a `base_stations`.

## Estrategia de `subscriptions`
- Relación 1:1 con `client_services` mediante `subscriptions.service_id` (`UNIQUE`).
- Poblado inicial: una `Subscription` por cada `client_service` existente, preservando `client_id` y `service_plan_id`. El `status` se mapea 1:1 (`active/suspended/cancelled/pending`).
- `service_charges` se reconecta vía `subscription_id` canónico (se rellena desde `client_service_id` o `client_id` cuando aplica).

## Normalización `service_type`
- Valores granulares válidos: `internet_private`, `internet_tokens`, `streaming_spotify`, `streaming_netflix`, `streaming_vix`, `public_desk`, `point_of_sale`, `other`.
- Tabla de mapeo legacy → granular usada en la migración y validación:
  - `internet` → `internet_private`
  - `hotspot` → `internet_tokens`
  - `streaming` → `streaming_netflix` (proveedor por defecto en ausencia de metadatos).
- El almacenamiento en DB posterior a la migración usa únicamente valores granulares; los aliases se aceptan solo como entrada y se normalizan antes de persistir.

## Compatibilidad y alias (`zone_id`)
- El contrato oficial en API/DB es `base_id`.
- Alias `zone_id` se mantiene en modelos como sinónimo (no como columna dedicada) para lectura transitoria. La eliminación definitiva depende de la adopción del frontend y podrá programarse tras dos ciclos de release alineados.

## Riesgos y rollback
- Migración de datos marcada como parcialmente irreversible: los IDs se preservan, pero no se recrean datos legacy si se aplica `downgrade`.
- Requiere PostgreSQL como entorno primario (`REQUIRE_POSTGRES=1` recomendado en `.env`).
- SQLite queda soportado solo para desarrollo rápido; no garantiza paridad en esta ruta de migración.
