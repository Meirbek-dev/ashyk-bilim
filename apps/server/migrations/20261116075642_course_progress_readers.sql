-- Planned work pulled forward, part 1 (REWRITE 5.8 item 8, 5.6 n8 step 4): readers move to course_progress_v.
--
-- The owner moved them without the four weekly zero-drift runs. The view gains the columns of the stored
-- course_progress that readers still took from it, over the same required rows: the missing count, what
-- waits for a teacher, the last activity and the grade averages (`activity_progress.score`, weighted by
-- `assessments.weight`, a missing weight counting 1 and a weight of 0 or less left out: the projector's
-- `aggregate_course`). The view now reads a score column: a type change of `activity_progress.score` has to
-- recreate it (scores are numeric `percent` since 5.6 n16, none is planned).
--
-- Switch release: the projector still writes `course_progress` for the previous release, which reads it, and
-- keeps reading it itself to notice the course's completion; `maintenance:reconcile` keeps logging
-- `view_drift`. A later release stops writing it, then a contract drops the table and renames the view
-- (pending-contracts.tsv). Columns are only added at the end: the previous release's drift query reads the old ones.
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE VIEW core.course_progress_v AS
SELECT e.course_id,
       e.user_id,
       count(r.activity_id)::integer AS total_required_count,
       count(r.completed_at)::integer AS completed_required_count,
       CASE WHEN count(r.activity_id) > 0
           THEN round(count(r.completed_at) * 100.0 / count(r.activity_id), 2)::double precision
           ELSE 0 END AS progress_pct,
       count(r.activity_id) > 0 AND count(r.completed_at) = count(r.activity_id)
           AS certificate_eligible,
       CASE WHEN count(r.activity_id) > 0 AND count(r.completed_at) = count(r.activity_id)
           THEN max(r.completed_at) END AS completed_at,
       (count(r.activity_id) - count(r.completed_at))::integer AS missing_required_count,
       (count(*) FILTER (WHERE r.teacher_action_required))::integer AS needs_grading_count,
       max(r.last_activity_at) AS last_activity_at,
       round(avg(r.score), 2) AS grade_average,
       round(sum(r.score * r.weight) FILTER (WHERE r.weight > 0)
             / nullif(sum(r.weight) FILTER (WHERE r.weight > 0 AND r.score IS NOT NULL), 0), 2)
           AS weighted_grade_average
FROM enrolments e
LEFT JOIN LATERAL (
    SELECT a.id AS activity_id, c.completed_at, p.score, p.teacher_action_required, p.last_activity_at,
           coalesce((SELECT s.weight FROM assessments s WHERE s.activity_id = a.id), 1) AS weight
    FROM activities a
    LEFT JOIN completions c ON c.activity_id = a.id AND c.user_id = e.user_id
    LEFT JOIN activity_progress p ON p.activity_id = a.id AND p.user_id = e.user_id
    WHERE a.course_id = e.course_id AND a.published
      AND (a.activity_type = 'file_submission'
           OR EXISTS (SELECT 1 FROM assessments s WHERE s.activity_id = a.id)
           OR a.required)
      AND NOT EXISTS (
          SELECT 1 FROM assessments s
          WHERE s.activity_id = a.id AND s.access_mode = 'restricted'
            AND NOT EXISTS (SELECT 1 FROM assessment_access_users u
                            WHERE u.assessment_id = s.id AND u.user_id = e.user_id)
            AND NOT EXISTS (SELECT 1 FROM assessment_access_usergroups g
                            JOIN usergroup_members m ON m.usergroup_id = g.usergroup_id
                            WHERE g.assessment_id = s.id AND m.user_id = e.user_id))
) r ON true
WHERE NOT is_course_staff(e.course_id, e.user_id)
GROUP BY e.course_id, e.user_id;
