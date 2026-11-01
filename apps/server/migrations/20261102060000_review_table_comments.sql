-- Comments for the tables schema review 3 created in parallel with the
-- COMMENT ON migration (20261102050000), and the ones whose role changed with
-- it: trails and trail_runs no longer hold membership (enrolments does),
-- resource_authors is the previous release's mirror of the staff tables.

SET LOCAL lock_timeout = '5s';

COMMENT ON TABLE block_uploads IS
    'Uploads a lesson block references (derived from its content''s file key by a trigger); the upload reaper keeps them.';
COMMENT ON TABLE course_staff IS
    'Staff of a course: creator, maintainer, contributor or reporter, with a status.';
COMMENT ON TABLE collection_staff IS
    'Staff of a collection: creator, maintainer, contributor or reporter, with a status.';
COMMENT ON TABLE course_update_activities IS
    'Activities a course update links to, in order; a deleted activity leaves the update.';
COMMENT ON TABLE translatable_fields IS
    'Lookup: the (entity, field) pairs that may have translation rows.';
COMMENT ON TABLE resource_authors IS
    'Previous release''s staff table, mirrored both ways with course_staff / collection_staff until its contract migration drops it.';
COMMENT ON TABLE trail_runs IS
    'A learner''s legacy course run (status, data); membership is enrolments since schema review 3.';
COMMENT ON TABLE trail_steps IS
    'Legacy per-activity step inside a trail run; completions is the progress fact since schema review 3.';
