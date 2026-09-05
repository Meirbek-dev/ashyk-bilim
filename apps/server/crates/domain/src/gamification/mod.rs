//! Gamification (legacy `services/gamification`).
//!
//! Idempotent XP awards under a daily cap, the quadratic level curve,
//! login/learning streaks, leaderboard and dashboard reads, and the hooks
//! other slices call.
//!
//! Awards are never requested by learners in v2 — they are side effects of
//! completing things (activity, course, a passing published submission,
//! the first login of a day). `POST /gamification/xp` is the admin award.

use std::collections::HashMap;

use ab_core::assessments::{StreakKind, XpSource};
use ab_core::id::UserId;
use ab_core::permission::{Action, Permission, ResourceType, Scope};
use ab_core::{Error, ErrorCode, FieldError, Result};
use ab_db::gamification::{ConfigRow, LeaderboardRow, NewTransaction, ProfileRow, TransactionRow};
use sqlx::PgPool;

use crate::identity::Actor;

pub const MAX_LEVEL: i32 = 100;
pub const DEFAULT_DAILY_XP_LIMIT: i32 = 500;
pub const MAX_LEADERBOARD_PAGE: i64 = 100;
const RECENT_TRANSACTIONS: i64 = 10;

const MANAGE_PLATFORM: Permission = Permission {
    resource: ResourceType::Platform,
    action: Action::Manage,
    scope: Some(Scope::Platform),
};

/// Legacy `XP_REWARDS`.
#[must_use]
pub const fn default_reward(source: XpSource) -> i32 {
    match source {
        XpSource::ActivityCompletion | XpSource::CodeChallengeFirstSolve => 25,
        XpSource::CourseCompletion => 200,
        XpSource::LoginBonus => 10,
        XpSource::QuizCompletion => 30,
        XpSource::ExamCompletion | XpSource::StreakBonus | XpSource::CodeChallengeCompletion => 50,
        XpSource::AdminAward => 0,
        XpSource::CodeChallengePerfect => 100,
    }
}

/// XP(level) = 50(level-1)^2 + 50(level-1).
#[must_use]
pub const fn xp_for_level(level: i32) -> i32 {
    if level <= 1 {
        return 0;
    }
    let n = level - 1;
    50 * n * n + 50 * n
}

/// Inverse of [`xp_for_level`], capped at [`MAX_LEVEL`].
#[must_use]
pub fn level_for(total_xp: i32) -> i32 {
    if total_xp <= 0 {
        return 1;
    }
    let root = 0.08f64.mul_add(f64::from(total_xp), 1.0).sqrt();
    #[allow(clippy::cast_possible_truncation)]
    let level = f64::midpoint(-1.0, root).floor() as i32 + 1;
    level.clamp(1, MAX_LEVEL)
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

const fn day_of(unix: i64) -> i64 {
    unix.div_euclid(86_400)
}

/// Resolved policy: defaults overlaid with the config row.
#[derive(Debug, Clone)]
pub struct Policy {
    pub rewards: HashMap<XpSource, i32>,
    /// Non-positive = unlimited.
    pub daily_limit: i32,
}

impl Policy {
    fn from_config(config: &ConfigRow) -> Self {
        let mut rewards: HashMap<XpSource, i32> = XpSource::ALL
            .iter()
            .map(|s| (*s, default_reward(*s)))
            .collect();
        if let Some(map) = config.rewards.as_object() {
            for (key, value) in map {
                let Some(source) = XpSource::parse(key) else {
                    continue;
                };
                let Some(v) = value.as_i64().and_then(|v| i32::try_from(v).ok()) else {
                    continue;
                };
                // Only admin_award may be zero; every other source must pay.
                if (source == XpSource::AdminAward && v >= 0) || v > 0 {
                    rewards.insert(source, v);
                }
            }
        }
        Self {
            rewards,
            daily_limit: config
                .daily_xp_limit
                .filter(|l| *l > 0)
                .unwrap_or(DEFAULT_DAILY_XP_LIMIT),
        }
    }

    fn reward(&self, source: XpSource) -> i32 {
        self.rewards
            .get(&source)
            .copied()
            .unwrap_or_else(|| default_reward(source))
    }
}

/// Result of an award attempt.
#[derive(Debug, Clone)]
pub struct Award {
    pub profile: ProfileRow,
    pub transaction: TransactionRow,
    pub is_new: bool,
}

pub struct AwardRequest<'a> {
    pub user_id: UserId,
    pub source: XpSource,
    /// Overrides the policy amount (admin awards).
    pub amount: Option<i32>,
    pub source_id: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub idempotency_key: Option<&'a str>,
}

