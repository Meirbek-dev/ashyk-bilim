-- Hand-ins graded before the 2026-09-30 cutover keep the legacy breakdown shape:
-- each graded item's `user_answer` is a bare array (`["2"]`, `[{left,right}]`,
-- `[]` for no answer) or a legacy `{"kind": "CODE", …}` code answer instead of
-- the item answer object the contract (and the web's schema check) expects, so
-- their learners' result pages hung on «Загрузка…». Take the answer object the
-- learner actually sent from `submissions.answers` (null when unanswered). The
-- append-only grading ledger (`grading_entries`) keeps its copy: it is never
-- served, and its immutability trigger stays untouched.
CREATE FUNCTION pg_temp.legacy_answer(answer jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_typeof(answer) = 'array'
        OR (jsonb_typeof(answer) = 'object'
            AND COALESCE(answer ->> 'kind', '') NOT IN ('choice', 'open_text', 'form', 'code', 'matching'))
$$;

CREATE FUNCTION pg_temp.answers_as_objects(breakdown jsonb, answers jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN jsonb_typeof(breakdown -> 'items') <> 'array' THEN breakdown
        ELSE jsonb_set(breakdown, '{items}', COALESCE((
            SELECT jsonb_agg(
                CASE WHEN pg_temp.legacy_answer(i -> 'user_answer') THEN
                    jsonb_set(i, '{user_answer}', CASE
                        WHEN jsonb_typeof(answers -> (i ->> 'item_id')) = 'object'
                            THEN answers -> (i ->> 'item_id')
                        ELSE 'null'::jsonb END)
                ELSE i END
                ORDER BY ord)
            FROM jsonb_array_elements(breakdown -> 'items') WITH ORDINALITY AS t(i, ord)
        ), '[]'::jsonb))
    END
$$;

CREATE FUNCTION pg_temp.has_legacy_answers(breakdown jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_typeof(breakdown -> 'items') = 'array'
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(breakdown -> 'items') i
                   WHERE pg_temp.legacy_answer(i -> 'user_answer'))
$$;

UPDATE submissions
SET grading = pg_temp.answers_as_objects(grading, answers)
WHERE pg_temp.has_legacy_answers(grading);

