-- contract: resource_authors split into course_staff + collection_staff (20261102041100); no
-- release reads it any more. The mirror triggers kept both sides equal; the copy re-runs for
-- safety (rows already there are left alone), then the mirrors and the table go.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER course_staff_mirror ON course_staff;
DROP TRIGGER resource_authors_mirror ON resource_authors;

INSERT INTO course_staff (course_id, user_id, authorship, status, version, created_at, updated_at)
SELECT course_id, user_id, authorship, status, version, created_at, updated_at
  FROM resource_authors WHERE course_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO collection_staff (collection_id, user_id, authorship, status, version, created_at, updated_at)
SELECT collection_id, user_id, authorship, status, version, created_at, updated_at
  FROM resource_authors WHERE collection_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP FUNCTION course_staff_mirror();
DROP FUNCTION resource_authors_mirror();
DROP TABLE resource_authors;
