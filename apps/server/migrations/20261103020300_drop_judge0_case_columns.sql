-- contract: code_run_cases.status_id / judge0_token were Judge0's shapes (schema review 2, item 25).
--
-- The release before this one writes and reads only `verdict` (the API's
-- case `status_id` is derived from it in Rust). `code_run_cases_sync` filled
-- `verdict` for every row the older binary wrote (NOT NULL since
-- 20261102020000), so no row needs a re-run backfill; the trigger, its two
-- mapping functions and the columns go.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER code_run_cases_sync ON code_run_cases;
DROP FUNCTION code_run_cases_sync();
ALTER TABLE code_run_cases DROP COLUMN status_id, DROP COLUMN judge0_token;
DROP FUNCTION code_case_verdict(integer, text, boolean);
DROP FUNCTION code_case_status_id(text);
