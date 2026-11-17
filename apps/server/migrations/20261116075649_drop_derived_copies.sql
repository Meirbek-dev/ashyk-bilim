-- contract: since 20261116072922, 20261116074602 and 20261116075628 the server reads each fact from its source and
-- writes only that; the stored copies and the triggers that filled them for the release before go (REWRITE 5.8 item 4).
SET LOCAL lock_timeout = '5s';

-- The levels of an award: xp_transactions_v computes them.
DROP TRIGGER xp_transactions_levels ON learning.xp_transactions;
DROP FUNCTION xp_transactions_levels();
ALTER TABLE learning.xp_transactions DROP COLUMN previous_level, DROP COLUMN triggered_level_up;

-- A feedback row's grader is its grade entry's; a frozen row has no update time. Erasure and deletes may still clear
-- the item and the annotation's upload.
DROP TRIGGER item_feedback_touch ON learning.item_feedback;
CREATE OR REPLACE FUNCTION item_feedback_frozen() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    cleared constant text[] := ARRAY['item_id', 'annotation_upload_id'];
BEGIN
    IF (to_jsonb(NEW) - cleared) IS DISTINCT FROM (to_jsonb(OLD) - cleared)
       OR (NEW.item_id IS DISTINCT FROM OLD.item_id AND NEW.item_id IS NOT NULL) THEN
        RAISE EXCEPTION 'item_feedback rows are part of their grade entry: append a new entry'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
ALTER TABLE learning.item_feedback DROP COLUMN graded_by, DROP COLUMN updated_at;

-- An issued certificate does not change but for its holder's name, and a re-issue has reissued_at.
DROP TRIGGER certificate_users_touch ON learning.certificates;
CREATE OR REPLACE FUNCTION certificate_users_frozen() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF to_jsonb(NEW) - 'holder_name' - 'reissued_at' IS DISTINCT FROM to_jsonb(OLD) - 'holder_name' - 'reissued_at' THEN
        RAISE EXCEPTION 'certificates state what was issued: only the holder name is re-issued'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;
ALTER TABLE learning.certificates DROP COLUMN updated_at;

-- A test result passed when its verdict is accepted or the run is a custom-input run.
DROP TRIGGER code_run_cases_passed ON learning.code_run_cases;
DROP FUNCTION code_run_cases_passed();
ALTER TABLE learning.code_run_cases DROP COLUMN passed;

-- A handed-in file's key, type and size are its upload's.
DROP TRIGGER file_submission_files_from_upload ON learning.file_submission_files;
DROP FUNCTION file_submission_files_from_upload();
ALTER TABLE learning.file_submission_files DROP COLUMN storage_key, DROP COLUMN content_type, DROP COLUMN size_bytes;

-- What an award or a completion is for: the typed columns.
DROP TRIGGER xp_transactions_source_ref ON learning.xp_transactions;
DROP FUNCTION xp_transactions_source_ref();
ALTER TABLE learning.xp_transactions DROP COLUMN source_id;

DROP TRIGGER gamification_completions_source_ref ON learning.gamification_completions;
DROP FUNCTION gamification_completions_source_ref();
-- Every row has its uuid (the backfill of 20261116075628, then the trigger): the typed key becomes the primary key.
ALTER TABLE learning.gamification_completions DROP COLUMN source_id;
ALTER TABLE learning.gamification_completions ALTER COLUMN source_uuid SET NOT NULL;
ALTER TABLE learning.gamification_completions ADD CONSTRAINT gamification_completions_pkey
    PRIMARY KEY USING INDEX gamification_completions_user_kind_source_uuid_key;
