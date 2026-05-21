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
    logfire_enabled: bool = Field(
        default=False,
        validation_alias="PLATFORM_LOGFIRE_ENABLED",
    )
    color_logs: bool = Field(default=True, validation_alias="PLATFORM_COLOR_LOGS")
    timezone: str = Field(default="UTC", validation_alias="PLATFORM_TIMEZONE")

    @field_validator("timezone", mode="before")
    @classmethod
    def normalize_timezone(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

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
            raise ValueError("PLATFORM_JWT_SECRET must be set")
        return stripped


class AIConfig(PlatformSectionSettings):
    """All AI-related configuration in one flat class.

    Fields with no ``validation_alias`` use hardcoded defaults and are not
    configurable via environment variables (intentional — they are tuning
    knobs that rarely need to change per deployment).
    """

    openai_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_OPENAI_API_KEY",
    )
    openrouter_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="PLATFORM_OPENROUTER_API_KEY",
    )
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias="PLATFORM_OPENROUTER_BASE_URL",
    )
    app_url: str = Field(
        default="https://cs-mooc.tou.edu.kz",
        validation_alias="PLATFORM_APP_URL",
    )
    app_name: str = Field(
        default="Ashyq Bilim",
        validation_alias="PLATFORM_APP_NAME",
    )
    chat_model: str = Field(
        default="gpt-5.4-nano",
        validation_alias="PLATFORM_AI_CHAT_MODEL",
    )
    embedding_model: str = Field(
        default="text-embedding-3-small",
        validation_alias="PLATFORM_AI_EMBEDDING_MODEL",
    )
    moderation_enabled: bool = Field(
        default=True,
        validation_alias="PLATFORM_AI_MODERATION_ENABLED",
    )
    moderation_model: str = Field(
        default="omni-moderation-latest",
        validation_alias="PLATFORM_AI_MODERATION_MODEL",
    )
    embedding_dimensions: int = Field(
        default=512,
        validation_alias="PLATFORM_AI_EMBEDDING_DIMENSIONS",
    )

    # Performance
    streaming_enabled: bool = Field(
        default=True,
        validation_alias="PLATFORM_AI_STREAMING_ENABLED",
    )
    max_concurrent_requests: int = Field(
        default=50,
        validation_alias="PLATFORM_AI_MAX_CONCURRENT_REQUESTS",
    )
    request_timeout: int = Field(
        default=60,
        validation_alias="PLATFORM_AI_REQUEST_TIMEOUT",
    )
    max_output_tokens: int = Field(
        default=4000,
        validation_alias="PLATFORM_AI_MAX_OUTPUT_TOKENS",
    )

    # Cache TTLs (seconds)
    retrieval_cache_ttl: int = Field(
        default=3600,
        validation_alias="PLATFORM_AI_RETRIEVAL_CACHE_TTL",
    )
    response_cache_ttl: int = Field(
        default=1800,
        validation_alias="PLATFORM_AI_RESPONSE_CACHE_TTL",
    )
    embedding_cache_ttl: int = Field(
        default=7200,
        validation_alias="PLATFORM_AI_EMBEDDING_CACHE_TTL",
    )

    # Vector store
    collection_retention: int = Field(
        default=86400,
        validation_alias="PLATFORM_AI_COLLECTION_RETENTION",
    )
    embedding_batch_size: int = Field(
        default=128,
        validation_alias="PLATFORM_AI_EMBEDDING_BATCH_SIZE",
    )
    embedding_batch_max_tokens: int = Field(
        default=250_000,
        validation_alias="PLATFORM_AI_EMBEDDING_BATCH_MAX_TOKENS",
    )
    retrieval_top_k: int = Field(
        default=5,
        validation_alias="PLATFORM_AI_RETRIEVAL_TOP_K",
    )

    # Chat history
    history_window_size: int = Field(
        default=10,
        validation_alias="PLATFORM_AI_HISTORY_WINDOW_SIZE",
    )
    max_history_length: int = Field(
        default=100,
        validation_alias="PLATFORM_AI_MAX_HISTORY_LENGTH",
    )
    message_retention: int = Field(
        default=86400,
        validation_alias="PLATFORM_AI_MESSAGE_RETENTION",
    )
    chunk_size: int = Field(
        default=1000,
        validation_alias="PLATFORM_AI_CHUNK_SIZE",
    )
    chunk_overlap: int = Field(
        default=200,
        validation_alias="PLATFORM_AI_CHUNK_OVERLAP",
    )

    @field_validator(
        "openai_api_key",
        "openrouter_api_key",
        "chat_model",
        "embedding_model",
        "moderation_model",
        mode="before",
    )
    @classmethod
    def normalize_optional_ai_strings(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)


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
    def normalize_required_strings(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("Hosting configuration values must not be empty")

        return stripped

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return [
                origin.strip()
                for origin in value
                if isinstance(origin, str) and origin.strip()
            ]

        if not isinstance(value, str):
            return value

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
    def validate_sql_connection_string(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_SQL_CONNECTION_STRING must not be empty")

        if stripped.startswith("sqlite"):
            return stripped

        _POSTGRES_DSN.validate_python(stripped)
        return stripped


class RedisConfig(PlatformSectionSettings):
    redis_connection_string: str = Field(
        validation_alias="PLATFORM_REDIS_CONNECTION_STRING"
    )

    @field_validator("redis_connection_string", mode="before")
    @classmethod
    def validate_redis_connection_string(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("PLATFORM_REDIS_CONNECTION_STRING must not be empty")

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
    def normalize_base_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        if not stripped:
            raise ValueError("JUDGE0_URL must not be empty")

        return stripped.rstrip("/")

    @field_validator("api_key", mode="before")
    @classmethod
    def normalize_api_key(cls, value: SecretStr | str | None) -> str | None:
        return _strip_optional_string(value)

    @field_validator("allowed_language_ids", mode="before")
    @classmethod
    def parse_allowed_language_ids(cls, value: str | list[int]) -> list[int]:
        if isinstance(value, list):
            return [int(item) for item in value]

        if not isinstance(value, str):
            return value

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
    def normalize_user_agent(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        stripped = value.strip()
        return stripped or "AshyqBilim-LinkPreview/1.0"


class PlatformConfig(PydanticStrictBaseModel):
    general_config: GeneralConfig
    hosting_config: HostingConfig
    database_config: DatabaseConfig
    redis_config: RedisConfig
    security_config: SecurityConfig
    ai_config: AIConfig
    mailing_config: MailingConfig

    @model_validator(mode="after")
    def validate_security_posture(self) -> PlatformConfig:
        if not self.general_config.development_mode:
            if (
                self.hosting_config.ssl
                and not self.hosting_config.cookies_use_secure_transport()
            ):
                raise ValueError(
                    "Secure cookies are required when SSL is enabled. "
                    "Set PLATFORM_COOKIE_SECURE=true or remove PLATFORM_SSL."
                )
            broad_cors = {".*", r"\b((?:https?://)[^\s/$.?#].[^\s]*)\b", ""}
            if self.hosting_config.allowed_regexp in broad_cors:
                raise ValueError(
                    "Broad CORS regex is not allowed in production. "
                    "Set PLATFORM_ALLOWED_REGEXP to a specific pattern or "
                    "use PLATFORM_ALLOWED_ORIGINS instead."
                )
        return self


class IntegrationsConfig(PydanticStrictBaseModel):
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
        hosting_config=HostingConfig(),
        database_config=DatabaseConfig(),
        redis_config=RedisConfig(),
        security_config=SecurityConfig(),
        ai_config=AIConfig(),
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
