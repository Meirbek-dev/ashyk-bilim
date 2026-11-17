-- contract: since the rollups stopped writing a course's teacher, 20261116075640 moved the last login to `users` and
-- 20261116075641 had the server number a grade entry and set its points; the copies and the triggers that filled
-- them for the release before go (REWRITE 5.8 item 7). The journal guards stay.
SET LOCAL lock_timeout = '5s';

-- A course has several staff: per-teacher numbers are daily_teacher_metrics. The foreign keys go with the columns.
ALTER TABLE analytics.daily_course_metrics DROP COLUMN teacher_user_id;
ALTER TABLE analytics.learner_risk_snapshots DROP COLUMN teacher_user_id;

DROP TRIGGER gamification_profiles_last_login ON learning.gamification_profiles;
DROP FUNCTION gamification_profiles_last_login();
DROP TRIGGER users_last_login ON core.users;
DROP FUNCTION users_last_login();
ALTER TABLE learning.gamification_profiles DROP COLUMN last_login_at;

DROP TRIGGER grading_entries_number ON learning.grading_entries;
DROP FUNCTION grading_entries_number();
DROP TRIGGER grading_entries_points ON learning.grading_entries;
DROP FUNCTION grading_entries_points();
