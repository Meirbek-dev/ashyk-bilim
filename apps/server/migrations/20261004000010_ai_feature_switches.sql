-- S-GAPS: runtime AI feature switches. A row overrides one feature's
-- environment flag without a redeploy; the environment stays the ceiling
-- (a feature off in `AB__AI__*` stays off). No row = the environment value.
-- `feature` is the flag key the admin settings show (`course_qa_enabled`, ...).
CREATE TABLE ai_feature_switches (
    feature     text PRIMARY KEY CHECK (feature IN (
                    'course_analysis_enabled', 'submission_analysis_enabled',
                    'remediation_enabled', 'course_qa_enabled',
                    'study_companion_enabled', 'lecture_authoring_enabled',
                    'semantic_memory_enabled')),
    enabled     boolean NOT NULL,
    updated_by  uuid REFERENCES users (id) ON DELETE SET NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
