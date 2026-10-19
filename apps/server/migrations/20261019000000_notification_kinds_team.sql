-- Two notification types for teachers (QA lane F, CONTRACT-REQ-D-1/D-2):
-- `discussion_post` (a new thread in a course they teach) and
-- `course_team_added` (added to a course team, or an application approved).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('grade_published', 'submission_returned', 'deadline_extended',
                    'deadline_approaching', 'course_update', 'discussion_reply',
                    'contributor_application', 'discussion_post', 'course_team_added'));

ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_disabled_check;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_disabled_check
    CHECK (disabled <@ ARRAY['grade_published', 'submission_returned',
                             'deadline_extended', 'deadline_approaching',
                             'course_update', 'discussion_reply',
                             'contributor_application', 'discussion_post',
                             'course_team_added']::text[]);
