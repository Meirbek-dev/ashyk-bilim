from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from config.config import reload_platform_config_cache
from src.services.ai import moderation
from src.services.ai.exceptions import ContentModerationError
from src.services.ai.service import _ChatContext, generate_chat_answer


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    reload_platform_config_cache()


def _moderation_response(*, flagged: bool) -> SimpleNamespace:
    return SimpleNamespace(
        model="omni-moderation-latest",
        results=[
            SimpleNamespace(
                flagged=flagged,
                categories={
                    "harassment": False,
                    "violence": flagged,
                    "violence/graphic": False,
                },
                category_scores={
                    "harassment": 0.01,
                    "violence": 0.95 if flagged else 0.01,
                    "violence/graphic": 0.2,
                },
            )
        ],
    )


@pytest.mark.asyncio
async def test_moderate_text_input_allows_safe_text(monkeypatch: pytest.MonkeyPatch):
    create = AsyncMock(return_value=_moderation_response(flagged=False))
    monkeypatch.setattr(
        moderation,
        "get_openai_client",
        lambda: SimpleNamespace(moderations=SimpleNamespace(create=create)),
    )

    await moderation.moderate_text_input("Explain binary search.")

    create.assert_awaited_once_with(
        model="omni-moderation-latest",
        input=[{"type": "text", "text": "Explain binary search."}],
    )


@pytest.mark.asyncio
async def test_moderate_text_input_blocks_flagged_text(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        moderation,
        "get_openai_client",
        lambda: SimpleNamespace(
            moderations=SimpleNamespace(create=AsyncMock(return_value=_moderation_response(flagged=True)))
        ),
    )

    with pytest.raises(ContentModerationError) as exc_info:
        await moderation.moderate_text_input("unsafe message")

    assert exc_info.value.error_code == "CONTENT_MODERATION_BLOCKED"
    assert exc_info.value.details["categories"] == ["violence"]
    assert exc_info.value.details["category_scores"] == {"violence": 0.95}


@pytest.mark.asyncio
async def test_generate_chat_answer_rejects_moderated_input(
    monkeypatch: pytest.MonkeyPatch,
):
    async def reject_input(_text: str, *, stage: str) -> None:
        raise ContentModerationError(details={"stage": stage})

    monkeypatch.setattr("src.services.ai.service.moderate_text_input", reject_input)
    ctx = _ChatContext(
        activity=SimpleNamespace(activity_uuid="activity-1", name="Activity"),
        course=SimpleNamespace(name="Course"),
        documents=["Course context"],
        session_id="chat-1",
        session_history=[],
        conversation_summary=None,
        user_id=1,
        request_id="request-1",
        locale="en-US",
    )

    with pytest.raises(ContentModerationError):
        await generate_chat_answer(ctx=ctx, question="unsafe message")
