#!/bin/sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

alembic -c alembic.ini upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
