-- Add primary key and index to fetchlog for cleanup and query efficiency.
-- The table may already exist without an id column, so migrate it safely.

CREATE TABLE IF NOT EXISTS fetchlog_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fetchTime INTEGER DEFAULT (strftime('%s', 'now')),
  msg TEXT
);

INSERT INTO fetchlog_new (fetchTime, msg)
  SELECT fetchTime, msg
  FROM fetchlog
  WHERE EXISTS (
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fetchlog'
  );

DROP TABLE IF EXISTS fetchlog;
ALTER TABLE fetchlog_new RENAME TO fetchlog;

CREATE INDEX IF NOT EXISTS idx_fetchlog_time ON fetchlog(fetchTime);

DELETE FROM fetchlog WHERE fetchTime < strftime('%s', 'now') - 86400 * 30;
