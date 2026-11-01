-- Schema review item 29: import artefacts of the 2026-09-30 cutover.
--
-- The ETL bookkeeping (etl_runs, etl_id_map, etl_drop_log) was scheduled to
-- go at T+30d (2026-10-30; DECISIONS "Coverage floor scope"), and the ETL
-- crate that wrote it is deleted. `legacy_uuid` on every table but `blocks`
-- is read by nothing: each kept a unique index that only cost writes.
-- `blocks.legacy_uuid` stays - lesson content still links blocks by their
-- legacy id (catalog block lookup, course copy).
--
-- The pre-cutover legacy database and every nightly backup keep the mapping.

DROP TABLE etl_drop_log, etl_id_map, etl_runs;

ALTER TABLE activities DROP COLUMN legacy_uuid;
ALTER TABLE assessment_items DROP COLUMN legacy_uuid;
ALTER TABLE assessments DROP COLUMN legacy_uuid;
ALTER TABLE certifications DROP COLUMN legacy_uuid;
ALTER TABLE chapters DROP COLUMN legacy_uuid;
ALTER TABLE code_runs DROP COLUMN legacy_uuid;
ALTER TABLE collections DROP COLUMN legacy_uuid;
ALTER TABLE course_discussions DROP COLUMN legacy_uuid;
ALTER TABLE course_updates DROP COLUMN legacy_uuid;
ALTER TABLE courses DROP COLUMN legacy_uuid;
ALTER TABLE file_submission_attempts DROP COLUMN legacy_uuid;
ALTER TABLE file_submission_files DROP COLUMN legacy_uuid;
ALTER TABLE file_submissions DROP COLUMN legacy_uuid;
ALTER TABLE grading_entries DROP COLUMN legacy_uuid;
ALTER TABLE submissions DROP COLUMN legacy_uuid;
ALTER TABLE trails DROP COLUMN legacy_uuid;
ALTER TABLE usergroups DROP COLUMN legacy_uuid;
