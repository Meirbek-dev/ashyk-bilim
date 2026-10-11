-- A course has one certificate template: both webs edit and turn off only the first one, but a
-- double-clicked «Включить сертификат» in the old platform left courses with several live templates
-- (production: «Операционные системы» has 3). Every live template issues on completion, so a learner got
-- one PDF per duplicate, and turning the certificate off left the others issuing.
-- Keep the oldest live template of each course; a newer duplicate that issued nothing is deleted, one that
-- did is retired (its certificates stay valid), as turning a template off does. Then enforce it.
DELETE FROM certifications c
WHERE c.disabled_at IS NULL
  AND EXISTS (SELECT 1 FROM certifications o
              WHERE o.course_id = c.course_id AND o.disabled_at IS NULL AND o.id < c.id)
  AND NOT EXISTS (SELECT 1 FROM certificate_users cu WHERE cu.certification_id = c.id);

UPDATE certifications c SET disabled_at = now()
WHERE c.disabled_at IS NULL
  AND EXISTS (SELECT 1 FROM certifications o
              WHERE o.course_id = c.course_id AND o.disabled_at IS NULL AND o.id < c.id);

CREATE UNIQUE INDEX certifications_one_live_per_course ON certifications (course_id) WHERE disabled_at IS NULL;
