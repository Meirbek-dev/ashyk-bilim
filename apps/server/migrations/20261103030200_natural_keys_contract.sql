-- contract: the surrogate ids of the naturally keyed projections and rollups
-- go (REWRITE 5.6 n12). Their primary keys moved to the natural key in
-- 20261102030309; no release since reads or writes `id`.

SET LOCAL lock_timeout = '5s';

ALTER TABLE activity_progress DROP COLUMN id;
ALTER TABLE course_progress DROP COLUMN id;
ALTER TABLE gamification_profiles DROP COLUMN id;
ALTER TABLE daily_course_metrics DROP COLUMN id;
ALTER TABLE daily_course_engagement DROP COLUMN id;
ALTER TABLE daily_assessment_metrics DROP COLUMN id;
ALTER TABLE daily_user_course_progress DROP COLUMN id;
ALTER TABLE learner_risk_snapshots DROP COLUMN id;
