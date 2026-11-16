-- One copy of each fact, part 5 (REWRITE 5.8 item 4): what an award or a completion is for is stored as its type.
--
-- `xp_transactions.source_id` and `gamification_completions.source_id` are text holding a uuid (an activity, a
-- course, a submission) or, for the login bonus only, a day number (days since 1970-01-01). They become
-- `source_uuid uuid` and `xp_transactions.source_day integer`; there is still no foreign key, a journal entry
-- outlives what it was for. The API keeps its `source_id` string (`xp_transactions_v` renders it).
--
-- Switch release: the server reads and writes the typed columns. The previous release reads and writes the text
-- column and keys its idempotency on it, so an insert trigger fills whichever side the writer left empty; the
-- typed unique keys come in the next three files. A contract drops the text columns (making
-- `(user_id, kind, source_uuid)` the completions' primary key) and the triggers (pending-contracts.tsv).
--
-- `ai_work_embeddings.subject_id` gets its key onto `submissions` now that a file hand-in is a submission row
-- (20261115155501).
-- data-fix: embeddings whose subject is no submission describe nothing (they are derived and rebuilt on demand)
-- and are deleted before the key is added.
SET LOCAL lock_timeout = '5s';

ALTER TABLE xp_transactions ADD COLUMN source_uuid uuid, ADD COLUMN source_day integer;
UPDATE xp_transactions SET
    source_uuid = CASE WHEN source <> 'login_bonus'
                            AND source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       THEN source_id::uuid END,
    source_day = CASE WHEN source = 'login_bonus' AND source_id ~ '^[0-9]{1,6}$' THEN source_id::integer END
WHERE source_id IS NOT NULL;
COMMENT ON COLUMN learning.xp_transactions.source_uuid IS
    'What the award is for (activity, course, submission); no key: the entry outlives it. NULL for the login bonus.';
COMMENT ON COLUMN learning.xp_transactions.source_day IS
    'The login bonus''s day, days since 1970-01-01; NULL for every other source.';
SELECT schema_try_check('xp_transactions', 'xp_transactions_source_ref_kind',
                        $$(source_day IS NULL OR source = 'login_bonus') AND (source_uuid IS NULL OR source <> 'login_bonus')
                          AND source_day BETWEEN 0 AND 999999$$);

ALTER TABLE gamification_completions ADD COLUMN source_uuid uuid;
UPDATE gamification_completions SET source_uuid = source_id::uuid
WHERE source_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
COMMENT ON COLUMN learning.gamification_completions.source_uuid IS
    'The completed activity or course (by `kind`); no key: the count outlives it.';

-- The two spellings of one source, kept equal while the previous release writes text.
CREATE FUNCTION xp_transactions_source_ref() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.source_id IS NOT NULL AND NEW.source_uuid IS NULL AND NEW.source_day IS NULL THEN
        IF NEW.source = 'login_bonus' THEN
            NEW.source_day := NEW.source_id::integer;
        ELSE
            NEW.source_uuid := NEW.source_id::uuid;
        END IF;
    ELSIF NEW.source_id IS NULL THEN
        NEW.source_id := coalesce(NEW.source_uuid::text, NEW.source_day::text);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER xp_transactions_source_ref BEFORE INSERT ON xp_transactions
    FOR EACH ROW EXECUTE FUNCTION xp_transactions_source_ref();

CREATE FUNCTION gamification_completions_source_ref() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.source_uuid IS NULL THEN
        NEW.source_uuid := NEW.source_id::uuid;
    ELSIF NEW.source_id IS NULL THEN
        NEW.source_id := NEW.source_uuid::text;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER gamification_completions_source_ref BEFORE INSERT ON gamification_completions
    FOR EACH ROW EXECUTE FUNCTION gamification_completions_source_ref();

-- The journal view renders the API's `source_id` from the typed columns and exposes them.
CREATE OR REPLACE VIEW learning.xp_transactions_v AS
    SELECT j.id, j.user_id, j.amount, j.source, coalesce(j.source_uuid::text, j.source_day::text) AS source_id,
           j.reason, j.idempotency_key, j.created_at,
           xp_level(j.before) AS previous_level,
           xp_level(j.before + j.amount) > xp_level(j.before) AS triggered_level_up,
           j.source_uuid, j.source_day
    FROM (SELECT x.id, x.user_id, x.amount, x.source, x.source_uuid, x.source_day, x.reason, x.idempotency_key,
                 x.created_at,
                 coalesce(sum(x.amount) OVER (PARTITION BY x.user_id ORDER BY x.created_at, x.id
                                              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
          FROM xp_transactions x) j;

DELETE FROM ai_work_embeddings e WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.id = e.subject_id);
SELECT schema_try_fk('ai_work_embeddings', 'ai_work_embeddings_subject_id_fkey',
                     'FOREIGN KEY (subject_id) REFERENCES submissions (id) ON DELETE CASCADE');
