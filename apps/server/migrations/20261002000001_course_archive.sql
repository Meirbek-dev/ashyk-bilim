-- Course archiving (docs/COURSE_ARCHIVING.md): a frozen, undiscoverable
-- course that keeps every row. Orthogonal to `public`.
ALTER TABLE courses
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN archived_by uuid REFERENCES users (id) ON DELETE SET NULL;

-- Archived courses stay readable for the learners who enrolled in them,
-- even when the course is private (archive must not hide history). The
-- new arm fires for archived courses only, so unpublished courses keep
-- hiding from their learners (BUG-183).
CREATE OR REPLACE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM resource_authors ra
                 WHERE ra.course_id = c.id AND ra.user_id = p_viewer AND ra.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
      OR (c.archived_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM trail_runs tr
                      WHERE tr.course_id = c.id AND tr.user_id = p_viewer))
$$;

-- An archived course does not make a collection listable.
CREATE OR REPLACE FUNCTION collection_listable(p_collection uuid, p_viewer uuid, p_see_all_courses boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_see_all_courses
      OR EXISTS (SELECT 1 FROM collections WHERE id = p_collection AND creator_id = p_viewer)
      OR EXISTS (SELECT 1 FROM collection_courses cc
                 JOIN courses c ON c.id = cc.course_id
                 WHERE cc.collection_id = p_collection
                   AND c.archived_at IS NULL
                   AND course_visible(c, p_viewer, p_see_all_courses))
$$;
