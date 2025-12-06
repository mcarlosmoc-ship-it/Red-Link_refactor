# Estado de selección múltiple de clientes

La pantalla de clientes ya soporta selección múltiple y acciones en lote:

- `ClientsList.jsx` agrega checkboxes por fila, un selector maestro por página y barra de acciones para asignar plan, suspender/reactivar o eliminar en lote. 【F:src/features/clients/ClientsList.jsx†L68-L214】
- `Clients.jsx` controla los IDs seleccionados, los pasa a la lista y enruta las acciones a `bulkAssignClientServices` y cambios de estado. Tras cada acción muestra un reporte por cliente con éxitos/errores y mantiene la selección bloqueada durante las mutaciones. 【F:src/pages/Clients.jsx†L401-L706】【F:src/features/clients/flows.js†L1-L155】

## Paridad esperada con Wisphub
- **Checkboxes en tabla.** Ya presentes por fila y maestro por página.
- **Barra de acciones masivas.** Activa cuando hay selección y muestra el resumen por cliente al terminar.
- **Estados bloqueantes.** Se deshabilitan controles durante ejecución (`isSelectionActionRunning`) y se preserva el reporte hasta que el usuario lo limpia.
