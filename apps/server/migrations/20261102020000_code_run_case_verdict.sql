-- Code-run cases carry the platform's own verdict (schema review 2, item 25).
--
-- Since the go-judge switch the cases still stored Judge0's shapes: a
-- `status_id` (Judge0's numeric codes, which go-judge does not have) and a
-- `judge0_token` (always NULL since). `verdict` is the platform's own word
-- for one test's outcome; `status_description` stays the human label.
--
-- Expand step: the previous release reads and writes `status_id`, this one
-- only `verdict`. `code_run_cases_sync` fills whichever side the writer left
-- NULL, so both binaries see coherent rows. The API keeps answering a
-- `status_id` (derived from the verdict, `TestVerdict::legacy_status_id`).
-- The contract migration drops `status_id`, `judge0_token` and the trigger.

SET LOCAL lock_timeout = '5s';

-- The rule that reads a stored Judge0 code (legacy rows and the previous
-- release). go-judge wrote 8 and 12 for output/memory limits with these
-- labels; Judge0 meant other runtime errors by them. A case without a code
-- is judged by `passed`, as the web clients did.
CREATE FUNCTION code_case_verdict(status_id integer, label text, passed boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN status_id IS NULL THEN CASE WHEN passed THEN 'accepted' ELSE 'wrong_answer' END
        WHEN status_id = 3 THEN 'accepted'
        WHEN status_id = 4 THEN 'wrong_answer'
        WHEN status_id = 5 THEN 'time_limit'
        WHEN status_id = 6 THEN 'compile_error'
        WHEN status_id = 8 AND label = 'Output Limit Exceeded' THEN 'output_limit'
        WHEN status_id = 12 AND label = 'Memory Limit Exceeded' THEN 'memory_limit'
        WHEN status_id BETWEEN 7 AND 12 THEN 'runtime_error'
        ELSE 'internal_error'
    END
$$;

-- The code the previous release (and the API's `status_id`) expects.
CREATE FUNCTION code_case_status_id(verdict text) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE verdict
        WHEN 'accepted' THEN 3
        WHEN 'wrong_answer' THEN 4
        WHEN 'time_limit' THEN 5
        WHEN 'compile_error' THEN 6
        WHEN 'output_limit' THEN 8
        WHEN 'runtime_error' THEN 11
        WHEN 'memory_limit' THEN 12
        ELSE 13
    END
$$;

ALTER TABLE code_run_cases ADD COLUMN verdict text
    CHECK (verdict IN ('accepted', 'wrong_answer', 'time_limit', 'memory_limit', 'output_limit',
                       'compile_error', 'runtime_error', 'internal_error'));

-- data-fix: deterministic backfill of the new column from the stored code.
UPDATE code_run_cases SET verdict = code_case_verdict(status_id, status_description, passed);

CREATE FUNCTION code_run_cases_sync() RETURNS trigger AS $$
BEGIN
    IF NEW.verdict IS NULL THEN
        NEW.verdict := code_case_verdict(NEW.status_id, NEW.status_description, NEW.passed);
    END IF;
    IF NEW.status_id IS NULL THEN
        NEW.status_id := code_case_status_id(NEW.verdict);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER code_run_cases_sync BEFORE INSERT ON code_run_cases
    FOR EACH ROW EXECUTE FUNCTION code_run_cases_sync();

ALTER TABLE code_run_cases ALTER COLUMN verdict SET NOT NULL;
