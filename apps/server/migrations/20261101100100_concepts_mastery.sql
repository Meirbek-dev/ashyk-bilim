-- docs/AI-FIRST.md 2-3: the course concept graph and the learner mastery model.
-- AI suggests concepts, prerequisites and tags; a teacher's decision (approved/rejected) is sticky across
-- re-runs. Only approved tags feed mastery. Mastery is derived data: evidence rows are re-derived from the
-- graded work they name, and concept_mastery replays them, so both cascade with their owners.
CREATE TABLE course_concepts (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    slug         text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
    name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    status       text NOT NULL CHECK (status IN ('suggested', 'approved', 'rejected')),
    origin       text NOT NULL CHECK (origin IN ('ai', 'teacher')),
    position     integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    run_id       uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    decided_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_id, slug),
    UNIQUE (id, course_id)
);
CREATE TRIGGER course_concepts_set_updated_at BEFORE UPDATE ON course_concepts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX course_concepts_run_idx ON course_concepts (run_id);
CREATE INDEX course_concepts_decided_by_idx ON course_concepts (decided_by);

-- `concept_id` requires `requires_id` (both in one course, enforced by the composite keys). The domain
-- refuses an edge that closes a cycle.
CREATE TABLE concept_prerequisites (
    concept_id   uuid NOT NULL,
    requires_id  uuid NOT NULL,
    course_id    uuid NOT NULL,
    status       text NOT NULL CHECK (status IN ('suggested', 'approved', 'rejected')),
    origin       text NOT NULL CHECK (origin IN ('ai', 'teacher')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (concept_id, requires_id),
    CHECK (concept_id <> requires_id),
    FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts (id, course_id) ON DELETE CASCADE,
    FOREIGN KEY (requires_id, course_id) REFERENCES course_concepts (id, course_id) ON DELETE CASCADE
);
CREATE INDEX concept_prerequisites_requires_idx ON concept_prerequisites (requires_id, course_id);
CREATE INDEX concept_prerequisites_concept_course_idx ON concept_prerequisites (concept_id, course_id);

-- A concept on an activity, or on one item of an assessment activity (item_id set).
CREATE TABLE concept_tags (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id    uuid NOT NULL,
    concept_id   uuid NOT NULL,
    activity_id  uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    item_id      uuid REFERENCES assessment_items (id) ON DELETE CASCADE,
    weight       real NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 1),
    status       text NOT NULL CHECK (status IN ('suggested', 'approved', 'rejected')),
    origin       text NOT NULL CHECK (origin IN ('ai', 'teacher')),
    rationale    text NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 1000),
    run_id       uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    decided_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts (id, course_id) ON DELETE CASCADE,
    UNIQUE NULLS NOT DISTINCT (concept_id, activity_id, item_id)
);
CREATE TRIGGER concept_tags_set_updated_at BEFORE UPDATE ON concept_tags
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX concept_tags_course_idx ON concept_tags (course_id, status);
CREATE INDEX concept_tags_concept_course_idx ON concept_tags (concept_id, course_id);
CREATE INDEX concept_tags_activity_idx ON concept_tags (activity_id, item_id);
CREATE INDEX concept_tags_item_idx ON concept_tags (item_id);
CREATE INDEX concept_tags_run_idx ON concept_tags (run_id);
CREATE INDEX concept_tags_decided_by_idx ON concept_tags (decided_by);

-- One observation of a learner on a concept. Re-deriving a source replaces its rows (the unique key).
CREATE TABLE mastery_evidence (
    id           uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    concept_id   uuid NOT NULL REFERENCES course_concepts (id) ON DELETE CASCADE,
    source_type  text NOT NULL
                 CHECK (source_type IN ('item', 'file_attempt', 'code_run', 'remediation', 'ai_question')),
    source_id    uuid NOT NULL,
    part_id      uuid,
    score        real NOT NULL CHECK (score >= 0 AND score <= 1),
    weight       real NOT NULL CHECK (weight > 0 AND weight <= 1),
    -- guess/slip class of the observation (docs/AI-FIRST.md 3.2).
    kind         text NOT NULL CHECK (kind IN ('choice', 'open', 'code', 'signal')),
    observed_at  timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (source_type, source_id, concept_id, part_id, user_id)
);
CREATE INDEX mastery_evidence_learner_idx ON mastery_evidence (user_id, concept_id, observed_at);
CREATE INDEX mastery_evidence_course_idx ON mastery_evidence (course_id, concept_id);
CREATE INDEX mastery_evidence_concept_idx ON mastery_evidence (concept_id);
CREATE INDEX mastery_evidence_source_idx ON mastery_evidence (source_type, source_id);

CREATE TABLE concept_mastery (
    user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    concept_id        uuid NOT NULL REFERENCES course_concepts (id) ON DELETE CASCADE,
    course_id         uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    p_known           real NOT NULL CHECK (p_known >= 0 AND p_known <= 1),
    evidence_count    integer NOT NULL CHECK (evidence_count >= 0),
    last_observed_at  timestamptz,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, concept_id)
);
CREATE INDEX concept_mastery_course_idx ON concept_mastery (course_id, concept_id);
CREATE INDEX concept_mastery_concept_idx ON concept_mastery (concept_id);
