# Pendientes del panel operativo (Dashboard + Clientes)

## Dashboard
- **KPIs consolidados y accesos rápidos.** La documentación del alcance indica que el dashboard debe mostrar totales de clientes, pagos e ingresos, y ofrecer accesos rápidos hacia Clientes/Servicios sin duplicar formularios. Falta validar que estos accesos y KPIs estén implementados tal como se describe. 【F:docs/module_responsibilities.md†L3-L9】
- **Flujos operativos desde dashboard.** Los smoke tests sugieren poder crear cliente, asignar servicio y registrar pago desde el dashboard; hay que confirmar que esos flujos existen y que los logs de pagos/servicios los registran correctamente. 【F:docs/logs-and-consistency.md†L1-L43】【F:docs/logs-and-consistency.md†L61-L69】

## Clientes
- **Selector de planes sin filtro por internet.** Se debe permitir elegir cualquier plan activo al crear un cliente, removiendo el filtro actual a planes de internet y aclarando que el servicio inicial es opcional. 【F:docs/plan_operativo_clientes.md†L3-L27】
- **Campos dinámicos por plan.** Hace falta extender el estado y UI para mostrar/validar campos condicionales (IP/base/credenciales/precio) según el plan elegido tanto en alta como en asignaciones. 【F:docs/plan_operativo_clientes.md†L27-L39】
- **Persistencia completa del servicio.** El payload de creación/asignación debe incluir precio efectivo, IP/base y notas, y la UI debe permitir ver/editar estos atributos en los servicios del cliente. 【F:docs/plan_operativo_clientes.md†L39-L46】
- **Importación masiva cliente + servicios.** Se requiere una plantilla CSV estilo Wisphub (cliente con múltiples servicios), validación y feedback granular en `ImportClientsModal`, y que `/clients/import` cree clientes y servicios en la misma carga. 【F:docs/plan_operativo_clientes.md†L46-L59】
- **Controles ocultos de importación y selección múltiple.** Hay que reexponer el botón de importar clientes, restaurar checkboxes para seleccionar varios clientes y habilitar acciones en lote usando `bulkAssignClientServices`. 【F:docs/plan_operativo_clientes.md†L59-L68】【F:docs/client_selection_status.md†L1-L17】
- **Vista compacta de servicio principal y filtros operativos.** Para acercarnos a Wisphub/Splynx, la lista de clientes debería mostrar plan/estado/IP del servicio principal y permitir filtrar por zona/base/plan/estado del servicio. 【F:docs/isp_review.md†L1-L25】【F:docs/isp_review.md†L44-L50】
