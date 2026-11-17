-- contract: since 20261116075632 and 20261116075635 the server reads and writes a progress row's `status` + `passed`
-- and a deletion's `deleted_at`; the previous release's spellings and the triggers that kept them equal go
-- (REWRITE 5.8 item 5).
-- data-fix: a deleted discussion post's `status` keeps its moderation: the previous release's 'deleted' (its
-- tombstone, now `deleted_at`) becomes 'active', the value of a post nobody hid.
SET LOCAL lock_timeout = '5s';

DROP TRIGGER activity_progress_status ON learning.activity_progress;
DROP FUNCTION activity_progress_status();
-- A row starts not started: the server's enrolment insert names no status and got it from `state`'s default
-- through the trigger (this release's and the previous one's).
ALTER TABLE learning.activity_progress ALTER COLUMN status SET DEFAULT 'not_started';
-- Its check and activity_progress_activity_state_idx go with the column.
ALTER TABLE learning.activity_progress DROP COLUMN state;

DROP TRIGGER messages_deleted_status ON core.messages;
DROP FUNCTION messages_deleted_status();
-- messages_check, messages_check1 and messages_status_check go with the column (messages_deleted_is_blank stays).
ALTER TABLE core.messages DROP COLUMN status;

-- The previous release wrote a deletion as status 'deleted' and read it; this one writes `deleted_at` alone.
DROP TRIGGER course_discussions_deleted_status ON core.discussion_posts;
DROP FUNCTION course_discussions_deleted_status();
-- The stored reply count follows a deletion from `deleted_at` (the status no longer says it); the fix below then
-- changes no count.
CREATE OR REPLACE FUNCTION course_discussions_recount_replies() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND OLD.parent_id IS NOT NULL AND OLD.status = 'active' AND OLD.deleted_at IS NULL THEN
        UPDATE discussion_posts SET replies_count = replies_count - 1
        WHERE id = OLD.parent_id;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.parent_id IS NOT NULL AND NEW.status = 'active' AND NEW.deleted_at IS NULL THEN
        UPDATE discussion_posts SET replies_count = replies_count + 1
        WHERE id = NEW.parent_id;
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER course_discussions_recount_replies ON core.discussion_posts;
CREATE TRIGGER course_discussions_recount_replies AFTER INSERT OR DELETE OR UPDATE OF status, parent_id, deleted_at
    ON core.discussion_posts FOR EACH ROW EXECUTE FUNCTION course_discussions_recount_replies();
-- The fix keeps each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';
UPDATE core.discussion_posts SET status = 'active' WHERE status = 'deleted';
ALTER TABLE core.discussion_posts DROP CONSTRAINT course_discussions_status_check,
    ADD CONSTRAINT course_discussions_status_check CHECK (status IN ('active', 'hidden'));
-- The keyset indexes on `deleted_at IS NULL` replace these (20261116075651, 20261116075652).
DROP INDEX core.course_discussions_posts_keyset_idx;
DROP INDEX core.course_discussions_replies_keyset_idx;

-- The previous release writes every verdict itself (20261116075634): nothing is left to fill.
DROP TRIGGER code_runs_verdict ON learning.code_runs;
DROP FUNCTION code_runs_verdict();
