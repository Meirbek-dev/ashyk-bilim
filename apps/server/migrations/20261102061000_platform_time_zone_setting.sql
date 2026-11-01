-- The platform zone is configuration (AB__SERVER__TIME_ZONE, default
-- Asia/Almaty), not a constant in SQL: the pool passes it to every session as
-- the custom setting ab.time_zone (ab_db::with_platform_zone), so the SQL that
-- needs the platform day (today's XP from the ledger, the streak UPDATE,
-- rollup retention) cuts days at the same midnight as Rust's
-- ab_core::time::Day. A session without the setting (psql, `just db sql`)
-- keeps Asia/Almaty.
--
-- Reading a setting makes the three functions STABLE instead of IMMUTABLE;
-- nothing indexes or generates a column from them, and a STABLE expression
-- still inlines and bounds an index scan:
--   created_at >= platform_day_start(platform_date(now())).

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION platform_time_zone() RETURNS text
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN coalesce(nullif(current_setting('ab.time_zone', true), ''), 'Asia/Almaty');

CREATE OR REPLACE FUNCTION platform_date(at timestamptz) RETURNS date
    LANGUAGE sql STABLE PARALLEL SAFE STRICT
    RETURN (at AT TIME ZONE platform_time_zone())::date;

CREATE OR REPLACE FUNCTION platform_day_start(day date) RETURNS timestamptz
    LANGUAGE sql STABLE PARALLEL SAFE STRICT
    RETURN day::timestamp AT TIME ZONE platform_time_zone();

COMMENT ON FUNCTION platform_time_zone() IS
    'The platform zone: the session setting ab.time_zone (set by the server pool from AB__SERVER__TIME_ZONE), else Asia/Almaty.';
COMMENT ON FUNCTION platform_date(timestamptz) IS
    'The platform-zone calendar date of an instant.';
COMMENT ON FUNCTION platform_day_start(date) IS
    'The instant a platform-zone calendar date begins (its local midnight).';
