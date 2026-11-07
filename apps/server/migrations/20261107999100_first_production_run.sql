-- What the schema review's first production run found (`ashyq admin schema-verify`, RUNBOOK 2.4).

SET LOCAL lock_timeout = '5s';

-- The deferred triggers stood in for the hand-in CHECK on a database that had skipped it. 20261107002000 added the
-- CHECK everywhere, so they are only a second copy of the rule.
DROP TRIGGER IF EXISTS submissions_handed_in_snapshots_insert ON submissions;
DROP TRIGGER IF EXISTS submissions_handed_in_snapshots_update ON submissions;
DROP FUNCTION IF EXISTS submissions_handed_in_snapshots();

-- data-fix: activities from before 2026-10 hold JSON null in details; no details is the column's default {}.
-- Nobody edited them, so their updated_at and version stay.
ALTER TABLE activities DISABLE TRIGGER activities_touch;
UPDATE activities SET details = '{}' WHERE jsonb_typeof(details) = 'null';
ALTER TABLE activities ENABLE TRIGGER activities_touch;

SELECT schema_try_check('activities', 'activities_details_object', 'jsonb_typeof(details) = ''object''');
