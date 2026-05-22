import os
import warnings
from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from sqlmodel import SQLModel


def coerce_date_to_end_of_day(value: Any) -> Any:
    """Coerce date strings (YYYY-MM-DD) to end-of-day datetimes (UTC)."""
    if isinstance(value, str):
        if len(value) == 10:
            try:
                d = date.fromisoformat(value)
                return datetime.combine(
                    d, datetime.max.time().replace(microsecond=0), tzinfo=UTC
                )
            except ValueError:
                pass
        else:
            try:
                # Handle full ISO 8601 strings. Even in strict mode,
                # returning a datetime object from a 'before' validator
                # will satisfy Pydantic's type check.
                return datetime.fromisoformat(value)
            except ValueError:
                pass
    return value


def _parse_env_bool(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


_dev = _parse_env_bool(os.environ.get("PLATFORM_DEVELOPMENT_MODE"))
is_dev_mode = _dev  # kept for any external callers that read this flag

# Optional but highly recommended: Surface Pydantic internal warnings as errors in dev
if _dev:
    warnings.simplefilter("default", category=UserWarning)


_PYDANTIC_CONFIG: ConfigDict = ConfigDict(
    str_strip_whitespace=True,
    ser_json_bytes="base64",
    regex_engine="rust-regex",
    # --- Base Strictness ---
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
    # 2. Catch mutations to nested Pydantic models (Heavy performance hit, perfect for dev)
    revalidate_instances="always" if _dev else "never",
    # 3. Catch unresolvable ForwardRefs and schema bugs at import time, not runtime
    defer_build=False,
)

_SQLMODEL_CONFIG: ConfigDict = ConfigDict(
    str_strip_whitespace=True,
    # slots=True is intentionally omitted: SQLModel table models rely on
    # SQLAlchemy instrumented descriptors which are incompatible with __slots__.
    strict=_dev,
    validate_assignment=_dev,
    validate_default=_dev,
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
    "coerce_date_to_end_of_day",
    "is_dev_mode",
]
