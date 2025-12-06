# Plan operativo para panel de clientes

## Estado actual

- El alta de clientes se limita a datos básicos (tipo, nombre, ubicación, zona y notas) y no solicita servicio inicial; los servicios se asignan después. 【F:src/features/clients/ClientForm.jsx†L14-L115】
- Las asignaciones de servicio ya permiten elegir cualquier plan activo excepto `token`, precargar la tarifa del plan y mostrar campos condicionales de base, IP y equipo según los metadatos del plan. 【F:src/features/clients/ServicesAssignments.jsx†L31-L209】【F:src/utils/servicePlanMetadata.js†L1-L99】
- El payload de creación/edición de servicio incluye precio personalizado, base, IPs, modelos de equipo, adeudos y notas, y los servicios listados muestran estos atributos. 【F:src/features/clients/ServicesAssignments.jsx†L89-L151】【F:src/features/clients/ServicesAssignments.jsx†L240-L355】
- La importación masiva tiene entrada visible (botón "Importar CSV"), descarga de plantilla autenticada con columnas de cliente y servicio, y permite elegir columnas opcionales desde el modal. 【F:src/features/clients/ClientsList.jsx†L205-L259】【F:src/components/clients/ImportClientsModal.jsx†L1-L157】
- La tabla de clientes ya expone selección múltiple, checkboxes por fila y acciones masivas para asignar plan, cambiar estado o eliminar. 【F:src/features/clients/ClientsList.jsx†L19-L218】【F:src/pages/Clients.jsx†L618-L706】

## Lineamientos de paridad con Wisphub

- Replicar el flujo de alta/edición de servicios como en Wisphub: el plan define los campos obligatorios y el precio base, y los atributos específicos (IP, CPE, credenciales) se guardan en la tabla de servicios del cliente, no en `clients`.
- La importación masiva debe aceptar clientes con uno o varios servicios en la misma carga, asignando IP/estado/precio por servicio y validando duplicados como lo hace Wisphub.
- La selección múltiple y las acciones en lote deben funcionar sobre la misma tabla con checkboxes y un panel de acciones masivas, manteniendo el comportamiento existente de `bulkAssignClientServices`.
- Columnas `tarifa`/`ip` en la tabla `clientes` son obsoletas y no deben usarse; la tarifa efectiva se toma del `servicio_mensual (client_services)` asociado. Se puede considerar una migración futura para marcarlas como `NULL` o eliminarlas.

## Tareas a implementar

1) **Validación y obligatoriedad por plan**
- Asegurar que las reglas de `resolvePlanRequirements` se reflejen en validaciones de frontend y backend (IPs/base/equipo/credenciales) y que los errores se muestren antes de enviar. 【F:src/features/clients/ServicesAssignments.jsx†L105-L153】【F:src/utils/serviceFormValidation.js†L1-L132】

2) **Plantilla y flujo de importación**
- La descarga de plantilla ahora usa `GET /clients/import/template` e incluye presets (básico, avanzado y solo servicios) para seleccionar columnas opcionales manteniendo la documentación de 1 fila = 1 servicio. 【F:src/components/clients/ImportClientsModal.jsx†L62-L166】【F:docs/isp_review.md†L26-L77】

3) **Resumen operativo en la lista de clientes**
- Incorporar vista compacta del servicio principal (plan, estado, IP/base) y filtros por servicio en la tabla de clientes para alinear con Wisphub/Splynx. 【F:docs/isp_review.md†L44-L50】

4) **Acciones masivas con feedback granular**
- Mantener barra de acciones en lote para asignar planes/cambiar estado/eliminar y añadir reportes de éxito/error por cliente para evitar ambigüedad al operar con múltiples IDs. 【F:src/features/clients/ClientsList.jsx†L146-L214】
