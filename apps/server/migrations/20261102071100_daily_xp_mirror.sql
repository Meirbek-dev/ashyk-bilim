-- gamification_profiles.daily_xp_earned (review item 16, rest): the server
-- stopped reading it (today's XP is summed from xp_transactions at read time)
-- and now stops writing it too, so the lane C2 contract can drop it.
--
-- Expand step: the previous release still reads the column for its daily cap
-- and its profile, as "XP awarded since 00:00 UTC" (it compares the UTC date
-- of last_xp_award_at with today's). Every award sets last_xp_award_at, so a
-- BEFORE trigger on that column recomputes the counter from the journal with
-- the previous release's own rule - for its awards and for the new code's,
-- which no longer name the column. The journal row of the award is inserted
-- earlier in the same transaction, so it is counted.

SET LOCAL lock_timeout = '5s';

CREATE FUNCTION gamification_profiles_daily_xp() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.daily_xp_earned := coalesce((
        SELECT sum(x.amount) FROM xp_transactions x
        WHERE x.user_id = NEW.user_id
          AND x.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0);
    RETURN NEW;
END;
$$;

CREATE TRIGGER gamification_profiles_daily_xp
    BEFORE UPDATE OF last_xp_award_at ON gamification_profiles
    FOR EACH ROW EXECUTE FUNCTION gamification_profiles_daily_xp();
