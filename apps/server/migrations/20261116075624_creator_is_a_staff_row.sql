-- One copy of each fact, part 3 (REWRITE 5.8 item 4): who created a course or a collection is its staff row with
-- authorship 'creator', not `courses.creator_id` / `collections.creator_id`. Every course has had that row since
-- 20261107002100; collections get theirs here (no code wrote `collection_staff` before).
--
-- data-fix: the rows the one-creator keys (next two files) need. A course's or collection's `creator_id` gets an
-- active creator row; a row the creator already held under another authorship becomes that row; a creator row of
-- anyone else becomes a maintainer row (it keeps its access, the listing now shows it).
--
-- Switch release: the server reads the creator from the staff row and writes that row itself. It still writes
-- `creator_id` on insert, which the previous release reads. That release creates collections without a staff row,
-- and SQL outside the server (tests, psql) inserts courses with `creator_id` only: the insert triggers below give such
-- a row its creator row. Contract (pending-contracts.tsv): drop the triggers, then `creator_id` a release after the
-- server stops writing it.
SET LOCAL lock_timeout = '5s';

INSERT INTO course_staff (course_id, user_id, authorship, status)
SELECT c.id, c.creator_id, 'creator', 'active' FROM courses c WHERE c.creator_id IS NOT NULL
ON CONFLICT (course_id, user_id) DO UPDATE SET authorship = 'creator', status = 'active'
    WHERE course_staff.authorship <> 'creator' OR course_staff.status <> 'active';
UPDATE course_staff s SET authorship = 'maintainer'
FROM courses c
WHERE c.id = s.course_id AND s.authorship = 'creator' AND s.user_id IS DISTINCT FROM c.creator_id;

INSERT INTO collection_staff (collection_id, user_id, authorship, status)
SELECT c.id, c.creator_id, 'creator', 'active' FROM collections c WHERE c.creator_id IS NOT NULL
ON CONFLICT (collection_id, user_id) DO UPDATE SET authorship = 'creator', status = 'active'
    WHERE collection_staff.authorship <> 'creator' OR collection_staff.status <> 'active';
UPDATE collection_staff s SET authorship = 'maintainer'
FROM collections c
WHERE c.id = s.collection_id AND s.authorship = 'creator' AND s.user_id IS DISTINCT FROM c.creator_id;

-- The creator of a course / a collection: its staff row with authorship 'creator' (one per target, the unique
-- partial indexes of the next two files).
CREATE FUNCTION course_creator(p_course uuid) RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
RETURN (SELECT s.user_id FROM course_staff s WHERE s.course_id = p_course AND s.authorship = 'creator');
CREATE FUNCTION collection_creator(p_collection uuid) RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
RETURN (SELECT s.user_id FROM collection_staff s WHERE s.collection_id = p_collection AND s.authorship = 'creator');

-- For writers that name only creator_id (the previous release's collections): the creator row.
CREATE FUNCTION courses_creator_row() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    INSERT INTO course_staff (course_id, user_id, authorship, status)
    VALUES (NEW.id, NEW.creator_id, 'creator', 'active')
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER courses_creator_row AFTER INSERT ON courses
    FOR EACH ROW WHEN (NEW.creator_id IS NOT NULL) EXECUTE FUNCTION courses_creator_row();
CREATE FUNCTION collections_creator_row() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    INSERT INTO collection_staff (collection_id, user_id, authorship, status)
    VALUES (NEW.id, NEW.creator_id, 'creator', 'active')
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER collections_creator_row AFTER INSERT ON collections
    FOR EACH ROW WHEN (NEW.creator_id IS NOT NULL) EXECUTE FUNCTION collections_creator_row();

-- The creator's row is active staff, so course_shared_with already lets them see the course.
CREATE OR REPLACE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT c.deleted_at IS NULL AND (
        c.public OR p_see_all OR course_shared_with(c.id, p_viewer, c.archived_at IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION collection_listable(p_collection uuid, p_viewer uuid, p_see_all_courses boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_see_all_courses
      OR EXISTS (SELECT 1 FROM collection_staff s
                 WHERE s.collection_id = p_collection AND s.user_id = p_viewer AND s.authorship = 'creator')
      OR EXISTS (SELECT 1 FROM collection_courses cc
                 JOIN courses c ON c.id = cc.course_id
                 WHERE cc.collection_id = p_collection
                   AND c.archived_at IS NULL
                   AND course_visible(c, p_viewer, p_see_all_courses))
$$;
