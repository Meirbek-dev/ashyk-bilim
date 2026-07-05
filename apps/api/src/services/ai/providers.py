from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, TypeVar

from pydantic import BaseModel

from config.config import AIConfig, secret_value

if TYPE_CHECKING:
    from pydantic_ai import Agent

OutputT = TypeVar("OutputT", bound=BaseModel)


class AIProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class AIModelResult[OutputT: BaseModel]:
    output: OutputT
    model_name: str


@dataclass(frozen=True)
class AIModelStreamChunk[OutputT: BaseModel]:
    """One step of a streamed structured run.

    ``output`` is re-validated in partial mode on every chunk, so fields declared
    earlier in the output schema (e.g. a markdown answer field declared before a
    citations field) become available and keep growing before the run is final.
    """

    output: OutputT
    final: bool


class ModelProvider:
    """Routes AI work through OpenAI first, then OpenRouter as fallback."""

    def __init__(self, config: AIConfig) -> None:
        self.config = config

    def primary_model_name(self) -> str:
        return f"openai:{self.config.openai_model}"

    def fallback_model_name(self) -> str:
        return f"openrouter:{self.config.openrouter_model}"

    def enabled(self) -> bool:
        return bool(self.config.ai_enabled and secret_value(self.config.openai_api_key))

    def _build_agent(
        self, *, instructions: str, output_type: type[OutputT]
    ) -> tuple[Agent, str]:
        from openai import AsyncOpenAI
        from pydantic_ai import Agent
        from pydantic_ai.models.fallback import FallbackModel
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        # Use an explicit client with max_retries=1 and a 5.0-second timeout to fail fast
        # and prevent rate-limited/invalid OpenAI keys from exhausting the 30-second request budget.
        primary_client = AsyncOpenAI(
            api_key=secret_value(self.config.openai_api_key),
            max_retries=1,
            timeout=5.0,
        )
        primary = OpenAIChatModel(
            self.config.openai_model,
            provider=OpenAIProvider(openai_client=primary_client),
        )
        openrouter_key = secret_value(self.config.openrouter_api_key)
        model: object = primary
        selected_name = self.primary_model_name()
        if openrouter_key:
            # Fallback client uses a larger timeout to allow final completion
            fallback_client = AsyncOpenAI(
                base_url=self.config.openrouter_base_url,
                api_key=openrouter_key,
                max_retries=2,
                timeout=25.0,
            )
            fallback = OpenAIChatModel(
                self.config.openrouter_model,
                provider=OpenAIProvider(openai_client=fallback_client),
            )
            model = FallbackModel(primary, fallback)
            selected_name = f"{self.primary_model_name()} with {self.fallback_model_name()} fallback"

        agent = Agent(model, output_type=output_type, instructions=instructions)
        return agent, selected_name

    async def run_structured(
        self,
        *,
        instructions: str,
        prompt: str,
        output_type: type[OutputT],
    ) -> AIModelResult[OutputT]:
        if not self.enabled():
            msg = "Провайдер ИИ отключен или не задан PLATFORM_OPENAI_API_KEY"
            raise AIProviderUnavailable(msg)

        agent, selected_name = self._build_agent(
            instructions=instructions, output_type=output_type
        )
        result = await agent.run(prompt)
        return AIModelResult(output=result.output, model_name=selected_name)

    async def run_structured_stream(
        self,
        *,
        instructions: str,
        prompt: str,
        output_type: type[OutputT],
    ) -> AsyncIterator[AIModelStreamChunk[OutputT]]:
        """Stream partial, then final, validated output for ``output_type``.

        Raises ``AIProviderUnavailable`` (on the first iteration) exactly like
        ``run_structured`` does, so callers can use the same draft-mode fallback.
        """
        if not self.enabled():
            msg = "Провайдер ИИ отключен или не задан PLATFORM_OPENAI_API_KEY"
            raise AIProviderUnavailable(msg)

        agent, _selected_name = self._build_agent(
            instructions=instructions, output_type=output_type
        )
        # ASYNC119 (preview): yielding inside `agent.run_stream`'s context manager is the
        # documented pydantic-ai streaming pattern. Callers consume this via
        # `contextlib.aclosing` (see `stream_course_question`) so `.aclose()` still runs
        # `__aexit__` correctly if the caller stops iterating early.
        async with agent.run_stream(prompt) as stream:
            async for partial in stream.stream_output(debounce_by=0.12):
                yield AIModelStreamChunk(output=partial, final=False)  # noqa: ASYNC119
            final_output = await stream.get_output()
            yield AIModelStreamChunk(output=final_output, final=True)  # noqa: ASYNC119

    def selected_model_name(self) -> str:
        """The model name that will be used for a run, without building an agent."""
        if secret_value(self.config.openrouter_api_key):
            return f"{self.primary_model_name()} with {self.fallback_model_name()} fallback"
        return self.primary_model_name()
