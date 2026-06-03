from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from src.auth.users import get_optional_public_user, get_public_user
from src.db.collections import (
    CollectionCreate,
    CollectionRead,
    CollectionReadWithPermissions,
    CollectionUpdate,
)
from src.db.strict_base_model import PydanticStrictBaseModel
from src.db.users import AnonymousUser
from src.infra.db.session import get_db_session
from src.services.courses.collections import (
    create_collection,
    delete_collection,
    get_collection,
    get_collections,
    update_collection,
)
from src.services.users.users import PublicUser

router = APIRouter()


class CollectionDetailResponse(PydanticStrictBaseModel):
    detail: str


@router.post("", response_model=CollectionRead)
async def api_create_collection(
    request: Request,
    collection_object: CollectionCreate,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> CollectionRead:
    """
    Create new Collection
    """
    return await create_collection(request, collection_object, current_user, db_session)


@router.get("/{collection_uuid}", response_model=CollectionReadWithPermissions)
async def api_get_collection(
    request: Request,
    collection_uuid: str,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> CollectionReadWithPermissions:
    """
    Get single collection by ID with permission metadata
    """
    return await get_collection(request, collection_uuid, current_user, db_session)


@router.get("/page/{page}/limit/{limit}", response_model=list[CollectionReadWithPermissions])
async def api_get_platform_collections(
    request: Request,
    page: int,
    limit: int,
    current_user: Annotated[PublicUser | AnonymousUser, Depends(get_optional_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> list[CollectionReadWithPermissions]:
    """
    Get collections by page and limit with permission metadata
    """
    return await get_collections(
        request,
        current_user,
        db_session,
        page,
        limit,
    )


@router.put("/{collection_uuid}", response_model=CollectionRead)
async def api_update_collection(
    request: Request,
    collection_object: CollectionUpdate,
    collection_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
) -> CollectionRead:
    """
    Update collection by ID
    """
    return await update_collection(request, collection_object, collection_uuid, current_user, db_session)


@router.delete("/{collection_uuid}", response_model=CollectionDetailResponse)
async def api_delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_public_user)],
    db_session: Annotated[Session | None, Depends(get_db_session)] = None,
):
    """
    Delete collection by ID
    """
    return await delete_collection(request, collection_uuid, current_user, db_session)
