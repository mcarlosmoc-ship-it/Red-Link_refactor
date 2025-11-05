#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$SkipFrontendInstall,
    [switch]$SkipBackendInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Section {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Assert-Command {
    param(
        [Parameter(Mandatory)] [string]$Command,
        [Parameter(Mandatory)] [string]$HelpMessage
    )

    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw $HelpMessage
    }
}

function Invoke-Step {
    param(
        [Parameter(Mandatory)] [string]$Message,
        [Parameter(Mandatory)] [scriptblock]$Action
    )

    Write-Section $Message
    & $Action
}

$repoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $repoRoot 'backend'
$venvDir    = Join-Path $backendDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$requirements = Join-Path $backendDir 'requirements.txt'

Set-Location -LiteralPath $repoRoot

Write-Host 'Red-Link — Lanzamiento rapido (PowerShell)' -ForegroundColor Green

try {
    Invoke-Step 'Verificando dependencias basicas' {
        Assert-Command 'npm' 'No se encontro npm en el PATH. Instala Node.js desde https://nodejs.org/ antes de continuar.'
        Assert-Command 'python' 'No se encontro Python en el PATH. Instala Python 3.10+ desde https://www.python.org/downloads/.'
    }

    if (-not (Test-Path (Join-Path $repoRoot '.env.local'))) {
        Write-Host 'ADVERTENCIA: crea .env.local a partir de .env.example y configura VITE_API_BASE_URL.' -ForegroundColor Yellow
    }

    if (-not (Test-Path $backendDir)) {
        throw 'No se encontro el directorio backend. Asegurate de ejecutar el script dentro del repositorio clonado.'
    }

    if (-not (Test-Path $requirements)) {
        throw 'No se encontro backend\requirements.txt. Verifica que el repositorio este completo.'
    }

    Invoke-Step 'Preparando entorno virtual del backend' {
        if (-not (Test-Path $venvPython)) {
            Write-Host 'Creando entorno virtual (backend\.venv)...'
            python -m venv $venvDir
        } else {
            Write-Host 'Entorno virtual detectado.'
        }
    }

    if ($SkipBackendInstall) {
        Write-Host 'Omitiendo instalacion del backend (-SkipBackendInstall habilitado).' -ForegroundColor DarkGray
    } else {
        Invoke-Step 'Instalando dependencias del backend' {
            & $venvPython -m pip install --upgrade pip
            & $venvPython -m pip install -r $requirements
        }
    }

    Invoke-Step 'Aplicando migraciones (Alembic)' {
        & $venvPython -m alembic -c (Join-Path $backendDir 'alembic.ini') upgrade head
    }

    if ($SkipFrontendInstall) {
        Write-Host 'Omitiendo instalacion del frontend (-SkipFrontendInstall habilitado).' -ForegroundColor DarkGray
    } elseif (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
        Invoke-Step 'Instalando dependencias del frontend (npm install)' {
            npm install
        }
    } else {
        Write-Host 'Dependencias del frontend detectadas. Usa -SkipFrontendInstall si quieres omitir este paso.' -ForegroundColor DarkGray
    }

    Invoke-Step 'Iniciando backend y frontend' {
        $backendCommand = "& { Set-Location -LiteralPath '$backendDir'; if (Test-Path '.venv\\Scripts\\Activate.ps1') { . .\\.venv\\Scripts\\Activate.ps1 }; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 }"
        Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand -WindowStyle Normal

        $frontendCommand = "& { Set-Location -LiteralPath '$repoRoot'; npm run dev }"
        Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand -WindowStyle Normal

        Start-Process 'http://localhost:5173/' | Out-Null
    }

    Write-Section 'Listo'
    Write-Host 'Backend: http://localhost:8000' -ForegroundColor Green
    Write-Host 'Frontend: http://localhost:5173' -ForegroundColor Green
    Write-Host 'Para detenerlos, cierra las ventanas que se abrieron.' -ForegroundColor Green
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Set-Location -LiteralPath $repoRoot
}
