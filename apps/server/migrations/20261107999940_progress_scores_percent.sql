-- contract: progress scores are exact percentages, not floats (schema review 35). The running release reads them through
-- ::float8 and binds its writes as float8, so it runs on either type. The domain holds the range the checks held.
-- Rewrites both tables under a short lock; production holds about 5000 and 300 rows.

SET LOCAL lock_timeout = '5s';

ALTER TABLE activity_progress DROP CONSTRAINT activity_progress_score_range;
ALTER TABLE activity_progress ALTER COLUMN score TYPE percent USING round(score::numeric, 2);

ALTER TABLE course_progress DROP CONSTRAINT course_progress_grade_average_range;
ALTER TABLE course_progress DROP CONSTRAINT course_progress_weighted_grade_average_range;
ALTER TABLE course_progress
    ALTER COLUMN grade_average TYPE percent USING round(grade_average::numeric, 2),
    ALTER COLUMN weighted_grade_average TYPE percent USING round(weighted_grade_average::numeric, 2);
