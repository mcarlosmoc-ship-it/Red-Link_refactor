# Flujo actual de pagos en el POS

Este documento resume cómo funciona hoy el TPV para cobrar productos y servicios, según la implementación en `src/pages/PointOfSale.jsx`.

## Panorama general
- **Dos botones y dos flujos separados**:
  - **Cobrar** abre un modal de pago para el ticket en curso y registra la venta vía `/sales/transactions`.
  - **Registrar pago** es un panel aparte de pagos rápidos para servicios de clientes (internet/servicios mensuales) que llama a `/payments` sin pasar por el carrito.
- **Carrito mixto**: el buscador admite productos, servicios puntuales y servicios mensuales. Las líneas guardan su tipo para validar stock o contrato antes de cobrar.
- **Validaciones previas al cobro**: el botón Cobrar exige al menos un artículo, sin alertas pendientes y, si hay descuento, referencia de reembolso. Los servicios puntuales verifican instalación/cobertura; los mensuales requieren cliente con contrato activo.
- **Pagos rápidos**: el panel de “Pagos rápidos de clientes” requiere seleccionar cliente y un servicio mensual, pedir monto o periodos y valida cobros duplicados del mismo periodo antes de registrar.

## Flujos por escenario
### 1) Cliente paga solo productos de inventario
1. Buscar/agregar productos al carrito (no exige cliente si solo hay productos).
2. Si el stock es suficiente, pulsar **Cobrar**, dividir métodos en el modal si aplica y confirmar.
3. La venta se registra y limpia el ticket; el otro panel de “Registrar pago” no interviene.

### 2) Cliente paga solo su internet
1. Seleccionar al cliente.
2. Opciones actuales:
   - **Cobrar desde carrito**: agregar el servicio mensual de internet al carrito (solo se permite con contrato activo) y cobrar con **Cobrar**.
   - **Pago rápido**: usar “Pagos rápidos de clientes”, elegir el servicio asignado, capturar monto o meses y pulsar **Registrar pago** (verifica duplicados del periodo activo).

### 3) Cliente paga internet y Spotify
1. Seleccionar cliente con contrato activo.
2. Agregar ambos servicios mensuales al carrito (internet + Spotify) desde el buscador.
3. Cobrar con **Cobrar**; el panel de pagos rápidos no permite cobrar dos servicios a la vez.

### 4) Cliente con 3 servicios activos paga solo internet
1. Seleccionar cliente.
2. Agregar únicamente el servicio de internet al carrito o elegir solo ese servicio en el panel de pagos rápidos.
3. Cobrar con el flujo elegido; los otros servicios quedan sin movimiento.

### 5) Cliente paga internet y compra un lápiz
1. Seleccionar cliente.
2. Agregar el servicio mensual de internet y el producto de papelería al carrito.
3. Pulsar **Cobrar**; el ticket mezcla ambos tipos y valida stock solo para el producto. El panel de pagos rápidos no combina productos.

## Qué mejorar para un botón único
- Unificar el panel de pagos rápidos dentro del mismo flujo del carrito para evitar la duplicidad de botones (**Cobrar** vs **Registrar pago**).
- Reutilizar la validación del carrito y el modal de métodos de pago también para servicios mensuales, eliminando rutas paralelas.

## Propuesta de flujo POS unificado (un solo botón)
### Objetivo
Que el punto de venta funcione con un único carrito mixto para servicios mensuales y productos, de modo que se pueda cobrar todo junto con el mismo modal y generar un ticket único.

### Pasos de usuario
1. **Seleccionar cliente** (opcional si solo se venden productos):
   - Al elegir cliente, el panel lateral muestra **todos los servicios activos** (internet, TV, Spotify, etc.) con su periodo vigente y monto.
2. **Agregar servicios al carrito**:
   - Desde la lista de servicios activos del cliente, se seleccionan uno o varios (checkbox o botón “Agregar”).
   - Cada servicio agregado se traduce en una línea de carrito con periodo de cobro y precio; se permite ajustar meses a pagar si la lógica de negocio lo admite.
3. **Agregar productos del inventario**:
   - El mismo buscador de productos/servicios permite sumar artículos de inventario al carrito actual.
   - Se muestran alertas de stock insuficiente en la línea correspondiente.
4. **Validaciones previas al pago** (sobre el mismo carrito):
   - **Servicios mensuales**: requieren cliente con contrato activo y bloquean cobros duplicados del periodo seleccionado.
   - **Productos**: validan stock disponible.
   - El botón **Cobrar** se habilita solo si no hay alertas pendientes y existe al menos un ítem.
5. **Cobro único**:
   - Al pulsar **Cobrar**, se abre el modal de métodos de pago (múltiples medios/abonos parciales) sobre el total del carrito.
   - Se registra todo en `/sales/transactions` (los servicios se tratan como líneas del ticket con su metadata de periodo) para unificar la ruta de backend.
6. **Ticket y limpieza**:
   - Se imprime un solo ticket con el desglose de servicios y productos pagados.
   - El carrito se limpia y el estado de contrato/stock se actualiza según corresponda.

### Consideraciones de UX y reglas
- **Visibilidad de servicios**: si no hay cliente seleccionado, la lista de servicios no se muestra. Al cambiar de cliente, el carrito debería vaciarse o pedir confirmación para evitar mezclar servicios de distintos clientes.
- **Periodos**: los servicios mensuales deberían permitir elegir el periodo a cubrir (mes actual, siguiente, múltiplos) y bloquear la repetición de un periodo ya cobrado.
- **Descuentos y referencias**: si se aplica descuento o se requiere referencia de reembolso, reutilizar la lógica actual del modal sin crear validaciones paralelas.
- **Errores unificados**: mostrar los mensajes de stock, contrato inactivo o duplicado de periodo directamente en cada línea del carrito para evitar saltos de contexto.
