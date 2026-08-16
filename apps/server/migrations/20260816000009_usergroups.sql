-- Usergroups (cohorts): named member sets linkable to courses. Legacy's
-- usergroup_resources held loose course uuids; here membership and course
-- links are real FKs that cascade.

CREATE TABLE usergroups (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid text UNIQUE,
    name        text NOT NULL CHECK (char_length(name) <= 500),
    description text NOT NULL DEFAULT '',
    creator_id  uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER usergroups_set_updated_at BEFORE UPDATE ON usergroups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE usergroup_members (
    usergroup_id uuid NOT NULL REFERENCES usergroups (id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usergroup_id, user_id)
);
CREATE INDEX usergroup_members_user_idx ON usergroup_members (user_id);

CREATE TABLE usergroup_courses (
    usergroup_id uuid NOT NULL REFERENCES usergroups (id) ON DELETE CASCADE,
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usergroup_id, course_id)
);
CREATE INDEX usergroup_courses_course_idx ON usergroup_courses (course_id);
