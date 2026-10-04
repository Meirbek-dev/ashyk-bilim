//! Gamification DTOs: profile, ledger, leaderboard, dashboard, admin award,
//! the preferences patch.
// The patch needs three states per section: absent (keep), `null` (remove), value.
#![allow(clippy::option_option)]

use ab_core::assessments::{StreakKind, XpSource};
use ab_core::id::{UserId, XpTransactionId};
use ab_domain::gamification as domain;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::double_option;

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
    /// Stored camelCase document (old web); removed in phase 9.
    #[schema(value_type = GamificationPreferences)]
    pub preferences: serde_json::Value,
    /// S-10: the same preferences with snake_case keys.
    pub settings: GamificationSettings,
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
            settings: GamificationSettings::from_stored(&p.preferences),
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
    /// Keyset paging (`cursor` in, this out; `null` on the last page and
    /// for `limit`/`offset` reads).
    pub next_cursor: Option<String>,
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
            next_cursor: None,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct Dashboard {
    pub profile: Profile,
    pub recent_transactions: Vec<Transaction>,
    /// `null` when the viewer opted out of the leaderboard.
    pub user_rank: Option<i64>,
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
    /// Legacy paging; ignored when `cursor` is given.
    pub offset: Option<i64>,
    /// Keyset paging: the previous page's `next_cursor` (an empty string
    /// starts from the top).
    pub cursor: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserRank {
    pub user_id: UserId,
    /// `null` when the profile opted out of the leaderboard.
    pub rank: Option<i64>,
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
    #[schema(minimum = 1, maximum = 100_000)]
    pub amount: i32,
    #[garde(length(chars, max = 500))]
    #[schema(max_length = 500)]
    pub reason: Option<String>,
    #[garde(length(max = 200))]
    #[schema(max_length = 200)]
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
    #[schema(value_type = std::collections::BTreeMap<String, i32>)]
    pub rewards: serde_json::Value,
    /// Send back as `If-Match` on the PUT (stale -> 412).
    /// Always present (schema-optional while client fixtures catch up).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub version: Option<i32>,
    pub updated_at_unix: i64,
}

impl From<ab_db::gamification::ConfigRow> for GamificationConfig {
    fn from(c: ab_db::gamification::ConfigRow) -> Self {
        Self {
            daily_xp_limit: c.daily_xp_limit,
            rewards: c.rewards,
            version: Some(c.version),
            updated_at_unix: c.updated_at,
        }
    }
}

#[derive(Debug, Deserialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateGamificationConfigRequest {
    #[garde(range(min = 0, max = 1_000_000))]
    #[schema(minimum = 0, maximum = 1_000_000)]
    pub daily_xp_limit: Option<i32>,
    #[garde(skip)]
    #[serde(default = "empty_object")]
    #[schema(value_type = std::collections::BTreeMap<String, i32>)]
    pub rewards: serde_json::Value,
}

fn empty_object() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

/// A preference value is a boolean or absent - `null` is neither an opt-in
/// nor an opt-out (BUG-137); remove the whole section with `"privacy": null`.
fn bool_not_null<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    bool::deserialize(deserializer).map(Some)
}

impl PreferencesPatch {
    /// Fold the snake_case twins into the stored camelCase keys (a key sent
    /// both ways keeps the camelCase value).
    pub fn normalize(&mut self) {
        if let Some(Some(p)) = &mut self.privacy {
            p.show_on_leaderboard = p
                .show_on_leaderboard
                .or_else(|| p.show_on_leaderboard_v2.take());
        }
        if let Some(Some(n)) = &mut self.notifications {
            n.xp_gain = n.xp_gain.or_else(|| n.xp_gain_v2.take());
        }
        if let Some(Some(d)) = &mut self.display {
            d.animated_effects = d.animated_effects.or_else(|| d.animated_effects_v2.take());
            d.compact_mode = d.compact_mode.or_else(|| d.compact_mode_v2.take());
        }
    }
}

