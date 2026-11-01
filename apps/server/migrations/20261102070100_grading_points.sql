SET LOCAL lock_timeout = '5s';

-- Points beside percentages in the grade journal (schema review 2 item 6,
-- REWRITE 5.6 n16 "points as the record"). A grade is still written as a
-- percentage (the grader, the attempt cap, the late penalty and a teacher's
-- override all work in percent); the journal now also keeps it in points of
-- the attempt's assessment version, derived by the database so both releases'
-- writes carry them.
--
-- The rule, one place for both directions:
--   points  = round(percent * max_points / 100, 2)
--   percent = round(points * 100 / max_points, 2)        (max_points > 0)
-- numeric round() is half away from zero. A percentage that passes through
-- points comes back within 0.5 / max_points percentage points (points keep two
-- decimals), so for max_points >= 1 a percentage override never moves by more
-- than half a percent. No version (a hand-in older than assessment_versions)
-- = no points.

CREATE FUNCTION points_of_percent(percent numeric, max_points numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN round(percent * max_points / 100, 2);

CREATE FUNCTION percent_of_points(points numeric, max_points numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN max_points > 0 THEN round(points * 100 / max_points, 2) END;

COMMENT ON FUNCTION points_of_percent(numeric, numeric) IS
    'Points of a percentage of max_points, two decimals, half away from zero (the grade-points rule).';
COMMENT ON FUNCTION percent_of_points(numeric, numeric) IS
    'Percentage of max_points that points are, two decimals; NULL when max_points is 0.';

ALTER TABLE grading_entries
    ADD COLUMN max_points score_points,
    ADD COLUMN raw_points score_points,
    ADD COLUMN final_points score_points;

COMMENT ON COLUMN grading_entries.max_points IS
    'The attempt''s assessment_versions.max_points when graded; NULL without a version.';
COMMENT ON COLUMN grading_entries.raw_points IS 'points_of_percent(raw_score, max_points), set by the database.';
COMMENT ON COLUMN grading_entries.final_points IS 'points_of_percent(final_score, max_points), set by the database.';

-- The journal guard freezes every column after the insert, so the points are
-- set once, on the insert, whatever the writer sent.
CREATE FUNCTION grading_entries_points() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    SELECT v.max_points INTO NEW.max_points
    FROM submissions s JOIN assessment_versions v ON v.id = s.assessment_version_id
    WHERE s.id = NEW.submission_id;
    NEW.raw_points := points_of_percent(NEW.raw_score::numeric, NEW.max_points);
    NEW.final_points := points_of_percent(NEW.final_score::numeric, NEW.max_points);
    RETURN NEW;
END
$$;

CREATE TRIGGER grading_entries_points BEFORE INSERT ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION grading_entries_points();

-- Backfill the entries written so far (the guard is lifted for this statement
-- only: the columns are new, nothing recorded changes).
ALTER TABLE grading_entries DISABLE TRIGGER grading_entries_immutable;
UPDATE grading_entries e
SET max_points = v.max_points,
    raw_points = points_of_percent(e.raw_score::numeric, v.max_points),
    final_points = points_of_percent(e.final_score::numeric, v.max_points)
FROM submissions s JOIN assessment_versions v ON v.id = s.assessment_version_id
WHERE s.id = e.submission_id;
ALTER TABLE grading_entries ENABLE TRIGGER grading_entries_immutable;

ALTER TABLE grading_entries ADD CONSTRAINT grading_entries_points_check CHECK (
    (max_points IS NULL AND raw_points IS NULL AND final_points IS NULL)
    OR (max_points IS NOT NULL AND raw_points IS NOT NULL AND raw_points <= max_points
        AND (final_points IS NULL) = (final_score IS NULL)
        AND (final_points IS NULL OR final_points <= max_points)));
