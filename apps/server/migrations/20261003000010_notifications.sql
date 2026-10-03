-- S-07 (stage 2): in-app notifications and per-type preferences.
--
-- One row per (recipient, event). `payload` is the typed union the API
-- serves (`ab_domain::notifications::NotificationPayload`, tagged by
-- `type` = `kind`). `dedup_key` makes a producer idempotent per recipient
-- (deadline reminders: one per activity and due date); NULL = no dedup.
-- Rows older than 90 days are pruned by the worker.
CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text NOT NULL
               CHECK (kind IN ('grade_published', 'submission_returned', 'deadline_extended',
                               'deadline_approaching', 'course_update', 'discussion_reply',
                               'contributor_application')),
    payload    jsonb NOT NULL,
    dedup_key  text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz,
    UNIQUE (user_id, dedup_key)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_created_idx ON notifications (created_at);

-- Opt-outs per type (in-app only; no row = everything on).
CREATE TABLE notification_preferences (
    user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    disabled   text[] NOT NULL DEFAULT '{}'
               CHECK (disabled <@ ARRAY['grade_published', 'submission_returned',
                                        'deadline_extended', 'deadline_approaching',
                                        'course_update', 'discussion_reply',
                                        'contributor_application']::text[]),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_preferences_set_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
