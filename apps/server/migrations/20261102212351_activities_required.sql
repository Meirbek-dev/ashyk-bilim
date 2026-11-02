-- activities.required (REWRITE 5.6 n8 step 3): whether a lesson counts toward its course's completion,
-- the flag the projector and course_progress_v read instead of each its own copy of `settings.required`
-- (the projection kept a lesson's flag from the day its row was seeded: the view's one known drift). A
-- graded activity (an assessment or a file task) counts whatever it says. Until activity settings move
-- into the typed body (5.3) the flag follows them: a trigger derives it on every write of `settings`, so
-- the previous release, which writes only `settings`, keeps it right too.
SET LOCAL lock_timeout = '5s';
-- The backfill is not an edit: no version bump, no updated_at.
SET LOCAL ab.bookkeeping = 'on';

ALTER TABLE activities ADD COLUMN required boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN activities.required IS
    'A lesson counts toward course completion (settings.required, kept by a trigger); graded activities always count.';
UPDATE activities SET required = false WHERE (settings->>'required') = 'false';

CREATE FUNCTION activities_required_from_settings() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    NEW.required := (NEW.settings->>'required') IS DISTINCT FROM 'false';
    RETURN NEW;
END $$;
CREATE TRIGGER activities_required_from_settings BEFORE INSERT OR UPDATE OF settings ON activities
    FOR EACH ROW EXECUTE FUNCTION activities_required_from_settings();

CREATE OR REPLACE VIEW course_progress_v AS
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
