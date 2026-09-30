-- UX-121: file grades apply the stored late penalty like quizzes. The
-- teacher's score is kept raw so a re-save never penalises twice.
ALTER TABLE file_submission_attempts
    ADD COLUMN raw_score double precision CHECK (raw_score BETWEEN 0 AND 100);
-- Existing grades were never penalised: the stored final is the raw.
UPDATE file_submission_attempts SET raw_score = final_score WHERE final_score IS NOT NULL;
