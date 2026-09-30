-- UX-127: one listing rule for /collections and /search. A collection is
-- listed for a viewer when the viewer sees every course, created it, or at
-- least one attached course is visible to them — so a collection with no
-- visible course (UX-119) or no course at all is its creator's alone.
CREATE FUNCTION collection_listable(p_collection uuid, p_viewer uuid, p_see_all_courses boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_see_all_courses
      OR EXISTS (SELECT 1 FROM collections WHERE id = p_collection AND creator_id = p_viewer)
      OR EXISTS (SELECT 1 FROM collection_courses cc
                 JOIN courses c ON c.id = cc.course_id
                 WHERE cc.collection_id = p_collection
                   AND (c.public OR c.creator_id = p_viewer
                        OR EXISTS (SELECT 1 FROM resource_authors ra
                                   WHERE ra.course_id = c.id AND ra.user_id = p_viewer
                                     AND ra.status = 'active')))
$$;
