"""Runtime type-narrowing helpers.

These functions coerce loosely-typed values (e.g. from JSON blobs) to concrete
Python primitives, raising ``TypeError`` with a descriptive message on failure.
They are deliberately strict: silent fall-backs mask bugs.
"""

from __future__ import annotations

from src.types.json import JsonObject, JsonValue


def as_int(value: object, *, field: str = "<unknown>") -> int:
    """Coerce *value* to ``int``, raising ``TypeError`` if not possible."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            pass
    msg = f"Expected int for field {field!r}, got {type(value).__name__!r}: {value!r}"
    raise TypeError(msg)


def as_float(value: object, *, field: str = "<unknown>") -> float:
    """Coerce *value* to ``float``, raising ``TypeError`` if not possible."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            pass
    msg = f"Expected float for field {field!r}, got {type(value).__name__!r}: {value!r}"
    raise TypeError(msg)


def as_str(value: object, *, field: str = "<unknown>") -> str:
    """Coerce *value* to ``str``, raising ``TypeError`` if not possible."""
    if isinstance(value, str):
        return value
    msg = f"Expected str for field {field!r}, got {type(value).__name__!r}: {value!r}"
    raise TypeError(msg)


def as_json_object(value: object, *, field: str = "<unknown>") -> JsonObject:
    """Coerce *value* to a ``JsonObject`` (``dict[str, JsonValue]``).

    Raises ``TypeError`` when *value* is not a ``dict`` or contains non-string
    keys.
    """
    if not isinstance(value, dict):
        msg = f"Expected dict for field {field!r}, got {type(value).__name__!r}"
        raise TypeError(msg)
    if not all(isinstance(k, str) for k in value):
        msg = f"Expected all keys to be str for field {field!r}"
        raise TypeError(msg)
    result: JsonObject = {}
    for key, item in value.items():
        if not isinstance(key, str):
            msg = f"Expected all keys to be str for field {field!r}"
            raise TypeError(msg)
        result[key] = _as_json_value(item, field=field)
    return result


def as_json_value(value: object, *, field: str = "<unknown>") -> JsonValue:
    return _as_json_value(value, field=field)


def _as_json_value(value: object, *, field: str) -> JsonValue:
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _as_json_value(model_dump(mode="json"), field=field)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_as_json_value(item, field=field) for item in value]
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            msg = f"Expected all nested keys to be str for field {field!r}"
            raise TypeError(msg)
        return {key: _as_json_value(item, field=field) for key, item in value.items()}
    msg = f"Expected JSON value for field {field!r}, got {type(value).__name__!r}"
    raise TypeError(msg)


def require_persisted_id(value: int | None, *, model_name: str = "Model") -> int:
    """Assert that a SQLModel ``id`` field has been assigned by the database.

    Call this immediately after ``db.flush()`` / ``db.refresh()`` to convert
    ``int | None`` to a plain ``int`` and get a meaningful error instead of a
    confusing ``NoneType`` traceback further down the call stack.
    """
    if value is None:
        msg = f"{model_name}.id is None — the row may not have been flushed or refreshed yet"
        raise RuntimeError(msg)
    return value


__all__ = [
    "as_float",
    "as_int",
    "as_json_object",
    "as_json_value",
    "as_str",
    "require_persisted_id",
]
