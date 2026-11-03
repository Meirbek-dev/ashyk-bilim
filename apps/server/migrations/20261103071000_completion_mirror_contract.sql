-- contract: the activity_progress -> completions mirror trigger goes
-- (REWRITE 5.6 n8 step 1). It kept the release before 20261102030500 (which
-- writes no completions) in step; every release since writes a graded
-- activity's completion in its projection transaction
-- (`sync_graded_completion`) and a lesson's with the mark. The trigger ran
-- synchronously with every write it mirrored, so there is no backfill to
-- re-run.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER activity_progress_sync_completion ON activity_progress;
DROP FUNCTION activity_progress_sync_completion();
