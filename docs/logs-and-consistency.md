# Monitoreo de pagos y servicios

## Nuevos logs en endpoints críticos

* **Creación de pagos** (`POST /payments`): se registra `payment_id`, `client_id` y `client_service_id` cuando el pago se crea exitosamente.
* **Creación/actualización de servicios** (`POST /client-services`, `PUT /client-services/{id}`, `PUT /client-services/{id}/debt`): los logs incluyen `client_id`, `client_service_id` y, en actualizaciones, el `status` resultante.

### Cómo leer los registros

1. Filtra el log por `client_service_id` para seguir el ciclo completo de un servicio.
2. Valida que el `client_id` del pago coincida con el del servicio; si difiere, crea una alerta manual.
3. Ante fallos en la creación/actualización, el endpoint responde 4xx; revisa el log inmediato anterior para confirmar el payload procesado.

## Chequeo periódico de consistencia

### Endpoint

* `GET /metrics/consistency/payments`
* Devuelve:
  * `client_counters`: diferencias entre pagos guardados y los asociados a servicios por cliente.
  * `service_counters`: diferencias por servicio (útil para detectar pagos huérfanos).
  * `payments_without_service`: IDs de pagos cuyo servicio no existe.
  * `payments_with_mismatched_client`: pagos donde el cliente guardado no coincide con el dueño del servicio.
  * `services_without_client`: servicios que apuntan a un cliente inexistente.

### Script para cron o tareas programadas

```
python -m backend.app.scripts.reconcile_payments [--verbose]
```

* `--verbose` muestra los detalles de cada hallazgo (IDs y contadores).
* Salida INFO resume hallazgos; WARN se activa cuando hay discrepancias.

## Pasos para resolver discrepancias

1. **Pago sin servicio**: elimina el pago (`DELETE /payments/{id}`) o reasigna usando el servicio correcto.
2. **Pago con cliente diferente**: corrige el pago reinsertándolo con el `client_service_id` adecuado o actualiza el servicio si el cliente cambió.
3. **Servicio sin cliente**: crea el cliente faltante y actualiza `client_id`, o elimina el servicio inválido.
4. **Contadores diferentes**: revisa primero los casos anteriores; usualmente provienen de pagos huérfanos o clientes inconsistentes. Repite el script/endpoint hasta que `client_counters` y `service_counters` queden vacíos.

## Smoke test recomendado

1. Crear cliente desde el dashboard.
2. Asignar un servicio y registrar un pago desde el dashboard.
3. Abrir la ficha del cliente y verificar que el pago aparece en la sección de pagos recientes.
4. Ejecutar `GET /metrics/consistency/payments` para confirmar que no hay anomalías.
