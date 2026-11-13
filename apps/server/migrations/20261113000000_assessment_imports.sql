-- Tests from DOT spreadsheets (docs/XLSX-TEST-IMPORT.md): pictures in item bodies, a question bank drawn
-- per attempt, and the import sessions that turn an .xlsx into an assessment. Additive only: the previous
-- release ignores every new column and table.

SET LOCAL lock_timeout = '5s';

-- Item pictures: every upload an item body names (`media` / `option.media` / … carry `upload_id`), kept
-- by a trigger like block_uploads, so upload_referenced() holds them and the reaper leaves them alone.
CREATE TABLE learning.assessment_item_uploads (
    item_id   uuid NOT NULL REFERENCES learning.assessment_items (id) ON DELETE CASCADE,
    upload_id uuid NOT NULL REFERENCES core.uploads (id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, upload_id)
);
CREATE INDEX assessment_item_uploads_upload_idx ON learning.assessment_item_uploads (upload_id);
COMMENT ON TABLE learning.assessment_item_uploads IS
    'Uploads an assessment item body names (any `upload_id` in it); synced by trigger from the body.';

CREATE FUNCTION assessment_item_uploads_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.body IS NOT DISTINCT FROM OLD.body THEN
            RETURN NULL;
        END IF;
        DELETE FROM assessment_item_uploads WHERE item_id = NEW.id;
    END IF;
    INSERT INTO assessment_item_uploads (item_id, upload_id)
    SELECT DISTINCT NEW.id, u.id
    FROM jsonb_path_query(NEW.body, 'lax $.**.upload_id') AS ref (value)
    JOIN uploads u ON u.id::text = ref.value #>> '{}'
    WHERE jsonb_typeof(ref.value) = 'string'
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER assessment_items_upload_ids AFTER INSERT OR UPDATE OF body ON learning.assessment_items
    FOR EACH ROW EXECUTE FUNCTION assessment_item_uploads_sync();

-- One .xlsx on its way to an assessment: parsed by the `assessments:import-parse` job, committed by the
-- author. Rows expire unless committed; committed ones are purged 30 days later (the audit event stays).
CREATE TABLE learning.assessment_imports (
    id                   uuid PRIMARY KEY,
    course_id            uuid NOT NULL REFERENCES core.courses (id) ON DELETE CASCADE,
    created_by           uuid REFERENCES core.users (id) ON DELETE SET NULL,
    upload_id            uuid REFERENCES core.uploads (id) ON DELETE SET NULL,
    file_name            text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
    file_sha256          bytea,
    status               text NOT NULL DEFAULT 'parsing'
                         CHECK (status IN ('parsing', 'ready', 'invalid', 'committed', 'discarded', 'failed')),
    unescape_newlines    boolean NOT NULL DEFAULT true,
    sheet_name           text,
    parsed               jsonb,
    issues               jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(issues) = 'array'),
    issues_truncated     integer NOT NULL DEFAULT 0 CHECK (issues_truncated >= 0),
    image_upload_ids     uuid[] NOT NULL DEFAULT '{}',
    result_assessment_id uuid REFERENCES learning.assessments (id) ON DELETE SET NULL,
    error                text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    parsed_at            timestamptz,
    committed_at         timestamptz,
    expires_at           timestamptz NOT NULL
);
CREATE INDEX assessment_imports_course_idx ON learning.assessment_imports (course_id);
CREATE INDEX assessment_imports_created_by_idx ON learning.assessment_imports (created_by);
CREATE INDEX assessment_imports_upload_idx ON learning.assessment_imports (upload_id);
CREATE INDEX assessment_imports_result_idx ON learning.assessment_imports (result_assessment_id);
CREATE INDEX assessment_imports_images_idx ON learning.assessment_imports USING gin (image_upload_ids);
CREATE INDEX assessment_imports_expires_idx ON learning.assessment_imports (expires_at);
COMMENT ON TABLE learning.assessment_imports IS
    'An uploaded DOT test spreadsheet: parse result (plan, issues) until committed into an assessment or expired.';
COMMENT ON COLUMN learning.assessment_imports.parsed IS
    'The parsed test: settings and questions as item bodies (pictures as staged uploads); NULL until parsed.';
COMMENT ON COLUMN learning.assessment_imports.image_upload_ids IS
    'Pictures extracted from the file, staged as `assessment-image` uploads until the commit puts them in items.';
COMMENT ON COLUMN learning.assessment_imports.expires_at IS
    'Uncommitted: when the row and its staged files go. Committed: when the record is purged.';

-- The bank: `draw_count` questions per attempt (NULL = all), optionally `draw_strata` quotas per group.
ALTER TABLE learning.assessments
    ADD COLUMN draw_count integer CHECK (draw_count IS NULL OR draw_count BETWEEN 1 AND 200),
    ADD COLUMN draw_strata jsonb CHECK (draw_strata IS NULL OR jsonb_typeof(draw_strata) = 'array');
COMMENT ON COLUMN learning.assessments.draw_count IS
    'Questions drawn at random for each attempt; NULL: every question.';
COMMENT ON COLUMN learning.assessments.draw_strata IS
    'Draw quotas `[{group, count}]` taken first from items with that `draw_group`; NULL: none.';

ALTER TABLE learning.assessment_items
    ADD COLUMN draw_group text CHECK (draw_group IS NULL OR length(draw_group) BETWEEN 1 AND 32),
    ADD COLUMN source_file text CHECK (source_file IS NULL OR length(source_file) BETWEEN 1 AND 255),
    ADD COLUMN source_row integer CHECK (source_row IS NULL OR source_row >= 1);
COMMENT ON COLUMN learning.assessment_items.draw_group IS
    'Draw quota group (a DOT level such as 1 or 101); NULL: none.';
COMMENT ON COLUMN learning.assessment_items.source_file IS 'Spreadsheet the item was imported from.';
COMMENT ON COLUMN learning.assessment_items.source_row IS 'Row of `source_file` the item came from.';

ALTER TABLE learning.submissions ADD COLUMN selected_item_ids uuid[];
COMMENT ON COLUMN learning.submissions.selected_item_ids IS
    'The questions this attempt drew, in the order shown; NULL: every item of the assessment.';

INSERT INTO core.upload_purposes (purpose) VALUES ('assessment-import'), ('assessment-image')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION upload_referenced(p_upload uuid) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT EXISTS (SELECT 1 FROM file_submission_files WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM block_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM post_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM users WHERE avatar_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_image_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_video_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM chapters WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM collections WHERE cover_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE logo_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM item_feedback WHERE annotation_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_item_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_imports WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_imports WHERE image_upload_ids @> ARRAY[p_upload])
$$;

SELECT pin_function_search_paths();
