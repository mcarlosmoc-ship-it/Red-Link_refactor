# Flujo recomendado para cambios de base de datos

Este documento resume el proceso sugerido para introducir cambios en el esquema
de la base de datos sin romper el backend ni el frontend. Sigue estos pasos
cada vez que agregues, modifiques o elimines tablas y columnas.

## 1. Diseña el cambio

1. Actualiza primero el archivo [`db/schema.sql`](../db/schema.sql) como
   representación de alto nivel del modelo de datos. Esto te ayuda a visualizar
   relaciones, llaves foráneas e índices antes de tocar código.
2. Si prefieres trabajar desde SQLAlchemy, identifica qué modelos en
   `backend/app/models/` se verán afectados y anota los cambios esperados.

> **Consejo:** mantener `schema.sql` alineado con la realidad facilita recrear
> bases de ejemplo y documentar el contrato para otros miembros del equipo.

## 2. Genera o edita la migración

1. Crea un nuevo borrador de migración con soporte completo para autogeneración:

   ```bash
   cd backend
   . .venv/bin/activate                      # usa tu entorno virtual
   alembic revision --autogenerate -m "descripcion breve"
   ```

2. Revisa el archivo creado en `backend/alembic/versions/` para asegurarte de
   que solo contiene las operaciones necesarias. Es normal tener que editarlo
   manualmente para manejar datos existentes o valores por defecto.
3. Si la migración involucra datos, aprovecha los helpers de Alembic (por
   ejemplo, `op.execute` y `op.bulk_insert`) para moverlos de forma controlada.

Para agilizar este paso puedes usar el script `backend/scripts/new_migration.sh`,
que envuelve el comando anterior y valida que tu entorno esté listo.

## 3. Ejecuta las migraciones en un entorno local

1. Aplica el nuevo archivo contra tu base local:

   ```bash
   cd backend
   alembic upgrade head
   ```

   Esto garantiza que la estructura sea válida tanto para bases vacías como para
   bases existentes.
2. Si necesitas recrear una base SQLite desde cero, ejecuta:

   ```bash
   rm -f backend/clients.db
   sqlite3 backend/clients.db < db/schema.sql
   alembic upgrade head
   ```

   Para PostgreSQL puedes levantar un contenedor temporal y apuntar
   `DATABASE_URL` al servicio para validar el mismo flujo.

## 4. Actualiza modelos, esquemas y seeds

- Ajusta los modelos de SQLAlchemy en `backend/app/models/` y los esquemas
  Pydantic en `backend/app/schemas/` para reflejar los cambios.
- Revisa los fixtures de pruebas (`backend/tests/conftest.py`) y cualquier seed
  manual o script de carga que dependa de los campos modificados.
- Asegúrate de que las rutas FastAPI y los componentes del frontend sigan
  recibiendo/mostrando los datos correctos.

## 5. Ejecuta la batería de verificaciones

El script [`dev.sh`](../dev.sh) automatiza este paso:

```bash
./dev.sh --skip-frontend-install --skip-backend-install
```

El asistente aplica las migraciones, corre `npm run lint`, `npm run test -- --run`
y `pytest backend`. Si algo falla, corrígelo antes de continuar.

## 6. Documenta el cambio

- Describe brevemente la migración en el README o en notas de despliegue si
  requiere pasos manuales adicionales.
- Indica si hay scripts de datos que deban ejecutarse después de actualizar.

Seguir esta rutina reduce de manera drástica el tiempo invertido en reparar
errores tras una reestructuración del esquema y mantiene el proyecto preparado
para iterar con confianza.
