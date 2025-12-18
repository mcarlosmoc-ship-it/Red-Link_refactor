# Instrucción breve para solicitar mejoras de clientes/servicios/IP

Solicita un cambio que:

- Mantenga el catálogo de planes en `service_plans` y la contratación en `client_services`, usando `custom_price` cuando se requiera.
- Conserve `service_status` y `zone_id` en `clients` solo como estado/ubicación global; los estados y bases finos viven en cada `client_service`.
- Separe la gestión de IP en tablas dedicadas (`ip_pools`/`ip_reservations`) enlazadas a `client_services` e inventario, sin fijar la IP en el contrato.
- Registre pagos por servicio en `service_payments` vinculados al periodo (`period_key`) y al contrato (`client_service_id`).

Esta redacción resume los ajustes solicitados y deja claro dónde se alojan planes, contratos, IPs y pagos.

## Recomendaciones profesionales para gestionar IPs

- Usa **`ip_pools`** (o `base_ip_pools`) para definir bloques CIDR por base/zona y distinguir rango público/privado.
- Administra las asignaciones en **`ip_reservations`** con estado (`free`, `reserved`, `in_use`, `quarantine`) y vínculos opcionales a `client_service_id`, `client_id` e `inventory_item_id`.
- Registra la trazabilidad en **`ip_assignment_history`** (quién asignó, cuándo, motivo, IP previa/nueva) para auditoría.
- Conecta la IP al inventario cuando aplique (`inventory_item_id`) en lugar de fijarla en el contrato; cambia el equipo sin tocar el servicio.
- Gestiona liberación y rotación: libera IP al cancelar/cambiar servicio o equipo; aplica cuarentena antes de volver a ponerla en `free`.
- Expone reportes operativos por pool/base y validador de duplicados para evitar conflictos.

## Tareas sugeridas

1. Crear/ajustar tablas `ip_pools`, `ip_reservations` y `ip_assignment_history` con columnas y estados propuestos.
2. Integrar asignación de IP al flujo de alta/edición de servicios: reservar desde el pool correspondiente y asociar a `client_services`/`inventory_items`.
3. Implementar jobs de higiene: liberar IPs huérfanas, pasar a cuarentena al cancelar servicios/equipos y validar duplicados.
4. Añadir reportes y paneles por pool/base para capacidad disponible y uso actual.
5. Documentar el proceso operativo (asignar, cambiar, liberar IP) y los checks automáticos para soporte y NOC.
