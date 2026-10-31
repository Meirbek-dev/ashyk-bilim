-- docs/AI-FIRST.md 4: AI pre-grading. A draft proposes rubric scores with quotes from the work; the
-- teacher applies it (through the ordinary grade save) or discards it. Every grade saved over a live
-- draft settles it and logs per-criterion corrections, which calibrate the next drafts.

ALTER TABLE ai_runs DROP CONSTRAINT ai_runs_kind_check;
ALTER TABLE ai_runs ADD CONSTRAINT ai_runs_kind_check CHECK (kind IN (
    'course_analysis', 'submission_analysis', 'remediation', 'study_companion', 'lecture_review',
    'course_qa', 'concept_mapping', 'grade_draft'));

ALTER TABLE ai_feature_switches DROP CONSTRAINT ai_feature_switches_feature_check;
ALTER TABLE ai_feature_switches ADD CONSTRAINT ai_feature_switches_feature_check CHECK (feature IN (
    'course_analysis_enabled', 'submission_analysis_enabled', 'remediation_enabled',
    'course_qa_enabled', 'study_companion_enabled', 'lecture_authoring_enabled',
    'semantic_memory_enabled', 'semantic_search_enabled', 'concept_graph_enabled',
    'grading_assistant_enabled'));

CREATE TABLE ai_grade_drafts (
    id                uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id         uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id       uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    submission_id     uuid REFERENCES submissions (id) ON DELETE CASCADE,
    file_attempt_id   uuid REFERENCES file_submission_attempts (id) ON DELETE CASCADE,
    learner_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    run_id            uuid REFERENCES ai_runs (id) ON DELETE SET NULL,
    requested_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    status            text NOT NULL
                      CHECK (status IN ('queued', 'ready', 'applied', 'discarded', 'superseded', 'failed')),
    -- The work's `version` the draft was made from; a newer version supersedes the draft.
    subject_version   bigint NOT NULL,
    proposal          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(proposal) = 'object'),
    ai_score          double precision CHECK (ai_score IS NULL OR ai_score >= 0),
    calibrated_score  double precision CHECK (calibrated_score IS NULL OR calibrated_score >= 0),
    max_score         double precision CHECK (max_score IS NULL OR max_score >= 0),
    confidence        real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    flags             text[] NOT NULL DEFAULT '{}',
    model_name        text,
    error_code        text,
    agreement         text CHECK (agreement IN ('exact', 'adjusted')),
    final_score       double precision,
    decided_by        uuid REFERENCES users (id) ON DELETE SET NULL,
    decided_at        timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((submission_id IS NULL) <> (file_attempt_id IS NULL)),
    CHECK ((status = 'applied') = (agreement IS NOT NULL))
);
CREATE TRIGGER ai_grade_drafts_set_updated_at BEFORE UPDATE ON ai_grade_drafts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- One live draft per work.
CREATE UNIQUE INDEX ai_grade_drafts_live_submission_idx ON ai_grade_drafts (submission_id)
    WHERE status IN ('queued', 'ready') AND submission_id IS NOT NULL;
CREATE UNIQUE INDEX ai_grade_drafts_live_attempt_idx ON ai_grade_drafts (file_attempt_id)
    WHERE status IN ('queued', 'ready') AND file_attempt_id IS NOT NULL;
CREATE INDEX ai_grade_drafts_submission_idx ON ai_grade_drafts (submission_id, created_at DESC);
CREATE INDEX ai_grade_drafts_attempt_idx ON ai_grade_drafts (file_attempt_id, created_at DESC);
CREATE INDEX ai_grade_drafts_activity_idx ON ai_grade_drafts (activity_id, status, created_at DESC);
CREATE INDEX ai_grade_drafts_course_idx ON ai_grade_drafts (course_id, created_at DESC);
CREATE INDEX ai_grade_drafts_learner_idx ON ai_grade_drafts (learner_id);
CREATE INDEX ai_grade_drafts_run_idx ON ai_grade_drafts (run_id);
CREATE INDEX ai_grade_drafts_requested_by_idx ON ai_grade_drafts (requested_by);
CREATE INDEX ai_grade_drafts_decided_by_idx ON ai_grade_drafts (decided_by);

-- What the teacher changed relative to the draft, per part (item or 'file') and criterion
-- ('' = the part's total). The excerpt feeds few-shot calibration examples.
CREATE TABLE ai_grade_corrections (
    id               uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id        uuid NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    activity_id      uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    draft_id         uuid NOT NULL REFERENCES ai_grade_drafts (id) ON DELETE CASCADE,
    teacher_id       uuid REFERENCES users (id) ON DELETE SET NULL,
    part_key         text NOT NULL CHECK (char_length(part_key) BETWEEN 1 AND 100),
    criterion_key    text NOT NULL DEFAULT '' CHECK (char_length(criterion_key) <= 100),
    ai_score         double precision NOT NULL CHECK (ai_score >= 0),
    teacher_score    double precision NOT NULL CHECK (teacher_score >= 0),
    max_score        double precision NOT NULL CHECK (max_score > 0),
    excerpt          text NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 1000),
    teacher_feedback text NOT NULL DEFAULT '' CHECK (char_length(teacher_feedback) <= 1000),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (draft_id, part_key, criterion_key)
);
CREATE INDEX ai_grade_corrections_activity_idx
    ON ai_grade_corrections (activity_id, part_key, criterion_key, created_at DESC);
CREATE INDEX ai_grade_corrections_course_idx ON ai_grade_corrections (course_id, created_at DESC);
CREATE INDEX ai_grade_corrections_teacher_idx ON ai_grade_corrections (teacher_id);

CREATE TABLE ai_course_settings (
    course_id          uuid PRIMARY KEY REFERENCES courses (id) ON DELETE CASCADE,
    auto_grade_drafts  boolean NOT NULL DEFAULT false,
    -- Auto drafts run as this teacher; losing access fails them with AI_ACCESS_REVOKED.
    enabled_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ai_course_settings_set_updated_at BEFORE UPDATE ON ai_course_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX ai_course_settings_enabled_by_idx ON ai_course_settings (enabled_by);

-- Answer embeddings for the consistency report, cached by text hash and model.
CREATE TABLE ai_work_embeddings (
    subject_id       uuid NOT NULL,
    part_key         text NOT NULL,
    activity_id      uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    text_hash        text NOT NULL,
    embedding_model  text NOT NULL,
    embedding        vector(1024) NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_id, part_key)
);
CREATE INDEX ai_work_embeddings_activity_idx ON ai_work_embeddings (activity_id);
