-- BUG-185: one active (unpassed) gate per learner and activity — the
-- enqueue-time check cannot see a sibling job still in flight. Stacked
-- duplicates (all but the earliest) become plain sessions first.
UPDATE ai_remediation_sessions s SET gate_mode = false
 WHERE s.gate_mode AND s.status IN ('assigned', 'in_progress', 'failed')
   AND EXISTS (SELECT 1 FROM ai_remediation_sessions e
                WHERE e.student_user_id = s.student_user_id AND e.activity_id = s.activity_id
                  AND e.gate_mode AND e.status IN ('assigned', 'in_progress', 'failed')
                  AND (e.created_at, e.id) < (s.created_at, s.id));
CREATE UNIQUE INDEX ai_remediation_sessions_active_gate_uidx
    ON ai_remediation_sessions (student_user_id, activity_id)
    WHERE gate_mode AND status IN ('assigned', 'in_progress', 'failed');
