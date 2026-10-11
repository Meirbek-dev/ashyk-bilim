-- A live quiz/exam/code task needs at least one question: publishing checks it (readiness
-- `assessment.empty`) and deleting the last question of a live one is refused. Migrated data broke
-- it: production «Стандартизация, метрология и сертификация» has a published exam with no questions.
-- It counted as required, a learner could start it, hand in nothing and score 0 % with no attempt
-- left - the course could never be completed and the 0 pulled the grade average down.
-- Back to draft (its teacher still sees it and publishes it with questions), activity hidden, and
-- the touched courses' progress recalculated (worker job), as 20261010000003 did for file tasks.
WITH emptied AS (
    UPDATE assessments a
    SET lifecycle = 'draft', scheduled_at = NULL
    WHERE a.lifecycle IN ('published', 'scheduled')
      AND NOT EXISTS (SELECT 1 FROM assessment_items i WHERE i.assessment_id = a.id)
    RETURNING a.activity_id
),
hidden AS (
    UPDATE activities act
    SET published = false, version = act.version + 1
    FROM emptied e
    WHERE act.id = e.activity_id
    RETURNING act.course_id
)
INSERT INTO jobs (kind, payload, max_attempts)
SELECT 'progress:course-change', jsonb_build_object('course_id', course_id), 10
FROM (SELECT DISTINCT course_id FROM hidden) c;
