-- BUG-190: ONE course-visibility predicate. Catalogue listing, search,
-- collection listing / contents and direct reads all decide «can this
-- viewer see this course» here: public, platform manager (p_see_all), the
-- creator, an active resource_authors row (any authorship), or membership
-- of a usergroup linked to the course (cohort access). Inlinable SQL —
-- callers pass the row: course_visible(courses, $viewer, $see_all).
CREATE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM resource_authors ra
                 WHERE ra.course_id = c.id AND ra.user_id = p_viewer AND ra.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
$$;

-- collection_listable (UX-127) now shares it, so a public collection whose
-- only course is usergroup-shared is listable / searchable for the member.
CREATE OR REPLACE FUNCTION collection_listable(p_collection uuid, p_viewer uuid, p_see_all_courses boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_see_all_courses
      OR EXISTS (SELECT 1 FROM collections WHERE id = p_collection AND creator_id = p_viewer)
      OR EXISTS (SELECT 1 FROM collection_courses cc
                 JOIN courses c ON c.id = cc.course_id
                 WHERE cc.collection_id = p_collection
                   AND course_visible(c, p_viewer, p_see_all_courses))
$$;
