-- Store reporter-entered explanation for review reports.
ALTER TABLE review_reports ADD COLUMN description TEXT DEFAULT '';
