-- contract: course_updates.linked_activity_ids moved to course_update_activities
-- (20261102040000). No release reads or writes the array; the backfill re-runs for rows written
-- in between (none expected), then the column goes.

SET LOCAL lock_timeout = '5s';

INSERT INTO course_update_activities (update_id, activity_id, position)
SELECT u.id, l.activity_id, min(l.ord)::integer
  FROM course_updates u
 CROSS JOIN LATERAL unnest(u.linked_activity_ids) WITH ORDINALITY AS l (activity_id, ord)
 WHERE EXISTS (SELECT 1 FROM activities a WHERE a.id = l.activity_id)
 GROUP BY u.id, l.activity_id
ON CONFLICT DO NOTHING;

ALTER TABLE course_updates DROP COLUMN linked_activity_ids;
