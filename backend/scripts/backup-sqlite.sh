#!/usr/bin/env bash
# 每日 SQLite 备份：一致性快照 + 完整性/FTS 自检 + 可选异地副本，保留最近 KEEP_DAYS 天。
#
# 健康策略：
#   - 备份前检查源库：integrity_check 必须 ok，且 course_search FTS（若存在）必须可读
#   - 备份后校验产物：同上，避免把坏库当成"好备份"留存
#   - 校验失败：拒绝保留坏备份（改名 .corrupt 留作取证），并返回非 0 触发告警
#   - 清理过期备份时同时清掉 .db-shm/.db-wal 残留
#
# 异地灾备（可选）：设置 BACKUP_EXTRA_DIR 指向额外目录（如异地挂载盘/对象存储挂载点），
#   备份会再复制一份并同样校验。
#
# 用法: backup-sqlite.sh [db-file] [backup-dir]
# 环境变量: KEEP_DAYS(默认7) BACKUP_EXTRA_DIR(可选异地目录)
# 建议 cron: 每天 03:10 执行（Asia/Shanghai）
#   10 3 * * * /opt/yourtjcourse/repo/YourTJCourse-Serverless/backend/scripts/backup-sqlite.sh >> /var/log/jcourse-backup.log 2>&1
set -euo pipefail

DB_FILE="${1:-/opt/yourtjcourse/data/jcourse.db}"
BACKUP_DIR="${2:-/opt/yourtjcourse/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"
EXTRA_DIR="${BACKUP_EXTRA_DIR:-}"

log() {
  echo "[backup] $(date -Is) $*"
}

# 数据库健康自检：integrity_check + course_search FTS 可读性（若存在）
# 返回 0=健康；1=不健康
check_db_health() {
  local db="$1"
  local label="$2"

  if [ ! -f "$db" ]; then
    log "ERROR: $label not found: $db"
    return 1
  fi

  local integrity
  integrity="$(sqlite3 "$db" "PRAGMA integrity_check;" 2>/dev/null | head -1)"
  if [ "$integrity" != "ok" ]; then
    log "ERROR: $label integrity_check failed: ${integrity:-unreadable}"
    return 1
  fi

  # course_search 是 FTS5 虚拟表，损坏时 SELECT 会抛 vtable constructor failed
  local has_fts
  has_fts="$(sqlite3 "$db" "SELECT count(*) FROM sqlite_master WHERE name='course_search';" 2>/dev/null || echo 0)"
  if [ "${has_fts:-0}" = "1" ]; then
    if ! sqlite3 "$db" "SELECT count(*) FROM course_search LIMIT 1;" >/dev/null 2>&1; then
      log "ERROR: $label course_search FTS index is corrupt/unreadable"
      return 1
    fi
  fi

  return 0
}

if [ ! -f "$DB_FILE" ]; then
  log "ERROR: database not found: $DB_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
if [ -n "$EXTRA_DIR" ]; then
  mkdir -p "$EXTRA_DIR"
fi

# 1. 源库健康自检：不健康则拒绝备份并告警（避免把坏库当成好备份）
if ! check_db_health "$DB_FILE" "source database"; then
  log "ERROR: source database unhealthy, refusing to back up (fix DB first)"
  exit 1
fi

# 2. 生成一致性快照
BACKUP_FILE="$BACKUP_DIR/jcourse-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# 3. 备份产物自检
if ! check_db_health "$BACKUP_FILE" "backup file"; then
  log "ERROR: backup verification failed, keeping corrupt copy for forensics: $BACKUP_FILE.corrupt"
  mv "$BACKUP_FILE" "$BACKUP_FILE.corrupt"
  exit 1
fi

# 4. 可选异地副本（同样校验）
if [ -n "$EXTRA_DIR" ]; then
  EXTRA_FILE="$EXTRA_DIR/$(basename "$BACKUP_FILE")"
  cp "$BACKUP_FILE" "$EXTRA_FILE"
  if ! check_db_health "$EXTRA_FILE" "extra copy"; then
    log "ERROR: extra copy verification failed, removing: $EXTRA_FILE"
    rm -f "$EXTRA_FILE"
    exit 1
  fi
  log "extra copy verified: $EXTRA_FILE"
fi

# 5. 清理过期备份 + 残留 shm/wal
find "$BACKUP_DIR" -maxdepth 1 \( -name 'jcourse-*.db' -o -name 'jcourse-*.db.corrupt' \) -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 \( -name 'jcourse-*.db-shm' -o -name 'jcourse-*.db-wal' \) -delete 2>/dev/null || true
if [ -n "$EXTRA_DIR" ]; then
  find "$EXTRA_DIR" -maxdepth 1 \( -name 'jcourse-*.db' -o -name 'jcourse-*.db.corrupt' \) -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
  find "$EXTRA_DIR" -maxdepth 1 \( -name 'jcourse-*.db-shm' -o -name 'jcourse-*.db-wal' \) -delete 2>/dev/null || true
fi

log "wrote $BACKUP_FILE"
ls -1 "$BACKUP_DIR"/jcourse-*.db 2>/dev/null | tail -n 5
