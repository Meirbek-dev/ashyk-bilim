-- Names, part 2 (REWRITE 5.8 item 9, 5.6 n15): the columns that break the naming convention (ARCHITECTURE §8
-- rule 2), but the AI tables' and the ones a contract drops anyway (REWRITE 5.8 item 9 says why).
--
-- Each column is renamed in place (its constraints, indexes, keys and the views that read it follow), and its old
-- name comes back as a plain column for the previous release, backfilled. Switch release: `renamed_columns()`
-- keeps each pair equal whichever name the writer used (on insert the old name wins when it is set: only the
-- previous release sets it). Its trigger `<table>_aliases` sorts before the table's other BEFORE triggers, so they
-- see both names equal. Two upserts of the previous release infer their key from old names: those keys get a twin
-- on the old columns (the next two files). A contract drops the old columns (their twin keys with them) and the
-- triggers (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';
-- The backfills keep each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

-- Arguments: pairs of (old name, new name).
CREATE FUNCTION renamed_columns() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
DECLARE
    n jsonb := to_jsonb(NEW);
    o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
    d jsonb := '{}';
    old_name text;
    new_name text;
BEGIN
    FOR i IN 0 .. TG_NARGS / 2 - 1 LOOP
        old_name := TG_ARGV[2 * i];
        new_name := TG_ARGV[2 * i + 1];
        IF TG_OP = 'INSERT' THEN
            IF jsonb_typeof(n -> old_name) <> 'null' THEN
                d := d || jsonb_build_object(new_name, n -> old_name);
            ELSE
                d := d || jsonb_build_object(old_name, n -> new_name);
            END IF;
        ELSIF n -> new_name IS DISTINCT FROM o -> new_name THEN
            d := d || jsonb_build_object(old_name, n -> new_name);
        ELSIF n -> old_name IS DISTINCT FROM o -> old_name THEN
            d := d || jsonb_build_object(new_name, n -> old_name);
        END IF;
    END LOOP;
    RETURN jsonb_populate_record(NEW, d);
END $$;

ALTER TABLE core.activities RENAME COLUMN creator_id TO created_by;
ALTER TABLE core.activities RENAME COLUMN activity_type TO kind;
ALTER TABLE core.activities RENAME COLUMN activity_sub_type TO sub_kind;
ALTER TABLE core.activities ADD COLUMN creator_id uuid, ADD COLUMN activity_type text, ADD COLUMN activity_sub_type text;
UPDATE core.activities SET creator_id = created_by, activity_type = kind, activity_sub_type = sub_kind;
CREATE TRIGGER activities_aliases BEFORE INSERT OR UPDATE ON core.activities FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('creator_id', 'created_by', 'activity_type', 'kind', 'activity_sub_type', 'sub_kind');
-- The guard also sees the previous release's change of the old name (the aliases copied it).
DROP TRIGGER activities_keep_assessment_type ON core.activities;
CREATE TRIGGER activities_keep_assessment_type BEFORE UPDATE OF kind, activity_type ON core.activities
    FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind) EXECUTE FUNCTION activities_keep_assessment_type();

ALTER TABLE core.chapters RENAME COLUMN creator_id TO created_by;
ALTER TABLE core.chapters ADD COLUMN creator_id uuid;
UPDATE core.chapters SET creator_id = created_by;
CREATE TRIGGER chapters_aliases BEFORE INSERT OR UPDATE ON core.chapters FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('creator_id', 'created_by');

ALTER TABLE core.usergroups RENAME COLUMN creator_id TO created_by;
ALTER TABLE core.usergroups ADD COLUMN creator_id uuid;
UPDATE core.usergroups SET creator_id = created_by;
CREATE TRIGGER usergroups_aliases BEFORE INSERT OR UPDATE ON core.usergroups FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('creator_id', 'created_by');

ALTER TABLE learning.assessments RENAME COLUMN creator_id TO created_by;
ALTER TABLE learning.assessments RENAME COLUMN grading_type TO grading_kind;
ALTER TABLE learning.assessments RENAME COLUMN lifecycle TO status;
ALTER TABLE learning.assessments ADD COLUMN creator_id uuid, ADD COLUMN grading_type text, ADD COLUMN lifecycle text;
UPDATE learning.assessments SET creator_id = created_by, grading_type = grading_kind, lifecycle = status;
CREATE TRIGGER assessments_aliases BEFORE INSERT OR UPDATE ON learning.assessments FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('creator_id', 'created_by', 'grading_type', 'grading_kind', 'lifecycle', 'status');

ALTER TABLE core.course_updates RENAME COLUMN author_id TO created_by;
ALTER TABLE core.course_updates ADD COLUMN author_id uuid;
UPDATE core.course_updates SET author_id = created_by;
CREATE TRIGGER course_updates_aliases BEFORE INSERT OR UPDATE ON core.course_updates FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('author_id', 'created_by');

ALTER TABLE core.courses RENAME COLUMN thumbnail_type TO thumbnail_kind;
ALTER TABLE core.courses ADD COLUMN thumbnail_type text;
UPDATE core.courses SET thumbnail_type = thumbnail_kind;
CREATE TRIGGER courses_aliases BEFORE INSERT OR UPDATE ON core.courses FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('thumbnail_type', 'thumbnail_kind');

