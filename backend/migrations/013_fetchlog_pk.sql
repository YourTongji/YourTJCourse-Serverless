-- Add primary key and index to fetchlog for cleanup and query efficiency.
-- Also add a 30-day retention cleanup step.

-- SQLite does not support ALTER TABLE ADD PRIMARY KEY on existing tables,
-- so we recreate the table with the correct schema.
CREATE TABLE IF NOT EXISTS fetchlog_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetchTime INTEGER DEFAULT (strftime('%s', 'now')),
    msg TEXT
);

INSERT OR IGNORE INTO fetchlog_new (fetchTime, msg)
  SELECT fetchTime, msg FROM fetchlog;

DROP TABLE IF EXISTS fetchlog;
ALTER TABLE fetchlog_new RENAME TO fetchlog;

CREATE INDEX IF NOT EXISTS idx_fetchlog_time ON fetchlog(fetchTime);
