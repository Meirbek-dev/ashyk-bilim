-- One platform day (REWRITE 5.7 n2): the XP daily cap, the login/learning
-- streaks, the login bonus key and the analytics rollup dates all cut days at
-- midnight in the platform time zone, Asia/Almaty, instead of UTC (05:00 there).
--
-- The zone lives in platform_time_zone() only; changing it is one
-- CREATE OR REPLACE in a migration. platform_date() is the local date of an
-- instant, platform_day_start() the instant a local date begins, so a range
-- over a timestamptz column stays sargable:
--   created_at >= platform_day_start(platform_date(now())).
-- All three are IMMUTABLE like the timezone() they wrap (the tz database is
-- treated as fixed, as Postgres does) and inline into the calling query.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION platform_time_zone() RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN 'Asia/Almaty';

CREATE FUNCTION platform_date(at timestamptz) RETURNS date
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN (at AT TIME ZONE platform_time_zone())::date;

CREATE FUNCTION platform_day_start(day date) RETURNS timestamptz
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN day::timestamp AT TIME ZONE platform_time_zone();
