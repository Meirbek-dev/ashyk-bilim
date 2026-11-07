-- Membership history (schema review 30): enrolments says who is in a course now; a leave deleted the only trace.
-- The events keep no key onto the course, so a purged course's roster stays explainable.

SET LOCAL lock_timeout = '5s';

CREATE TABLE learning.enrolment_events (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    course_id  uuid NOT NULL,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event      text NOT NULL CHECK (event IN ('joined', 'left')),
    source     text NOT NULL CHECK (source IN ('self', 'staff', 'backfill')),
    created_by uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE learning.enrolment_events IS
    'One join or leave of a course, appended by enrol/unenrol. Survives the course; erased with the person.';
COMMENT ON COLUMN learning.enrolment_events.source IS
    'self: the learner; staff: someone on their behalf; backfill: the enrolment existed when this table was made.';
CREATE INDEX enrolment_events_course_user_idx ON learning.enrolment_events (course_id, user_id, created_at);
CREATE INDEX enrolment_events_user_idx ON learning.enrolment_events (user_id);
CREATE INDEX enrolment_events_created_by_idx ON learning.enrolment_events (created_by) WHERE created_by IS NOT NULL;

INSERT INTO learning.enrolment_events (course_id, user_id, event, source, created_at)
SELECT course_id, user_id, 'joined', 'backfill', enrolled_at FROM enrolments;
