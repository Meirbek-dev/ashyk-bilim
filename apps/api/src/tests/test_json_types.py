from pydantic import BaseModel

from src.types import JsonObject, JsonValue


class JsonContainer(BaseModel):
    value: JsonValue = None
    payload: JsonObject


def test_json_value_schema_is_non_recursive() -> None:
    schema = JsonContainer.model_json_schema()

    assert schema["$defs"]["JsonValue"] == {}
    assert schema["$defs"]["JsonObject"] == {
        "additionalProperties": {"$ref": "#/$defs/JsonValue"},
        "type": "object",
    }
    assert schema["properties"]["value"]["$ref"] == "#/$defs/JsonValue"
    assert schema["properties"]["payload"]["$ref"] == "#/$defs/JsonObject"
