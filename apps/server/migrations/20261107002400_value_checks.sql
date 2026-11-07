-- What a column holds, said by the database (schema review 35, 38, 39, 40). Rows from before keep working:
-- schema_try_check records a skip when one disagrees (RUNBOOK 2.4).

SET LOCAL lock_timeout = '5s';

-- Hashes: lowercase hex of a SHA-256.
SELECT schema_try_check(t::regclass, t || '_' || c || '_format', c || ' ~ ''^[0-9a-f]{64}$''')
FROM (VALUES ('code_runs', 'source_sha256'), ('code_runs', 'stdin_sha256')) AS x(t, c);

-- Scores on the record stay within a percentage until their type becomes percent (a release after the code casts).
SELECT schema_try_check(t::regclass, t || '_' || c || '_range', c || ' >= 0 AND ' || c || ' <= 100')
FROM (VALUES ('certificate_users', 'score'), ('activity_progress', 'score'),
             ('course_progress', 'grade_average'), ('course_progress', 'weighted_grade_average')) AS x(t, c);

-- Documents are objects.
SELECT schema_try_check(t::regclass, t || '_' || c || '_object', 'jsonb_typeof(' || quote_ident(c) || ') = ''object''')
FROM (VALUES
    ('activities', 'content'), ('activities', 'details'), ('activities', 'settings'),
    ('blocks', 'content'), ('certifications', 'config'),
    ('file_submissions', 'rubric'), ('file_submissions', 'settings'), ('file_submission_attempts', 'rubric_scores'),
    ('ai_approvals', 'payload'), ('ai_artifacts', 'content'),
    ('ai_course_analyses', 'evidence'), ('ai_course_analyses', 'report'),
    ('ai_eval_results', 'details'), ('ai_events', 'payload'), ('ai_evidence', 'metadata'),
    ('ai_lecture_reviews', 'suggestions'), ('ai_qa_messages', 'metadata'),
    ('ai_remediation_sessions', 'lecture'), ('ai_remediation_sessions', 'test'),
    ('ai_runs', 'metadata'), ('ai_student_memory', 'metadata'),
    ('ai_submission_analyses', 'analysis'), ('ai_submission_analyses', 'evidence'),
    ('analytics_saved_views', 'query'), ('bulk_actions', 'params'),
    ('gamification_config', 'rewards'), ('gamification_profiles', 'preferences'),
    ('teacher_interventions', 'payload')
) AS x(t, c);

-- A status with a fixed set.
SELECT schema_try_check('ai_submission_analyses', 'ai_submission_analyses_status_check',
                        'status IN (''complete'', ''failed'', ''superseded'')');

-- Open sets (the code owns the names): a machine word, not arbitrary text.
SELECT schema_try_check(t::regclass, t || '_' || c || '_word', c || ' ~ ''^[A-Za-z][A-Za-z0-9_.:-]*$''')
FROM (VALUES
    ('ai_approvals', 'action_type'), ('ai_artifacts', 'kind'), ('ai_events', 'event_type'),
    ('ai_evidence', 'source_type'), ('ai_student_memory', 'source_type'), ('ai_runs', 'safety_state'),
    ('assessment_audit_events', 'event'), ('auth_audit_log', 'event'), ('job_schedules', 'kind'), ('jobs', 'kind')
) AS x(t, c);

SELECT schema_try_check(t::regclass, t || '_language_tag', 'language ~ ''^[a-z]{2,8}(-[A-Za-z0-9]+)*$''')
FROM (VALUES ('ai_course_analyses'), ('ai_lecture_reviews'), ('ai_remediation_sessions'), ('ai_student_memory'),
             ('ai_submission_analyses')) AS x(t);

SELECT schema_try_check('file_submission_files', 'file_submission_files_content_type_mime',
                        'content_type ~ ''^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+''');

-- AI runs (schema review 43): a batch check has no conversation, a queued run has not started. The code still
-- fills both; the columns stop lying about what must be true.
ALTER TABLE ai_runs ALTER COLUMN thread_id DROP NOT NULL;
ALTER TABLE ai_runs ALTER COLUMN started_at DROP NOT NULL;

-- Search (schema review 45): the language a course is taught in, for a real text configuration.
ALTER TABLE courses ADD COLUMN language text NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'kk', 'en'));
COMMENT ON COLUMN courses.language IS 'The language the course is taught in.';
