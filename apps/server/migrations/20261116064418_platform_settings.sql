-- Platform settings in one row (REWRITE 5.6 n9, 5.8 item 2): the gamification policy, the AI feature switches and
-- the instant the deadline hand-in went live move from their own tables onto the `platforms` row. The server reads
-- and writes only these columns from this release; `gamification_config`, `ai_feature_switches` and
-- `feature_activations` keep what they held for the previous release and a later one drops them
-- (pending-contracts.tsv). Who switched an AI feature stays in auth_audit_log (`ai-feature-switched`).
SET LOCAL lock_timeout = '5s';

ALTER TABLE platforms
    ADD COLUMN daily_xp_limit integer,
    ADD COLUMN xp_rewards jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN ai_features jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN deadline_auto_submit_since timestamptz;

UPDATE platforms p SET
    daily_xp_limit = (SELECT g.daily_xp_limit FROM gamification_config g WHERE g.id = 1),
    xp_rewards = COALESCE((SELECT g.rewards FROM gamification_config g WHERE g.id = 1), '{}'),
    ai_features = (SELECT COALESCE(jsonb_object_agg(s.feature, s.enabled), '{}') FROM ai_feature_switches s),
    deadline_auto_submit_since = (SELECT f.activated_at FROM feature_activations f
                                  WHERE f.feature = 'deadline_auto_submit')
WHERE p.singleton;

COMMENT ON COLUMN core.platforms.daily_xp_limit IS 'XP a learner earns per day at most; NULL = the server default.';
COMMENT ON COLUMN core.platforms.xp_rewards IS 'XP per reward kind that overrides the server defaults (GamificationRewards).';
COMMENT ON COLUMN core.platforms.ai_features IS
    'AI feature switches an admin stored, {flag key: enabled}; a key not here follows the environment.';
COMMENT ON COLUMN core.platforms.deadline_auto_submit_since IS
    'When the deadline hand-in went live here: drafts whose date passed earlier are never handed in by it. NULL = never.';

-- The API takes any object of rewards (as before); a switch is a boolean.
SELECT schema_try_check('platforms', 'platforms_xp_rewards_object', $$jsonb_typeof(xp_rewards) = 'object'$$);
SELECT schema_try_check('platforms', 'platforms_ai_features_booleans',
                        $$jsonb_typeof(ai_features) = 'object' AND NOT jsonb_path_exists(ai_features, '$.* ? (@.type() != "boolean")')$$);
