# Backend FastAPI + Alembic

Este directorio contiene el backend de FastAPI junto con la configuración de
migraciones de Alembic y un esquema inicial derivado de `db/schema.sql`.

## Configuración de la base de datos

- La URL de conexión se comparte con la aplicación a través de la variable de
  entorno `DATABASE_URL`. Si no está definida, se usa SQLite en
  `backend/clients.db`, que se crea automáticamente (la ruta se resuelve a su
  versión absoluta dentro de `backend/`).
- Para entornos productivos puedes exigir PostgreSQL definiendo
  `REQUIRE_POSTGRES=1`. En ese caso el backend aborta si `DATABASE_URL` está
  ausente o apunta a SQLite.
- Si defines un `DATABASE_URL` con PostgreSQL (por ejemplo
  `postgresql+psycopg://usuario:clave@localhost/redlink`), SQLAlchemy activa
  automáticamente el chequeo de conexiones (`pool_pre_ping`) y las migraciones
  aprovechan los tipos nativos (`UUID`, `INET`) además de habilitar las
  extensiones `pgcrypto` y `pg_trgm`.
- El motor de SQLAlchemy y Alembic reutilizan este valor, por lo que modificar
  `DATABASE_URL` en el entorno afecta tanto a la API como a las migraciones.

Opcionalmente puedes ajustar el pool de conexiones (solo aplica a PostgreSQL):

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_POOL_SIZE` | Conexiones persistentes en el pool. | `5` |
| `DATABASE_MAX_OVERFLOW` | Conexiones adicionales permitidas. | `10` |
| `DATABASE_POOL_TIMEOUT` | Segundos antes de fallar al esperar una conexión. | `30` |
| `DATABASE_POOL_RECYCLE` | Segundos antes de reciclar conexiones. | `1800` |
| `DATABASE_CONNECT_TIMEOUT` | Timeout de conexión inicial en segundos. | `10` |

## Variables obligatorias de seguridad y autenticación

El panel de administración está protegido mediante autenticación tipo OAuth2
password. Para que el backend arranque correctamente debes definir las
siguientes variables de entorno antes de lanzar Uvicorn (o ejecutar pruebas):

| Variable | Descripción |
|----------|-------------|
| `CLIENT_PASSWORD_KEY` | Clave base64 de al menos 32 bytes que se usa para cifrar/descifrar contraseñas de clientes. |
| `ADMIN_USERNAME` | Usuario que se aceptará en el endpoint `/auth/token`. |
| `ADMIN_PASSWORD_HASH` | Hash PBKDF2 de la contraseña del administrador. |
| `ADMIN_JWT_SECRET` | Cadena aleatoria usada para firmar los tokens JWT. |

Opcionalmente puedes definir:

- `ADMIN_TOTP_SECRET`: clave base32 para habilitar un segundo factor (TOTP).
  Si la omites, el backend no solicitará códigos OTP.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: minutos de vigencia de cada token. Si no
  se define, los tokens expiran a los `15` minutos.

Si falta cualquiera de las variables obligatorias, la aplicación aborta el
arranque con `SecurityConfigurationError` para evitar ejecutar la API en un
estado inseguro.

### Generar el hash de contraseña del administrador

Utiliza la utilidad integrada para crear el valor de `ADMIN_PASSWORD_HASH`:

```bash
cd backend
python - <<'PY'
from backend.app.security import generate_password_hash

