-- A submission's version is one of its own assessment's (the key alone let it name any version). The
-- composite key replaces the single-column one; assessment_versions_id_assessment_key (previous file) is
-- the unique index it references.

SET LOCAL lock_timeout = '5s';

SELECT schema_try_fk('learning.submissions', 'submissions_assessment_version_fkey',
                     'FOREIGN KEY (assessment_version_id, assessment_id)
                      REFERENCES learning.assessment_versions (id, assessment_id)');

ALTER TABLE learning.submissions DROP CONSTRAINT IF EXISTS submissions_assessment_version_id_fkey;
