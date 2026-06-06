-- Persist AI-generated course summaries so they survive cache eviction.
CREATE TABLE IF NOT EXISTS ai_summaries (
  course_id INTEGER PRIMARY KEY,
  summary_json TEXT NOT NULL,
  rating_consensus TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  generated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
