-- A learner hears that a teacher assigned them a remediation (разбор ошибок),
-- a gate before their next attempt or a review to go over (followups lane,
-- OPEN-learn-o): `remediation_assigned`.
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN ('grade_published', 'submission_returned', 'deadline_extended',
                    'deadline_approaching', 'course_update', 'discussion_reply',
                    'contributor_application', 'discussion_post', 'course_team_added',
                    'work_submitted', 'remediation_assigned'));

ALTER TABLE notification_preferences DROP CONSTRAINT notification_preferences_disabled_check;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_disabled_check
    CHECK (disabled <@ ARRAY['grade_published', 'submission_returned',
                             'deadline_extended', 'deadline_approaching',
                             'course_update', 'discussion_reply',
                             'contributor_application', 'discussion_post',
                             'course_team_added', 'work_submitted',
                             'remediation_assigned']::text[]);
