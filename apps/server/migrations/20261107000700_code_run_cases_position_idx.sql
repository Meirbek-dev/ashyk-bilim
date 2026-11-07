-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS code_run_cases_run_position_key ON code_run_cases (run_id, position);
