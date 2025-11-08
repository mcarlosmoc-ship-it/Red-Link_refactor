@echo off
setlocal enabledelayedexpansion

REM Ir al directorio donde esta este script (backend)
pushd %~dp0

REM Verificar Python
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro Python en el PATH. Instala Python 3.10+.
    pause
    exit /b 1
)

REM Crear / activar entorno virtual en backend\.venv
if not exist .venv (
    echo [INFO] Creando entorno virtual del backend en .venv ...
    python -m venv .venv
)
call .venv\Scripts\activate.bat

REM ====== VARIABLES OBLIGATORIAS (LOCAL) ======
set CLIENT_PASSWORD_KEY=MDEyMzQ1Njc4OWFiY2RlZmcwMTIzNDU2Nzg5YWJjZGVmZzAxMjM0
set ADMIN_USERNAME=admin@example.com
REM Hash generado para password: Admin1234
set ADMIN_PASSWORD_HASH=390000$yZglyW0EpwUMA6cfl3E3eA==$l7fVrjPlChxs6V3uj7kEmP3Tpd_sU36k0u8Zsu0MTpw=
set ADMIN_JWT_SECRET=un_secreto_largo_para_tokens_123
REM ============================================

echo [INFO] ADMIN_USERNAME=%ADMIN_USERNAME%
echo [INFO] Password del admin: Admin1234

REM Instalar dependencias del backend (solo primera vez)
if not exist .deps_installed.ok (
    echo.
    echo [INFO] Instalando dependencias del backend...
    pip install -r requirements.txt
    if errorlevel 1 goto :error
    echo ok> .deps_installed.ok
)

echo.
echo [INFO] Aplicando migraciones de base de datos con Alembic...
alembic -c alembic.ini upgrade head
if errorlevel 1 goto :error

echo.
echo [INFO] Iniciando servidor FastAPI en http://localhost:8000 ...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
if errorlevel 1 goto :error

goto :end

:error
echo.
echo [ERROR] El backend se detuvo por un problema. Revisa los mensajes anteriores.
pause
exit /b 1

:end
popd
endlocal
