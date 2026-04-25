import pytest
from pydantic import ValidationError

from config.config import (
    AIConfig,
    CookieConfig,
    DatabaseConfig,
    GeneralConfig,
    HostingConfig,
    MailingConfig,
    PlatformConfig,
    RedisConfig,
    SecurityConfig,
)


def test_hosting_config_parses_comma_separated_origins(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.com")
    monkeypatch.setenv(
        "PLATFORM_ALLOWED_ORIGINS",
        " https://one.example , https://two.example ",
    )
    monkeypatch.setenv("PLATFORM_COOKIE_DOMAIN", ".example.com")
    monkeypatch.setenv("PLATFORM_ALLOWED_REGEXP", r"^https?://example\.com$")

    cfg = HostingConfig(_env_file=None)

    assert cfg.allowed_origins == ["https://one.example", "https://two.example"]
    assert cfg.cookie_config.domain == "example.com"


def test_hosting_config_cookie_secure_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PLATFORM_DOMAIN", "example.com")
    monkeypatch.setenv("PLATFORM_SSL", "true")
    monkeypatch.setenv("PLATFORM_COOKIE_SECURE", "false")

    cfg = HostingConfig(_env_file=None)

    assert cfg.ssl is True
    assert cfg.cookie_secure is False
    assert cfg.cookies_use_secure_transport() is False


def test_platform_config_accepts_jwt_secret_security_config() -> None:
    PlatformConfig(
        general_config=GeneralConfig.model_construct(
            development_mode=False,
            logfire_enabled=False,
            timezone="UTC",
        ),
        hosting_config=HostingConfig.model_construct(
            domain="example.com",
            ssl=True,
            cookie_secure=None,
            port=9000,
            allowed_origins=["https://example.com"],
            allowed_regexp=r"^https?://example\.com$",
            cookie_config=CookieConfig(domain="example.com"),
            cookie_domain=None,
        ),
        database_config=DatabaseConfig.model_construct(
            sql_connection_string="postgresql+psycopg://openu:openu@db:5432/openu"
        ),
        redis_config=RedisConfig.model_construct(
            redis_connection_string="redis://redis:6379/0"
        ),
        security_config=SecurityConfig.model_construct(
            jwt_secret="a-valid-jwt-secret-at-least-32-bytes-long",
        ),
        ai_config=AIConfig(),
        mailing_config=MailingConfig.model_construct(
            resend_api_key=None,
            system_email_address=None,
        ),
    )


def test_security_config_requires_jwt_secret() -> None:
    with pytest.raises(ValueError, match="PLATFORM_JWT_SECRET must be set"):
        SecurityConfig.model_validate({"PLATFORM_JWT_SECRET": None})


def test_security_config_rejects_empty_jwt_secret() -> None:
    with pytest.raises(ValueError, match="PLATFORM_JWT_SECRET must be set"):
        SecurityConfig.model_validate({"PLATFORM_JWT_SECRET": "   "})


def test_database_config_accepts_sqlite_for_test_engine() -> None:
    cfg = DatabaseConfig.model_validate({"PLATFORM_SQL_CONNECTION_STRING": "sqlite://"})

    assert cfg.sql_connection_string == "sqlite://"


def test_database_config_rejects_unsupported_sql_schemes() -> None:
    with pytest.raises(ValidationError, match="URL scheme should be"):
        DatabaseConfig.model_validate({
            "PLATFORM_SQL_CONNECTION_STRING": "mysql://user:pass@db/app"
        })
