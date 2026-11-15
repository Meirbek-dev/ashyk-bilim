-- Integrity review of 2026-11-15: guarantees the schema promised but did not hold.
--
-- - upload_referenced() lost message_uploads when 20261113000000 replaced it: an attachment whose clock a
--   release path started (a bulk send's copy left, a tombstone) was collected while other messages still
--   showed it. It is back, and a frozen assessment version now holds the pictures its items name
--   (assessment_version_uploads), so editing an item cannot take an old attempt's image away.
-- - A version's content_hash is computed by the insert trigger, not trusted from the writer.
-- - An item body names its kind (`body ->> 'kind'` NULL passed the old equality check).
-- - draw_strata holds the API's `{group, count}` quotas; a drawn question list is distinct and written once.
-- - A hand-in since the version cutover names its version.
-- - A message's author is a member of its conversation.
--
-- Additive for the previous release: it writes every value these checks ask for.

SET LOCAL lock_timeout = '5s';

-- Pictures of frozen versions -------------------------------------------------------------------------------

CREATE TABLE learning.assessment_version_uploads (
    version_id uuid NOT NULL REFERENCES learning.assessment_versions (id) ON DELETE CASCADE,
    upload_id  uuid NOT NULL REFERENCES core.uploads (id) ON DELETE CASCADE,
    PRIMARY KEY (version_id, upload_id)
);
CREATE INDEX assessment_version_uploads_upload_idx ON learning.assessment_version_uploads (upload_id);
COMMENT ON TABLE learning.assessment_version_uploads IS
    'Uploads a frozen assessment version''s items name (any `upload_id` in them); written by trigger when the version is.';

CREATE FUNCTION assessment_version_uploads_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO assessment_version_uploads (version_id, upload_id)
    SELECT DISTINCT NEW.id, u.id
    FROM jsonb_path_query(NEW.items, 'lax $.**.upload_id') AS ref (value)
    JOIN uploads u ON u.id::text = ref.value #>> '{}'
    WHERE jsonb_typeof(ref.value) = 'string'
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;

CREATE TRIGGER assessment_versions_upload_ids
    AFTER INSERT ON learning.assessment_versions
    FOR EACH ROW EXECUTE FUNCTION assessment_version_uploads_sync();

INSERT INTO learning.assessment_version_uploads (version_id, upload_id)
SELECT DISTINCT v.id, u.id
FROM learning.assessment_versions v
CROSS JOIN LATERAL jsonb_path_query(v.items, 'lax $.**.upload_id') AS ref (value)
JOIN core.uploads u ON u.id::text = ref.value #>> '{}'
WHERE jsonb_typeof(ref.value) = 'string'
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION upload_referenced(p_upload uuid) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT EXISTS (SELECT 1 FROM file_submission_files WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM block_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM post_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM message_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM users WHERE avatar_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_image_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_video_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM chapters WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM collections WHERE cover_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE logo_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM item_feedback WHERE annotation_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_item_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_version_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_imports WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM assessment_imports WHERE image_upload_ids @> ARRAY[p_upload])
$$;

-- Versions derive their hash --------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assessment_versions_points() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.max_points := snapshot_max_points(NEW.items);
    NEW.content_hash := assessment_content_hash(NEW.items, NEW.policy);
    RETURN NEW;
END;
$$;

-- Item bodies, draws ----------------------------------------------------------------------------------------

SELECT schema_try_check('learning.assessment_items', 'assessment_items_body_kind_set',
                        $$body ->> 'kind' IS NOT NULL$$);

-- The API's quotas (`PolicyInput::validate`): 1+ objects of exactly a trimmed 1-32 character group and a whole
-- count of 1-200 questions, groups distinct. CASE keeps the casts behind the type tests.
CREATE FUNCTION draw_strata_ok(strata jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT jsonb_typeof(strata) = 'array'
       AND jsonb_array_length(strata) BETWEEN 1 AND 200
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(strata) AS s (v)
           WHERE CASE WHEN jsonb_typeof(v) = 'object'
                           AND jsonb_typeof(v -> 'group') = 'string'
                           AND jsonb_typeof(v -> 'count') = 'number'
                      THEN NOT (v - 'group' - 'count' = '{}'::jsonb
                                AND char_length(v ->> 'group') BETWEEN 1 AND 32
                                AND v ->> 'group' = btrim(v ->> 'group')
                                AND (v -> 'count')::numeric BETWEEN 1 AND 200
                                AND (v -> 'count')::numeric = trunc((v -> 'count')::numeric))
                      ELSE true END)
       AND (SELECT count(DISTINCT v ->> 'group') FROM jsonb_array_elements(strata) AS s (v))
           = jsonb_array_length(strata)
$$;

SELECT schema_try_check('learning.assessments', 'assessments_draw_strata_shape',
                        $$draw_strata IS NULL OR draw_strata_ok(draw_strata)$$);

CREATE FUNCTION uuid_list_ok(ids uuid[], max_items integer) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT cardinality(ids) <= max_items
       AND array_position(ids, NULL) IS NULL
       AND (SELECT count(DISTINCT v) FROM unnest(ids) AS t (v)) = cardinality(ids)
$$;

SELECT schema_try_check('learning.submissions', 'submissions_selected_item_ids_check',
                        $$selected_item_ids IS NULL OR uuid_list_ok(selected_item_ids, 200)$$);

-- The draw is part of what the attempt was handed in against: written once, like the snapshots.
CREATE OR REPLACE FUNCTION submissions_snapshots_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.items_snapshot IS NOT NULL AND NEW.items_snapshot IS DISTINCT FROM OLD.items_snapshot)
       OR (OLD.policy_snapshot IS NOT NULL AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot)
       OR (OLD.assessment_version_id IS NOT NULL
           AND NEW.assessment_version_id IS DISTINCT FROM OLD.assessment_version_id)
       OR (OLD.selected_item_ids IS NOT NULL
           AND NEW.selected_item_ids IS DISTINCT FROM OLD.selected_item_ids) THEN
        RAISE EXCEPTION 'a submission''s snapshots are written once'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER submissions_snapshots_frozen
    BEFORE UPDATE OF items_snapshot, policy_snapshot, assessment_version_id, selected_item_ids
    ON learning.submissions
    FOR EACH ROW EXECUTE FUNCTION submissions_snapshots_frozen();

-- Readers take items and policy from the version (submissions.rs): a hand-in since the snapshot cutover
-- (submissions_handed_in_snapshots_check) names one.
SELECT schema_try_check('learning.submissions', 'submissions_handed_in_version_check',
                        $$status = 'draft' OR assessment_version_id IS NOT NULL
                          OR created_at < '2026-11-07 00:00:00+00'::timestamptz$$);

-- Messages --------------------------------------------------------------------------------------------------

-- Member rows stay for the life of the conversation (an erased person's too, docs/DIALOGS.md 7), so the
-- author's row is there for every message; the conversation's delete removes both in one statement.
SELECT schema_try_fk('core.messages', 'messages_member_fkey',
                     'FOREIGN KEY (conversation_id, user_id)
                      REFERENCES core.conversation_members (conversation_id, user_id)');

SELECT pin_function_search_paths();
