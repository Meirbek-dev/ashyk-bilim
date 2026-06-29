from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel

from config.config import AIConfig, secret_value

OutputT = TypeVar("OutputT", bound=BaseModel)


class AIProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class AIModelResult[OutputT: BaseModel]:
    output: OutputT
    model_name: str


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

    async def run_structured(
        self,
        *,
        instructions: str,
        prompt: str,
        output_type: type[OutputT],
    ) -> AIModelResult[OutputT]:
        if not self.enabled():
            msg = "AI provider is disabled or PLATFORM_OPENAI_API_KEY is not set"
            raise AIProviderUnavailable(msg)

        from pydantic_ai import Agent
        from pydantic_ai.models.fallback import FallbackModel
        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        primary = OpenAIChatModel(
            self.config.openai_model,
            provider=OpenAIProvider(api_key=secret_value(self.config.openai_api_key)),
        )
        openrouter_key = secret_value(self.config.openrouter_api_key)
        model: object = primary
        selected_name = self.primary_model_name()
        if openrouter_key:
            fallback = OpenAIChatModel(
                self.config.openrouter_model,
                provider=OpenAIProvider(
                    base_url=self.config.openrouter_base_url,
                    api_key=openrouter_key,
                ),
            )
            model = FallbackModel(primary, fallback)
            selected_name = f"{self.primary_model_name()} with {self.fallback_model_name()} fallback"

        agent = Agent(model, output_type=output_type, instructions=instructions)
        result = await agent.run(prompt)
        return AIModelResult(output=result.output, model_name=selected_name)
