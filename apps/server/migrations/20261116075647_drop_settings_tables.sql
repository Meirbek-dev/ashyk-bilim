-- contract: since 20261116064418 the gamification policy, the AI feature switches and the instant the deadline
-- hand-in went live are columns of the `platforms` row; no release reads or writes these tables (REWRITE 5.8 item 2).
SET LOCAL lock_timeout = '5s';

DROP TABLE learning.gamification_config;
DROP TABLE ai.ai_feature_switches;
DROP TABLE core.feature_activations;
