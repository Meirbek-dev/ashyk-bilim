-- BUG-367: optimistic lock for the profile builder document. Bumped on every
-- write of `users.profile`; `PATCH /users/me` compares it with `If-Match` and
-- answers 412 instead of silently replacing a document saved from another tab.
ALTER TABLE users
    ADD COLUMN profile_version integer NOT NULL DEFAULT 0;
