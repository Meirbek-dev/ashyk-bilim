//! Token budget (legacy `TokenBudgetService`): request-size cap, per-user
//! hourly request limit, platform-wide monthly token budget.
//!
//! The hourly counter lives in Redis (fixed window); the monthly total is
//! the `ai_token_ledger` sum for the current month plus the reservations of
//! the requests in flight (BUG-349). The legacy derived both from `ai_run`
//! rows on every request.

use std::sync::Arc;
use std::time::Duration;

use ab_core::config::AiConfig;
use ab_core::id::{AiRunId, UserId};
use ab_core::{Error, ErrorCode, Result};
use sqlx::PgPool;

use crate::identity::rate_limit::RateLimiter;

const HOUR: Duration = Duration::from_secs(3600);
/// How long an unsettled reservation holds budget. A run settles in
/// seconds (provider timeouts are 5 s / 25 s); the lease only bounds a
/// holder that crashed mid-run.
const RESERVATION_LEASE: Duration = Duration::from_mins(15);

/// One admitted request's hold on the monthly budget (BUG-349): the prompt
/// estimate plus the output bound, settled by the run's ledger row.
#[derive(Debug, Clone, Copy)]
pub struct Reservation {
    pub id: uuid::Uuid,
    /// The prompt estimate - the input count when the provider reports none.
    pub input_tokens: i32,
}

#[derive(Clone)]
pub struct TokenBudget {
    config: Arc<AiConfig>,
    limiter: Option<RateLimiter>,
}

/// Which hourly limit applies (legacy `remediation: bool`). Each lane has
/// its own counter (BUG-189): remediation calls never spend the analysis
/// allowance and vice versa.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetLane {
    Analysis,
    Remediation,
}

impl BudgetLane {
    const fn key(self) -> &'static str {
        match self {
            Self::Analysis => "analysis",
            Self::Remediation => "remediation",
        }
    }
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

    /// Whether `text` fits the per-request cap (context fitting, BUG-325).
    #[must_use]
    pub fn fits(&self, text: &str) -> bool {
        self.within_request_cap(self.estimate(text))
    }

    fn within_request_cap(&self, estimated: i32) -> bool {
        u64::try_from(estimated).unwrap_or(u64::MAX)
            <= u64::from(self.config.max_tokens_per_request)
    }

    /// Legacy `assert_request_budget` minus the hourly count (see
    /// [`Self::assert_hourly`]).
    ///
    /// `prompt` - everything sent - must fit the
    /// per-request cap, and the month must have room for it plus
    /// `max_output_tokens` after the ledger and every in-flight reservation.
    /// The room is reserved atomically (BUG-349); `run` ties it to a run
    /// that already exists.
    pub async fn reserve(
        &self,
        pool: &PgPool,
        prompt: &str,
        run: Option<AiRunId>,
    ) -> Result<Reservation> {
        let estimated = self.estimate(prompt);
        if !self.within_request_cap(estimated) {
            return Err(Error::app_with_details(
                ErrorCode::AiBudgetExhausted,
                "AI request is too large for the configured token budget",
                serde_json::json!({
                    "estimated_tokens": estimated,
                    "max_tokens_per_request": self.config.max_tokens_per_request,
                }),
            ));
        }
        let tokens = i64::from(estimated) + i64::from(self.config.max_output_tokens);
        let (id, used) = ab_db::ai::reserve_tokens(
            pool,
            tokens,
            self.config.monthly_token_budget,
            run,
            RESERVATION_LEASE,
        )
        .await?;
        let Some(id) = id else {
            return Err(Error::app_with_details(
                ErrorCode::AiBudgetExhausted,
                "Monthly AI token budget reached",
                serde_json::json!({
                    "used_tokens": used,
                    "monthly_token_budget": self.config.monthly_token_budget,
                }),
            ));
        };
        Ok(Reservation {
            id,
            input_tokens: estimated,
        })
    }

    /// One request against the caller's hourly allowance on `lane`. Without Redis
    /// (worker without `AB__REDIS__URL`) the check is skipped - it already
    /// ran when the run was accepted.
    pub async fn assert_hourly(&self, user_id: UserId, lane: BudgetLane) -> Result<()> {
        let Some(limiter) = &self.limiter else {
            return Ok(());
        };
        let limit = match lane {
            BudgetLane::Analysis => self.config.analysis_requests_per_hour_per_user,
            BudgetLane::Remediation => self.config.remediation_requests_per_hour_per_user,
        };
        let key = format!("ai_hourly:{user_id}:{}", lane.key());
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
