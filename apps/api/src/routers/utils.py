from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from src.services.utils.link_preview import (
    LinkPreviewError,
    UnsafeLinkPreviewURL,
    fetch_link_preview,
)

router = APIRouter()


@router.get("/link-preview")
async def link_preview(url: Annotated[str, Query(description="URL to preview")] = ...):
    try:
        return await fetch_link_preview(url)
    except UnsafeLinkPreviewURL as e:
        raise HTTPException(status_code=400, detail=f"Небезопасный URL для предпросмотра ссылки: {e!s}") from e
    except LinkPreviewError as e:
        raise HTTPException(status_code=400, detail=f"Не удалось получить предпросмотр ссылки: {e!s}") from e
