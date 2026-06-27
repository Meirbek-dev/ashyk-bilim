from typing import Annotated

from pydantic import BeforeValidator, Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.ai.contracts.intents import AIIntent, normalize_ai_intent
from src.services.ai.contracts.outputs import AIArtifact
from src.types import JsonObject

MessageStr = Annotated[str, Field(min_length=1, max_length=20000)]
ValidatedAIIntent = Annotated[AIIntent, BeforeValidator(normalize_ai_intent)]


class StartActivityAIChatSession(PydanticStrictBaseModel):
    activity_uuid: str
    message: MessageStr
    intent: ValidatedAIIntent = AIIntent.FREEFORM
    context_snapshot: JsonObject | None = None


class ActivityAIChatSessionResponse(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: str
    intent: ValidatedAIIntent = AIIntent.FREEFORM
    artifact: AIArtifact | None = None


class SendActivityAIChatMessage(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: MessageStr
    intent: ValidatedAIIntent = AIIntent.FREEFORM
    context_snapshot: JsonObject | None = None
