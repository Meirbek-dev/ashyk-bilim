-- A handed-in attempt keeps what it was answered against (schema review 2, item 9).
--
-- `items_snapshot` / `policy_snapshot` are written when the attempt is
-- handed in; grading, review and AI pre-grading read them. Nothing stopped a
-- hand-in without them or a later rewrite of them.
--
-- * Immutable: once set, neither snapshot changes (BEFORE UPDATE).
-- * Present: a row that becomes handed in (inserted as, or updated from
--   `draft` to, any other status) has both snapshots, checked at COMMIT by a
--   deferred constraint trigger. This release writes them in the hand-in
--   statement itself; the previous release hands in first and writes them
--   a statement later in the same transaction, so a plain CHECK would refuse
--   its submits. Rows handed in before this migration are not re-checked
--   when they are updated later (legacy imports may lack snapshots; nothing
--   can rebuild them). The contract migration adds the CHECK when no
--   handed-in row lacks them.
-- * Shape: a snapshot is a JSON object, like every typed JSONB column.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION submissions_snapshots_frozen() RETURNS trigger AS $$
BEGIN
    IF (OLD.items_snapshot IS NOT NULL AND NEW.items_snapshot IS DISTINCT FROM OLD.items_snapshot)
       OR (OLD.policy_snapshot IS NOT NULL AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot) THEN
        RAISE EXCEPTION 'a submission''s snapshots are written once'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER submissions_snapshots_frozen BEFORE UPDATE OF items_snapshot, policy_snapshot ON submissions
    FOR EACH ROW EXECUTE FUNCTION submissions_snapshots_frozen();

-- Reads the row as it stands at COMMIT, not as the queued statement left it.
CREATE FUNCTION submissions_handed_in_snapshots() RETURNS trigger AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM submissions
               WHERE id = NEW.id AND status <> 'draft'
                 AND (items_snapshot IS NULL OR policy_snapshot IS NULL)) THEN
        RAISE EXCEPTION 'a handed-in submission needs its items and policy snapshots'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER submissions_handed_in_snapshots_insert AFTER INSERT ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status <> 'draft')
    EXECUTE FUNCTION submissions_handed_in_snapshots();
CREATE CONSTRAINT TRIGGER submissions_handed_in_snapshots_update AFTER UPDATE OF status ON submissions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status <> 'draft')
    EXECUTE FUNCTION submissions_handed_in_snapshots();

SELECT schema_try_check('submissions', 'submissions_items_snapshot_check',
    $$items_snapshot IS NULL OR jsonb_typeof(items_snapshot) = 'object'$$);
SELECT schema_try_check('submissions', 'submissions_policy_snapshot_check',
    $$policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot) = 'object'$$);
