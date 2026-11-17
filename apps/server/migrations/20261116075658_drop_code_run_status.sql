-- contract: since 20261116075657 every stored code_runs.status is the run's state and the server reads it directly;
-- 7996c3e5 was the last release to call code_run_status() (REWRITE 5.8 item 5).
SET LOCAL lock_timeout = '5s';

DROP FUNCTION code_run_status(text, text);
