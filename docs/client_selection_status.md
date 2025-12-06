# Estado de selección múltiple de clientes

La pantalla de clientes ya soporta selección múltiple y acciones en lote:

- `ClientsList.jsx` agrega checkboxes por fila, un selector maestro por página y barra de acciones para asignar plan, suspender/reactivar o eliminar en lote. 【F:src/features/clients/ClientsList.jsx†L68-L214】
- `Clients.jsx` controla los IDs seleccionados, los pasa a la lista y enruta las acciones a `bulkAssignClientServices` y cambios de estado. 【F:src/pages/Clients.jsx†L618-L706】【F:src/features/clients/flows.js†L1-L155】

Pendiente: enriquecer el feedback posterior a las acciones masivas (éxitos/errores por cliente) y mantener la selección bloqueada mientras se ejecutan las mutaciones.

## Paridad esperada con Wisphub
- **Checkboxes en tabla.** Ya presentes por fila y maestro por página.
- **Barra de acciones masivas.** Activa cuando hay selección; puede ampliarse con resultados por cliente.
- **Estados bloqueantes.** Se deshabilitan controles durante ejecución (`isSelectionActionRunning`), pero falta mostrar resumen granular de resultados.
