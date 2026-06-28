from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

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
        recent_runs = db_session.exec(select(AIRun).where(AIRun.started_at >= one_hour_ago)).all()
        user_run_count = sum(1 for run in recent_runs if run.run_metadata.get("triggered_by_user_id") == str(user_id))
        if user_run_count >= limit:
            msg = "AI hourly request limit reached"
            raise TokenBudgetExceeded(msg)
        return estimated
