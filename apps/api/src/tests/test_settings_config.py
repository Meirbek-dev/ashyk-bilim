from pydantic import SecretStr

from config.config import get_settings, reload_platform_config_cache, secret_value


def test_settings_parse_security_and_cors(monkeypatch) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.test")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https://.*\.example\.test$")
    monkeypatch.setenv(
        "PLATFORM_ALLOWED_ORIGINS",
        '["https://app.example.test", "https://admin.example.test"]',
    )
    monkeypatch.setenv("PLATFORM_SQL_CONNECTION_STRING", "sqlite://")
    monkeypatch.setenv("PLATFORM_REDIS_CONNECTION_STRING", "redis://localhost:6379/0")
    monkeypatch.setenv("PLATFORM_JWT_SECRET", "test-secret-at-least-32-bytes")
    monkeypatch.setenv("PLATFORM_COOKIE_DOMAIN", ".example.test")
    reload_platform_config_cache()

    settings = get_settings()

    assert isinstance(settings.security_config.jwt_secret, SecretStr)
    assert secret_value(settings.security_config.jwt_secret) == (
        "test-secret-at-least-32-bytes"
    )
    assert settings.hosting_config.allowed_origins == [
        "https://app.example.test",
        "https://admin.example.test",
    ]
    assert settings.hosting_config.cookie_config.domain == "example.test"


def test_secret_values_are_masked_in_model_dump(monkeypatch) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.test")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https://example\.test$")
    monkeypatch.setenv("PLATFORM_SQL_CONNECTION_STRING", "sqlite://")
    monkeypatch.setenv("PLATFORM_REDIS_CONNECTION_STRING", "redis://localhost:6379/0")
    monkeypatch.setenv("PLATFORM_JWT_SECRET", "test-secret-at-least-32-bytes")
    monkeypatch.setenv("PLATFORM_OPENAI_API_KEY", "sk-test-secret")
    reload_platform_config_cache()

    settings = get_settings()
    dumped = settings.model_dump()

    assert dumped["security_config"]["jwt_secret"] != "test-secret-at-least-32-bytes"
    assert dumped["ai_config"]["openai_api_key"] != "sk-test-secret"
