# Estado actual de la carga masiva de clientes

La importación CSV ahora permite mezclar datos del cliente con hasta dos servicios por fila, alineada con el flujo esperado de Wisphub:

- El botón **Importar CSV** sigue disponible en la lista de clientes y abre `ImportClientsModal`, que explica las columnas `service_1_*`/`service_2_*`, permite descargar la plantilla autenticada y muestra resultados por fila con opción de descargar errores. 【F:src/components/clients/ImportClientsModal.jsx†L48-L202】【F:src/components/clients/ImportClientsModal.jsx†L220-L347】
- El store `useBackofficeStore` conserva la acción `importClients(file)` para validar y enviar el CSV al endpoint `/clients/import`, refrescando clientes y métricas tras la carga. 【F:src/store/useBackofficeStore.js†L1011-L1044】
- La plantilla generada por `/clients/import/template` incluye bloques `service_1_*` y `service_2_*` (plan, estado, día de cobro, base, IP y precio) además de datos del cliente, facilitando altas con múltiples servicios en una sola fila. 【F:backend/app/services/clients.py†L80-L135】【F:backend/app/routers/clients.py†L185-L214】

## Alcance cubierto
- **Plantilla mixta cliente + servicios.** El CSV soporta múltiples servicios en la misma fila o filas duplicadas para añadir más de dos servicios al mismo cliente, validando duplicados de IP y consistencia de datos por cliente. 【F:backend/app/services/clients.py†L365-L512】【F:backend/app/services/clients.py†L520-L671】
- **Proceso doble en backend.** `/clients/import` agrupa filas por cliente, crea la cuenta y registra todos sus servicios en una transacción, devolviendo conteos y errores por fila/servicio. 【F:backend/app/services/clients.py†L404-L477】【F:backend/app/services/clients.py†L520-L671】【F:backend/app/services/clients.py†L800-L872】
- **UI con feedback granular.** El modal explica el formato, permite descargar la plantilla autenticada y expone resúmenes por fila con descarga CSV de errores antes de reintentar. 【F:src/components/clients/ImportClientsModal.jsx†L102-L347】
