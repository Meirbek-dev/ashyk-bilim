-- BUG-287: a course's staff never hold a trail run. `is_course_staff` is the
-- `is_teacher_preview` rule in SQL (as 20260924000004 reads it): the course
-- creator, an active non-reporter resource author, or a holder of
-- `assessment:author:platform` (wildcards included, as `Grant::grants` reads
-- them). Every member set (analytics, gradebook) excludes it, so a learner
-- who later joins the staff drops out too.
CREATE FUNCTION is_course_staff(p_course uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM courses c WHERE c.id = p_course AND c.creator_id = p_user)
        OR EXISTS (SELECT 1 FROM resource_authors ra
                   WHERE ra.course_id = p_course AND ra.user_id = p_user
                     AND ra.status = 'active' AND ra.authorship <> 'reporter')
        OR EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                   WHERE ur.user_id = p_user
                     AND split_part(rp.permission, ':', 1) IN ('*', 'assessment')
                     AND split_part(rp.permission, ':', 2) IN ('*', 'author')
                     AND split_part(rp.permission, ':', 3) IN ('', '*', 'platform', 'all'))
$$;

-- One-time cleanup: staff runs made before the enrol door refused staff
-- (steps cascade), the progress derived from them, and the allowlist /
-- override rows a leave would drop (BUG-281).
CREATE TEMP TABLE bug287_staff ON COMMIT DROP AS
SELECT course_id, user_id FROM trail_runs WHERE is_course_staff(course_id, user_id);

DELETE FROM trail_runs r USING bug287_staff s
WHERE r.course_id = s.course_id AND r.user_id = s.user_id;
DELETE FROM activity_progress p USING bug287_staff s
WHERE p.course_id = s.course_id AND p.user_id = s.user_id;
DELETE FROM course_progress p USING bug287_staff s
WHERE p.course_id = s.course_id AND p.user_id = s.user_id;
DELETE FROM assessment_access_users x USING assessments a, bug287_staff s
WHERE x.assessment_id = a.id AND a.course_id = s.course_id AND x.user_id = s.user_id;
DELETE FROM assessment_overrides x USING assessments a, bug287_staff s
WHERE x.assessment_id = a.id AND a.course_id = s.course_id AND x.user_id = s.user_id;
