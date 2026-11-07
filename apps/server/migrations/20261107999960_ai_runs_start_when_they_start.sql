-- A queued run has not started (schema review 43): this release writes started_at itself, and a run still queued from
-- the previous one keeps the time it was queued, which its first mark_running replaces.

SET LOCAL lock_timeout = '5s';

ALTER TABLE ai_runs ALTER COLUMN started_at DROP DEFAULT;
