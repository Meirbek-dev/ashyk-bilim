-- First-party Google OAuth linkage (DECISIONS.md 2026-08-16): the Google `sub`
-- lives in OUR database; Zitadel holds a passwordless user for such accounts.
CREATE TABLE google_accounts (
    google_sub  text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email       text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX google_accounts_user_idx ON google_accounts (user_id);
