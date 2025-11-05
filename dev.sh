#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_BIN="$VENV_DIR/bin"
PYTHON_BIN="${PYTHON:-python3}"

SKIP_FRONTEND_INSTALL=0
SKIP_BACKEND_INSTALL=0
SKIP_CHECKS=0

usage() {
    cat <<USAGE
Red-Link — asistente de desarrollo (frontend + backend)

Uso: ./dev.sh [opciones]

Opciones:
  --skip-frontend-install   Omite npm install (asume dependencias listas).
  --skip-backend-install    Omite pip install (asume entorno virtual listo).
  --skip-checks             No ejecuta lint/test automáticos antes de iniciar.
  -h, --help                Muestra este mensaje y termina.

Variables de entorno:
  PYTHON   Comando de Python a usar (por defecto python3).
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-frontend-install)
            SKIP_FRONTEND_INSTALL=1
            ;;
        --skip-backend-install)
            SKIP_BACKEND_INSTALL=1
            ;;
        --skip-checks)
            SKIP_CHECKS=1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "[ERROR] Opción desconocida: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
    shift
done

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "[ERROR] No se encontró el comando '$1'. Instálalo y vuelve a intentarlo." >&2
        exit 1
    fi
}

log() {
    printf '[%s] %s\n' "$1" "$2"
}

require_command npm
require_command "$PYTHON_BIN"

if [[ ! -d "$BACKEND_DIR" ]]; then
    echo "[ERROR] No se encontró el directorio backend en $PROJECT_DIR" >&2
    exit 1
fi

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
    echo "[ERROR] Este script debe ejecutarse desde la raíz del repositorio (faltó package.json)." >&2
    exit 1
fi

if [[ ! -f "$BACKEND_DIR/requirements.txt" ]]; then
    echo "[ERROR] No se encontró backend/requirements.txt" >&2
    exit 1
fi

if [[ ! -f "$PROJECT_DIR/.env.local" ]]; then
    log "WARN" "No se encontró .env.local. Copia .env.example y ajusta VITE_API_BASE_URL si es necesario."
fi

setup_backend() {
    log INFO "Preparando backend (FastAPI)"

    if [[ ! -d "$VENV_DIR" ]]; then
        log INFO "Creando entorno virtual en backend/.venv"
        "$PYTHON_BIN" -m venv "$VENV_DIR"
    else
        log INFO "Usando entorno virtual existente"
    fi

    if [[ ! -x "$VENV_BIN/python" ]]; then
        echo "[ERROR] No se pudo localizar el intérprete de Python en $VENV_BIN." >&2
        echo "        Si el entorno virtual está corrupto, elimínalo y vuelve a ejecutar este script." >&2
        exit 1
    fi

    if [[ $SKIP_BACKEND_INSTALL -eq 0 ]]; then
        log INFO "Actualizando pip"
        "$VENV_BIN/python" -m pip install --upgrade pip

        log INFO "Instalando dependencias del backend"
        "$VENV_BIN/pip" install -r "$BACKEND_DIR/requirements.txt"
    else
        log INFO "Omitiendo instalación de dependencias del backend (--skip-backend-install)"
    fi

    log INFO "Aplicando migraciones (Alembic)"
    (cd "$BACKEND_DIR" && "$VENV_BIN/python" -m alembic -c alembic.ini upgrade head)
    log SUCCESS "Migraciones aplicadas"
}

setup_frontend() {
    log INFO "Preparando frontend (Vite + React)"
    if [[ $SKIP_FRONTEND_INSTALL -eq 0 ]]; then
        if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
            log INFO "Ejecutando npm install"
            (cd "$PROJECT_DIR" && npm install)
        else
            log INFO "Dependencias de Node detectadas (node_modules)"
        fi
    else
        log INFO "Omitiendo instalación de dependencias del frontend (--skip-frontend-install)"
    fi
    log SUCCESS "Frontend listo"
}

run_checks() {
    if [[ $SKIP_CHECKS -eq 1 ]]; then
        log INFO "Comprobaciones omitidas (--skip-checks)"
        return
    fi

    local failures=0

    log INFO "Ejecutando npm run lint"
    if ! (cd "$PROJECT_DIR" && npm run lint); then
        log ERROR "npm run lint reportó problemas"
        failures=1
    fi

    log INFO "Ejecutando npm run test -- --run"
    if ! (cd "$PROJECT_DIR" && npm run test -- --run); then
        log ERROR "Las pruebas del frontend fallaron"
        failures=1
    fi

    log INFO "Ejecutando pytest"
    if ! (cd "$PROJECT_DIR" && "$VENV_BIN/python" -m pytest backend); then
        log ERROR "Las pruebas del backend fallaron"
        failures=1
    fi

    if [[ $failures -ne 0 ]]; then
        log ERROR "Se detectaron fallos en las comprobaciones. Corrige los errores o ejecuta el script con --skip-checks."
        exit 1
    fi

    log SUCCESS "Comprobaciones superadas"
}

start_services() {
    log INFO "Iniciando servicios de desarrollo (Ctrl+C para detener)"

    cleanup() {
        log INFO "Deteniendo servicios..."
        [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
        [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
        log SUCCESS "Servicios detenidos"
    }
    trap cleanup EXIT INT TERM

    (cd "$BACKEND_DIR" && "$VENV_BIN/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000) &
    BACKEND_PID=$!
    log INFO "Backend escuchando en http://localhost:8000"

    (cd "$PROJECT_DIR" && npm run dev -- --host) &
    FRONTEND_PID=$!
    log INFO "Frontend disponible en http://localhost:5173"

    wait "$BACKEND_PID" || true
    wait "$FRONTEND_PID" || true
}

setup_backend
setup_frontend
run_checks
start_services
