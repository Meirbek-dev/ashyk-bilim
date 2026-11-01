-- Schema review item 14: room for HOT updates on the rows the app rewrites
-- in place, and no index on the column a running job rewrites every few
-- seconds.
--
-- fillfactor applies to pages written from now on (no table rewrite; a
-- SHARE UPDATE EXCLUSIVE lock for the catalog change only). Existing pages
-- gain the free space as autovacuum and normal churn rewrite them.

-- A worker's heartbeat (`UPDATE jobs SET heartbeat_at = now()`) touched an
-- indexed column, so every beat wrote a new index entry and could never be a
-- HOT update. The reaper finds running jobs through jobs_status_kind_idx
-- (status leads) and filters the few running rows by heartbeat_at.
DROP INDEX jobs_reaper_idx;

ALTER TABLE jobs SET (fillfactor = 70, autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE submissions SET (fillfactor = 85);
ALTER TABLE activity_progress SET (fillfactor = 85);
ALTER TABLE course_progress SET (fillfactor = 85);
ALTER TABLE gamification_profiles SET (fillfactor = 85);
ALTER TABLE course_discussions SET (fillfactor = 90);
