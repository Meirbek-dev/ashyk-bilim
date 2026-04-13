import os

from pydantic import BaseModel, ConfigDict
from sqlmodel import SQLModel


def _parse_env_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_dev = _parse_env_bool(os.environ.get("PLATFORM_DEVELOPMENT_MODE"))
is_dev_mode = _dev  # kept for any external callers that read this flag


_PYDANTIC_CONFIG: ConfigDict = ConfigDict(
    compiled=True,
    use_enum_values=True,
    str_strip_whitespace=True,
    ser_json_bytes="base64",
    regex_engine="rust-regex",
    # Strict validation active in dev, lean in prod
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
    validate_return=_dev,
    validation_error_cause=_dev,
)

_SQLMODEL_CONFIG: ConfigDict = ConfigDict(
    compiled=True,
    use_enum_values=True,
    str_strip_whitespace=True,
    # slots=True is intentionally omitted: SQLModel table models rely on
    # SQLAlchemy instrumented descriptors which are incompatible with __slots__.
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
)


class PydanticStrictBaseModel(BaseModel):
    model_config = _PYDANTIC_CONFIG


class SQLModelStrictBaseModel(SQLModel):
    model_config = _SQLMODEL_CONFIG


SQLModelDefaultBase = SQLModelStrictBaseModel

__all__: list[str] = [
    "PydanticStrictBaseModel",
    "SQLModelDefaultBase",
    "SQLModelStrictBaseModel",
]
