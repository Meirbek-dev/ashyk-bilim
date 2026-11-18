-- contract: the release before (20261116075659_enrolment_completion) neither reads nor writes course_progress.
-- Course completion, contract (REWRITE 5.8 item 10): a member's completion is `enrolments.completed_at`, the
-- totals are `course_progress_v`. The stored rollup goes with the two triggers that kept a completion equal for
-- the release before it, and their functions. The view keeps its name: the previous release reads
-- `course_progress_v`, so renaming it here would break that release.
SET LOCAL lock_timeout = '5s';

DROP TRIGGER enrolments_completion ON enrolments;
DROP FUNCTION enrolments_completion();
DROP TABLE course_progress;
DROP FUNCTION course_progress_completion();
