-- Agents read restored copies of real data as ashyq_ro (schema review 46): what a person wrote, and their name on a
-- diploma, stay out of it, like email and bio. Violations are evidence, insert-only for the app; so is item_feedback, whose update and delete
-- functions had no callers and went (schema review 18). Enrolment events stay deletable: the erasure removes them.

SET LOCAL lock_timeout = '5s';

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
            ('submission_violations', ARRAY['event'])
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
