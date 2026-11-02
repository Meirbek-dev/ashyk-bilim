SET LOCAL lock_timeout = '5s';

-- Schema review 3, item 27: audit IPs are `inet` again (20260816000004 made
-- them text so X-Forwarded-For junk could not reject the row). Expand step:
-- `ip_address inet` next to `ip text`. A value Postgres cannot read as inet
-- becomes NULL through `inet_or_null` (the one rule for the backfill, this
-- trigger and the server's INSERT), so junk still never rejects an audit
-- row (a function, not a CASE: the planner folds `$1::inet` of a bound
-- parameter even in a CASE branch that is not taken). The trigger keeps both
-- filled: ip_address for rows the previous binary writes (it sets only `ip`),
-- `ip` for this release's rows, which the previous binary shows after a
-- rollback; the contract file drops `ip`.

ALTER TABLE auth_audit_log ADD COLUMN ip_address inet;

CREATE FUNCTION inet_or_null(p text) RETURNS inet
    LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
    IF pg_input_is_valid(p, 'inet') THEN
        RETURN p::inet;
    END IF;
    RETURN NULL;
END $$;

-- data-fix: deterministic backfill of the new column from the old one.
UPDATE auth_audit_log
SET ip_address = inet_or_null(ip)
WHERE ip IS NOT NULL AND ip_address IS NULL;

CREATE FUNCTION auth_audit_log_ip_address() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ip_address IS NULL AND NEW.ip IS NOT NULL THEN
        NEW.ip_address := inet_or_null(NEW.ip);
    ELSIF NEW.ip IS NULL AND NEW.ip_address IS NOT NULL THEN
        NEW.ip := host(NEW.ip_address);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER auth_audit_log_ip_address BEFORE INSERT ON auth_audit_log
    FOR EACH ROW EXECUTE FUNCTION auth_audit_log_ip_address();

COMMENT ON COLUMN auth_audit_log.ip_address IS
    'Client IP as seen (X-Forwarded-For); NULL when absent or not a valid inet.';
