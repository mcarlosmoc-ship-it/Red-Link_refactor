#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(git rev-parse --show-toplevel)
REFERENCE_SCHEMA=${REFERENCE_SCHEMA:-"$ROOT_DIR/db/schema.sql"}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required to compare the production schema." >&2
  exit 1
fi

if [[ ! -f "$REFERENCE_SCHEMA" ]]; then
  echo "Reference schema not found at $REFERENCE_SCHEMA" >&2
  exit 1
fi

PG_DUMP_BIN=${DATABASE_PG_DUMP_BIN:-pg_dump}
TMP_SCHEMA=$(mktemp)
trap 'rm -f "$TMP_SCHEMA"' EXIT

"$PG_DUMP_BIN" "$DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  > "$TMP_SCHEMA"

if diff -u "$REFERENCE_SCHEMA" "$TMP_SCHEMA"; then
  echo "Schema verification passed: production matches the reference schema."
  exit 0
fi

echo "Schema verification failed: production differs from the reference schema." >&2
exit 2