ALTER TABLE core.blocks RENAME COLUMN block_type TO kind;
ALTER TABLE core.blocks ADD COLUMN block_type text;
UPDATE core.blocks SET block_type = kind;
CREATE TRIGGER blocks_aliases BEFORE INSERT OR UPDATE ON core.blocks FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('block_type', 'kind');

-- A journal: rows are never rewritten, but this one backfill of the new column.
ALTER TABLE learning.item_feedback RENAME COLUMN annotation_type TO kind;
ALTER TABLE learning.item_feedback ADD COLUMN annotation_type text;
ALTER TABLE learning.item_feedback DISABLE TRIGGER item_feedback_frozen;
UPDATE learning.item_feedback SET annotation_type = kind;
ALTER TABLE learning.item_feedback ENABLE TRIGGER item_feedback_frozen;
CREATE TRIGGER item_feedback_aliases BEFORE INSERT OR UPDATE ON learning.item_feedback FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('annotation_type', 'kind');

ALTER TABLE learning.bulk_actions RENAME COLUMN action_type TO kind;
ALTER TABLE learning.bulk_actions ADD COLUMN action_type text;
UPDATE learning.bulk_actions SET action_type = kind;
CREATE TRIGGER bulk_actions_aliases BEFORE INSERT OR UPDATE ON learning.bulk_actions FOR EACH ROW
    EXECUTE FUNCTION renamed_columns('action_type', 'kind');

ALTER TABLE learning.assessment_audit_events RENAME COLUMN actor_id TO performed_by;
ALTER TABLE learning.assessment_audit_events ADD COLUMN actor_id uuid;
UPDATE learning.assessment_audit_events SET actor_id = performed_by;
CREATE TRIGGER assessment_audit_events_aliases BEFORE INSERT OR UPDATE ON learning.assessment_audit_events
    FOR EACH ROW EXECUTE FUNCTION renamed_columns('actor_id', 'performed_by');

ALTER TABLE learning.teacher_interventions RENAME COLUMN teacher_user_id TO created_by;
ALTER TABLE learning.teacher_interventions RENAME COLUMN intervention_type TO kind;
ALTER TABLE learning.teacher_interventions ADD COLUMN teacher_user_id uuid, ADD COLUMN intervention_type text;
UPDATE learning.teacher_interventions SET teacher_user_id = created_by, intervention_type = kind;
CREATE TRIGGER teacher_interventions_aliases BEFORE INSERT OR UPDATE ON learning.teacher_interventions
    FOR EACH ROW EXECUTE FUNCTION renamed_columns('teacher_user_id', 'created_by', 'intervention_type', 'kind');

-- Partitioned: the partitions take the columns and the trigger.
ALTER TABLE analytics.analytics_events RENAME COLUMN actor_id TO performed_by;
ALTER TABLE analytics.analytics_events RENAME COLUMN event_type TO event;
ALTER TABLE analytics.analytics_events ADD COLUMN actor_id uuid, ADD COLUMN event_type text;
UPDATE analytics.analytics_events SET actor_id = performed_by, event_type = event;
CREATE TRIGGER analytics_events_aliases BEFORE INSERT OR UPDATE ON analytics.analytics_events
    FOR EACH ROW EXECUTE FUNCTION renamed_columns('actor_id', 'performed_by', 'event_type', 'event');

ALTER TABLE analytics.daily_teacher_metrics RENAME COLUMN teacher_user_id TO teacher_id;
ALTER TABLE analytics.daily_teacher_metrics ADD COLUMN teacher_user_id uuid;
UPDATE analytics.daily_teacher_metrics SET teacher_user_id = teacher_id;
CREATE TRIGGER daily_teacher_metrics_aliases BEFORE INSERT OR UPDATE ON analytics.daily_teacher_metrics
    FOR EACH ROW EXECUTE FUNCTION renamed_columns('teacher_user_id', 'teacher_id');

ALTER TABLE analytics.analytics_saved_views RENAME COLUMN teacher_user_id TO user_id;
ALTER TABLE analytics.analytics_saved_views RENAME COLUMN view_type TO kind;
ALTER TABLE analytics.analytics_saved_views ADD COLUMN teacher_user_id uuid, ADD COLUMN view_type text;
UPDATE analytics.analytics_saved_views SET teacher_user_id = user_id, view_type = kind;
CREATE TRIGGER analytics_saved_views_aliases BEFORE INSERT OR UPDATE ON analytics.analytics_saved_views
    FOR EACH ROW EXECUTE FUNCTION renamed_columns('teacher_user_id', 'user_id', 'view_type', 'kind');

COMMENT ON FUNCTION renamed_columns() IS
    'Keeps a renamed column and its old name (for the previous release) equal; a contract drops both.';

-- Column grants of ashyq_ro (item_feedback, teacher_interventions) name every column: re-run them for the new ones.
SELECT apply_role_grants(current_user);
