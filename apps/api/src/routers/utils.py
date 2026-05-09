from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query

from src.services.utils.link_preview import fetch_link_preview

router = APIRouter()


@router.get("/link-preview")
async def link_preview(url: Annotated[str, Query(description="URL to preview")] = ...):
    try:
        return await fetch_link_preview(url)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=400, detail=f"Failed to fetch link preview: {e!s}"
        ) from e
    except Exception as e:
        # Catch remaining errors (parsing, etc.)
        raise HTTPException(
            status_code=400, detail=f"An unexpected error occurred: {e!s}"
        ) from e
