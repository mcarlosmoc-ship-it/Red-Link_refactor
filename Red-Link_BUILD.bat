@echo off
title Red-Link - Build
cd /d "%~dp0"
echo ==========================================
echo   Red-Link — Compilando produccion
echo ==========================================
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro npm. Instala Node.js desde https://nodejs.org/
  pause
  exit /b 1
)
call npm install
call npm run build
echo Abriendo dist\index.html ...
start "" "%cd%\dist\index.html"
pause