print(generate_password_hash("TuContraseñaSegura123"))
PY
```

Copia el hash resultante (formato `iteraciones$salt$hash`) en la variable de
entorno. El script usa PBKDF2 con 390 000 iteraciones por defecto.

### Obtener un token de acceso

Con las variables configuradas y el backend en marcha, solicita un token JWT:

```bash
curl -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"TuContraseñaSegura123"}'
```

Si definiste `ADMIN_TOTP_SECRET` añade el campo `"otp_code"` al cuerpo con el
código generado por tu app de autenticación. La respuesta incluye un
`access_token` que deberás enviar en las peticiones del frontend.

## Migraciones

El directorio `alembic/` aloja el entorno de Alembic. Para aplicar el estado de
esquema más reciente ejecuta:

```bash
cd backend
alembic upgrade head
```

Si te encuentras en la raíz del repositorio también puedes ejecutar:

```bash
./backend/scripts/run_alembic.sh upgrade head
```

El script localiza el entorno virtual (si existe), apunta automáticamente a
`backend/alembic.ini` y aplica cualquier subcomando de Alembic que le pases.

Si vas a crear nuevas versiones, genera un borrador autogenerado desde la raíz
del repositorio con:

```bash
./backend/scripts/new_migration.sh -m "descripcion breve"
```

El script se asegura de que el entorno virtual esté listo antes de invocar
`alembic revision --autogenerate`. Si ya te encuentras dentro de `backend/`,
puedes ejecutar la misma instrucción como `./scripts/new_migration.sh`.
Después edita el archivo generado en `alembic/versions/` para ajustar defaults
o movimientos de datos.

La primera migración (`20240315_0001_initial_schema.py`) recrea las tablas,
claves foráneas, índices e inserciones iniciales que aparecen en
`db/schema.sql`. Debido a limitaciones de SQLite se aplicaron los siguientes
ajustes:

- Los índices GIN y las cláusulas `DESC` en índices compuestos no existen en
  SQLite, por lo que `clients_full_name_idx` y `expenses_base_date_idx` son
  índices B‑tree estándar en los mismos campos.
- Los tipos `INET` y `UUID` se representan como `String`. Para los UUID se usa
  un `server_default` basado en `randomblob()` para emular la función
  `gen_random_uuid()`.
- Las restricciones `CHECK` con expresiones regulares se sustituyeron por una
  comprobación `GLOB` equivalente (`ck_billing_periods_period_key`).

Si usas PostgreSQL, las migraciones activan los tipos especializados (`UUID`,
`INET`) y habilitan las extensiones `pgcrypto`/`pg_trgm` para que puedas crear
índices `GIN` más adelante (por ejemplo con `gin_trgm_ops`).

### Fuente de verdad del esquema

La fuente de verdad es **Alembic**. El archivo `db/schema.sql` es un snapshot
de referencia y debe actualizarse cada vez que cambien las migraciones en
`backend/alembic/versions/`.

### Verificación de coherencia con producción

Para validar que la estructura en producción coincide con el schema de
referencia:

1. Asegúrate de que la base de datos tenga aplicadas las migraciones más
   recientes (`alembic upgrade head`).
2. Ejecuta el script de verificación usando la misma `DATABASE_URL` de
   producción o staging:

   ```bash
   ./backend/scripts/check_schema_consistency.sh
   ```

El script compara el `pg_dump --schema-only` de la base contra
`db/schema.sql` y falla si encuentra diferencias.

También puedes activar un chequeo automático en el backend definiendo:

- `ENABLE_SCHEMA_CHECKS=1` para lanzar la tarea en segundo plano.
- `SCHEMA_CHECK_FREQUENCY` con `daily`, `weekly` o `Nh` (por ejemplo `12h`).
- `SCHEMA_CHECK_REFERENCE` si deseas usar otra ruta de referencia.
- `DATABASE_PG_DUMP_BIN` si `pg_dump` no está en el `PATH`.

## Inicio de desarrollo

Utiliza el script de conveniencia que garantiza que las migraciones están al
día antes de arrancar el servidor:

```bash
cd backend
./start.sh
```

En Windows puedes lograr lo mismo con `backend\start_backend.bat`; basta con
hacer doble clic sobre el archivo o ejecutarlo desde `cmd.exe`/PowerShell:

```bat
cd backend
start_backend.bat
```

Ambos scripts aplican `alembic upgrade head` y después lanzan Uvicorn en
`http://0.0.0.0:8000`.

