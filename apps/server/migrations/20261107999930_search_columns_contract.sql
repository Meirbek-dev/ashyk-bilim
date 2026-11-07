-- contract: search ranks with to_tsvector at query time (schema review 45), so the generated columns only cost writes.
-- The release before this one does not read them. The trigram indexes that answer the search stay.

SET LOCAL lock_timeout = '5s';

ALTER TABLE courses DROP COLUMN search;
ALTER TABLE collections DROP COLUMN search;
