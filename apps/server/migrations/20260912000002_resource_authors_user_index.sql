-- Course collaboration lives in `resource_authors` (ETL-loaded, already read by
-- analytics and the work queue). The contributor routes look rows up by course
-- (covered by the unique constraint); `GET /courses?mine=true` and
-- `GET /users/{username}/courses` look them up by user.
CREATE INDEX resource_authors_active_by_user
    ON resource_authors (user_id, course_id)
    WHERE status = 'active' AND course_id IS NOT NULL;
