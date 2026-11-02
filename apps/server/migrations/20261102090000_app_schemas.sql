-- Schemas of the app's tables (schema review 43), expand step.
--
-- The tables move out of `public` into five schemas by area:
--   core       identity, roles and groups, the platform, translations, the catalog (courses, chapters,
--              activities, blocks, collections, staff), course updates and discussions, notifications, uploads;
--   learning   enrolment and progress, assessments and their versions, submissions and the grade journal,
--              file tasks, code runs, certificates, gamification, the concept graph and mastery;
--   ai         ai_* tables and the retrieval index (content chunks and their indexing state);
--   analytics  analytics_* and daily_* tables, learner risk snapshots;
--   ops        the job queue and schedules, idempotency keys, the auth audit log, skipped schema checks.
-- `public` keeps the sqlx ledger (_sqlx_migrations), the extensions (until pgvector moves to `extensions`,
-- RUNBOOK 2.6), every function and domain. app_table_schema() below is the mapping, with prefix rules and
-- `core` as the default for a table it does not name.
--
-- Queries stay unqualified: every session needs the search_path app_search_path() names. `public` comes first
-- because sqlx creates its ledger with CREATE TABLE IF NOT EXISTS, which looks only in the first schema of the
-- path; a migration therefore names the schema of every table it creates (migration_rules.rs). The server sets
-- the path in each connection's startup packet (ab_db::SEARCH_PATH); for every other session (the previous
-- release, sqlx CLI, psql, `just db sql`, backups) this file sets it on the database, and `ashyq migrate`
-- re-applies it (a database cloned from a template or restored without --create loses it).
--
-- This file moves nothing: a session opened before a table moves keeps the path it started with, so the
-- previous release must already set the path when the tables move. The move is 20261103073000, a contract
-- file of the release after this one (rollback to this release keeps working: it sets the path).

SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS ops;
COMMENT ON SCHEMA core IS 'Identity, platform, translations, catalog, course updates, discussions, notifications, uploads.';
COMMENT ON SCHEMA learning IS 'Enrolment, progress, assessments, submissions and grades, certificates, gamification, concepts.';
COMMENT ON SCHEMA ai IS 'AI runs, drafts, threads and their ledgers; the retrieval index.';
COMMENT ON SCHEMA analytics IS 'Raw analytics events and their daily rollups.';
COMMENT ON SCHEMA ops IS 'Job queue, schedules, idempotency keys, the auth audit log, skipped schema checks.';

-- The app's schemas, in search_path order.
CREATE FUNCTION app_schemas() RETURNS name[] LANGUAGE sql IMMUTABLE AS $$
    SELECT ARRAY['core', 'learning', 'ai', 'analytics', 'ops']::name[]
$$;

-- Every session's search_path; the same text as ab_db::SEARCH_PATH (schema_review.rs checks it).
-- `extensions` is skipped while it does not exist.
CREATE FUNCTION app_search_path() RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT 'public, core, learning, ai, analytics, ops, extensions'
$$;

-- Set the path on this database (its owner) or, for a role that does not own it, on the role in this
-- database; and on the current session, so the migrations after this one in the same run see it.
-- Idempotent; `ashyq migrate` calls it after every run. Returns where it was set.
CREATE FUNCTION ensure_app_search_path() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    level text := 'database';
BEGIN
    IF (SELECT pg_has_role(datdba, 'USAGE') FROM pg_database WHERE datname = current_database()) THEN
        EXECUTE format('ALTER DATABASE %I SET search_path = %s', current_database(), app_search_path());
    ELSE
        level := 'role';
        EXECUTE format('ALTER ROLE %I IN DATABASE %I SET search_path = %s', current_user,
                       current_database(), app_search_path());
    END IF;
    PERFORM set_config('search_path', app_search_path(), false);
    RETURN level;
END
$$;

SELECT ensure_app_search_path();

