-- Ensure reviews.disapprove_count exists for the dislike feature.
-- The column is only defined in schema.sql (full re-init); environments that
-- were bootstrapped purely from migrations may lack it, which would break the
-- like/dislike endpoints' SELECT/UPDATE statements.
ALTER TABLE reviews ADD COLUMN disapprove_count INTEGER DEFAULT 0;
