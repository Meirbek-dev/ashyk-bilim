import ipaddress
import json
import os
from functools import lru_cache
from typing import Annotated

from pydantic import (
    EmailStr,
    Field,
    PostgresDsn,
    RedisDsn,
    SecretStr,
    TypeAdapter,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from src.db.strict_base_model import PydanticStrictBaseModel

_POSTGRES_DSN = TypeAdapter(PostgresDsn)
_REDIS_DSN = TypeAdapter(RedisDsn)


def _normalize_cookie_domain(raw_domain: str | None) -> str | None:
    if not raw_domain:
        return None

    cleaned = raw_domain.strip()
    if not cleaned:
        return None

    cleaned = cleaned.lstrip(".")
    if not cleaned:
        return None

    lowered = cleaned.lower()
    if lowered == "localhost":
        return None

    try:
        ipaddress.ip_address(cleaned)
    except ValueError:
        pass
    else:
        return None

    if ":" in cleaned:
        return None

    return cleaned


def _strip_optional_string(value: SecretStr | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, SecretStr):
        value = value.get_secret_value()

    stripped = value.strip()
    return stripped or None


class PlatformSectionSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        case_sensitive=True,
        env_ignore_empty=True,
        extra="ignore",
        populate_by_name=True,
        secrets_dir=os.getenv("PLATFORM_SECRETS_DIR"),
    )


class CookieConfig(PydanticStrictBaseModel):
    domain: str | None = None

    @field_validator("domain", mode="before")
    @classmethod
    def normalize_domain(cls, value: str | None) -> str | None:
        return _normalize_cookie_domain(value)


class GeneralConfig(PlatformSectionSettings):
    development_mode: bool = Field(
        default=False,
        validation_alias="PLATFORM_DEVELOPMENT_MODE",
    )
    contact_email: EmailStr | None = Field(
        default=None,
        validation_alias="PLATFORM_CONTACT_EMAIL",
    )
    logfire_enabled: bool = Field(
        default=False,
        validation_alias="PLATFORM_LOGFIRE_ENABLED",
    )
    color_logs: bool = Field(default=True, validation_alias="PLATFORM_COLOR_LOGS")
    timezone: str = Field(default="UTC", validation_alias="PLATFORM_TIMEZONE")

    @field_validator("timezone", mode="before")
    @classmethod
    def normalize_timezone(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        return stripped or "UTC"


class SecurityConfig(PlatformSectionSettings):
    jwt_secret: SecretStr = Field(
        validation_alias="PLATFORM_JWT_SECRET",
    )

    @field_validator("jwt_secret", mode="before")
    @classmethod
    def normalize_jwt_secret(cls, value: SecretStr | str | None) -> str:
        stripped = _strip_optional_string(value)
        if not stripped:
            msg = "PLATFORM_JWT_SECRET must be set"
            raise ValueError(msg)
        return stripped


class HostingConfig(PlatformSectionSettings):
    domain: str = Field(validation_alias="PLATFORM_DOMAIN")
    ssl: bool = Field(default=False, validation_alias="PLATFORM_SSL")
    cookie_secure: bool | None = Field(
        default=None,
        validation_alias="PLATFORM_COOKIE_SECURE",
    )
    port: int = Field(default=8000, validation_alias="PLATFORM_PORT")
    proxy_headers: bool = Field(
        default=True,
        validation_alias="PLATFORM_PROXY_HEADERS",
    )
    forwarded_allow_ips: str = Field(
        default="127.0.0.1",
        validation_alias="PLATFORM_FORWARDED_ALLOW_IPS",
    )
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias="PLATFORM_ALLOWED_ORIGINS",
    )
    allowed_regexp: str = Field(default="", validation_alias="PLATFORM_ALLOWED_REGEXP")
    cookie_config: CookieConfig = Field(
        default_factory=CookieConfig,
        validation_alias="cookie_config",
    )
    cookie_domain: str | None = Field(
        default=None,
        exclude=True,
        validation_alias="PLATFORM_COOKIE_DOMAIN",
    )

    @field_validator("domain", "allowed_regexp", mode="before")
    @classmethod
    def normalize_required_strings(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            msg_0 = "Hosting configuration values must not be empty"
            raise ValueError(msg_0)

        return stripped

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> list[str]:
        if isinstance(value, list):
            return [
                origin.strip()
                for origin in value
                if isinstance(origin, str) and origin.strip()
            ]

        if not isinstance(value, str):
            msg = f"Expected str or list, got {type(value).__name__}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            return []

        if stripped.startswith("["):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, list):
                return [
                    origin.strip()
                    for origin in decoded
                    if isinstance(origin, str) and origin.strip()
                ]

        return [origin.strip() for origin in stripped.split(",") if origin.strip()]

    @model_validator(mode="after")
    def apply_cookie_domain_override(self) -> HostingConfig:
        if self.cookie_domain is not None:
            self.cookie_config = CookieConfig(domain=self.cookie_domain)

        return self

    def cookies_use_secure_transport(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure

        return self.ssl


class MailingConfig(PlatformSectionSettings):
    resend_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_RESEND_API_KEY",
    )
    system_email_address: str | None = Field(
        default=None,
        validation_alias="PLATFORM_SYSTEM_EMAIL_ADDRESS",
    )

    @field_validator("resend_api_key", "system_email_address", mode="before")
    @classmethod
    def normalize_optional_strings(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)


