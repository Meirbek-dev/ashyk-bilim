import asyncio
import logging
from collections.abc import Sequence
from typing import Literal, Protocol, runtime_checkable

from openai.types.moderation_text_input_param import ModerationTextInputParam

from config.config import get_settings
from src.services.ai.embeddings import get_openai_client, openai_breaker
from src.services.ai.exceptions import AIProcessingError, ContentModerationError
from src.types import JsonObject, JsonValue

logger = logging.getLogger(__name__)

ModerationStage = Literal["input"]


@runtime_checkable
class _ModerationResult(Protocol):
    flagged: bool


@runtime_checkable
class _ModerationResponse(Protocol):
    results: Sequence[_ModerationResult]
    model: str


def _model_dump(value: object) -> dict[str, object]:
    model_dump_fn = getattr(value, "model_dump", None)
    if callable(model_dump_fn):
        res = model_dump_fn(mode="json", by_alias=True)
        if isinstance(res, dict):
            return res
    if isinstance(value, dict):
        return value
    return {}


def _flagged_categories(result: object) -> list[str]:
    categories = _model_dump(getattr(result, "categories", None))
    return [category for category, flagged in categories.items() if flagged is True]


def _category_scores(result: object, categories: list[str]) -> dict[str, float]:
    scores = _model_dump(getattr(result, "category_scores", None))
    return {
        category: float(score) for category in categories if isinstance((score := scores.get(category)), (int, float))
    }


async def moderate_text_input(text: str, *, stage: ModerationStage = "input") -> None:
    stripped_text = text.strip()
    if not stripped_text:
        return

    settings = get_settings().ai_config
    if not settings.moderation_enabled:
        return

    try:
        moderation_input: ModerationTextInputParam = {"type": "text", "text": stripped_text}

        async def _call() -> object:
            return await asyncio.wait_for(
                get_openai_client().moderations.create(
                    model=settings.moderation_model,
                    input=[moderation_input],
                ),
                timeout=settings.request_timeout,
            )

        response = await openai_breaker.call_async(_call)
    except ContentModerationError:
        raise
    except Exception as exc:
        msg = "Content moderation failed"
        raise AIProcessingError(
            msg,
            details={"error_type": type(exc).__name__, "stage": stage},
        ) from exc

    if not isinstance(response, _ModerationResponse):
        msg = "Content moderation returned an unexpected response"
        raise AIProcessingError(msg, details={"stage": stage, "response_type": type(response).__name__})

    flagged_results = [result for result in response.results if result.flagged]
    if not flagged_results:
        return

    categories = sorted({category for result in flagged_results for category in _flagged_categories(result)})
    category_scores: JsonObject = {
        category: score
        for result in flagged_results
        for category, score in _category_scores(result, categories).items()
    }
    category_values: list[JsonValue] = [*categories]
    logger.info(
        "AI moderation blocked %s text: model=%s categories=%s",
        stage,
        response.model,
        categories,
    )
    raise ContentModerationError(
        details={
            "stage": stage,
            "model": response.model,
            "categories": category_values,
            "category_scores": category_scores,
        }
    )
