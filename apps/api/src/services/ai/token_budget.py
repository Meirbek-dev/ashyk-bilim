from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlmodel import Session, col, select

from config.config import AIConfig
from src.db.ai_runtime import AIRun


class TokenBudgetExceeded(RuntimeError):
    pass


class TokenBudgetService:
    def __init__(self, config: AIConfig) -> None:
        self.config = config

    def estimate_tokens(self, text: str, model: str | None = None) -> int:
        try:
            import tiktoken

            encoding = tiktoken.encoding_for_model(model or self.config.openai_model)
        except Exception:
            try:
                import tiktoken

                encoding = tiktoken.get_encoding("cl100k_base")
            except Exception:
                return max(1, len(text) // 4)
        return len(encoding.encode(text))

    def assert_request_budget(
        self, *, user_id: int, prompt: str, db_session: Session, remediation: bool = False
    ) -> int:
        estimated = self.estimate_tokens(prompt)
        if estimated > self.config.max_tokens_per_request:
            msg = "AI request is too large for the configured token budget"
            raise TokenBudgetExceeded(msg)

        limit = (
            self.config.remediation_requests_per_hour_per_user
            if remediation
            else self.config.analysis_requests_per_hour_per_user
        )
        one_hour_ago = datetime.now(UTC) - timedelta(hours=1)
        user_run_count = db_session.exec(
            select(func.count(col(AIRun.id))).where(
                AIRun.started_at >= one_hour_ago,
                AIRun.run_metadata["triggered_by_user_id"].as_string() == str(user_id),  # type: ignore[union-attr]
            )
        ).one()
        if user_run_count >= limit:
            msg = "Hourly AI request limit reached"
            raise TokenBudgetExceeded(msg)

        month_start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        used_tokens = db_session.exec(
            select(
                func.coalesce(func.sum(func.coalesce(AIRun.input_tokens, 0) + func.coalesce(AIRun.output_tokens, 0)), 0)
            ).where(AIRun.started_at >= month_start)
        ).one()
        if int(used_tokens or 0) + estimated > self.config.monthly_token_budget:
            msg = "Monthly AI token budget reached"
            raise TokenBudgetExceeded(msg)
        return estimated
