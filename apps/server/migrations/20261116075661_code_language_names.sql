-- Code language by name, switch (REWRITE 5.8 item 10, owner decision 2026-11-18): a language is its slug
-- (`python`, `cpp`, `java`, ...; `ab_clients::gojudge::languages`), not Judge0's numeric id. No version: the runner
-- image fixes it.
--
-- This release reads, writes and serves slugs. The release before it (the rollback image) reads Judge0's ids
-- only, so the rows keep the ids until the contract (`20261116075662`) rewrites them:
-- - BEFORE triggers turn the slugs this release writes into ids: item bodies (`languages` and the keys of
--   `starter_code` / `reference_solutions`), the frozen items of versions and submissions, answers (`language`)
--   and the answers inside grading breakdowns (`user_answer`). This release reads either spelling.
-- - `code_runs.language` holds the slug (backfilled) beside `language_id`; `code_runs_language` fills whichever
--   one an insert leaves out.
-- - `code_languages_stored(items)` is the items as they are stored, for the version lookup by hash (this
--   release hashes its own spelling). The contract makes it the identity, the release after drops it.
-- An id the runner image lacks reads as its decimal string (`'83'`) and is written back as the number; `0`, the
-- empty answer's, reads as `''`. Such ids leave the `languages` lists (the data fix at the end).
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION code_language_slug(id integer) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE id
    WHEN 0 THEN ''
    WHEN 71 THEN 'python' WHEN 54 THEN 'cpp' WHEN 62 THEN 'java' WHEN 50 THEN 'c'
    WHEN 63 THEN 'javascript' WHEN 74 THEN 'typescript' WHEN 60 THEN 'go' WHEN 73 THEN 'rust'
    WHEN 78 THEN 'kotlin' WHEN 68 THEN 'php' WHEN 72 THEN 'ruby'
    ELSE id::text
END;

-- NULL for a name that is no language and no number.
CREATE FUNCTION code_language_judge0(slug text) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN CASE slug
    WHEN '' THEN 0
    WHEN 'python' THEN 71 WHEN 'cpp' THEN 54 WHEN 'java' THEN 62 WHEN 'c' THEN 50
    WHEN 'javascript' THEN 63 WHEN 'typescript' THEN 74 WHEN 'go' THEN 60 WHEN 'rust' THEN 73
    WHEN 'kotlin' THEN 78 WHEN 'php' THEN 68 WHEN 'ruby' THEN 72
    ELSE CASE WHEN slug ~ '^[0-9]{1,9}$' THEN slug::integer END
END;

