from fastapi import APIRouter
from pydantic import ConfigDict

from config.config import get_settings
from src.db.strict_base_model import PydanticStrictBaseModel
from src.types import JsonObject

router = APIRouter()


class DevConfigResponse(PydanticStrictBaseModel):
    model_config = ConfigDict(extra="allow")


@router.get("/config", response_model=DevConfigResponse)
async def config() -> JsonObject:
    settings = get_settings()
    return settings.model_dump(exclude={"internal", "bootstrap", "integrations"})
