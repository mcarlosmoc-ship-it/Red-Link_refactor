# Pendientes del panel operativo (Dashboard + Clientes)

## Dashboard
- **KPIs consolidados y accesos rápidos.** La documentación del alcance indica que el dashboard debe mostrar totales de clientes, pagos e ingresos, y ofrecer accesos rápidos hacia Clientes/Servicios sin duplicar formularios. Falta validar que estos accesos y KPIs estén implementados tal como se describe. 【F:docs/module_responsibilities.md†L3-L9】
- **Flujos operativos desde dashboard.** Los smoke tests sugieren poder crear cliente, asignar servicio y registrar pago desde el dashboard; hay que confirmar que esos flujos existen y que los logs de pagos/servicios los registran correctamente. 【F:docs/logs-and-consistency.md†L1-L43】【F:docs/logs-and-consistency.md†L61-L69】

## Clientes
- **Validaciones según plan.** Las pantallas de asignación ya muestran campos condicionales, pero falta asegurar que las reglas de obligatoriedad (IP/base/equipo/credenciales) fallen temprano y se alineen con backend. 【F:docs/plan_operativo_clientes.md†L32-L48】
- **Plantilla y flujo de importación.** El modal permite bajar plantilla autenticada y seleccionar columnas opcionales; sigue pendiente migrar a `GET /clients/import/template`, documentar 1 fila = 1 servicio y mantener presets. 【F:docs/plan_operativo_clientes.md†L50-L58】
- **Vista operativa en la lista.** Se necesita mostrar el servicio principal (plan, estado, IP/base) y filtros por servicio en la tabla de clientes para acercarse a Wisphub/Splynx. 【F:docs/plan_operativo_clientes.md†L60-L63】【F:docs/isp_review.md†L44-L50】
- **Feedback en acciones masivas.** La selección múltiple ya existe; falta complementar con resultados por cliente al asignar planes, suspender o eliminar en lote. 【F:docs/plan_operativo_clientes.md†L65-L66】【F:src/features/clients/ClientsList.jsx†L146-L214】
