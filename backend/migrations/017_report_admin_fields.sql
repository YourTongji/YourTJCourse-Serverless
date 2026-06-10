-- Add admin_note to review_reports for Feishu card action workflow
ALTER TABLE review_reports ADD COLUMN admin_note TEXT;
ALTER TABLE review_reports ADD COLUMN resolved_at INTEGER;
