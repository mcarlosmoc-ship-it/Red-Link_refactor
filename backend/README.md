# Backend Red-Link

Este directorio contiene el backend FastAPI y la configuración de migraciones con Alembic.

## Configuración inicial
1. Crear y activar un entorno virtual de Python 3.11+.
2. Instalar dependencias: `pip install -r requirements.txt`.
3. Definir la URL de conexión en la variable de entorno `DATABASE_URL`. Si no se configura, se usa por defecto `sqlite:///./clients.db` en el directorio del backend.

## Migraciones de base de datos
- Generar migraciones: `alembic revision --autogenerate -m "mensaje"`.
- Aplicar migraciones: `alembic upgrade head`.

Para facilitar el despliegue local se añadió `backend/start.sh`, un script que ejecuta automáticamente `alembic upgrade head` antes de iniciar Uvicorn.

## Decisiones de compatibilidad con SQLite
El esquema original (`db/schema.sql`) fue diseñado para PostgreSQL. La migración inicial replica su estructura teniendo en cuenta estas adaptaciones:

- Los campos `INET` y los UUID con `gen_random_uuid()` se representaron como `String(45)` y `String(36)` con generación de UUID desde la aplicación.
- La verificación del formato `period_key` utiliza `GLOB` porque SQLite no soporta `~` con expresiones regulares POSIX.
- Los índices GIN y los índices con orden descendente se sustituyeron por índices B-Tree simples compatibles con SQLite.
- Los valores por defecto `NOW()` y `TIMESTAMPTZ` se implementaron con `CURRENT_TIMESTAMP` y columnas `DateTime(timezone=True)`.

Estas decisiones garantizan que la base SQLite embebida funcione correctamente durante el desarrollo sin perder la compatibilidad lógica con PostgreSQL.
