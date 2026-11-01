-- course_progress_v (REWRITE 5.4, 5.6 n8 step 4; review item 13): the
-- completion half of course_progress computed from the facts - enrolments
-- (members, never the course's staff) x published activities x completions -
-- instead of stored by the projector. Added beside the projection, read by
-- nobody yet: `maintenance:reconcile` counts the members whose view row and
-- stored row disagree (`course_progress_view_drift`), and readers move to the
-- view only after a month of zero drift in production.
--
-- Per member, over the course's published activities they are required to do:
--   total_required_count     = how many;
--   completed_required_count = how many have a completions row;
--   progress_pct             = completed / total, two decimals, numeric rounding
--                              (course_progress_derive's rule), 0 for none;
--   certificate_eligible     = total > 0 and every one completed;
--   completed_at             = the last of those completions, when eligible.
-- Required: a graded activity (an assessment or a file task) always, any other
-- unless its settings say "required": false (the projector's seed rule); never
-- an assessment restricted to an allowlist the member is not on (BUG-318).
--
-- Known differences from the projection, which the drift count measures: the
-- projection keeps a lesson's `required` from when its row was seeded (the view
-- follows the current settings), and counts a legacy row completed by its state
-- without a completed_at (the view counts completions only). Grade averages and
-- needs-grading stay in the projection: the view reads no score column, so it
-- never blocks a type change of one.

SET LOCAL lock_timeout = '5s';

CREATE VIEW course_progress_v AS
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
           THEN max(r.completed_at) END AS completed_at
FROM enrolments e
LEFT JOIN LATERAL (
    SELECT a.id AS activity_id, c.completed_at
    FROM activities a
    LEFT JOIN completions c ON c.activity_id = a.id AND c.user_id = e.user_id
    WHERE a.course_id = e.course_id AND a.published
      AND (a.activity_type = 'file_submission'
           OR EXISTS (SELECT 1 FROM assessments s WHERE s.activity_id = a.id)
           OR (a.settings->>'required') IS DISTINCT FROM 'false')
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

COMMENT ON VIEW course_progress_v IS
    'A member''s course completion computed from enrolments, published activities and completions; compared with the course_progress projection by maintenance:reconcile until it replaces it (REWRITE 5.6 n8).';
