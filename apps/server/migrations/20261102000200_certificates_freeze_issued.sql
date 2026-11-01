-- A certificate states what was issued (REWRITE 5.7): the holder's name, the
-- course and certificate names, the signing instructor and the score are
-- stored on the row when it is issued, so renaming a course or editing the
-- template no longer rewrites certificates already handed out. Only the
-- holder's name follows the person: a display-name change re-issues their
-- certificates (`reissued_at`), which is also how an erased person's name
-- leaves them. The issue date is `created_at`, as before.
--
-- The previous release inserts without these columns: the BEFORE INSERT
-- trigger fills whatever the insert leaves NULL, so it keeps working.

SET LOCAL lock_timeout = '5s';

ALTER TABLE certificate_users
    ADD COLUMN holder_name      text,
    ADD COLUMN course_name      text,
    ADD COLUMN certificate_name text,
    ADD COLUMN instructor_name  text,
    ADD COLUMN score            double precision,
    ADD COLUMN reissued_at      timestamptz;

-- A template text field as the server reads it: a non-blank string, trimmed.
CREATE FUNCTION certification_text(config jsonb, key text) RETURNS text AS $$
    SELECT NULLIF(btrim(CASE jsonb_typeof(config -> key) WHEN 'string' THEN config ->> key END), '')
$$ LANGUAGE sql IMMUTABLE;

CREATE FUNCTION certificate_users_issue() RETURNS trigger AS $$
BEGIN
    SELECT COALESCE(NEW.holder_name, u.display_name) INTO NEW.holder_name
      FROM users u WHERE u.id = NEW.user_id;
    SELECT COALESCE(NEW.course_name, co.name),
           COALESCE(NEW.certificate_name, certification_text(ce.config, 'certification_name'), co.name),
           COALESCE(NEW.instructor_name, certification_text(ce.config, 'certificate_instructor'),
                    creator.display_name),
           COALESCE(NEW.score, COALESCE(p.weighted_grade_average, p.grade_average))
      INTO NEW.course_name, NEW.certificate_name, NEW.instructor_name, NEW.score
      FROM certifications ce
      JOIN courses co ON co.id = ce.course_id
      LEFT JOIN users creator ON creator.id = co.creator_id
      LEFT JOIN course_progress p ON p.course_id = ce.course_id AND p.user_id = NEW.user_id
     WHERE ce.id = NEW.certification_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER certificate_users_issue BEFORE INSERT ON certificate_users
    FOR EACH ROW EXECUTE FUNCTION certificate_users_issue();

-- Certificates issued before today: what they state now is the best record left.
UPDATE certificate_users cu
   SET holder_name = (SELECT u.display_name FROM users u WHERE u.id = cu.user_id),
       (course_name, certificate_name, instructor_name) = (
           SELECT co.name, COALESCE(certification_text(ce.config, 'certification_name'), co.name),
                  COALESCE(certification_text(ce.config, 'certificate_instructor'), creator.display_name)
             FROM certifications ce
             JOIN courses co ON co.id = ce.course_id
             LEFT JOIN users creator ON creator.id = co.creator_id
            WHERE ce.id = cu.certification_id),
       score = (SELECT COALESCE(p.weighted_grade_average, p.grade_average)
                  FROM certifications ce
                  JOIN course_progress p ON p.course_id = ce.course_id AND p.user_id = cu.user_id
                 WHERE ce.id = cu.certification_id);

ALTER TABLE certificate_users
    ALTER COLUMN holder_name SET NOT NULL,
    ALTER COLUMN course_name SET NOT NULL,
    ALTER COLUMN certificate_name SET NOT NULL;

CREATE FUNCTION certificate_users_frozen() RETURNS trigger AS $$
BEGIN
    IF to_jsonb(NEW) - 'holder_name' - 'reissued_at' - 'updated_at'
       IS DISTINCT FROM to_jsonb(OLD) - 'holder_name' - 'reissued_at' - 'updated_at' THEN
        RAISE EXCEPTION 'certificate_users rows state what was issued: only the holder name is re-issued'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER certificate_users_frozen BEFORE UPDATE ON certificate_users
    FOR EACH ROW EXECUTE FUNCTION certificate_users_frozen();

CREATE FUNCTION users_reissue_certificates() RETURNS trigger AS $$
BEGIN
    UPDATE certificate_users SET holder_name = NEW.display_name, reissued_at = now()
     WHERE user_id = NEW.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER users_reissue_certificates AFTER UPDATE OF display_name ON users
    FOR EACH ROW WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name)
    EXECUTE FUNCTION users_reissue_certificates();
