-- OPEN-G-1: self-service account deletion. The row stays (submissions, grades, posts and
-- certificates keep pointing at it) with its personal fields anonymised and `status` = 'disabled';
-- `deleted_at` tells a deleted account from one an admin disabled (which can be re-enabled).
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
