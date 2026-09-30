-- UX-145: one-off recount of uploads.referenced_count from the actual
-- references. Before BUG-209 (e80fe10) the same-key thumbnail claim and the
-- course/chapter/activity cascades leaked counts, pinning orphans forever.
-- Producers (grep `add_reference`): course thumbnails, platform logo /
-- thumbnail, user avatars, media blocks (content->>'file_key'),
-- file-submission attempt files. Finalized rows nothing references re-enter
-- the reaper queue after the 24 h grace (`UNREFERENCED_GRACE`).
WITH refs AS (
    SELECT key, count(*)::int AS n FROM (
        SELECT thumbnail_image_key AS key FROM courses
        UNION ALL SELECT logo_key FROM platforms
        UNION ALL SELECT thumbnail_key FROM platforms
        UNION ALL SELECT avatar_key FROM users
        UNION ALL SELECT content->>'file_key' FROM blocks
        UNION ALL SELECT storage_key FROM file_submission_files
    ) r WHERE key IS NOT NULL GROUP BY key
), actual AS (
    SELECT u.id, coalesce(refs.n, 0) AS n
    FROM uploads u LEFT JOIN refs ON refs.key = u.key
    WHERE u.status = 'finalized'
)
UPDATE uploads u
SET referenced_count = actual.n,
    expires_at = CASE WHEN actual.n = 0
                      THEN coalesce(u.expires_at, now() + interval '24 hours')
                      ELSE NULL END
FROM actual
WHERE u.id = actual.id
  AND (u.referenced_count <> actual.n
       OR (actual.n = 0 AND u.expires_at IS NULL)
       OR (actual.n > 0 AND u.expires_at IS NOT NULL));
