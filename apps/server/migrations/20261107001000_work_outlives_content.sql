-- Learner work and issued certificates are not owned children of course content (database review 2026-11-07).
--
-- A delete of course content used to reach grades and certificates through cascades, guarded only by the
-- application. Now the database refuses it: an assessment or file task with attempts cannot be deleted, so a
-- delete names the attempts it removes (staff previews, or an administrator's archived purge). The journals
-- still go with their attempt. An issued certificate outlives its course: the template loses only its course
-- key and is kept, because the certificate's PDF is drawn from it.

SET LOCAL lock_timeout = '5s';

ALTER TABLE submissions
    DROP CONSTRAINT submissions_assessment_id_fkey,
    DROP CONSTRAINT submissions_course_id_fkey;
SELECT schema_try_fk('submissions', 'submissions_assessment_id_fkey',
    'FOREIGN KEY (assessment_id, course_id) REFERENCES assessments (id, course_id) ON UPDATE RESTRICT ON DELETE RESTRICT');
SELECT schema_try_fk('submissions', 'submissions_course_id_fkey',
    'FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT');

ALTER TABLE file_submission_attempts
    DROP CONSTRAINT file_submission_attempts_file_submission_id_fkey,
    DROP CONSTRAINT file_submission_attempts_course_id_fkey;
SELECT schema_try_fk('file_submission_attempts', 'file_submission_attempts_file_submission_id_fkey',
    'FOREIGN KEY (file_submission_id, course_id) REFERENCES file_submissions (id, course_id) ON UPDATE RESTRICT ON DELETE RESTRICT');
SELECT schema_try_fk('file_submission_attempts', 'file_submission_attempts_course_id_fkey',
    'FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE RESTRICT');

-- Issued certificates: the course id is the row's own, the template stays without a course.
ALTER TABLE certificate_users ADD COLUMN course_id uuid;
ALTER TABLE certificate_users DISABLE TRIGGER certificate_users_frozen;
SET LOCAL ab.bookkeeping = 'on';
UPDATE certificate_users cu SET course_id = c.course_id
  FROM certifications c WHERE c.id = cu.certification_id;
ALTER TABLE certificate_users ENABLE TRIGGER certificate_users_frozen;
ALTER TABLE certificate_users ALTER COLUMN course_id SET NOT NULL;
COMMENT ON COLUMN certificate_users.course_id IS
    'The course it was issued for; no key: the certificate outlives the course.';

CREATE OR REPLACE FUNCTION certificate_users_issue() RETURNS trigger AS $$
BEGIN
    SELECT COALESCE(NEW.holder_name, u.display_name) INTO NEW.holder_name
      FROM users u WHERE u.id = NEW.user_id;
    SELECT ce.course_id,
           COALESCE(NEW.course_name, co.name),
           COALESCE(NEW.certificate_name, certification_text(ce.config, 'certification_name'), co.name),
           COALESCE(NEW.instructor_name, certification_text(ce.config, 'certificate_instructor'),
                    creator.display_name),
           COALESCE(NEW.score, COALESCE(p.weighted_grade_average, p.grade_average))
      INTO NEW.course_id, NEW.course_name, NEW.certificate_name, NEW.instructor_name, NEW.score
      FROM certifications ce
      JOIN courses co ON co.id = ce.course_id
      LEFT JOIN users creator ON creator.id = co.creator_id
      LEFT JOIN course_progress p ON p.course_id = ce.course_id AND p.user_id = NEW.user_id
     WHERE ce.id = NEW.certification_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE certifications ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE certifications DROP CONSTRAINT certifications_course_id_fkey;
SELECT schema_try_fk('certifications', 'certifications_course_id_fkey',
    'FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE SET NULL');

ALTER TABLE certificate_users DROP CONSTRAINT certificate_users_certification_id_fkey;
SELECT schema_try_fk('certificate_users', 'certificate_users_certification_id_fkey',
    'FOREIGN KEY (certification_id) REFERENCES certifications (id) ON DELETE RESTRICT');

-- Audit and event logs record what happened; the subject going does not unhappen it.
ALTER TABLE assessment_audit_events DROP CONSTRAINT assessment_audit_events_assessment_id_fkey;
ALTER TABLE bulk_actions DROP CONSTRAINT bulk_actions_assessment_id_fkey;
ALTER TABLE analytics_events
    DROP CONSTRAINT analytics_events_activity_id_fkey,
    DROP CONSTRAINT analytics_events_actor_id_fkey,
    DROP CONSTRAINT analytics_events_assessment_id_fkey,
    DROP CONSTRAINT analytics_events_course_id_fkey,
    DROP CONSTRAINT analytics_events_submission_id_fkey,
    DROP CONSTRAINT analytics_events_user_id_fkey;

CREATE FUNCTION course_has_learner_work(p_course uuid) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
RETURN EXISTS (SELECT 1 FROM submissions WHERE course_id = p_course AND NOT preview)
    OR EXISTS (SELECT 1 FROM file_submission_attempts WHERE course_id = p_course AND NOT preview)
    OR EXISTS (SELECT 1 FROM certificate_users WHERE course_id = p_course);
COMMENT ON FUNCTION course_has_learner_work(uuid) IS
    'A course whose purge would destroy official records: only ashyq admin purge-course removes it, after an archive.';
