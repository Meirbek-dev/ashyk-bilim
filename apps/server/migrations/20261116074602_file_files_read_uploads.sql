-- One copy of each fact, part 2 (REWRITE 5.8 item 4): a handed-in file is its upload. `file_submission_files`
-- repeated the upload row's `key`, `mime` and `size_bytes` as `storage_key`, `content_type` and `size_bytes`; the
-- server reads them through the `uploads` join from this release and writes only `upload_id` (plus the file's own
-- `display_name`, `position` and `scan_status`).
--
-- Switch release: the previous release reads the copies, so a new row gets them from its upload here (and the NOT
-- NULL `storage_key` a value). A contract drops the three columns with this trigger (pending-contracts.tsv).
--
-- The media `*_key` columns beside `*_upload_id` (users.avatar_key, courses.thumbnail_*_key, ...) are not switched:
-- keys from before the upload table have no `uploads` row (their `*_upload_id` is NULL), so a read through the join
-- would lose those pictures until an admin command gives each one its row.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION file_submission_files_from_upload() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    SELECT u.key, u.mime, u.size_bytes INTO NEW.storage_key, NEW.content_type, NEW.size_bytes
    FROM uploads u WHERE u.id = NEW.upload_id;
    RETURN NEW;
END $$;
CREATE TRIGGER file_submission_files_from_upload BEFORE INSERT ON file_submission_files
    FOR EACH ROW EXECUTE FUNCTION file_submission_files_from_upload();
