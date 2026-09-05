//! Gamification DTOs: profile, ledger, leaderboard, dashboard, admin award.

use ab_core::assessments::{StreakKind, XpSource};
use ab_core::id::{UserId, XpTransactionId};
use ab_domain::gamification as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Profile {
    pub user_id: UserId,
    pub total_xp: i32,
    pub level: i32,
    pub xp_in_current_level: i32,
    pub xp_to_next_level: i32,
    pub level_progress_percent: f64,
    pub login_streak: i32,
    pub longest_login_streak: i32,
    pub learning_streak: i32,
    pub longest_learning_streak: i32,
    pub daily_xp_earned: i32,
    pub total_activities_completed: i32,
    pub total_courses_completed: i32,
    pub last_xp_award_at_unix: Option<i64>,
    pub last_login_at_unix: Option<i64>,
    pub last_learning_at_unix: Option<i64>,
    #[schema(value_type = Object)]
    pub preferences: serde_json::Value,
    pub created_at_unix: i64,
    pub updated_at_unix: i64,
}

impl From<ab_db::gamification::ProfileRow> for Profile {
    fn from(p: ab_db::gamification::ProfileRow) -> Self {
        let current = domain::xp_for_level(p.level);
        let next = domain::xp_for_level(p.level + 1);
        let (to_next, percent) = if p.level >= domain::MAX_LEVEL || next <= current {
            (0, 100.0)
        } else {
            let span = f64::from(next - current);
            (
                next - p.total_xp,
                (f64::from(p.total_xp - current) / span * 1000.0).round() / 10.0,
            )
        };
        Self {
            user_id: p.user_id,
            total_xp: p.total_xp,
            level: p.level,
            xp_in_current_level: p.total_xp - current,
            xp_to_next_level: to_next,
            level_progress_percent: percent,
            login_streak: p.login_streak,
            longest_login_streak: p.longest_login_streak,
            learning_streak: p.learning_streak,
            longest_learning_streak: p.longest_learning_streak,
            daily_xp_earned: p.daily_xp_earned,
            total_activities_completed: p.total_activities_completed,
            total_courses_completed: p.total_courses_completed,
            last_xp_award_at_unix: p.last_xp_award_at,
            last_login_at_unix: p.last_login_at,
            last_learning_at_unix: p.last_learning_at,
            preferences: p.preferences,
            created_at_unix: p.created_at,
            updated_at_unix: p.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Transaction {
    pub id: XpTransactionId,
    pub user_id: UserId,
    pub amount: i32,
    pub source: XpSource,
    pub source_id: Option<String>,
    pub reason: Option<String>,
    pub previous_level: i32,
    pub triggered_level_up: bool,
    pub created_at_unix: i64,
}

impl From<ab_db::gamification::TransactionRow> for Transaction {
    fn from(t: ab_db::gamification::TransactionRow) -> Self {
        Self {
            id: t.id,
            user_id: t.user_id,
            amount: t.amount,
            source: t.source,
            source_id: t.source_id,
            reason: t.reason,
            previous_level: t.previous_level,
            triggered_level_up: t.triggered_level_up,
            created_at_unix: t.created_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub user_id: UserId,
    pub total_xp: i32,
    pub level: i32,
    pub username: String,
    pub display_name: String,
    pub avatar_key: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Leaderboard {
    pub entries: Vec<LeaderboardEntry>,
    pub total_participants: i64,
}

impl From<domain::Leaderboard> for Leaderboard {
    fn from(l: domain::Leaderboard) -> Self {
        Self {
            entries: l
                .entries
                .into_iter()
                .map(|e| LeaderboardEntry {
                    rank: e.rank,
                    user_id: e.row.user_id,
                    total_xp: e.row.total_xp,
                    level: e.row.level,
                    username: e.row.username,
                    display_name: e.row.display_name,
                    avatar_key: e.row.avatar_key,
                })
                .collect(),
            total_participants: l.total_participants,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Dashboard {
    pub profile: Profile,
    pub recent_transactions: Vec<Transaction>,
    pub user_rank: i64,
    pub leaderboard: Leaderboard,
}

impl From<domain::Dashboard> for Dashboard {
    fn from(d: domain::Dashboard) -> Self {
        Self {
            profile: d.profile.into(),
            recent_transactions: d.recent_transactions.into_iter().map(Into::into).collect(),
            user_rank: d.user_rank,
            leaderboard: d.leaderboard.into(),
        }
    }
}

#[derive(Debug, Deserialize, ToSchema, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
pub struct LeaderboardQuery {
    /// 1..=100 (default 10).
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserRank {
    pub user_id: UserId,
    pub rank: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct StreakUpdate {
    pub streak_type: StreakKind,
    pub current_count: i32,
    pub longest_count: i32,
    pub is_new_record: bool,
}

impl From<domain::StreakUpdate> for StreakUpdate {
    fn from(s: domain::StreakUpdate) -> Self {
        Self {
            streak_type: s.kind,
            current_count: s.current,
            longest_count: s.longest,
            is_new_record: s.current == s.longest,
        }
    }
}

/// Platform managers grant XP to a user.
#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct AdminAwardRequest {
    #[garde(skip)]
    pub user_id: UserId,
    #[garde(range(min = 1, max = 100_000))]
    pub amount: i32,
    #[garde(length(max = 500))]
    pub reason: Option<String>,
    #[garde(length(max = 200))]
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AwardResponse {
    pub transaction: Transaction,
    pub profile: Profile,
    pub level_up_occurred: bool,
    pub previous_level: i32,
    pub is_new_transaction: bool,
}

impl From<domain::Award> for AwardResponse {
    fn from(a: domain::Award) -> Self {
        Self {
            level_up_occurred: a.transaction.triggered_level_up,
            previous_level: a.transaction.previous_level,
            is_new_transaction: a.is_new,
            transaction: a.transaction.into(),
            profile: a.profile.into(),
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GamificationConfig {
    /// `null` = platform default (500).
    pub daily_xp_limit: Option<i32>,
    /// Source → XP overrides; unknown sources are ignored.
    #[schema(value_type = Object)]
    pub rewards: serde_json::Value,
    pub updated_at_unix: i64,
}

impl From<ab_db::gamification::ConfigRow> for GamificationConfig {
    fn from(c: ab_db::gamification::ConfigRow) -> Self {
        Self {
            daily_xp_limit: c.daily_xp_limit,
            rewards: c.rewards,
            updated_at_unix: c.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateGamificationConfigRequest {
    #[garde(range(min = 0, max = 1_000_000))]
    pub daily_xp_limit: Option<i32>,
    #[garde(skip)]
    #[serde(default = "empty_object")]
    #[schema(value_type = Object)]
    pub rewards: serde_json::Value,
}

fn empty_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}
