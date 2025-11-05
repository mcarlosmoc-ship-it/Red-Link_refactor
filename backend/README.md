# Backend FastAPI + Alembic

Este directorio contiene el backend de FastAPI junto con la configuración de
migraciones de Alembic y un esquema inicial derivado de `db/schema.sql`.

## Configuración de la base de datos

- La URL de conexión se comparte con la aplicación a través de la variable de
  entorno `DATABASE_URL`. Si no está definida, se usa SQLite en
  `sqlite:///./clients.db` y el archivo se crea automáticamente dentro de
  `backend/`.
- Si defines un `DATABASE_URL` con PostgreSQL (por ejemplo
  `postgresql+psycopg://usuario:clave@localhost/redlink`), SQLAlchemy activa
  automáticamente el chequeo de conexiones (`pool_pre_ping`) y las migraciones
  aprovechan los tipos nativos (`UUID`, `INET`) además de habilitar las
  extensiones `pgcrypto` y `pg_trgm`.
- El motor de SQLAlchemy y Alembic reutilizan este valor, por lo que modificar
  `DATABASE_URL` en el entorno afecta tanto a la API como a las migraciones.

## Migraciones

El directorio `alembic/` aloja el entorno de Alembic. Para aplicar el estado de
esquema más reciente ejecuta:

```bash
cd backend
alembic upgrade head
```

Si vas a crear nuevas versiones, genera un borrador autogenerado con:

```bash
./scripts/new_migration.sh -m "descripcion breve"
```

El script se asegura de que el entorno virtual esté listo antes de invocar
`alembic revision --autogenerate`. Después edita el archivo generado en
`alembic/versions/` para ajustar defaults o movimientos de datos.

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
