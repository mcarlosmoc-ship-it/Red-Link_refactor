# Estado actual de la carga masiva de clientes

La funcionalidad de importación CSV sigue disponible en el código, pero la interfaz actual no expone ningún punto de entrada:

- El modal `ImportClientsModal` permanece implementado con instrucciones, lista de columnas y carga del archivo, pero se renderiza solo cuando se invoca explícitamente porque retorna `null` si la propiedad `isOpen` es falsa.
- El store `useBackofficeStore` mantiene la acción `importClients(file)`, que valida el CSV, envía el contenido al endpoint `/clients/import` y luego actualiza clientes y métricas.
- La página de Clientes (`Clients.jsx`) no monta ni referencia el modal ni la acción de importación, por lo que el usuario no puede abrir el flujo desde la UI.

En resumen, la importación no se eliminó; simplemente quedó sin botón ni invocación tras el rediseño de la página de clientes, de modo que habría que re-integrarla donde corresponda (por ejemplo, en la lista de clientes) para volver a usarla.

## Pasos requeridos para igualar el flujo de Wisphub
- **Plantilla mixta cliente + servicios.** Extender la CSV para permitir múltiples servicios por cliente en la misma carga (columnas `service_1_plan`, `service_1_price`, `service_1_ip`, etc., o filas adicionales), validando duplicados de IP/cliente igual que Wisphub.
- **Proceso doble en backend.** Ajustar `/clients/import` para crear el cliente y luego iterar sus servicios hijos en una sola transacción, devolviendo un resumen de altas/errores por servicio.
- **UI con feedback granular.** Actualizar el modal para describir el formato tipo Wisphub, mostrar conteos por servicio y resaltar filas con errores específicos (plan inexistente, IP duplicada, falta de precio) antes de permitir reintentar.
