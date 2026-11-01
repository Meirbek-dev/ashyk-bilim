-- Privileges of the least-privilege roles as part of the schema (item 42, RUNBOOK 2.5).
--
-- infra/postgres/roles.sql (db-init, superuser) creates ashyq_app and ashyq_ro and their settings; what they
-- may touch is decided here, by the owner, because the owner creates the tables: db-init runs before the
-- migrations, so a rule kept only there would miss every table a release adds. apply_role_grants(owner):
--
--   ashyq_app  rows of every table (default privileges follow new tables), no DDL; the migration ledger is
--              read-only and the grade/audit journals insert-only (their deletes are the owner's cascades
--              and SECURITY DEFINER retention); EXECUTE on the SECURITY DEFINER functions (every other
--              function keeps PUBLIC's EXECUTE);
--   ashyq_ro   SELECT, but no secrets or contact data: column grants without the listed columns, nothing of
--              idempotency_keys; no SECURITY DEFINER function.
--
-- Idempotent; a no-op until both roles exist (dev and test clusters without them). Called here, by roles.sql
-- on every db-init run (so a column added to a listed table becomes readable), and again by any migration that
-- changes the lists: a new journal or secret-bearing table is added to them with CREATE OR REPLACE.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION apply_role_grants(owner name) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    t record;
BEGIN
    IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ashyq_app', 'ashyq_ro')) < 2 THEN
        RETURN;
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO ashyq_app, ashyq_ro', current_database());
    GRANT USAGE ON SCHEMA public TO ashyq_app, ashyq_ro;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;

    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ashyq_app;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ashyq_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO ashyq_ro;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ashyq_ro;
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ashyq_app', owner);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
                      GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ashyq_app', owner);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO ashyq_ro', owner);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON SEQUENCES TO ashyq_ro', owner);

    -- The ledger is the owner's; journal rows are appended, never rewritten or deleted by the app.
    FOR t IN
        SELECT c.relname FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
          AND c.relname IN ('_sqlx_migrations', 'grading_entries', 'file_grading_entries',
                            'assessment_audit_events', 'auth_audit_log')
    LOOP
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM ashyq_app', t.relname);
        IF t.relname <> '_sqlx_migrations' THEN
            EXECUTE format('GRANT INSERT ON %I TO ashyq_app', t.relname);
        END IF;
    END LOOP;

    -- Secrets and contact data stay out of read-only access (agents, analytics): every column but these.
    FOR t IN
        SELECT c.relname, x.hidden
        FROM (VALUES
            ('users', ARRAY['email', 'bio', 'profile']),
            ('google_accounts', ARRAY['google_sub', 'email']),
            ('auth_audit_log', ARRAY['ip', 'user_agent', 'metadata']),
            ('platforms', ARRAY['email']),
            ('idempotency_keys', NULL)
        ) AS x(name, hidden)
        JOIN pg_class c ON c.relname = x.name AND c.relnamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('REVOKE SELECT ON %I FROM ashyq_ro', t.relname);
        IF t.hidden IS NOT NULL THEN
            EXECUTE (
                SELECT format('GRANT SELECT (%s) ON %I TO ashyq_ro',
                              string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum), t.relname)
                FROM pg_attribute a
                WHERE a.attrelid = format('public.%I', t.relname)::regclass AND a.attnum > 0
                  AND NOT a.attisdropped AND a.attname <> ALL (t.hidden)
            );
        END IF;
    END LOOP;

    -- A SECURITY DEFINER function writes as its owner: the app may call it, nobody else.
    FOR t IN
        SELECT p.oid::regprocedure AS fn FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, ashyq_ro', t.fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO ashyq_app', t.fn);
    END LOOP;
END
$$;

SELECT apply_role_grants(current_user);
