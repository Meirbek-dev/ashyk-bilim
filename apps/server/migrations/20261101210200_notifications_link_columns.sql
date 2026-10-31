-- Schema review item 9: the course and activity a notification links into
-- become real columns with foreign keys. They are generated from the typed
-- payload (NotificationPayload always writes uuid strings), so no writer can
-- forget them; deleting a course or activity now removes its notifications
-- through the key (catalog::delete_course used a payload scan for courses;
-- activity deletes left links that answered «not found»).
--
-- Repair first: a notification whose payload names a malformed id, or a
-- course / activity that no longer exists, links nowhere and is deleted
-- (the same rule delete_course applied to its own notifications).

DELETE FROM notifications
WHERE (payload ? 'course_id' AND jsonb_typeof(payload->'course_id') <> 'null'
       AND (jsonb_typeof(payload->'course_id') <> 'string'
            OR payload->>'course_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            OR NOT EXISTS (SELECT 1 FROM courses c WHERE c.id::text = lower(payload->>'course_id'))))
   OR (payload ? 'activity_id' AND jsonb_typeof(payload->'activity_id') <> 'null'
       AND (jsonb_typeof(payload->'activity_id') <> 'string'
            OR payload->>'activity_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            OR NOT EXISTS (SELECT 1 FROM activities a WHERE a.id::text = lower(payload->>'activity_id'))));

ALTER TABLE notifications
    ADD COLUMN course_id uuid GENERATED ALWAYS AS ((payload->>'course_id')::uuid) STORED
        REFERENCES courses (id) ON DELETE CASCADE,
    ADD COLUMN activity_id uuid GENERATED ALWAYS AS ((payload->>'activity_id')::uuid) STORED
        REFERENCES activities (id) ON DELETE CASCADE;

CREATE INDEX notifications_course_idx ON notifications (course_id);
CREATE INDEX notifications_activity_idx ON notifications (activity_id);

-- The unread work_submitted fold reads the column now.
DROP INDEX notifications_unread_work_idx;
CREATE INDEX notifications_unread_work_idx ON notifications (user_id, activity_id)
    WHERE kind = 'work_submitted' AND read_at IS NULL;
