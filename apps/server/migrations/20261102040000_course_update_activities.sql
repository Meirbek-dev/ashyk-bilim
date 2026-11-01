-- course_updates.linked_activity_ids -> course_update_activities (schema review item 19,
-- REWRITE 5.6 n3).
--
-- The array named activities without a key: a deleted activity stayed in it. No code reads or
-- writes it any more (the import filled it); the link table keeps those links as checked keys,
-- in the array's order. Backfill: each array element that still names an activity, first
-- occurrence wins. The array is dropped by 20261103040000 (contract).

SET LOCAL lock_timeout = '5s';

CREATE TABLE course_update_activities (
    update_id   uuid NOT NULL REFERENCES course_updates (id) ON DELETE CASCADE,
    activity_id uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    position    integer NOT NULL CHECK (position >= 1),
    PRIMARY KEY (update_id, activity_id)
);
CREATE INDEX course_update_activities_activity_idx ON course_update_activities (activity_id);

INSERT INTO course_update_activities (update_id, activity_id, position)
SELECT u.id, l.activity_id, min(l.ord)::integer
  FROM course_updates u
 CROSS JOIN LATERAL unnest(u.linked_activity_ids) WITH ORDINALITY AS l (activity_id, ord)
 WHERE EXISTS (SELECT 1 FROM activities a WHERE a.id = l.activity_id)
 GROUP BY u.id, l.activity_id;
