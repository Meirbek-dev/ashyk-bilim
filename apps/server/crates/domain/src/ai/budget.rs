//! Token budget (legacy `TokenBudgetService`): request-size cap, per-user
//! hourly request limit, platform-wide monthly token budget.
//!
//! The hourly counter lives in Redis (fixed window); the monthly total is
//! the `ai_token_ledger` sum for the current month. The legacy derived both
//! from `ai_run` rows on every request.

use std::sync::Arc;
use std::time::Duration;

use ab_core::config::AiConfig;
use ab_core::id::UserId;
use ab_core::{Error, ErrorCode, Result};
use sqlx::PgPool;

use crate::identity::rate_limit::RateLimiter;

const HOUR: Duration = Duration::from_secs(3600);

#[derive(Clone)]
pub struct TokenBudget {
    config: Arc<AiConfig>,
    limiter: Option<RateLimiter>,
}

/// Which hourly limit applies (legacy `remediation: bool`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetLane {
    Analysis,
    Remediation,
}

impl TokenBudget {
    #[must_use]
    pub const fn new(config: Arc<AiConfig>, limiter: Option<RateLimiter>) -> Self {
        Self { config, limiter }
    }

    /// Token count of `text` for the configured primary model.
    #[must_use]
    pub fn estimate(&self, text: &str) -> i32 {
        i32::try_from(ab_clients::llm::tokens::estimate(
            text,
            &self.config.openai_model,
        ))
        .unwrap_or(i32::MAX)
    }

    /// Token count for the model that actually answered (output accounting).
    #[must_use]
    pub fn estimate_for(&self, text: &str, model_name: &str) -> i32 {
        i32::try_from(ab_clients::llm::tokens::estimate(text, model_name)).unwrap_or(i32::MAX)
    }

    /// Legacy `assert_request_budget` minus the hourly count (see
    /// [`Self::assert_hourly`]): the prompt must fit the per-request cap and
    /// the month must have room for it. Returns the prompt estimate.
    pub async fn assert_request(&self, pool: &PgPool, prompt: &str) -> Result<i32> {
        let estimated = self.estimate(prompt);
        if u64::try_from(estimated).unwrap_or(u64::MAX)
            > u64::from(self.config.max_tokens_per_request)
        {
            return Err(Error::app_with_details(
                ErrorCode::AiBudgetExhausted,
                "AI request is too large for the configured token budget",
                serde_json::json!({
                    "estimated_tokens": estimated,
                    "max_tokens_per_request": self.config.max_tokens_per_request,
                }),
            ));
        }
        let used = ab_db::ai::ledger_month_total(pool).await?;
        if used.saturating_add(i64::from(estimated)) > self.config.monthly_token_budget {
            return Err(Error::app_with_details(
                ErrorCode::AiBudgetExhausted,
                "Monthly AI token budget reached",
                serde_json::json!({
                    "used_tokens": used,
                    "monthly_token_budget": self.config.monthly_token_budget,
                }),
            ));
        }
        Ok(estimated)
    }

    /// One request against the caller's hourly allowance. Without Redis
    /// (worker without `AB__REDIS__URL`) the check is skipped — it already
    /// ran when the run was accepted.
    pub async fn assert_hourly(&self, user_id: UserId, lane: BudgetLane) -> Result<()> {
        let Some(limiter) = &self.limiter else {
            return Ok(());
        };
        let limit = match lane {
            BudgetLane::Analysis => self.config.analysis_requests_per_hour_per_user,
            BudgetLane::Remediation => self.config.remediation_requests_per_hour_per_user,
        };
        let key = format!("ai_hourly:{user_id}");
        if limiter.check(&key, limit, HOUR).await? {
            Ok(())
        } else {
            Err(Error::app_with_details(
                ErrorCode::AiRateLimited,
                "Hourly AI request limit reached",
                serde_json::json!({ "limit": limit, "window_seconds": HOUR.as_secs() }),
            ))
        }
    }
}
