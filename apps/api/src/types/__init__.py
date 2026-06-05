"""Shared type definitions."""

from src.types.json import JsonObject, JsonPrimitive, JsonValue
from src.types.narrowing import as_float, as_int, as_json_object, as_str, require_persisted_id
from src.types.plagiarism import PlagiarismCheckResult

__all__ = [
    "JsonObject",
    "JsonPrimitive",
    "JsonValue",
    "PlagiarismCheckResult",
    "as_float",
    "as_int",
    "as_json_object",
    "as_str",
    "require_persisted_id",
]
