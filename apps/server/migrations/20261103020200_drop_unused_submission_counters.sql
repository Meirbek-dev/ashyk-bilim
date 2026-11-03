-- contract: submissions.grading_version / policy_version and grading_entries.grading_version are unused counters (schema review 2, item 10).
--
-- grading_version stayed 1 on every row since the port (nothing bumped or
-- compared it); submissions.policy_version was stamped at start and never
-- read (the policy an attempt ran under is its policy_snapshot). The release
-- before this one neither reads nor writes them. The counters that stay:
-- `version` (If-Match on the row), `draft_version` (the autosave's 409) and
-- `content_version` (BUG-237: a draft behind the assessment's items), which
-- becomes `assessment_version_id` with assessment versions (REWRITE 5.6 n7).

SET LOCAL lock_timeout = '5s';

ALTER TABLE submissions DROP COLUMN grading_version, DROP COLUMN policy_version;
ALTER TABLE grading_entries DROP COLUMN grading_version;
