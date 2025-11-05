#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
BACKEND_DIR="$PROJECT_DIR"
VENV_DIR="$BACKEND_DIR/.venv"
ALEMBIC_BIN="alembic"
MESSAGE=""

usage() {
    cat <<USAGE
Crear una nueva migración de Alembic basada en los modelos actuales.

Uso: ./scripts/new_migration.sh -m "mensaje"

Opciones:
  -m, --message   Descripción corta para la migración (requerido).
  -h, --help      Muestra este mensaje y termina.

El script valida que el entorno virtual exista, activa el intérprete de
Python asociado y ejecuta `alembic revision --autogenerate`.
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -m|--message)
            shift
            MESSAGE="${1:-}"
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

if [[ -z "$MESSAGE" ]]; then
    echo "[ERROR] Debes proporcionar un mensaje descriptivo con -m/--message." >&2
    usage >&2
    exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
    echo "[ERROR] No se encontró backend/.venv. Ejecuta ./dev.sh o backend/start.sh para crearlo." >&2
    exit 1
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
    echo "[ERROR] El entorno virtual parece estar corrupto. Elimínalo y vuelve a crearlo." >&2
    exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if ! command -v "$ALEMBIC_BIN" >/dev/null 2>&1; then
    echo "[ERROR] No se encontró alembic en el entorno virtual. Ejecuta pip install -r backend/requirements.txt." >&2
    exit 1
fi

cd "$BACKEND_DIR"

alembic revision --autogenerate -m "$MESSAGE"
