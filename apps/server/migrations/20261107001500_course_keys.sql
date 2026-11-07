-- A copied course_id cannot drift, on the tables that were left out (database review 2026-11-07).
-- crates/db/tests/schema_review.rs now fails on any new table that repeats a parent's course_id without a key.

SET LOCAL lock_timeout = '5s';

ALTER TABLE concept_tags DROP CONSTRAINT concept_tags_activity_id_fkey;
SELECT schema_try_fk('concept_tags', 'concept_tags_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE content_chunks DROP CONSTRAINT content_chunks_activity_id_fkey;
SELECT schema_try_fk('content_chunks', 'content_chunks_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE content_index_state DROP CONSTRAINT content_index_state_activity_id_fkey;
SELECT schema_try_fk('content_index_state', 'content_index_state_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE ai_lecture_reviews DROP CONSTRAINT ai_lecture_reviews_activity_id_fkey;
SELECT schema_try_fk('ai_lecture_reviews', 'ai_lecture_reviews_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE ai_grade_corrections DROP CONSTRAINT ai_grade_corrections_activity_id_fkey;
SELECT schema_try_fk('ai_grade_corrections', 'ai_grade_corrections_activity_id_fkey',
    'FOREIGN KEY (activity_id, course_id) REFERENCES activities (id, course_id) ON DELETE CASCADE');

ALTER TABLE mastery_evidence DROP CONSTRAINT mastery_evidence_concept_id_fkey;
SELECT schema_try_fk('mastery_evidence', 'mastery_evidence_concept_id_fkey',
    'FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts (id, course_id) ON DELETE CASCADE');

ALTER TABLE concept_mastery DROP CONSTRAINT concept_mastery_concept_id_fkey;
SELECT schema_try_fk('concept_mastery', 'concept_mastery_concept_id_fkey',
    'FOREIGN KEY (concept_id, course_id) REFERENCES course_concepts (id, course_id) ON DELETE CASCADE');
