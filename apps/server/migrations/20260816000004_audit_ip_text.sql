-- Audit IPs come from X-Forwarded-For and can be arbitrary junk; the audit
-- trail should record what was seen, not reject the row. text, not inet.
ALTER TABLE auth_audit_log ALTER COLUMN ip TYPE text USING ip::text;
