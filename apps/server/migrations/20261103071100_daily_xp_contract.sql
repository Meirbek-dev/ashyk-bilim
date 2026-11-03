-- contract: gamification_profiles.daily_xp_earned goes (review item 16).
-- Only the release before 20261102071100 read it; the release since neither
-- reads nor writes it (today's XP is summed from xp_transactions), and the
-- trigger that kept it for the older release goes with it. Nothing to
-- backfill: the value was derived from the journal, which stays.

SET LOCAL lock_timeout = '5s';

DROP TRIGGER gamification_profiles_daily_xp ON gamification_profiles;
DROP FUNCTION gamification_profiles_daily_xp();
ALTER TABLE gamification_profiles DROP COLUMN daily_xp_earned;
