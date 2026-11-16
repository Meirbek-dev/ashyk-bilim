-- Smaller items, part 3 (REWRITE 5.8 item 7): the server numbers a grade entry and sets its points.
--
-- `grading_entries.revision` and `max_points` / `raw_points` / `final_points` were set by BEFORE INSERT triggers
-- whatever the writer sent. The server now writes them itself: the number under the submission's row lock (the
-- highest plus one), the points with `points_of_percent` of the stored percentage and the attempt's version.
-- Switch release: the previous release inserts without them, so the triggers fill only what an insert leaves
-- unset. A contract drops both triggers and functions (pending-contracts.tsv); the journal guards stay.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION grading_entries_number() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.revision IS NULL THEN
        -- Two graders saving at once take turns on the submission, so the second reads the first's number.
        PERFORM 1 FROM submissions WHERE id = NEW.submission_id FOR NO KEY UPDATE;
        SELECT COALESCE(max(revision), 0) + 1 INTO NEW.revision
          FROM grading_entries WHERE submission_id = NEW.submission_id;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION grading_entries_points() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.max_points IS NULL THEN
        SELECT v.max_points INTO NEW.max_points
          FROM submissions s JOIN assessment_versions v ON v.id = s.assessment_version_id
         WHERE s.id = NEW.submission_id;
        NEW.raw_points := points_of_percent(NEW.raw_score::numeric, NEW.max_points);
        NEW.final_points := points_of_percent(NEW.final_score::numeric, NEW.max_points);
    END IF;
    RETURN NEW;
END $$;
