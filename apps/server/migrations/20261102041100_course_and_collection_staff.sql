-- resource_authors (a course XOR a collection in one table) -> course_staff + collection_staff
-- (schema review item 21).
--
-- One table per target gives each a real primary key (target, user) instead of a
-- UNIQUE NULLS NOT DISTINCT over a nullable pair, and plain foreign keys instead of an
-- exactly-one CHECK. Columns, values and versions are unchanged; the API reads course_staff.
-- No code writes collection staff today: collection_staff keeps the imported rows.
--
-- Expand: the previous release reads and writes resource_authors. Until the contract
-- (20261103040100) drops it, triggers mirror every write in both directions (the copy made by
-- one trigger does not fire the other back: pg_trigger_depth() > 1), so either release sees
-- the same staff. The SQL helpers (course_visible, is_course_staff) read course_staff now.

SET LOCAL lock_timeout = '5s';

CREATE TABLE course_staff (
    course_id   uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    authorship  text NOT NULL CHECK (authorship IN ('creator', 'contributor', 'maintainer', 'reporter')),
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive')),
    version     integer NOT NULL DEFAULT 1,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, user_id)
);
-- `GET /courses?mine=true`, the work queue and analytics look staff up by user.
CREATE INDEX course_staff_user_idx ON course_staff (user_id, course_id);
CREATE TRIGGER course_staff_bump_version BEFORE UPDATE ON course_staff
    FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER course_staff_set_updated_at BEFORE UPDATE ON course_staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE collection_staff (
    collection_id uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    authorship    text NOT NULL CHECK (authorship IN ('creator', 'contributor', 'maintainer', 'reporter')),
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive')),
    version       integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, user_id)
);
CREATE INDEX collection_staff_user_idx ON collection_staff (user_id);
CREATE TRIGGER collection_staff_bump_version BEFORE UPDATE ON collection_staff
    FOR EACH ROW EXECUTE FUNCTION bump_version();
CREATE TRIGGER collection_staff_set_updated_at BEFORE UPDATE ON collection_staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO course_staff (course_id, user_id, authorship, status, version, created_at, updated_at)
SELECT course_id, user_id, authorship, status, version, created_at, updated_at
  FROM resource_authors WHERE course_id IS NOT NULL;
INSERT INTO collection_staff (collection_id, user_id, authorship, status, version, created_at, updated_at)
SELECT collection_id, user_id, authorship, status, version, created_at, updated_at
  FROM resource_authors WHERE collection_id IS NOT NULL;

-- Old table -> new tables (writes of the previous release).
CREATE FUNCTION resource_authors_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        DELETE FROM course_staff WHERE course_id = OLD.course_id AND user_id = OLD.user_id;
        DELETE FROM collection_staff WHERE collection_id = OLD.collection_id AND user_id = OLD.user_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.course_id IS NOT NULL THEN
            INSERT INTO course_staff (course_id, user_id, authorship, status, version, created_at, updated_at)
            VALUES (NEW.course_id, NEW.user_id, NEW.authorship, NEW.status, NEW.version,
                    NEW.created_at, NEW.updated_at);
        ELSE
            INSERT INTO collection_staff (collection_id, user_id, authorship, status, version,
                                          created_at, updated_at)
            VALUES (NEW.collection_id, NEW.user_id, NEW.authorship, NEW.status, NEW.version,
                    NEW.created_at, NEW.updated_at);
        END IF;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER resource_authors_mirror AFTER INSERT OR UPDATE OR DELETE ON resource_authors
    FOR EACH ROW EXECUTE FUNCTION resource_authors_mirror();

-- New table -> old table (so a rolled-back release still sees today's staff).
CREATE FUNCTION course_staff_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'DELETE' THEN
        DELETE FROM resource_authors WHERE course_id = OLD.course_id AND user_id = OLD.user_id;
    ELSIF TG_OP = 'UPDATE' AND (OLD.course_id, OLD.user_id) = (NEW.course_id, NEW.user_id) THEN
        UPDATE resource_authors
           SET authorship = NEW.authorship, status = NEW.status, version = NEW.version,
               updated_at = NEW.updated_at
         WHERE course_id = NEW.course_id AND user_id = NEW.user_id;
    ELSE
        IF TG_OP = 'UPDATE' THEN
            DELETE FROM resource_authors WHERE course_id = OLD.course_id AND user_id = OLD.user_id;
        END IF;
        INSERT INTO resource_authors (course_id, user_id, authorship, status, version, created_at, updated_at)
        VALUES (NEW.course_id, NEW.user_id, NEW.authorship, NEW.status, NEW.version,
                NEW.created_at, NEW.updated_at)
        ON CONFLICT ON CONSTRAINT resource_authors_unique_per_target DO UPDATE
           SET authorship = EXCLUDED.authorship, status = EXCLUDED.status,
               version = EXCLUDED.version, updated_at = EXCLUDED.updated_at;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER course_staff_mirror AFTER INSERT OR UPDATE OR DELETE ON course_staff
    FOR EACH ROW EXECUTE FUNCTION course_staff_mirror();

CREATE OR REPLACE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM course_staff cs
                 WHERE cs.course_id = c.id AND cs.user_id = p_viewer AND cs.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
      OR (c.archived_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM trail_runs tr
                      WHERE tr.course_id = c.id AND tr.user_id = p_viewer))
$function$;

CREATE OR REPLACE FUNCTION is_course_staff(p_course uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
    SELECT EXISTS (SELECT 1 FROM courses c WHERE c.id = p_course AND c.creator_id = p_user)
        OR EXISTS (SELECT 1 FROM course_staff cs
                   WHERE cs.course_id = p_course AND cs.user_id = p_user
                     AND cs.status = 'active' AND cs.authorship <> 'reporter')
        OR EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                   WHERE ur.user_id = p_user
                     AND rp.resource IN ('*', 'assessment')
                     AND rp.action IN ('*', 'author')
                     AND rp.scope IN ('', '*', 'platform', 'all'))
$function$;
