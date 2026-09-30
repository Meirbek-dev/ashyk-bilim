-- BUG-354: ETL / import bookkeeping (loading legacy rows, linking Zitadel
-- ids, marking staff previews) is not a user edit. A transaction that
-- `SET LOCAL ab.bookkeeping = 'on'` keeps whatever `updated_at` it writes
-- (or leaves) instead of the trigger stamping the run time over the legacy
-- value.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('ab.bookkeeping', true) = 'on' THEN
        RETURN NEW;
    END IF;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
