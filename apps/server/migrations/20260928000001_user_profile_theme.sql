-- BUG-361/362: the legacy profile builder sections and the per-user UI theme
-- (legacy `user.profile` / `user.theme`) lost in the rewrite.
-- `profile` is the typed `{sections: [...]}` document (ab_domain::identity::profile);
-- `theme` is the registry slug the web applies for the user, NULL = default.
ALTER TABLE users
    ADD COLUMN profile jsonb NOT NULL DEFAULT '{"sections": []}'::jsonb,
    ADD COLUMN theme   text;
