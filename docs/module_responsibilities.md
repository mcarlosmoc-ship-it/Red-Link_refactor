# Alcance de los módulos

## Dashboard
- Presenta KPIs consolidados (totales de clientes, pagos del periodo, ingresos, egresos, costos de internet y métricas por revendedor).
- Ofrece accesos rápidos hacia Clientes/Servicios para continuar flujos operativos sin duplicar formularios.
- Listados y filtros del dashboard son de solo lectura; cualquier acción abre la vista correspondiente en Clientes.

## Clientes
- Vista central para CRUD de clientes, carga masiva y asignación de planes/servicios.
- Pestaña de pagos para registrar cobranza y revisar adeudos de un cliente específico.
- Pestaña de servicios para actualizar estado, tarifas y metadatos de cada servicio.
- Conserva selección de cliente y pestaña mediante query params (`clientId`, `view`) para permitir navegación cruzada desde otras secciones.

## Pagos
- Historial de pagos del periodo con filtro por método y búsqueda.
- Formulario de registro de pago general (por cliente/servicio) que reutiliza los mismos endpoints que la pestaña de pagos en Clientes.
