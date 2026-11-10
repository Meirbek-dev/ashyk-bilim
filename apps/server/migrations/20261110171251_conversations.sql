-- Personal messages, stage 1 (docs/DIALOGS.md 4): one conversation per pair of people, its two member rows,
-- the messages, reports on them and send bans. Nothing is counted in a column: unread counts are read with
-- `id > last_read_message_id` over messages (conversation_id, id DESC), like discussion counts since 2026-11.
--
-- The text is private: ashyq_ro reads every column but messages.body and the report/ban free text
-- (apply_role_grants below, infra/tests/db-roles.sh).

SET LOCAL lock_timeout = '5s';

CREATE TABLE core.conversations (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    kind            text NOT NULL DEFAULT 'direct' CHECK (kind = 'direct'),
    last_message_id uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE core.conversations IS
    'A personal conversation of two people (kind direct); created with its first message. last_message_id orders the lists.';

CREATE TABLE core.conversation_members (
    conversation_id      uuid NOT NULL REFERENCES core.conversations (id) ON DELETE CASCADE,
    user_id              uuid NOT NULL REFERENCES users (id),
    peer_id              uuid NOT NULL REFERENCES users (id),
    last_read_message_id uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id),
    UNIQUE (user_id, peer_id),
    CHECK (user_id <> peer_id)
);
CREATE INDEX conversation_members_peer_idx ON core.conversation_members (peer_id);
COMMENT ON TABLE core.conversation_members IS
    'The two sides of a conversation, one row each: user_id reads it with peer_id; (user_id, peer_id) is unique, so a pair has one conversation. last_read_message_id only grows.';

CREATE TABLE core.messages (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    conversation_id uuid NOT NULL REFERENCES core.conversations (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users (id),
    body            text NOT NULL CHECK (char_length(body) <= 4000),
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at      timestamptz,
    client_key      uuid NOT NULL,
    course_id       uuid REFERENCES courses (id) ON DELETE SET NULL,
    activity_id     uuid REFERENCES activities (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_key),
    CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),
    CHECK (status = 'active' OR body = '')
);
CREATE INDEX messages_conversation_idx ON core.messages (conversation_id, id DESC);
CREATE INDEX messages_user_idx ON core.messages (user_id, id DESC);
CREATE INDEX messages_course_idx ON core.messages (course_id);
CREATE INDEX messages_activity_idx ON core.messages (activity_id);
COMMENT ON TABLE core.messages IS
    'One message of a conversation, by user_id. A deleted one stays as a tombstone (status deleted, empty body). client_key makes a resend idempotent; course_id / activity_id say what it is about.';

ALTER TABLE core.conversations
    ADD CONSTRAINT conversations_last_message_id_fkey
    FOREIGN KEY (last_message_id) REFERENCES core.messages (id) ON DELETE SET NULL;
CREATE INDEX conversations_last_message_idx ON core.conversations (last_message_id);

CREATE TABLE core.message_reports (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    message_id    uuid NOT NULL REFERENCES core.messages (id) ON DELETE CASCADE,
    reported_by   uuid NOT NULL REFERENCES users (id),
    reason        text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
    body_snapshot text NOT NULL,
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolved_by   uuid REFERENCES users (id),
    resolved_at   timestamptz,
    resolution    text CHECK (char_length(resolution) <= 2000),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, reported_by),
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX message_reports_status_idx ON core.message_reports (status, id DESC);
CREATE INDEX message_reports_reported_by_idx ON core.message_reports (reported_by);
CREATE INDEX message_reports_resolved_by_idx ON core.message_reports (resolved_by);
COMMENT ON TABLE core.message_reports IS
    'A participant reported the other side''s message to the administrators; body_snapshot is its text at report time, so a later delete keeps the evidence.';

CREATE TABLE core.message_bans (
    user_id    uuid PRIMARY KEY REFERENCES users (id),
    banned_by  uuid NOT NULL REFERENCES users (id),
    reason     text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_bans_banned_by_idx ON core.message_bans (banned_by);
COMMENT ON TABLE core.message_bans IS
    'The user may not send personal messages (an administrator decided it on a report); reading stays open.';

INSERT INTO notification_kinds (kind) VALUES ('message_report_resolved') ON CONFLICT DO NOTHING;

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
            ('message_bans', ARRAY['reason'])
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
