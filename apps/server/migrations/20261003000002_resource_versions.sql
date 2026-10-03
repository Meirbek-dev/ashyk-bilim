-- S-04: one optimistic-lock `version` on every resource the new web edits.
-- A trigger bumps it on any real change (so no write path can forget to),
-- the API answers it as `version` + `ETag` and an `If-Match` that no longer
-- matches is 412. Collections and activities keep their explicit bumps.
--
-- Fires before `*_set_updated_at` (trigger names sort `bump` < `set`), so a
-- no-op UPDATE (same values) does not count as a change. A statement that
-- bumps `version` itself is left alone.
CREATE FUNCTION bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version = OLD.version AND NEW IS DISTINCT FROM OLD THEN
        NEW.version = OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE courses ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER courses_bump_version BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE chapters ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER chapters_bump_version BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE course_updates ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER course_updates_bump_version BEFORE UPDATE ON course_updates
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE certifications ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER certifications_bump_version BEFORE UPDATE ON certifications
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE resource_authors ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER resource_authors_bump_version BEFORE UPDATE ON resource_authors
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE usergroups ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER usergroups_bump_version BEFORE UPDATE ON usergroups
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE roles ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER roles_bump_version BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE platforms ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER platforms_bump_version BEFORE UPDATE ON platforms
    FOR EACH ROW EXECUTE FUNCTION bump_version();

ALTER TABLE assessments ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TRIGGER assessments_bump_version BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION bump_version();

-- Item 5: announcements name their author. Older rows have none.
ALTER TABLE course_updates
    ADD COLUMN author_id uuid REFERENCES users (id) ON DELETE SET NULL;
