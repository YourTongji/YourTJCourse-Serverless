#!/usr/bin/env bash
# 每日 SQLite 备份：使用 .backup 生成一致性快照，保留最近 7 天。
# 建议 cron: 每天 03:10 执行（Asia/Shanghai）
#   10 3 * * * /opt/yourtjcourse/repo/YourTJCourse-Serverless/backend/scripts/backup-sqlite.sh >> /var/log/jcourse-backup.log 2>&1
set -euo pipefail

DB_FILE="${1:-/opt/yourtjcourse/data/jcourse.db}"
BACKUP_DIR="${2:-/opt/yourtjcourse/backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

if [ ! -f "$DB_FILE" ]; then
  echo "[backup] database not found: $DB_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/jcourse-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"

# 保留最近 KEEP_DAYS 天，清理更早的备份
find "$BACKUP_DIR" -name 'jcourse-*.db' -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true

echo "[backup] $(date -Is) wrote $BACKUP_FILE"
ls -1 "$BACKUP_DIR"/jcourse-*.db | tail -n 5
