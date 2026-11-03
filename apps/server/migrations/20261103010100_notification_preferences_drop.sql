SET LOCAL lock_timeout = '5s';
-- contract: item 26, the server reads and writes notification_opt_outs since
-- 20261102011000; nothing uses notification_preferences any more.

-- data-fix: the sync triggers kept both sides equal; re-run the backfill
-- for safety before the old side goes.
INSERT INTO notification_opt_outs (user_id, kind)
SELECT DISTINCT p.user_id, d.kind
  FROM notification_preferences p, unnest(p.disabled) AS d(kind)
ON CONFLICT DO NOTHING;

DROP TRIGGER notification_opt_outs_sync_preferences ON notification_opt_outs;
DROP FUNCTION notification_opt_outs_sync_preferences();
DROP TABLE notification_preferences;
DROP FUNCTION notification_preferences_sync_opt_outs();
DROP FUNCTION notification_preferences_check_kinds();
