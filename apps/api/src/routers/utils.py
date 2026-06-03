from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from src.db.strict_base_model import PydanticStrictBaseModel
from src.services.utils.link_preview import (
    LinkPreviewError,
    UnsafeLinkPreviewURL,
    fetch_link_preview,
)

router = APIRouter()


class LinkPreviewResponse(PydanticStrictBaseModel):
    title: str | None = None
    description: str | None = None
    og_image: str | None = None
    favicon: str | None = None
    og_type: str | None = None
    og_url: str | None = None
    url: str | None = None


@router.get("/link-preview", response_model=LinkPreviewResponse)
async def link_preview(url: Annotated[str, Query(description="URL to preview")]) -> dict[str, str | None]:
    try:
        return await fetch_link_preview(url)
    except UnsafeLinkPreviewURL as e:
        raise HTTPException(status_code=400, detail=f"Небезопасный URL для предпросмотра ссылки: {e!s}") from e
    except LinkPreviewError as e:
        raise HTTPException(status_code=400, detail=f"Не удалось получить предпросмотр ссылки: {e!s}") from e
