-- A finished AI run says when it finished (REWRITE 5.6 n2): the server stamps completed_at on every
-- finish (succeeded, failed, aborted) and clears it when a run is retried.
--
-- data-fix: a finished run without completed_at gets its started_at (it finished no earlier); rows
-- the repair cannot fix keep their data and the check is recorded as skipped (schema_try_check).
SET LOCAL lock_timeout = '5s';

UPDATE ai_runs SET completed_at = started_at
 WHERE status IN ('succeeded', 'failed', 'aborted') AND completed_at IS NULL;

SELECT schema_try_check('ai_runs', 'ai_runs_finished_at_check',
    $$status NOT IN ('succeeded', 'failed', 'aborted') OR completed_at IS NOT NULL$$);
