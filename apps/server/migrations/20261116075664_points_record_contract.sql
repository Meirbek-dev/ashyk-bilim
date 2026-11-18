-- Points as the record, contract (REWRITE 5.8 item 10, review note n16).
-- contract: 20261116075663 writes points only; its triggers turned the release before's percentages into points,
-- and that release no longer runs. This file drops them and their helpers and makes the percentages columns
-- generated from the points by the one rule, `percent_of_points` (a table rewrite of `submissions` and
-- `grading_entries`): no writer can store a percentage of its own again.
SET LOCAL lock_timeout = '5s';

DROP TRIGGER submissions_points ON submissions;
DROP TRIGGER grading_entries_points ON grading_entries;
DROP FUNCTION submissions_points();
DROP FUNCTION grading_entries_points();
DROP FUNCTION breakdown_in_points(jsonb, jsonb, numeric);
DROP FUNCTION entry_override_points(jsonb, numeric, numeric);
DROP FUNCTION breakdown_item_percent(jsonb);
DROP FUNCTION submission_item_points(uuid, uuid);
DROP FUNCTION submission_max_points(uuid, uuid);
DROP FUNCTION json_number(jsonb);

-- Every entry has its points since the switch (its data fix wrote them for the entries before). The check named
-- `final_score`, which the column swap below would drop with it.
ALTER TABLE grading_entries
    DROP CONSTRAINT grading_entries_points_check,
    ALTER COLUMN max_points SET NOT NULL,
    ALTER COLUMN raw_points SET NOT NULL,
    ADD CONSTRAINT grading_entries_points_check CHECK (raw_points <= max_points
                                                       AND (final_points IS NULL OR final_points <= max_points));

-- The journal check follows the points alone (the percentage can no longer be updated).
DROP TRIGGER submissions_current_grade ON submissions;

ALTER TABLE submissions
    DROP COLUMN auto_score,
    DROP COLUMN final_score,
    ADD COLUMN auto_score percent GENERATED ALWAYS AS (percent_of_points(auto_points, max_points)) STORED,
    ADD COLUMN final_score percent GENERATED ALWAYS AS (percent_of_points(final_points, max_points)) STORED;
ALTER TABLE grading_entries
    DROP COLUMN raw_score,
    DROP COLUMN final_score,
    ADD COLUMN raw_score percent NOT NULL GENERATED ALWAYS AS (percent_of_points(raw_points, max_points)) STORED,
    ADD COLUMN final_score percent GENERATED ALWAYS AS (percent_of_points(final_points, max_points)) STORED;
COMMENT ON COLUMN submissions.auto_score IS 'percent_of_points(auto_points, max_points), generated.';
COMMENT ON COLUMN submissions.final_score IS 'percent_of_points(final_points, max_points), generated.';
COMMENT ON COLUMN grading_entries.raw_score IS 'percent_of_points(raw_points, max_points), generated.';
COMMENT ON COLUMN grading_entries.final_score IS 'percent_of_points(final_points, max_points), generated.';

-- A BEFORE trigger sees a stored generated column unset (NULL) in NEW: the journal guard compares the points
-- the percentages are generated from, not the percentages.
CREATE OR REPLACE FUNCTION grading_entries_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    free constant text[] := ARRAY['published_at', 'graded_by', 'raw_score', 'final_score'];
BEGIN
    IF to_jsonb(NEW) - free IS DISTINCT FROM to_jsonb(OLD) - free
       OR (NEW.graded_by IS DISTINCT FROM OLD.graded_by AND NEW.graded_by IS NOT NULL) THEN
        RAISE EXCEPTION 'grading_entries rows are immutable except published_at'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER submissions_current_grade AFTER UPDATE OF final_points ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.final_points IS DISTINCT FROM NEW.final_points)
    EXECUTE FUNCTION submissions_current_grade_check();
