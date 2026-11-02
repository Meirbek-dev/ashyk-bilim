-- An audit event's metadata is an object (schema review 2026-11-01, `auth_audit_log_metadata_check`). Production
-- skipped the check: 170 events imported from April 2026 store JSON null.
--
-- data-fix: JSON null metadata means none, stored as the column default '{}'; the check then validates.
SET LOCAL lock_timeout = '5s';

UPDATE auth_audit_log SET metadata = '{}' WHERE jsonb_typeof(metadata) = 'null';

SELECT schema_try_check('auth_audit_log', 'auth_audit_log_metadata_check', $$jsonb_typeof(metadata) = 'object'$$);
