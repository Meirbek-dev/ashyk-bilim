-- Schema review gates on the DOT import (docs/XLSX-TEST-IMPORT.md), after 20261113000000:
-- 1. The committed test names the import's course twice (assessment_imports.course_id and the test's own): one key
--    over (result_assessment_id, course_id) keeps them equal, as every child of a course-scoped parent
--    (20261101220000). ON DELETE SET NULL of the test clears only the link; the import keeps its course.
-- 2. ashyq_ro (agents, analytics): an import holds the file's name, its questions as parsed (an exam's text), the
--    issue parameters (cell text) and the reader's error; those stay hidden (rule of 20261108000100). The item ->
--    upload links hold ids only and are read whole (infra/tests/db-roles.sh).
-- 3. The parsed plan states its shape (schema review: every jsonb column has one): an object with settings and items.
-- The table is new in this release: no rows to repair.

SET LOCAL lock_timeout = '5s';

ALTER TABLE learning.assessment_imports
    DROP CONSTRAINT assessment_imports_result_assessment_id_fkey,
    ADD CONSTRAINT assessment_imports_result_assessment_id_fkey
        FOREIGN KEY (result_assessment_id, course_id) REFERENCES learning.assessments (id, course_id)
        ON DELETE SET NULL (result_assessment_id),
    ADD CONSTRAINT assessment_imports_parsed_shape CHECK (parsed IS NULL OR (jsonb_typeof(parsed) = 'object'
        AND jsonb_typeof(parsed -> 'items') = 'array' AND jsonb_typeof(parsed -> 'settings') = 'object'));

CREATE OR REPLACE FUNCTION apply_role_grants(owner name) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    t record;
    s name;
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ashyq_app', 'ashyq_ro')) < 2 THEN
        RETURN;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO ashyq_app, ashyq_ro', current_database());
    -- Temp tables are written disk: the owner and the app may, the read-only role may not.
    EXECUTE format('REVOKE TEMPORARY ON DATABASE %1$I FROM PUBLIC; GRANT TEMPORARY ON DATABASE %1$I TO %2$I, ashyq_app',
                   current_database(), owner);
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;

    FOREACH s IN ARRAY ARRAY['public']::name[] || app_schemas() LOOP
        CONTINUE WHEN to_regnamespace(s) IS NULL;
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO ashyq_app, ashyq_ro', s);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ashyq_app', s);
        EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO ashyq_app', s);
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO ashyq_ro', s);
        EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO ashyq_ro', s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I
                          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashyq_app', owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I
                          GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashyq_app', owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO ashyq_ro',
                       owner, s);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON SEQUENCES TO ashyq_ro',
                       owner, s);
    END LOOP;

    -- The ledger is the owner's; journal rows are appended, never rewritten or deleted by the app.
    -- schema_skipped_checks holds CHECK expressions that migrations run as the owner: rows of the owner only.
    FOR t IN
        SELECT c.oid::regclass AS rel, c.relname FROM pg_class c
        WHERE c.relnamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND c.relkind IN ('r', 'p')
          AND c.relname IN ('_sqlx_migrations', 'schema_skipped_checks', 'grading_entries',
                            'file_grading_entries', 'assessment_audit_events', 'auth_audit_log',
                            'item_feedback', 'submission_violations')
    LOOP
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM ashyq_app', t.rel);
        IF t.relname NOT IN ('_sqlx_migrations', 'schema_skipped_checks') THEN
            EXECUTE format('GRANT INSERT ON %s TO ashyq_app', t.rel);
        END IF;
    END LOOP;

    -- Secrets and contact data stay out of read-only access (agents, analytics): every column but these.
    FOR t IN
        SELECT c.oid::regclass AS rel, x.hidden
        FROM (VALUES
            ('users', ARRAY['email', 'bio', 'profile']),
            ('google_accounts', ARRAY['google_sub', 'email']),
            ('auth_audit_log', ARRAY['ip', 'ip_address', 'user_agent', 'metadata']),
            ('platforms', ARRAY['email']),
            ('code_run_cases', ARRAY['judge0_token']),
            ('idempotency_keys', NULL),
            ('submissions', ARRAY['answers', 'violations']),
            ('ai_qa_messages', ARRAY['content', 'metadata']),
            ('teacher_interventions', ARRAY['notes', 'payload']),
            ('item_feedback', ARRAY['comment']),
            ('certificate_users', ARRAY['holder_name']),
            ('jobs', ARRAY['payload', 'last_error']),
            ('submission_violations', ARRAY['event']),
            -- Schema review 2026-11-08: free text a person wrote or that is about one person, missed above.
            ('course_discussions', ARRAY['content']),
            ('grading_entries', ARRAY['overall_feedback']),
            ('file_grading_entries', ARRAY['feedback']),
            ('file_submission_attempts', ARRAY['feedback']),
            ('assessment_overrides', ARRAY['note']),
            ('file_submission_overrides', ARRAY['reason']),
            ('ai_threads', ARRAY['title']),
            ('ai_student_memory', ARRAY['memory_text']),
            ('ai_submission_analyses', ARRAY['analysis', 'evidence']),
            ('ai_grade_drafts', ARRAY['proposal']),
            ('ai_grade_corrections', ARRAY['excerpt', 'teacher_feedback']),
            ('ai_evidence', ARRAY['excerpt']),
            ('ai_artifacts', ARRAY['content']),
            ('file_submission_files', ARRAY['display_name']),
            -- Personal messages (docs/DIALOGS.md 7): nobody but the two people reads the text.
            ('messages', ARRAY['body']),
            ('message_reports', ARRAY['reason', 'body_snapshot', 'resolution']),
            ('message_bans', ARRAY['reason']),
            ('message_uploads', ARRAY['name']),
            -- DOT imports (docs/XLSX-TEST-IMPORT.md): the file's name and text, as the uploads above.
            ('assessment_imports', ARRAY['file_name', 'sheet_name', 'parsed', 'issues', 'error'])
        ) AS x(name, hidden)
        JOIN pg_class c ON c.relname = x.name
         AND c.relnamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
    LOOP
        EXECUTE format('REVOKE SELECT ON %s FROM ashyq_ro', t.rel);
        IF t.hidden IS NOT NULL THEN
            EXECUTE (
                SELECT format('GRANT SELECT (%s) ON %s TO ashyq_ro',
                              string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum), t.rel)
                FROM pg_attribute a
                WHERE a.attrelid = t.rel AND a.attnum > 0
                  AND NOT a.attisdropped AND a.attname <> ALL (t.hidden)
            );
        END IF;
    END LOOP;

    -- A SECURITY DEFINER function writes as its owner: the app may call it, nobody else.
    FOR t IN
        SELECT p.oid::regprocedure AS fn FROM pg_proc p
        WHERE p.pronamespace::regnamespace::name = ANY (ARRAY['public']::name[] || app_schemas())
          AND p.prosecdef
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, ashyq_ro', t.fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ashyq_app', t.fn);
    END LOOP;
END
$$;

SELECT apply_role_grants(current_user);
SELECT pin_function_search_paths();
