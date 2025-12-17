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
REM Lee las variables desde backend/.env para evitar credenciales en el script.
set "ENV_FILE=.env"
if exist "%ENV_FILE%" (
    echo [INFO] Cargando variables de entorno desde %ENV_FILE% ...
    for /f "usebackq tokens=* delims=" %%I in ("%ENV_FILE%") do (
        set "line=%%I"
        if not "!line!"=="" if not "!line:~0,1!"=="#" (
            for /f "tokens=1,* delims==" %%K in ("!line!") do (
                set "%%K=%%L"
            )
        )
    )
) else (
    echo [ERROR] No se encontro %ENV_FILE%. Copia backend\.env.example y personaliza tus valores.
    echo Por ejemplo: CLIENT_PASSWORD_KEY, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_JWT_SECRET.
    goto :error
)

set "missing_env=0"
for %%V in (CLIENT_PASSWORD_KEY ADMIN_USERNAME ADMIN_PASSWORD_HASH ADMIN_JWT_SECRET) do (
    if not defined %%V (
        echo [ERROR] Falta la variable obligatoria %%V en %ENV_FILE%.
        set "missing_env=1"
    )
)
if "%missing_env%"=="1" goto :error
REM ============================================

echo [INFO] ADMIN_USERNAME=%ADMIN_USERNAME%
echo [INFO] Define tu propio hash de contrasena en %ENV_FILE% (ver backend\README.md).

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
