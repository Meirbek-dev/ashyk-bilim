-- UX-222: one matching rule for `/search` and `courses?q=` (and collections).
-- `words` / `letters` / `negated` are word regexes built by `ab_db::search::word_patterns`
-- (word-start prefix; a one-character word whole, in `letters`). Both sides are
-- lower-cased and, except for `letters` (so «c» is not the preposition «с»),
-- Cyrillic look-alikes are folded to Latin: «С#» (Cyrillic) is found by «C#».
CREATE FUNCTION search_fold(t text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    RETURN translate(lower(t), 'авекмнорстухі', 'abekmhopctyxi');

CREATE FUNCTION search_matches(hay text, words text[], letters text[], negated text[])
    RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
        SELECT NOT EXISTS (SELECT 1 FROM unnest(words) p WHERE search_fold(hay) !~ search_fold(p))
           AND NOT EXISTS (SELECT 1 FROM unnest(letters) p WHERE lower(hay) !~ lower(p))
           AND NOT EXISTS (SELECT 1 FROM unnest(negated) p WHERE search_fold(hay) ~ search_fold(p))
    $$;
