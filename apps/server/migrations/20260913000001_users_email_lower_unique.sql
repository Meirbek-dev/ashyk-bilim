-- Emails are case-insensitive identities (DECISIONS 2026-09-13): login and
-- registration compare `lower(email)`, new rows are stored lower-cased, and
-- this index makes the case-insensitive uniqueness a DB fact. Usernames were
-- already compared case-insensitively; index them the same way so the login
-- lookup stays an index probe.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_key ON users (lower(username));
