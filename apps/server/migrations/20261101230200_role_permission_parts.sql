-- Schema review item 19: is_course_staff split every permission string per
-- call, and it runs once per row in roster, analytics and grading queries.
-- The role branch does not depend on the course, yet a learner (the common
-- case: not staff) paid for a join of their roles with every permission of
-- those roles and three split_part calls per permission.
--
-- The parts are stored columns now (the same split the Rust Grant parser
-- does), the string shape is checked, and the staff-granting rows have
-- their own partial index: the role branch is one probe of user_roles plus
-- one probe of a tiny index per role.

ALTER TABLE role_permissions
    ADD COLUMN resource text GENERATED ALWAYS AS (split_part(permission, ':', 1)) STORED,
    ADD COLUMN action text GENERATED ALWAYS AS (split_part(permission, ':', 2)) STORED,
    ADD COLUMN scope text GENERATED ALWAYS AS (split_part(permission, ':', 3)) STORED;

-- `resource:action` or `resource:action:scope` (ab_core::permission::Grant).
SELECT schema_try_check('role_permissions', 'role_permissions_permission_check',
    $$permission ~ '^[a-z_*-]+:[a-z_*-]+(:[a-z_*-]+)?$'$$);

CREATE INDEX role_permissions_course_staff_idx ON role_permissions (role_id)
    WHERE resource IN ('*', 'assessment')
      AND action IN ('*', 'author')
      AND scope IN ('', '*', 'platform', 'all');

CREATE OR REPLACE FUNCTION is_course_staff(p_course uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM courses c WHERE c.id = p_course AND c.creator_id = p_user)
        OR EXISTS (SELECT 1 FROM resource_authors ra
                   WHERE ra.course_id = p_course AND ra.user_id = p_user
                     AND ra.status = 'active' AND ra.authorship <> 'reporter')
        OR EXISTS (SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
                   WHERE ur.user_id = p_user
                     AND rp.resource IN ('*', 'assessment')
                     AND rp.action IN ('*', 'author')
                     AND rp.scope IN ('', '*', 'platform', 'all'))
$$;
