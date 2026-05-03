import os
import warnings

from pydantic import BaseModel, ConfigDict
from sqlmodel import SQLModel


def _parse_env_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_dev = _parse_env_bool(os.environ.get("PLATFORM_DEVELOPMENT_MODE"))
is_dev_mode = _dev  # kept for any external callers that read this flag

# Optional but highly recommended: Surface Pydantic internal warnings as errors in dev
if _dev:
    warnings.simplefilter("default", category=UserWarning)


_PYDANTIC_CONFIG: ConfigDict = ConfigDict(
    use_enum_values=True,
    str_strip_whitespace=True,
    ser_json_bytes="base64",
    regex_engine="rust-regex",
    # --- Base Strictness ---
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
    # --- Extreme Dev Restrictions ---
    # 1. Catch unmapped data, misspelled keys, and rogue payload injections
    # extra="forbid" if _dev else "ignore",
    # 2. Catch mutations to nested Pydantic models (Heavy performance hit, perfect for dev)
    revalidate_instances="always" if _dev else "never",
    # 3. Catch unresolvable ForwardRefs and schema bugs at import time, not runtime
    defer_build=False,
)

_SQLMODEL_CONFIG: ConfigDict = ConfigDict(
    use_enum_values=True,
    str_strip_whitespace=True,
    # slots=True is intentionally omitted: SQLModel table models rely on
    # SQLAlchemy instrumented descriptors which are incompatible with __slots__.
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
    # Catch stray kwargs passed into DB models before they hit SQLAlchemy
    # extra="forbid" if _dev else "ignore",
    defer_build=False,
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
    "is_dev_mode",
]
