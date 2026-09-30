-- UX-170: the completion counters count first completions, not XP awards —
-- a completion past the daily XP cap still counts. One row per (user, kind,
-- id) makes the bump idempotent across re-completions (leave → rejoin).

CREATE TABLE gamification_completions (
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('activity', 'course')),
    source_id  text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, source_id)
);

-- Completions already counted through their XP award.
INSERT INTO gamification_completions (user_id, kind, source_id, created_at)
SELECT user_id,
       CASE source WHEN 'activity_completion' THEN 'activity' ELSE 'course' END,
       source_id, created_at
FROM xp_transactions
WHERE source IN ('activity_completion', 'course_completion') AND source_id IS NOT NULL
ON CONFLICT DO NOTHING;
