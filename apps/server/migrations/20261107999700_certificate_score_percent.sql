-- contract: the score on an official document is an exact percentage, not a float (schema review 35). The running
-- release reads it through ::float8 and binds its writes as float8, so it runs on either type. Rewrites the table
-- under a short lock; production holds a few hundred rows.

SET LOCAL lock_timeout = '5s';

ALTER TABLE certificate_users DROP CONSTRAINT IF EXISTS certificate_users_score_range;
ALTER TABLE certificate_users ALTER COLUMN score TYPE percent USING round(score::numeric, 2);