> **Consejo:** si prefieres trabajar en una terminal tipo Unix en Windows,
> instala [Git Bash](https://git-scm.com/download/win) o habilita el Subsistema
> de Windows para Linux (WSL). Con cualquiera de estas opciones podrás ejecutar
> el script `./start.sh` directamente.

Si necesitas levantar frontend y backend desde el mismo asistente en Linux o
macOS, ejecuta el script `dev.sh` ubicado en la raíz del repositorio:

```bash
cd ..
./dev.sh
```

El comando creará/actualizará `backend/.venv`, instalará dependencias, aplicará
las migraciones y abrirá tanto Uvicorn como `npm run dev` en paralelo.

## Recordatorios automáticos de pago

El backend incluye una tarea diaria que revisa `client_accounts` para enviar
recordatorios de pago y registrar el resultado en la tabla
`payment_reminder_logs`. El servicio consulta:

- Cuentas con `fecha_proximo_pago` en los próximos `N` días (por defecto `3`) y
  envía un recordatorio preventivo.
- Cuentas con `fecha_proximo_pago` vencida para avisar sobre la suspensión (o
  indicar que ya están suspendidas).

### Activación del programador interno

El programador se ejecuta en un hilo en segundo plano cuando la API arranca si
se define la variable:

- `PAYMENT_REMINDER_SCHEDULER_ENABLED=1`

## Backups automáticos

Puedes activar los respaldos automáticos con `ENABLE_BACKUPS=1`. La tarea usa:

| Variable | Descripción |
|----------|-------------|
| `DATABASE_BACKUP_DIR` | Carpeta donde se almacenan los backups (obligatoria). |
| `DATABASE_BACKUP_FREQUENCY` | `daily`, `weekly` o `Nh` (por ejemplo `6h`). |
| `DATABASE_PG_DUMP_BIN` | Ruta personalizada para `pg_dump` (PostgreSQL). |

En PostgreSQL se genera un archivo `.dump` con `pg_dump --format=custom`. En
SQLite se copia el archivo `.db` existente.

Si necesitas deshabilitar el arranque del hilo (por ejemplo en pruebas o builds
de CI) establece además `ENABLE_PAYMENT_REMINDERS=0`; este flag detiene FastAPI
antes de que intente iniciar el programador. Opcionalmente puedes ajustar la
ventana y horario de ejecución con:

- `PAYMENT_REMINDER_DAYS_AHEAD` (entero, default `3`).
- `PAYMENT_REMINDER_RUN_HOUR` y `PAYMENT_REMINDER_RUN_MINUTE` para especificar
  la hora exacta en UTC (default `09:00`).
- `PAYMENT_REMINDER_RUN_ON_START` (booleano) para ejecutar inmediatamente al
  iniciar el servidor además de la corrida diaria.

Si prefieres un cron externo o un servicio en la nube (Cloud Scheduler, AWS
EventBridge, etc.), ejecuta el comando manual que realiza exactamente las mismas
acciones:

```bash
cd backend
python -m backend.app.scripts.payment_reminder_job
```

Por ejemplo, el siguiente `crontab` envía recordatorios todos los días a las
09:00 UTC desde un entorno virtual instalado en `backend/.venv`:

```cron
0 9 * * * cd /ruta/al/repositorio/backend && \
  ./.venv/bin/python -m backend.app.scripts.payment_reminder_job >> log.txt 2>&1
```

### Integración con proveedores de correo o mensajería

El módulo `services.payment_reminders` soporta distintos transportes:

- `console`: imprime el mensaje (útil para pruebas o ambientes sin credenciales).
- `sendgrid`: envía correos vía SendGrid.
- `twilio`: envía mensajes SMS/WhatsApp mediante Twilio.

Configura el transporte mediante `PAYMENT_REMINDER_TRANSPORT` (`auto`,
`console`, `sendgrid`, `twilio`). En modo `auto` se intenta usar SendGrid y, si
faltan variables obligatorias, se regresa al modo `console` para no perder la
ejecución.

Variables relevantes por proveedor:

| Proveedor | Variables requeridas |
|-----------|---------------------|
| SendGrid  | `SENDGRID_API_KEY`, `SENDGRID_SENDER_EMAIL`, opcional `SENDGRID_SENDER_NAME`, `SENDGRID_SANDBOX_MODE` (habilita el sandbox sin enviar correos reales). |
| Twilio    | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. |

El CLI acepta los mismos parámetros como banderas (`--sendgrid-api-key`,
`--twilio-from-number`, etc.) para facilitar pipelines que inyectan secretos a
último momento. Además, `--dry-run` fuerza el modo consola sin modificar la
base de datos remota ni contactar proveedores externos.

### Ejemplos listos para copiar

#### Envío por SendGrid (correo electrónico)

```
PAYMENT_REMINDER_TRANSPORT=sendgrid
SENDGRID_API_KEY=sg.xxxxxx
SENDGRID_SENDER_EMAIL=notificaciones@example.com
SENDGRID_SENDER_NAME=Recordatorios RedLink
# Opcional: activa el modo sandbox para pruebas sin correo real
SENDGRID_SANDBOX_MODE=true
PAYMENT_REMINDER_DAYS_AHEAD=3
PAYMENT_REMINDER_RUN_HOUR=9
PAYMENT_REMINDER_RUN_MINUTE=0
PAYMENT_REMINDER_RUN_ON_START=0
```

Ejecución de prueba sin tocar la base de datos ni contactar SendGrid:

```bash
cd backend
python -m backend.app.scripts.payment_reminder_job --dry-run \
  --payment-reminder-transport sendgrid \
  --sendgrid-api-key "$SENDGRID_API_KEY" \
  --sendgrid-sender-email "$SENDGRID_SENDER_EMAIL"
```

#### Envío por Twilio (SMS/WhatsApp)

```
PAYMENT_REMINDER_TRANSPORT=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=tu_token
TWILIO_FROM_NUMBER=whatsapp:+12345678900
PAYMENT_REMINDER_DAYS_AHEAD=2
PAYMENT_REMINDER_RUN_HOUR=14
PAYMENT_REMINDER_RUN_MINUTE=30
PAYMENT_REMINDER_RUN_ON_START=1
```

Ejecución de prueba en modo consola (no contacta Twilio) usando los mismos
parámetros que usará cron:

```bash
cd backend
python -m backend.app.scripts.payment_reminder_job --dry-run \
  --payment-reminder-transport twilio \
  --twilio-account-sid "$TWILIO_ACCOUNT_SID" \
  --twilio-auth-token "$TWILIO_AUTH_TOKEN" \
  --twilio-from-number "$TWILIO_FROM_NUMBER"
```

#### Cron/servicio externo recomendado

Si prefieres desactivar el programador interno y usar cron, define
`PAYMENT_REMINDER_SCHEDULER_ENABLED=0` y programa el comando manual. Ejemplo de
cron en UTC usando el entorno virtual local y registrando logs separados por
fecha:

```cron
0 9 * * * cd /ruta/al/repositorio/backend && \
  PAYMENT_REMINDER_SCHEDULER_ENABLED=0 \
  ./.venv/bin/python -m backend.app.scripts.payment_reminder_job \
  >> logs/payment-reminder-$(date +\%F).log 2>&1
```

Para servicios como `systemd`, crea un `EnvironmentFile=/ruta/backend/.env`
con las variables anteriores y usa `ExecStart=/ruta/backend/.venv/bin/python -m
backend.app.scripts.payment_reminder_job`. Ajusta la zona horaria del host o el
timer para alinearlo con tus usuarios.

## Checklist para cambios de esquema

Cuando necesites reestructurar la base de datos sigue el
[flujo recomendado](../docs/database-workflow.md). A modo de resumen:

1. Ajusta `db/schema.sql` o los modelos en `backend/app/models/` para reflejar
   la nueva forma de los datos.
2. Genera una migración con `./scripts/new_migration.sh -m "mensaje"` y edítala
   según sea necesario.
3. Aplica `alembic upgrade head` en tu entorno local y verifica que la API siga
   funcionando.
4. Actualiza esquemas Pydantic, seeds y componentes del frontend involucrados.
5. Ejecuta `./dev.sh --skip-frontend-install --skip-backend-install` para correr
   lint, pruebas y validaciones automáticas.

Documentar cada migración y mantener sincronizados los fixtures de prueba hará
que futuros cambios sean más rápidos y confiables.
