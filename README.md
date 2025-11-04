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

## Inicio rápido en Windows (PowerShell)

Si estás en Windows y el lanzador `.bat` no funciona en tu equipo, puedes usar el nuevo script `Red-Link_QUICKSTART.ps1`. Este script automatiza la instalación mínima y levanta ambos servicios en ventanas separadas.

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

2. Define la variable `DATABASE_URL` si quieres usar un motor distinto a SQLite.
   Si la omites, la API usará automáticamente `sqlite:///./clients.db`.

3. Aplica las migraciones para crear todas las tablas necesarias:

   ```bash
   alembic upgrade head
   ```

   El script `start.sh` ejecuta este comando automáticamente antes de iniciar
   Uvicorn, por lo que también puedes ejecutar:

   ```bash
   ./start.sh
   ```

4. Con las migraciones al día, el backend quedará escuchando en
   `http://0.0.0.0:8000`. Asegúrate de que esta URL coincida con la definida en
   `VITE_API_BASE_URL`.

## Base de datos

- El esquema completo de tablas, índices y datos iniciales se encuentra en
  `db/schema.sql`. Úsalo como referencia si deseas preparar manualmente una
  base PostgreSQL.
- Las migraciones de Alembic replican este esquema y aplican los ajustes
  necesarios para SQLite (tipos y restricciones equivalentes). Si usas
  PostgreSQL puedes adaptar la migración para recuperar tipos especializados
  como `INET` o `UUID`.

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
