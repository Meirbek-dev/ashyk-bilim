-- UX-186: backfill 20260924000003 — attempts made before it (and legacy ones
-- imported at cutover) by the course's staff are previews too. Same rule as
-- `is_teacher_preview`: the course creator, an active non-reporter
-- resource author, or a holder of `assessment:author:platform` (wildcards
-- included, as `Grant::grants` reads them).
CREATE TEMP TABLE ux186_staff ON COMMIT DROP AS
SELECT c.id AS course_id, c.creator_id AS user_id
FROM courses c WHERE c.creator_id IS NOT NULL
UNION
SELECT ra.course_id, ra.user_id
FROM resource_authors ra
WHERE ra.course_id IS NOT NULL AND ra.status = 'active' AND ra.authorship <> 'reporter';

CREATE TEMP TABLE ux186_platform_authors ON COMMIT DROP AS
SELECT DISTINCT ur.user_id
FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
WHERE split_part(rp.permission, ':', 1) IN ('*', 'assessment')
  AND split_part(rp.permission, ':', 2) IN ('*', 'author')
  AND split_part(rp.permission, ':', 3) IN ('', '*', 'platform', 'all');

UPDATE submissions s SET preview = true
WHERE NOT s.preview
  AND (EXISTS (SELECT 1 FROM ux186_staff st
               WHERE st.course_id = s.course_id AND st.user_id = s.user_id)
       OR s.user_id IN (SELECT user_id FROM ux186_platform_authors));

UPDATE file_submission_attempts fa SET preview = true
WHERE NOT fa.preview
  AND (EXISTS (SELECT 1 FROM ux186_staff st
               WHERE st.course_id = fa.course_id AND st.user_id = fa.user_id)
       OR fa.user_id IN (SELECT user_id FROM ux186_platform_authors));
