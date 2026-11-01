-- Natural keys (REWRITE 5.6 n12): projections and rollups are keyed by what
-- they describe, not a uuid nobody looks up. The code reads them by the
-- natural key now (prune batches by ctid, the leaderboard keyset and work
-- item ids by user/activity); the unique index built CONCURRENTLY in the
-- files before this one becomes the primary key and the old unique
-- constraint goes (same columns, so ON CONFLICT (...) of both releases still
-- infers it).
--
-- `id` stays, NOT NULL with its default, for the previous release, which
-- still selects it; the lane C contract migration drops it.
-- daily_teacher_metrics keeps its surrogate key (nullable teacher,
-- NULLS NOT DISTINCT).

SET LOCAL lock_timeout = '5s';

ALTER TABLE activity_progress
    DROP CONSTRAINT activity_progress_pkey,
    DROP CONSTRAINT activity_progress_activity_id_user_id_key,
    ADD CONSTRAINT activity_progress_pkey PRIMARY KEY USING INDEX activity_progress_natural_key;
ALTER TABLE activity_progress ALTER COLUMN id SET NOT NULL;

ALTER TABLE course_progress
    DROP CONSTRAINT course_progress_pkey,
    DROP CONSTRAINT course_progress_course_id_user_id_key,
    ADD CONSTRAINT course_progress_pkey PRIMARY KEY USING INDEX course_progress_natural_key;
ALTER TABLE course_progress ALTER COLUMN id SET NOT NULL;

ALTER TABLE gamification_profiles
    DROP CONSTRAINT gamification_profiles_pkey,
    DROP CONSTRAINT gamification_profiles_user_id_key,
    ADD CONSTRAINT gamification_profiles_pkey PRIMARY KEY USING INDEX gamification_profiles_natural_key;
ALTER TABLE gamification_profiles ALTER COLUMN id SET NOT NULL;

ALTER TABLE daily_course_metrics
    DROP CONSTRAINT daily_course_metrics_pkey,
    DROP CONSTRAINT daily_course_metrics_metric_date_course_id_key,
    ADD CONSTRAINT daily_course_metrics_pkey PRIMARY KEY USING INDEX daily_course_metrics_natural_key;
ALTER TABLE daily_course_metrics ALTER COLUMN id SET NOT NULL;

ALTER TABLE daily_course_engagement
    DROP CONSTRAINT daily_course_engagement_pkey,
    DROP CONSTRAINT daily_course_engagement_metric_date_activity_id_key,
    ADD CONSTRAINT daily_course_engagement_pkey PRIMARY KEY USING INDEX daily_course_engagement_natural_key;
ALTER TABLE daily_course_engagement ALTER COLUMN id SET NOT NULL;

ALTER TABLE daily_assessment_metrics
    DROP CONSTRAINT daily_assessment_metrics_pkey,
    DROP CONSTRAINT daily_assessment_metrics_metric_date_assessment_id_key,
    ADD CONSTRAINT daily_assessment_metrics_pkey PRIMARY KEY USING INDEX daily_assessment_metrics_natural_key;
ALTER TABLE daily_assessment_metrics ALTER COLUMN id SET NOT NULL;

ALTER TABLE daily_user_course_progress
    DROP CONSTRAINT daily_user_course_progress_pkey,
    DROP CONSTRAINT daily_user_course_progress_metric_date_user_id_course_id_key,
    ADD CONSTRAINT daily_user_course_progress_pkey PRIMARY KEY USING INDEX daily_user_course_progress_natural_key;
ALTER TABLE daily_user_course_progress ALTER COLUMN id SET NOT NULL;

ALTER TABLE learner_risk_snapshots
    DROP CONSTRAINT learner_risk_snapshots_pkey,
    DROP CONSTRAINT learner_risk_snapshots_snapshot_date_user_id_course_id_key,
    ADD CONSTRAINT learner_risk_snapshots_pkey PRIMARY KEY USING INDEX learner_risk_snapshots_natural_key;
ALTER TABLE learner_risk_snapshots ALTER COLUMN id SET NOT NULL;
