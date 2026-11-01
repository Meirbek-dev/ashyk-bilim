-- no-transaction
CREATE UNIQUE INDEX CONCURRENTLY gamification_profiles_natural_key ON gamification_profiles (user_id);
