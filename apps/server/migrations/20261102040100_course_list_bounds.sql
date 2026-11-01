-- One rule for a course's lists (schema review item 30).
--
-- A list of short strings is text[] with its bounds checked by the database (courses.tags: at most
-- 20 tags of 1..64 characters, trimmed, no case-insensitive duplicates - what the API accepts and
-- `normalize_tags` stores). A list of records the API edits as a whole stays a jsonb array, with
-- its shape and the same bounds checked (courses.learnings: at most 30 entries `{id, text,
-- emoji?}`, id 1..64 characters, text 1..300, emoji up to 16): its entries carry an id the landing
-- keys by (BUG-334) and an emoji, which a text[] cannot hold without changing the API.
--
-- Repair (deterministic, the rule the API applies on every write): tags are trimmed, blanks
-- dropped and case-insensitive duplicates removed keeping the first. Rows still out of bounds
-- after that (legacy imports) keep their data: the check is skipped and recorded
-- (schema_try_check), never truncated.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION text_list_ok(items text[], max_items integer, max_len integer) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT cardinality(items) <= max_items
       AND NOT EXISTS (
           SELECT 1 FROM unnest(items) AS t (v)
            WHERE v IS NULL OR v <> btrim(v) OR v = '' OR char_length(v) > max_len)
       AND (SELECT count(DISTINCT lower(v)) FROM unnest(items) AS t (v)) = cardinality(items)
$$;
COMMENT ON FUNCTION text_list_ok(text[], integer, integer) IS
    'A bounded list of short strings: at most max_items, each trimmed, 1..max_len characters, no case-insensitive duplicates.';

CREATE FUNCTION course_learnings_ok(items jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT jsonb_typeof(items) = 'array'
       AND jsonb_array_length(items) <= 30
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(items) AS e (v)
            WHERE jsonb_typeof(v) IS DISTINCT FROM 'object'
               OR jsonb_typeof(v -> 'id') IS DISTINCT FROM 'string'
               OR char_length(v ->> 'id') NOT BETWEEN 1 AND 64
               OR jsonb_typeof(v -> 'text') IS DISTINCT FROM 'string'
               OR char_length(btrim(v ->> 'text')) NOT BETWEEN 1 AND 300
               OR (v ? 'emoji' AND (jsonb_typeof(v -> 'emoji') IS DISTINCT FROM 'string'
                                    OR char_length(v ->> 'emoji') > 16)))
$$;
COMMENT ON FUNCTION course_learnings_ok(jsonb) IS
    'courses.learnings shape: an array of at most 30 {id, text, emoji?} objects within the API bounds.';

-- data-fix: the API's tag normalization, applied to rows written before it.
SET LOCAL ab.bookkeeping = 'on';
UPDATE courses c
   SET tags = n.tags
  FROM (SELECT c2.id,
               coalesce(array_agg(t.v ORDER BY t.first) FILTER (WHERE t.v IS NOT NULL), '{}') AS tags
          FROM courses c2
          LEFT JOIN LATERAL (
                SELECT (array_agg(btrim(x.v) ORDER BY x.ord))[1] AS v, min(x.ord) AS first
                  FROM unnest(c2.tags) WITH ORDINALITY AS x (v, ord)
                 WHERE btrim(x.v) <> ''
                 GROUP BY lower(btrim(x.v))) t ON true
         GROUP BY c2.id) n
 WHERE n.id = c.id AND c.tags IS DISTINCT FROM n.tags;
SET LOCAL ab.bookkeeping = 'off';

SELECT schema_try_check('courses', 'courses_tags_check', 'text_list_ok(tags, 20, 64)');
SELECT schema_try_check('courses', 'courses_learnings_check', 'course_learnings_ok(learnings)');
