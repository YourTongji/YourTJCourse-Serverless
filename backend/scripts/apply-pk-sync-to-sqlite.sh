#!/usr/bin/env bash
# 一系统(PK)同步 SQL 应用到 VPS SQLite 数据库。
# 与 apply-pk-sync-to-d1.sh 保持相同的 SQL 应用顺序（migrations + 生成的 pk-sync-*.sql），
# 仅将 wrangler d1 execute 替换为本地 sqlite3。
#
# 健康策略（防止静默损坏）：
#   - 同步前：源库健康自检（integrity_check + course_search FTS 可读性），不健康则中止
#   - 同步前：生成 .backup 快照并校验，坏库不会留在 backups 目录
#   - 同步后：再次健康自检，FTS 索引损坏会立刻被发现并给出恢复指引
#
# 用法: apply-pk-sync-to-sqlite.sh <db-file> <sql-dir>
# 依赖: flock（互斥锁）、sqlite3
set -euo pipefail

DB_FILE="${1:-}"
SQL_DIR="${2:-}"
LOCK_FILE="${LOCK_FILE:-/var/lock/jcourse-pk-sync.lock}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$(cd -- "$(dirname -- "$DB_FILE")/backups" 2>/dev/null && pwd || echo "$(dirname "$DB_FILE")/backups")"

if [ -z "$DB_FILE" ]; then
  echo "Usage: $0 <db-file> <sql-dir>" >&2
  exit 1
fi
if [ -z "$SQL_DIR" ] || [ ! -d "$SQL_DIR" ]; then
  echo "Usage: $0 <db-file> <sql-dir>" >&2
  echo "SQL directory not found: $SQL_DIR" >&2
  exit 1
fi

run_sqlite() {
  # .timeout 设置 SQLite 忙等待上限（毫秒），避免写锁冲突时立即失败
  sqlite3 -cmd ".timeout 15000" "$DB_FILE" < "$1"
}

# 数据库健康自检：integrity_check + course_search FTS 可读性（若存在）
# 返回 0=健康；1=不健康
check_db_health() {
  local db="$1"
  local label="$2"

  local integrity
  integrity="$(sqlite3 "$db" "PRAGMA integrity_check;" 2>/dev/null | head -1)"
  if [ "$integrity" != "ok" ]; then
    echo "[sqlite-sync] ERROR: $label integrity_check failed: ${integrity:-unreadable}" >&2
    return 1
  fi

  # course_search 是 FTS5 虚拟表，损坏时 SELECT 会抛 vtable constructor failed
  local has_fts
  has_fts="$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE name='course_search';" 2>/dev/null || echo 0)"
  if [ "${has_fts:-0}" = "1" ]; then
    if ! sqlite3 "$db" "SELECT count(*) FROM course_search LIMIT 1;" >/dev/null 2>&1; then
      echo "[sqlite-sync] ERROR: $label course_search FTS index is corrupt/unreadable" >&2
      echo "[sqlite-sync]   Recovery: stop backend, rebuild FTS (drop+recreate course_search), restart, then run refresh-review-index" >&2
      return 1
    fi
  fi

  return 0
}

# 互斥锁：避免与每日备份/正式切流等维护操作并发写库
exec 9>"$LOCK_FILE"
flock -x 9
echo "[sqlite-sync] locked, starting"

# 同步前：源库健康自检，不健康则拒绝同步
if ! check_db_health "$DB_FILE" "source database"; then
  echo "[sqlite-sync] ERROR: source database unhealthy, aborting sync" >&2
  exit 1
fi

# 同步前备份 + 备份校验
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/jcourse-before-pk-sync-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
if ! check_db_health "$BACKUP_FILE" "pre-sync backup"; then
  echo "[sqlite-sync] ERROR: pre-sync backup failed verification, keeping for forensics: $BACKUP_FILE.corrupt" >&2
  mv "$BACKUP_FILE" "$BACKUP_FILE.corrupt"
  exit 1
fi
echo "[sqlite-sync] verified backup written: $BACKUP_FILE"

shopt -s nullglob
sync_files=("$SQL_DIR"/pk-sync-*.sql)
shopt -u nullglob

if [ "${#sync_files[@]}" -eq 0 ]; then
  echo "[sqlite-sync] no pk-sync SQL files found in $SQL_DIR" >&2
  exit 1
fi

IFS=$'\n' sync_files=($(printf '%s\n' "${sync_files[@]}" | sort))
unset IFS

# 与 apply-pk-sync-to-d1.sh 保持一致的 migrations 应用顺序
migrations=(
  "$BACKEND_DIR/migrations/001_pk_schema.sql"
  "$BACKEND_DIR/migrations/002_pk_schema_patch.sql"
  "$BACKEND_DIR/migrations/011_maintenance_settings.sql"
  "$BACKEND_DIR/migrations/012_search_indexes.sql"
  "$BACKEND_DIR/migrations/013_fetchlog_pk.sql"
)

echo "[sqlite-sync] ensuring PK schema"
for migration in "${migrations[@]}"; do
  if [ ! -f "$migration" ]; then
    echo "[sqlite-sync] missing migration: $migration" >&2
    exit 1
  fi
  echo "[sqlite-sync] applying migration $migration"
  run_sqlite "$migration"
done

echo "[sqlite-sync] applying ${#sync_files[@]} generated SQL file(s)"
for sql_file in "${sync_files[@]}"; do
  echo "[sqlite-sync] applying $sql_file"
  run_sqlite "$sql_file"
done

# 同步后：健康自检，发现问题立即告警并给出恢复指引
if ! check_db_health "$DB_FILE" "database after sync"; then
  echo "[sqlite-sync] ERROR: database unhealthy after sync; restoring pre-sync backup may be needed" >&2
  exit 1
fi

echo "[sqlite-sync] done (post-sync health check OK)"
