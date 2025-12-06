# Red-Link — Sistema ISP

Aplicación completa compuesta por un **frontend en React (Vite + Tailwind)** y un
**backend FastAPI** con migraciones Alembic. Sigue esta guía para dejar tu
entorno listo y comenzar a registrar clientes, pagos y navegar por todas las
vistas del sistema.

## Requisitos previos

Asegúrate de contar con las siguientes herramientas instaladas en tu máquina:

- [Node.js](https://nodejs.org/) (incluye `npm`). Recomendado v18 o superior.
- [Python 3.10+](https://www.python.org/) con `pip` y, idealmente, `venv` para
  aislar dependencias.
- (Opcional) Un servidor de PostgreSQL si deseas usarlo en lugar de SQLite.

Puedes verificar las versiones actuales con:

```bash
node --version
npm --version
python3 --version
```

## Inicio rápido en Linux/macOS

Para un flujo completamente automatizado en entornos Unix, ejecuta `./dev.sh` desde la raíz del repositorio. El asistente:

- Verifica que `npm` y `python3` estén disponibles.
- Crea (si hace falta) el entorno virtual en `backend/.venv` e instala las dependencias del backend.
- Ejecuta `npm install` cuando aún no existe `node_modules/`.
- Aplica `alembic upgrade head` reutilizando la misma `DATABASE_URL` que usa la API.
- Corre `npm run lint`, `npm run test -- --run` y `pytest` (puedes omitirlos con `--skip-checks`). Si alguna comprobación falla, el script se detiene para que puedas corregir el problema antes de continuar.
- Levanta FastAPI y Vite en paralelo; al terminar verás el backend (`http://localhost:8000`) y el frontend (`http://localhost:5173`).

Opcionalmente puedes acelerar la preparación con:

```bash
./dev.sh --skip-frontend-install      # omite npm install
./dev.sh --skip-backend-install       # omite pip install -r backend/requirements.txt
./dev.sh --skip-checks                # evita lint y pruebas automáticas
```

Detén los servicios con `Ctrl+C`; el script finaliza ambos procesos de forma segura.

Si deseas ver cómo luce un fallo durante las comprobaciones automáticas, aquí tienes un ejemplo:

```
[INFO] Ejecutando npm run lint
[ERROR] npm run lint reportó problemas
[ERROR] Se detectaron fallos en las comprobaciones. Corrige los errores o ejecuta el script con --skip-checks.
```

En ese caso el asistente no iniciará los servicios hasta que corrijas los errores o lo ejecutes con `--skip-checks`.

## Inicio rápido en Windows (PowerShell)

Si estás en Windows y el lanzador `.bat` no funciona en tu equipo, puedes usar el script `Red-Link_QUICKSTART.ps1`. Este script automatiza la instalación mínima y levanta ambos servicios en ventanas separadas.

1. Haz clic derecho sobre `Red-Link_QUICKSTART.ps1` y elige **Run with PowerShell**.
   - También puedes ejecutarlo desde una terminal con:
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\Red-Link_QUICKSTART.ps1
     ```
2. El asistente verificará que tengas `npm` y `python` instalados, preparará el entorno virtual del backend, instalará dependencias si hacen falta y correrá `alembic upgrade head`.
3. Al finalizar abrirá dos ventanas nuevas de PowerShell: una con el backend (`uvicorn`) y otra con el frontend (`npm run dev`), además de lanzar `http://localhost:5173/` en tu navegador.

Si ya tienes las dependencias instaladas puedes acelerar el proceso usando los parámetros opcionales:

```powershell
# Omitir npm install
powershell -ExecutionPolicy Bypass -File .\Red-Link_QUICKSTART.ps1 -SkipFrontendInstall

# Omitir pip install
powershell -ExecutionPolicy Bypass -File .\Red-Link_QUICKSTART.ps1 -SkipBackendInstall
```

Recuerda detener los servicios cerrando las ventanas que se abren al final.

## Configuración del frontend (Vite + React)

1. Instala las dependencias de Node:

   ```bash
   npm install
   ```

2. Crea el archivo de variables de entorno y define la URL base de la API:

   ```bash
   cp .env.example .env.local
   echo "VITE_API_BASE_URL=http://localhost:8000" >> .env.local
   ```

   Ajusta el valor si tu backend corre en otra dirección u otro puerto.

3. Una vez configurado puedes levantar el entorno de desarrollo con:

   ```bash
   npm run dev
   ```

   Vite iniciará en `http://localhost:5173` (por defecto) y todas las peticiones
   se enviarán a `VITE_API_BASE_URL`.

## Configuración del backend (FastAPI)

1. Crea y activa un entorno virtual (opcional pero recomendado) y luego instala
   las dependencias de Python:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copia la plantilla de variables de entorno y completa tus secretos:

   ```bash
   cp backend/.env.example backend/.env
   ```

   - `CLIENT_PASSWORD_KEY`: clave base64 urlsafe de **al menos 32 bytes** para
     cifrar contraseñas de clientes.
   - `ADMIN_USERNAME`: usuario permitido en `/auth/token` (usa tu propio correo
     o alias).
   - `ADMIN_PASSWORD_HASH`: hash PBKDF2 producido por
     `backend.app.security.generate_password_hash`.
   - `ADMIN_JWT_SECRET`: cadena aleatoria y larga para firmar JWT (se recomienda
     32+ caracteres).

3. Define la variable `DATABASE_URL` si quieres usar un motor distinto a SQLite.
   Si la omites, la API crea y usa `backend/clients.db` como base de datos
   SQLite. (La ruta se resuelve automáticamente a su versión absoluta dentro
   de `backend/`.)

4. Aplica las migraciones para crear todas las tablas necesarias:

   ```bash
   alembic upgrade head
   ```

   El script `start.sh` ejecuta este comando automáticamente antes de iniciar
   Uvicorn, por lo que también puedes ejecutar:

   ```bash
   ./start.sh
   ```

   > **Consejo:** si prefieres quedarte en la raíz del repositorio puedes usar
   > `./backend/scripts/run_alembic.sh upgrade head`, que cambia de directorio
   > y apunta al `alembic.ini` correcto por ti.

5. Con las migraciones al día, el backend quedará escuchando en
   `http://0.0.0.0:8000`. Asegúrate de que esta URL coincida con la definida en
   `VITE_API_BASE_URL`.

### Variables de entorno obligatorias para la autenticación

Además de la base de datos, el backend requiere varios secretos para habilitar
el inicio de sesión del panel. Configúralos antes de iniciar el servidor:

| Variable | Descripción |
|----------|-------------|
| `CLIENT_PASSWORD_KEY` | Clave base64 de al menos 32 bytes para cifrar contraseñas de clientes. |
| `ADMIN_USERNAME` | Usuario administrador permitido en `/auth/token`. |
| `ADMIN_PASSWORD_HASH` | Hash PBKDF2 generado con `backend.app.security.generate_password_hash`. |
| `ADMIN_JWT_SECRET` | Cadena aleatoria usada para firmar los JWT. |

Opcionales:

- `ADMIN_TOTP_SECRET`: habilita códigos OTP (TOTP) si quieres 2FA.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: minutos de vigencia para cada token (default 15).

Para obtener el hash del administrador ejecuta:

```bash
cd backend
python - <<'PY'
from backend.app.security import generate_password_hash

print(generate_password_hash("TuContraseñaSegura123"))
PY
```

Cuando el backend está configurado puedes solicitar un token válido:

```bash
curl -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com","password":"TuContraseñaSegura123"}'
```

Si usas 2FA añade `"otp_code"` al cuerpo. Copia el `access_token` de la
respuesta para configurarlo en el frontend.

### Inyectar el token en el frontend

El SPA intenta guardar el token JWT en `localStorage` con la clave
`red-link.backoffice.accessToken`; si el navegador sólo expone
`sessionStorage` (por ejemplo, en contextos con restricciones de privacidad)
usa ese almacenamiento como alternativa para que las peticiones sigan
autenticadas durante la sesión. Existen dos formas sencillas de establecerlo:

1. **Variable de entorno**: define `VITE_API_ACCESS_TOKEN` en `.env.local`.
   Durante el arranque el cliente leerá ese valor y lo aplicará a todas las
   peticiones como cabecera `Authorization: Bearer <token>`.
2. **Consola del navegador**: abre DevTools y ejecuta
   ```js
   window.__RED_LINK_API_CLIENT__.setAccessToken('pega-tu-token-aquí')
   ```
   El helper también queda disponible como `window.__RED_LINK_API_CLIENT__` para
   limpiar (`clearAccessToken()`) o consultar (`getAccessToken()`) el valor
   actual.

Ambos métodos persisten el token entre recargas; si necesitas cerrarlo puedes
ejecutar `window.__RED_LINK_API_CLIENT__.clearAccessToken()` o eliminar la
entrada manualmente desde las herramientas de almacenamiento del navegador.

## Despliegue recomendado

Consulta la guía [docs/deployment.md](docs/deployment.md) para un checklist de
producción: requisitos de sistema, configuración de `DATABASE_URL` para
PostgreSQL, provisión de secretos, ejecución de migraciones, uso de un process
manager y ejemplos de proxy inverso (Nginx/Caddy) con HTTPS.

## Base de datos

- El esquema completo de tablas, índices y datos iniciales se encuentra en
  `db/schema.sql`. Úsalo como referencia si deseas preparar manualmente una
  base PostgreSQL.
- Las migraciones de Alembic replican este esquema y aplican los ajustes
  necesarios para SQLite (tipos y restricciones equivalentes). Si usas
  PostgreSQL puedes adaptar la migración para recuperar tipos especializados
  como `INET` o `UUID`.
- Si distribuyes un `backend/clients.db` precargado (por ejemplo, con datos de
  demostración) y necesitas regenerarlo desde cero, elimina el archivo y vuelve
  a ejecutar `alembic upgrade head` (o simplemente `./backend/start.sh`, que
  incluye ese paso). También puedes recrear rápidamente la base aplicando el
  script de bootstrap provisto:

  ```bash
  sqlite3 backend/clients.db < db/schema.sql
  ```

  Tras regenerarla, vuelve a iniciar la API para que ejecute las migraciones y
  asegúrate de copiar nuevamente el archivo si necesitas distribuirlo.
- Cuando planifiques una reestructuración importante, consulta el documento
  [Flujo recomendado para cambios de base de datos](docs/database-workflow.md)
  para seguir un checklist que cubre diseño, migraciones, seeds y validaciones.

## Verificación y pruebas

Después de instalar dependencias y aplicar migraciones, ejecuta los comandos de
prueba y lint para asegurarte de que todo funciona correctamente:

```bash
npm run lint
npm run test      # Vitest

cd backend
pytest            # pruebas del backend
```

## Flujo de trabajo recomendado

1. Arranca el backend con `./start.sh` (o `uvicorn app.main:app --reload`).
2. Levanta el frontend con `npm run dev` en otra terminal.
3. Abre `http://localhost:5173` en tu navegador para empezar a operar el
   sistema (registro de clientes, cobros, inventario, etc.).

Si necesitas más detalles específicos del backend consulta
[`backend/README.md`](backend/README.md).
