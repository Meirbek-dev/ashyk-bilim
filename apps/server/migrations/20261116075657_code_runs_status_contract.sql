-- contract: since the 5.8 contract release (20261116075650, 55b53d33) the server writes a code run's state into
-- `status` (`done` / `failed` / `degraded`, the verdict in `verdict`); rows of the release before it spell it as
-- the verdict (`internal_error` for a run that never executed). Statuses, part 5 (REWRITE 5.8 item 5).
-- data-fix: a run's status is its state, `code_run_status(status, verdict)`: a run with a verdict is `done`, an
-- `internal_error` without one `failed`, every other value stays.
--
-- After the rewrite the check takes the five states only, and only a `done` run has a verdict (55b53d33 writes
-- none for a failed or degraded run). `code_run_status()` stays for 55b53d33, which reads through it: on these
-- rows it returns `status` (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

UPDATE learning.code_runs SET status = code_run_status(status, verdict)
WHERE status <> code_run_status(status, verdict);

ALTER TABLE learning.code_runs
    DROP CONSTRAINT code_runs_status_check,
    DROP CONSTRAINT code_runs_verdict_when_done,
    ADD CONSTRAINT code_runs_status_check CHECK (status IN ('queued', 'running', 'done', 'failed', 'degraded')),
    ADD CONSTRAINT code_runs_verdict_when_done CHECK (verdict IS NULL OR status = 'done');
