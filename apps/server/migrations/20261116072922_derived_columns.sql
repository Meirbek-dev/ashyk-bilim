-- One copy of each fact, part 1 (REWRITE 5.8 item 4): values that follow from another column are read from it.
--
-- - `xp_transactions.previous_level` / `triggered_level_up` follow from the journal: the level of the user's XP
--   before the row and after it. `xp_transactions_v` computes them; the server reads the view and writes neither.
-- - `item_feedback.graded_by` is its grade entry's `graded_by`; `item_feedback.updated_at` and
--   `certificate_users.updated_at` date rows that never change (the frozen triggers; a re-issue has `reissued_at`).
-- - `code_run_cases.passed` is "the verdict is accepted, or the run is a custom-input run" (nothing is scored there).
--
-- Switch release: the server stops reading these columns and writing the derived ones. The previous release still
-- reads the levels and `passed`, so triggers keep those stored copies right for rows this release inserts (and fill
-- the NOT NULL `previous_level`); it reads `item_feedback.graded_by` into nothing. A contract drops the columns and
-- the triggers together (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';

-- The level of an XP total: XP(level) = 50(level-1)^2 + 50(level-1), from 1 to 100 (`gamification::level_for`).
CREATE FUNCTION xp_level(total bigint) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN LEAST(100, GREATEST(1, floor((-1 + sqrt(1 + 0.08 * GREATEST(total, 0))) / 2)::int + 1));

-- The journal with the levels it implies, in journal order. Filter it by `user_id` (the window's partition, so the
-- filter reaches the table); a filter on anything else alone computes every user's window first.
CREATE VIEW learning.xp_transactions_v AS
    SELECT j.id, j.user_id, j.amount, j.source, j.source_id, j.reason, j.idempotency_key, j.created_at,
           xp_level(j.before) AS previous_level,
           xp_level(j.before + j.amount) > xp_level(j.before) AS triggered_level_up
    FROM (SELECT x.id, x.user_id, x.amount, x.source, x.source_id, x.reason, x.idempotency_key, x.created_at,
                 coalesce(sum(x.amount) OVER (PARTITION BY x.user_id ORDER BY x.created_at, x.id
                                              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM xp_transactions x) j;
COMMENT ON VIEW learning.xp_transactions_v IS
    'xp_transactions with previous_level and triggered_level_up computed from the XP before each row.';

-- For the previous release: the stored levels of a new row, as the view computes them (the award holds the
-- profile lock, so the sum sees every earlier award).
CREATE FUNCTION xp_transactions_levels() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    before bigint;
BEGIN
    SELECT coalesce(sum(x.amount), 0) INTO before FROM xp_transactions x WHERE x.user_id = NEW.user_id;
    NEW.previous_level := xp_level(before);
    NEW.triggered_level_up := xp_level(before + NEW.amount) > NEW.previous_level;
    RETURN NEW;
END $$;
CREATE TRIGGER xp_transactions_levels BEFORE INSERT ON xp_transactions
    FOR EACH ROW EXECUTE FUNCTION xp_transactions_levels();

-- For the previous release: a new test result says whether it passed.
CREATE FUNCTION code_run_cases_passed() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    NEW.passed := NEW.verdict = 'accepted'
        OR EXISTS (SELECT 1 FROM code_runs r WHERE r.id = NEW.run_id AND r.purpose = 'custom');
    RETURN NEW;
END $$;
CREATE TRIGGER code_run_cases_passed BEFORE INSERT ON code_run_cases
    FOR EACH ROW EXECUTE FUNCTION code_run_cases_passed();
