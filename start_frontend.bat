@echo off
setlocal
pushd %~dp0

REM Verificar que exista package.json del frontend en la raiz
if not exist "%~dp0package.json" (
    echo [ERROR] No se encontro package.json en la raiz. Este script asume que el frontend esta aqui.
    pause
    exit /b 1
)

REM Esperar a que el backend responda
echo [INFO] Verificando backend en http://localhost:8000 ...
set /a retries=0
:wait_backend
curl -s -o NUL http://localhost:8000/docs
if %errorlevel%==0 (
    echo [INFO] Backend detectado.
) else (
    set /a retries+=1
    if %retries% GEQ 12 (
        echo [ERROR] El backend no respondio a tiempo.
        pause
        exit /b 1
    )
    echo [INFO] Backend no disponible aun, reintentando...
    timeout /t 5 /nobreak >nul
    goto wait_backend
)

echo [INFO] Solicitando token al backend...
curl -s -X POST "http://localhost:8000/auth/token" ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin@example.com\",\"password\":\"Admin1234\"}" > token.json

if errorlevel 1 (
    echo [ERROR] Error al llamar /auth/token
    type token.json
    pause
    exit /b 1
)

echo [INFO] Creando .env.local con VITE_API_BASE_URL y VITE_API_ACCESS_TOKEN...

python -c "import json,io,sys; data=json.load(io.open('token.json','r',encoding='utf-8')); print('VITE_API_BASE_URL=http://localhost:8000'); print('VITE_API_ACCESS_TOKEN='+data['access_token'])" > .env.local

if errorlevel 1 (
    echo [ERROR] No se pudo leer el access_token. Respuesta del backend:
    type token.json
    del token.json >nul 2>&1
    pause
    exit /b 1
)

del token.json >nul 2>&1

IF NOT EXIST node_modules (
    echo [INFO] Instalando dependencias del frontend...
    npm install
)

echo [INFO] Iniciando frontend en http://localhost:5174 ...
npm run dev -- --port 5174

popd
endlocal
