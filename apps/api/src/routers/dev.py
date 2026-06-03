from typing import Any

from fastapi import APIRouter
from pydantic import ConfigDict

from config.config import get_settings
from src.db.strict_base_model import PydanticStrictBaseModel

router = APIRouter()


class DevConfigResponse(PydanticStrictBaseModel):
    model_config = ConfigDict(extra="allow")


@router.get("/config", response_model=DevConfigResponse)
async def config() -> dict[str, Any]:
    settings = get_settings()
    return settings.model_dump(exclude={"internal", "bootstrap", "integrations"})
