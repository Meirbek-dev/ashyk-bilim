-- contract: assessments.title / kind were copies of the activity's name / type (schema review 2, item 5).
--
-- The release before this one reads both from `activities` and writes
-- neither; the sync triggers of 20261102020400 go with the columns. A kind
-- that disagrees with its activity's type stops the deploy (nothing is
-- dropped) instead of silently changing what the assessment is.

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM assessments s JOIN activities a ON a.id = s.activity_id
               WHERE s.kind <> a.activity_type) THEN
        RAISE EXCEPTION 'an assessment''s kind differs from its activity''s type; fix the rows first';
    END IF;
END;
$$;

DROP TRIGGER activities_rename_assessment ON activities;
DROP FUNCTION activities_rename_assessment();
DROP TRIGGER assessments_copy_activity_name ON assessments;
DROP FUNCTION assessments_copy_activity_name();
ALTER TABLE assessments DROP COLUMN title, DROP COLUMN kind;
