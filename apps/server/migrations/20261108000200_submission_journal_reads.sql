-- Schema review 2026-11-08, items 6 and 12: readers stop reading two copies, so a later contract can drop them.
--
-- - A hand-in's items and policy are its `assessment_versions` row: every handed-in submission with snapshots
--   names a version with the same items and policy (equal on the production copy of 2026-11-08), and the hand-in
--   writes both. Readers select the version's; the hand-in keeps writing the snapshots for the previous release.
-- - The anti-cheat events a teacher sees are the newest 200 of `submission_violations` (the journal the append
--   writes in the same statement as the bounded array, MAX_VIOLATION_EVENTS in the grading domain), oldest
--   first like the array. `submission_violation_log` is that read.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION submission_violation_log(p_submission uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
    SELECT coalesce(jsonb_agg(e.event ORDER BY e.created_at, e.id), '[]'::jsonb)
      FROM (SELECT v.event, v.created_at, v.id FROM submission_violations v
             WHERE v.submission_id = p_submission
             ORDER BY v.created_at DESC, v.id DESC LIMIT 200) e
$$;

COMMENT ON FUNCTION submission_violation_log(uuid) IS
    'The newest 200 anti-cheat events of a submission, oldest first (what submissions.violations holds until its contract).';
