-- Statuses, part 2 (REWRITE 5.8 item 5): a code run's status is how far it got, its verdict how it ended.
--
-- `code_runs.status` mixed the two: `queued`, `running` and `degraded` (the runner was unavailable) are states,
-- `accepted` .. `time_limit` verdicts, and `internal_error` both (a test the sandbox could not judge, or a run that
-- never executed: rejected, abandoned, results not stored). `verdict` holds the verdict of a run that executed;
-- a run executed when it has cases, so `internal_error` with cases is that verdict and without them a failed run.
-- The status of record becomes `queued` / `running` / `done` / `failed` / `degraded`; `code_run_status(status,
-- verdict)` reads it from either spelling.
--
-- Switch release: the server reads `code_run_status(...)` and `verdict` and writes both columns, `status` still in
-- the previous release's spelling (a verdict, `internal_error` for a failed run), which that release reads; a
-- trigger fills `verdict` from the previous release's writes. A contract rewrites `status` to the run's state,
-- narrows its check and drops the trigger and the function (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

ALTER TABLE code_runs ADD COLUMN verdict text;
UPDATE code_runs r SET verdict = r.status
WHERE r.status IN ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit')
   OR (r.status = 'internal_error' AND EXISTS (SELECT 1 FROM code_run_cases c WHERE c.run_id = r.id));
ALTER TABLE code_runs
    ADD CONSTRAINT code_runs_verdict_check CHECK (verdict IN (
        'accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit', 'internal_error')),
    ADD CONSTRAINT code_runs_verdict_when_done CHECK (verdict IS NULL OR status NOT IN ('queued', 'running', 'degraded'));
COMMENT ON COLUMN learning.code_runs.verdict IS
    'How an executed run ended (the first failing test''s verdict, else accepted); NULL while it runs or when it never ran.';

-- The run's state from either spelling of `status`.
CREATE FUNCTION code_run_status(status text, verdict text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE WHEN verdict IS NOT NULL OR status = 'done' THEN 'done'
            WHEN status IN ('internal_error', 'failed') THEN 'failed'
            ELSE status END;

-- The previous release writes the verdict into `status`: the verdict column follows.
CREATE FUNCTION code_runs_verdict() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.verdict IS NULL THEN
        IF NEW.status IN ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'time_limit') THEN
            NEW.verdict := NEW.status;
        ELSIF NEW.status = 'internal_error' AND EXISTS (SELECT 1 FROM code_run_cases c WHERE c.run_id = NEW.id) THEN
            NEW.verdict := 'internal_error';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER code_runs_verdict BEFORE INSERT OR UPDATE OF status ON code_runs
    FOR EACH ROW EXECUTE FUNCTION code_runs_verdict();
