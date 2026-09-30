-- BUG-300: a deadline extension's due date outlives the override's expiry.
-- `expires_at` bounds the grants a teacher set (extra attempts, waiver);
-- a bulk extension on a live override keeps that expiry and marks the due
-- date as its own, so the grants lapse on time and the new date stands.
ALTER TABLE assessment_overrides
    ADD COLUMN due_extended boolean NOT NULL DEFAULT false;
