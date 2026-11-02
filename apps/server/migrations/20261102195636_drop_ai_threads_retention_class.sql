-- contract: no release reads or writes ai_threads.retention_class (only the ETL filled it, deleted
-- 2026-10-01); AI records age out per table in maintenance:retention (REWRITE 5.7 item 6).
SET LOCAL lock_timeout = '5s';

ALTER TABLE ai_threads DROP COLUMN retention_class;
