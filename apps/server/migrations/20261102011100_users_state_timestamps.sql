SET LOCAL lock_timeout = '5s';

-- Schema review 3, items 28-29 (REWRITE 5.6 n10): the account's state as
-- timestamps. `disabled_at` (NULL = active) replaces `status`;
-- `email_verified_at` (NULL = not verified) replaces the nullable boolean
-- `email_verified`.
--
-- Expand step. The server reads and writes the new columns; the previous
-- binary reads and writes the old ones. users_sync_state keeps both sides
-- equal on every write: when a statement changes one side, the other
-- follows (an old-side change wins when both move, so a mixed write stays
-- coherent). `email_verified IS NULL` (an account older than that column,
-- not yet asked from Zitadel) has no new-side form: the server still reads
-- it as "unknown" until those rows are resolved, so `email_verified` is not
-- part of the contract step yet (REWRITE 5.6 n10). `status` goes there.

ALTER TABLE users ADD COLUMN disabled_at timestamptz, ADD COLUMN email_verified_at timestamptz;

-- data-fix: deterministic backfill. A disabled account was disabled no
-- later than its deletion, else at its last update; a verified address
-- counts from the account's creation.
SET LOCAL ab.bookkeeping = 'on';
UPDATE users SET
    disabled_at = CASE WHEN status = 'disabled' THEN coalesce(deleted_at, updated_at) END,
    email_verified_at = CASE WHEN email_verified THEN created_at END
WHERE (status = 'disabled') OR email_verified;
SET LOCAL ab.bookkeeping = 'off';

CREATE FUNCTION users_sync_state() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'disabled' THEN
            NEW.disabled_at := coalesce(NEW.disabled_at, now());
        ELSIF NEW.disabled_at IS NOT NULL THEN
            NEW.status := 'disabled';
        END IF;
        IF NEW.email_verified THEN
            NEW.email_verified_at := coalesce(NEW.email_verified_at, now());
        ELSIF NEW.email_verified_at IS NOT NULL THEN
            NEW.email_verified := true;
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.disabled_at := CASE WHEN NEW.status = 'disabled'
                                THEN coalesce(NEW.disabled_at, OLD.disabled_at, now()) END;
    ELSIF NEW.disabled_at IS DISTINCT FROM OLD.disabled_at THEN
        NEW.status := CASE WHEN NEW.disabled_at IS NULL THEN 'active' ELSE 'disabled' END;
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
        NEW.email_verified_at := CASE WHEN NEW.email_verified
                                      THEN coalesce(NEW.email_verified_at, OLD.email_verified_at, now()) END;
    ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
        NEW.email_verified := NEW.email_verified_at IS NOT NULL;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER users_sync_state BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION users_sync_state();

COMMENT ON COLUMN users.disabled_at IS 'When the account was disabled; NULL = active.';
COMMENT ON COLUMN users.email_verified_at IS
    'When the address was confirmed; NULL = not confirmed (or, while email_verified IS NULL, not known yet).';

SELECT schema_try_check('users', 'users_deleted_disabled_at_check',
    $c$deleted_at IS NULL OR disabled_at IS NOT NULL$c$);
