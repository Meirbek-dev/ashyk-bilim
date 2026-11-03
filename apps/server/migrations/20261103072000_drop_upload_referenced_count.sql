-- contract: uploads.referenced_count is no longer written or read (20261102072000): the claim and
-- release paths set expires_at from upload_referenced(), and the reaper asks it too. The previous
-- release's counter writes were what uploads_rollback_guard watched; it goes with the column.
-- Nothing to re-run: post_uploads and block_uploads are kept by triggers under both releases.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER uploads_rollback_guard ON uploads;
DROP FUNCTION uploads_rollback_guard();
ALTER TABLE uploads DROP COLUMN referenced_count;
