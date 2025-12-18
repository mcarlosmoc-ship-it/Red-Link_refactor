# Breve instrucción para solicitar actualizaciones de cliente/servicio/IP

Solicitar un cambio que:

- Mantener el catálogo de planes en `service_plans` y la contratación en `client_services`, utilizando `custom_price` cuando sea necesario.
- Mantenga `service_status` y `zone_id` en `clients` solo como estado/ubicación global; los estados y bases granulares residen en cada `client_service`.
- Gestión de IP separada en tablas dedicadas (`ip_pools`/`ip_reservations`) vinculadas a `client_services` e inventario, sin fijar la IP en el contrato.
- Registrar los pagos de servicios en `service_payments` vinculados al periodo (`period_key`) y al contrato (`client_service_id`).

Este texto resume las configuraciones solicitadas y deja claro dónde se alojan los planes, contratos, IP y pagos.

## Recomendaciones profesionales para la gestión de IP

- Utilice **`ip _pools`** (o `base_ ip _pools`) para definir bloques CIDR por base/zona y distinguir el rango público/privado.
- Administrar asignaciones en **`ip_reservations` ** con estado (`free`, `reserved`, `in_use`, `quarantine`) y enlaces opcionales a `client_service_id`, `client_id` e `inventory_item_id`.
- Registrar la trazabilidad en el **` historial de asignación de IP`** (quién asignó, cuándo, motivo, IP anterior/nueva) para auditoría.
- Conecta la IP al inventario cuando aplicas (`inventory_item_id`) en lugar de configurarlo en el contrato; cambia el equipo sin tocar el servicio.
- Administrar liberación y rotación: liberar IP al cancelar/cambiar servicio o equipo; aplicar cuarentena antes de volver a ponerlo en "libre".
- Exponer informes operativos por pool/base y validador duplicado para evitar conflictos.

## Tareas sugeridas

1. Cree/ajuste las tablas `ip_pools`, `ip_reservations` e `ip_assignment_history` con las columnas y estados propuestos.
2. Integrar la asignación de IP al flujo de registro/edición de servicios: reservar del pool correspondiente y asociar a `client_services`/`inventory_items`.
3. Implementar trabajos de higiene: liberar IP huérfanas, poner en cuarentena al cancelar servicios/equipos y validar duplicados.
4. Agregue informes y paneles por grupo/base para conocer la capacidad disponible y el uso actual.
5. Documentar el proceso operativo (asignar, cambiar, liberar IP) y las verificaciones automáticas de soporte y NOC.
