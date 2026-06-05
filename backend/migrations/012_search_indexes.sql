-- Add indexes for course search queries
-- These support prefix search (LIKE 'keyword%') and equality lookups.
-- Full LIKE '%keyword%' still requires table scan; FTS5 is recommended for production.

CREATE INDEX IF NOT EXISTS idx_coursedetail_courseName ON coursedetail(courseName);
CREATE INDEX IF NOT EXISTS idx_coursedetail_calendarId_courseCode ON coursedetail(calendarId, courseCode);
