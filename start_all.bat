@echo off
setlocal
pushd "%~dp0"

echo ============================================
echo   Red-Link - Inicio automatico local
echo ============================================

echo [INFO] Iniciando backend en nueva ventana...
start "Red-Link Backend" cmd /k "cd /d \"%~dp0backend\" && .\start_backend.bat"

echo [INFO] Esperando a que el backend arranque...
timeout /t 10 /nobreak >nul

echo [INFO] Iniciando frontend...
call "%~dp0start_frontend.bat"

popd
endlocal
