-- Language, units, hashes, part 3 (REWRITE 5.8 item 6): a hash is a sha256 `bytea` of 32 bytes.
--
-- Five columns held sha256 as 64 hex characters: a code run's source and stdin, an idempotency key's request, an
-- answer embedding's text, a course analysis's content. Each gets a `*_sha256 bytea` (backfilled) that the server
-- reads and writes; the API keeps the hex string. An assessment version's `content_hash` was md5 of its snapshot
-- pair: `content_sha256` is its sha256, a generated column; the unique key on it follows in the next file. The
-- import file's `file_sha256` was already bytea: it gets the length check.
--
-- Switch release: the previous release reads and writes the hex columns, so triggers keep each pair equal whichever
-- side the writer named (a version's md5 stays derived by `assessment_versions_points`). A contract drops the hex
-- columns, their triggers, `assessment_content_hash()` and the md5 unique key (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';
-- The backfills keep each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

ALTER TABLE code_runs ADD COLUMN code_sha256 bytea, ADD COLUMN input_sha256 bytea;
UPDATE code_runs SET code_sha256 = decode(source_sha256, 'hex'), input_sha256 = decode(stdin_sha256, 'hex');
ALTER TABLE code_runs ALTER COLUMN code_sha256 SET NOT NULL,
    ADD CONSTRAINT code_runs_code_sha256_check CHECK (octet_length(code_sha256) = 32),
    ADD CONSTRAINT code_runs_input_sha256_check CHECK (octet_length(input_sha256) = 32);
COMMENT ON COLUMN learning.code_runs.code_sha256 IS 'sha256 of the source code that ran.';
COMMENT ON COLUMN learning.code_runs.input_sha256 IS 'sha256 of the custom stdin; NULL: the tests ran.';

CREATE FUNCTION code_runs_sha256() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.code_sha256 IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.source_sha256 IS DISTINCT FROM OLD.source_sha256
           AND NEW.code_sha256 IS NOT DISTINCT FROM OLD.code_sha256) THEN
        NEW.code_sha256 := decode(NEW.source_sha256, 'hex');
    ELSE
        NEW.source_sha256 := encode(NEW.code_sha256, 'hex');
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.input_sha256 IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.stdin_sha256 IS DISTINCT FROM OLD.stdin_sha256
           AND NEW.input_sha256 IS NOT DISTINCT FROM OLD.input_sha256) THEN
        NEW.input_sha256 := decode(NEW.stdin_sha256, 'hex');
    ELSE
        NEW.stdin_sha256 := encode(NEW.input_sha256, 'hex');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER code_runs_sha256 BEFORE INSERT OR UPDATE ON code_runs
    FOR EACH ROW EXECUTE FUNCTION code_runs_sha256();

ALTER TABLE idempotency_keys ADD COLUMN request_sha256 bytea;
UPDATE idempotency_keys SET request_sha256 = decode(request_hash, 'hex');
ALTER TABLE idempotency_keys ALTER COLUMN request_sha256 SET NOT NULL,
    ADD CONSTRAINT idempotency_keys_request_sha256_check CHECK (octet_length(request_sha256) = 32);

CREATE FUNCTION idempotency_keys_sha256() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.request_sha256 IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.request_hash IS DISTINCT FROM OLD.request_hash
           AND NEW.request_sha256 IS NOT DISTINCT FROM OLD.request_sha256) THEN
        NEW.request_sha256 := decode(NEW.request_hash, 'hex');
    ELSE
        NEW.request_hash := encode(NEW.request_sha256, 'hex');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER idempotency_keys_sha256 BEFORE INSERT OR UPDATE ON idempotency_keys
    FOR EACH ROW EXECUTE FUNCTION idempotency_keys_sha256();

ALTER TABLE ai_work_embeddings ADD COLUMN text_sha256 bytea;
UPDATE ai_work_embeddings SET text_sha256 = decode(text_hash, 'hex');
ALTER TABLE ai_work_embeddings ALTER COLUMN text_sha256 SET NOT NULL,
    ADD CONSTRAINT ai_work_embeddings_text_sha256_check CHECK (octet_length(text_sha256) = 32);

CREATE FUNCTION ai_work_embeddings_sha256() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.text_sha256 IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.text_hash IS DISTINCT FROM OLD.text_hash
           AND NEW.text_sha256 IS NOT DISTINCT FROM OLD.text_sha256) THEN
        NEW.text_sha256 := decode(NEW.text_hash, 'hex');
    ELSE
        NEW.text_hash := encode(NEW.text_sha256, 'hex');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER ai_work_embeddings_sha256 BEFORE INSERT OR UPDATE ON ai_work_embeddings
    FOR EACH ROW EXECUTE FUNCTION ai_work_embeddings_sha256();

ALTER TABLE ai_course_analyses ADD COLUMN content_sha256 bytea
    CONSTRAINT ai_course_analyses_content_sha256_check CHECK (octet_length(content_sha256) = 32);
UPDATE ai_course_analyses SET content_sha256 = decode(content_hash, 'hex') WHERE content_hash IS NOT NULL;

CREATE FUNCTION ai_course_analyses_sha256() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.content_sha256 IS NULL)
       OR (TG_OP = 'UPDATE' AND NEW.content_hash IS DISTINCT FROM OLD.content_hash
           AND NEW.content_sha256 IS NOT DISTINCT FROM OLD.content_sha256) THEN
        NEW.content_sha256 := decode(NEW.content_hash, 'hex');
    ELSE
        NEW.content_hash := encode(NEW.content_sha256, 'hex');
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER ai_course_analyses_sha256 BEFORE INSERT OR UPDATE ON ai_course_analyses
    FOR EACH ROW EXECUTE FUNCTION ai_course_analyses_sha256();

-- The sha256 of a snapshot pair (`ab_db::assessment_versions`); the server database is UTF-8.
CREATE FUNCTION assessment_content_sha256(items jsonb, policy jsonb) RETURNS bytea
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT sha256(convert_to(items::text || '|' || policy::text, 'UTF8')) $$;
ALTER TABLE assessment_versions ADD COLUMN content_sha256 bytea NOT NULL
    GENERATED ALWAYS AS (assessment_content_sha256(items, policy)) STORED,
    ADD CONSTRAINT assessment_versions_content_sha256_check CHECK (octet_length(content_sha256) = 32);

SELECT schema_try_check('assessment_imports', 'assessment_imports_file_sha256_check', 'octet_length(file_sha256) = 32');
