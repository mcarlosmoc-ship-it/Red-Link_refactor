# Backend FastAPI + Alembic

Este directorio contiene el backend de FastAPI junto con la configuración de
migraciones de Alembic y un esquema inicial derivado de `db/schema.sql`.

## Configuración de la base de datos

- La URL de conexión se comparte con la aplicación a través de la variable de
  entorno `DATABASE_URL`. Si no está definida, se usa SQLite en
  `sqlite:///./clients.db`.
- El motor de SQLAlchemy y Alembic reutilizan este valor, por lo que modificar
  `DATABASE_URL` en el entorno afecta tanto a la API como a las migraciones.

## Migraciones

El directorio `alembic/` aloja el entorno de Alembic. Para aplicar el estado de
esquema más reciente ejecuta:

```bash
cd backend
alembic upgrade head
```

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

Si usas PostgreSQL, puedes adaptar la migración para recuperar los tipos
especializados (`INET`, `UUID`, índices GIN, etc.).

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

> **Nota:** si el script de Windows muestra "No se encontró el comando
> Alembic", asegúrate de haber instalado las dependencias del backend con
> `pip install -r requirements.txt` (preferiblemente dentro de un entorno
> virtual) y vuelve a ejecutarlo.

> **Consejo:** si prefieres trabajar en una terminal tipo Unix en Windows,
> instala [Git Bash](https://git-scm.com/download/win) o habilita el Subsistema
> de Windows para Linux (WSL). Con cualquiera de estas opciones podrás ejecutar
> el script `./start.sh` directamente.
