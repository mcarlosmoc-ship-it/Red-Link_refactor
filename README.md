# Red-Link — Sistema ISP (Frontend)

Proyecto React + Vite + Tailwind.

## Configuración

1. Copia el archivo de ejemplo y ajusta la URL base de la API según tu entorno:

   ```bash
   cp .env.example .env.local
   ```

2. Edita `.env.local` y define la variable `VITE_API_BASE_URL` (por ejemplo `http://localhost:8000`).

   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   ```

   Durante el arranque Vite leerá este valor para construir las peticiones del `apiClient`.

## Base de datos

El proyecto actualmente es solo frontend, pero se incluye un esquema SQL en `db/schema.sql`
para iniciar una base de datos PostgreSQL con las tablas necesarias para clientes,
pagos, inventario, revendedores y gastos operativos del sistema.

## Scripts
- npm run dev
- npm run build
- npm run preview
- npm run lint
- npm run test (ejecuta Vitest)
