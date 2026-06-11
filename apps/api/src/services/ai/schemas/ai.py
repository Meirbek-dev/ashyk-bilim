from typing import Annotated

from pydantic import Field

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.ai.contracts.intents import AIIntent
from src.services.ai.contracts.outputs import AIArtifact

MessageStr = Annotated[str, Field(min_length=1, max_length=20000)]


class StartActivityAIChatSession(PydanticStrictBaseModel):
    activity_uuid: str
    message: MessageStr
    intent: AIIntent = AIIntent.FREEFORM


class ActivityAIChatSessionResponse(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: str
    intent: AIIntent = AIIntent.FREEFORM
    artifact: AIArtifact | None = None


class SendActivityAIChatMessage(PydanticStrictBaseModel):
    aichat_uuid: str
    activity_uuid: str
    message: MessageStr
    intent: AIIntent = AIIntent.FREEFORM
