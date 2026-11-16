-- Statuses, part 3 (REWRITE 5.8 item 5): a deletion is a timestamp, a status that says "deleted" is derived from it.
--
-- `messages` stored a deletion twice, `status = 'deleted'` and `deleted_at` (a check kept them equal): the server
-- reads and writes `deleted_at` alone, and `status` goes with the contract. `course_discussions` said it only as
-- `status = 'deleted'` (a tombstone that keeps others' replies threaded): it gets `deleted_at` (backfilled from the
-- tombstone's `updated_at`, its last write), its `status` keeps the moderation (`active`, `hidden`), and the API's
-- `deleted` status is read from `deleted_at`.
--
-- Switch release: triggers keep the previous release's `status = 'deleted'` equal to `deleted_at` both ways (it
-- reads and writes the status). A contract drops `messages.status` and the triggers, and narrows the discussions'
-- status to `active` / `hidden` with its keyset indexes on `deleted_at IS NULL` (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE messages ADD CONSTRAINT messages_deleted_is_blank CHECK (deleted_at IS NULL OR body = '');

CREATE FUNCTION messages_deleted_status() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    NEW.status := CASE WHEN NEW.deleted_at IS NULL THEN 'active' ELSE 'deleted' END;
    RETURN NEW;
END $$;
CREATE TRIGGER messages_deleted_status BEFORE INSERT OR UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION messages_deleted_status();

ALTER TABLE course_discussions ADD COLUMN deleted_at timestamptz;
-- The backfill keeps each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';
UPDATE course_discussions SET deleted_at = updated_at WHERE status = 'deleted';
COMMENT ON COLUMN core.course_discussions.deleted_at IS
    'A tombstone: the post was deleted while others'' replies hang under it (text and author wiped).';

CREATE FUNCTION course_discussions_deleted_status() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        NEW.status := 'deleted';
    ELSIF NEW.status = 'deleted' THEN
        NEW.deleted_at := now();
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER course_discussions_deleted_status BEFORE INSERT OR UPDATE ON course_discussions
    FOR EACH ROW EXECUTE FUNCTION course_discussions_deleted_status();
