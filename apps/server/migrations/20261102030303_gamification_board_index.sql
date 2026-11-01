-- no-transaction
CREATE INDEX CONCURRENTLY gamification_profiles_board_idx ON gamification_profiles (total_xp DESC, user_id);
