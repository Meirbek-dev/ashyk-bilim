-- Search through trigram indexes (schema review item 35, REWRITE 5.6 n11).
--
-- search_matches(hay, words, letters, negated) applied its regexes inside one function over
-- arrays, so no index could answer it: every /search scanned every course, collection and
-- activity. The /search queries now spell the rule as one `search_fold(hay) ~ search_fold($n)`
-- predicate per word (ab_db::search::push_terms), which a pg_trgm GIN index on `search_fold(hay)`
-- answers for words of three or more characters (20261102040600..41000). pg_trgm is a trusted
-- extension: the database owner creates it. search_fold is IMMUTABLE; changing its body later
-- needs a REINDEX of these indexes in the same migration.

SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