class DatabaseConfig(PlatformSectionSettings):
    sql_connection_string: str = Field(
        validation_alias="PLATFORM_SQL_CONNECTION_STRING"
    )

    @field_validator("sql_connection_string", mode="before")
    @classmethod
    def validate_sql_connection_string(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            msg_0 = "PLATFORM_SQL_CONNECTION_STRING must not be empty"
            raise ValueError(msg_0)

        if stripped.startswith("sqlite"):
            return stripped

        _POSTGRES_DSN.validate_python(stripped)
        return stripped


class RedisConfig(PlatformSectionSettings):
    redis_connection_string: str = Field(
        validation_alias="PLATFORM_REDIS_CONNECTION_STRING"
    )
    # Separate Redis URL for the taskiq task queue.  Defaults to the same URL
    # as the app cache but on DB index 1 to avoid key collisions.  Override
    # via PLATFORM_TASKIQ_BROKER_URL if you want a completely separate Redis.
    taskiq_broker_url: str = Field(
        default="",
        validation_alias="PLATFORM_TASKIQ_BROKER_URL",
    )

    @model_validator(mode="after")
    def default_taskiq_url(self) -> RedisConfig:
        if not self.taskiq_broker_url:
            # Derive from the main Redis URL: swap DB index to 1
            base = self.redis_connection_string.rstrip("/")
            # Strip trailing /N if present and replace with /1
            parts = base.rsplit("/", 1)
            if len(parts) == 2 and parts[1].isdigit():
                self.taskiq_broker_url = f"{parts[0]}/1"
            else:
                self.taskiq_broker_url = f"{base}/1"
        return self

    @field_validator("redis_connection_string", mode="before")
    @classmethod
    def validate_redis_connection_string(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            msg_0 = "PLATFORM_REDIS_CONNECTION_STRING must not be empty"
            raise ValueError(msg_0)

        _REDIS_DSN.validate_python(stripped)
        return stripped


class GoogleOAuthConfig(PlatformSectionSettings):
    client_id: str | None = Field(
        default=None,
        validation_alias="PLATFORM_GOOGLE_CLIENT_ID",
    )
    client_secret: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_GOOGLE_CLIENT_SECRET",
    )
    # Explicit redirect URI registered in Google Cloud Console.
    # Must be set to the exact URL Google will redirect to after consent,
    # e.g. "http://localhost:1338/api/v1/auth/google/callback".
    # When omitted the backend tries to construct it from PLATFORM_DOMAIN /
    # PLATFORM_PORT / PLATFORM_SSL, but an explicit value is more reliable.
    redirect_uri: str | None = Field(
        default=None,
        validation_alias="PLATFORM_GOOGLE_REDIRECT_URI",
    )

    @field_validator("client_id", "client_secret", "redirect_uri", mode="before")
    @classmethod
    def normalize_optional_strings(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)


class BootstrapConfig(PlatformSectionSettings):
    initial_admin_email: EmailStr | None = Field(
        default=None,
        validation_alias="PLATFORM_INITIAL_ADMIN_EMAIL",
    )
    initial_admin_password: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_INITIAL_ADMIN_PASSWORD",
    )

    @field_validator("initial_admin_password", mode="before")
    @classmethod
    def normalize_initial_admin_password(
        cls, value: SecretStr | str | None
    ) -> str | None:
        return _strip_optional_string(value)


