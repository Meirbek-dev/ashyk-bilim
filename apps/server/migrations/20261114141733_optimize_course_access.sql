-- Bulk reads must let the planner combine access checks with their other joins and filters.
-- Keep the exact staff/visibility rules; no roster or permission data changes.
SET LOCAL lock_timeout = '5s';

-- These are the two halves of is_course_staff. Writing their EXISTS predicates in the view lets
-- PostgreSQL use anti joins instead of executing SQL functions once for every enrolment.
CREATE OR REPLACE VIEW learning.course_members AS
    SELECT e.course_id, e.user_id, e.enrolled_at
    FROM enrolments e
    WHERE NOT EXISTS (
        SELECT 1 FROM course_staff cs
        WHERE cs.course_id = e.course_id AND cs.user_id = e.user_id
          AND cs.status = 'active' AND cs.authorship <> 'reporter'
    )
    AND NOT EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = e.user_id
          AND rp.resource IN ('*', 'assessment') AND rp.action IN ('*', 'author')
          AND rp.scope IN ('', '*', 'platform', 'all')
    );

-- Keep subqueries out of course_visible itself: its cheap public/owner/platform branches can then
-- be inlined and short-circuit before the shared-course lookup runs.
CREATE FUNCTION public.course_shared_with(p_course uuid, p_viewer uuid, p_archived boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM course_staff cs
                   WHERE cs.course_id = p_course AND cs.user_id = p_viewer AND cs.status = 'active')
        OR EXISTS (SELECT 1 FROM usergroup_courses uc
                   JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                   WHERE uc.course_id = p_course AND m.user_id = p_viewer)
        OR (p_archived AND EXISTS (SELECT 1 FROM enrolments e
                                  WHERE e.course_id = p_course AND e.user_id = p_viewer))
$$;
CREATE OR REPLACE FUNCTION public.course_visible(c courses, p_viewer uuid, p_see_all boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT c.deleted_at IS NULL AND (
        c.public OR p_see_all OR c.creator_id = p_viewer
        OR course_shared_with(c.id, p_viewer, c.archived_at IS NOT NULL))
$$;

COMMENT ON FUNCTION public.course_shared_with(uuid, uuid, boolean) IS
    'The relational part of course_visible: active staff, audience groups, or an archived enrolment.';
