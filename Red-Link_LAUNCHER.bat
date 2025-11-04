@echo off
setlocal enabledelayedexpansion

rem =============================================================
rem   Red-Link — Lanzador integral (frontend + backend)
rem   Ejecuta este archivo con doble clic para preparar dependencias,
rem   correr verificaciones y levantar ambos servicios en ventanas
rem   separadas.
rem =============================================================

title Red-Link - Lanzador integral
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "WARNINGS="

call :banner
call :log INFO "Ubicacion del proyecto: %PROJECT_DIR%"

call :require_command npm "No se encontro npm. Instala Node.js desde https://nodejs.org/ antes de continuar."
if errorlevel 1 goto :fail

call :require_command python "No se encontro Python en el PATH. Instala Python 3.10+ desde https://www.python.org/downloads/ y vuelve a ejecutar este script."
if errorlevel 1 goto :fail

call :require_file "%PROJECT_DIR%\package.json" "No se encontro package.json en el directorio del proyecto. Asegurate de ejecutar el script dentro del repositorio clonado."
if errorlevel 1 goto :fail

call :require_file "%BACKEND_DIR%\requirements.txt" "No se encontro backend\\requirements.txt. Verifica que el repositorio este completo."
if errorlevel 1 goto :fail

if not exist "%PROJECT_DIR%\.env.local" (
    call :log WARN "No se encontro .env.local. Copia .env.example a .env.local y ajusta VITE_API_BASE_URL segun tu backend."
)

call :setup_backend
if errorlevel 1 goto :fail

call :setup_frontend
if errorlevel 1 goto :fail

call :run_checks

call :launch_services
if errorlevel 1 goto :fail

call :summary

goto :end

:fail
echo.
call :log ERROR "Se detectaron errores que impidieron completar la configuracion automatica. Revisa los mensajes anteriores para mas detalles."
echo.
pause
exit /b 1

:end
echo.
call :log INFO "Proceso completado. Puedes cerrar esta ventana tras revisar los mensajes."
echo.
pause
exit /b 0

:banner
echo =============================================================
echo   Red-Link — Asistente de configuracion y arranque
echo =============================================================
exit /b 0

:log
set "LEVEL=%~1"
set "MESSAGE=%~2"
if /I "%LEVEL%"=="ERROR" (
    echo [ERROR] %MESSAGE%
) else if /I "%LEVEL%"=="WARN" (
    echo [ADVERTENCIA] %MESSAGE%
) else if /I "%LEVEL%"=="SUCCESS" (
    echo [OK] %MESSAGE%
) else (
    echo [%LEVEL%] %MESSAGE%
)
exit /b 0

:require_command
where %~1 >nul 2>nul
if errorlevel 1 (
call :log ERROR "%~2"
    exit /b 1
)
exit /b 0

:require_file
if not exist "%~1" (
    call :log ERROR "%~2"
    exit /b 1
)
exit /b 0

:setup_backend
call :log INFO "Preparando backend (FastAPI)..."
pushd "%BACKEND_DIR%" >nul

if not exist "%VENV_PYTHON%" (
    call :log INFO "Creando entorno virtual en backend\\.venv ..."
    python -m venv .venv
    if errorlevel 1 (
        popd >nul
        call :log ERROR "No se pudo crear el entorno virtual. Verifica tu instalacion de Python."
        exit /b 1
    )
    call :log SUCCESS "Entorno virtual creado correctamente."
) else (
    call :log INFO "Se encontro entorno virtual existente."
)

if not exist "%VENV_PIP%" (
    popd >nul
    call :log ERROR "No se encontro pip dentro del entorno virtual. Intenta eliminar backend\\.venv y vuelve a ejecutar el script."
    exit /b 1
)

call :log INFO "Actualizando pip..."
call "%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 (
    popd >nul
    call :log ERROR "Fallo la actualizacion de pip en el entorno virtual."
    exit /b 1
)

call :log INFO "Instalando dependencias del backend..."
call "%VENV_PIP%" install -r requirements.txt
if errorlevel 1 (
    popd >nul
    call :log ERROR "Fallo la instalacion de dependencias del backend."
    exit /b 1
)

call :log INFO "Aplicando migraciones de base de datos con Alembic..."
call "%VENV_PYTHON%" -m alembic -c alembic.ini upgrade head
if errorlevel 1 (
    popd >nul
    call :log ERROR "Las migraciones de Alembic fallaron. Revisa tu DATABASE_URL o permisos de la base de datos."
    exit /b 1
)

popd >nul
call :log SUCCESS "Backend listo."
exit /b 0

:setup_frontend
call :log INFO "Preparando frontend (Vite + React)..."
pushd "%PROJECT_DIR%" >nul
if not exist "node_modules" (
    call :log INFO "Instalando dependencias de Node (npm install)..."
    call npm install
    if errorlevel 1 (
        popd >nul
        call :log ERROR "npm install fallo. Revisa tu conexion a internet o permisos."
        exit /b 1
    )
) else (
    call :log INFO "Dependencias de Node detectadas (node_modules)."
)
popd >nul
call :log SUCCESS "Frontend listo."
exit /b 0

:run_checks
call :log INFO "Ejecutando comprobaciones rapidas (lint y pruebas)..."
pushd "%PROJECT_DIR%" >nul
call npm run lint
if errorlevel 1 (
    set "WARNINGS=1"
    call :log WARN "npm run lint reporto problemas. Corrige los errores de ESLint antes de subir cambios."
) else (
    call :log SUCCESS "Lint del frontend completado sin errores."
)

call npm run test -- --run
if errorlevel 1 (
    set "WARNINGS=1"
    call :log WARN "Las pruebas del frontend (Vitest) fallaron. Revisa los mensajes anteriores."
) else (
    call :log SUCCESS "Pruebas del frontend completadas correctamente."
)
popd >nul

pushd "%BACKEND_DIR%" >nul
call "%VENV_PYTHON%" -m pytest
if errorlevel 1 (
    set "WARNINGS=1"
    call :log WARN "Las pruebas del backend (pytest) reportaron errores."
) else (
    call :log SUCCESS "Pruebas del backend completadas correctamente."
)
popd >nul
exit /b 0

:launch_services
call :log INFO "Iniciando servicios en ventanas separadas..."
if exist "%VENV_ACTIVATE%" (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && call \"%VENV_ACTIVATE%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) else (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
)
if errorlevel 1 (
    call :log ERROR "No se pudo iniciar la ventana del backend."
    exit /b 1
)

start "Red-Link Frontend" cmd /k "cd /d \"%PROJECT_DIR%\" && npm run dev"
if errorlevel 1 (
    call :log ERROR "No se pudo iniciar la ventana del frontend."
    exit /b 1
)

start "" "http://localhost:5173/"
call :log SUCCESS "Servicios iniciados. Se intento abrir http://localhost:5173/ en tu navegador predeterminado."
exit /b 0

:summary
echo.
call :log INFO "Resumen del asistente:"
if defined WARNINGS (
    call :log WARN "Se detectaron advertencias en las comprobaciones. Revisa las ventanas para mas detalles."
) else (
    call :log SUCCESS "No se detectaron problemas en las comprobaciones automatizadas."
)

echo    - Backend: http://localhost:8000
call :log INFO "    - Frontend: http://localhost:5173"
call :log INFO "Para detener los servicios, cierra las ventanas abiertas o usa CTRL+C en cada una."
exit /b 0
