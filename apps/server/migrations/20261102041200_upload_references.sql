-- Media keys get upload foreign keys; the reaper asks the references, not a counter
-- (schema review item 18, REWRITE 5.6 n4).
--
-- An upload was "referenced" while uploads.referenced_count > 0, a counter every writer had to
-- move by hand (BUG-209/263/241 were counts that drifted). Now each key column has an
-- `*_upload_id` beside it (ON DELETE SET NULL), block media get block_uploads, and
-- upload_referenced(id) answers from those keys (with file_submission_files.upload_id), which the
-- reaper uses instead of the counter.
--
-- The ids are derived from the keys by triggers (the key stays the column writers set and URLs
-- use), so the previous release's writes keep them right too. The counter is still maintained
-- by both releases (the previous one reaps by it); it is dropped once a release has run on
-- upload_referenced. The ids' indexes come in 20261102041213..41220 (CONCURRENTLY).

SET LOCAL lock_timeout = '5s';

ALTER TABLE users ADD COLUMN avatar_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN thumbnail_image_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL,
                    ADD COLUMN thumbnail_video_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
ALTER TABLE chapters ADD COLUMN thumbnail_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
ALTER TABLE collections ADD COLUMN cover_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
ALTER TABLE platforms ADD COLUMN logo_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL,
                      ADD COLUMN thumbnail_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;
ALTER TABLE item_feedback ADD COLUMN annotation_upload_id uuid REFERENCES uploads (id) ON DELETE SET NULL;

CREATE TABLE block_uploads (
    block_id  uuid NOT NULL REFERENCES blocks (id) ON DELETE CASCADE,
    upload_id uuid NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
    PRIMARY KEY (block_id, upload_id)
);
CREATE INDEX block_uploads_upload_idx ON block_uploads (upload_id);

-- BEFORE INSERT / UPDATE OF <keys>: TG_ARGV holds (key column, id column) pairs; each id
-- becomes the upload whose key the row names (NULL for no key or a key without an upload row).
CREATE FUNCTION upload_ids_from_keys() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    i integer;
    k text;
BEGIN
    FOR i IN 0 .. TG_NARGS / 2 - 1 LOOP
        k := to_jsonb(NEW) ->> TG_ARGV[2 * i];
        NEW := jsonb_populate_record(NEW, jsonb_build_object(
            TG_ARGV[2 * i + 1], (SELECT u.id FROM uploads u WHERE u.key = k)));
    END LOOP;
    RETURN NEW;
END $$;

CREATE TRIGGER users_upload_ids BEFORE INSERT OR UPDATE OF avatar_key ON users
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('avatar_key', 'avatar_upload_id');
CREATE TRIGGER courses_upload_ids BEFORE INSERT OR UPDATE OF thumbnail_image_key, thumbnail_video_key ON courses
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys(
        'thumbnail_image_key', 'thumbnail_image_upload_id', 'thumbnail_video_key', 'thumbnail_video_upload_id');
CREATE TRIGGER chapters_upload_ids BEFORE INSERT OR UPDATE OF thumbnail_key ON chapters
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('thumbnail_key', 'thumbnail_upload_id');
CREATE TRIGGER collections_upload_ids BEFORE INSERT OR UPDATE OF cover_key ON collections
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('cover_key', 'cover_upload_id');
CREATE TRIGGER platforms_upload_ids BEFORE INSERT OR UPDATE OF logo_key, thumbnail_key ON platforms
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys(
        'logo_key', 'logo_upload_id', 'thumbnail_key', 'thumbnail_upload_id');
CREATE TRIGGER item_feedback_upload_ids BEFORE INSERT OR UPDATE OF annotation_key ON item_feedback
    FOR EACH ROW EXECUTE FUNCTION upload_ids_from_keys('annotation_key', 'annotation_upload_id');

-- A block's media upload follows `content->>'file_key'`.
CREATE FUNCTION block_uploads_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.content ->> 'file_key' IS NOT DISTINCT FROM OLD.content ->> 'file_key' THEN
            RETURN NULL;
        END IF;
        DELETE FROM block_uploads WHERE block_id = NEW.id;
    END IF;
    INSERT INTO block_uploads (block_id, upload_id)
    SELECT NEW.id, u.id FROM uploads u WHERE u.key = NEW.content ->> 'file_key'
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER blocks_upload_ids AFTER INSERT OR UPDATE OF content ON blocks
    FOR EACH ROW EXECUTE FUNCTION block_uploads_sync();

-- data-fix: backfill the new references from the keys (bookkeeping keeps updated_at).
SET LOCAL ab.bookkeeping = 'on';
UPDATE users t SET avatar_upload_id = u.id FROM uploads u WHERE u.key = t.avatar_key;
UPDATE courses t SET thumbnail_image_upload_id = u.id FROM uploads u WHERE u.key = t.thumbnail_image_key;
UPDATE courses t SET thumbnail_video_upload_id = u.id FROM uploads u WHERE u.key = t.thumbnail_video_key;
UPDATE chapters t SET thumbnail_upload_id = u.id FROM uploads u WHERE u.key = t.thumbnail_key;
UPDATE collections t SET cover_upload_id = u.id FROM uploads u WHERE u.key = t.cover_key;
UPDATE platforms t SET logo_upload_id = u.id FROM uploads u WHERE u.key = t.logo_key;
UPDATE platforms t SET thumbnail_upload_id = u.id FROM uploads u WHERE u.key = t.thumbnail_key;
UPDATE item_feedback t SET annotation_upload_id = u.id FROM uploads u WHERE u.key = t.annotation_key;
INSERT INTO block_uploads (block_id, upload_id)
SELECT b.id, u.id FROM blocks b JOIN uploads u ON u.key = b.content ->> 'file_key'
ON CONFLICT DO NOTHING;
SET LOCAL ab.bookkeeping = 'off';

-- Whether anything still names the upload. Discussion images have no column yet: a claimed one
-- is never released (expires_at stays NULL), so the reaper never considers it.
CREATE FUNCTION upload_referenced(p_upload uuid) RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT EXISTS (SELECT 1 FROM file_submission_files WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM block_uploads WHERE upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM users WHERE avatar_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_image_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM courses WHERE thumbnail_video_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM chapters WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM collections WHERE cover_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE logo_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM platforms WHERE thumbnail_upload_id = p_upload)
        OR EXISTS (SELECT 1 FROM item_feedback WHERE annotation_upload_id = p_upload)
$$;
COMMENT ON FUNCTION upload_referenced(uuid) IS
    'An upload is referenced while a row names it through an upload foreign key (the reaper keeps it).';
