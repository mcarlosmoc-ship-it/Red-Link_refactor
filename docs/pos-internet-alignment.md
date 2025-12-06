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

## Tareas sugeridas
- **Dashboard (KPIs y accesos rápidos)**
  - Listar métricas disponibles y validarlas con producto/diseño.
  - Definir límites de periodo por defecto (ej. mes actual) y criterios de filtrado.
  - Ajustar accesos rápidos sin reintroducir tablas completas.
- **Pago rápido en POS**
  - Documentar el endpoint reutilizado y parámetros mínimos requeridos.
  - Preparar mock de UI mínima (campos visibles, feedback esperado) y revisar errores comunes.
  - Confirmar estados de éxito/falla reutilizando los toasts/notificaciones actuales.
- **Rutas y menú**
  - Inventariar rutas que usan `clientId`/`view` y registrar dependencias cruzadas.
  - Proponer nueva jerarquía de menú con equivalencia de slugs y redirecciones necesarias.
  - Definir plan de comunicación/migración para bookmarks y enlaces compartidos.
- **Inventario bajo Internet**
  - Mapear hooks y endpoints que consumen datos de inventario desde otros módulos.
  - Identificar cambios de ruta o aliases necesarios para no romper integraciones.
  - Validar impacto en permisos/roles antes de mover vistas.