-- The schema a table of `public` belongs in (the list above). A table this function does not name goes by
-- its prefix, else to `core`; a migration that adds a table names its schema instead (migration_rules.rs).
CREATE FUNCTION app_table_schema(t name) RETURNS name LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN t IN ('users', 'google_accounts', 'roles', 'role_permissions', 'user_roles', 'usergroups',
                   'usergroup_members', 'usergroup_courses', 'platforms', 'feature_activations',
                   'translatable_fields', 'translations', 'courses', 'chapters', 'activities', 'blocks',
                   'block_uploads', 'collections', 'collection_courses', 'collection_staff', 'course_staff',
                   'resource_authors', 'course_updates', 'course_update_activities', 'course_discussions',
                   'discussion_reactions', 'notifications', 'notification_kinds', 'notification_opt_outs',
                   'notification_preferences', 'uploads', 'upload_purposes')
            THEN 'core'
        WHEN t IN ('enrolments', 'trails', 'trail_runs', 'trail_steps', 'completions', 'activity_progress',
                   'course_progress', 'assessments', 'assessment_versions', 'assessment_items',
                   'assessment_access_users', 'assessment_access_usergroups', 'assessment_overrides',
                   'assessment_audit_events', 'submissions', 'grading_entries', 'item_feedback', 'bulk_actions',
                   'code_runs', 'code_run_cases', 'file_submissions', 'file_submission_attempts',
                   'file_submission_files', 'file_submission_overrides', 'file_grading_entries',
                   'certifications', 'certificate_users', 'gamification_completions', 'gamification_config',
                   'gamification_profiles', 'xp_transactions', 'concept_tags', 'concept_prerequisites',
                   'course_concepts', 'concept_mastery', 'mastery_evidence', 'teacher_interventions')
            THEN 'learning'
        WHEN t IN ('content_chunks', 'content_index_state') THEN 'ai'
        WHEN t IN ('learner_risk_snapshots') THEN 'analytics'
        WHEN t IN ('jobs', 'job_schedules', 'idempotency_keys', 'auth_audit_log', 'schema_skipped_checks')
            THEN 'ops'
        WHEN t LIKE 'ai\_%' THEN 'ai'
        WHEN t LIKE 'analytics\_%' OR t LIKE 'daily\_%' THEN 'analytics'
        WHEN t ~ '^(assessment|submission|grading|attempt|file_submission|file_grading|code_run|trail|enrolment|completion|gamification|xp_|certific|concept|mastery|override)'
             OR t LIKE '%\_progress' THEN 'learning'
        WHEN t LIKE 'job\_%' THEN 'ops'
        ELSE 'core'
    END::name
$$;

-- Move every table, view and free sequence the migrating role owns in `public` (but the sqlx ledger and
-- extension members) into its schema; a partition goes where its root goes. Another role's relation (one
-- a superuser made by hand) stays in public: it is not the app's, and SET SCHEMA would fail on it. Indexes, constraints, owned sequences, triggers, comments and
-- privileges move with their table. Returns how many relations moved. Called by 20261103073000 (and again by
-- any later file that has to place a table an older file created unqualified).
CREATE FUNCTION place_app_tables() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    r record;
    moved integer := 0;
BEGIN
    FOR r IN
        SELECT c.relname, c.relkind,
               CASE WHEN root.relnamespace IS NOT NULL AND root.relnamespace <> c.relnamespace
                    THEN root.relnamespace::regnamespace::name
                    ELSE app_table_schema(coalesce(root.relname, c.relname)) END AS target
        FROM pg_class c
        LEFT JOIN pg_class root ON c.relispartition AND root.oid = pg_partition_root(c.oid)
        WHERE c.relnamespace = 'public'::regnamespace
          AND pg_has_role(c.relowner, 'USAGE')
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
          AND c.relname <> '_sqlx_migrations'
          -- not an extension's member; a sequence owned by a column moves with its table
          AND NOT EXISTS (SELECT FROM pg_depend d
                          WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid
                            AND (d.deptype = 'e'
                                 OR (c.relkind = 'S' AND d.deptype IN ('a', 'i')
                                     AND d.refclassid = 'pg_class'::regclass AND d.refobjid <> c.oid)))
        ORDER BY c.relispartition, c.relname
    LOOP
        EXECUTE format('ALTER %s public.%I SET SCHEMA %I',
                       CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                                      WHEN 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
                       r.relname, r.target);
        moved := moved + 1;
    END LOOP;
    RETURN moved;
END
$$;

-- Monthly partitions are created next to their parent (a partition created unqualified would land in the
-- first schema of the path, and IF-NOT-EXISTS-style checks would miss one in another schema). Both partition
-- functions run as the owner (20261102060100); their path finds analytics_events before and after the move.
CREATE OR REPLACE FUNCTION analytics_events_ensure_partitions(months_ahead integer DEFAULT 3)
    RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, analytics, pg_temp AS $$
DECLARE
    parent regclass := 'analytics_events'::regclass;
    nsp name;
    month_start timestamp;
    made integer := 0;
    part text;
BEGIN
    IF (SELECT relkind FROM pg_class WHERE oid = parent) <> 'p' THEN
        RETURN 0;
    END IF;
    SELECT relnamespace::regnamespace::name INTO nsp FROM pg_class WHERE oid = parent;
    FOR i IN 0..months_ahead LOOP
        month_start := date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => i);
        part := 'analytics_events_' || to_char(month_start, 'YYYYMM');
        CONTINUE WHEN to_regclass(format('%I.%I', nsp, part)) IS NOT NULL;
        BEGIN
            EXECUTE format(
                'CREATE TABLE %I.%I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
                nsp, part, parent, month_start AT TIME ZONE 'UTC',
                (month_start + interval '1 month') AT TIME ZONE 'UTC');
            made := made + 1;
        EXCEPTION WHEN invalid_object_definition OR check_violation THEN
            NULL;
        END;
    END LOOP;
    RETURN made;
END;
$$;

ALTER FUNCTION analytics_events_drop_partitions(timestamptz) SET search_path = public, analytics, pg_temp;

-- Grants per schema: apply_role_grants (20261102050200) covered `public` only.
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
                            'file_grading_entries', 'assessment_audit_events', 'auth_audit_log')
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
            ('idempotency_keys', NULL)
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
