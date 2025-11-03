@echo off
setlocal enabledelayedexpansion
title Red-Link - Sistema ISP (DEV)
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

echo ==========================================
echo   Red-Link — Iniciando servidor local
echo ==========================================

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro npm. Instala Node.js desde https://nodejs.org/
  goto :error
)

if not exist package.json (
  echo [ERROR] No se encontro package.json en "!PROJECT_DIR!"
  goto :error
)

if not exist node_modules (
  echo [INFO] Instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
)

echo [INFO] Iniciando servidor de desarrollo...
start "" "http://localhost:5173/"
call npm run dev
if errorlevel 1 goto :error

goto :end

:error
echo.
echo Presiona una tecla para salir.
pause >nul
exit /b 1

:end
echo.
echo Servidor detenido. Presiona una tecla para cerrar esta ventana.
pause >nul
endlocal
