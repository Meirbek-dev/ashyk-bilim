-- Migrated legacy "ASSIGNMENT" activities came over as file tasks whose config
-- stayed a `draft` (no instructions, nothing to hand in) while the activity
-- stayed published - the one place where "a published activity has a published
-- backing object" (curriculum `require_publishable`) did not hold. Learners
-- opened «Задание ещё не настроено», and the task still counted as required, so
-- 100 % and the certificate were out of reach on every course that has one.
-- Unpublish them (their teachers still see them and publish them with the config)
-- and recalculate the touched courses' progress (worker job, issues certificates).
WITH hidden AS (
    UPDATE activities a
    SET published = false, version = a.version + 1
    WHERE a.activity_type = 'file_submission'
      AND a.published
      AND NOT EXISTS (
          SELECT 1 FROM file_submissions fs
          WHERE fs.activity_id = a.id AND fs.lifecycle = 'published'
      )
    RETURNING a.course_id
)
INSERT INTO jobs (kind, payload, max_attempts)
SELECT 'progress:course-change', jsonb_build_object('course_id', course_id), 10
FROM (SELECT DISTINCT course_id FROM hidden) c;
