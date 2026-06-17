"""Central JSON type definitions."""

from pydantic import JsonValue

type JsonPrimitive = str | int | float | bool | None
type JsonObject = dict[str, JsonValue]

__all__ = ["JsonObject", "JsonPrimitive", "JsonValue"]
