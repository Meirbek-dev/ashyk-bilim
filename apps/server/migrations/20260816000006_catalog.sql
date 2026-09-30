-- Catalog: platform, courses, chapters, activities, blocks, collections,
-- updates, discussions, certifications, authorship.
--
-- Cleanups vs the legacy schema (Q13 mandate; inventory 2026-08-16):
--   * uuidv7 PKs; legacy_uuid columns keep the old public identifiers for ETL
--     mapping and optional redirects.
--   * learnings/tags were JSON-encoded strings inside VARCHAR → real jsonb /
--     text[].
--   * activity type↔subtype validity was Pydantic-only → CHECK constraint.
--   * blocks belonged to a nullable (course, chapter, activity) trio → they
--     belong to an activity, NOT NULL.
--   * collection_courses allowed duplicates → composite PK (+ position).
--   * discussion like/dislike were two tables with no uniqueness → one
--     reactions table, one reaction per user per discussion.
--   * certificate issuance was duplicable → UNIQUE (certification, user).
--   * resource_authors used a polymorphic string uuid → two real FKs with an
--     exactly-one CHECK.
--   * FTS uses generated stored columns with the 'simple' config (content is
--     ru/kk — English stemming was wrong) + GIN.

CREATE TABLE platforms (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    -- Single-row table, enforced.
    singleton       boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    about           text NOT NULL DEFAULT '',
    email           text NOT NULL,
    label           text,
    logo_key        text,
    thumbnail_key   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER platforms_set_updated_at BEFORE UPDATE ON platforms
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE courses (
    id                   uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid          text UNIQUE,
    name                 text NOT NULL CHECK (char_length(name) <= 500),
    description          text NOT NULL DEFAULT '',
    about                text NOT NULL DEFAULT '',
    -- [{id, text, emoji, link?}] — typed serde enum on the Rust side.
    learnings            jsonb NOT NULL DEFAULT '[]'::jsonb,
    tags                 text[] NOT NULL DEFAULT '{}',
    thumbnail_type       text NOT NULL DEFAULT 'image'
                         CHECK (thumbnail_type IN ('image', 'video', 'both')),
    thumbnail_image_key  text,
    thumbnail_video_key  text,
    public               boolean NOT NULL DEFAULT false,
    open_to_contributors boolean NOT NULL DEFAULT false,
    creator_id           uuid REFERENCES users (id) ON DELETE SET NULL,
    search               tsvector GENERATED ALWAYS AS (
                             to_tsvector('simple',
                                 coalesce(name, '') || ' ' ||
                                 coalesce(description, '') || ' ' ||
                                 coalesce(about, ''))
                         ) STORED,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX courses_search_idx ON courses USING gin (search);
CREATE INDEX courses_public_idx ON courses (public, created_at DESC);

CREATE TABLE chapters (
    id             uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid    text UNIQUE,
    course_id      uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    name           text NOT NULL CHECK (char_length(name) <= 500),
    description    text NOT NULL DEFAULT '',
    thumbnail_key  text,
    -- 1-based contiguous per course (legacy semantics).
    position       integer NOT NULL DEFAULT 1,
    creator_id     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER chapters_set_updated_at BEFORE UPDATE ON chapters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX chapters_course_idx ON chapters (course_id, position);

CREATE TABLE activities (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid       text UNIQUE,
    chapter_id        uuid NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
    -- Denormalized for course-wide queries; kept consistent by the service
    -- (and NOT NULL, unlike the legacy nullable copy).
    course_id         uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    name              text NOT NULL CHECK (char_length(name) <= 500),
    activity_type     text NOT NULL,
    activity_sub_type text NOT NULL,
    -- Legacy enforced the type↔subtype map only in Pydantic; the DB does now.
    CONSTRAINT activities_type_subtype_valid CHECK (
        (activity_type, activity_sub_type) IN (
            ('dynamic',         'dynamic_page'),
            ('video',           'video_youtube'),
            ('video',           'video_hosted'),
            ('document',        'document_pdf'),
            ('document',        'document_doc'),
            ('exam',            'exam_standard'),
            ('code_challenge',  'code_general'),
            ('code_challenge',  'code_competitive'),
            ('file_submission', 'file_submission_standard'),
            ('custom',          'custom')
        )
    ),
    content           jsonb NOT NULL DEFAULT '{}'::jsonb,
    details           jsonb NOT NULL DEFAULT '{}'::jsonb,
    settings          jsonb NOT NULL DEFAULT '{}'::jsonb,
    published         boolean NOT NULL DEFAULT false,
    position          integer NOT NULL DEFAULT 1,
    creator_id        uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER activities_set_updated_at BEFORE UPDATE ON activities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX activities_chapter_idx ON activities (chapter_id, position);
CREATE INDEX activities_course_idx ON activities (course_id);

CREATE TABLE blocks (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid  text UNIQUE,
    activity_id  uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    block_type   text NOT NULL CHECK (block_type IN ('video', 'pdf', 'image', 'custom')),
    -- {file_key, file_format, file_name, file_size, file_type} — typed on the
    -- Rust side; file bytes live in object storage.
    content      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER blocks_set_updated_at BEFORE UPDATE ON blocks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX blocks_activity_idx ON blocks (activity_id);

CREATE TABLE collections (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid  text UNIQUE,
    name         text NOT NULL CHECK (char_length(name) <= 500),
    description  text NOT NULL DEFAULT '',
    public       boolean NOT NULL DEFAULT false,
    creator_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    search       tsvector GENERATED ALWAYS AS (
                     to_tsvector('simple',
                         coalesce(name, '') || ' ' || coalesce(description, ''))
                 ) STORED,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX collections_search_idx ON collections USING gin (search);

CREATE TABLE collection_courses (
    collection_id uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    course_id     uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    position      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, course_id)
);

CREATE TABLE course_updates (
    id                  uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid         text UNIQUE,
    course_id           uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    title               text NOT NULL,
    content             text NOT NULL,
    linked_activity_ids uuid[] NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER course_updates_set_updated_at BEFORE UPDATE ON course_updates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX course_updates_course_idx ON course_updates (course_id, created_at DESC);

CREATE TABLE course_discussions (
    id              uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid     text UNIQUE,
    course_id       uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    -- SET NULL (legacy CASCADE nuked whole threads when a user vanished);
    -- soft state lives in `status`.
    user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
    parent_id       uuid REFERENCES course_discussions (id) ON DELETE CASCADE,
    kind            text NOT NULL DEFAULT 'post' CHECK (kind IN ('post', 'reply')),
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'hidden', 'deleted')),
    content         text NOT NULL,
    likes_count     integer NOT NULL DEFAULT 0,
    dislikes_count  integer NOT NULL DEFAULT 0,
    replies_count   integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER course_discussions_set_updated_at BEFORE UPDATE ON course_discussions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX course_discussions_course_idx ON course_discussions (course_id, created_at DESC);
CREATE INDEX course_discussions_parent_idx ON course_discussions (parent_id);

-- One reaction per user per discussion (legacy: two tables, duplicates possible).
CREATE TABLE discussion_reactions (
    discussion_id uuid NOT NULL REFERENCES course_discussions (id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reaction      text NOT NULL CHECK (reaction IN ('like', 'dislike')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (discussion_id, user_id)
);

CREATE TABLE certifications (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid  text UNIQUE,
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    config       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER certifications_set_updated_at BEFORE UPDATE ON certifications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX certifications_course_idx ON certifications (course_id);

CREATE TABLE certificate_users (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    certification_id uuid NOT NULL REFERENCES certifications (id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Public verification identifier (survives in /certificates/{code}/verify).
    verify_code      text NOT NULL UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    -- Duplicate issuance was possible in the legacy schema; not anymore.
    UNIQUE (certification_id, user_id)
);
CREATE TRIGGER certificate_users_set_updated_at BEFORE UPDATE ON certificate_users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE resource_authors (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id     uuid REFERENCES courses (id) ON DELETE CASCADE,
    collection_id uuid REFERENCES collections (id) ON DELETE CASCADE,
    CONSTRAINT resource_authors_exactly_one_target
        CHECK (num_nonnulls(course_id, collection_id) = 1),
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    authorship    text NOT NULL
                  CHECK (authorship IN ('creator', 'contributor', 'maintainer', 'reporter')),
    status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'pending', 'inactive')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resource_authors_unique_per_target
        UNIQUE NULLS NOT DISTINCT (course_id, collection_id, user_id)
);
CREATE TRIGGER resource_authors_set_updated_at BEFORE UPDATE ON resource_authors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
