-- Anti-cheat evidence (schema review 34): submissions.violations keeps only the newest events; the table keeps
-- them all. The array and the counter stay what the API reads.

SET LOCAL lock_timeout = '5s';

CREATE TABLE learning.submission_violations (
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    submission_id uuid NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
    event         jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
    created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE learning.submission_violations IS
    'One anti-cheat event of an attempt, appended as it is reported. Evidence: the app cannot rewrite it.';
CREATE INDEX submission_violations_submission_idx ON learning.submission_violations (submission_id, created_at);

INSERT INTO learning.submission_violations (submission_id, event)
SELECT s.id, e.event
FROM submissions s CROSS JOIN LATERAL jsonb_array_elements(s.violations) AS e(event)
WHERE jsonb_typeof(s.violations) = 'array' AND jsonb_typeof(e.event) = 'object';
