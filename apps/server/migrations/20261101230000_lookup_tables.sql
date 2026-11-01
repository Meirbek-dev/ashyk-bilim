-- Schema review item 18: notification kinds and upload purposes are lookup
-- tables, not a CHECK list rewritten (DROP + ADD under ACCESS EXCLUSIVE and a
-- full-table scan) for every new value. A new kind is one INSERT now.
--
-- Seeded from the CHECK lists as they stand (so a migration that added a
-- value before this one is kept) plus every value already stored.

CREATE TABLE notification_kinds (kind text PRIMARY KEY);

INSERT INTO notification_kinds (kind)
SELECT (regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g'))[1]
  FROM pg_constraint
 WHERE conname IN ('notifications_kind_check', 'notification_preferences_disabled_check')
UNION
SELECT kind FROM notifications
UNION
SELECT unnest(disabled) FROM notification_preferences
ON CONFLICT DO NOTHING;

ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications
    ADD CONSTRAINT notifications_kind_fkey
    FOREIGN KEY (kind) REFERENCES notification_kinds (kind) ON UPDATE CASCADE;

-- An array cannot carry a foreign key: a trigger checks each element.
CREATE FUNCTION notification_preferences_check_kinds() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM unnest(NEW.disabled) AS d(kind)
                WHERE NOT EXISTS (SELECT 1 FROM notification_kinds k WHERE k.kind = d.kind)) THEN
        RAISE EXCEPTION 'unknown notification kind in %', NEW.disabled
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'notification_preferences_disabled_check';
    END IF;
    RETURN NEW;
END $$;

ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_disabled_check;
CREATE TRIGGER notification_preferences_check_kinds
    BEFORE INSERT OR UPDATE OF disabled ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION notification_preferences_check_kinds();

CREATE TABLE upload_purposes (purpose text PRIMARY KEY);

INSERT INTO upload_purposes (purpose)
SELECT (regexp_matches(pg_get_constraintdef(oid), '''([^'']+)''', 'g'))[1]
  FROM pg_constraint
 WHERE conname = 'uploads_purpose_check'
UNION
SELECT purpose FROM uploads
ON CONFLICT DO NOTHING;

ALTER TABLE uploads DROP CONSTRAINT uploads_purpose_check;
ALTER TABLE uploads
    ADD CONSTRAINT uploads_purpose_fkey
    FOREIGN KEY (purpose) REFERENCES upload_purposes (purpose) ON UPDATE CASCADE;
