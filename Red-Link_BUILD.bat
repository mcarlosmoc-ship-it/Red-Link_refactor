@echo off
setlocal enabledelayedexpansion
title Red-Link - Build
cd /d "%~dp0"

echo ==========================================
echo   Red-Link — Compilando produccion
echo ==========================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro npm. Instala Node.js desde https://nodejs.org/
  goto :error
)

if not exist package.json (
  echo [ERROR] No se encontro package.json en %cd%
  goto :error
)

echo [INFO] Instalando dependencias (npm install)...
call npm install
if errorlevel 1 goto :error

echo [INFO] Ejecutando build de produccion...
call npm run build
if errorlevel 1 goto :error

if exist dist\index.html (
  echo [INFO] Abriendo dist\index.html ...
  start "" "%cd%\dist\index.html"
) else (
  echo [ADVERTENCIA] No se encontro dist\index.html. Verifica el resultado del build.
)

goto :end

:error
echo.
echo Se produjo un error durante el proceso.
pause >nul
exit /b 1

:end
echo.
echo Proceso finalizado. Presiona una tecla para salir.
pause >nul
endlocal
