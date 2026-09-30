-- Assessments (P3.1). One assessment per assessment-typed activity.
--
-- Redesign vs legacy (docs/rewrite/DECISIONS.md, 2026-09-05):
--   * `assessment` + lazily-created `assessment_policy` (nullable back-link,
--     created inside GET handlers) collapse into ONE row — a policy always
--     exists, so no lazy writes on read paths.
--   * Every scalar the legacy stuffed into settings_json / anti_cheat_json /
--     late_policy_json is a real column with a CHECK, one canonical spelling.
--   * The access-policy indirection row is gone: `access_mode` lives on the
--     assessment, allowlists reference it directly.
--   * Quizzes get their own activity type pair (legacy parked them on
--     custom/custom and had no reverse mapping).

ALTER TABLE activities DROP CONSTRAINT activities_type_subtype_valid;
ALTER TABLE activities ADD CONSTRAINT activities_type_subtype_valid CHECK (
    (activity_type, activity_sub_type) IN (
        ('dynamic',         'dynamic_page'),
        ('video',           'video_youtube'),
        ('video',           'video_hosted'),
        ('document',        'document_pdf'),
        ('document',        'document_doc'),
        ('quiz',            'quiz_standard'),
        ('exam',            'exam_standard'),
        ('code_challenge',  'code_general'),
        ('code_challenge',  'code_competitive'),
        ('file_submission', 'file_submission_standard'),
        ('custom',          'custom')
    )
);

CREATE TABLE assessments (
    id                  uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid         text UNIQUE,
    activity_id         uuid NOT NULL UNIQUE REFERENCES activities (id) ON DELETE CASCADE,
    -- Denormalized from the activity for course-wide queries; the service
    -- keeps it consistent (activities may not move between courses).
    course_id           uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('quiz', 'exam', 'code_challenge')),
    title               text NOT NULL CHECK (char_length(title) <= 500),
    description         text NOT NULL DEFAULT '',

    -- Lifecycle (transitions enforced in the domain; auto-publish cron
    -- flips scheduled → published).
    lifecycle           text NOT NULL DEFAULT 'draft'
                        CHECK (lifecycle IN ('draft', 'scheduled', 'published', 'archived')),
    scheduled_at        timestamptz,
    published_at        timestamptz,
    archived_at         timestamptz,
    CONSTRAINT assessments_scheduled_needs_time
        CHECK (lifecycle <> 'scheduled' OR scheduled_at IS NOT NULL),

    weight              double precision NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
    grading_type        text NOT NULL DEFAULT 'percentage'
                        CHECK (grading_type IN ('numeric', 'percentage')),
    -- Bumped on any item change; submissions snapshot it (P4).
    content_version     integer NOT NULL DEFAULT 1,

    -- ── Policy (legacy assessment_policy, folded in) ────────────────────
    policy_version      integer NOT NULL DEFAULT 1,
    grading_mode        text NOT NULL
                        CHECK (grading_mode IN ('auto', 'manual', 'auto_then_manual')),
    grade_release_mode  text NOT NULL
                        CHECK (grade_release_mode IN ('immediate', 'batch')),
    completion_rule     text NOT NULL
                        CHECK (completion_rule IN
                               ('viewed', 'submitted', 'graded', 'passed', 'teacher_verified')),
    passing_score       double precision NOT NULL DEFAULT 60
                        CHECK (passing_score >= 0 AND passing_score <= 100),
    max_attempts        integer CHECK (max_attempts IS NULL OR max_attempts >= 1),
    time_limit_seconds  integer CHECK (time_limit_seconds IS NULL OR time_limit_seconds >= 1),
    due_at              timestamptz,
    allow_late          boolean NOT NULL DEFAULT true,
    late_policy_kind    text NOT NULL DEFAULT 'none'
                        CHECK (late_policy_kind IN ('none', 'penalty', 'cutoff')),
    late_penalty_percent_per_day double precision
                        CHECK (late_penalty_percent_per_day IS NULL
                               OR (late_penalty_percent_per_day >= 0
                                   AND late_penalty_percent_per_day <= 100)),
    late_penalty_max_days integer
                        CHECK (late_penalty_max_days IS NULL OR late_penalty_max_days >= 1),
    late_cutoff_at      timestamptz,
    CONSTRAINT assessments_late_policy_shape CHECK (
        (late_policy_kind = 'none'
            AND late_penalty_percent_per_day IS NULL
            AND late_penalty_max_days IS NULL
            AND late_cutoff_at IS NULL)
        OR (late_policy_kind = 'penalty'
            AND late_penalty_percent_per_day IS NOT NULL
            AND late_penalty_max_days IS NOT NULL
            AND late_cutoff_at IS NULL)
        OR (late_policy_kind = 'cutoff'
            AND late_cutoff_at IS NOT NULL
            AND late_penalty_percent_per_day IS NULL
            AND late_penalty_max_days IS NULL)
    ),

    -- ── Legacy settings_json scalars ────────────────────────────────────
    required            boolean NOT NULL DEFAULT false,
    review_visibility   text NOT NULL DEFAULT 'score_only'
                        CHECK (review_visibility IN ('none', 'score_only', 'full')),
    randomize_questions boolean NOT NULL DEFAULT false,
    randomize_options   boolean NOT NULL DEFAULT false,
    partial_credit      boolean NOT NULL DEFAULT true,
    negative_marking_percent double precision NOT NULL DEFAULT 0
                        CHECK (negative_marking_percent >= 0 AND negative_marking_percent <= 100),
    grace_period_minutes integer NOT NULL DEFAULT 0 CHECK (grace_period_minutes >= 0),

    -- ── Legacy anti_cheat_json scalars (canonical spellings) ────────────
    copy_paste_protection boolean NOT NULL DEFAULT false,
    tab_switch_detection  boolean NOT NULL DEFAULT false,
    devtools_detection    boolean NOT NULL DEFAULT false,
    right_click_disabled  boolean NOT NULL DEFAULT false,
    fullscreen_required   boolean NOT NULL DEFAULT false,
    violation_threshold   integer NOT NULL DEFAULT 3 CHECK (violation_threshold >= 1),

    -- ── Access ──────────────────────────────────────────────────────────
    access_mode         text NOT NULL DEFAULT 'all_course_learners'
                        CHECK (access_mode IN ('all_course_learners', 'restricted')),

    creator_id          uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER assessments_set_updated_at BEFORE UPDATE ON assessments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX assessments_course_idx ON assessments (course_id);
