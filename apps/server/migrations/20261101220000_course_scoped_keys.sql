-- Schema review items 1 and 6: a row that repeats its parent's course_id
-- can no longer disagree with it. Each parent gets UNIQUE (id, course_id);
-- each child's key onto it becomes the composite (parent_id, course_id),
-- keeping the old constraint name (error mapping reads it) and its
-- ON DELETE CASCADE, plus ON UPDATE CASCADE so a parent's course change
-- carries its children along. A discussion reply joins its post the same
-- way: it can only live in the post's course.
--
-- Repair first (deterministic): the parent is the truth. A child whose
-- course_id differs from its parent's takes the parent's, top-down
-- (chapter → activity → assessment / file task / progress / trail step →
-- submission / file attempt; post → reply). Bookkeeping: updated_at stays.

SET LOCAL ab.bookkeeping = 'on';

UPDATE activities a SET course_id = c.course_id
FROM chapters c WHERE c.id = a.chapter_id AND a.course_id <> c.course_id;
UPDATE assessments s SET course_id = a.course_id
FROM activities a WHERE a.id = s.activity_id AND s.course_id <> a.course_id;
UPDATE file_submissions f SET course_id = a.course_id
FROM activities a WHERE a.id = f.activity_id AND f.course_id <> a.course_id;
UPDATE activity_progress p SET course_id = a.course_id
FROM activities a WHERE a.id = p.activity_id AND p.course_id <> a.course_id;
UPDATE trail_steps t SET course_id = a.course_id
FROM activities a WHERE a.id = t.activity_id AND t.course_id <> a.course_id;
UPDATE submissions s SET course_id = a.course_id
FROM assessments a WHERE a.id = s.assessment_id AND s.course_id <> a.course_id;
UPDATE file_submission_attempts t SET course_id = f.course_id
FROM file_submissions f WHERE f.id = t.file_submission_id AND t.course_id <> f.course_id;
UPDATE course_discussions r SET course_id = p.course_id
FROM course_discussions p WHERE p.id = r.parent_id AND r.course_id <> p.course_id;

ALTER TABLE chapters ADD CONSTRAINT chapters_id_course_key UNIQUE (id, course_id);
ALTER TABLE activities ADD CONSTRAINT activities_id_course_key UNIQUE (id, course_id);
ALTER TABLE assessments ADD CONSTRAINT assessments_id_course_key UNIQUE (id, course_id);
ALTER TABLE file_submissions ADD CONSTRAINT file_submissions_id_course_key UNIQUE (id, course_id);
ALTER TABLE course_discussions ADD CONSTRAINT course_discussions_id_course_key UNIQUE (id, course_id);

ALTER TABLE activities DROP CONSTRAINT activities_chapter_id_fkey,
    ADD CONSTRAINT activities_chapter_id_fkey FOREIGN KEY (chapter_id, course_id)
        REFERENCES chapters (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE assessments DROP CONSTRAINT assessments_activity_id_fkey,
    ADD CONSTRAINT assessments_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE file_submissions DROP CONSTRAINT file_submissions_activity_id_fkey,
    ADD CONSTRAINT file_submissions_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE activity_progress DROP CONSTRAINT activity_progress_activity_id_fkey,
    ADD CONSTRAINT activity_progress_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE trail_steps DROP CONSTRAINT trail_steps_activity_id_fkey,
    ADD CONSTRAINT trail_steps_activity_id_fkey FOREIGN KEY (activity_id, course_id)
        REFERENCES activities (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE submissions DROP CONSTRAINT submissions_assessment_id_fkey,
    ADD CONSTRAINT submissions_assessment_id_fkey FOREIGN KEY (assessment_id, course_id)
        REFERENCES assessments (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE file_submission_attempts DROP CONSTRAINT file_submission_attempts_file_submission_id_fkey,
    ADD CONSTRAINT file_submission_attempts_file_submission_id_fkey FOREIGN KEY (file_submission_id, course_id)
        REFERENCES file_submissions (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
-- MATCH SIMPLE: a post (parent_id NULL) is not checked.
ALTER TABLE course_discussions DROP CONSTRAINT course_discussions_parent_id_fkey,
    ADD CONSTRAINT course_discussions_parent_id_fkey FOREIGN KEY (parent_id, course_id)
        REFERENCES course_discussions (id, course_id) ON DELETE CASCADE ON UPDATE CASCADE;
