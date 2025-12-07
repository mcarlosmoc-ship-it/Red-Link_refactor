# Flujos propuestos con botón único de pago

Estos flujos consolidan la experiencia de cobro en un solo botón y un único total, manteniendo la lógica diferenciada para productos con inventario y servicios (mensuales o no). Cada flujo parte del mismo punto: seleccionar/confirmar cliente, armar el carrito y presionar **Pagar**.

## Principios comunes
- **Carrito mixto**: admite líneas de tipo Producto (descarga inventario) y Servicio (actualiza vigencia/estado) en la misma sesión.
- **Validaciones mínimas y claras**: se exige cliente y stock; reglas de servicio no críticas se muestran como aviso pero no bloquean el cobro.
- **Resumen único**: antes de pagar se muestran subtotales por tipo (productos vs. servicios), impuestos/descuentos aplicados y el total único asociado al botón **Pagar**.
- **Transacción atómica**: al confirmar el pago se registra el ticket, se ajusta inventario y se actualizan vigencias en la misma operación.

## 1) Cliente paga solo productos del inventario
1. Seleccionar o confirmar cliente.
2. Escanear/agregar productos al carrito.
3. Revisar resumen (subtotal productos, impuestos, total).
4. Pulsar **Pagar**.
5. Cobro exitoso → Se descuenta inventario, se registra ticket y se emite recibo.

## 2) Cliente paga solo su servicio de internet
1. Seleccionar o confirmar cliente (muestra servicios activos/vencidos).
2. Agregar la línea de servicio "Internet" al carrito (marca tipo Servicio).
3. Revisar resumen (subtotal servicios, total único).
4. Pulsar **Pagar**.
5. Cobro exitoso → Se extiende vigencia del servicio de internet y se registra ticket; no se toca inventario.

## 3) Cliente paga internet y Spotify en la misma visita
1. Seleccionar o confirmar cliente.
2. Agregar líneas de servicio "Internet" y "Spotify" al carrito.
3. Revisar resumen (subtotal servicios con detalle de nueva vigencia por línea, total único).
4. Pulsar **Pagar**.
5. Cobro exitoso → Se actualiza vigencia de ambos servicios y se emite recibo consolidado.

## 4) Cliente con 3 servicios activos paga solo internet
1. Seleccionar o confirmar cliente (lista los 3 servicios; estado visible).
2. Agregar únicamente la línea "Internet" al carrito (los otros servicios se dejan sin seleccionar).
3. Revisar resumen (solo el servicio elegido), total único.
4. Pulsar **Pagar**.
5. Cobro exitoso → Solo la vigencia de internet se extiende; el estado de los otros servicios no cambia.

## 5) Cliente paga internet y compra un lápiz de papelería
1. Seleccionar o confirmar cliente.
2. Agregar servicio "Internet" y producto "Lápiz" al carrito.
3. Revisar resumen con subtotales por tipo y total único.
4. Pulsar **Pagar**.
5. Cobro exitoso → Se descuenta el lápiz del inventario y se extiende la vigencia de internet en la misma transacción.

## Observaciones de UX y control
- El botón **Pagar** debe estar siempre en el mismo lugar y mostrar el total único (productos + servicios).
- Avisos no bloqueantes: advertir suspensiones, instalaciones pendientes o cobro anticipado, pero permitir continuar salvo casos críticos (cliente inexistente o sin stock).
- El recibo detalla por línea el tipo (Producto/Servicio), precio, impuestos/descuentos, y en servicios la nueva fecha de vencimiento.
