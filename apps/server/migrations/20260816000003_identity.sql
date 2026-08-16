-- Identity: users (credentials live in Zitadel — no password columns), roles,
-- permission grants, auth audit. Simplification vs legacy: grants are strings
-- on role_permissions validated by the typed parser in ab-core (the legacy
-- normalized `permissions` catalog table encoded what code already knows).
-- Display names are i18n keys; the legacy Russian strings become the ru-RU
-- catalog values during P9 sync.

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    zitadel_user_id  text NOT NULL UNIQUE,
    username         text NOT NULL UNIQUE,
    email            text NOT NULL UNIQUE,
    display_name     text NOT NULL DEFAULT '',
    bio              text NOT NULL DEFAULT '',
    avatar_key       text,
    locale           text NOT NULL DEFAULT 'ru-RU'
                     CHECK (locale IN ('ru-RU', 'kk-KZ', 'en-US')),
    status           text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'disabled')),
    -- Bumped on any role/permission change; sessions carrying an older value
    -- refresh their permission set (ARCHITECTURE §7).
    rbac_version     bigint NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    slug              text NOT NULL UNIQUE,
    display_name_key  text NOT NULL,
    description_key   text NOT NULL,
    priority          integer NOT NULL DEFAULT 0,
    is_system         boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE role_permissions (
    role_id     uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission  text NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE user_roles (
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     uuid NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

-- Sessions live in Redis; this is the durable audit trail.
CREATE TABLE auth_audit_log (
    id          uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
    event       text NOT NULL,
    ip          inet,
    user_agent  text,
    metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_audit_log_user_idx ON auth_audit_log (user_id, created_at DESC);
CREATE INDEX auth_audit_log_event_idx ON auth_audit_log (event, created_at DESC);

-- ── System role seeds — verbatim port of SYSTEM_ROLES from
--    apps/api/src/db/permission_enums.py (priorities included). ──────────────

INSERT INTO roles (slug, display_name_key, description_key, priority, is_system) VALUES
    ('admin',      'roles.admin.name',      'roles.admin.description',      100, true),
    ('maintainer', 'roles.maintainer.name', 'roles.maintainer.description',  70, true),
    ('instructor', 'roles.instructor.name', 'roles.instructor.description',  50, true),
    ('moderator',  'roles.moderator.name',  'roles.moderator.description',   40, true),
    ('user',       'roles.user.name',       'roles.user.description',        10, true),
    ('guest',      'roles.guest.name',      'roles.guest.description',        0, true);

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
JOIN (VALUES
    ('admin', '*:*:*'),

    ('maintainer', 'course:create:platform'),
    ('maintainer', 'course:read:all'),
    ('maintainer', 'course:update:platform'),
    ('maintainer', 'course:delete:own'),
    ('maintainer', 'course:manage:own'),
    ('maintainer', 'chapter:*:platform'),
    ('maintainer', 'activity:*:platform'),
    ('maintainer', 'quiz:*:platform'),
    ('maintainer', 'exam:*:platform'),
    ('maintainer', 'assessment:*:platform'),
    ('maintainer', 'collection:create:platform'),
    ('maintainer', 'collection:read:all'),
    ('maintainer', 'collection:update:own'),
    ('maintainer', 'collection:delete:own'),
    ('maintainer', 'discussion:moderate:platform'),
    ('maintainer', 'analytics:read:platform'),
    ('maintainer', 'certificate:create:own'),
    ('maintainer', 'certificate:read:own'),

    ('instructor', 'course:create:platform'),
    ('instructor', 'course:read:all'),
    ('instructor', 'course:update:own'),
    ('instructor', 'course:manage:own'),
    ('instructor', 'course:delete:own'),
    ('instructor', 'chapter:create:own'),
    ('instructor', 'chapter:read:all'),
    ('instructor', 'chapter:update:own'),
    ('instructor', 'chapter:delete:own'),
    ('instructor', 'activity:create:own'),
    ('instructor', 'activity:read:all'),
    ('instructor', 'activity:update:own'),
    ('instructor', 'activity:delete:own'),
    ('instructor', 'quiz:*:own'),
    ('instructor', 'quiz:read:assigned'),
    ('instructor', 'quiz:grade:own'),
    ('instructor', 'exam:*:own'),
    ('instructor', 'exam:read:assigned'),
    ('instructor', 'exam:grade:own'),
    ('instructor', 'assessment:*:own'),
    ('instructor', 'assessment:read:assigned'),
    ('instructor', 'assessment:grade:own'),
    ('instructor', 'collection:create:platform'),
    ('instructor', 'collection:read:all'),
    ('instructor', 'collection:update:own'),
    ('instructor', 'collection:delete:own'),
    ('instructor', 'collection:manage:own'),
    ('instructor', 'discussion:create:platform'),
    ('instructor', 'discussion:read:all'),
    ('instructor', 'discussion:update:own'),
    ('instructor', 'discussion:delete:own'),
    ('instructor', 'discussion:moderate:own'),
    ('instructor', 'analytics:read:assigned'),
    ('instructor', 'analytics:export:assigned'),
    ('instructor', 'user:read:platform'),
    ('instructor', 'user:read:own'),
    ('instructor', 'user:update:own'),
    ('instructor', 'usergroup:create:platform'),
    ('instructor', 'usergroup:read:platform'),
    ('instructor', 'usergroup:update:own'),
    ('instructor', 'usergroup:delete:own'),
    ('instructor', 'usergroup:manage:own'),
    ('instructor', 'trail:create:own'),
    ('instructor', 'trail:read:all'),
    ('instructor', 'trail:update:own'),
    ('instructor', 'trail:delete:own'),
    ('instructor', 'certificate:create:platform'),
    ('instructor', 'certificate:read:own'),
    ('instructor', 'certificate:update:own'),
    ('instructor', 'certificate:delete:own'),
    ('instructor', 'file:create:own'),
    ('instructor', 'file:read:all'),
    ('instructor', 'file:delete:own'),

    ('moderator', 'course:read:all'),
    ('moderator', 'discussion:moderate:platform'),
    ('moderator', 'discussion:read:all'),
    ('moderator', 'discussion:update:platform'),
    ('moderator', 'discussion:delete:platform'),
    ('moderator', 'user:read:platform'),

    ('user', 'course:read:all'),
    ('user', 'course:enroll:all'),
    ('user', 'chapter:read:all'),
    ('user', 'activity:read:all'),
    ('user', 'quiz:submit:assigned'),
    ('user', 'quiz:read:assigned'),
    ('user', 'exam:submit:assigned'),
    ('user', 'exam:read:assigned'),
    ('user', 'assessment:submit:assigned'),
    ('user', 'assessment:read:assigned'),
    ('user', 'collection:read:all'),
    ('user', 'discussion:create:platform'),
    ('user', 'discussion:read:all'),
    ('user', 'discussion:update:own'),
    ('user', 'discussion:delete:own'),
    ('user', 'user:read:platform'),
    ('user', 'user:read:own'),
    ('user', 'user:update:own'),
    ('user', 'usergroup:read:assigned'),
    ('user', 'trail:read:all'),
    ('user', 'trail:submit:assigned'),
    ('user', 'certificate:read:own'),
    ('user', 'file:create:own'),
    ('user', 'file:read:own'),
    ('user', 'file:delete:own'),

    ('guest', 'course:read:all'),
    ('guest', 'chapter:read:all'),
    ('guest', 'activity:read:all'),
    ('guest', 'collection:read:all'),
    ('guest', 'discussion:read:all'),
    ('guest', 'trail:read:all'),
    ('guest', 'user:read:platform')
) AS p (slug, permission) ON p.slug = r.slug;
