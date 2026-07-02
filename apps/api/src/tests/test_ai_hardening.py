from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from config.config import AIConfig
from src.db.ai_runtime import AIRun
from src.services.ai.agents.course_qa import answer_course_question
from src.services.ai.operations import _require_enabled, _safe_artifact, _safe_citations
from src.services.ai.providers import AIProviderUnavailable, ModelProvider
from src.services.ai.token_budget import TokenBudgetExceeded, TokenBudgetService


class _ExecResult:
    def __init__(self, runs: list[AIRun]) -> None:
        self._runs = runs

    def all(self) -> list[AIRun]:
        return self._runs


class _Session:
    def __init__(self, runs: list[AIRun] | None = None) -> None:
        self.runs = runs or []

    def exec(self, _statement: object) -> _ExecResult:
        return _ExecResult(self.runs)


def test_token_budget_rejects_oversized_prompt() -> None:
    config = AIConfig(max_tokens_per_request=2)
    service = TokenBudgetService(config)

    with pytest.raises(TokenBudgetExceeded, match="слишком велик"):
        service.assert_request_budget(user_id=1, prompt="this prompt is intentionally too long", db_session=_Session())


def test_token_budget_enforces_hourly_user_limit() -> None:
    config = AIConfig(analysis_requests_per_hour_per_user=1)
    service = TokenBudgetService(config)
    run = AIRun(
        run_uuid="run_test",
        thread_id=1,
        status="finished",
        run_metadata={"triggered_by_user_id": "7"},
        started_at=datetime.now(UTC),
    )

    with pytest.raises(TokenBudgetExceeded, match="лимит"):
        service.assert_request_budget(user_id=7, prompt="short", db_session=_Session([run]))


def test_ai_artifact_redaction_removes_provider_secrets() -> None:
    secret = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"
    artifact = _safe_artifact({"summary": f"Leaked {secret}", "nested": ["Bearer abcdefghijklmnop"]})
    citations = _safe_citations([{"excerpt": f"secret {secret}"}])

    assert secret not in str(artifact)
    assert secret not in str(citations)
    assert "[REDACTED_SECRET]" in str(artifact)


def test_require_enabled_fails_closed_when_global_ai_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = SimpleNamespace(integrations=SimpleNamespace(ai=AIConfig(ai_enabled=False, course_analysis_enabled=True)))
    monkeypatch.setattr("src.services.ai.operations.get_settings", lambda: settings)

    with pytest.raises(HTTPException) as exc_info:
        _require_enabled("course_analysis_enabled")

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_provider_unavailable_does_not_emit_draft_without_explicit_flag() -> None:
    provider = ModelProvider(AIConfig(ai_enabled=False, ai_draft_mode_enabled=False))

    with pytest.raises(AIProviderUnavailable):
        await answer_course_question(provider, "Course context", "Question?", role="student")


@pytest.mark.asyncio
async def test_provider_unavailable_can_emit_draft_when_explicitly_enabled() -> None:
    provider = ModelProvider(AIConfig(ai_enabled=False, ai_draft_mode_enabled=True))

    answer, model_name = await answer_course_question(provider, "Course context", "Question?", role="student")

    assert model_name == "draft-mode"
    assert answer.confidence == "low"
