import asyncio
import os
import sys
import time

# Add src and config to python path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("./src"))

from config.config import get_settings, secret_value
from src.services.ai.providers import ModelProvider
from src.services.ai.schemas import CourseQualityReport

async def main():
    settings = get_settings().integrations.ai
    print("AI Config Enabled:", settings.ai_enabled)
    print("OpenAI Model:", settings.openai_model)
    print("OpenRouter Model:", settings.openrouter_model)
    
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider
    from openai import AsyncOpenAI
    from pydantic_ai import Agent

    instructions = "Вы являетесь аналитиком качества курсов в Ashyq Bilim.\n\nВозвращайте только требуемые структурированные данные."
    prompt = "Language: auto\n\nCourse context:\nCourse: Начало работы с Ashyq Bilim"

    # Step 1: Test OpenAI (Primary)
    print("\n--- Testing OpenAI (Primary) ---")
    primary_client = AsyncOpenAI(
        api_key=secret_value(settings.openai_api_key),
        max_retries=1,
        timeout=10.0,
    )
    primary = OpenAIChatModel(
        settings.openai_model,
        provider=OpenAIProvider(openai_client=primary_client),
    )
    agent_primary = Agent(primary, output_type=CourseQualityReport, instructions=instructions)
    
    start = time.time()
    try:
        await agent_primary.run(prompt)
        print(f"OpenAI Succeeded in {time.time() - start:.2f}s")
    except Exception as e:
        print(f"OpenAI Failed in {time.time() - start:.2f}s with: {type(e).__name__}: {e}")

    # Step 2: Test OpenRouter (Fallback)
    print("\n--- Testing OpenRouter (Fallback) ---")
    openrouter_key = secret_value(settings.openrouter_api_key)
    if openrouter_key:
        fallback_client = AsyncOpenAI(
            base_url=settings.openrouter_base_url,
            api_key=openrouter_key,
            max_retries=1,
            timeout=20.0,
        )
        fallback = OpenAIChatModel(
            settings.openrouter_model,
            provider=OpenAIProvider(openai_client=fallback_client),
        )
        agent_fallback = Agent(fallback, output_type=CourseQualityReport, instructions=instructions)
        
        start = time.time()
        try:
            res = await agent_fallback.run(prompt)
            print(f"OpenRouter Succeeded in {time.time() - start:.2f}s")
            with open("report_out.txt", "w", encoding="utf-8") as f:
                f.write(repr(res.output))
            print("Wrote output to report_out.txt")
        except Exception as e:
            print(f"OpenRouter Failed in {time.time() - start:.2f}s with: {type(e).__name__}: {e}")
    else:
        print("OpenRouter key not configured")

if __name__ == '__main__':
    asyncio.run(main())
