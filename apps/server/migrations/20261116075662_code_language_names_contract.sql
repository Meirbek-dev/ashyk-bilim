-- Code language by name, contract (REWRITE 5.8 item 10): every stored Judge0 id becomes its slug.
-- contract: 20261116075661 reads and writes slugs; its triggers stored them as Judge0's ids for the release before,
-- which no longer runs. This file drops them, `code_runs.language_id` and its pair trigger.
-- data-fix: a code language is its slug: item bodies (`languages`, the keys of `starter_code` /
-- `reference_solutions`), the frozen items of versions and submissions, answers, the answers in grading breakdowns
-- and the language in a final run's idempotency key. An id the runner image lacks stops the migration (below).
--
-- The frozen rows are rewritten past their guards, as earlier data fixes did: the slug names the same language.
-- A version's `content_sha256` follows its items. `code_languages_stored` becomes the identity for
-- 20261116075661 (its version lookup calls it); the release after this one drops it.
SET LOCAL lock_timeout = '5s';
-- The rewrite keeps each row's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

DROP TRIGGER assessment_items_code_languages ON assessment_items;
DROP TRIGGER assessment_versions_code_languages ON assessment_versions;
DROP TRIGGER submissions_code_languages ON submissions;
DROP TRIGGER grading_entries_code_languages ON grading_entries;
DROP FUNCTION code_languages_as_ids();

-- Every stored id must name a language of the runner image (`0`, the empty answer's, reads as no language).
DO $$
DECLARE
    unknown text;
BEGIN
    WITH docs (row, doc, shape) AS (
        SELECT 'assessment_items ' || id, body, 'body' FROM assessment_items
        UNION ALL SELECT 'assessment_versions ' || id, items, 'items' FROM assessment_versions
        UNION ALL SELECT 'submissions ' || id, items_snapshot, 'items' FROM submissions
        UNION ALL SELECT 'submissions ' || id, answers, 'answers' FROM submissions
        UNION ALL SELECT 'submissions ' || id, auto_breakdown, 'breakdown' FROM submissions
        UNION ALL SELECT 'grading_entries ' || id, raw_breakdown, 'breakdown' FROM grading_entries
        UNION ALL SELECT 'grading_entries ' || id, effective_breakdown, 'breakdown' FROM grading_entries
    ), paths (shape, path) AS (VALUES
        ('body', '$ ? (@.kind == "code").languages[*]'),
        ('body', '$ ? (@.kind == "code").starter_code.keyvalue().key'),
        ('body', '$ ? (@.kind == "code").reference_solutions.keyvalue().key'),
        ('items', '$.items[*].body ? (@.kind == "code").languages[*]'),
        ('items', '$.items[*].body ? (@.kind == "code").starter_code.keyvalue().key'),
        ('items', '$.items[*].body ? (@.kind == "code").reference_solutions.keyvalue().key'),
        ('answers', '$.* ? (@.kind like_regex "^code$" flag "i").language'),
        ('breakdown', '$.items[*].user_answer ? (@.kind like_regex "^code$" flag "i").language')
    ), found (row, language) AS (
        SELECT row, l #>> '{}' FROM docs JOIN paths USING (shape),
               jsonb_path_query(doc, path::jsonpath, '{}', true) AS l
        UNION ALL SELECT 'code_runs ' || id, language_id::text FROM code_runs
    )
    SELECT string_agg(DISTINCT language || ' (' || row || ')', ', ') INTO unknown
      FROM found
     WHERE CASE WHEN language !~ '^[0-9]+$' THEN false
                WHEN length(language) > 9 THEN true
                ELSE code_language_slug(language::integer) ~ '^[0-9]' END;
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION 'code languages the runner image lacks: %', left(unknown, 2000)
            USING HINT = 'Map each id to a language of ab_clients::gojudge::languages, then deploy again.';
    END IF;
END $$;

UPDATE assessment_items SET body = code_body_respelled(body, true)
 WHERE body IS DISTINCT FROM code_body_respelled(body, true);

ALTER TABLE assessment_versions DISABLE TRIGGER assessment_versions_frozen;
UPDATE assessment_versions SET items = code_items_respelled(items, true)
 WHERE items IS DISTINCT FROM code_items_respelled(items, true);
ALTER TABLE assessment_versions ENABLE TRIGGER assessment_versions_frozen;

ALTER TABLE submissions DISABLE TRIGGER submissions_snapshots_frozen;
UPDATE submissions
   SET answers = code_answers_respelled(answers, true),
       items_snapshot = code_items_respelled(items_snapshot, true),
       auto_breakdown = code_breakdown_respelled(auto_breakdown, true)
 WHERE (answers, items_snapshot, auto_breakdown) IS DISTINCT FROM (code_answers_respelled(answers, true),
                                                                   code_items_respelled(items_snapshot, true),
                                                                   code_breakdown_respelled(auto_breakdown, true));
ALTER TABLE submissions ENABLE TRIGGER submissions_snapshots_frozen;

ALTER TABLE grading_entries DISABLE TRIGGER grading_entries_immutable;
UPDATE grading_entries
   SET raw_breakdown = code_breakdown_respelled(raw_breakdown, true),
       effective_breakdown = code_breakdown_respelled(effective_breakdown, true)
 WHERE (raw_breakdown, effective_breakdown) IS DISTINCT FROM (code_breakdown_respelled(raw_breakdown, true),
                                                              code_breakdown_respelled(effective_breakdown, true));
ALTER TABLE grading_entries ENABLE TRIGGER grading_entries_immutable;

-- `final:<submission>:<item>:<language>:<source sha>`. A key 20261116075661 already wrote in slugs for the same
-- final run wins: the older run keeps no key.
WITH k AS (
    SELECT id, user_id, item_id, purpose,
           concat_ws(':', split_part(idempotency_key, ':', 1), split_part(idempotency_key, ':', 2),
                     split_part(idempotency_key, ':', 3),
                     code_language_slug(split_part(idempotency_key, ':', 4)::integer),
                     split_part(idempotency_key, ':', 5)) AS respelled
      FROM code_runs
     WHERE purpose = 'final' AND idempotency_key ~ '^final:[^:]+:[^:]+:[0-9]{1,9}:[^:]*$'
)
UPDATE code_runs r
   SET idempotency_key = CASE WHEN EXISTS (SELECT 1 FROM code_runs o
                                            WHERE o.user_id = k.user_id AND o.item_id = k.item_id
                                              AND o.purpose = k.purpose AND o.idempotency_key = k.respelled)
                              THEN NULL ELSE k.respelled END
  FROM k WHERE r.id = k.id;

DROP TRIGGER code_runs_language ON code_runs;
DROP FUNCTION code_runs_language();
ALTER TABLE code_runs DROP COLUMN language_id;

CREATE OR REPLACE FUNCTION code_languages_stored(items jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp
RETURN items;

DROP FUNCTION code_breakdown_respelled(jsonb, boolean);
DROP FUNCTION code_answers_respelled(jsonb, boolean);
DROP FUNCTION code_answer_respelled(jsonb, boolean);
DROP FUNCTION code_items_respelled(jsonb, boolean);
DROP FUNCTION code_body_respelled(jsonb, boolean);
DROP FUNCTION code_keys_respelled(jsonb, boolean);
DROP FUNCTION code_language_respelled(jsonb, boolean);
DROP FUNCTION code_language_slug(integer);
DROP FUNCTION code_language_judge0(text);
