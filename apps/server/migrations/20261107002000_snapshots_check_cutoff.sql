-- A hand-in names its snapshots. Rows from before the check existed may not (production skipped the check for them
-- and so had no check at all), so the rule now exempts them by date and exists everywhere (schema review 21).

SET LOCAL lock_timeout = '5s';

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_handed_in_snapshots_check;
SELECT schema_try_check('submissions', 'submissions_handed_in_snapshots_check',
    'status = ''draft'' OR (items_snapshot IS NOT NULL AND policy_snapshot IS NOT NULL)
     OR created_at < TIMESTAMPTZ ''2026-11-07 00:00:00+00''');
