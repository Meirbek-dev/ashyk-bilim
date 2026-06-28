import pytest

from config.config import get_settings, reload_platform_config_cache, secret_value
from src.services.ai.providers import ModelProvider


def _base_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.test")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https://example\.test$")
    monkeypatch.setenv("PLATFORM_SQL_CONNECTION_STRING", "sqlite://")
    monkeypatch.setenv("PLATFORM_REDIS_CONNECTION_STRING", "redis://localhost:6379/0")
    monkeypatch.setenv("PLATFORM_JWT_SECRET", "test-secret-at-least-32-bytes")


def test_ai_config_loads_feature_flags_and_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("PLATFORM_AI_ENABLED", "true")
    monkeypatch.setenv("PLATFORM_AI_COURSE_ANALYSIS_ENABLED", "true")
    monkeypatch.setenv("PLATFORM_OPENAI_API_KEY", "openai-test-key")
    monkeypatch.setenv("PLATFORM_OPENROUTER_API_KEY", "openrouter-test-key")
    reload_platform_config_cache()

    ai = get_settings().integrations.ai

    assert ai.ai_enabled is True
    assert ai.course_analysis_enabled is True
    assert secret_value(ai.openai_api_key) == "openai-test-key"
    assert secret_value(ai.openrouter_api_key) == "openrouter-test-key"
    assert ModelProvider(ai).enabled() is True


def test_ai_provider_disabled_without_primary_key(monkeypatch: pytest.MonkeyPatch) -> None:
    _base_env(monkeypatch)
    monkeypatch.setenv("PLATFORM_AI_ENABLED", "true")
    monkeypatch.setenv("PLATFORM_OPENAI_API_KEY", " ")
    reload_platform_config_cache()

    ai = get_settings().integrations.ai

    assert ModelProvider(ai).enabled() is False
