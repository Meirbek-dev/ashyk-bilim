SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 26: a user's switched-off notification kinds are
-- rows with a real foreign key onto notification_kinds, not a text[] that
-- a trigger checks element by element.
--
-- Expand step. The server reads and writes notification_opt_outs; the
-- previous binary still reads and writes notification_preferences.disabled.
-- Two triggers keep them equal until the contract file drops the old table:
-- a write to either side rewrites the other (pg_trigger_depth() keeps the
-- copy from echoing back).

CREATE TABLE notification_opt_outs (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL REFERENCES notification_kinds (kind) ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind)
);

COMMENT ON TABLE notification_opt_outs IS
    'Notification kinds a user switched off (GET/PUT /me/notification-preferences); no row = on.';

INSERT INTO notification_opt_outs (user_id, kind, created_at)
SELECT DISTINCT ON (p.user_id, d.kind) p.user_id, d.kind, p.updated_at
  FROM notification_preferences p, unnest(p.disabled) AS d(kind)
ON CONFLICT DO NOTHING;

-- Previous binary → rows.
CREATE FUNCTION notification_preferences_sync_opt_outs() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    DELETE FROM notification_opt_outs o
     WHERE o.user_id = NEW.user_id AND o.kind <> ALL (NEW.disabled);
    INSERT INTO notification_opt_outs (user_id, kind)
    SELECT DISTINCT NEW.user_id, d.kind FROM unnest(NEW.disabled) AS d(kind)
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

CREATE TRIGGER notification_preferences_sync_opt_outs
    AFTER INSERT OR UPDATE OF disabled ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION notification_preferences_sync_opt_outs();

-- Rows → the array the previous binary reads.
CREATE FUNCTION notification_opt_outs_sync_preferences() RETURNS trigger
    LANGUAGE plpgsql AS $$
DECLARE
    u uuid := coalesce(NEW.user_id, OLD.user_id);
BEGIN
    -- An account being deleted takes both sides with it (its cascade).
    IF pg_trigger_depth() > 1 OR NOT EXISTS (SELECT 1 FROM users WHERE id = u) THEN
        RETURN NULL;
    END IF;
    INSERT INTO notification_preferences AS p (user_id, disabled)
    VALUES (u, ARRAY(SELECT o.kind FROM notification_opt_outs o WHERE o.user_id = u ORDER BY o.kind))
    ON CONFLICT (user_id) DO UPDATE SET disabled = EXCLUDED.disabled
    WHERE p.disabled IS DISTINCT FROM EXCLUDED.disabled;
    RETURN NULL;
END $$;

CREATE TRIGGER notification_opt_outs_sync_preferences
    AFTER INSERT OR UPDATE OR DELETE ON notification_opt_outs
    FOR EACH ROW EXECUTE FUNCTION notification_opt_outs_sync_preferences();
