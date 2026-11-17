-- contract: since 20261116075643 / 20261116075644 the server reads and writes the new table and column names; the
-- old-name views and alias columns kept the release before that one working (REWRITE 5.8 item 9).
SET LOCAL lock_timeout = '5s';

DROP VIEW learning.certifications;
DROP VIEW learning.certificate_users;
DROP VIEW core.course_discussions;

-- The guard fires on the new name alone (its trigger also named the old one, which goes below).
DROP TRIGGER activities_keep_assessment_type ON core.activities;
CREATE TRIGGER activities_keep_assessment_type BEFORE UPDATE OF kind ON core.activities
    FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind) EXECUTE FUNCTION activities_keep_assessment_type();

DROP TRIGGER activities_aliases ON core.activities;
DROP TRIGGER chapters_aliases ON core.chapters;
DROP TRIGGER usergroups_aliases ON core.usergroups;
DROP TRIGGER assessments_aliases ON learning.assessments;
DROP TRIGGER course_updates_aliases ON core.course_updates;
DROP TRIGGER courses_aliases ON core.courses;
DROP TRIGGER blocks_aliases ON core.blocks;
DROP TRIGGER item_feedback_aliases ON learning.item_feedback;
DROP TRIGGER bulk_actions_aliases ON learning.bulk_actions;
DROP TRIGGER assessment_audit_events_aliases ON learning.assessment_audit_events;
DROP TRIGGER teacher_interventions_aliases ON learning.teacher_interventions;
DROP TRIGGER analytics_events_aliases ON analytics.analytics_events;
DROP TRIGGER daily_teacher_metrics_aliases ON analytics.daily_teacher_metrics;
DROP TRIGGER analytics_saved_views_aliases ON analytics.analytics_saved_views;
DROP FUNCTION renamed_columns();

ALTER TABLE core.activities DROP COLUMN creator_id, DROP COLUMN activity_type, DROP COLUMN activity_sub_type;
ALTER TABLE core.chapters DROP COLUMN creator_id;
ALTER TABLE core.usergroups DROP COLUMN creator_id;
ALTER TABLE learning.assessments DROP COLUMN creator_id, DROP COLUMN grading_type, DROP COLUMN lifecycle;
ALTER TABLE core.course_updates DROP COLUMN author_id;
ALTER TABLE core.courses DROP COLUMN thumbnail_type;
ALTER TABLE core.blocks DROP COLUMN block_type;
ALTER TABLE learning.item_feedback DROP COLUMN annotation_type;
ALTER TABLE learning.bulk_actions DROP COLUMN action_type;
ALTER TABLE learning.assessment_audit_events DROP COLUMN actor_id;
ALTER TABLE learning.teacher_interventions DROP COLUMN teacher_user_id, DROP COLUMN intervention_type;
ALTER TABLE analytics.analytics_events DROP COLUMN actor_id, DROP COLUMN event_type;
-- The twin keys of the previous release's upserts (20261116075645, 20261116075646) go with their columns.
ALTER TABLE analytics.daily_teacher_metrics DROP COLUMN teacher_user_id;
ALTER TABLE analytics.analytics_saved_views DROP COLUMN teacher_user_id, DROP COLUMN view_type;
