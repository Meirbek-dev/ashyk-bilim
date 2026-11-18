-- Code language by name, the leftover (REWRITE 5.8 item 10).
-- contract: `code_languages_stored()` was the identity since 20261116075662, kept for the switch release
-- (20261116075661) that hashed versions through it; that release no longer runs and the server does not call it.
SET LOCAL lock_timeout = '5s';

DROP FUNCTION code_languages_stored(jsonb);
