-- A leave resets the learner's marks; the event keeps them, so the history can answer what they had done (schema
-- review 30). Nothing reads them yet: the behaviour of leaving and rejoining is unchanged.

SET LOCAL lock_timeout = '5s';

ALTER TABLE enrolment_events ADD COLUMN completions jsonb
    CONSTRAINT enrolment_events_completions_array CHECK (jsonb_typeof(completions) = 'array');
COMMENT ON COLUMN enrolment_events.completions IS
    'On a leave: the [{activity_id, completed_at}] the leave reset. NULL on a join, and on leaves before this column.';
