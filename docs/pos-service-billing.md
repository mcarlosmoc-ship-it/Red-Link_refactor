# Cobros en POS para productos, servicios puntuales y servicios mensuales

Este documento recoge flujos y reglas sugeridas para soportar cobros mixtos (productos, servicios puntuales y servicios mensuales contratados) en el POS, inspirados en el flujo base descrito previamente.

## Objetivos
- Mantener captura rápida: agregar ítems → asignar cliente → cobrar.
- Evitar errores de facturación (cobros duplicados, periodos vencidos, falta de servicio activo).
- Dar visibilidad clara del estado de los servicios contratados y su calendario de cobro.

## Tipos de ítems manejados
- **Producto o servicio puntual**: se cobra al momento; depende de inventario o disponibilidad inmediata.
- **Servicio mensual contratado**: genera cargos periódicos según contrato (ej. internet, hosting, mantenimiento). Puede tener prorrateos, renovaciones y adeudos pendientes.
- **Cargos administrativos**: recargos, reconexión, instalación, garantía extendida.

## Flujo propuesto (resumen)
1. **Captura de ítems**
   - Buscador único para productos/servicios.
   - Cada renglón muestra tipo (Producto, Servicio puntual, Mensual), cantidad, precio y subtotal.
   - Validaciones inline: stock para productos, elegibilidad para servicios (instalación previa, cobertura, límite de unidades por cliente) y estado del contrato para servicios mensuales.
2. **Asignación de cliente**
   - Panel/atajo para elegir cliente; muestra estado de servicios contratados (activo, suspendido, por instalar) y adeudos.
   - Opción de creación rápida de cliente con campos mínimos, y enriquecimiento posterior.
3. **Revisión de ticket**
   - Totales por categoría: productos/servicios puntuales, mensualidades actuales, adeudos, recargos/bonificaciones.
   - Alertas si el cliente tiene suscripción suspendida, instalación pendiente o facturación bloqueada.
4. **Cobro**
   - Métodos múltiples (efectivo, tarjeta, transferencia, vales) con división de pago.
   - Campo de efectivo recibido y cálculo automático de cambio.
   - Confirmaciones separadas: cobro inmediato vs. generación de cargo futuro (prorrateo/próxima mensualidad).
   - Emisión de recibo y registro de referencia de pago.

## Casos clave y reglas
- **Alta de nueva mensualidad**
  - Requiere cliente asignado y validación de cobertura/instalación.
  - Registrar fecha de inicio y ciclo (día de corte/pago). Si se instala a mitad de ciclo, calcular prorrateo.
- **Cobro de mensualidad actual**
  - Mostrar periodo (ej. mayo 2025) y estado (pendiente, pagado, vencido).
  - Evitar cobro duplicado verificando recibos existentes para el mismo periodo y servicio.
- **Cobro de adeudos históricos**
  - Listar periodos vencidos y permitir seleccionar cuáles cobrar.
  - Ofrecer recargos automáticos por mora y descuentos autorizados por rol.
- **Servicios puntuales complementarios** (instalación, reconexión, visita técnica)
  - Se agregan como ítems únicos; pueden estar condicionados al estado del contrato (ej. reconexión solo si está suspendido).
- **Cambio de plan o upsell**
  - Permitir agregar un “ajuste de plan” que prorree la diferencia hasta el siguiente corte y actualice la mensualidad futura.
- **Cancelación y reembolsos**
  - Requerir referencia de la venta original; si hay cobros futuros programados, cancelarlos o reprogramarlos.

## Pantallas/UX sugerida
- **Ticket principal**: tabla con etiquetas por tipo de ítem, totales segmentados y botón “Asignar cliente”.
- **Panel lateral de cliente**: muestra servicios activos, próximos cobros, adeudos y alertas de instalación/suspensión.
- **Modal de pago**: selector de método, división de pago, notas/referencia y confirmación final con resumen por categoría.
- **Historial rápido**: acceso a los últimos recibos del cliente para detectar cobros duplicados.

## Datos mínimos a mostrar en el POS
- Servicio: nombre/plan, velocidad/capacidad, ciclo y fecha de próximo pago.
- Estado del servicio: activo/suspendido/por instalar, motivo de suspensión (mora, técnico), fecha de suspensión.
- Adeudos: lista de periodos con importe, recargos, fecha límite de pago y número de recibo (si existe).
- Recibos recientes: folio, fecha, método, monto, periodo cobrado.

## Consideraciones de backend
- Endpoints para:
  - Obtener servicios contratados y adeudos del cliente.
  - Calcular prorrateo y ajustes de plan.
  - Validar cobro duplicado por periodo/servicio.
  - Registrar pagos con múltiples métodos en una sola transacción.
- Modelar estados de contrato y periodos de facturación para soportar suspensiones/instalaciones.
- Trazabilidad: registrar quién aplicó recargos, descuentos o reconexiones.

## Métricas a monitorear
- Tiempo de captura y cobro por tipo de ítem.
- Porcentaje de ventas con cliente asignado vs. ventas rápidas sin cliente.
- Tasas de error: cobros duplicados, recargos aplicados incorrectamente, pagos rechazados.
- Retención y upsell: cambios de plan y frecuencia de reconexiones.
