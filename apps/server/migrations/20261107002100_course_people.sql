-- Who is in a course, said once (schema review 25, 26, 27, 28).
--
-- The creator becomes an ordinary roster row. `courses.creator_id` stays what the row says about history; new code
-- reads the roster. is_course_staff keeps its answer: the creator clause goes with a later release, once every
-- course has its row, and BUG-287 (a platform author is never enrolled) stays. Its two halves get names, so a
-- caller can ask what it means: a role in this course, or a right over every course.

SET LOCAL lock_timeout = '5s';

INSERT INTO course_staff (course_id, user_id, authorship, status)
SELECT id, creator_id, 'creator', 'active' FROM courses WHERE creator_id IS NOT NULL
ON CONFLICT (course_id, user_id) DO NOTHING;

CREATE FUNCTION has_course_role(p_course uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM courses c WHERE c.id = p_course AND c.creator_id = p_user)
        OR EXISTS (SELECT 1 FROM course_staff cs
                   WHERE cs.course_id = p_course AND cs.user_id = p_user
                     AND cs.status = 'active' AND cs.authorship <> 'reporter')
$$;
COMMENT ON FUNCTION has_course_role(uuid, uuid) IS
    'The user teaches this course: its creator, or an active roster row above reporter.';

CREATE FUNCTION is_platform_author(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                   WHERE ur.user_id = p_user
                     AND rp.resource IN ('*', 'assessment')
                     AND rp.action IN ('*', 'author')
                     AND rp.scope IN ('', '*', 'platform', 'all'))
$$;
COMMENT ON FUNCTION is_platform_author(uuid) IS
    'The user may author assessments on every course through a platform role. Granting the role changes every roster.';

CREATE OR REPLACE FUNCTION is_course_staff(p_course uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT has_course_role(p_course, p_user) OR is_platform_author(p_user)
$$;

CREATE VIEW learning.course_members AS
    SELECT e.course_id, e.user_id, e.enrolled_at
    FROM enrolments e
    WHERE NOT is_course_staff(e.course_id, e.user_id);
COMMENT ON VIEW learning.course_members IS
    'Learners of a course: enrolments without its staff, whose stale rows stay in enrolments.';

CREATE VIEW learning.learner_visible_activities AS
    SELECT a.id AS activity_id, a.course_id
    FROM activities a
    WHERE a.published
      AND NOT EXISTS (SELECT 1 FROM file_submissions f
                      WHERE f.activity_id = a.id AND f.lifecycle <> 'published')
      AND NOT EXISTS (SELECT 1 FROM assessments s
                      WHERE s.activity_id = a.id AND s.lifecycle <> 'published');
COMMENT ON VIEW learning.learner_visible_activities IS
    'Activities a learner may open: the one statement of what the three publication flags mean together.';
