-- Grade journals guard their whole row (schema review 2, items 11-12).
--
-- file_grading_entries was declared append-only but had no guard: any
-- statement could rewrite or delete a past grade. It now refuses every
-- UPDATE and every DELETE except the cascade from its attempt (the same
-- "parent already gone" test grading_entries uses).
--
-- grading_entries_guard listed its frozen columns by name, so a new column
-- would have been silently mutable. It now compares the whole row minus the
-- one mutable column (published_at).

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION grading_entries_guard() RETURNS trigger AS $$
BEGIN
    IF to_jsonb(NEW) - 'published_at' IS DISTINCT FROM to_jsonb(OLD) - 'published_at' THEN
        RAISE EXCEPTION 'grading_entries rows are immutable except published_at'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION file_grading_entries_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'file_grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER file_grading_entries_immutable BEFORE UPDATE ON file_grading_entries
    FOR EACH ROW EXECUTE FUNCTION file_grading_entries_immutable();

CREATE FUNCTION file_grading_entries_no_delete() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM file_submission_attempts WHERE id = OLD.attempt_id) THEN
        RAISE EXCEPTION 'file_grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER file_grading_entries_append_only BEFORE DELETE ON file_grading_entries
    FOR EACH ROW EXECUTE FUNCTION file_grading_entries_no_delete();
