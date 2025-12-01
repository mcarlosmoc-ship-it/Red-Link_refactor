# Estado actual de la carga masiva de clientes

La importación CSV vuelve a estar expuesta en la UI y soporta clientes con varios servicios por fila:

- El botón **Importar CSV** está disponible en la cabecera de la lista de clientes y abre `ImportClientsModal` con instrucciones y resumen de resultados.
- El store `useBackofficeStore` mantiene la acción `importClients(file)`, que valida el CSV, envía el contenido al endpoint `/clients/import` y luego actualiza clientes y métricas.
- La plantilla ahora incluye bloques hasta `service_3_*` (plan, estado, día de cobro, base, IP, equipo y precio personalizado) para reflejar múltiples servicios por cliente y valida que las IPs no estén repetidas.

## Pasos requeridos para igualar el flujo de Wisphub
- **Plantilla mixta cliente + servicios.** Extender la CSV para permitir múltiples servicios por cliente en la misma carga (columnas `service_1_plan`, `service_1_price`, `service_1_ip`, etc., o filas adicionales), validando duplicados de IP/cliente igual que Wisphub.
- **Proceso doble en backend.** Ajustar `/clients/import` para crear el cliente y luego iterar sus servicios hijos en una sola transacción, devolviendo un resumen de altas/errores por servicio.
- **UI con feedback granular.** Actualizar el modal para describir el formato tipo Wisphub, mostrar conteos por servicio y resaltar filas con errores específicos (plan inexistente, IP duplicada, falta de precio) antes de permitir reintentar.
