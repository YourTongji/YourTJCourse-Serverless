CREATE TABLE IF NOT EXISTS review_dislikes (
  review_id INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (review_id, client_id),
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_dislikes_review_id ON review_dislikes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_dislikes_client_id ON review_dislikes(client_id);
