#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$BACKEND_DIR/.venv"
ALEMBIC_BIN=""

if [[ -x "$VENV_DIR/bin/alembic" ]]; then
    ALEMBIC_BIN="$VENV_DIR/bin/alembic"
elif command -v alembic >/dev/null 2>&1; then
    ALEMBIC_BIN="$(command -v alembic)"
else
    echo "[ERROR] No se encontró el ejecutable de alembic." >&2
    echo "        Crea el entorno virtual (./dev.sh o backend/start.sh) o instala alembic en tu PATH." >&2
    exit 1
fi

cd "$BACKEND_DIR"
exec "$ALEMBIC_BIN" -c alembic.ini "$@"
