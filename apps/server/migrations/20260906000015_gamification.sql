-- Gamification (P6.4): one profile per user, an append-only XP ledger with
-- idempotency, and a singleton policy row (legacy org_gamification_config).

CREATE TABLE gamification_profiles (
    id                         uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id                    uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    total_xp                   integer NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
    level                      integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    daily_xp_earned            integer NOT NULL DEFAULT 0 CHECK (daily_xp_earned >= 0),
    login_streak               integer NOT NULL DEFAULT 0 CHECK (login_streak >= 0),
    learning_streak            integer NOT NULL DEFAULT 0 CHECK (learning_streak >= 0),
    longest_login_streak       integer NOT NULL DEFAULT 0 CHECK (longest_login_streak >= 0),
    longest_learning_streak    integer NOT NULL DEFAULT 0 CHECK (longest_learning_streak >= 0),
    total_activities_completed integer NOT NULL DEFAULT 0 CHECK (total_activities_completed >= 0),
    total_courses_completed    integer NOT NULL DEFAULT 0 CHECK (total_courses_completed >= 0),
    last_xp_award_at           timestamptz,
    last_login_at              timestamptz,
    last_learning_at           timestamptz,
    preferences                jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER gamification_profiles_set_updated_at BEFORE UPDATE ON gamification_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX gamification_profiles_xp_idx ON gamification_profiles (total_xp DESC, id);

CREATE TABLE xp_transactions (
    id                 uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount             integer NOT NULL CHECK (amount > 0),
    source             text NOT NULL CHECK (source IN (
                           'activity_completion', 'course_completion', 'login_bonus',
                           'quiz_completion', 'exam_completion', 'streak_bonus', 'admin_award',
                           'code_challenge_completion', 'code_challenge_perfect',
                           'code_challenge_first_solve')),
    source_id          text,
    reason             text,
    previous_level     integer NOT NULL CHECK (previous_level >= 1),
    triggered_level_up boolean NOT NULL DEFAULT false,
    -- Both keys make replays no-ops: an explicit caller key, and one award
    -- per (user, source, source_id). NULL source_id never conflicts.
    idempotency_key    text UNIQUE,
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, source, source_id)
);
CREATE INDEX xp_transactions_user_recent_idx ON xp_transactions (user_id, created_at DESC);

-- Singleton policy overrides; NULL / non-positive means "use the default".
CREATE TABLE gamification_config (
    id             smallint PRIMARY KEY CHECK (id = 1),
    daily_xp_limit integer,
    rewards        jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER gamification_config_set_updated_at BEFORE UPDATE ON gamification_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO gamification_config (id) VALUES (1);
