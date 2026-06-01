from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.auth.users import get_optional_public_user
from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.services.search.search import SearchResult, search_platform_content

router = APIRouter()


@router.get("")
async def api_search_platform_content(
    request: Request,
    query: str,
    page: int = 1,
    limit: int = 10,
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
    current_user: Annotated[PublicUser | None, Depends(get_optional_public_user)] = None,
) -> SearchResult:
    return await search_platform_content(
        request=request,
        current_user=current_user,
        search_query=query,
        db_session=db_session,
        page=page,
        limit=limit,
    )
