-- Schema review items 6, 7 and 28: status/timestamp coherence, score
-- bounds, text length caps (the API's garde limits, so DB and API agree)
-- and JSONB shape guards.
--
-- `schema_try_check` adds a CHECK as NOT VALID and validates it. When old
-- rows violate it the constraint is dropped again with a WARNING in the
-- migrate log instead of failing the deploy: a NOT VALID check would refuse
-- every later UPDATE of such a row (an unrelated edit of a legacy course
-- with a too-long description would answer 500). Repair the rows the
-- warning names, then add the check again in a new migration. A skipped
-- check is also recorded in schema_skipped_checks (RUNBOOK 2.4 lists it).
-- Rows with a deterministic repair are repaired here first.

CREATE TABLE schema_skipped_checks (
    name       text PRIMARY KEY,
    table_name text NOT NULL,
    expr       text NOT NULL,
    skipped_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION schema_try_check(p_table regclass, p_name text, p_expr text) RETURNS boolean
    LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', p_table, p_name, p_expr);
    BEGIN
        EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', p_table, p_name);
    EXCEPTION WHEN check_violation THEN
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_name);
        INSERT INTO schema_skipped_checks AS s (name, table_name, expr)
        VALUES (p_name, p_table::text, p_expr)
        ON CONFLICT ON CONSTRAINT schema_skipped_checks_pkey
        DO UPDATE SET expr = EXCLUDED.expr, skipped_at = now();
        RAISE WARNING 'schema_try_check: % skipped, existing rows violate %', p_name, p_expr;
        RETURN false;
    END;
    DELETE FROM schema_skipped_checks s WHERE s.name = p_name;
    RETURN true;
END $$;

COMMENT ON FUNCTION schema_try_check(regclass, text, text) IS
    'Add a CHECK only when every existing row satisfies it (else WARNING, nothing added). Migrations only.';

SET LOCAL ab.bookkeeping = 'on';

-- Item 6 repairs: a handed-in attempt without its hand-in time takes the
-- earliest later stamp it has; a published / archived assessment without
-- its stamp takes its last update.
UPDATE submissions SET submitted_at = coalesce(graded_at, auto_submitted_at, updated_at, created_at)
WHERE status <> 'draft' AND submitted_at IS NULL;
UPDATE file_submission_attempts SET submitted_at = coalesce(graded_at, updated_at, created_at)
WHERE status <> 'draft' AND submitted_at IS NULL;
UPDATE assessments SET published_at = coalesce(updated_at, created_at)
WHERE lifecycle = 'published' AND published_at IS NULL;
UPDATE assessments SET archived_at = coalesce(updated_at, created_at)
WHERE lifecycle = 'archived' AND archived_at IS NULL;

-- Item 6: status ⇒ timestamp; a reply has a parent post, a post has none.
SELECT schema_try_check('submissions', 'submissions_submitted_at_check',
    $c$status = 'draft' OR submitted_at IS NOT NULL$c$);
SELECT schema_try_check('file_submission_attempts', 'file_submission_attempts_submitted_at_check',
    $c$status = 'draft' OR submitted_at IS NOT NULL$c$);
SELECT schema_try_check('assessments', 'assessments_published_at_check',
    $c$lifecycle <> 'published' OR published_at IS NOT NULL$c$);
SELECT schema_try_check('assessments', 'assessments_archived_at_check',
    $c$lifecycle <> 'archived' OR archived_at IS NOT NULL$c$);
SELECT schema_try_check('course_discussions', 'course_discussions_reply_parent_check',
    $c$(kind = 'reply') = (parent_id IS NOT NULL)$c$);

-- Item 7: scores are percentages (grader proptests bound them to 0..100).
SELECT schema_try_check('submissions', 'submissions_auto_score_check',
    $c$auto_score IS NULL OR (auto_score >= 0 AND auto_score <= 100)$c$);
SELECT schema_try_check('submissions', 'submissions_final_score_check',
    $c$final_score IS NULL OR (final_score >= 0 AND final_score <= 100)$c$);
SELECT schema_try_check('grading_entries', 'grading_entries_raw_score_check',
    $c$raw_score >= 0 AND raw_score <= 100$c$);
SELECT schema_try_check('grading_entries', 'grading_entries_final_score_check',
    $c$final_score IS NULL OR (final_score >= 0 AND final_score <= 100)$c$);
SELECT schema_try_check('grading_entries', 'grading_entries_penalty_pct_check',
    $c$penalty_pct >= 0 AND penalty_pct <= 100$c$);
SELECT schema_try_check('file_submission_attempts', 'file_submission_attempts_late_penalty_pct_check',
    $c$late_penalty_pct >= 0 AND late_penalty_pct <= 100$c$);
SELECT schema_try_check('activity_progress', 'activity_progress_score_check',
    $c$score IS NULL OR (score >= 0 AND score <= 100)$c$);
SELECT schema_try_check('course_progress', 'course_progress_pct_check',
    $c$progress_pct >= 0 AND progress_pct <= 100$c$);

-- Item 7: text caps = the API's garde limits (docs/ARCHITECTURE.md §8).
SELECT schema_try_check('courses', 'courses_description_check', $c$char_length(description) <= 5000$c$);
SELECT schema_try_check('courses', 'courses_about_check', $c$char_length(about) <= 20000$c$);
SELECT schema_try_check('chapters', 'chapters_description_check', $c$char_length(description) <= 5000$c$);
SELECT schema_try_check('collections', 'collections_description_check', $c$char_length(description) <= 5000$c$);
SELECT schema_try_check('course_discussions', 'course_discussions_content_check',
    $c$char_length(content) <= 20000$c$);
SELECT schema_try_check('course_updates', 'course_updates_title_check', $c$char_length(title) <= 500$c$);
SELECT schema_try_check('course_updates', 'course_updates_content_check', $c$char_length(content) <= 50000$c$);
SELECT schema_try_check('file_submissions', 'file_submissions_instructions_check',
    $c$char_length(instructions) <= 50000$c$);

-- Item 28: JSONB written only by typed server code is an object (or an
-- array where the type is a list); an item's body is tagged with its kind.
SELECT schema_try_check('jobs', 'jobs_payload_check', $c$jsonb_typeof(payload) = 'object'$c$);
SELECT schema_try_check('job_schedules', 'job_schedules_payload_check', $c$jsonb_typeof(payload) = 'object'$c$);
SELECT schema_try_check('notifications', 'notifications_payload_check', $c$jsonb_typeof(payload) = 'object'$c$);
SELECT schema_try_check('analytics_events', 'analytics_events_payload_check', $c$jsonb_typeof(payload) = 'object'$c$);
SELECT schema_try_check('auth_audit_log', 'auth_audit_log_metadata_check', $c$jsonb_typeof(metadata) = 'object'$c$);
SELECT schema_try_check('assessment_audit_events', 'assessment_audit_events_payload_check',
    $c$jsonb_typeof(payload) = 'object'$c$);
SELECT schema_try_check('grading_entries', 'grading_entries_breakdown_check',
    $c$jsonb_typeof(raw_breakdown) = 'object' AND jsonb_typeof(effective_breakdown) = 'object'$c$);
SELECT schema_try_check('submissions', 'submissions_answers_check', $c$jsonb_typeof(answers) = 'object'$c$);
SELECT schema_try_check('submissions', 'submissions_grading_check', $c$jsonb_typeof(grading) = 'object'$c$);
SELECT schema_try_check('submissions', 'submissions_violations_check', $c$jsonb_typeof(violations) = 'array'$c$);
SELECT schema_try_check('trail_runs', 'trail_runs_data_check', $c$jsonb_typeof(data) = 'object'$c$);
SELECT schema_try_check('trail_steps', 'trail_steps_data_check', $c$jsonb_typeof(data) = 'object'$c$);
SELECT schema_try_check('users', 'users_profile_check', $c$jsonb_typeof(profile) = 'object'$c$);
SELECT schema_try_check('assessment_items', 'assessment_items_body_kind_check',
    $c$jsonb_typeof(body) = 'object' AND body->>'kind' = kind$c$);
