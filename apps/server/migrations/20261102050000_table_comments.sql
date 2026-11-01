-- What each table is for (schema review item 49), as COMMENT ON, so the
-- schema explains itself in psql (\dt+) and in the generated
-- docs/agents/SCHEMA.md (`just schema-docs`). A new table adds its comment in
-- its own migration; crates/db/tests/schema_docs.rs fails on a table without one.
--
-- One DO block over a list: a table another change of the same release renamed,
-- dropped or turned into a view before this file runs is commented as what it is
-- now, or skipped, instead of failing the deploy. COMMENT takes SHARE UPDATE
-- EXCLUSIVE: reads and writes go on.

SET LOCAL lock_timeout = '5s';

DO $do$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.relname, x.comment,
               CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END AS kind
        FROM (VALUES
            -- Identity and access
            ('users', 'An account. Never deleted by the app: disabled (status) or anonymised (deleted_at, RUNBOOK 2.3). Login and password live in Zitadel (zitadel_user_id).'),
            ('google_accounts', 'A Google identity linked to an account (google_sub), for Google sign-in.'),
            ('roles', 'A role: built-in (is_system, display_name_key/description_key) or custom (display_name/description).'),
            ('role_permissions', 'A permission grant of a role; resource/action/scope are generated from the grant string.'),
            ('user_roles', 'Platform roles held by an account.'),
            ('auth_audit_log', 'Security events of accounts (logins, failures, erasure). Retention 365 days.'),
            ('idempotency_keys', 'Stored responses of mutating requests sent with an Idempotency-Key, replayed on a retry.'),
            ('usergroups', 'A named group of learners a teacher assigns courses or assessments to.'),
            ('usergroup_members', 'Accounts in a user group.'),
            ('usergroup_courses', 'Courses opened to a user group.'),
            ('platforms', 'The platform''s own settings and texts (one row, singleton).'),
            ('feature_activations', 'When a feature switch was first turned on (one row per feature).'),
            -- Catalog and content
            ('courses', 'A course: catalog card, visibility (public), lifecycle (archived_at) and settings. Deleting one cascades to its content and learner records (COURSE_ARCHIVING).'),
            ('resource_authors', 'Staff of a course or a collection (exactly one of the two): creator, maintainer, contributor or reporter, with a status.'),
            ('chapters', 'A chapter of a course; position orders chapters within the course.'),
            ('activities', 'A lesson step inside a chapter: page, video, document, quiz, exam, code challenge, file task. published makes it visible to learners.'),
            ('blocks', 'A content block of a page activity (files, embeds), linked from the editor document by legacy_uuid.'),
            ('collections', 'A curated, ordered set of courses shown in the catalog.'),
            ('collection_courses', 'Courses of a collection, ordered by position.'),
            ('course_updates', 'An announcement a teacher posts in a course.'),
            ('course_discussions', 'A discussion post or reply in a course (replies point to their post by parent_id); counters are kept by triggers.'),
            ('discussion_reactions', 'A like or dislike of a discussion post by an account.'),
            ('certifications', 'The certificate a course issues on completion: layout and rules (config); disabled_at stops issuing.'),
            ('certificate_users', 'A certificate issued to a learner, verifiable by verify_code. Survives the account''s anonymisation.'),
            ('uploads', 'A stored object (S3 key) uploaded by an account, its purpose and lifecycle; unreferenced ones are reaped.'),
            ('upload_purposes', 'Lookup: what an upload may be for (avatar, course media, hand-in, ...).'),
            -- Assessments and learner work
            ('assessments', 'The graded part of a quiz, exam or code challenge activity: lifecycle, attempt and grading policy.'),
            ('assessment_items', 'A question or task of an assessment (typed body by kind), ordered by position, max_score in points.'),
            ('assessment_overrides', 'Per-learner exceptions of an assessment: extra attempts, a later due date, a waived late penalty.'),
            ('assessment_access_users', 'Learners an assessment is restricted to (with assessment_access_usergroups).'),
            ('assessment_access_usergroups', 'User groups an assessment is restricted to.'),
            ('assessment_audit_events', 'History of staff actions on an assessment.'),
            ('bulk_actions', 'A bulk operation a teacher ran on the learners of an assessment, its targets and outcome.'),
            ('submissions', 'An attempt at an assessment by a learner: answers, frozen items/policy snapshots, status draft -> pending -> graded -> published / returned. preview rows are staff test runs.'),
            ('grading_entries', 'Grade journal of submissions: one row per grading; append-only except published_at (trigger-guarded).'),
            ('item_feedback', 'A grader''s comment, score or annotation on one item of a graded submission.'),
            ('code_runs', 'A run of learner code in the go-judge runner: a practice run or the graded run of a submission.'),
            ('code_run_cases', 'The result of one test case of a code run.'),
            ('file_submissions', 'The file task of a file_submission activity: instructions, file limits, deadline and late policy.'),
            ('file_submission_attempts', 'A learner''s hand-in for a file task and its grading state.'),
            ('file_submission_files', 'A file of a file-task hand-in (points at its upload).'),
            ('file_grading_entries', 'Grade journal of file-task hand-ins: append-only (trigger-guarded).'),
            ('file_submission_overrides', 'A per-learner deadline exception of a file task.'),
            -- Enrolment and progress
            ('trails', 'A learner''s learning record (one per account); its trail_runs are the course enrolments.'),
            ('trail_runs', 'Enrolment of a learner in a course (the membership fact today).'),
            ('trail_steps', 'Completion of an activity by a learner inside an enrolment (legacy progress fact).'),
            ('activity_progress', 'Projection: a learner''s state in one activity (from submissions, hand-ins and steps), rebuilt by progress-backfill.'),
            ('course_progress', 'Projection: a learner''s totals in a course (counts, percentage, grade averages, completion).'),
            -- Gamification
            ('gamification_profiles', 'A learner''s XP total, level and streaks (reconciled weekly from xp_transactions).'),
            ('xp_transactions', 'XP journal: every award with its source; the profile totals are derived from it.'),
            ('gamification_completions', 'Completion facts that award XP once (source kind + id per learner).'),
            ('gamification_config', 'XP rules: daily cap and rewards (versioned single row).'),
            -- Notifications
            ('notifications', 'An in-app notification of an account (typed payload; course_id/activity_id are generated from it).'),
            ('notification_kinds', 'Lookup: the notification kinds the server sends.'),
            ('notification_preferences', 'Notification kinds an account turned off.'),
            -- Analytics
            ('analytics_events', 'Event log of learning actions (append-only, pruned after its retention window).'),
            ('analytics_saved_views', 'A teacher''s saved analytics filter.'),
            ('daily_course_metrics', 'Daily rollup per course: enrolment, activity, completion, risk, grading backlog.'),
            ('daily_assessment_metrics', 'Daily rollup per assessment: submission, pass and score figures.'),
            ('daily_course_engagement', 'Daily rollup per course step: learners who started/completed it, drop-off.'),
            ('daily_teacher_metrics', 'Daily rollup per teacher (or platform-wide when teacher_user_id is NULL).'),
            ('daily_user_course_progress', 'Daily snapshot of each learner''s progress in each course.'),
            ('learner_risk_snapshots', 'Daily risk score of a learner in a course, with reasons and a recommended action.'),
            ('teacher_interventions', 'An action a teacher logged for an at-risk learner and its outcome.'),
            -- Concepts and mastery
            ('course_concepts', 'A concept (skill) of a course, proposed by AI or a teacher and decided by staff.'),
            ('concept_prerequisites', 'A prerequisite edge between two concepts of a course.'),
            ('concept_tags', 'Links an activity or assessment item to a concept it practises, with a weight.'),
            ('concept_mastery', 'Estimated probability that a learner knows a concept (p_known), from mastery_evidence.'),
            ('mastery_evidence', 'One observation of a learner on a concept (a scored item or activity).'),
            -- AI
            ('ai_threads', 'An AI conversation (course assistant, tutor) of an account.'),
            ('ai_qa_messages', 'A message in an AI thread, with citations into course material.'),
            ('ai_runs', 'One AI job (grading draft, analysis, review, answer): model, tokens, cost, status.'),
            ('ai_events', 'Streamed events of an AI run (pruned 180 days after the run finished).'),
            ('ai_artifacts', 'An output an AI run produced.'),
            ('ai_evidence', 'A source an AI artifact cites (course chunk, submission part).'),
            ('ai_approvals', 'A staff approval an AI action waits for.'),
            ('ai_eval_results', 'Outcome of an AI evaluation fixture run (ashyq admin ai-eval).'),
            ('ai_feature_switches', 'Platform switches of AI features.'),
            ('ai_course_settings', 'AI settings of a course (automatic grade drafts).'),
            ('ai_course_analyses', 'An AI review of a whole course.'),
            ('ai_lecture_reviews', 'AI suggestions for one lesson activity.'),
            ('ai_submission_analyses', 'AI gap analysis of one attempt (a submission or a file hand-in).'),
            ('ai_remediation_sessions', 'Remediation (lecture + test) generated from a submission analysis.'),
            ('ai_grade_drafts', 'An AI-proposed grade for an attempt, for a teacher to accept or correct.'),
            ('ai_grade_corrections', 'A teacher''s correction of an AI grade draft (calibration data).'),
            ('ai_student_memory', 'Notes the AI tutor keeps about a learner in a course.'),
            ('ai_token_ledger', 'AI tokens used per account per month (budget).'),
            ('ai_token_reservations', 'Tokens reserved by a running AI run against the budget, released on finish or expiry.'),
            ('ai_work_embeddings', 'Embedding of a part of learner work (similarity, grading context).'),
            ('content_chunks', 'A searchable chunk of course material with its embedding (course material search, AI context).'),
            ('content_index_state', 'Indexing state of each content source: version, chunk count, last error.'),
            -- Operations
            ('jobs', 'Background job queue (transactional, SKIP LOCKED); succeeded and failed rows are pruned by retention.'),
            ('job_schedules', 'Periodic jobs: kind, interval and next run, driven by the worker''s cron leader.'),
            ('schema_skipped_checks', 'CHECK constraints a migration could not add because existing rows violate them (RUNBOOK 2.4).')
        ) AS x(name, comment)
        JOIN pg_class c ON c.relname = x.name AND c.relnamespace = 'public'::regnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm')
    LOOP
        EXECUTE format('COMMENT ON %s %I IS %L', r.kind, r.relname, r.comment);
    END LOOP;
END
$do$;
