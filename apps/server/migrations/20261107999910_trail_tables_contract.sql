-- contract: the trail tables went unread and unwritten in the release before this one (schema review 3). Membership is
-- enrolments, a lesson mark is completions. Runs add nothing to enrolments (production: every run `in_progress`, same
-- date, empty data), and steps add nothing to completions except a learner's marks on graded activities, which no
-- projection took up (schema review 3; production: 74). Those stay, as trail_legacy_marks.

SET LOCAL lock_timeout = '5s';

CREATE TABLE learning.trail_legacy_marks (
    activity_id uuid NOT NULL,
    course_id   uuid NOT NULL,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    marked_at   timestamptz NOT NULL,
    PRIMARY KEY (activity_id, user_id),
    FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE
);
CREATE INDEX trail_legacy_marks_user_idx ON learning.trail_legacy_marks (user_id);
COMMENT ON TABLE learning.trail_legacy_marks IS
    'A complete mark of the old trail on a graded activity that no completion took up. History only: nothing reads it, and it counts for no progress.';

-- A step of someone who has left since the last release is their reset mark, kept by the leave's event.
INSERT INTO learning.trail_legacy_marks (activity_id, course_id, user_id, marked_at)
SELECT s.activity_id, s.course_id, s.user_id, s.created_at
FROM trail_steps s
JOIN enrolments e ON e.course_id = s.course_id AND e.user_id = s.user_id
WHERE s.complete
  AND NOT EXISTS (SELECT FROM completions c WHERE c.activity_id = s.activity_id AND c.user_id = s.user_id);

ALTER TABLE daily_user_course_progress DROP COLUMN trail_run_id;
DROP TABLE trail_steps;
DROP TABLE trail_runs;
DROP TABLE trails;
