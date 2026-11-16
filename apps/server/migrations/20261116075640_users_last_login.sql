-- Smaller items, part 2 (REWRITE 5.8 item 7): the last login is the user's, not the gamification profile's.
--
-- `users.last_login_at` (backfilled) is what the server reads and writes; the login streak stays in
-- `gamification_profiles` and is counted from it. Switch release: the previous release reads and writes
-- `gamification_profiles.last_login_at`, so a trigger on each side copies a change to the other (each copy
-- changes nothing the second time, so it stops there). A contract drops the old column and both triggers
-- (pending-contracts.tsv).
SET LOCAL lock_timeout = '5s';
-- The backfill keeps each user's `updated_at` (touch_row).
SET LOCAL ab.bookkeeping = 'on';

ALTER TABLE users ADD COLUMN last_login_at timestamptz;
COMMENT ON COLUMN core.users.last_login_at IS 'The latest sign-in (password or Google); the login streak counts from it.';
UPDATE users u SET last_login_at = g.last_login_at
  FROM gamification_profiles g
 WHERE g.user_id = u.id AND g.last_login_at IS NOT NULL;

-- The previous release's writes reach the new column.
CREATE FUNCTION gamification_profiles_last_login() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    UPDATE users SET last_login_at = NEW.last_login_at
     WHERE id = NEW.user_id AND last_login_at IS DISTINCT FROM NEW.last_login_at;
    RETURN NULL;
END $$;
CREATE TRIGGER gamification_profiles_last_login AFTER UPDATE OF last_login_at ON gamification_profiles
    FOR EACH ROW WHEN (NEW.last_login_at IS DISTINCT FROM OLD.last_login_at)
    EXECUTE FUNCTION gamification_profiles_last_login();

-- The previous release reads the old column (its streak and the profile's `last_login_at_unix`).
CREATE FUNCTION users_last_login() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, core, learning, ai, analytics, ops, extensions, pg_temp AS $$
BEGIN
    UPDATE gamification_profiles SET last_login_at = NEW.last_login_at
     WHERE user_id = NEW.id AND last_login_at IS DISTINCT FROM NEW.last_login_at;
    RETURN NULL;
END $$;
CREATE TRIGGER users_last_login AFTER UPDATE OF last_login_at ON users
    FOR EACH ROW WHEN (NEW.last_login_at IS DISTINCT FROM OLD.last_login_at)
    EXECUTE FUNCTION users_last_login();

-- The read-only role's column grants on users name every column: re-run them for the new one.
SELECT apply_role_grants(current_user);