/// S-10 `Profile.settings`: the preferences with snake_case keys; a value
/// never set is `null`.
#[derive(Debug, Serialize, ToSchema)]
pub struct GamificationSettings {
    pub privacy: PrivacySettings,
    pub notifications: XpNotificationSettings,
    pub display: DisplaySettings,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PrivacySettings {
    /// `false` hides the profile from the leaderboard.
    pub show_on_leaderboard: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct XpNotificationSettings {
    pub xp_gain: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DisplaySettings {
    pub animated_effects: Option<bool>,
    pub compact_mode: Option<bool>,
}

impl GamificationSettings {
    fn from_stored(stored: &serde_json::Value) -> Self {
        let flag = |pointer: &str| stored.pointer(pointer).and_then(serde_json::Value::as_bool);
        Self {
            privacy: PrivacySettings {
                show_on_leaderboard: flag("/privacy/showOnLeaderboard"),
            },
            notifications: XpNotificationSettings {
                xp_gain: flag("/notifications/xpGain"),
            },
            display: DisplaySettings {
                animated_effects: flag("/display/animatedEffects"),
                compact_mode: flag("/display/compactMode"),
            },
        }
    }
}

/// Stored gamification preferences: the sections the user has set (a
/// section never set is absent).
#[derive(ToSchema)]
pub struct GamificationPreferences {
    #[schema(nullable = false)]
    pub privacy: Option<PrivacyPreferences>,
    #[schema(nullable = false)]
    pub notifications: Option<NotificationPreferences>,
    #[schema(nullable = false)]
    pub display: Option<DisplayPreferences>,
}

/// `PATCH /gamification/preferences`: the sections the settings form owns.
///
/// A section absent from the patch is kept, `null` removes it, an object
/// replaces it. Keys are camelCase or (S-10) snake_case; anything else is
/// 422.
#[derive(Debug, Default, Deserialize, Serialize, garde::Validate, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PreferencesPatch {
    #[garde(skip)]
    #[serde(
        default,
        deserialize_with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<PrivacyPreferences>)]
    pub privacy: Option<Option<PrivacyPreferences>>,
    #[garde(skip)]
    #[serde(
        default,
        deserialize_with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<NotificationPreferences>)]
    pub notifications: Option<Option<NotificationPreferences>>,
    #[garde(skip)]
    #[serde(
        default,
        deserialize_with = "double_option",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(value_type = Option<DisplayPreferences>)]
    pub display: Option<Option<DisplayPreferences>>,
}

#[derive(Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PrivacyPreferences {
    /// `false` hides the profile from the leaderboard (and its rank is `null`).
    #[serde(
        default,
        deserialize_with = "bool_not_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(nullable = false)]
    pub show_on_leaderboard: Option<bool>,
    /// snake_case twin (S-10); the camelCase key goes in phase 9.
    #[serde(
        rename = "show_on_leaderboard",
        default,
        deserialize_with = "bool_not_null",
        skip_serializing
    )]
    #[schema(nullable = false)]
    pub show_on_leaderboard_v2: Option<bool>,
}

#[derive(Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct NotificationPreferences {
    #[serde(
        default,
        deserialize_with = "bool_not_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(nullable = false)]
    pub xp_gain: Option<bool>,
    /// snake_case twin (S-10); the camelCase key goes in phase 9.
    #[serde(
        rename = "xp_gain",
        default,
        deserialize_with = "bool_not_null",
        skip_serializing
    )]
    #[schema(nullable = false)]
    pub xp_gain_v2: Option<bool>,
}

#[derive(Debug, Default, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DisplayPreferences {
    #[serde(
        default,
        deserialize_with = "bool_not_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(nullable = false)]
    pub animated_effects: Option<bool>,
    /// snake_case twin (S-10); the camelCase key goes in phase 9.
    #[serde(
        rename = "animated_effects",
        default,
        deserialize_with = "bool_not_null",
        skip_serializing
    )]
    #[schema(nullable = false)]
    pub animated_effects_v2: Option<bool>,
    #[serde(
        default,
        deserialize_with = "bool_not_null",
        skip_serializing_if = "Option::is_none"
    )]
    #[schema(nullable = false)]
    pub compact_mode: Option<bool>,
    /// snake_case twin (S-10); the camelCase key goes in phase 9.
    #[serde(
        rename = "compact_mode",
        default,
        deserialize_with = "bool_not_null",
        skip_serializing
    )]
    #[schema(nullable = false)]
    pub compact_mode_v2: Option<bool>,
}
