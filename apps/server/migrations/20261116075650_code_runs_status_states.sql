-- Statuses, part 4 (REWRITE 5.8 item 5): a finished run's stored status may be its state, `done` or `failed`.
--
-- Expand: from this release the server writes `done` / `failed` (the verdict in `verdict`); the previous release
-- (20261116075634) still writes the verdict into `status`, and both read through `code_run_status(status, verdict)`,
-- which reads either spelling. The next contract rewrites the old spelling to the state and narrows the check to
-- queued / running / done / failed / degraded (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE learning.code_runs DROP CONSTRAINT code_runs_status_check;
SELECT schema_try_check('code_runs', 'code_runs_status_check',
                        $$status IN ('queued', 'running', 'done', 'failed', 'degraded', 'accepted', 'wrong_answer',
                                     'compile_error', 'runtime_error', 'time_limit', 'internal_error')$$);
