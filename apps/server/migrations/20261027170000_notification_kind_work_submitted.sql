-- Teachers hear of work handed in for grading (followups lane): `work_submitted`,
-- one unread row per teacher and activity that counts the hand-ins since it
-- was last read (the producer replaces the unread row), so a busy course
-- does not flood the bell.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('grade_published', 'submission_returned', 'deadline_extended',
                    'deadline_approaching', 'course_update', 'discussion_reply',
                    'contributor_application', 'discussion_post', 'course_team_added',
                    'work_submitted'));

ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_disabled_check;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_disabled_check
    CHECK (disabled <@ ARRAY['grade_published', 'submission_returned',
                             'deadline_extended', 'deadline_approaching',
                             'course_update', 'discussion_reply',
                             'contributor_application', 'discussion_post',
                             'course_team_added', 'work_submitted']::text[]);

-- The producer finds a teacher's unread row of an activity by this.
CREATE INDEX notifications_unread_work_idx ON notifications (user_id, (payload->>'activity_id'))
    WHERE kind = 'work_submitted' AND read_at IS NULL;
