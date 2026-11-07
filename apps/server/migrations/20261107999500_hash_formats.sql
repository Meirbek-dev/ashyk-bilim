-- The remaining hashes say what they hold, like code_runs does (schema review 38): the code writes lowercase hex.

SET LOCAL lock_timeout = '5s';

SELECT schema_try_check('assessment_versions', 'assessment_versions_content_hash_format', $$content_hash ~ '^[0-9a-f]{32}$'$$);
SELECT schema_try_check('ai_course_analyses', 'ai_course_analyses_content_hash_format', $$content_hash ~ '^[0-9a-f]{64}$'$$);
SELECT schema_try_check('ai_work_embeddings', 'ai_work_embeddings_text_hash_format', $$text_hash ~ '^[0-9a-f]{64}$'$$);
SELECT schema_try_check('idempotency_keys', 'idempotency_keys_request_hash_format', $$request_hash ~ '^[0-9a-f]{64}$'$$);