#[derive(Debug, Clone)]
pub struct LeaderboardEntry {
    pub rank: i64,
    pub row: LeaderboardRow,
}

#[derive(Debug, Clone)]
pub struct Leaderboard {
    pub entries: Vec<LeaderboardEntry>,
    pub total_participants: i64,
}

#[derive(Debug, Clone)]
pub struct Dashboard {
    pub profile: ProfileRow,
    pub recent_transactions: Vec<TransactionRow>,
    pub user_rank: i64,
    pub leaderboard: Leaderboard,
}

#[derive(Debug, Clone, Copy)]
pub struct StreakUpdate {
    pub kind: StreakKind,
    pub current: i32,
    pub longest: i32,
}

#[derive(Clone)]
pub struct GamificationService {
    pool: PgPool,
}

impl GamificationService {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn policy(&self) -> Result<Policy> {
        Ok(Policy::from_config(
            &ab_db::gamification::get_config(&self.pool).await?,
        ))
    }

    /// Award XP once (legacy `award_xp`): replays return the existing
    /// transaction; the daily cap (all sources but admin awards) is 429.
    pub async fn award(&self, req: AwardRequest<'_>) -> Result<Award> {
        let policy = self.policy().await?;
        let amount = req.amount.unwrap_or_else(|| policy.reward(req.source));
        if amount <= 0 {
            return Err(Error::validation(vec![FieldError {
                field: "amount".into(),
                code: "invalid".into(),
                message: "XP amount must be positive".into(),
            }]));
        }
        let profile = ab_db::gamification::ensure_profile(&self.pool, req.user_id).await?;
        if let Some(existing) = ab_db::gamification::find_transaction(
            &self.pool,
            req.user_id,
            req.source,
            req.source_id,
            req.idempotency_key,
        )
        .await?
        {
            return Ok(Award {
                profile,
                transaction: existing,
                is_new: false,
            });
        }
        let today = day_of(now_unix());
        let same_day = profile.last_xp_award_at.is_some_and(|t| day_of(t) == today);
        let earned_today = if same_day { profile.daily_xp_earned } else { 0 };
        if req.source != XpSource::AdminAward
            && policy.daily_limit > 0
            && earned_today + amount > policy.daily_limit
        {
            return Err(Error::app_with_details(
                ErrorCode::RateLimited,
                "daily XP limit reached",
                serde_json::json!({ "daily_limit": policy.daily_limit, "earned_today": earned_today }),
            ));
        }
        let recorded = ab_db::gamification::record_award(
            &self.pool,
            NewTransaction {
                user_id: req.user_id,
                amount,
                source: req.source,
                source_id: req.source_id,
                reason: req.reason,
                idempotency_key: req.idempotency_key,
            },
            !same_day,
        )
        .await?;
        let fresh = ab_db::gamification::ensure_profile(&self.pool, req.user_id).await?;
        if let Some(transaction) = recorded {
            return Ok(Award {
                profile: fresh,
                transaction,
                is_new: true,
            });
        }
        // Lost the race to a concurrent identical award.
        let existing = ab_db::gamification::find_transaction(
            &self.pool,
            req.user_id,
            req.source,
            req.source_id,
            req.idempotency_key,
        )
        .await?
        .ok_or_else(|| {
            Error::internal("xp award vanished", std::io::Error::other("no transaction"))
        })?;
        Ok(Award {
            profile: fresh,
            transaction: existing,
            is_new: false,
        })
    }

    /// Legacy `update_streak`: same day keeps, next day extends, a gap resets.
    pub async fn record_streak(&self, user_id: UserId, kind: StreakKind) -> Result<StreakUpdate> {
        let profile = ab_db::gamification::ensure_profile(&self.pool, user_id).await?;
        let (last, current) = match kind {
            StreakKind::Login => (profile.last_login_at, profile.login_streak),
            StreakKind::Learning => (profile.last_learning_at, profile.learning_streak),
        };
        let today = day_of(now_unix());
        let next = match last.map(|t| today - day_of(t)) {
            Some(0) => current.max(1),
            Some(1) => current + 1,
            _ => 1,
        };
        ab_db::gamification::set_streak(&self.pool, user_id, kind, next).await?;
        let fresh = ab_db::gamification::ensure_profile(&self.pool, user_id).await?;
        Ok(match kind {
            StreakKind::Login => StreakUpdate {
                kind,
                current: fresh.login_streak,
                longest: fresh.longest_login_streak,
            },
            StreakKind::Learning => StreakUpdate {
                kind,
                current: fresh.learning_streak,
                longest: fresh.longest_learning_streak,
            },
        })
    }

