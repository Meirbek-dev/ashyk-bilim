from fastapi import APIRouter, Depends, Request

from src.db.users import PublicUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user
from src.services.search.search import SearchResult, search_platform_content

router = APIRouter()


@router.get("")
async def api_search_platform_content(
    request: Request,
    query: str,
    page: int = 1,
    limit: int = 10,
    db_session=Depends(get_db_session),
    current_user=Depends(get_current_user),
) -> SearchResult:
    return await search_platform_content(
        request=request,
        current_user=current_user,
        search_query=query,
        db_session=db_session,
        page=page,
        limit=limit,
    )
