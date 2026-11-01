-- Domains for the score columns (schema review 2, items 7 and 31).
--
-- One definition per repeated check instead of a CHECK copied onto every
-- column: a percentage (`percent`) is numeric(5,2) in 0..100, points
-- (`score_points`) and weights (`score_weight`) are numeric(8,2) and >= 0. 'NaN' sorts above every number in numeric, so the
-- upper bound already refuses it; the unbounded domains refuse it by name.
--
-- Expand step: only the domains. The score columns are still double
-- precision; the server reads and writes them through `::float8` casts, which
-- work on either type, and the contract migration converts the columns.

SET LOCAL lock_timeout = '5s';

CREATE DOMAIN percent AS numeric(5, 2) CHECK (VALUE >= 0 AND VALUE <= 100);
CREATE DOMAIN score_points AS numeric(8, 2) CHECK (VALUE >= 0 AND VALUE <> 'NaN');
CREATE DOMAIN score_weight AS numeric(8, 2) CHECK (VALUE >= 0 AND VALUE <> 'NaN');

-- The repair rule the contract migration converts existing values with:
-- rounded to the scale (half away from zero, as numeric does), clamped into
-- [lo, hi], 'NaN' and infinities become `fallback`.
CREATE FUNCTION score_repair(x double precision, lo numeric, hi numeric, fallback numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN x IS NULL THEN NULL
        WHEN x = 'NaN' OR x = 'Infinity' OR x = '-Infinity' THEN fallback
        ELSE least(greatest(round(x::numeric, 2), lo), coalesce(hi, round(x::numeric, 2)))
    END
$$;
