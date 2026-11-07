-- The creator's roster row is the rule now (schema review 26, 27): 20261107002100 gave every course one and every
-- writer since keeps it, so has_course_role reads the roster alone. courses.creator_id says who owns the course.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION has_course_role(p_course uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM course_staff cs
                   WHERE cs.course_id = p_course AND cs.user_id = p_user
                     AND cs.status = 'active' AND cs.authorship <> 'reporter')
$$;
COMMENT ON FUNCTION has_course_role(uuid, uuid) IS
    'The user teaches this course: an active roster row above reporter (the creator has one).';