-- A language in the other spelling: an id as its slug (`to_slug`), else a slug as its id. Anything else stays.
CREATE FUNCTION code_language_respelled(language jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE
    WHEN to_slug AND jsonb_typeof(language) = 'number'
        THEN to_jsonb(code_language_slug((language #>> '{}')::numeric::integer))
    WHEN NOT to_slug AND jsonb_typeof(language) = 'string'
        THEN coalesce(to_jsonb(code_language_judge0(language #>> '{}')), language)
    ELSE language
END
$$;

-- `starter_code` / `reference_solutions`: the keys respelled (an id key is its decimal string).
CREATE FUNCTION code_keys_respelled(keyed jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT coalesce(jsonb_object_agg(
           CASE
               WHEN to_slug THEN CASE WHEN k ~ '^[0-9]{1,9}$' THEN code_language_slug(k::integer) ELSE k END
               ELSE coalesce(code_language_judge0(k)::text, k)
           END, v), '{}'::jsonb)
  FROM jsonb_each(keyed) AS e (k, v)
$$;

-- An item body: a code body's `languages` and the keys of its code maps; any other body as it is.
CREATE FUNCTION code_body_respelled(body jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE WHEN jsonb_typeof(body) = 'object' AND body ->> 'kind' = 'code' THEN
    body
    || CASE WHEN jsonb_typeof(body -> 'languages') = 'array' THEN jsonb_build_object('languages',
           (SELECT coalesce(jsonb_agg(code_language_respelled(l, to_slug) ORDER BY n), '[]'::jsonb)
              FROM jsonb_array_elements(body -> 'languages') WITH ORDINALITY AS e (l, n)))
       ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(body -> 'starter_code') = 'object'
           THEN jsonb_build_object('starter_code', code_keys_respelled(body -> 'starter_code', to_slug))
       ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(body -> 'reference_solutions') = 'object'
           THEN jsonb_build_object('reference_solutions', code_keys_respelled(body -> 'reference_solutions', to_slug))
       ELSE '{}'::jsonb END
ELSE body END
$$;

-- Frozen items (`assessment_versions.items`, `submissions.items_snapshot`): `{"items": [{..., "body": {...}}]}`.
CREATE FUNCTION code_items_respelled(items jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE WHEN jsonb_typeof(items -> 'items') = 'array' THEN
    items || jsonb_build_object('items',
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(i -> 'body') = 'object'
                                       THEN i || jsonb_build_object('body', code_body_respelled(i -> 'body', to_slug))
                                       ELSE i END ORDER BY n), '[]'::jsonb)
           FROM jsonb_array_elements(items -> 'items') WITH ORDINALITY AS e (i, n)))
ELSE items END
$$;

-- One answer: a code answer's `language` (`kind` `CODE` is the legacy app's spelling, kept in old breakdowns).
CREATE FUNCTION code_answer_respelled(answer jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE WHEN jsonb_typeof(answer) = 'object' AND lower(answer ->> 'kind') = 'code' AND answer ? 'language'
    THEN answer || jsonb_build_object('language', code_language_respelled(answer -> 'language', to_slug))
ELSE answer END
$$;

-- `submissions.answers`: `{"<item id>": answer}`.
CREATE FUNCTION code_answers_respelled(answers jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE WHEN jsonb_typeof(answers) = 'object' THEN
    (SELECT coalesce(jsonb_object_agg(k, code_answer_respelled(v, to_slug)), '{}'::jsonb)
       FROM jsonb_each(answers) AS e (k, v))
ELSE answers END
$$;

-- A grading breakdown: `{"items": [{..., "user_answer": answer}]}`.
CREATE FUNCTION code_breakdown_respelled(breakdown jsonb, to_slug boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
SELECT CASE WHEN jsonb_typeof(breakdown -> 'items') = 'array' THEN
    breakdown || jsonb_build_object('items',
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(i -> 'user_answer') = 'object'
                                       THEN i || jsonb_build_object('user_answer',
                                                                    code_answer_respelled(i -> 'user_answer', to_slug))
                                       ELSE i END ORDER BY n), '[]'::jsonb)
           FROM jsonb_array_elements(breakdown -> 'items') WITH ORDINALITY AS e (i, n)))
ELSE breakdown END
$$;

-- The frozen items as this release's rows store them: with Judge0's ids.
CREATE FUNCTION code_languages_stored(items jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN code_items_respelled(items, false);

-- What this release writes reaches the rows as the release before reads them.
CREATE FUNCTION code_languages_as_ids() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    CASE TG_TABLE_NAME
    WHEN 'assessment_items' THEN
        NEW.body := code_body_respelled(NEW.body, false);
    WHEN 'assessment_versions' THEN
        NEW.items := code_items_respelled(NEW.items, false);
    WHEN 'submissions' THEN
        NEW.answers := code_answers_respelled(NEW.answers, false);
        NEW.items_snapshot := code_items_respelled(NEW.items_snapshot, false);
        NEW.auto_breakdown := code_breakdown_respelled(NEW.auto_breakdown, false);
    WHEN 'grading_entries' THEN
        NEW.raw_breakdown := code_breakdown_respelled(NEW.raw_breakdown, false);
        NEW.effective_breakdown := code_breakdown_respelled(NEW.effective_breakdown, false);
    END CASE;
    RETURN NEW;
END $$;
CREATE TRIGGER assessment_items_code_languages BEFORE INSERT OR UPDATE OF body ON assessment_items
    FOR EACH ROW EXECUTE FUNCTION code_languages_as_ids();
CREATE TRIGGER assessment_versions_code_languages BEFORE INSERT ON assessment_versions
    FOR EACH ROW EXECUTE FUNCTION code_languages_as_ids();
CREATE TRIGGER submissions_code_languages BEFORE INSERT OR UPDATE OF answers, items_snapshot, auto_breakdown
    ON submissions FOR EACH ROW EXECUTE FUNCTION code_languages_as_ids();
CREATE TRIGGER grading_entries_code_languages BEFORE INSERT ON grading_entries
    FOR EACH ROW EXECUTE FUNCTION code_languages_as_ids();

ALTER TABLE code_runs ADD COLUMN language text;
COMMENT ON COLUMN learning.code_runs.language IS 'The language''s slug (`python`, `cpp`, ...).';
UPDATE code_runs SET language = code_language_slug(language_id);
ALTER TABLE code_runs ALTER COLUMN language SET NOT NULL;

-- The previous release writes `language_id`, this one `language`.
CREATE FUNCTION code_runs_language() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    IF NEW.language IS NULL THEN
        NEW.language := code_language_slug(NEW.language_id);
    ELSIF NEW.language_id IS NULL THEN
        NEW.language_id := coalesce(code_language_judge0(NEW.language), 0);
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER code_runs_language BEFORE INSERT ON code_runs
    FOR EACH ROW EXECUTE FUNCTION code_runs_language();

-- data-fix: a code item lists only languages a runner language maps to. Judge0 ids none maps to (51 C# Mono, 82
-- SQL, 83 Swift in production: only in `languages` lists) could never run; they leave the lists of bodies and of the
-- frozen items of versions (their `content_sha256` follows) and submissions, past the frozen rows' guards as the
-- contract's rewrite. The release before reads the shorter lists. An unknown id anywhere else stops the contract.
SET LOCAL ab.bookkeeping = 'on';
CREATE FUNCTION pg_temp.runnable(body jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT CASE WHEN jsonb_typeof(body) = 'object' AND body ->> 'kind' = 'code' AND jsonb_typeof(body -> 'languages') = 'array'
    THEN body || jsonb_build_object('languages',
        (SELECT coalesce(jsonb_agg(l ORDER BY n), '[]'::jsonb)
           FROM jsonb_array_elements(body -> 'languages') WITH ORDINALITY AS e (l, n)
          WHERE NOT (jsonb_typeof(l) = 'number'
                     AND code_language_slug((l #>> '{}')::numeric::integer) ~ '^[0-9]')))
    ELSE body END
$$;
CREATE FUNCTION pg_temp.runnable_items(items jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT CASE WHEN jsonb_typeof(items -> 'items') = 'array' THEN
    items || jsonb_build_object('items',
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(i -> 'body') = 'object'
                                       THEN i || jsonb_build_object('body', pg_temp.runnable(i -> 'body'))
                                       ELSE i END ORDER BY n), '[]'::jsonb)
           FROM jsonb_array_elements(items -> 'items') WITH ORDINALITY AS e (i, n)))
ELSE items END
$$;

UPDATE assessment_items SET body = pg_temp.runnable(body) WHERE body IS DISTINCT FROM pg_temp.runnable(body);

ALTER TABLE assessment_versions DISABLE TRIGGER assessment_versions_frozen;
UPDATE assessment_versions SET items = pg_temp.runnable_items(items)
 WHERE items IS DISTINCT FROM pg_temp.runnable_items(items);
ALTER TABLE assessment_versions ENABLE TRIGGER assessment_versions_frozen;

ALTER TABLE submissions DISABLE TRIGGER submissions_snapshots_frozen;
UPDATE submissions SET items_snapshot = pg_temp.runnable_items(items_snapshot)
 WHERE items_snapshot IS DISTINCT FROM pg_temp.runnable_items(items_snapshot);
ALTER TABLE submissions ENABLE TRIGGER submissions_snapshots_frozen;

DROP FUNCTION pg_temp.runnable_items(jsonb);
DROP FUNCTION pg_temp.runnable(jsonb);
