# POS e Internet: acuerdos y pasos siguientes

Este documento resume los acuerdos alcanzados tras la revisión de propuestas para el POS y el módulo de Internet.

## Acuerdos principales
- **Pago rápido en TPV**: reutilizar el backend de pagos existente y mantener la lógica avanzada en Internet; el POS solo mostrará un formulario mínimo con feedback inmediato.
- **Pagos rápidos vs. avanzados**: ambos flujos compartirán endpoints; el POS será crítico y rápido, mientras Internet gestionará pagos adelantados, historial y validaciones.
- **Reordenamiento del menú**: antes de mover slugs se mapearán rutas actuales (incluyendo parámetros `clientId` y `view`) para evitar romper enlaces profundos.
- **Dashboard**: mantener únicamente KPIs consolidados (clientes activos, ingresos, gastos, pagos del periodo y métricas por revendedor).
- **Clientes**: priorizar panel lateral/modal para detalles sin perder paginación ni parámetros de estado.
- **Inventario bajo Internet**: revisar rutas compartidas con Ventas/Clientes antes de mover para preservar endpoints críticos.
- **Revendedores**: priorizar pestañas en el orden Liquidaciones, Entregas e Historial.
- **Finanzas centralizado**: consolidar ingresos de POS e ISP, gastos y reportes verificando identificadores comunes para evitar duplicación.
- **Configuración**: centralizar ajustes generales sin mover configuraciones que dependan del contexto de cliente o servicio.

## Próximos pasos propuestos
- Definir con diseño qué KPIs y accesos rápidos se mantienen en Dashboard.
- Prototipar el flujo de pago rápido en POS reutilizando el endpoint actual.
- Mapear rutas con `clientId`, `view`, paginación y filtros antes de reordenar el menú.

## Tareas sugeridas (por flujo)

### Dashboard (KPIs y accesos rápidos)
- Listar métricas disponibles y validarlas con producto/diseño.
- Definir límites de periodo por defecto (ej. mes actual) y criterios de filtrado.
- Ajustar accesos rápidos sin reintroducir tablas completas.
- Entregable: wireframes del Dashboard con KPIs finales y accesos rápidos aprobados.

### Pago rápido en POS
- Documentar el endpoint reutilizado y parámetros mínimos requeridos.
- Preparar mock de UI mínima (campos visibles, feedback esperado) y revisar errores comunes.
- Confirmar estados de éxito/falla reutilizando los toasts/notificaciones actuales.
- Entregable: prototipo aprobado + nota técnica de validaciones compartidas con Internet.

### Rutas y menú
- Inventariar rutas que usan `clientId`/`view` y registrar dependencias cruzadas.
- Proponer nueva jerarquía de menú con equivalencia de slugs y redirecciones necesarias.
- Definir plan de comunicación/migración para bookmarks y enlaces compartidos.
- Entregable: mapa de rutas actual vs. propuesta y plan de redirecciones.

### Inventario bajo Internet
- Mapear hooks y endpoints que consumen datos de inventario desde otros módulos.
- Identificar cambios de ruta o aliases necesarios para no romper integraciones.
- Validar impacto en permisos/roles antes de mover vistas.
- Entregable: tabla de dependencias + decisión de movimiento con plan de mitigación.

### Clientes (panel lateral/modal)
- Inventariar vistas que dependen de paginación y `clientId/view` para mantener estado.
- Diseñar panel lateral/modal con acciones principales visibles sin recargar tabla.
- Probar impacto en rendimiento con dataset paginado y filtros actuales.
- Entregable: prototipo con checklist de compatibilidad de estado/paginación.

### Revendedores (pestañas)
- Priorizar pestañas: Liquidaciones, Entregas, Historial y Revendedores base.
- Definir datos mínimos y acciones rápidas por pestaña para no duplicar formularios.
- Validar permisos/roles por pestaña y navegación con deep-links.
- Entregable: esquema de pestañas con rutas y permisos asignados.

### Finanzas centralizado
- Confirmar identificadores comunes (cliente, servicio, canal) en ingresos POS/ISP.
- Diseñar vista consolidada de ingresos/gastos con filtros por origen.
- Revisar reportes existentes para evitar duplicación o ETL interno.
- Entregable: especificación de modelos/reportes consolidados.

### Configuración
- Listar configuraciones globales vs. dependientes de cliente/servicio.
- Proponer estructura de secciones para concentrar ajustes generales.
- Validar dependencias con POS/Internet antes de mover configuraciones sensibles.
- Entregable: árbol de configuración con ownership y dependencias.