-- The auto-publish cron scans only this sliver.
CREATE INDEX assessments_due_publish_idx ON assessments (scheduled_at)
    WHERE lifecycle = 'scheduled';

CREATE TABLE assessment_items (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    legacy_uuid       text UNIQUE,
    assessment_id     uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    -- 1-based, contiguous per assessment (renumbered on every reorder/delete —
    -- legacy wrote client integers verbatim).
    position          integer NOT NULL DEFAULT 1,
    kind              text NOT NULL
                      CHECK (kind IN ('choice', 'open_text', 'form', 'code', 'matching')),
    title             text NOT NULL DEFAULT '',
    -- {schema_version, kind, ...} — the internally-tagged ItemBody enum on
    -- the Rust side; `kind` here mirrors body.kind and is what SQL filters on.
    body              jsonb NOT NULL DEFAULT '{}'::jsonb,
    max_score         double precision NOT NULL DEFAULT 0 CHECK (max_score >= 0),
    -- Legacy metadata_json scalars.
    section_label     text,
    difficulty        text CHECK (difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')),
    tags              text[] NOT NULL DEFAULT '{}',
    outcome_ids       text[] NOT NULL DEFAULT '{}',
    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER assessment_items_set_updated_at BEFORE UPDATE ON assessment_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX assessment_items_order_idx ON assessment_items (assessment_id, position);

-- Allowlists apply only while access_mode = 'restricted'; switching back to
-- all_course_learners wipes them (legacy semantics).
CREATE TABLE assessment_access_users (
    assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (assessment_id, user_id)
);
CREATE INDEX assessment_access_users_user_idx ON assessment_access_users (user_id);

CREATE TABLE assessment_access_usergroups (
    assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    usergroup_id  uuid NOT NULL REFERENCES usergroups (id) ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (assessment_id, usergroup_id)
);
CREATE INDEX assessment_access_usergroups_group_idx ON assessment_access_usergroups (usergroup_id);

-- Per-student policy overrides (legacy student_policy_override). The phantom
-- time_limit_override the legacy API accepted-but-rejected is gone.
CREATE TABLE assessment_overrides (
    id                    uuid PRIMARY KEY DEFAULT uuidv7(),
    assessment_id         uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    user_id               uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    max_attempts_override integer
                          CHECK (max_attempts_override IS NULL
                                 OR (max_attempts_override >= 1 AND max_attempts_override <= 10)),
    due_at_override       timestamptz,
    waive_late_penalty    boolean NOT NULL DEFAULT false,
    note                  text NOT NULL DEFAULT '',
    expires_at            timestamptz,
    granted_by            uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (assessment_id, user_id)
);
CREATE TRIGGER assessment_overrides_set_updated_at BEFORE UPDATE ON assessment_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX assessment_overrides_user_idx ON assessment_overrides (user_id);

-- Append-only: lifecycle transitions, override changes, bulk actions (P4).
-- Legacy defined these event types but the code path that wrote them was
-- dead; here they are emitted for real.
CREATE TABLE assessment_audit_events (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    assessment_id uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
    actor_id      uuid REFERENCES users (id) ON DELETE SET NULL,
    event         text NOT NULL,
    payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_audit_events_idx ON assessment_audit_events (assessment_id, created_at DESC);
