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
1. Buscar/agregar productos al carrito (el cliente es opcional; se puede seleccionar para referencia, pero no es obligatorio para cobrar solo productos).
2. Si el stock es suficiente, pulsar **Cobrar**, dividir métodos en el modal si aplica y confirmar.
3. La venta se registra y limpia el ticket; el otro panel de “Registrar pago” no interviene.

### 2) Cliente paga solo su internet
1. Seleccionar al cliente (requerido; sin cliente no se puede identificar el servicio ni cobrarlo).
2. Opciones actuales:
   - **Cobrar desde carrito**: agregar el servicio mensual de internet al carrito (solo se permite con contrato activo) y cobrar con **Cobrar**.
   - **Pago rápido**: usar “Pagos rápidos de clientes”, elegir el servicio asignado, capturar monto o meses y pulsar **Registrar pago** (verifica duplicados del periodo activo). Sin cliente, el flujo no avanza.

### 3) Cliente paga internet y Spotify
1. Seleccionar cliente con contrato activo (requerido para ubicar ambos servicios).
2. Agregar ambos servicios mensuales al carrito (internet + Spotify) desde el buscador.
3. Cobrar con **Cobrar**; el panel de pagos rápidos no permite cobrar dos servicios a la vez.

### 4) Cliente con 3 servicios activos paga solo internet
1. Seleccionar cliente (requerido para elegir cuál de los servicios pagar).
2. Agregar únicamente el servicio de internet al carrito o elegir solo ese servicio en el panel de pagos rápidos.
3. Cobrar con el flujo elegido; los otros servicios quedan sin movimiento.

### 5) Cliente paga internet y compra un lápiz
1. Seleccionar cliente (requerido por la línea de servicio; si el carrito solo tuviera el lápiz, la selección sería opcional).
2. Agregar el servicio mensual de internet y el producto de papelería al carrito.
3. Pulsar **Cobrar**; el ticket mezcla ambos tipos y valida stock solo para el producto. El panel de pagos rápidos no combina productos.

## Qué mejorar para un botón único
- Unificar el panel de pagos rápidos dentro del mismo flujo del carrito para evitar la duplicidad de botones (**Cobrar** vs **Registrar pago**).
- Reutilizar la validación del carrito y el modal de métodos de pago también para servicios mensuales, eliminando rutas paralelas.
