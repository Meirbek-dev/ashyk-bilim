from typing import Annotated

from fastapi import APIRouter, Depends, Request

from src.db.collections import (
    CollectionCreate,
    CollectionRead,
    CollectionReadWithPermissions,
    CollectionUpdate,
)
from src.db.users import AnonymousUser
from src.infra.db.session import get_db_session
from src.security.auth import get_current_user, get_current_user_optional
from src.services.courses.collections import (
    create_collection,
    delete_collection,
    get_collection,
    get_collections,
    update_collection,
)
from src.services.users.users import PublicUser

router = APIRouter()


@router.post("")
async def api_create_collection(
    request: Request,
    collection_object: CollectionCreate,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> CollectionRead:
    """
    Create new Collection
    """
    return await create_collection(request, collection_object, current_user, db_session)


@router.get("/{collection_uuid}")
async def api_get_collection(
    request: Request,
    collection_uuid: str,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session=Depends(get_db_session),
) -> CollectionReadWithPermissions:
    """
    Get single collection by ID with permission metadata
    """
    return await get_collection(request, collection_uuid, current_user, db_session)


@router.get("/page/{page}/limit/{limit}")
async def api_get_platform_collections(
    request: Request,
    page: int,
    limit: int,
    current_user: Annotated[
        PublicUser | AnonymousUser, Depends(get_current_user_optional)
    ],
    db_session=Depends(get_db_session),
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


@router.put("/{collection_uuid}")
async def api_update_collection(
    request: Request,
    collection_object: CollectionUpdate,
    collection_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
) -> CollectionRead:
    """
    Update collection by ID
    """
    return await update_collection(
        request, collection_object, collection_uuid, current_user, db_session
    )


@router.delete("/{collection_uuid}")
async def api_delete_collection(
    request: Request,
    collection_uuid: str,
    current_user: Annotated[PublicUser, Depends(get_current_user)],
    db_session=Depends(get_db_session),
):
    """
    Delete collection by ID
    """
    return await delete_collection(request, collection_uuid, current_user, db_session)
