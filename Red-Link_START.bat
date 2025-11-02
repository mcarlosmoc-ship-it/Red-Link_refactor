@echo off
title Red-Link - Sistema ISP (DEV)
cd /d "%~dp0"
echo ==========================================
echo   Red-Link — Iniciando servidor local
echo ==========================================
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro npm. Instala Node.js desde https://nodejs.org/
  pause
  exit /b 1
)
start "" "http://localhost:5173/"
call npm run dev
pause