class Judge0Config(PlatformSectionSettings):
    base_url: str = Field(
        default="http://judge0-server:2358",
        validation_alias="JUDGE0_URL",
    )
    api_key: SecretStr | None = Field(default=None, validation_alias="JUDGE0_API_KEY")
    request_timeout_seconds: float = Field(
        default=30.0,
        validation_alias="JUDGE0_REQUEST_TIMEOUT_SECONDS",
    )
    poll_interval_seconds: float = Field(
        default=0.5,
        validation_alias="JUDGE0_POLL_INTERVAL_SECONDS",
    )
    poll_max_wait_seconds: float = Field(
        default=30.0,
        validation_alias="JUDGE0_POLL_MAX_WAIT_SECONDS",
    )
    max_source_bytes: int = Field(
        default=200_000, validation_alias="JUDGE0_MAX_SOURCE_BYTES"
    )
    max_stdin_bytes: int = Field(
        default=50_000, validation_alias="JUDGE0_MAX_STDIN_BYTES"
    )
    max_output_bytes: int = Field(
        default=100_000, validation_alias="JUDGE0_MAX_OUTPUT_BYTES"
    )
    max_output_file_kb: int = Field(
        default=128, validation_alias="JUDGE0_MAX_OUTPUT_FILE_KB"
    )
    allowed_language_ids: Annotated[list[int], NoDecode] = Field(
        default_factory=lambda: [50, 54, 60, 62, 63, 68, 71, 72, 73, 74, 78, 83],
        validation_alias="JUDGE0_ALLOWED_LANGUAGE_IDS",
    )

    @field_validator("base_url", mode="before")
    @classmethod
    def normalize_base_url(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            msg_0 = "JUDGE0_URL must not be empty"
            raise ValueError(msg_0)

        return stripped.rstrip("/")

    @field_validator("api_key", mode="before")
    @classmethod
    def normalize_api_key(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)

    @field_validator("allowed_language_ids", mode="before")
    @classmethod
    def parse_allowed_language_ids(cls, value: object) -> list[int]:
        if isinstance(value, list):
            return [int(item) for item in value]

        if not isinstance(value, str):
            msg = f"Expected str or list, got {type(value).__name__}"
            raise TypeError(msg)

        stripped = value.strip()
        if not stripped:
            return []

        if stripped.startswith("["):
            try:
                decoded = json.loads(stripped)
            except json.JSONDecodeError:
                decoded = None
            if isinstance(decoded, list):
                return [int(item) for item in decoded]

        return [int(item.strip()) for item in stripped.split(",") if item.strip()]


class LinkPreviewConfig(PlatformSectionSettings):
    request_timeout_seconds: float = Field(
        default=5.0,
        validation_alias="LINK_PREVIEW_REQUEST_TIMEOUT_SECONDS",
    )
    max_response_bytes: int = Field(
        default=524_288,
        validation_alias="LINK_PREVIEW_MAX_RESPONSE_BYTES",
    )
    max_redirects: int = Field(
        default=3,
        validation_alias="LINK_PREVIEW_MAX_REDIRECTS",
    )
    cache_ttl_seconds: int = Field(
        default=3600,
        validation_alias="LINK_PREVIEW_CACHE_TTL_SECONDS",
    )
    memory_cache_max_items: int = Field(
        default=1024,
        validation_alias="LINK_PREVIEW_MEMORY_CACHE_MAX_ITEMS",
    )
    user_agent: str = Field(
        default="AshyqBilim-LinkPreview/1.0",
        validation_alias="LINK_PREVIEW_USER_AGENT",
    )

    @field_validator("user_agent", mode="before")
    @classmethod
    def normalize_user_agent(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)

        stripped = value.strip()
        return stripped or "AshyqBilim-LinkPreview/1.0"


class AIConfig(PlatformSectionSettings):
    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_OPENAI_API_KEY",
    )
    openai_model: str = Field(
        default="gpt-5.4-nano-2026-03-17", validation_alias="PLATFORM_OPENAI_MODEL"
    )
    openrouter_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_OPENROUTER_API_KEY",
    )
    openrouter_model: str = Field(
        default="deepseek/deepseek-v4-flash",
        validation_alias="PLATFORM_OPENROUTER_MODEL",
    )
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias="PLATFORM_OPENROUTER_BASE_URL",
    )
    max_tokens_per_request: int = Field(
        default=16_000, validation_alias="PLATFORM_AI_MAX_TOKENS_PER_REQUEST"
    )
    max_output_tokens: int = Field(
        default=8_000, validation_alias="PLATFORM_AI_MAX_OUTPUT_TOKENS"
    )
    monthly_token_budget: int = Field(
        default=5_000_000, validation_alias="PLATFORM_AI_MONTHLY_TOKEN_BUDGET"
    )
    ai_enabled: bool = Field(default=False, validation_alias="PLATFORM_AI_ENABLED")
    course_analysis_enabled: bool = Field(
        default=False, validation_alias="PLATFORM_AI_COURSE_ANALYSIS_ENABLED"
    )
    submission_analysis_enabled: bool = Field(
        default=False, validation_alias="PLATFORM_AI_SUBMISSION_ANALYSIS_ENABLED"
    )
    remediation_enabled: bool = Field(
        default=False, validation_alias="PLATFORM_AI_REMEDIATION_ENABLED"
    )
    semantic_memory_enabled: bool = Field(
        default=False, validation_alias="PLATFORM_AI_SEMANTIC_MEMORY_ENABLED"
    )
    analysis_requests_per_hour_per_user: int = Field(
        default=10,
        validation_alias="PLATFORM_AI_ANALYSIS_REQUESTS_PER_HOUR_PER_USER",
    )
    remediation_requests_per_hour_per_user: int = Field(
        default=20,
        validation_alias="PLATFORM_AI_REMEDIATION_REQUESTS_PER_HOUR_PER_USER",
    )

    @field_validator("openai_api_key", "openrouter_api_key", mode="before")
    @classmethod
    def normalize_api_key(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)

    @field_validator(
        "openai_model", "openrouter_model", "openrouter_base_url", mode="before"
    )
    @classmethod
    def normalize_ai_string(cls, value: object) -> str:
        if not isinstance(value, str):
            msg = f"Expected str, got {type(value).__name__}: {value!r}"
            raise TypeError(msg)
        stripped = value.strip()
        if not stripped:
            msg = "AI configuration strings must not be empty"
            raise ValueError(msg)
        return stripped.rstrip("/") if stripped.startswith("http") else stripped


