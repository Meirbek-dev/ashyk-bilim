-- UX-182: an attempt a course's staff (author, co-author, maintainer, platform
-- author) makes on the course is a preview — never enrols, never listed or
-- counted in the review queue, stats, gradebook, analytics or backfills.
ALTER TABLE submissions ADD COLUMN preview boolean NOT NULL DEFAULT false;
ALTER TABLE file_submission_attempts ADD COLUMN preview boolean NOT NULL DEFAULT false;
