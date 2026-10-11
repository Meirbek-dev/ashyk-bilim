-- Whether the account's email address is confirmed, mirrored from Zitadel so `GET /users/me` and
-- the session can ask the user to confirm it (DECISIONS 2026-10-11, «Подтвердите email»).
-- Set on registration (false), admin creation and Google sign-up (true) and by
-- `POST /auth/verify-email` (true). NULL = not known yet (accounts older than this column): the
-- first read asks Zitadel and stores the answer.
ALTER TABLE users ADD COLUMN email_verified boolean;
