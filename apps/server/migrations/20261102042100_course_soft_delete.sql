-- Deleting a course is soft; a purge hard-deletes it after a grace period (schema review item 22,
-- owner decision 2026-11-01 evening, replacing the immediate cascade of COURSE_ARCHIVING 6.2).
--
-- DELETE /courses/{id} archives the course (if it was not) and stamps deleted_at/by: every read
-- skips it from then on (course_visible here; get_course and the lists in the code), and the
-- archive rules freeze it for any path that still reaches it. `maintenance:retention` purges a
-- course deleted longer ago than AB__RETENTION__DELETED_COURSES_DAYS (30) with the old cascade.
-- `ashyq admin restore-course` clears the stamp within the grace period (the course comes back
-- archived). A deleted course is always archived (CHECK), so the previous release, which knows
-- nothing of deleted_at, sees an archived course: frozen and out of the catalogue.

SET LOCAL lock_timeout = '5s';

ALTER TABLE courses
    ADD COLUMN deleted_at timestamptz,
    ADD COLUMN deleted_by uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD CONSTRAINT courses_deleted_is_archived CHECK (deleted_at IS NULL OR archived_at IS NOT NULL),
    ADD CONSTRAINT courses_deleted_by_check CHECK (deleted_by IS NULL OR deleted_at IS NOT NULL);

CREATE OR REPLACE FUNCTION course_visible(c courses, p_viewer uuid, p_see_all boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT c.deleted_at IS NULL AND (
         c.public OR p_see_all OR c.creator_id = p_viewer
      OR EXISTS (SELECT 1 FROM course_staff cs
                 WHERE cs.course_id = c.id AND cs.user_id = p_viewer AND cs.status = 'active')
      OR EXISTS (SELECT 1 FROM usergroup_courses uc
                 JOIN usergroup_members m ON m.usergroup_id = uc.usergroup_id
                 WHERE uc.course_id = c.id AND m.user_id = p_viewer)
      OR (c.archived_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM trail_runs tr
                      WHERE tr.course_id = c.id AND tr.user_id = p_viewer)))
$function$;
