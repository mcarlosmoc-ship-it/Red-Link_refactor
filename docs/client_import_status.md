# Estado actual de la carga masiva de clientes

La funcionalidad de importación CSV sigue disponible en el código, pero la interfaz actual no expone ningún punto de entrada:

- El modal `ImportClientsModal` permanece implementado con instrucciones, lista de columnas y carga del archivo, pero se renderiza solo cuando se invoca explícitamente porque retorna `null` si la propiedad `isOpen` es falsa.
- El store `useBackofficeStore` mantiene la acción `importClients(file)`, que valida el CSV, envía el contenido al endpoint `/clients/import` y luego actualiza clientes y métricas.
- La página de Clientes (`Clients.jsx`) no monta ni referencia el modal ni la acción de importación, por lo que el usuario no puede abrir el flujo desde la UI.

En resumen, la importación no se eliminó; simplemente quedó sin botón ni invocación tras el rediseño de la página de clientes, de modo que habría que re-integrarla donde corresponda (por ejemplo, en la lista de clientes) para volver a usarla.