class PlatformConfig(PydanticStrictBaseModel):
    general_config: GeneralConfig
    hosting_config: HostingConfig
    database_config: DatabaseConfig
    redis_config: RedisConfig
    security_config: SecurityConfig
    mailing_config: MailingConfig

    @model_validator(mode="after")
    def validate_security_posture(self) -> PlatformConfig:
        if not self.general_config.development_mode:
            if (
                self.hosting_config.ssl
                and not self.hosting_config.cookies_use_secure_transport()
            ):
                msg = (
                    "Secure cookies are required when SSL is enabled. "
                    "Set PLATFORM_COOKIE_SECURE=true or remove PLATFORM_SSL."
                )
                raise ValueError(msg)
            broad_cors = {".*", r"\b((?:https?://)[^\s/$.?#].[^\s]*)\b", ""}
            if self.hosting_config.allowed_regexp in broad_cors:
                msg = (
                    "Broad CORS regex is not allowed in production. "
                    "Set PLATFORM_ALLOWED_REGEXP to a specific pattern or "
                    "use PLATFORM_ALLOWED_ORIGINS instead."
                )
                raise ValueError(msg)
        return self


class IntegrationsConfig(PydanticStrictBaseModel):
    ai: AIConfig = Field(default_factory=AIConfig)
    judge0: Judge0Config = Field(default_factory=Judge0Config)
    link_preview: LinkPreviewConfig = Field(default_factory=LinkPreviewConfig)


class AppSettings(PlatformConfig):
    bootstrap: BootstrapConfig = Field(default_factory=BootstrapConfig)
    integrations: IntegrationsConfig = Field(default_factory=IntegrationsConfig)
    google_oauth: GoogleOAuthConfig = Field(default_factory=GoogleOAuthConfig)


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings(
        general_config=GeneralConfig(),
        hosting_config=HostingConfig(),  # pyright: ignore[reportCallIssue]
        database_config=DatabaseConfig(),  # pyright: ignore[reportCallIssue]
        redis_config=RedisConfig(),  # pyright: ignore[reportCallIssue]
        security_config=SecurityConfig(),  # pyright: ignore[reportCallIssue]
        mailing_config=MailingConfig(),
        bootstrap=BootstrapConfig(),
        integrations=IntegrationsConfig(judge0=Judge0Config()),
        google_oauth=GoogleOAuthConfig(),
    )


def reload_platform_config_cache() -> None:
    """Clear cached platform configuration (mainly for tests or reloads)."""
    get_settings.cache_clear()


def secret_value(value: SecretStr | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, SecretStr):
        return value.get_secret_value()
    return value
