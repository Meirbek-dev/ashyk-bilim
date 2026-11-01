-- Schema review item 4: a learner's counted attempts are numbered 1, 2, 3...
-- per task. The app computes the next number (completed + 1, under the
-- per-learner lock for quizzes; the open-attempt index for file tasks);
-- the database now refuses a second attempt with the same number.
-- Staff previews keep their own numbering and stay outside the key.
--
-- Repair first (deterministic): a learner whose counted attempts at one task
-- share a number is renumbered 1..n in (attempt_number, submitted_at,
-- started_at, created_at, id) order. Learners without a duplicate keep
-- their numbers untouched. A repair is bookkeeping: updated_at stays.

SET LOCAL ab.bookkeeping = 'on';

WITH dup AS (
    SELECT assessment_id, user_id FROM submissions WHERE NOT preview
    GROUP BY assessment_id, user_id
    HAVING count(*) <> count(DISTINCT attempt_number)
), renumbered AS (
    SELECT s.id,
           row_number() OVER (PARTITION BY s.assessment_id, s.user_id
                              ORDER BY s.attempt_number, s.submitted_at NULLS LAST,
                                       s.started_at NULLS LAST, s.created_at, s.id) AS n
    FROM submissions s JOIN dup USING (assessment_id, user_id)
    WHERE NOT s.preview
)
UPDATE submissions s SET attempt_number = r.n
FROM renumbered r WHERE r.id = s.id AND s.attempt_number <> r.n;

WITH dup AS (
    SELECT file_submission_id, user_id FROM file_submission_attempts WHERE NOT preview
    GROUP BY file_submission_id, user_id
    HAVING count(*) <> count(DISTINCT attempt_number)
), renumbered AS (
    SELECT a.id,
           row_number() OVER (PARTITION BY a.file_submission_id, a.user_id
                              ORDER BY a.attempt_number, a.submitted_at NULLS LAST,
                                       a.started_at NULLS LAST, a.created_at, a.id) AS n
    FROM file_submission_attempts a JOIN dup USING (file_submission_id, user_id)
    WHERE NOT a.preview
)
UPDATE file_submission_attempts a SET attempt_number = r.n
FROM renumbered r WHERE r.id = a.id AND a.attempt_number <> r.n;

CREATE UNIQUE INDEX submissions_attempt_number_key
    ON submissions (assessment_id, user_id, attempt_number) WHERE NOT preview;
CREATE UNIQUE INDEX file_submission_attempts_attempt_number_key
    ON file_submission_attempts (file_submission_id, user_id, attempt_number) WHERE NOT preview;
