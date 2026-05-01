import logging

from openai import AsyncOpenAI
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

from config.config import get_settings
from src.services.ai.exceptions import RetrievalError
from src.services.ai.models import AgentDependencies

logger = logging.getLogger(__name__)

_BASE_SYSTEM_PROMPT = (
    "You are an educational assistant helping a student with course material. "
    "Prioritize the provided lecture context when it is relevant. "
    "If the provided context is insufficient, you may use general knowledge, but say so plainly. "
    "Stay on topic, decline unrelated requests, "
    "and prefer clear, structured explanations."
)

_MODE_INSTRUCTIONS = {
    "instructional": "Answer using the activity and course context when it helps. Prefer grounded explanations over generic ones.",
    "editorial": "Treat the request as an editorial writing task. Focus on transforming or extending the user's provided text without inventing course facts unless explicitly requested.",
    "translation": "Treat the request as a translation task. Preserve meaning, tone, and formatting. Do not add explanation unless the user asks for it.",
    "critique": "Treat the request as a critique task. Provide constructive feedback, identify weaknesses precisely, and suggest concrete improvements.",
    "follow_up": "Treat the request as a conversational follow-up. Prefer the recent chat history and summarized prior context before reaching for general knowledge.",
}

_AGENT = Agent(
    system_prompt=_BASE_SYSTEM_PROMPT,
    deps_type=AgentDependencies,
    output_type=str,
    retries=1,
    instrument=False,
)


@_AGENT.instructions
def _build_instructions(ctx: RunContext[AgentDependencies]) -> str:
    deps = ctx.deps
    context_blocks = [
        f"Course: {deps.course_name}",
        f"Activity: {deps.activity_name}",
        f"Request mode: {deps.request_mode}",
    ]

    mode_instruction = _MODE_INSTRUCTIONS.get(deps.request_mode)
    if mode_instruction:
        context_blocks.append(f"Task policy: {mode_instruction}")

    if deps.task_instruction:
        context_blocks.append(f"Task details: {deps.task_instruction}")

    if deps.conversation_summary:
        context_blocks.append(
            "Earlier conversation summary:\n" + deps.conversation_summary
        )

    if deps.retrieved_chunks:
        rendered_chunks = []
        for index, chunk in enumerate(deps.retrieved_chunks, start=1):
            rendered_chunks.append(f"[{index}] {chunk.document}")
        context_blocks.append("Relevant context:\n" + "\n\n".join(rendered_chunks))
    else:
        context_blocks.append(
            "Relevant context: none retrieved; use general knowledge cautiously and say that the answer is not grounded in lecture context."
        )

    return "\n\n".join(context_blocks)


def get_agent() -> Agent[AgentDependencies, str]:
    return _AGENT


def get_openrouter_model() -> OpenAIChatModel:
    settings = get_settings().ai_config
    api_key = settings.openrouter_api_key
    if not api_key:
        raise RetrievalError("OpenRouter API key not configured")

    openai_client = AsyncOpenAI(
        base_url=settings.openrouter_base_url,
        api_key=api_key,
        default_headers={
            "HTTP-Referer": settings.app_url,
            "X-Title": settings.app_name,
        },
    )
    return OpenAIChatModel(
        settings.chat_model,
        provider=OpenAIProvider(openai_client=openai_client),
    )


def get_model() -> OpenAIChatModel:
    settings = get_settings().ai_config
    api_key = settings.openai_api_key
    if not api_key:
        raise RetrievalError("OpenAI API key not configured")

    return OpenAIChatModel(
        settings.chat_model,
        provider=OpenAIProvider(api_key=api_key),
    )
