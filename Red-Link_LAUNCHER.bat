@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem =============================================================
rem   Red-Link - Asistente de configuracion y arranque
rem   Ejecuta este archivo con doble clic para preparar dependencias,
rem   realizar comprobaciones y levantar frontend/backend.
rem =============================================================

cd /d "%~dp0"
set "PROJECT_DIR=%cd%"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "WARNINGS=0"

echo =============================================================
echo   Red-Link - Asistente de configuracion y arranque
echo =============================================================
echo [INFO] Ubicacion del proyecto: %PROJECT_DIR%

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No se encontro npm. Instala Node.js desde https://nodejs.org/ antes de continuar.
    goto :fail
)

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] No se encontro Python en PATH. Instala Python 3.10 o superior desde https://www.python.org/downloads/ y vuelve a ejecutar este script.
    goto :fail
)

if not exist "%PROJECT_DIR%\package.json" (
    echo [ERROR] No se encontro package.json en el directorio del proyecto. Ejecuta el script dentro del repositorio clonado.
    goto :fail
)

if not exist "%BACKEND_DIR%\requirements.txt" (
    echo [ERROR] No se encontro backend\requirements.txt. Verifica que la descarga del repositorio este completa.
    goto :fail
)

if not exist "%PROJECT_DIR%\.env.local" (
    if exist "%PROJECT_DIR%\.env.example" (
        echo [INFO] No se encontro .env.local. Creando copia inicial desde .env.example ...
        copy /Y "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env.local" >nul
        if errorlevel 1 (
            echo [ERROR] No se pudo copiar .env.example a .env.local. Realiza la copia manualmente.
            goto :fail
        ) else (
            echo [ADVERTENCIA] Se creo .env.local automaticamente. Ajusta VITE_API_BASE_URL para que apunte a tu backend.
        )
    ) else (
        echo [ADVERTENCIA] Falta .env.local. Copia .env.example a .env.local y ajusta VITE_API_BASE_URL segun tu backend.
        set "WARNINGS=1"
    )
)

echo [INFO] Preparando backend (FastAPI)...
pushd "%BACKEND_DIR%" >nul

if not exist "%VENV_PYTHON%" (
    echo [INFO] Creando entorno virtual en backend\.venv ...
    python -m venv .venv
    if errorlevel 1 (
        popd >nul
        echo [ERROR] No se pudo crear el entorno virtual. Verifica la instalacion de Python.
        goto :fail
    )
    echo [OK] Entorno virtual creado correctamente.
) else (
    echo [INFO] Se detecto entorno virtual existente.
)

if not exist "%VENV_PIP%" (
    popd >nul
    echo [ERROR] No se encontro pip dentro del entorno virtual. Elimina backend\.venv y vuelve a ejecutar el script.
    goto :fail
)

echo [INFO] Actualizando pip...
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 (
    popd >nul
    echo [ERROR] Fallo la actualizacion de pip dentro del entorno virtual.
    goto :fail
)

echo [INFO] Instalando dependencias del backend...
"%VENV_PIP%" install -r requirements.txt
if errorlevel 1 (
    popd >nul
    echo [ERROR] Fallo la instalacion de dependencias del backend.
    goto :fail
)

echo [INFO] Aplicando migraciones de base de datos con Alembic...
"%VENV_PYTHON%" -m alembic -c alembic.ini upgrade head
if errorlevel 1 (
    popd >nul
    echo [ERROR] Las migraciones de Alembic fallaron. Revisa la cadena DATABASE_URL o los permisos de la base de datos.
    goto :fail
)

popd >nul
echo [OK] Backend listo.

echo [INFO] Preparando frontend (Vite + React)...
pushd "%PROJECT_DIR%" >nul

if not exist "node_modules" (
    echo [INFO] Instalando dependencias de Node (npm install)...
    npm install
    if errorlevel 1 (
        popd >nul
        echo [ERROR] npm install fallo. Revisa tu conexion a internet o permisos.
        goto :fail
    )
) else (
    echo [INFO] Dependencias de Node ya instaladas (node_modules).
)

echo [INFO] Ejecutando comprobaciones rapidas (lint y pruebas)...
npm run lint
if errorlevel 1 (
    set "WARNINGS=1"
    echo [ADVERTENCIA] npm run lint reporto problemas. Corrige los errores de ESLint.
) else (
    echo [OK] Lint del frontend completado sin errores.
)

npm run test -- --run
if errorlevel 1 (
    set "WARNINGS=1"
    echo [ADVERTENCIA] Las pruebas del frontend (Vitest) fallaron. Revisa los mensajes anteriores.
) else (
    echo [OK] Pruebas del frontend completadas correctamente.
)

popd >nul

pushd "%BACKEND_DIR%" >nul
"%VENV_PYTHON%" -m pytest
if errorlevel 1 (
    set "WARNINGS=1"
    echo [ADVERTENCIA] Las pruebas del backend (pytest) reportaron errores.
) else (
    echo [OK] Pruebas del backend completadas correctamente.
)
popd >nul

echo [INFO] Iniciando servicios en ventanas separadas...
if exist "%VENV_ACTIVATE%" (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && call \"%VENV_ACTIVATE%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) else (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
)
if errorlevel 1 (
    echo [ERROR] No se pudo iniciar la ventana del backend.
    goto :fail
)

start "Red-Link Frontend" cmd /k "cd /d \"%PROJECT_DIR%\" && npm run dev"
if errorlevel 1 (
    echo [ERROR] No se pudo iniciar la ventana del frontend.
    goto :fail
)

start "" "http://localhost:5173/"
echo [OK] Servicios iniciados. Se intento abrir http://localhost:5173/ en tu navegador predeterminado.

echo.
echo [INFO] Resumen del asistente:
if "%WARNINGS%"=="1" (
    echo [ADVERTENCIA] Se detectaron advertencias durante las comprobaciones. Revisa las ventanas para mas detalles.
) else (
    echo [OK] No se detectaron problemas en las comprobaciones automatizadas.
)
echo    - Backend: http://localhost:8000
echo    - Frontend: http://localhost:5173
echo [INFO] Para detener los servicios, cierra las ventanas abiertas o presiona CTRL+C en cada una.

goto :end

:fail
echo.
echo [ERROR] La configuracion automatica no pudo completarse. Revisa los mensajes anteriores para solucionar los problemas.
echo.
pause
exit /b 1

:end
echo.
echo [INFO] Proceso finalizado. Puedes cerrar esta ventana despues de revisar los mensajes.
echo.
pause
exit /b 0

