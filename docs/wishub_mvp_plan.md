# Wishub — Evaluación rápida y propuesta de MVP

## Puntos flojos identificados
1. **Validación y mensajes de error limitados.** Los formularios clave no muestran mensajes claros ni validaciones visibles en campos críticos, lo que aumenta errores de captura. 【F:docs/diseño_recomendaciones.txt†L18-L22】
2. **Falta de feedback inmediato tras acciones críticas.** Operaciones como guardar clientes o registrar pagos no devuelven confirmaciones visuales, generando incertidumbre. 【F:docs/diseño_recomendaciones.txt†L24-L28】
3. **Escalabilidad y usabilidad en tablas grandes.** Las vistas con muchos registros se vuelven pesadas y carecen de paginación o filtros inteligentes para mantener el desempeño. 【F:docs/diseño_recomendaciones.txt†L48-L52】

## Mejoras propuestas para el MVP
- **Validación en tiempo real con mensajes junto al campo.** Implementar reglas de validación y mostrar errores en línea en formularios de clientes y pagos; activar toasts uniformes para éxitos/errores.
- **Tablas con paginación y filtros rápidos.** Añadir paginación, selección de tamaño de página y filtros por estado/fecha con búsqueda incremental para clientes y pagos.

## Roadmap con KPIs
- **Semana 1: Validación y feedback**
  - Entregable: formularios críticos con validación en tiempo real y toasts de confirmación de acciones.
  - KPI: reducir errores de captura en campos obligatorios en **≥40%** y mostrar confirmaciones en **<0.5 s** tras la acción. 【F:docs/diseño_recomendaciones.txt†L18-L28】
- **Semana 2: Rendimiento de tablas**
  - Entregable: tablas de clientes/pagos con paginación, selector de filas por página y filtros rápidos.
  - KPI: tiempo de render inicial de tablas **<1 s** para 50+ registros y búsqueda/filtrado aplicable en **≤2 clics**. 【F:docs/diseño_recomendaciones.txt†L48-L52】
