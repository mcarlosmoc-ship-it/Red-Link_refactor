# API FastAPI – Endpoints principales

Guía rápida de los recursos más usados en el backend de FastAPI. Todos los endpoints (salvo `/auth/token` y `/`) exigen un JWT de administrador en la cabecera `Authorization: Bearer <token>`.

## Autenticación
- **POST `/auth/token`**: devuelve un token JWT de administrador.
  - **Body**:
    ```json
    {"username": "admin@example.com", "password": "TuContraseña", "otp_code": "123456"}
    ```
  - **Respuestas**: `200 OK` → `{ "access_token": "<jwt>" }`; `400` si falta la contraseña; `401` si credenciales/OTP son inválidos.

## Clientes (`/clients`)
- **GET `/clients`**: lista con paginación y filtros (`skip`, `limit`, `search`, `zone_id`, `status`).
- **GET `/clients/{client_id}`**: detalle de un cliente.
- **POST `/clients`**: crea un cliente. Ejemplo:
  ```json
  {"id": "CLI-001", "full_name": "Ana Pérez", "client_type": "residential"}
  ```
- **PUT `/clients/{client_id}`**: actualiza campos permitidos.
- **DELETE `/clients/{client_id}`**: elimina al cliente.
- **POST `/clients/import/template`**: entrega CSV de columnas esperadas.
- **POST `/clients/import`**: importa clientes desde texto CSV.

_Respuestas habituales_: `201` en altas, `404` cuando el recurso no existe, `400` para validaciones (ej. intentar definir `services` o `monthly_fee` en el alta).

## Servicios contratados (`/client-services`)
- **GET `/client-services`**: lista con paginación (`skip`, `limit`) y filtros por `client_id`, `service_type`, `status`.
- **POST `/client-services`**: crea un servicio para un cliente:
  ```json
  {"client_id": "CLI-001", "service_id": 10, "category": "internet", "status": "active"}
  ```
- **POST `/client-services/bulk`**: alta masiva para varios `client_ids` con el mismo plan.
- **POST `/client-services/bulk-assign`**: alias de la operación masiva.
- **GET `/client-services/{service_id}`**: detalle.
- **GET/PUT `/client-services/{service_id}/debt`**: consulta y actualización de adeudos.
- **PUT `/client-services/{service_id}`**: actualiza estado o plan.
- **DELETE `/client-services/{service_id}`**: elimina el contrato.

_Errores típicos_: `400` cuando la validación del contrato falla (detalles en la respuesta), `404` si el servicio no existe.

## Pagos (`/payments`)
- **GET `/payments`**: lista paginada con filtros (`client_id`, `client_service_id`, `service_type`, `period_key`, rango de fechas `start_date`/`end_date`, método y montos `min_amount`/`max_amount`).
- **POST `/payments`**: registra un pago y actualiza saldos. Ejemplo:
  ```json
  {"client_id": "CLI-001", "client_service_id": "SRV-123", "period_key": "2025-02", "amount": 499.99, "method": "cash"}
  ```
- **GET `/payments/{payment_id}`**: detalle de un pago.
- **DELETE `/payments/{payment_id}`**: revierte un pago registrado.

_Respuestas_: `201` al crear, `400` en inconsistencias (fechas invertidas, montos fuera de rango o reglas de negocio), `404` si el ID no existe.

## Recordatorios de pago
No existe un endpoint HTTP dedicado; los recordatorios se envían mediante una tarea en segundo plano activada con `ENABLE_PAYMENT_REMINDERS=1`. Para lanzarlos manualmente desde consola:
```bash
cd backend
python -m backend.app.scripts.payment_reminder_job --days-ahead 3 --dry-run
```
Parámetros como transporte (`--transport`, `--sendgrid-*`, `--twilio-*`) permiten probar envíos reales o simulados.

## Autorización y cabeceras
- Obtén el token con `POST /auth/token` y envíalo en `Authorization: Bearer <jwt>`.
- Los endpoints usan la dependencia `require_admin`, que responde `401 Unauthorized` si el token es inválido o falta.

## Paginación y filtrado
- `skip` (>=0) y `limit` (1-200) controlan el desplazamiento y tamaño de página en listados.
- Filtros opcionales varían por recurso (ej. `search` por nombre de cliente, `status` de servicio, rango de fechas y montos en pagos).

## Colecciones de prueba
No hay una colección Postman/Bruno en el repositorio. Para pruebas manuales rápidas puedes usar `curl` con el token JWT o adaptar los parámetros anteriores. Las pruebas automatizadas viven en `backend/tests/` si quieres revisar casos de uso cubiertos.
