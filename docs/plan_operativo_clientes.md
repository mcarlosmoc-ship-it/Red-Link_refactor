# Plan operativo para panel de clientes

## Brechas actuales
- El formulario de alta de clientes sólo muestra planes de internet en "Servicio inicial" por el filtro `(plan.serviceType ?? plan.category) === 'internet'`, de modo que no se pueden elegir otros planes activos ni capturar sus campos específicos. 【F:src/features/clients/ClientForm.jsx†L24-L73】
- Al asignar servicios existentes, el selector excluye únicamente los planes `token`, pero tampoco despliega campos dinámicos para precios o datos propios de cada tipo (IP/base para internet, credenciales para OTT, etc.). 【F:src/features/clients/ServicesAssignments.jsx†L12-L68】
- La importación masiva está implementada (modal y acción `importClients`) pero no tiene punto de entrada en la UI, y la plantilla actual sólo contempla datos del cliente, no de sus servicios. 【F:docs/client_import_status.md†L1-L13】【F:src/components/clients/ImportClientsModal.jsx†L1-L120】【F:src/store/useBackofficeStore.js†L820-L857】
- La selección múltiple de clientes sigue disponible a nivel de store pero no se expone en la pantalla actual. 【F:docs/client_selection_status.md†L1-L13】

## Lineamientos de paridad con Wisphub

- Replicar el flujo de alta/edición de servicios como en Wisphub: el plan define los campos obligatorios y el precio base, y los atributos específicos (IP, CPE, credenciales) se guardan en la tabla de servicios del cliente, no en `clients`.
- La importación masiva debe aceptar clientes con uno o varios servicios en la misma carga, asignando IP/estado/precio por servicio y validando duplicados como lo hace Wisphub.
- La selección múltiple y las acciones en lote deben funcionar sobre la misma tabla con checkboxes y un panel de acciones masivas, manteniendo el comportamiento existente de `bulkAssignClientServices`.

## Tareas a implementar

1) **Seleccionar cualquier plan activo al crear cliente**
- Eliminar el filtro por tipo "internet" en `ClientForm` y usar el catálogo completo (excluyendo sólo planes técnicos como `token` si aplica), emulando el dropdown único de Wisphub.
- Añadir texto de ayuda que explique que el servicio inicial es opcional y que su precio proviene del plan elegido, no de la tarifa mensual del cliente.

2) **Campos dinámicos según el plan elegido**
- Extender `servicePlans` con metadatos de requerimientos (ej. `{ requiresIp: true, requiresBase: true, requiresCredentials: false }`) o derivarlos por `serviceType`, igual que Wisphub marca los servicios de internet con `requires_ip` y `requires_onu`.
- Actualizar el estado `serviceState`/`createInitialServiceState` para incluir campos condicionales (`ip`, `antennaIp`, `modemModel`, `price`, etc.).
- Renderizar inputs dinámicos en `ClientForm` y `ServicesAssignments` según el plan seleccionado; validar antes de enviar y mapear al payload de `client_services`.

3) **Persistir datos completos del servicio asignado**
- Incluir en el payload de creación/asignación de servicios el precio efectivo (custom o del plan), IP/base y notas, guardándolos en la tabla de servicios del cliente, no en `clients`.
- Mostrar dichos atributos en la lista de servicios del cliente y permitir editarlos (precio, IP, estado) desde el panel.

4) **Importación masiva al estilo Wisphub (clientes + servicios)**
- Extender la plantilla CSV para admitir columnas de servicio principal (plan, precio, IP/base, estado) y múltiples servicios opcionales en filas adicionales o en columnas numeradas (`service_1_*`), siguiendo el layout de importación de Wisphub (cliente + servicios hijos en la misma plantilla).
- Actualizar `ImportClientsModal` para describir el nuevo formato, validar CSV y mostrar un resumen de servicios creados/errores por fila.
- Adaptar el endpoint `/clients/import` y la acción `importClients` para crear primero clientes y luego sus servicios asociados dentro de la misma carga, manteniendo la lógica de refresco de clientes y métricas.

5) **Reintegrar herramientas ocultas en la UI**
- Volver a montar el botón de "Importar clientes" que abra `ImportClientsModal` en la página de clientes.
- Reintroducir selección múltiple de clientes (checkboxes en filas, estado de `selectedClientIds`) y un flujo para aplicar `bulkAssignClientServices` con el plan elegido.
- Añadir mensajes de confirmación y estados de proceso para evitar acciones simultáneas que puedan causar inconsistencias.
