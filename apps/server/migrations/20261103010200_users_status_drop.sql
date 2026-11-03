SET LOCAL lock_timeout = '5s';
-- contract: item 29, the server reads and writes users.disabled_at since
-- 20261102011100; nothing reads or writes `status` any more.
-- `email_verified` stays until no account is "not known yet" (REWRITE 5.6 n10).

-- data-fix: users_sync_state kept both sides equal; re-derive from the old
-- side once more for rows a previous binary wrote (same rule as the backfill).
SET LOCAL ab.bookkeeping = 'on';
UPDATE users SET disabled_at = coalesce(deleted_at, updated_at)
WHERE status = 'disabled' AND disabled_at IS NULL;
UPDATE users SET disabled_at = NULL
WHERE status = 'active' AND disabled_at IS NOT NULL;
SET LOCAL ab.bookkeeping = 'off';

-- Only the email pair is mirrored from now on.
CREATE OR REPLACE FUNCTION users_sync_state() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.email_verified THEN
            NEW.email_verified_at := coalesce(NEW.email_verified_at, now());
        ELSIF NEW.email_verified_at IS NOT NULL THEN
            NEW.email_verified := true;
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
        NEW.email_verified_at := CASE WHEN NEW.email_verified
                                      THEN coalesce(NEW.email_verified_at, OLD.email_verified_at, now()) END;
    ELSIF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at THEN
        NEW.email_verified := NEW.email_verified_at IS NOT NULL;
    END IF;
    RETURN NEW;
END $$;

ALTER TABLE users
    DROP CONSTRAINT users_deleted_disabled_check,
    DROP CONSTRAINT users_status_check,
    DROP COLUMN status;
