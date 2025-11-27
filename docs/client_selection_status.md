# Estado de selección múltiple de clientes

Tras el rediseño la pantalla de clientes sólo permite seleccionar un cliente a la vez para ver sus detalles y asignar servicios individuales:

- La página `Clients.jsx` mantiene un único `selectedClientId` en estado y se lo pasa a la lista para resaltar la fila activa; no hay manejo de conjuntos de IDs.
- El componente `ClientsList.jsx` sólo muestra acciones por fila ("Ver detalles" y "Eliminar") sin casillas de verificación ni controles para seleccionar varios clientes a la vez.

En el store sigue existiendo la acción `bulkAssignClientServices` que envía al backend `/client-services/bulk-assign` con múltiples IDs, pero ninguna vista la usa actualmente ni ofrece una UI para elegir varios clientes y disparar esa mutación.

En resumen: la capacidad técnica de asignar servicios en lote persiste en el store, pero la interfaz carece de selección múltiple y botones asociados desde el rediseño, por lo que habría que reintroducir los controles de selección y la llamada a `bulkAssignClientServices` para recuperar esa función.

## Paridad esperada con Wisphub
- **Checkboxes en tabla.** Mostrar casillas al inicio de cada fila y un checkbox maestro para seleccionar/deseleccionar todo el listado paginado, igual que Wisphub.
- **Barra de acciones masivas.** Al detectar selección >0, habilitar una barra de acciones en lote (asignar plan, suspender, reactivar) que use `bulkAssignClientServices` o mutaciones equivalentes.
- **Estados bloqueantes.** Deshabilitar la barra durante la ejecución y mostrar resultados por lote (éxitos/errores) en toasts o banner, replicando el feedback inmediato que da Wisphub.