    pub async fn profile(&self, actor: &Actor) -> Result<ProfileRow> {
        ab_db::gamification::ensure_profile(&self.pool, actor.user_id).await
    }

    pub async fn rank(&self, actor: &Actor) -> Result<i64> {
        let profile = ab_db::gamification::ensure_profile(&self.pool, actor.user_id).await?;
        Ok(ab_db::gamification::count_with_more_xp(&self.pool, profile.total_xp).await? + 1)
    }

    pub async fn leaderboard(&self, limit: i64, offset: i64) -> Result<Leaderboard> {
        let limit = limit.clamp(1, MAX_LEADERBOARD_PAGE);
        let offset = offset.max(0);
        let rows = ab_db::gamification::leaderboard(&self.pool, limit, offset).await?;
        let total_participants = ab_db::gamification::count_profiles(&self.pool).await?;
        Ok(Leaderboard {
            entries: rows
                .into_iter()
                .enumerate()
                .map(|(i, row)| LeaderboardEntry {
                    rank: offset + i64::try_from(i).unwrap_or(i64::MAX) + 1,
                    row,
                })
                .collect(),
            total_participants,
        })
    }

    pub async fn dashboard(&self, actor: &Actor) -> Result<Dashboard> {
        let profile = ab_db::gamification::ensure_profile(&self.pool, actor.user_id).await?;
        let recent_transactions = ab_db::gamification::recent_transactions(
            &self.pool,
            actor.user_id,
            RECENT_TRANSACTIONS,
        )
        .await?;
        let user_rank =
            ab_db::gamification::count_with_more_xp(&self.pool, profile.total_xp).await? + 1;
        let leaderboard = self.leaderboard(10, 0).await?;
        Ok(Dashboard {
            profile,
            recent_transactions,
            user_rank,
            leaderboard,
        })
    }

    /// Merge a preferences patch; `null` removes a key.
    pub async fn update_preferences(
        &self,
        actor: &Actor,
        patch: &serde_json::Value,
    ) -> Result<ProfileRow> {
        let Some(patch) = patch.as_object() else {
            return Err(Error::validation(vec![FieldError {
                field: "preferences".into(),
                code: "invalid".into(),
                message: "preferences must be a JSON object".into(),
            }]));
        };
        let profile = ab_db::gamification::ensure_profile(&self.pool, actor.user_id).await?;
        let mut merged = profile.preferences.as_object().cloned().unwrap_or_default();
        for (key, value) in patch {
            if value.is_null() {
                merged.remove(key);
            } else {
                merged.insert(key.clone(), value.clone());
            }
        }
        ab_db::gamification::set_preferences(
            &self.pool,
            actor.user_id,
            &serde_json::Value::Object(merged),
        )
        .await?;
        ab_db::gamification::ensure_profile(&self.pool, actor.user_id).await
    }

    /// Platform managers grant XP to a user (legacy `admin_award`).
    pub async fn admin_award(
        &self,
        actor: &Actor,
        user_id: UserId,
        amount: i32,
        reason: Option<&str>,
        idempotency_key: Option<&str>,
    ) -> Result<Award> {
        actor.require(MANAGE_PLATFORM)?;
        self.award(AwardRequest {
            user_id,
            source: XpSource::AdminAward,
            amount: Some(amount),
            source_id: None,
            reason,
            idempotency_key,
        })
        .await
    }

    pub async fn config(&self, actor: &Actor) -> Result<ConfigRow> {
        actor.require(MANAGE_PLATFORM)?;
        ab_db::gamification::get_config(&self.pool).await
    }

    /// Replace the policy overrides (platform managers).
    pub async fn update_config(
        &self,
        actor: &Actor,
        daily_xp_limit: Option<i32>,
        rewards: &serde_json::Value,
    ) -> Result<ConfigRow> {
        actor.require(MANAGE_PLATFORM)?;
        if !rewards.is_object() {
            return Err(Error::validation(vec![FieldError {
                field: "rewards".into(),
                code: "invalid".into(),
                message: "rewards must be a JSON object of source → XP".into(),
            }]));
        }
        ab_db::gamification::set_config(&self.pool, daily_xp_limit, rewards).await?;
        ab_db::gamification::get_config(&self.pool).await
    }
}

/// Best-effort side effects other slices call; failures are logged.
pub mod hooks {
    use super::{AwardRequest, GamificationService, StreakKind, XpSource, day_of, now_unix};
    use ab_core::assessments::AssessmentKind;
    use ab_core::id::{ActivityId, CourseId, SubmissionId, UserId};
    use sqlx::PgPool;

