-- Hand erasure of a grader, and a deleted account stays disabled.
--
-- graded_by on both grade journals is ON DELETE SET NULL (an actor column,
-- 20261101210300), but the journal guards refused that UPDATE, so deleting
-- any user who ever graded failed (RUNBOOK 2.3). Clearing the grader is now
-- the one extra change a journal row takes; naming another grader is still
-- refused.
--
-- anonymise_user sets deleted_at with status = 'disabled', and
-- set_user_status refuses to re-enable a deleted account outside its
-- transaction; the check holds it for every writer.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION grading_entries_guard() RETURNS trigger AS $$
BEGIN
    IF to_jsonb(NEW) - 'published_at' - 'graded_by' IS DISTINCT FROM to_jsonb(OLD) - 'published_at' - 'graded_by'
       OR (NEW.graded_by IS DISTINCT FROM OLD.graded_by AND NEW.graded_by IS NOT NULL) THEN
        RAISE EXCEPTION 'grading_entries rows are immutable except published_at'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION file_grading_entries_immutable() RETURNS trigger AS $$
BEGIN
    IF to_jsonb(NEW) - 'graded_by' IS DISTINCT FROM to_jsonb(OLD) - 'graded_by'
       OR NEW.graded_by IS NOT NULL THEN
        RAISE EXCEPTION 'file_grading_entries is append-only' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

SET LOCAL ab.bookkeeping = 'on';
UPDATE users SET status = 'disabled' WHERE deleted_at IS NOT NULL AND status <> 'disabled';
SELECT schema_try_check('users', 'users_deleted_disabled_check',
    $c$deleted_at IS NULL OR status = 'disabled'$c$);
