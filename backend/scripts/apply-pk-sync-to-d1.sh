#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${1:-}"
SQL_DIR="${2:-}"

if [ -z "$DB_NAME" ]; then
  echo "Usage: $0 <database-name> <sql-dir>" >&2
  exit 1
fi

if [ -z "$SQL_DIR" ]; then
  echo "Usage: $0 <database-name> <sql-dir>" >&2
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
  "./migrations/001_pk_schema.sql"
  "./migrations/002_pk_schema_patch.sql"
  "./migrations/011_maintenance_settings.sql"
  "./migrations/012_search_indexes.sql"
  "./migrations/013_fetchlog_pk.sql"
)

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
