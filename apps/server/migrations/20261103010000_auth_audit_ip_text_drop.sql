SET LOCAL lock_timeout = '5s';
-- contract: item 27, the server writes auth_audit_log.ip_address (inet) since
-- 20261102010100; nothing reads or writes the text `ip` any more.

-- data-fix: rows the previous binary wrote after the expand step.
UPDATE auth_audit_log SET ip_address = inet_or_null(ip)
WHERE ip IS NOT NULL AND ip_address IS NULL;

DROP TRIGGER auth_audit_log_ip_address ON auth_audit_log;
DROP FUNCTION auth_audit_log_ip_address();
ALTER TABLE auth_audit_log DROP COLUMN ip;
