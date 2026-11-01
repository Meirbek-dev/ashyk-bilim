-- An assessment's title and kind are its activity's (schema review 2, item 5).
--
-- `assessments.title` / `assessments.kind` copied `activities.name` /
-- `activity_type` (1:1 through UNIQUE activity_id) and the code kept them in
-- step by hand (UX-112/UX-120). This release reads both from the activity
-- and writes neither; the contract migration drops the copies.
--
-- Expand step: the previous release still reads and writes them, so the
-- copies are kept right here - filled from the activity on every insert and
-- update of an assessment, and rewritten when the activity is renamed.
-- Existing rows are re-synced once (they already agree unless a past bug
-- left them apart; the activity's name is the one the curriculum shows).
--
-- The kind is read from `activities.activity_type` from now on, so the two
-- may never disagree: a mismatch stops this deploy (nothing is guessed), and
-- an activity with an assessment cannot change its type (the curriculum
-- already refuses that with 409; now the database does too).

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM assessments s JOIN activities a ON a.id = s.activity_id
               WHERE s.kind <> a.activity_type) THEN
        RAISE EXCEPTION 'an assessment''s kind differs from its activity''s type; fix the rows first';
    END IF;
END;
$$;

CREATE FUNCTION activities_keep_assessment_type() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM assessments WHERE activity_id = NEW.id) THEN
        RAISE EXCEPTION 'the activity has an assessment attached; its type cannot change'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER activities_keep_assessment_type BEFORE UPDATE OF activity_type ON activities
    FOR EACH ROW WHEN (OLD.activity_type IS DISTINCT FROM NEW.activity_type)
    EXECUTE FUNCTION activities_keep_assessment_type();

-- Filled from the activity on every write (the previous release still
-- sends its own values; the activity's win).
CREATE FUNCTION assessments_copy_activity_name() RETURNS trigger AS $$
DECLARE
    act record;
BEGIN
    SELECT a.name, a.activity_type INTO act FROM activities a WHERE a.id = NEW.activity_id;
    IF FOUND THEN
        NEW.title := act.name;
        NEW.kind := act.activity_type;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER assessments_copy_activity_name BEFORE INSERT OR UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION assessments_copy_activity_name();

CREATE FUNCTION activities_rename_assessment() RETURNS trigger AS $$
BEGIN
    -- The BEFORE trigger above copies the values; this only touches the row.
    UPDATE assessments SET title = NEW.name
    WHERE activity_id = NEW.id AND title IS DISTINCT FROM NEW.name;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER activities_rename_assessment AFTER UPDATE OF name ON activities
    FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
    EXECUTE FUNCTION activities_rename_assessment();

-- data-fix: one deterministic re-sync of the title from the activity
-- (bookkeeping: updated_at keeps the last real edit).
SET LOCAL ab.bookkeeping = 'on';
UPDATE assessments s SET title = a.name
FROM activities a
WHERE a.id = s.activity_id AND s.title IS DISTINCT FROM a.name;
