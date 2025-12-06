# Cobros en POS para productos, servicios puntuales y servicios mensuales

Este documento consolida los flujos, pantallas y reglas sugeridas para soportar cobros mixtos (productos, servicios puntuales y servicios mensuales contratados) en el POS. Integra las ideas previas de captura rápida, asignación de cliente y manejo de adeudos/recurrencias.

## Objetivos
- Mantener captura rápida: agregar ítems → asignar cliente → cobrar.
- Evitar errores de facturación (cobros duplicados, periodos vencidos, falta de servicio activo).
- Dar visibilidad clara del estado de los servicios contratados y su calendario de cobro.

## Tipos de ítems manejados
- **Producto o servicio puntual**: se cobra al momento; depende de inventario o disponibilidad inmediata.
- **Servicio mensual contratado**: genera cargos periódicos según contrato (ej. internet, hosting, mantenimiento). Puede tener prorrateos, renovaciones y adeudos pendientes.
- **Cargos administrativos**: recargos, reconexión, instalación, garantía extendida.

## Diseño de pantallas
- **Ticket principal**
  - Tabla con etiquetas por tipo de ítem (Producto, Servicio puntual, Mensual, Cargo adm.).
  - Totales segmentados por categoría y total general.
  - Botones visibles: "Asignar cliente", "Ir a cobrar", atajos (`F1` buscar, `F2` cliente, `Del` eliminar renglón).
  - Controles rápidos en cada línea: cantidad (+/-), descuento autorizado, notas.
- **Panel lateral de cliente**
  - Datos mínimos: nombre, teléfono, RFC/ID fiscal.
  - Servicios activos: plan, velocidad, ciclo, próximo pago, estado (activo/suspendido/por instalar) y motivo.
  - Adeudos: periodos, importe, recargos, fecha límite, folio si existe; botón "Agregar al ticket".
  - Historial rápido: últimos recibos con folio, fecha, método y periodo.
- **Modal de selección de cliente**
  - Búsqueda por nombre/teléfono/email/RFC, con creación rápida (nombre + teléfono) para no frenar la venta.
  - Indicadores de riesgo: cliente con bloqueo de facturación, morosidad, o instalación pendiente.
- **Modal de pago**
  - Selector de método, división de pago, campo de efectivo recibido y cálculo de cambio.
  - Resumen por categoría (productos, servicios puntuales, mensualidades, adeudos, recargos/bonificaciones).
  - Confirmaciones separadas: cobro inmediato vs. generación de cargo futuro (prorrateo/próxima mensualidad).
  - Campos de referencia/notas (ej. autorización de tarjeta, folio de transferencia).

## Flujo propuesto
1. **Captura de ítems**
   - Buscador único para productos/servicios. Indica stock y disponibilidad.
   - Validaciones inline: stock para productos, elegibilidad para servicios (instalación previa, cobertura, límite de unidades por cliente) y estado del contrato para servicios mensuales.
   - Para servicios mensuales, al agregar se solicita plan, fecha de inicio y ciclo de facturación. Si el inicio es a mitad de ciclo, se marca como "Prorrateo".
2. **Asignación de cliente**
   - Panel/atajo para elegir cliente; muestra estado de servicios contratados (activo, suspendido, por instalar) y adeudos.
   - Opción de creación rápida de cliente con campos mínimos y aviso para completar datos fiscales después.
   - Al seleccionar cliente, se cargan automáticamente sus adeudos y mensualidades pendientes para agregarlos con un clic.
3. **Revisión de ticket**
   - Totales por categoría: productos/servicios puntuales, mensualidades actuales, adeudos, recargos/bonificaciones.
   - Alertas si el cliente tiene suscripción suspendida, instalación pendiente, bloqueo de facturación o posible cobro duplicado.
   - Permitir remover o editar mensualidades/adeudos agregados antes de cobrar.
4. **Cobro**
   - Métodos múltiples con división de pago (ej. efectivo + tarjeta). Validar montos y calcular cambio.
   - Confirmación separada cuando hay prorrateos o cargos futuros, explicando el periodo que cubre cada pago.
   - Emisión de recibo y registro de referencia de pago. Botones: "Imprimir", "Enviar por correo/WhatsApp".

## Reglas por caso
- **Alta de nueva mensualidad**
  - Requiere cliente asignado y validación de cobertura/instalación.
  - Registrar fecha de inicio y ciclo (día de corte/pago). Si se instala a mitad de ciclo, calcular prorrateo y generar siguiente mensualidad.
- **Cobro de mensualidad actual**
  - Mostrar periodo (ej. mayo 2025) y estado (pendiente, pagado, vencido).
  - Evitar cobro duplicado verificando recibos existentes para el mismo periodo y servicio.
- **Cobro de adeudos históricos**
  - Listar periodos vencidos y permitir seleccionar cuáles cobrar.
  - Aplicar recargos automáticos por mora y descuentos según rol/permiso. Marcar recargo y descuento como líneas separadas para auditoría.
- **Servicios puntuales complementarios** (instalación, reconexión, visita técnica)
  - Se agregan como ítems únicos; pueden condicionarse al estado del contrato (ej. reconexión solo si está suspendido).
  - Tras cobrarlos, actualizar estado del servicio si corresponde (ej. reconectar).
- **Cambio de plan o upsell**
  - Agregar un “ajuste de plan” que prorree la diferencia hasta el siguiente corte y actualice la mensualidad futura.
  - Confirmar al usuario el nuevo importe mensual y la fecha del siguiente cobro.
- **Cancelación y reembolsos**
  - Requerir referencia de la venta original; si hay cobros futuros programados, cancelarlos o reprogramarlos.
  - Para reembolsos parciales, mostrar cálculo de importe y periodo cubierto.

## Validaciones y estados clave
- **Estado del contrato**: activo, suspendido (mora/técnico), por instalar, cancelado.
- **Validaciones previas al cobro**
  - Servicio suspendido por mora: sugerir reconexión + pago de adeudos.
  - Instalación pendiente: permitir solo cargos de instalación/anticipo.
  - Bloqueo de facturación: impedir cobro y mostrar motivo.
  - Cobro duplicado: advertir si ya existe recibo para el mismo servicio/periodo/monto.
- **Trazabilidad y permisos**
  - Registrar quién aplica descuentos, recargos o reconexiones.
  - Roles para limitar edición de precio y aprobación de prorrateo o notas de crédito.

## Consideraciones de backend
- Endpoints para:
  - Obtener servicios contratados y adeudos del cliente con estados y periodos.
  - Calcular prorrateo, ajustes de plan y recargos automáticos.
  - Validar cobro duplicado por periodo/servicio y bloqueo de facturación.
  - Registrar pagos con múltiples métodos en una sola transacción y emitir recibo.
- Modelar estados de contrato y periodos de facturación para soportar suspensiones/instalaciones.
- Webhooks/eventos para actualizar reconexiones, cambios de plan y cancelaciones.

## Métricas a monitorear
- Tiempo de captura y cobro por tipo de ítem.
- Porcentaje de ventas con cliente asignado vs. ventas rápidas sin cliente.
- Tasas de error: cobros duplicados, recargos aplicados incorrectamente, pagos rechazados.
- Retención y upsell: cambios de plan y frecuencia de reconexiones.
- SlAs de instalación y reconexión para servicios suspendidos/por instalar.
