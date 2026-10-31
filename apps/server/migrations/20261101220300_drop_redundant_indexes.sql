-- Schema review items 22-23: indexes that cost writes and serve no query.
--
-- - users: UNIQUE (email) / UNIQUE (username) are implied by the unique
--   lower(email) / lower(username) indexes, every lookup goes through
--   lower(...), and no ON CONFLICT names them.
-- - grading_entries (submission_id, published_at) overlaps
--   (submission_id, id DESC): a submission has a handful of entries and
--   has_published_entry reads them through the latter.
-- - courses.search / collections.search GIN: search matches with
--   search_matches() regexes (no index can serve them) and reads the
--   tsvector only to rank the matched rows (ts_rank_cd needs no index).
--   The generated columns stay for that ranking.

ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users DROP CONSTRAINT users_username_key;
DROP INDEX grading_entries_published_idx;
DROP INDEX courses_search_idx;
DROP INDEX collections_search_idx;
