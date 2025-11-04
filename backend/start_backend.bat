@echo off
setlocal enabledelayedexpansion

rem Cambia al directorio donde está este script
pushd %~dp0

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontró Python en el PATH. Instala Python 3.10+ o activa tu entorno virtual antes de ejecutar este script.
    pause
    exit /b 1
)

if exist ..\.venv\Scripts\activate.bat (
    call ..\.venv\Scripts\activate.bat
) else if exist ..\venv\Scripts\activate.bat (
    call ..\venv\Scripts\activate.bat
)

echo.
echo [INFO] Aplicando migraciones de base de datos con Alembic...
alembic -c alembic.ini upgrade head
if errorlevel 1 goto :error

echo.
echo [INFO] Iniciando el servidor FastAPI con Uvicorn en http://localhost:8000 ...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
if errorlevel 1 goto :error

goto :end

:error
echo.
echo [ERROR] El backend se detuvo debido a un problema. Revisa los mensajes anteriores.
pause
exit /b 1

:end
popd
endlocal
