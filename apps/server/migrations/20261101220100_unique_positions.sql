-- Schema review item 5: sibling positions are unique. Chapters in a course,
-- activities in a chapter, items in an assessment and courses in a
-- collection each get UNIQUE (parent, position) DEFERRABLE INITIALLY
-- DEFERRED: a reorder rewrites positions one row at a time inside one
-- transaction (renumber_* / set_collection_courses), so the check runs at
-- commit, when the order is whole again.
--
-- Repair first (deterministic): every parent whose positions are not
-- exactly 1..n is renumbered 1..n in the order readers already show
-- (position, id), so nothing visibly moves; ties and gaps (legacy
-- collection_courses rows all hold 0) are resolved. Bookkeeping: updated_at
-- stays.

SET LOCAL ab.bookkeeping = 'on';

WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY course_id ORDER BY position, id) AS n FROM chapters
)
UPDATE chapters c SET position = r.n FROM ranked r WHERE r.id = c.id AND c.position <> r.n;

WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY chapter_id ORDER BY position, id) AS n FROM activities
)
UPDATE activities a SET position = r.n FROM ranked r WHERE r.id = a.id AND a.position <> r.n;

WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY assessment_id ORDER BY position, id) AS n
    FROM assessment_items
)
UPDATE assessment_items i SET position = r.n FROM ranked r WHERE r.id = i.id AND i.position <> r.n;

WITH ranked AS (
    SELECT collection_id, course_id,
           row_number() OVER (PARTITION BY collection_id ORDER BY position, course_id) AS n
    FROM collection_courses
)
UPDATE collection_courses cc SET position = r.n
FROM ranked r
WHERE r.collection_id = cc.collection_id AND r.course_id = cc.course_id AND cc.position <> r.n;

ALTER TABLE chapters ADD CONSTRAINT chapters_position_key
    UNIQUE (course_id, position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE activities ADD CONSTRAINT activities_position_key
    UNIQUE (chapter_id, position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE assessment_items ADD CONSTRAINT assessment_items_position_key
    UNIQUE (assessment_id, position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE collection_courses ADD CONSTRAINT collection_courses_position_key
    UNIQUE (collection_id, position) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE chapters ADD CONSTRAINT chapters_position_check CHECK (position >= 1);
ALTER TABLE activities ADD CONSTRAINT activities_position_check CHECK (position >= 1);
ALTER TABLE assessment_items ADD CONSTRAINT assessment_items_position_check CHECK (position >= 1);
ALTER TABLE collection_courses ADD CONSTRAINT collection_courses_position_check CHECK (position >= 1);
