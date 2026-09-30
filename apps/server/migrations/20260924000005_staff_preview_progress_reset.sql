-- UX-186: 20260924000004 flagged the staff previews but left the
-- activity_progress they had already been projected into (needs_grading in
-- the teacher work queue). A projection never reads previews (UX-182), so a
-- row whose only work is previews is the projection of nothing: reset it to
-- the seeded state, as a re-projection would.
UPDATE activity_progress p
SET state = 'not_started', score = NULL, passed = NULL,
    best_submission_id = NULL, latest_submission_id = NULL, attempt_count = 0,
    started_at = NULL, last_activity_at = NULL, submitted_at = NULL,
    graded_at = NULL, completed_at = NULL, is_late = false,
    teacher_action_required = false, status_reason = NULL
WHERE (EXISTS (SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
               WHERE a.activity_id = p.activity_id AND s.user_id = p.user_id AND s.preview)
       OR EXISTS (SELECT 1 FROM file_submission_attempts fa
                  JOIN file_submissions f ON f.id = fa.file_submission_id
                  WHERE f.activity_id = p.activity_id AND fa.user_id = p.user_id AND fa.preview))
  AND NOT EXISTS (SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
                  WHERE a.activity_id = p.activity_id AND s.user_id = p.user_id AND NOT s.preview)
  AND NOT EXISTS (SELECT 1 FROM file_submission_attempts fa
                  JOIN file_submissions f ON f.id = fa.file_submission_id
                  WHERE f.activity_id = p.activity_id AND fa.user_id = p.user_id
                    AND NOT fa.preview);
