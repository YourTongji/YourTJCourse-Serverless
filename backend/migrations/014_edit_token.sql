-- Add edit_token column for HMAC-based review editing authorization.
-- Allows wallet-bound users to edit reviews across devices.
ALTER TABLE reviews ADD COLUMN edit_token TEXT;