    fn log_err<T>(what: &str, result: ab_core::Result<T>) -> Option<T> {
        match result {
            Ok(v) => Some(v),
            Err(err) => {
                tracing::warn!(error = %err, "gamification hook {what} failed");
                None
            }
        }
    }

    /// Legacy `on_activity_completed`: XP once per activity, learning streak,
    /// activities counter.
    pub async fn activity_completed(pool: &PgPool, user_id: UserId, activity_id: ActivityId) {
        let service = GamificationService::new(pool.clone());
        let id = activity_id.to_string();
        let award = log_err(
            "activity_completed",
            service
                .award(AwardRequest {
                    user_id,
                    source: XpSource::ActivityCompletion,
                    amount: None,
                    source_id: Some(&id),
                    reason: None,
                    idempotency_key: None,
                })
                .await,
        );
        if award.is_some_and(|a| a.is_new) {
            log_err(
                "learning_streak",
                service.record_streak(user_id, StreakKind::Learning).await,
            );
            log_err(
                "activities_counter",
                ab_db::gamification::bump_activities_completed(pool, user_id).await,
            );
        }
    }

    /// Legacy `on_course_completed`.
    pub async fn course_completed(pool: &PgPool, user_id: UserId, course_id: CourseId) {
        let service = GamificationService::new(pool.clone());
        let id = course_id.to_string();
        let award = log_err(
            "course_completed",
            service
                .award(AwardRequest {
                    user_id,
                    source: XpSource::CourseCompletion,
                    amount: None,
                    source_id: Some(&id),
                    reason: None,
                    idempotency_key: None,
                })
                .await,
        );
        if award.is_some_and(|a| a.is_new) {
            log_err(
                "learning_streak",
                service.record_streak(user_id, StreakKind::Learning).await,
            );
            log_err(
                "courses_counter",
                ab_db::gamification::bump_courses_completed(pool, user_id).await,
            );
        }
    }

    /// Legacy `award_xp_for_submission`: a passing, published submission
    /// pays once by assessment kind.
    pub async fn submission_passed(
        pool: &PgPool,
        user_id: UserId,
        submission_id: SubmissionId,
        kind: AssessmentKind,
    ) {
        let source = match kind {
            AssessmentKind::Quiz => XpSource::QuizCompletion,
            AssessmentKind::Exam => XpSource::ExamCompletion,
            AssessmentKind::CodeChallenge => XpSource::CodeChallengeCompletion,
        };
        let id = submission_id.to_string();
        let key = format!("submission_{id}");
        log_err(
            "submission_passed",
            GamificationService::new(pool.clone())
                .award(AwardRequest {
                    user_id,
                    source,
                    amount: None,
                    source_id: Some(&id),
                    reason: None,
                    idempotency_key: Some(&key),
                })
                .await,
        );
    }

    /// First login of a day: login streak + the login bonus.
    pub async fn login(pool: &PgPool, user_id: UserId) {
        let service = GamificationService::new(pool.clone());
        log_err(
            "login_streak",
            service.record_streak(user_id, StreakKind::Login).await,
        );
        let day = day_of(now_unix()).to_string();
        log_err(
            "login_bonus",
            service
                .award(AwardRequest {
                    user_id,
                    source: XpSource::LoginBonus,
                    amount: None,
                    source_id: Some(&day),
                    reason: None,
                    idempotency_key: None,
                })
                .await,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_curve_round_trips() {
        assert_eq!(level_for(0), 1);
        assert_eq!(level_for(99), 1);
        assert_eq!(level_for(100), 2);
        assert_eq!(level_for(225), 2);
        assert_eq!(level_for(300), 3);
        for level in 1..=MAX_LEVEL {
            assert_eq!(level_for(xp_for_level(level)), level);
        }
        assert_eq!(level_for(i32::MAX), MAX_LEVEL);
    }

    #[test]
    fn policy_overrides_only_accept_positive_rewards() {
        let config = ConfigRow {
            daily_xp_limit: Some(0),
            rewards: serde_json::json!({
                "activity_completion": 40, "quiz_completion": -5, "admin_award": 0, "bogus": 9
            }),
            updated_at: 0,
        };
        let policy = Policy::from_config(&config);
        assert_eq!(policy.reward(XpSource::ActivityCompletion), 40);
        assert_eq!(policy.reward(XpSource::QuizCompletion), 30);
        assert_eq!(policy.reward(XpSource::AdminAward), 0);
        assert_eq!(policy.daily_limit, DEFAULT_DAILY_XP_LIMIT);
    }
}
