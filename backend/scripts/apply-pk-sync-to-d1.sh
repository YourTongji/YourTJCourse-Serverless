#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-}"
SQL_DIR="${2:-}"
SKIP_SEARCH_INDEXES="${3:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

if [ -z "$DB_NAME" ]; then
  echo "Usage: $0 <database-name> <sql-dir> [--skip-search-indexes]" >&2
  exit 1
fi

if [ -z "$SQL_DIR" ]; then
  echo "Usage: $0 <database-name> <sql-dir> [--skip-search-indexes]" >&2
  exit 1
fi

if [ -n "$SKIP_SEARCH_INDEXES" ] && [ "$SKIP_SEARCH_INDEXES" != "--skip-search-indexes" ]; then
  echo "Unknown option: $SKIP_SEARCH_INDEXES" >&2
  echo "Usage: $0 <database-name> <sql-dir> [--skip-search-indexes]" >&2
  exit 1
fi

if [ ! -d "$SQL_DIR" ]; then
  echo "SQL directory not found: $SQL_DIR" >&2
  exit 1
fi

shopt -s nullglob
sync_files=("$SQL_DIR"/pk-sync-*.sql)
shopt -u nullglob

if [ "${#sync_files[@]}" -eq 0 ]; then
  echo "No pk-sync SQL files found in $SQL_DIR" >&2
  exit 1
fi

IFS=$'\n' sync_files=($(printf '%s\n' "${sync_files[@]}" | sort))
unset IFS

migrations=(
  "$BACKEND_DIR/migrations/001_pk_schema.sql"
  "$BACKEND_DIR/migrations/002_pk_schema_patch.sql"
  "$BACKEND_DIR/migrations/011_maintenance_settings.sql"
)

if [ "$SKIP_SEARCH_INDEXES" != "--skip-search-indexes" ]; then
  migrations+=("$BACKEND_DIR/migrations/012_search_indexes.sql")
fi

migrations+=("$BACKEND_DIR/migrations/013_fetchlog_pk.sql")

if [ "$SKIP_SEARCH_INDEXES" = "--skip-search-indexes" ]; then
  for migration in "${migrations[@]}"; do
    if grep -Eiq 'CREATE[[:space:]]+VIRTUAL[[:space:]]+TABLE|fts5|course_search' "$migration"; then
      echo "[$DB_NAME] migration may create search/FTS objects and is blocked for backup D1: $migration" >&2
      exit 1
    fi
  done
fi

echo "[$DB_NAME] ensuring PK schema"
for migration in "${migrations[@]}"; do
  if [ ! -f "$migration" ]; then
    echo "[$DB_NAME] missing migration: $migration" >&2
    exit 1
  fi

  echo "[$DB_NAME] applying migration $migration"
  npx wrangler d1 execute "$DB_NAME" --remote --file="$migration"
done

echo "[$DB_NAME] applying ${#sync_files[@]} generated SQL file(s)"
for sql_file in "${sync_files[@]}"; do
  echo "[$DB_NAME] applying $sql_file"
  npx wrangler d1 execute "$DB_NAME" --remote --file="$sql_file"
done
