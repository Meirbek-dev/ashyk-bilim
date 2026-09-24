//! Gamification queries (compile-checked): profiles, the XP ledger, the
//! policy row, leaderboard reads. Timestamps as epoch seconds.

use ab_core::Result;
use ab_core::assessments::{StreakKind, XpSource};
use ab_core::id::{GamificationProfileId, UserId, XpTransactionId};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct ProfileRow {
    pub id: GamificationProfileId,
    pub user_id: UserId,
    pub total_xp: i32,
    pub level: i32,
    pub daily_xp_earned: i32,
    pub login_streak: i32,
    pub learning_streak: i32,
    pub longest_login_streak: i32,
    pub longest_learning_streak: i32,
    pub total_activities_completed: i32,
    pub total_courses_completed: i32,
    pub last_xp_award_at: Option<i64>,
    pub last_login_at: Option<i64>,
    pub last_learning_at: Option<i64>,
    pub preferences: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn get_profile(pool: &PgPool, user_id: UserId) -> Result<Option<ProfileRow>> {
    let row = sqlx::query_as!(
        ProfileRow,
        r#"SELECT id AS "id: GamificationProfileId", user_id AS "user_id: UserId", total_xp, level,
                  daily_xp_earned, login_streak, learning_streak, longest_login_streak,
                  longest_learning_streak, total_activities_completed, total_courses_completed,
                  (extract(epoch FROM last_xp_award_at))::bigint AS "last_xp_award_at?",
                  (extract(epoch FROM last_login_at))::bigint AS "last_login_at?",
                  (extract(epoch FROM last_learning_at))::bigint AS "last_learning_at?",
                  preferences,
                  (extract(epoch FROM created_at))::bigint AS "created_at!",
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM gamification_profiles WHERE user_id = $1"#,
        user_id.0
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

/// Create-or-get (the unique key absorbs the race).
pub async fn ensure_profile(pool: &PgPool, user_id: UserId) -> Result<ProfileRow> {
    sqlx::query!(
        "INSERT INTO gamification_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
        user_id.0
    )
    .execute(pool)
    .await?;
    get_profile(pool, user_id)
        .await?
        .ok_or_else(|| ab_core::Error::not_found("gamification profile"))
}

#[derive(Debug, Clone)]
pub struct TransactionRow {
    pub id: XpTransactionId,
    pub user_id: UserId,
    pub amount: i32,
    pub source: XpSource,
    pub source_id: Option<String>,
    pub reason: Option<String>,
    pub previous_level: i32,
    pub triggered_level_up: bool,
    pub created_at: i64,
}

/// A prior award for the same key or the same (source, source_id).
pub async fn find_transaction(
    pool: &PgPool,
    user_id: UserId,
    source: XpSource,
    source_id: Option<&str>,
    idempotency_key: Option<&str>,
) -> Result<Option<TransactionRow>> {
    let row = sqlx::query_as!(
        TransactionRow,
        r#"SELECT id AS "id: XpTransactionId", user_id AS "user_id: UserId", amount,
                  source AS "source: XpSource", source_id, reason, previous_level,
                  triggered_level_up,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM xp_transactions
           WHERE user_id = $1
             AND (($4::text IS NOT NULL AND idempotency_key = $4)
                  OR ($3::text IS NOT NULL AND source = $2 AND source_id = $3))
           ORDER BY created_at DESC LIMIT 1"#,
        user_id.0,
        source.as_str(),
        source_id,
        idempotency_key
    )
    .fetch_optional(pool)
    .await?;
    Ok(row)
}

pub struct NewTransaction<'a> {
    pub user_id: UserId,
    pub amount: i32,
    pub source: XpSource,
    pub source_id: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

/// What [`record_award`] did.
#[derive(Debug)]
pub enum Recorded {
    New(TransactionRow),
    /// A unique key already held the award.
    Replay,
    /// The award would push today's total past the cap; nothing written.
    OverDailyLimit {
        earned_today: i32,
    },
}

/// Record the award and move the profile in one transaction.
///
/// The daily cap (`daily_limit`, `None` = uncapped) is checked and the UTC-day reset
/// decided under the profile row lock, so parallel awards serialize on it
/// (BUG-252). Returns the new row with `triggered_level_up` resolved.
pub async fn record_award(
    pool: &PgPool,
    new: NewTransaction<'_>,
    daily_limit: Option<i32>,
) -> Result<Recorded> {
    let mut tx = pool.begin().await?;
    let locked = sqlx::query!(
        r#"SELECT level AS "level!", daily_xp_earned AS "daily_xp_earned!",
                  (last_xp_award_at IS NOT NULL
                   AND (last_xp_award_at AT TIME ZONE 'UTC')::date
                       = (now() AT TIME ZONE 'UTC')::date) AS "same_day!"
           FROM gamification_profiles WHERE user_id = $1 FOR UPDATE"#,
        new.user_id.0
    )
    .fetch_one(&mut *tx)
    .await?;
    let previous_level = locked.level;
    let inserted = sqlx::query_scalar!(
        r#"INSERT INTO xp_transactions
               (user_id, amount, source, source_id, reason, previous_level, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING
           RETURNING id AS "id: XpTransactionId""#,
        new.user_id.0,
        new.amount,
        new.source.as_str(),
        new.source_id,
        new.reason,
        previous_level,
        new.idempotency_key
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(id) = inserted else {
        tx.rollback().await?;
        return Ok(Recorded::Replay);
    };
    let earned_today = if locked.same_day {
        locked.daily_xp_earned
    } else {
        0
    };
    if daily_limit.is_some_and(|limit| earned_today + new.amount > limit) {
        tx.rollback().await?;
        return Ok(Recorded::OverDailyLimit { earned_today });
    }
    // Level curve: XP(level) = 50(level-1)^2 + 50(level-1), capped at 100.
    let new_level: i32 = sqlx::query_scalar!(
        r#"UPDATE gamification_profiles SET
               total_xp = total_xp + $2,
               level = LEAST(100, GREATEST(1,
                   floor((-1 + sqrt(1 + 0.08 * (total_xp + $2))) / 2)::int + 1)),
               daily_xp_earned = $3 + $2,
               last_xp_award_at = now()
           WHERE user_id = $1
           RETURNING level AS "level!""#,
        new.user_id.0,
        new.amount,
        earned_today
    )
    .fetch_one(&mut *tx)
    .await?;
    let row = sqlx::query_as!(
        TransactionRow,
        r#"UPDATE xp_transactions SET triggered_level_up = $2 WHERE id = $1
           RETURNING id AS "id: XpTransactionId", user_id AS "user_id: UserId", amount,
                     source AS "source: XpSource", source_id, reason, previous_level,
                     triggered_level_up,
                     (extract(epoch FROM created_at))::bigint AS "created_at!""#,
        id.0,
        new_level > previous_level
    )
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Recorded::New(row))
}

pub async fn set_streak(
    pool: &PgPool,
    user_id: UserId,
    kind: StreakKind,
    streak: i32,
) -> Result<()> {
    match kind {
        StreakKind::Login => {
            sqlx::query!(
                r#"UPDATE gamification_profiles SET login_streak = $2,
                       longest_login_streak = GREATEST(longest_login_streak, $2),
                       last_login_at = now()
                   WHERE user_id = $1"#,
                user_id.0,
                streak
            )
            .execute(pool)
            .await?;
        }
        StreakKind::Learning => {
            sqlx::query!(
                r#"UPDATE gamification_profiles SET learning_streak = $2,
                       longest_learning_streak = GREATEST(longest_learning_streak, $2),
                       last_learning_at = now()
                   WHERE user_id = $1"#,
                user_id.0,
                streak
            )
            .execute(pool)
            .await?;
        }
    }
    Ok(())
}

/// Count a first completion (`kind` = `activity` | `course`) whatever the
/// XP award did; `false` when this completion was already counted (UX-170).
pub async fn record_completion(
    pool: &PgPool,
    user_id: UserId,
    kind: &str,
    source_id: &str,
) -> Result<bool> {
    let counted = sqlx::query_scalar!(
        r#"WITH ins AS (
               INSERT INTO gamification_completions (user_id, kind, source_id)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING kind)
           UPDATE gamification_profiles SET
               total_activities_completed = total_activities_completed
                   + (SELECT count(*) FROM ins WHERE kind = 'activity')::int,
               total_courses_completed = total_courses_completed
                   + (SELECT count(*) FROM ins WHERE kind = 'course')::int
           WHERE user_id = $1
           RETURNING EXISTS (SELECT 1 FROM ins) AS "counted!""#,
        user_id.0,
        kind,
        source_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(counted.unwrap_or(false))
}

pub async fn set_preferences(
    pool: &PgPool,
    user_id: UserId,
    preferences: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE gamification_profiles SET preferences = $2 WHERE user_id = $1",
        user_id.0,
        preferences
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn recent_transactions(
    pool: &PgPool,
    user_id: UserId,
    limit: i64,
) -> Result<Vec<TransactionRow>> {
    let rows = sqlx::query_as!(
        TransactionRow,
        r#"SELECT id AS "id: XpTransactionId", user_id AS "user_id: UserId", amount,
                  source AS "source: XpSource", source_id, reason, previous_level,
                  triggered_level_up,
                  (extract(epoch FROM created_at))::bigint AS "created_at!"
           FROM xp_transactions WHERE user_id = $1
           ORDER BY created_at DESC, id DESC LIMIT $2"#,
        user_id.0,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[derive(Debug, Clone)]
pub struct LeaderboardRow {
    /// Competition rank over the whole public board (ties share, the next
    /// skips) — the same rule as `count_with_more_xp + 1` (UX-172).
    pub rank: i64,
    pub user_id: UserId,
    pub total_xp: i32,
    pub level: i32,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

pub async fn leaderboard(pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<LeaderboardRow>> {
    let rows = sqlx::query_as!(
        LeaderboardRow,
        r#"SELECT rank() OVER (ORDER BY p.total_xp DESC) AS "rank!", p.user_id AS "user_id: UserId",
                  p.total_xp, p.level, u.username, u.display_name, u.avatar_key
           FROM gamification_profiles p JOIN users u ON u.id = p.user_id
           WHERE p.preferences #> '{privacy,showOnLeaderboard}' IS DISTINCT FROM 'false'::jsonb
           ORDER BY p.total_xp DESC, p.id
           LIMIT $1 OFFSET $2"#,
        limit,
        offset
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// Profiles on the leaderboard: everyone except those who set
/// `preferences.privacy.showOnLeaderboard = false` (the client's opt-out).
pub async fn count_profiles(pool: &PgPool) -> Result<i64> {
    let n = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM gamification_profiles
           WHERE preferences #> '{privacy,showOnLeaderboard}' IS DISTINCT FROM 'false'::jsonb"#
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
}

/// Leaderboard members above `total_xp` — the caller's rank is this + 1,
/// counted against the public board (opted-out profiles do not displace).
pub async fn count_with_more_xp(pool: &PgPool, total_xp: i32) -> Result<i64> {
    let n = sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM gamification_profiles WHERE total_xp > $1
           AND preferences #> '{privacy,showOnLeaderboard}' IS DISTINCT FROM 'false'::jsonb"#,
        total_xp
    )
    .fetch_one(pool)
    .await?;
    Ok(n)
}

#[derive(Debug, Clone)]
pub struct ConfigRow {
    pub daily_xp_limit: Option<i32>,
    pub rewards: serde_json::Value,
    pub updated_at: i64,
}

pub async fn get_config(pool: &PgPool) -> Result<ConfigRow> {
    let row = sqlx::query_as!(
        ConfigRow,
        r#"SELECT daily_xp_limit, rewards,
                  (extract(epoch FROM updated_at))::bigint AS "updated_at!"
           FROM gamification_config WHERE id = 1"#
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

pub async fn set_config(
    pool: &PgPool,
    daily_xp_limit: Option<i32>,
    rewards: &serde_json::Value,
) -> Result<()> {
    sqlx::query!(
        "UPDATE gamification_config SET daily_xp_limit = $1, rewards = $2 WHERE id = 1",
        daily_xp_limit,
        rewards
    )
    .execute(pool)
    .await?;
    Ok(())
}
