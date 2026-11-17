-- Names, part 1 (REWRITE 5.8 item 9): `certifications` -> `certificate_templates`, `certificate_users` ->
-- `certificates` (its `certification_id` -> `template_id`), `course_discussions` -> `discussion_posts`.
--
-- Switch release: a view under each old name is the old table for the previous release. A single-table view
-- is auto-updatable, so it reads and writes through it (RETURNING, FOR UPDATE and its upserts' ON CONFLICT
-- inference included; the base table's triggers fire). The view's grants are the table's: default privileges
-- give both roles the view, apply_role_grants hides the same columns from ashyq_ro by the old name too.
-- Constraints, indexes and triggers keep their names. A contract drops the views (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE learning.certifications RENAME TO certificate_templates;
ALTER TABLE learning.certificate_users RENAME TO certificates;
ALTER TABLE learning.certificates RENAME COLUMN certification_id TO template_id;
ALTER TABLE core.course_discussions RENAME TO discussion_posts;

CREATE VIEW learning.certifications AS SELECT * FROM learning.certificate_templates;
CREATE VIEW learning.certificate_users AS
    SELECT id, user_id, verify_code, created_at, updated_at, template_id AS certification_id, course_id,
           holder_name, course_name, certificate_name, score, instructor_name, reissued_at
      FROM learning.certificates;
CREATE VIEW core.course_discussions AS SELECT * FROM core.discussion_posts;
COMMENT ON VIEW learning.certifications IS 'The previous release''s name of certificate_templates; a contract drops it.';
COMMENT ON VIEW learning.certificate_users IS 'The previous release''s name of certificates; a contract drops it.';
COMMENT ON VIEW core.course_discussions IS 'The previous release''s name of discussion_posts; a contract drops it.';

-- Trigger bodies name the tables, not the views (they outlive the contract).
CREATE OR REPLACE FUNCTION certificate_users_frozen() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF to_jsonb(NEW) - 'holder_name' - 'reissued_at' - 'updated_at'
       IS DISTINCT FROM to_jsonb(OLD) - 'holder_name' - 'reissued_at' - 'updated_at' THEN
        RAISE EXCEPTION 'certificates state what was issued: only the holder name is re-issued'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION users_reissue_certificates() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    UPDATE certificates SET holder_name = NEW.display_name, reissued_at = now()
     WHERE user_id = NEW.id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION course_discussions_recount_replies() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.parent_id IS NOT NULL AND OLD.status = 'active' THEN
        UPDATE discussion_posts SET replies_count = replies_count - 1
        WHERE id = OLD.parent_id;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL AND NEW.status = 'active' THEN
        UPDATE discussion_posts SET replies_count = replies_count + 1
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION discussion_reactions_recount() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        UPDATE discussion_posts SET
            likes_count = likes_count - (OLD.reaction = 'like')::int,
            dislikes_count = dislikes_count - (OLD.reaction = 'dislike')::int
        WHERE id = OLD.discussion_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        UPDATE discussion_posts SET
            likes_count = likes_count + (NEW.reaction = 'like')::int,
            dislikes_count = dislikes_count + (NEW.reaction = 'dislike')::int
        WHERE id = NEW.discussion_id;
    END IF;
    RETURN NULL;
END $$;

-- The certificate holder's name and a post's text stay hidden from ashyq_ro under both names (RUNBOOK 2.5).
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
            ('certificates', ARRAY['holder_name']),
            ('certificate_users', ARRAY['holder_name']),
            ('jobs', ARRAY['payload', 'last_error']),
            ('submission_violations', ARRAY['event']),
            -- Schema review 2026-11-08: free text a person wrote or that is about one person, missed above.
            ('discussion_posts', ARRAY['content']),
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
