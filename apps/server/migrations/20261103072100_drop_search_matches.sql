-- contract: search_matches() has no caller since 20261102072000's release: the course and collection
-- listings filter `q` with the trigram-indexed terms of /search (ab_db::search::push_terms), people
-- search inlines its one-letter rule. search_fold() stays (the trigram indexes are built on it).

SET LOCAL lock_timeout = '5s';

DROP FUNCTION search_matches(text, text[], text[], text[]);
