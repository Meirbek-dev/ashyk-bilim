-- Discussion images get a reference, block media references follow `claimed`, and the counter stops
-- being the code's (schema review item 18, rest; REWRITE 5.6 n4).
--
-- A post's images are `discussion-image` uploads its content shows as `/content/<key>` (B-EDT-20).
-- They had no column: a claimed one stayed claimed forever. post_uploads holds them, derived from the
-- content by a trigger (so the previous release's writes keep it too) and backfilled from it.
--
-- block_uploads named every block with a file; a block that left its page's content (`claimed`
-- false, BUG-263) released its upload under the counter but still held it under upload_referenced.
-- Now only claimed blocks hold their upload.
--
-- From this release on the server sets uploads.expires_at from upload_referenced() and no longer
-- moves referenced_count. The previous release still reaps by the counter (referenced_count = 0 and
-- the clock run out); its releases run on counts this release no longer raised, so a file both
-- releases referenced could reach 0 while still named. uploads_rollback_guard keeps such a file off
-- the clock: a write that moves the counter (only the previous release does) cannot start the clock
-- of an upload that is still referenced. The contract (20261103072000) drops it with the counter.

SET LOCAL lock_timeout = '5s';

CREATE TABLE post_uploads (
    discussion_id uuid NOT NULL REFERENCES course_discussions (id) ON DELETE CASCADE,
    upload_id     uuid NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
    PRIMARY KEY (discussion_id, upload_id)
);
CREATE INDEX post_uploads_upload_idx ON post_uploads (upload_id);
COMMENT ON TABLE post_uploads IS
    'The discussion-image uploads a post''s content shows (kept by trigger from the content); the reaper keeps them.';

-- The keys of the discussion images a text shows (`discussion-image/<32 hex>`, also JSON- or URL-escaped).
CREATE FUNCTION discussion_image_keys(content text) RETURNS SETOF text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT DISTINCT 'discussion-image/' || m[1]
    FROM regexp_matches(content, 'discussion-image(?:/|\\/|%2[Ff])([0-9a-f]{32})', 'g') AS m
$$;

CREATE FUNCTION post_uploads_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.content IS NOT DISTINCT FROM OLD.content THEN
            RETURN NULL;
        END IF;
        DELETE FROM post_uploads WHERE discussion_id = NEW.id;
    END IF;
    INSERT INTO post_uploads (discussion_id, upload_id)
    SELECT NEW.id, u.id FROM uploads u WHERE u.key IN (SELECT discussion_image_keys(NEW.content))
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END $$;
CREATE TRIGGER course_discussions_upload_ids AFTER INSERT OR UPDATE OF content ON course_discussions
    FOR EACH ROW EXECUTE FUNCTION post_uploads_sync();

INSERT INTO post_uploads (discussion_id, upload_id)
SELECT d.id, u.id
FROM course_discussions d
CROSS JOIN LATERAL discussion_image_keys(d.content) AS k(key)
JOIN uploads u ON u.key = k.key
ON CONFLICT DO NOTHING;

-- A block holds its media upload while it is claimed (its page's content shows it).
CREATE OR REPLACE FUNCTION block_uploads_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.content ->> 'file_key' IS NOT DISTINCT FROM OLD.content ->> 'file_key'
           AND NEW.claimed = OLD.claimed THEN
            RETURN NULL;
        END IF;
        DELETE FROM block_uploads WHERE block_id = NEW.id;
    END IF;
    IF NEW.claimed THEN
        INSERT INTO block_uploads (block_id, upload_id)
        SELECT NEW.id, u.id FROM uploads u WHERE u.key = NEW.content ->> 'file_key'
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER blocks_upload_ids ON blocks;
CREATE TRIGGER blocks_upload_ids AFTER INSERT OR UPDATE OF content, claimed ON blocks
    FOR EACH ROW EXECUTE FUNCTION block_uploads_sync();

-- data-fix: an unclaimed block (left its page's content) does not hold its upload; the previous
-- release already released it by the counter.
DELETE FROM block_uploads bu USING blocks b WHERE b.id = bu.block_id AND NOT b.claimed;

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
$$;

-- Rollback guard (dropped by the contract): the previous release's counter writes cannot start the
-- clock of an upload that a row still names.
CREATE FUNCTION uploads_rollback_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF upload_referenced(NEW.id) THEN
        NEW.expires_at := NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER uploads_rollback_guard BEFORE UPDATE OF referenced_count ON uploads
    FOR EACH ROW
    WHEN (NEW.referenced_count IS DISTINCT FROM OLD.referenced_count
          AND NEW.expires_at IS NOT NULL AND NEW.status = 'finalized')
    EXECUTE FUNCTION uploads_rollback_guard();
